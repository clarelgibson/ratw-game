// Pure ranking logic for the leaderboard (kept separate so it can be unit-tested).
//
// Each racer: { name, reached, time, distance, budget }.
// Rules:
//   1. Any finisher beats any non-finisher.
//   2. Among finishers, lower total time wins.
//   3. Among non-finishers, greater total distance wins.
export function rankRacers(racers) {
  const entries = [...racers].sort((a, b) => {
    if (a.reached !== b.reached) return a.reached ? -1 : 1;
    if (a.reached) return a.time - b.time;
    return b.distance - a.distance;
  });
  const bothFailed = entries.every((e) => !e.reached);
  return { entries, winner: entries[0], bothFailed };
}
