import { describe, expect, it } from "vitest";
import { computeBehavioralScore } from "@/ai/recommendationScoring";

describe("computeBehavioralScore", () => {
  it("increases with plays and likes", () => {
    const low = computeBehavioralScore({
      playCount: 1,
      skippedCount: 1,
      likeCount: 0,
      sessionMinutes: 5,
      recencyBoost: 0
    });
    const high = computeBehavioralScore({
      playCount: 6,
      skippedCount: 0,
      likeCount: 3,
      sessionMinutes: 45,
      recencyBoost: 0.5
    });
    expect(high).toBeGreaterThan(low);
  });
});
