export const overs = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
export const rate = (a, b, factor = 1) => (b ? ((a * factor) / b).toFixed(2) : '—');
const check = (ok, message) => {
  if (!ok) throw new Error(message);
};
export function validateSetup(m) {
  check(m.teams?.length === 2 && m.teams[0].id !== m.teams[1].id, 'Choose two different teams.');
  check(
    Number.isInteger(m.rules.overs) && m.rules.overs >= 1 && m.rules.overs <= 50,
    'Overs must be 1–50.',
  );
  check(
    Number.isInteger(m.rules.size) && m.rules.size >= 2 && m.rules.size <= 11,
    'Players per side must be 2–11.',
  );
  check(
    Number.isInteger(m.rules.maxBowler) &&
      m.rules.maxBowler >= 1 &&
      m.rules.maxBowler <= m.rules.overs,
    'Check maximum overs per bowler.',
  );
  check(typeof m.rules.freeHit === 'boolean', 'Free-hit rule must be enabled or disabled.');
  const ids = m.teams.flatMap((t) => t.squad.map((p) => p.id));
  check(
    m.teams.every((t) => t.squad.length === m.rules.size),
    'Both playing squads must match players per side.',
  );
  check(new Set(ids).size === ids.length, 'A player may appear only once across both squads.');
  check([0, 1].includes(m.firstBat), 'Choose a batting side.');
  check(
    m.rules.maxBowler * m.rules.size >= m.rules.overs,
    'Bowler limits cannot cover the innings.',
  );
  check(m.date && !Number.isNaN(Date.parse(m.date)), 'Choose a valid match date.');
}
export function replay(match, inning, events, target = null) {
  const side = inning.number === 1 ? match.firstBat : 1 - match.firstBat;
  const batting = match.teams[side],
    fielding = match.teams[1 - side];
  const s = {
    runs: 0,
    wickets: 0,
    balls: 0,
    striker: inning.striker,
    nonStriker: inning.nonStriker,
    bowler: inning.bowler,
    needBowler: false,
    needBatter: null,
    freeHit: false,
    done: false,
    partnership: 0,
    extras: { wide: 0, noBall: 0, bye: 0, legBye: 0 },
    batting: {},
    bowling: {},
    falls: [],
    deliveries: [],
  };
  batting.squad.forEach((p) => {
    s.batting[p.id] = {
      id: p.id,
      name: p.name,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      out: false,
      played: false,
    };
  });
  fielding.squad.forEach((p) => {
    s.bowling[p.id] = { id: p.id, name: p.name, balls: 0, runs: 0, wickets: 0, maidens: 0 };
  });
  check(
    s.batting[s.striker] && s.batting[s.nonStriker] && s.striker !== s.nonStriker,
    'Invalid opening batters.',
  );
  check(s.bowling[s.bowler], 'Invalid opening bowler.');
  s.batting[s.striker].played = s.batting[s.nonStriker].played = true;
  let overConceded = 0;
  for (const e of events) {
    check(!s.done, 'Delivery follows a completed innings; review history.');
    if (e.type === 'batter') {
      check(
        s.needBatter && s.batting[e.player] && !s.batting[e.player].played,
        'Choose a new, unused batter.',
      );
      s[s.needBatter] = e.player;
      s.batting[e.player].played = true;
      s.needBatter = null;
      continue;
    }
    if (e.type === 'bowler') {
      check(
        s.needBowler && s.bowling[e.player] && e.player !== s.bowler,
        'Choose a different bowler for the next over.',
      );
      check(
        s.bowling[e.player].balls < match.rules.maxBowler * 6,
        'Maximum overs per bowler reached.',
      );
      s.bowler = e.player;
      s.needBowler = false;
      continue;
    }
    check(
      e.type === 'delivery' && !s.needBatter && !s.needBowler,
      'Complete player selections before scoring.',
    );
    const { bat = 0, extra = 'none', extraRuns = 0, running = 0, wicket = null } = e;
    check(
      [bat, extraRuns, running].every((n) => Number.isInteger(n) && n >= 0 && n <= 6),
      'Runs must be whole numbers from 0 to 6.',
    );
    check(
      ['none', 'wide', 'noBall', 'bye', 'legBye', 'noBallBye', 'noBallLegBye'].includes(extra),
      'Unsupported extras.',
    );
    const wide = extra === 'wide',
      nb = extra.startsWith('noBall'),
      bye = extra === 'bye' || extra === 'noBallBye',
      lb = extra === 'legBye' || extra === 'noBallLegBye';
    check(!(bat && (wide || bye || lb)), 'These extras cannot also be bat runs.');
    check(extra !== 'none' || extraRuns === 0, 'Select an extras category.');
    check(
      extra !== 'noBall' || extraRuns === 0,
      'Use no-ball + byes/leg-byes for additional extras.',
    );
    check(running <= bat + extraRuns, 'Completed running exceeds recorded runs.');
    check(
      !e.boundary || ([4, 6].includes(bat) && running === 0),
      'Bat boundary must be four or six with no running.',
    );
    const penalty = wide || nb ? 1 : 0,
      total = bat + extraRuns + penalty,
      legal = !wide && !nb;
    const batter = s.batting[s.striker],
      bowler = s.bowling[s.bowler];
    let dismissal = wicket;
    if (
      target &&
      (s.runs + penalty >= target || (dismissal?.kind === 'run out' && s.runs + total >= target))
    )
      dismissal = null;
    if (dismissal) {
      check(
        ['bowled', 'caught', 'lbw', 'stumped', 'hit wicket', 'run out'].includes(dismissal.kind),
        'Unsupported dismissal.',
      );
      check(
        [s.striker, s.nonStriker].includes(dismissal.player),
        'Dismissed batter must be at the crease.',
      );
      check(
        dismissal.kind === 'run out' || dismissal.player === s.striker,
        'Only striker may be dismissed this way.',
      );
      check(
        !(nb || s.freeHit) || dismissal.kind === 'run out',
        'Only run out is supported on a no-ball/free hit.',
      );
      check(
        !wide || ['run out', 'stumped', 'hit wicket'].includes(dismissal.kind),
        'Invalid dismissal on a wide.',
      );
      check(
        dismissal.kind === 'run out' || bat + extraRuns === 0,
        'No completed runs allowed for this dismissal.',
      );
      if (dismissal.kind === 'run out')
        check(
          ['striker', 'nonStriker'].includes(dismissal.survivorEnd),
          'Specify the surviving batter’s end.',
        );
    }
    const before = s.balls;
    batter.balls += wide ? 0 : 1;
    batter.runs += bat;
    if (e.boundary && bat === 4) batter.fours++;
    if (e.boundary && bat === 6) batter.sixes++;
    s.runs += total;
    s.partnership += total;
    if (wide) s.extras.wide += 1 + extraRuns;
    if (nb) s.extras.noBall++;
    if (bye) s.extras.bye += extraRuns;
    if (lb) s.extras.legBye += extraRuns;
    const conceded = bat + penalty + (wide ? extraRuns : 0);
    bowler.runs += conceded;
    bowler.bowled = true;
    overConceded += conceded;
    if (legal) {
      s.balls++;
      bowler.balls++;
    }
    if (running % 2) [s.striker, s.nonStriker] = [s.nonStriker, s.striker];
    if (dismissal) {
      s.wickets++;
      s.batting[dismissal.player].out = true;
      s.batting[dismissal.player].dismissal = dismissal.kind;
      if (dismissal.kind !== 'run out') bowler.wickets++;
      if (dismissal.kind === 'run out') {
        const survivor = s.striker === dismissal.player ? s.nonStriker : s.striker;
        s[dismissal.survivorEnd] = survivor;
        s.needBatter = dismissal.survivorEnd === 'striker' ? 'nonStriker' : 'striker';
      } else s.needBatter = s.striker === dismissal.player ? 'striker' : 'nonStriker';
      s[s.needBatter] = null;
      s.falls.push({ runs: s.runs, wickets: s.wickets, balls: s.balls, player: dismissal.player });
      s.partnership = 0;
    }
    if (match.rules.freeHit) {
      if (nb) s.freeHit = true;
      else if (legal) s.freeHit = false;
    }
    if (legal && s.balls % 6 === 0) {
      if (overConceded === 0) bowler.maidens++;
      overConceded = 0;
      s.needBowler = true;
      [s.striker, s.nonStriker] = [s.nonStriker, s.striker];
      if (s.needBatter) s.needBatter = s.needBatter === 'striker' ? 'nonStriker' : 'striker';
    }
    s.done =
      s.wickets >= batting.squad.length - 1 ||
      s.balls >= match.rules.overs * 6 ||
      (target !== null && s.runs >= target);
    s.deliveries.push({
      ...e,
      label: `${Math.floor(before / 6)}.${(before % 6) + 1}`,
      over: Math.floor(before / 6),
      total,
      score: `${s.runs}/${s.wickets}`,
    });
  }
  return s;
}
export function matchStates(match, innings, events) {
  const states = [];
  for (const inn of [...innings].sort((a, b) => a.number - b.number))
    states.push(
      replay(
        match,
        inn,
        events.filter((e) => e.inningsId === inn.id).sort((a, b) => a.seq - b.seq),
        states[0] ? states[0].runs + 1 : null,
      ),
    );
  return states;
}
export function result(match, states) {
  if (states.length < 2 || !states[1].done) return 'In progress';
  const [a, b] = states;
  if (b.runs > a.runs)
    return `${match.teams[1 - match.firstBat].name} won by ${match.rules.size - 1 - b.wickets} wicket${match.rules.size - 1 - b.wickets === 1 ? '' : 's'}`;
  if (b.runs === a.runs) return 'Match tied';
  return `${match.teams[match.firstBat].name} won by ${a.runs - b.runs} run${a.runs - b.runs === 1 ? '' : 's'}`;
}
export function career(playerId, matches, innings, events, format = 'all') {
  const out = {
    matches: 0,
    innings: 0,
    runs: 0,
    balls: 0,
    dismissals: 0,
    notOuts: 0,
    highest: 0,
    fours: 0,
    sixes: 0,
    fifties: 0,
    hundreds: 0,
    legalBalls: 0,
    conceded: 0,
    wickets: 0,
    maidens: 0,
    bestWickets: 0,
    bestRuns: null,
  };
  for (const m of matches.filter(
    (m) =>
      m.status === 'completed' &&
      (format === 'all' || String(m.rules.overs) === format) &&
      m.teams.some((t) => t.squad.some((p) => p.id === playerId)),
  )) {
    out.matches++;
    for (const s of matchStates(
      m,
      innings.filter((i) => i.matchId === m.id),
      events.filter((e) => e.matchId === m.id),
    )) {
      const b = s.batting[playerId],
        w = s.bowling[playerId];
      if (b?.played) {
        out.innings++;
        for (const key of ['runs', 'balls', 'fours', 'sixes']) out[key] += b[key];
        out.dismissals += Number(b.out);
        out.notOuts += Number(!b.out);
        out.highest = Math.max(out.highest, b.runs);
        out.fifties += Number(b.runs >= 50 && b.runs < 100);
        out.hundreds += Number(b.runs >= 100);
      }
      if (w?.bowled) {
        out.legalBalls += w.balls;
        out.conceded += w.runs;
        out.wickets += w.wickets;
        out.maidens += w.maidens;
        if (
          w.wickets > out.bestWickets ||
          (w.wickets === out.bestWickets && (out.bestRuns === null || w.runs < out.bestRuns))
        ) {
          out.bestWickets = w.wickets;
          out.bestRuns = w.runs;
        }
      }
    }
  }
  return {
    ...out,
    average: rate(out.runs, out.dismissals),
    strikeRate: rate(out.runs, out.balls, 100),
    economy: rate(out.conceded, out.legalBalls, 6),
    bowlingAverage: rate(out.conceded, out.wickets),
    bowlingStrikeRate: rate(out.legalBalls, out.wickets),
  };
}
