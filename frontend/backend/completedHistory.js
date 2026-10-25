import { matchStates } from '../lib/engine.js';

// Completion is a commit marker, never the authority for a score. Events are replayed instead.
export function completedHistoryError(match, innings, events, snapshot) {
  if (!snapshot || !Number.isInteger(snapshot.innings) || !Number.isInteger(snapshot.events))
    return 'A completed match requires a valid history snapshot.';
  if (innings.length < snapshot.innings || events.length < snapshot.events)
    return 'The completed scorecard is still waiting for its innings or deliveries.';
  if (new Set(innings.map((inning) => inning.id)).size !== innings.length)
    return 'The completed scorecard contains duplicate innings records.';
  if (events.some((event) => !innings.some((inning) => inning.id === event.inningsId)))
    return 'A scoring event is not linked to a stored innings.';
  try {
    const states = matchStates(match, innings, events);
    if (states.length !== 2 || !states[0].done || !states[1].done)
      return 'The recorded deliveries do not finish both innings.';
  } catch {
    return 'The recorded deliveries cannot be replayed safely.';
  }
  return null;
}
