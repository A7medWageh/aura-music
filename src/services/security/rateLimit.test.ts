import { describe, expect, it } from "vitest";
import { memoryRateLimit } from "@/services/security/rateLimit";

describe("memoryRateLimit", () => {
  it("blocks after max is exceeded", () => {
    const key = `test:${Date.now()}`;
    const first = memoryRateLimit(key, 2, 60);
    const second = memoryRateLimit(key, 2, 60);
    const third = memoryRateLimit(key, 2, 60);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
  });
});
