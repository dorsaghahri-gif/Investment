/**
 * AES-256-GCM encryption for credentials stored at rest (e.g. Plaid access
 * tokens). Key: CREDENTIALS_ENCRYPTION_KEY (32 bytes, base64).
 * Format: v1.<iv b64url>.<tag b64url>.<ciphertext b64url>
 */
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyFrom(b64: string | undefined): Buffer {
  if (!b64) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export function encryptSecret(plaintext: string, keyB64 = process.env.CREDENTIALS_ENCRYPTION_KEY): string {
  const key = keyFrom(keyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, keyB64 = process.env.CREDENTIALS_ENCRYPTION_KEY): string {
  const key = keyFrom(keyB64);
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognized ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
