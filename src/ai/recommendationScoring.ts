export function computeBehavioralScore(input: {
  playCount: number;
  skippedCount: number;
  likeCount: number;
  sessionMinutes: number;
  recencyBoost: number;
}) {
  const engagement = input.playCount * 1.2;
  const skipsPenalty = input.skippedCount * 0.8;
  const likesBoost = input.likeCount * 1.5;
  const sessionBoost = Math.min(2, input.sessionMinutes / 30);
  return engagement - skipsPenalty + likesBoost + sessionBoost + input.recencyBoost;
}
