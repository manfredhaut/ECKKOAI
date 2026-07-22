export interface CompositeOptions {
  // Solid background color as [r, g, b] (0-255 each), or null to disable
  // the effect entirely (pure passthrough — no segmentation cost).
  backgroundColor: [number, number, number] | null;
  // 0 = raw camera (background untouched), 1 = background fully replaced.
  // Only ever affects background pixels — foreground (person) pixels stay
  // sharp regardless of intensity, since the per-pixel blend factor is
  // scaled by (1 - mask confidence).
  intensity: number;
}

// selfie_segmenter.tflite always processes at a fixed 256x256 internally
// (MediaPipe resizes the camera frame down, runs the model, then upscales
// the mask back to the video's native resolution) — that upscale is what
// produces the "feathered" edge on hair/glasses, not something fixable from
// here. What IS fixable: how the (already-upscaled, already-soft) mask gets
// turned into a blend. Two tunable passes, best-guess initial values —
// nobody could visually validate these against a live camera in this
// environment, so treat MASK_SHARPNESS/EROSION_RADIUS as starting points to
// adjust after looking at real output, not measured constants.
const MASK_SHARPNESS = 3; // contrast curve steepness on mask confidence — higher = crisper transition, but pushed too far reads as jagged instead of soft
const EROSION_RADIUS = 1; // px the foreground region is shrunk by, to cut down the halo/fringe where background bleeds through thin hair strands

// Pushes mid-confidence pixels (the blurry transition zone from the
// upscaled mask) toward 0 or 1, narrowing that zone instead of leaving a
// wide, softly-blended band.
function sharpenMask(mask: Float32Array): Float32Array {
  const out = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    out[i] = Math.min(1, Math.max(0, (mask[i] - 0.5) * MASK_SHARPNESS + 0.5));
  }
  return out;
}

// Shrinks the foreground region by taking, per pixel, the minimum
// confidence among itself and its 4 neighbors — classic morphological
// erosion, cheap approximation at radius 1.
function erodeMask(mask: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let min = mask[i];
      if (x > 0) min = Math.min(min, mask[i - 1]);
      if (x < width - 1) min = Math.min(min, mask[i + 1]);
      if (y > 0) min = Math.min(min, mask[i - width]);
      if (y < height - 1) min = Math.min(min, mask[i + width]);
      out[i] = min;
    }
  }
  return out;
}

// Draws `video`'s current frame onto `outputCtx`, replacing background
// pixels (per `mask`, a same-size 0..1 foreground-confidence array — see
// useCamera.ts for the temporal smoothing applied before this is called)
// with `options.backgroundColor`, blended by `options.intensity`. With no
// background color, no mask, or zero intensity, this is a plain passthrough
// draw — the common case while the feature is off.
export function compositeFrame(
  video: HTMLVideoElement,
  mask: Float32Array | null,
  outputCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: CompositeOptions,
): void {
  outputCtx.drawImage(video, 0, 0, width, height);

  if (!options.backgroundColor || !mask || options.intensity <= 0) return;
  if (mask.length !== width * height) return; // mask resolution mismatch — skip effect this frame, keep raw draw

  const processedMask = sharpenMask(erodeMask(mask, width, height));

  const frame = outputCtx.getImageData(0, 0, width, height);
  const pixels = frame.data;
  const [bgR, bgG, bgB] = options.backgroundColor;
  const intensity = Math.min(1, Math.max(0, options.intensity));

  for (let i = 0; i < processedMask.length; i++) {
    const blend = (1 - processedMask[i]) * intensity;
    if (blend <= 0) continue;
    const offset = i * 4;
    pixels[offset] = pixels[offset] * (1 - blend) + bgR * blend;
    pixels[offset + 1] = pixels[offset + 1] * (1 - blend) + bgG * blend;
    pixels[offset + 2] = pixels[offset + 2] * (1 - blend) + bgB * blend;
  }

  outputCtx.putImageData(frame, 0, 0);
}
