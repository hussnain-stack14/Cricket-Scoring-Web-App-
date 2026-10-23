'use client';
import { useMemo, useState } from 'react';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import { compareStatistic, sortStatistics, teamStatistics } from '../lib/statistics';
import { downloadCsv, printReport } from '../lib/reports';
import { Button, Select } from './ui';

const battingSorts = [
  ['runs', 'Most runs'],
  ['average', 'Best average'],
  ['strikeRate', 'Highest strike rate'],
  ['fours', 'Most fours'],
  ['sixes', 'Most sixes'],
  ['highest', 'Highest score'],
];
const bowlingSorts = [
  ['wickets', 'Most wickets'],
  ['bowlingAverage', 'Best bowling average'],
  ['economy', 'Best economy'],
  ['bowlingStrikeRate', 'Best bowling strike rate'],
  ['dots', 'Most dot balls'],
  ['maidens', 'Most maidens'],
  ['bestWickets', 'Best bowling figures'],
];
const show = (value, decimals = 2) =>
  value === null || value === undefined
    ? '—'
    : typeof value === 'number' && !Number.isInteger(value)
      ? value.toFixed(decimals)
      : value;

function Metric({ title, value }) {
  return (
    <div className="team-stat-metric">
      <strong>{value}</strong>
      <span>{title}</span>
    </div>
  );
}

function RankTable({ kind, rows, team }) {
  const isBatting = kind === 'Batting';
  const metrics = isBatting
    ? [
        ['matches', 'Matches'],
        ['innings', 'Innings'],
        ['runs', 'Runs'],
        ['balls', 'Balls'],
        ['highest', 'High'],
        ['average', 'Avg'],
        ['strikeRate', 'SR'],
        ['fours', '4s'],
        ['sixes', '6s'],
        ['notOuts', 'NO'],
        ['thirties', '30s'],
        ['fifties', '50s'],
        ['hundreds', '100s'],
      ]
    : [
        ['matches', 'Matches'],
        ['innings', 'Innings'],
        ['overs', 'Overs'],
        ['balls', 'Legal balls'],
        ['runs', 'Runs'],
        ['wickets', 'Wickets'],
        ['bowlingAverage', 'Avg'],
        ['economy', 'Econ'],
        ['bowlingStrikeRate', 'SR'],
        ['dots', 'Dots'],
        ['maidens', 'M'],
        ['bestFigures', 'Best'],
      ];

  return (
    <div className="table-wrap stats-table-wrap">
      <table className="stats-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            {metrics.map(([key, label], index) => (
              <th className={index > 4 ? 'optional-stat' : ''} key={key}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((player, index) => (
            <tr key={player.id}>
              <td>{index + 1}</td>
              <td className="stats-player-name">
                <strong>{player.name}</strong>
                {!player.qualified && (
                  <small className="qualification-note">Not yet qualified for Top {kind}</small>
                )}
                <details className="stats-more">
                  <summary>More stats</summary>
                  <div className="stats-extra">
                    {metrics.slice(5).map(([key, label]) => (
                      <span key={key}>
                        {label}: <strong>{show(player[key])}</strong>
                      </span>
                    ))}
                    <span>
                      Qualification:{' '}
                      <strong>{player.qualified ? 'Qualified' : 'Not qualified'}</strong>
                    </span>
                  </div>
                </details>
              </td>
              {metrics.map(([key], cellIndex) => (
                <td className={cellIndex > 4 ? 'optional-stat' : ''} key={key}>
                  {show(player[key])}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={metrics.length + 2}>No {kind.toLowerCase()} figures recorded yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      <span className="sr-only">
        {team.name} {kind.toLowerCase()} statistics
      </span>
    </div>
  );
}

export default function TeamStatistics({ team, data, onBack }) {
  const [tab, setTab] = useState('Overview');
  const [battingSort, setBattingSort] = useState('runs');
  const [bowlingSort, setBowlingSort] = useState('wickets');
  const [playerA, setPlayerA] = useState(team.squad[0]?.id ?? '');
  const [playerB, setPlayerB] = useState(team.squad[1]?.id ?? team.squad[0]?.id ?? '');
  const [exportError, setExportError] = useState('');
  const stats = useMemo(
    () => teamStatistics(team.id, data.matches, data.innings, data.events),
    [team.id, data.matches, data.innings, data.events],
  );
  const sortDirection = (key) =>
    ['average', 'economy', 'bowlingAverage', 'bowlingStrikeRate'].includes(key) ? 'asc' : 'desc';
  const battingRows = sortStatistics(stats.batting, battingSort, sortDirection(battingSort));
  const bowlingRows =
    bowlingSort === 'bestWickets'
      ? sortStatistics(sortStatistics(stats.bowling, 'bestRuns', 'asc'), 'bestWickets', 'desc')
      : sortStatistics(stats.bowling, bowlingSort, sortDirection(bowlingSort));
  const topBatters = sortStatistics(
    stats.batting.filter((player) => player.qualified && player.performanceScore !== null),
    'performanceScore',
  ).slice(0, 3);
  const topBowlers = sortStatistics(
    stats.bowling.filter((player) => player.qualified && player.performanceScore !== null),
    'performanceScore',
  ).slice(0, 3);
  const comparePlayers = [
    ...new Map(
      [...team.squad, ...stats.batting, ...stats.bowling].map((player) => [player.id, player]),
    ).values(),
  ];
  const selectedA = playerA || comparePlayers[0]?.id || '';
  const selectedB =
    playerB && playerB !== selectedA
      ? playerB
      : (comparePlayers.find((player) => player.id !== selectedA)?.id ?? selectedA);
  const batterA = stats.batting.find((player) => player.id === selectedA);
  const batterB = stats.batting.find((player) => player.id === selectedB);
  const bowlerA = stats.bowling.find((player) => player.id === selectedA);
  const bowlerB = stats.bowling.find((player) => player.id === selectedB);
  const playerName = (id) => comparePlayers.find((player) => player.id === id)?.name ?? 'Player';

  function exportTable(kind, rows) {
    const isBatting = kind === 'Batting';
    const columns = isBatting
      ? [
          ['Rank', 'rank'],
          ['Player', 'name'],
          ['Matches', 'matches'],
          ['Innings', 'innings'],
          ['Runs', 'runs'],
          ['Balls', 'balls'],
          ['Highest score', 'highest'],
          ['Average', 'average'],
          ['Strike rate', 'strikeRate'],
          ['Fours', 'fours'],
          ['Sixes', 'sixes'],
          ['Not outs', 'notOuts'],
          ['30s', 'thirties'],
          ['50s', 'fifties'],
          ['100s', 'hundreds'],
        ]
      : [
          ['Rank', 'rank'],
          ['Player', 'name'],
          ['Matches', 'matches'],
          ['Innings', 'innings'],
          ['Overs', 'overs'],
          ['Legal balls', 'balls'],
          ['Runs conceded', 'runs'],
          ['Wickets', 'wickets'],
          ['Bowling average', 'bowlingAverage'],
          ['Economy rate', 'economy'],
          ['Bowling strike rate', 'bowlingStrikeRate'],
          ['Dot balls', 'dots'],
          ['Maidens', 'maidens'],
          ['Best figures', 'bestFigures'],
        ];
    downloadCsv(
      `${team.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${kind.toLowerCase()}.csv`,
      columns.map(([label]) => label),
      rows.map((player, index) =>
        columns.map(([, key]) => (key === 'rank' ? index + 1 : (player[key] ?? ''))),
      ),
    );
  }

  function exportTeamReport() {
    const battingColumns = [
      ['Player', 'name'],
      ['Matches', 'matches'],
      ['Innings', 'innings'],
      ['Runs', 'runs'],
      ['Balls', 'balls'],
      ['Average', 'average'],
      ['Strike rate', 'strikeRate'],
      ['Highest', 'highest'],
      ['Fours', 'fours'],
      ['Sixes', 'sixes'],
      ['Not outs', 'notOuts'],
      ['30s', 'thirties'],
      ['50s', 'fifties'],
      ['100s', 'hundreds'],
    ];
    const bowlingColumns = [
      ['Player', 'name'],
      ['Matches', 'matches'],
      ['Innings', 'innings'],
      ['Overs', 'overs'],
      ['Runs', 'runs'],
      ['Wickets', 'wickets'],
      ['Average', 'bowlingAverage'],
      ['Economy', 'economy'],
      ['Strike rate', 'bowlingStrikeRate'],
      ['Dots', 'dots'],
      ['Maidens', 'maidens'],
      ['Best', 'bestFigures'],
    ];
    try {
      setExportError('');
      printReport({
        title: `${team.name} · Team statistics`,
        subtitle: 'Completed matches only',
        sections: [
          {
            title: 'Team overview',
            headers: [
              'Matches',
              'Won',
              'Lost',
              'Tied',
              'No results',
              'Runs',
              'Wickets',
              'Win %',
              'Highest',
              'Lowest',
            ],
            rows: [
              [
                stats.matches,
                stats.won,
                stats.lost,
                stats.tied,
                stats.noResults,
                stats.runs,
                stats.wickets,
                show(stats.winPercentage),
                show(stats.highest),
                show(stats.lowest),
              ],
            ],
          },
          {
            title: 'Batting leaderboard',
            headers: battingColumns.map(([label]) => label),
            rows: battingRows.map((player) => battingColumns.map(([, key]) => player[key] ?? '—')),
          },
          {
            title: 'Bowling leaderboard',
            headers: bowlingColumns.map(([label]) => label),
            rows: bowlingRows.map((player) => bowlingColumns.map(([, key]) => player[key] ?? '—')),
          },
        ],
      });
    } catch (error) {
      setExportError(error.message || 'Could not open the report. Allow pop-ups and try again.');
    }
  }

  function exportComparison() {
    const rows = [
      ['Matches', 'matches', false, batterA?.matches, batterB?.matches],
      ['Runs', 'runs', false, batterA?.runs, batterB?.runs],
      ['Average', 'average', false, batterA?.average, batterB?.average],
      ['Strike rate', 'strikeRate', false, batterA?.strikeRate, batterB?.strikeRate],
      ['Highest score', 'highest', false, batterA?.highest, batterB?.highest],
      ['Fours', 'fours', false, batterA?.fours, batterB?.fours],
      ['Sixes', 'sixes', false, batterA?.sixes, batterB?.sixes],
      ['Wickets', 'wickets', false, bowlerA?.wickets, bowlerB?.wickets],
      ['Economy', 'economy', true, bowlerA?.economy, bowlerB?.economy],
      ['Bowling average', 'bowlingAverage', true, bowlerA?.bowlingAverage, bowlerB?.bowlingAverage],
      [
        'Bowling strike rate',
        'bowlingStrikeRate',
        true,
        bowlerA?.bowlingStrikeRate,
        bowlerB?.bowlingStrikeRate,
      ],
      ['Dot balls', 'dots', false, bowlerA?.dots, bowlerB?.dots],
      ['Best bowling', 'bestFigures', null, bowlerA?.bestFigures, bowlerB?.bestFigures],
    ];
    const headers = ['Metric', playerName(selectedA), playerName(selectedB), 'Edge'];
    const values = rows.map(([label, key, lower, a, b]) => {
      const better = lower === null ? null : compareStatistic(a, b, key, lower);
      return [
        label,
        show(a),
        show(b),
        better === 'a'
          ? playerName(selectedA)
          : better === 'b'
            ? playerName(selectedB)
            : 'Not enough data',
      ];
    });
    downloadCsv(
      `${team.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-player-comparison.csv`,
      headers,
      values,
    );
    try {
      setExportError('');
      printReport({
        title: `${team.name} · Player comparison`,
        subtitle: `${playerName(selectedA)} compared with ${playerName(selectedB)}`,
        sections: [{ title: 'Batting and bowling', headers, rows: values }],
      });
    } catch (error) {
      setExportError(error.message || 'Could not open the report. Allow pop-ups and try again.');
    }
  }

  return (
    <section className="team-statistics">
      <div className="row team-stat-heading">
        <div>
          {onBack && (
            <button className="text-button" onClick={onBack}>
              <ArrowLeft size={17} /> Teams
            </button>
          )}
          <h2>{team.name} statistics</h2>
        </div>
        <div className="actions">
          <Button secondary onClick={exportTeamReport}>
            <FileText size={16} /> Report PDF
          </Button>
        </div>
      </div>
      <div className="tabs" aria-label={`${team.name} statistics`}>
        {['Overview', 'Batting', 'Bowling', 'Compare'].map((name) => (
          <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
      </div>
      {exportError && (
        <p role="alert" className="notice error">
          {exportError}
        </p>
      )}

      {tab === 'Overview' && (
        <>
          <div className="team-stat-grid">
            <Metric title="Matches played" value={stats.matches} />
            <Metric title="Won" value={stats.won} />
            <Metric title="Lost" value={stats.lost} />
            <Metric title="Tied" value={stats.tied} />
            <Metric title="No results" value={stats.noResults} />
            <Metric title="Runs scored" value={stats.runs} />
            <Metric title="Wickets taken" value={stats.wickets} />
            <Metric
              title="Win rate"
              value={stats.winPercentage === null ? '—' : `${show(stats.winPercentage)}%`}
            />
            <Metric title="Highest completed score" value={show(stats.highest)} />
            <Metric title="Lowest completed score" value={show(stats.lowest)} />
          </div>
          <p className="help">
            Only completed matches count. No-result matches are not currently supported by scoring.
          </p>
          <div className="team-top-grid">
            <section className="card">
              <h3>Top batsmen</h3>
              <p className="help">
                Crease Performance Score = average × strike rate ÷ 100. Requires 2 innings and 20
                balls faced.
              </p>
              {topBatters.length ? (
                topBatters.map((player, index) => (
                  <div className="leader-row" key={player.id}>
                    <strong>
                      {index + 1}. {player.name}
                    </strong>
                    <span>
                      {show(player.performanceScore)} · {player.runs} runs
                    </span>
                  </div>
                ))
              ) : (
                <p className="help">Not enough completed batting data to rank players yet.</p>
              )}
            </section>
            <section className="card">
              <h3>Top bowlers</h3>
              <p className="help">
                Crease Performance Score = wickets × 3 + dot-ball rate ÷ 10 − economy − bowling
                average ÷ 10. Requires 2 innings, 12 legal balls and 2 wickets.
              </p>
              {topBowlers.length ? (
                topBowlers.map((player, index) => (
                  <div className="leader-row" key={player.id}>
                    <strong>
                      {index + 1}. {player.name}
                    </strong>
                    <span>
                      {show(player.performanceScore)} · {player.wickets} wickets
                    </span>
                  </div>
                ))
              ) : (
                <p className="help">Not enough completed bowling data to rank players yet.</p>
              )}
            </section>
          </div>
        </>
      )}

      {tab === 'Batting' && (
        <>
          <div className="stats-toolbar">
            <Select
              label="Sort batting by"
              value={battingSort}
              onChange={(event) => setBattingSort(event.target.value)}
              options={battingSorts.map(([id, name]) => ({ id, name }))}
            />
            <Button secondary onClick={() => exportTable('Batting', battingRows)}>
              <Download size={16} /> CSV
            </Button>
          </div>
          <p className="help">
            Average = runs ÷ dismissals. Strike rate = runs ÷ balls × 100. Top ranking qualification
            requires 2 innings and 20 balls faced.
          </p>
          <RankTable kind="Batting" rows={battingRows} team={team} />
        </>
      )}

      {tab === 'Bowling' && (
        <>
          <div className="stats-toolbar">
            <Select
              label="Sort bowling by"
              value={bowlingSort}
              onChange={(event) => setBowlingSort(event.target.value)}
              options={bowlingSorts.map(([id, name]) => ({ id, name }))}
            />
            <Button secondary onClick={() => exportTable('Bowling', bowlingRows)}>
              <Download size={16} /> CSV
            </Button>
          </div>
          <p className="help">
            Overs use cricket notation. Economy = runs charged to the bowler ÷ legal balls × 6. Dot
            balls have no runs charged to the bowler, including byes and leg-byes. Top ranking
            qualification requires 2 innings, 12 legal balls and 2 wickets.
          </p>
          <RankTable kind="Bowling" rows={bowlingRows} team={team} />
        </>
      )}

      {tab === 'Compare' && (
        <>
          {comparePlayers.length < 2 ? (
            <p className="notice">Add at least two players to this squad to compare players.</p>
          ) : (
            <>
              <div className="two-col">
                <Select
                  label="First player"
                  value={selectedA}
                  onChange={(event) => {
                    const next = event.target.value;
                    setPlayerA(next);
                    if (next === selectedB)
                      setPlayerB(comparePlayers.find((player) => player.id !== next)?.id ?? '');
                  }}
                  options={comparePlayers}
                />
                <Select
                  label="Second player"
                  value={selectedB}
                  onChange={(event) => {
                    const next = event.target.value;
                    setPlayerB(next);
                    if (next === selectedA)
                      setPlayerA(comparePlayers.find((player) => player.id !== next)?.id ?? '');
                  }}
                  options={comparePlayers.filter((player) => player.id !== selectedA)}
                />
              </div>
              <div className="comparison-table-wrap">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Statistic</th>
                      <th>{playerName(selectedA)}</th>
                      <th>{playerName(selectedB)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Matches', 'matches', false, batterA?.matches, batterB?.matches],
                      ['Runs', 'runs', false, batterA?.runs, batterB?.runs],
                      ['Average', 'average', false, batterA?.average, batterB?.average],
                      [
                        'Strike rate',
                        'strikeRate',
                        false,
                        batterA?.strikeRate,
                        batterB?.strikeRate,
                      ],
                      ['Highest score', 'highest', false, batterA?.highest, batterB?.highest],
                      ['Fours', 'fours', false, batterA?.fours, batterB?.fours],
                      ['Sixes', 'sixes', false, batterA?.sixes, batterB?.sixes],
                      ['Wickets', 'wickets', false, bowlerA?.wickets, bowlerB?.wickets],
                      ['Economy', 'economy', true, bowlerA?.economy, bowlerB?.economy],
                      [
                        'Bowling average',
                        'bowlingAverage',
                        true,
                        bowlerA?.bowlingAverage,
                        bowlerB?.bowlingAverage,
                      ],
                      [
                        'Bowling strike rate',
                        'bowlingStrikeRate',
                        true,
                        bowlerA?.bowlingStrikeRate,
                        bowlerB?.bowlingStrikeRate,
                      ],
                      ['Dot balls', 'dots', false, bowlerA?.dots, bowlerB?.dots],
                      [
                        'Best bowling',
                        'bestFigures',
                        null,
                        bowlerA?.bestFigures,
                        bowlerB?.bestFigures,
                      ],
                    ].map(([label, key, lower, a, b]) => {
                      const better = lower === null ? null : compareStatistic(a, b, key, lower);
                      return (
                        <tr key={label}>
                          <th>{label}</th>
                          <td className={better === 'a' ? 'comparison-better' : ''}>{show(a)}</td>
                          <td className={better === 'b' ? 'comparison-better' : ''}>{show(b)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="help">
                Highlighted figures are better for that measure. A dash means the figure is
                undefined; close comparisons need more data.
              </p>
              <Button secondary onClick={exportComparison}>
                <FileText size={16} /> Export comparison
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}
