import { describe, expect, it } from "vitest";
import { comparePassword, hashPassword } from "@/services/auth/password";

describe("password hashing", () => {
  it("hashes and verifies password", async () => {
    const raw = "my-secure-password-123";
    const hash = await hashPassword(raw);
    expect(hash).not.toBe(raw);
    await expect(comparePassword(raw, hash)).resolves.toBe(true);
    await expect(comparePassword("wrong", hash)).resolves.toBe(false);
  });
});
