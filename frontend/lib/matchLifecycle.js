export function scheduledTime(match) {
  return Date.parse(match.scheduledAt || match.date);
}
export function upcomingMatches(matches, now = Date.now()) {
  return matches
    .filter((m) => !m.deletedAt && m.status === 'upcoming' && scheduledTime(m) > now)
    .sort((a, b) => scheduledTime(a) - scheduledTime(b));
}
export function matchLabel(match) {
  return match.teams?.map((team) => team.name).join(' vs ') || 'Untitled match';
}
