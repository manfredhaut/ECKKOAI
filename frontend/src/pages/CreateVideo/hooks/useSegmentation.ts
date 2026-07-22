import { useEffect, useRef, useState } from "react";
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

// Self-hosted assets (see frontend/public/mediapipe/) — never loaded from
// Google's CDN at runtime, so avatar capture keeps working fully local via
// Docker Compose.
const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/selfie_segmenter.tflite";

// Wraps MediaPipe's ImageSegmenter (selfie segmenter model) for real-time,
// per-frame person segmentation. `error` stays set (and `ready` false) if
// the model fails to load for any reason — callers should fall back to the
// unprocessed camera feed rather than blocking capture.
export function useSegmentation() {
  const segmenterRef = useRef<ImageSegmenter | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
        const segmenter = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
          runningMode: "VIDEO",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
        if (cancelled) {
          segmenter.close();
          return;
        }
        segmenterRef.current = segmenter;
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load segmentation model");
      }
    })();

    return () => {
      cancelled = true;
      segmenterRef.current?.close();
      segmenterRef.current = null;
    };
  }, []);

  // Returns a per-pixel foreground confidence array (0..1, same dimensions
  // as the video frame) for the video's current frame, or null if the
  // segmenter isn't ready yet.
  function segmentVideoFrame(video: HTMLVideoElement, timestampMs: number): Float32Array | null {
    const segmenter = segmenterRef.current;
    if (!segmenter || !video.videoWidth) return null;

    const result = segmenter.segmentForVideo(video, timestampMs);
    const confidenceMask = result.confidenceMasks?.[0];
    const mask = confidenceMask ? new Float32Array(confidenceMask.getAsFloat32Array()) : null;
    result.close();
    return mask;
  }

  return { ready, error, segmentVideoFrame };
}
