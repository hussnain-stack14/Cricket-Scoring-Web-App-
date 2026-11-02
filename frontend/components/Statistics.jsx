'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Empty, Field, Tabs } from './ui';
import TeamStatistics from './TeamStatistics';
import {
  defaultQualification,
  playerTotals,
  rankPlayers,
  rankingMetrics,
  requiresQualification,
} from '../lib/leaderboards';
const display = (value) =>
  value === null || value === undefined
    ? '—'
    : typeof value === 'number' && !Number.isInteger(value)
      ? value.toFixed(2)
      : value;
function FilterSelect({ label, options, ...props }) {
  return (
    <Field label={label}>
      <select {...props}>
        {options.map((option) => (
          <option key={option.id ?? option} value={option.id ?? option}>
            {option.name ?? option}
          </option>
        ))}
      </select>
    </Field>
  );
}
export default function Statistics({ data }) {
  const [category, setCategory] = useState('Batters'),
    [metric, setMetric] = useState('runs'),
    [teamId, setTeamId] = useState(''),
    [format, setFormat] = useState(''),
    [period, setPeriod] = useState(''),
    [tournament, setTournament] = useState('');
  const [criteria, setCriteria] = useState({
    ...defaultQualification,
  });
  const teams = useMemo(
    () => [
      ...new Map(
        [...data.teams, ...data.matches.flatMap((m) => m.teams)].map((t) => [
          t.id,
          { id: t.id, name: t.name },
        ]),
      ).values(),
    ],
    [data.teams, data.matches],
  );
  const since = period
    ? new Date(Date.now() - Number(period) * 86400000).toISOString().slice(0, 10)
    : '';
  const totals = useMemo(
    () => playerTotals(data, { teamId, format, since, tournament }),
    [data, teamId, format, since, tournament],
  );
  const rows = useMemo(
    () => (category === 'Team reports' ? [] : rankPlayers(totals, category, metric, criteria)),
    [totals, category, metric, criteria],
  );
  const provisionalRows = useMemo(
    () =>
      category === 'Team reports' || !requiresQualification(metric)
        ? []
        : rankPlayers(totals, category, metric, criteria, { provisional: true }),
    [totals, category, metric, criteria],
  );
  const tournaments = [
    ...new Set(
      data.matches
        .map((m) => m.tournamentId || m.tournament)
        .filter((t) => typeof t === 'string' && t),
    ),
  ];
  const columns =
    category === 'Batters'
      ? [
          ['matches', 'Matches'],
          ['runs', 'Runs'],
          ['average', 'Average'],
          ['strikeRate', 'SR'],
          ['fours', '4s'],
          ['sixes', '6s'],
        ]
      : category === 'Bowlers'
        ? [
            ['matches', 'Matches'],
            ['overs', 'Overs'],
            ['conceded', 'Runs'],
            ['wickets', 'Wickets'],
            ['bowlingAverage', 'Average'],
            ['economy', 'Economy'],
          ]
        : [
            ['matches', 'Matches'],
            ['runs', 'Runs'],
            ['average', 'Bat avg'],
            ['wickets', 'Wickets'],
            ['economy', 'Economy'],
            ['battingRating', 'Bat rating'],
            ['bowlingRating', 'Bowl rating'],
            ['allRounderRating', 'All-round rating'],
          ];
  const label = rankingMetrics[category]?.find((m) => m[0] === metric)?.[1];
  const usesQualification = category !== 'Team reports' && requiresQualification(metric);
  const team = data.teams.find((t) => t.id === (teamId || teams[0]?.id));
  return (
    <section className="statistics-view leaderboards">
      <Tabs
        items={['Batters', 'Bowlers', 'All-Rounders', 'Team reports']}
        value={category}
        onChange={(value) => {
          setCategory(value);
          setMetric(rankingMetrics[value]?.[0][0] || 'runs');
        }}
        id="rankings"
        label="Statistics views"
      />
      <div className="ranking-filters">
        <FilterSelect
          label="Team"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          options={[{ id: '', name: 'All Teams' }, ...teams]}
        />
        {category !== 'Team reports' && (
          <>
            <FilterSelect
              label="Match format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              options={[
                { id: '', name: 'All Formats' },
                ...[...new Set(data.matches.map((m) => m.rules.overs))]
                  .sort((a, b) => a - b)
                  .map((n) => ({ id: String(n), name: n + ' overs' })),
              ]}
            />
            <FilterSelect
              label="Time period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              options={[
                { id: '', name: 'All Time' },
                { id: '30', name: 'Last 30 days' },
                { id: '90', name: 'Last 90 days' },
                { id: '365', name: 'Last year' },
              ]}
            />
            {tournaments.length > 0 && (
              <FilterSelect
                label="Tournament"
                value={tournament}
                onChange={(e) => setTournament(e.target.value)}
                options={[{ id: '', name: 'All tournaments' }, ...tournaments]}
              />
            )}
            <FilterSelect
              label="Ranking"
              value={metric}
              onChange={(e) => {
                if (e.target.value) setMetric(e.target.value);
              }}
              options={rankingMetrics[category].map(([id, name, dir]) => ({
                id,
                name: name + (dir === 'asc' ? ' ↑' : ' ↓'),
              }))}
            />
          </>
        )}
      </div>
      <div role="tabpanel" id="rankings-panel" aria-labelledby={'rankings-' + category}>
        {category === 'Team reports' ? (
          team ? (
            <TeamStatistics
              team={{
                ...team,
                squad: data.memberships
                  .filter((m) => m.teamId === team.id)
                  .map((m) => data.players.find((p) => p.id === m.playerId))
                  .filter(Boolean),
              }}
              data={data}
            />
          ) : (
            <Empty title="No team reports yet">Complete a match to see team performance.</Empty>
          )
        ) : (
          <>
            <div className="ranking-heading">
              <h2>Top 20 {category}</h2>
              <span>{rows.length} {usesQualification ? 'qualified players' : 'players'}</span>
            </div>
            {category === 'All-Rounders' && (
              <p className="help">
                All-rounder rating = batting rating × bowling rating ÷ 1000. Legacy Crease points
                remain available as a separate metric.
              </p>
            )}
            <details className="ranking-qualification ranking-explainer">
              <summary>How rankings work</summary>
              <p className="help">
                Traditional tables use completed-match event history only. Rate and rating tables
                require 3 appearances and 24 relevant balls; players below that threshold remain
                visible as provisional. Shared values share a competition rank.
              </p>
            </details>
            {usesQualification && (
              <details className="ranking-qualification">
                <summary>Qualification</summary>
                <div className="ranking-filters">
                  {Object.entries(criteria)
                    .filter(
                      ([key]) =>
                        (category === 'Batters' && ['minBatInnings', 'minBatBalls'].includes(key)) ||
                        (category === 'Bowlers' && ['minBowlInnings', 'minBowlBalls'].includes(key)) ||
                        (category === 'All-Rounders' && ['minBatInnings', 'minBatBalls', 'minBowlInnings', 'minBowlBalls'].includes(key)),
                    )
                    .map(([key, value]) => (
                      <Field
                        key={key}
                        label={
                          {
                            minBatInnings: 'Minimum batting innings',
                            minBatBalls: 'Minimum balls faced',
                            minBowlInnings: 'Minimum bowling appearances',
                            minBowlBalls: 'Minimum legal balls',
                          }[key]
                        }
                        type="number"
                        min="0"
                        max="100000"
                        value={value}
                        onChange={(e) =>
                          setCriteria({
                            ...criteria,
                            [key]: Math.max(0, Math.min(100000, Number(e.target.value) || 0)),
                          })
                        }
                      />
                    ))}
                </div>
              </details>
            )}
            {!rows.length ? (
              <Empty title={usesQualification ? 'No eligible players' : 'No players yet'}>
                {usesQualification
                  ? 'Complete matches or adjust your filters and qualification.'
                  : 'Complete matches or adjust your filters.'}
              </Empty>
            ) : (
              <>
                <div className="ranking-desktop">
                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        {columns.map(([key, title]) => (
                          <th
                            key={key}
                            aria-sort={
                              metric === key
                                ? rankingMetrics[category].find((m) => m[0] === metric)?.[2] ===
                                  'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : undefined
                            }
                          >
                            {title}
                            {metric === key ? ' ↕' : ''}
                          </th>
                        ))}
                        {!columns.some(([k]) => k === metric) && <th>{label}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <span className={'rank-badge rank-' + p.rank}>{p.rank}</span>
                          </td>
                          <td>
                            <Link href={'/app/player/?id=' + p.id}>{p.name}</Link>
                            {p.archived && <small>Archived</small>}
                          </td>
                          {columns.map(([k]) => (
                            <td key={k}>{display(p[k])}</td>
                          ))}
                          {!columns.some(([k]) => k === metric) && <td>{display(p[metric])}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ranking-mobile">
                  {rows.map((p) => (
                    <details key={p.id}>
                      <summary>
                        <span className={'rank-badge rank-' + p.rank}>{p.rank}</span>
                        <span className="ranking-player">
                          {p.name}
                          <small>
                            {category === 'Bowlers' ? p.overs + ' overs' : p.matches + ' matches'}
                            {p.archived ? ' · Archived' : ''}
                          </small>
                        </span>
                        <span className="ranking-primary">
                          {display(p[metric])}
                          <small>{label}</small>
                        </span>
                      </summary>
                      <Link href={'/app/player/?id=' + p.id}>View player profile</Link>
                      <dl>
                        {columns.map(([k, title]) => (
                          <div key={k}>
                            <dt>{title}</dt>
                            <dd>{display(p[k])}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  ))}
                </div>
              </>
            )}
            {usesQualification && provisionalRows.length > 0 && (
              <details className="ranking-qualification">
                <summary>Provisional players ({provisionalRows.length})</summary>
                <p className="help">These players have recorded completed-match statistics but have not reached the selected participation threshold.</p>
                <ul className="ranking-provisional-list">
                  {provisionalRows.map((p) => (
                    <li key={p.id}>
                      <Link href={'/app/player/?id=' + p.id}>{p.name}</Link>
                      <span>{category === 'Batters' ? p.battingProgress : category === 'Bowlers' ? p.bowlingProgress : `${p.battingProgress}; ${p.bowlingProgress}`}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  );
}
