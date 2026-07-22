import crypto from "node:crypto";
import { config } from "../config.js";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = Buffer.from(config.encryptionKey, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded)");
  }
  return key;
}

// Format: base64(iv):base64(authTag):base64(ciphertext)
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decrypt(payload: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
}

export function maskKey(plaintext: string): string {
  if (plaintext.length <= 4) return "****";
  return `${"*".repeat(plaintext.length - 4)}${plaintext.slice(-4)}`;
}
