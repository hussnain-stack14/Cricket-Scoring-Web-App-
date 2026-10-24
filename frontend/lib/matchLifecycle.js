export function scheduledTime(match) {
  return Date.parse(match.scheduledAt || match.date);
}
// Due and overdue unstarted fixtures stay discoverable until started or cancelled.
export function upcomingMatches(matches) {
  return matches
    .filter((m) => !m.deletedAt && m.status === 'upcoming' && Number.isFinite(scheduledTime(m)))
    .sort((a, b) => scheduledTime(a) - scheduledTime(b));
}
export function matchLabel(match) {
  return match.teams?.map((t) => t.name).join(' vs ') || 'Untitled match';
}
export function scheduledAction(match, now = Date.now()) {
  if (match.status === 'live') return 'Resume Match';
  if (match.status === 'completed') return 'View Scorecard';
  if (match.status !== 'upcoming') return 'View Details';
  if (match.preMatch && Number.isInteger(match.preMatch.toss)) return 'Resume Setup';
  return scheduledTime(match) <= now ? 'Start Match' : 'View Details';
}
export function battingFirst(setup) {
  if (![0, 1].includes(setup?.toss)) throw new Error('Choose the toss winner.');
  if (!['bat', 'field'].includes(setup.decision))
    throw new Error('Choose bat first or bowl first.');
  return setup.decision === 'bat' ? setup.toss : 1 - setup.toss;
}
export function validateMatchStart(
  match,
  setup,
  { now = Date.now(), role = 'owner', earlyOverride = false } = {},
) {
  if (!['owner', 'scorer'].includes(role))
    throw new Error('Only a scorer or owner can start this match.');
  if (
    scheduledTime(match) > now &&
    !(role === 'owner' && match.rules.allowEarlyStart !== false && earlyOverride)
  )
    throw new Error('This match is not due yet. An owner must explicitly allow an early start.');
  const firstBat = battingFirst(setup);
  const { striker, nonStriker, bowler } = setup;
  if (!striker || !nonStriker || !bowler || striker === nonStriker)
    throw new Error('Choose two different batters and an opening bowler.');
  const batting = match.teams[firstBat].squad;
  const bowling = match.teams[1 - firstBat].squad;
  if (
    ![striker, nonStriker].every((id) => batting.some((p) => p.id === id)) ||
    !bowling.some((p) => p.id === bowler)
  )
    throw new Error('Opening players must belong to the correct playing squads.');
  return { firstBat, opening: { striker, nonStriker, bowler } };
}
