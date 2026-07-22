import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, writeFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveUpload } from "./storage.js";

export interface AudioTreatmentOptions {
  enabled: boolean;
  targetLufs: number;
}

// The exact format already proven to work against HeyGen in a real end-to-end
// test — made explicit/deterministic here instead of relying on whatever
// ElevenLabs' API default happens to be.
const OUTPUT_SAMPLE_RATE = 44100;
const OUTPUT_CHANNELS = 1;
const OUTPUT_BITRATE = "128k";

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

// Cleans up and normalizes ElevenLabs-synthesized speech before it's handed
// to the avatar/video provider: noise reduction (afftdn), EBU R128 loudness
// normalization to a target LUFS (single-pass — simpler than two-pass and
// sufficient for this), and an explicit output format/sample-rate/channel
// count. Saves the raw (pre-treatment) buffer alongside for debugging, since
// this is the one point in the pipeline most likely to need a regression
// comparison later.
export async function processVoiceAudio(
  tenantId: string,
  buffer: Buffer,
  options: AudioTreatmentOptions,
): Promise<Buffer> {
  const rawUrl = await saveUpload(tenantId, buffer, `voice-raw-${Date.now()}.mp3`);
  console.log(`[audioProcessing] raw synthesized speech saved at ${rawUrl}`);

  if (!options.enabled) {
    console.log("[audioProcessing] treatment disabled — using raw buffer unchanged");
    return buffer;
  }

  const workDir = os.tmpdir();
  const inputPath = path.join(workDir, `${randomUUID()}-in.mp3`);
  const outputPath = path.join(workDir, `${randomUUID()}-out.mp3`);

  try {
    await writeFile(inputPath, buffer);
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-af",
      `afftdn,loudnorm=I=${options.targetLufs}:TP=-1.5:LRA=11`,
      "-ar",
      String(OUTPUT_SAMPLE_RATE),
      "-ac",
      String(OUTPUT_CHANNELS),
      "-c:a",
      "libmp3lame",
      "-b:a",
      OUTPUT_BITRATE,
      outputPath,
    ]);
    const processed = await readFile(outputPath);

    const processedUrl = await saveUpload(tenantId, processed, `voice-processed-${Date.now()}.mp3`);
    console.log(`[audioProcessing] processed speech saved at ${processedUrl}`);

    return processed;
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
