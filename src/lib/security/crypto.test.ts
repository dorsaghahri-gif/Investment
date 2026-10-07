import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto";

const key = randomBytes(32).toString("base64");

describe("credential encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("access-sandbox-123", key);
    const b = encryptSecret("access-sandbox-123", key);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, key)).toBe("access-sandbox-123");
  });
  it("detects tampering", () => {
    const c = encryptSecret("secret", key).split(".");
    c[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(c.join("."), key)).toThrow();
  });
  it("rejects wrong-size keys", () => {
    expect(() => encryptSecret("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});
