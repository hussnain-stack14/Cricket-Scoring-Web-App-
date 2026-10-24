'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Empty, Field, Select, Tabs } from './ui';
import TeamStatistics from './TeamStatistics';
import { playerTotals, rankPlayers, rankingMetrics } from '../lib/leaderboards';
const display = (value) =>
  value === null || value === undefined
    ? '—'
    : typeof value === 'number' && !Number.isInteger(value)
      ? value.toFixed(2)
      : value;
export default function Statistics({ data }) {
  const [category, setCategory] = useState('Batters'),
    [metric, setMetric] = useState('runs'),
    [teamId, setTeamId] = useState(''),
    [format, setFormat] = useState(''),
    [period, setPeriod] = useState(''),
    [tournament, setTournament] = useState('');
  const [criteria, setCriteria] = useState({
    minInnings: 2,
    minBatBalls: 20,
    minBowlBalls: 12,
    minWickets: 2,
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
            ['strikeRate', 'Bat SR'],
            ['wickets', 'Wickets'],
            ['economy', 'Economy'],
          ];
  const label = rankingMetrics[category]?.find((m) => m[0] === metric)?.[1];
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
        <Select
          label="Team"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          options={[{ id: '', name: 'All Teams' }, ...teams]}
        />
        {category !== 'Team reports' && (
          <>
            <Select
              label="Match format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              options={[
                { id: '', name: 'All formats' },
                ...[...new Set(data.matches.map((m) => m.rules.overs))]
                  .sort((a, b) => a - b)
                  .map((n) => ({ id: String(n), name: n + ' overs' })),
              ]}
            />
            <Select
              label="Time period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              options={[
                { id: '', name: 'All time' },
                { id: '30', name: 'Last 30 days' },
                { id: '90', name: 'Last 90 days' },
                { id: '365', name: 'Last year' },
              ]}
            />
            {tournaments.length > 0 && (
              <Select
                label="Tournament"
                value={tournament}
                onChange={(e) => setTournament(e.target.value)}
                options={[{ id: '', name: 'All tournaments' }, ...tournaments]}
              />
            )}
            <Select
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
              <span>{rows.length} eligible players</span>
            </div>
            {category === 'All-Rounders' && (
              <p className="help">
                Crease points = runs + 20 × wickets. Requires batting and bowling participation.
              </p>
            )}
            {['average', 'strikeRate', 'bowlingAverage', 'economy', 'bowlingStrikeRate'].includes(
              metric,
            ) && (
              <details className="ranking-qualification">
                <summary>Qualification</summary>
                <div className="ranking-filters">
                  {Object.entries(criteria)
                    .filter(
                      ([key]) =>
                        key === 'minInnings' ||
                        (category === 'Batters'
                          ? key === 'minBatBalls'
                          : ['minBowlBalls', 'minWickets'].includes(key)),
                    )
                    .map(([key, value]) => (
                      <Field
                        key={key}
                        label={
                          {
                            minInnings: 'Minimum innings',
                            minBatBalls: 'Minimum balls faced',
                            minBowlBalls: 'Minimum legal balls',
                            minWickets: 'Minimum wickets',
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
              <Empty title="No eligible players">
                Complete matches or adjust your filters and qualification.
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
          </>
        )}
      </div>
    </section>
  );
}
