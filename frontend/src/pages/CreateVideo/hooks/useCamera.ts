import { useEffect, useRef, useState } from "react";
import { useSegmentation } from "./useSegmentation";
import { compositeFrame } from "../virtualBackground/compositeFrame";
import type { CompositeOptions } from "../virtualBackground/compositeFrame";
import { applyQualityTreatment, DEFAULT_QUALITY } from "../imageQuality/applyQualityTreatment";
import type { QualityOptions } from "../imageQuality/applyQualityTreatment";

const PASSTHROUGH: CompositeOptions = { backgroundColor: null, intensity: 0 };

// Weight given to the current frame's mask vs. the previous frame's,
// smoothing out the small frame-to-frame flicker segmentation models have
// at the edge — matters for the recorded video specifically (a single
// photo has no previous frame to blend with). Best-guess starting value,
// not measured against real footage in this environment.
const TEMPORAL_SMOOTHING_ALPHA = 0.6;

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const backgroundRef = useRef<CompositeOptions>(PASSTHROUGH);
  const qualityRef = useRef<QualityOptions>(DEFAULT_QUALITY);
  const prevMaskRef = useRef<Float32Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const segmentation = useSegmentation();

  // Read by the render loop every frame — a ref (not state) so changing the
  // background/intensity doesn't restart the loop or the camera stream.
  function setBackground(options: CompositeOptions) {
    backgroundRef.current = options;
  }

  // Same ref-not-state reasoning as setBackground — read every frame by the
  // render loop, must not restart the loop/camera on every slider tick.
  function setQuality(options: QualityOptions) {
    qualityRef.current = options;
  }

  // Exponential blend with the previous frame's mask — cuts down on the
  // small per-frame flicker segmentation models produce at the edge.
  function smoothMask(mask: Float32Array): Float32Array {
    const prev = prevMaskRef.current;
    if (!prev || prev.length !== mask.length) {
      prevMaskRef.current = mask;
      return mask;
    }
    const smoothed = new Float32Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
      smoothed[i] = mask[i] * TEMPORAL_SMOOTHING_ALPHA + prev[i] * (1 - TEMPORAL_SMOOTHING_ALPHA);
    }
    prevMaskRef.current = smoothed;
    return smoothed;
  }

  function renderLoop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.videoWidth) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const options = backgroundRef.current;
        const rawMask =
          options.backgroundColor && segmentation.ready
            ? segmentation.segmentVideoFrame(video, performance.now())
            : null;
        if (!rawMask) prevMaskRef.current = null;
        const mask = rawMask ? smoothMask(rawMask) : null;
        compositeFrame(video, mask, ctx, canvas.width, canvas.height, options);
        applyQualityTreatment(ctx, canvas.width, canvas.height, qualityRef.current);
      }
    }
    rafRef.current = requestAnimationFrame(renderLoop);
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);
      rafRef.current = requestAnimationFrame(renderLoop);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access camera/microphone");
    }
  }

  function stop() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    prevMaskRef.current = null;
    setReady(false);
  }

  // Reads from the output canvas (already reflecting the current
  // background/intensity), not the raw video — so captured photos match
  // what the user sees in the live preview.
  function capturePhoto(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.width) return resolve(null);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
    });
  }

  // Stream to hand to MediaRecorder so the reference video matches the live
  // preview too. No virtual background active: the raw camera stream
  // (cheaper, no canvas re-encode). Active: the canvas's own video output
  // combined with the original mic audio track (canvas.captureStream()
  // carries no audio on its own).
  function getRecordingStream(): MediaStream | null {
    if (!streamRef.current) return null;
    if (!backgroundRef.current.backgroundColor || !canvasRef.current) return streamRef.current;
    const canvasStream = canvasRef.current.captureStream(30);
    return new MediaStream([...canvasStream.getVideoTracks(), ...streamRef.current.getAudioTracks()]);
  }

  useEffect(() => stop, []);

  return {
    videoRef,
    canvasRef,
    stream: streamRef.current,
    ready,
    error,
    start,
    stop,
    capturePhoto,
    getRecordingStream,
    setBackground,
    setQuality,
    segmentationReady: segmentation.ready,
    segmentationError: segmentation.error,
  };
}
