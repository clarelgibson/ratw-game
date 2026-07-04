// Game configuration constants for Race Across The World.
export const START = 'London';
export const DEST = 'Delphi';

// Starting budget is the cheapest possible full path cost x this multiplier,
// rounded to the nearest £10. >1 guarantees you cannot always take the fastest
// (most expensive) mode, but the race stays winnable.
export const BUDGET_MULTIPLIER = 1.6;

// Milliseconds the marker takes to glide between two cities.
export const GLIDE_MS = 900;

// Pause between the computer opponent's simulated legs when replaying its journey.
export const AI_REPLAY_MS = 650;

// Opponent strategy ("random" this iteration — picks affordable routes at random).
export const OPPONENT_STRATEGY = 'random';

// When a racer is broke (can't afford any onward route) they may walk a land
// route for free at this speed (km/h). Ferry/sea crossings can't be walked.
export const WALK_SPEED_KMH = 5;
