import { inspectMatchStates } from '../lib/engine.js';

export function appendedScoringEventError(match, innings, existingEvents, event) {
  const events = [...existingEvents.filter((record) => record.id !== event.id), event];
  const history = inspectMatchStates(match, innings, events);
  return history.ok ? null : history.error;
}
