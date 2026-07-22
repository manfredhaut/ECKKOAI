import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";

export type StorageProviderId = "drive" | "platform_hosted";

export interface StorageProvider {
  save(tenantId: string, buffer: Buffer, originalName: string): Promise<string>;
}

async function saveToLocalDisk(tenantId: string, buffer: Buffer, originalName: string): Promise<string> {
  const tenantDir = path.join(config.uploadsDir, tenantId);
  await mkdir(tenantDir, { recursive: true });
  const filename = `${randomUUID()}${path.extname(originalName)}`;
  await writeFile(path.join(tenantDir, filename), buffer);
  return `/uploads/${tenantId}/${filename}`;
}

// Same stub-behind-a-real-interface pattern as avatarProvider.ts/voiceProvider.ts:
// both providers below fall back to local disk so uploads keep working
// end-to-end while the real integrations don't exist yet.
//
// TODO: real Google Drive integration — tenant connects via OAuth (needs a
// Google Cloud OAuth app registered), files get uploaded to their Drive
// instead of our disk.
const googleDriveProvider: StorageProvider = {
  save: saveToLocalDisk,
};

// TODO: real platform-hosted storage (S3/R2) — needs a bucket + credentials
// for the platform's own account. Until then, falls back to local disk.
const platformHostedProvider: StorageProvider = {
  save: saveToLocalDisk,
};

export function getStorageProvider(id: StorageProviderId | null | undefined): StorageProvider {
  switch (id) {
    case "platform_hosted":
      return platformHostedProvider;
    case "drive":
    default:
      return googleDriveProvider;
  }
}

export const STORAGE_PROVIDER_IDS: StorageProviderId[] = ["drive", "platform_hosted"];
