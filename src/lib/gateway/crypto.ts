import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { KEY_PREFIX } from "./constants";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(32).toString("base64url");
}

export function keyPreview(fullKey: string): { prefix: string; last4: string } {
  const last4 = fullKey.slice(-4);
  const prefix = fullKey.slice(0, Math.min(10, fullKey.length));
  return { prefix, last4 };
}

export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function newId(): string {
  return randomBytes(16).toString("hex");
}

export function hintFromSecret(secret: string): string {
  if (secret.length <= 8) return "••••";
  return `${secret.slice(0, 6)}…${secret.slice(-4)}`;
}
