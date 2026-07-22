export interface QualityOptions {
  mode: "auto" | "manual";
  // Manual-mode values only (ignored in "auto"). brightness/contrast are
  // -100..100 (0 = no change); sharpness/denoise are 0..100 (0 = off).
  brightness: number;
  contrast: number;
  sharpness: number;
  denoise: number;
}

export const DEFAULT_QUALITY: QualityOptions = {
  mode: "auto",
  brightness: 0,
  contrast: 0,
  sharpness: 30,
  denoise: 20,
};

// Same "best-guess starting point, not measured against real footage in
// this environment" caveat as MASK_SHARPNESS/EROSION_RADIUS in
// compositeFrame.ts — auto mode targets a mid-gray mean and a wide spread,
// which is a reasonable default for a dim/low-contrast webcam room but
// hasn't been tuned against a real camera here.
const AUTO_TARGET_MEAN = 128;
const AUTO_TARGET_SPREAD = 200;
const AUTO_SHARPNESS = 30;
const AUTO_DENOISE = 20;
const SAMPLE_STRIDE = 4; // sample every 4th pixel when measuring — full-frame stats at 30fps is wasted precision

interface Levels {
  brightness: number; // additive, -255..255
  contrastFactor: number; // multiplicative around mid-gray
}

function measureAutoLevels(pixels: Uint8ClampedArray): Levels {
  let sum = 0;
  let min = 255;
  let max = 0;
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4 * SAMPLE_STRIDE) {
    const luma = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    sum += luma;
    if (luma < min) min = luma;
    if (luma > max) max = luma;
    count++;
  }
  const mean = count > 0 ? sum / count : AUTO_TARGET_MEAN;
  const spread = Math.max(1, max - min);
  return {
    brightness: AUTO_TARGET_MEAN - mean,
    contrastFactor: Math.min(2, Math.max(0.5, AUTO_TARGET_SPREAD / spread)),
  };
}

function applyBrightnessContrast(pixels: Uint8ClampedArray, brightness: number, contrastFactor: number): void {
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const offset = i + c;
      pixels[offset] = (pixels[offset] - 128) * contrastFactor + 128 + brightness;
    }
  }
}

// Cheap 3x3 box blur (edge pixels average whatever neighbors exist, same
// pattern as erodeMask's boundary handling in compositeFrame.ts). Used both
// as the denoise blend target and as the "low frequency" reference for
// unsharp-mask sharpening.
function boxBlur(pixels: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;
            sum += pixels[(ny * width + nx) * 4 + c];
            count++;
          }
        }
        out[i + c] = sum / count;
      }
      out[i + 3] = pixels[i + 3];
    }
  }
  return out;
}

function mixToward(pixels: Uint8ClampedArray, target: Uint8ClampedArray, amount: number): void {
  if (amount <= 0) return;
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      pixels[i + c] = pixels[i + c] * (1 - amount) + target[i + c] * amount;
    }
  }
}

function sharpenToward(pixels: Uint8ClampedArray, blurred: Uint8ClampedArray, amount: number): void {
  if (amount <= 0) return;
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      pixels[i + c] = pixels[i + c] + (pixels[i + c] - blurred[i + c]) * amount;
    }
  }
}

// Applies exposure/contrast, denoise, and sharpen to whatever is already
// drawn on `ctx` (run this after compositeFrame, so it treats the
// background-composited frame as its input) — mutates the canvas in place.
// Denoise runs before sharpen so sharpening doesn't amplify noise it could
// have removed first.
export function applyQualityTreatment(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: QualityOptions,
): void {
  const frame = ctx.getImageData(0, 0, width, height);
  const pixels = frame.data;

  const denoiseAmount = options.mode === "auto" ? AUTO_DENOISE / 100 : options.denoise / 100;
  const sharpenAmount = options.mode === "auto" ? AUTO_SHARPNESS / 100 : options.sharpness / 100;

  if (denoiseAmount > 0 || sharpenAmount > 0) {
    const blurred = boxBlur(pixels, width, height);
    if (denoiseAmount > 0) mixToward(pixels, blurred, denoiseAmount);
    if (sharpenAmount > 0) {
      // Re-blur the (possibly just-denoised) result so sharpening reacts to
      // what's actually being kept, not the pre-denoise original.
      const reference = denoiseAmount > 0 ? boxBlur(pixels, width, height) : blurred;
      sharpenToward(pixels, reference, sharpenAmount);
    }
  }

  if (options.mode === "auto") {
    const { brightness, contrastFactor } = measureAutoLevels(pixels);
    applyBrightnessContrast(pixels, brightness, contrastFactor);
  } else if (options.brightness !== 0 || options.contrast !== 0) {
    const contrastFactor = 1 + options.contrast / 100;
    const brightness = (options.brightness / 100) * 128;
    applyBrightnessContrast(pixels, brightness, contrastFactor);
  }

  ctx.putImageData(frame, 0, 0);
}
