'use client';
import { useState, useRef } from 'react';
import { changeMatch, uuid } from '../lib/db';
import { matchStates, overs, rate, result } from '../lib/engine';
import { Button, Field, Select, Sheet, playerLabel } from './ui';
export default function Match({ w, data, run, error }) {
  const id = new URLSearchParams(window.location.search).get('id'),
    m = data.matches.find((x) => x.id === id);
  const [tab, setTab] = useState('Score'),
    [sheet, setSheet] = useState(null),
    [selection, setSelection] = useState(''),
    [opening, setOpening] = useState({ striker: '', nonStriker: '', bowler: '' }),
    [delivery, setDelivery] = useState({}),
    [sheetError, setSheetError] = useState('');
  const lastTap = useRef(0);
  if (!m)
    return (
      <p>
        Match not found on this device. <a href="/">View matches</a>
      </p>
    );
  const inns = data.innings.filter((i) => i.matchId === id).sort((a, b) => a.number - b.number),
    events = data.events.filter((e) => e.matchId === id).sort((a, b) => a.seq - b.seq);
  const states = matchStates(m, inns, events),
    s = states.at(-1),
    inn = inns.at(-1),
    battingSide = inn.number === 1 ? m.firstBat : 1 - m.firstBat;
  const target = states.length === 2 ? states[0].runs + 1 : null,
    ballsLeft = m.rules.overs * 6 - s.balls;
  const frozen = m.status === 'completed';
  async function act(action) {
    const ok = await run(() => changeMatch(w.id, m.id, m.revision, action));
    if (!ok)
      setSheetError(
        'Could not save. Check your selections and the save error shown on the page. Close this sheet to refresh if another tab changed the match.',
      );
    return ok;
  }
  async function ball(e) {
    if (Date.now() - lastTap.current < 450) return;
    lastTap.current = Date.now();
    if (
      await act({
        type: 'event',
        event: {
          type: 'delivery',
          id: uuid(),
          bat: 0,
          extra: 'none',
          extraRuns: 0,
          running: 0,
          ...e,
        },
      })
    )
      setSheet(null);
  }
  function detail(extra = 'none', wicket = false) {
    setSheetError('');
    setDelivery({
      bat: 0,
      extra,
      extraRuns: 0,
      running: 0,
      boundary: false,
      kind: wicket ? 'bowled' : '',
      player: s.striker,
      survivorEnd: 'striker',
    });
    setSheet('delivery');
  }
  const set = (k, v) => setDelivery((d) => ({ ...d, [k]: v }));
  const latest = [...events].reverse().find((e) => e.type === 'delivery');
  return (
    <>
      <div className="match-meta">
        <strong>{m.teams.map((t) => t.name).join(' vs ')}</strong>
        <p>
          {m.date} · {m.venue || 'Local match'} · {m.rules.overs} overs
        </p>
      </div>
      <div className="tabs">
        {['Score', 'Scorecard', 'History'].map((t) => (
          <button className={tab === t ? 'active' : ''} key={t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Score' && (
        <>
          <section className="score-panel">
            <div className="row">
              <span className="pill">
                INNINGS {inn.number} · {frozen ? 'FINAL' : 'LOCAL MATCH'}
              </span>
              <span>{s.freeHit ? 'FREE HIT' : `${m.rules.overs} OVERS`}</span>
            </div>
            <h2>{m.teams[battingSide].name}</h2>
            <div className="big-score">
              {s.runs}
              <span>/{s.wickets}</span>
              <small>({overs(s.balls)})</small>
            </div>
            <div className="score-metrics">
              <div>
                <span>RUN RATE</span>
                <strong>{rate(s.runs, s.balls, 6)}</strong>
              </div>
              <div>
                <span>PARTNERSHIP</span>
                <strong>{s.partnership}</strong>
              </div>
              <div>
                <span>{target ? 'TARGET' : 'BALLS LEFT'}</span>
                <strong>{target || ballsLeft}</strong>
              </div>
            </div>
          </section>
          {target && (
            <div className="chase-banner">
              {s.done ? (
                result(m, states)
              ) : (
                <>
                  {m.teams[battingSide].name} need{' '}
                  <strong>
                    {Math.max(0, target - s.runs)} from {ballsLeft} balls
                  </strong>
                  <small>
                    Required run rate {rate(Math.max(0, target - s.runs), ballsLeft, 6)}
                  </small>
                </>
              )}
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Batter</th>
                  <th>R</th>
                  <th>B</th>
                  <th>4s</th>
                  <th>6s</th>
                  <th>SR</th>
                </tr>
              </thead>
              <tbody>
                {[s.striker, s.nonStriker].filter(Boolean).map((p, index) => (
                  <tr key={p}>
                    <td>
                      {s.batting[p].name}
                      {index === 0 && <span className="strike"> ●</span>}
                    </td>
                    <td>
                      <b>{s.batting[p].runs}</b>
                    </td>
                    <td>{s.batting[p].balls}</td>
                    <td>{s.batting[p].fours}</td>
                    <td>{s.batting[p].sixes}</td>
                    <td>{rate(s.batting[p].runs, s.batting[p].balls, 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table>
              <thead>
                <tr>
                  <th>Bowler</th>
                  <th>O</th>
                  <th>M</th>
                  <th>R</th>
                  <th>W</th>
                  <th>ECO</th>
                </tr>
              </thead>
              <tbody>
                {[s.bowling[s.bowler]].map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td>{overs(b.balls)}</td>
                    <td>{b.maidens}</td>
                    <td>{b.runs}</td>
                    <td>{b.wickets}</td>
                    <td>{rate(b.runs, b.balls, 6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="over-strip">
            <span>{s.balls > 0 && s.balls % 6 === 0 ? 'Last over' : 'This over'}</span>
            {s.deliveries
              .filter((e) => e.over === (s.deliveries.at(-1)?.over ?? 0))
              .map((e) => (
                <span
                  className={`ball-chip ${e.wicket ? 'wicket' : e.bat >= 4 ? 'boundary' : ''}`}
                  key={e.id}
                >
                  {e.wicket
                    ? 'W'
                    : e.extra === 'none'
                      ? e.bat
                      : `${e.total}${e.extra === 'wide' ? 'wd' : e.extra.startsWith('noBall') ? 'nb' : e.extra === 'bye' ? 'b' : 'lb'}`}
                </span>
              ))}
          </div>
          {frozen ? (
            <div className="notice">
              <h3>{result(m, states)}</h3>
              <p>Finalized. Included in player career statistics.</p>
              <Button secondary onClick={() => setSheet('reopen')}>
                Reopen match
              </Button>
            </div>
          ) : s.done ? (
            <div className="notice">
              <h3>{states.length === 1 ? 'Innings complete' : result(m, states)}</h3>
              {states.length === 1 ? (
                <Button
                  onClick={() => {
                    setSheetError('');
                    setSheet('chase');
                  }}
                >
                  Set up the chase
                </Button>
              ) : (
                <Button onClick={() => setSheet('finalize')}>Finalize match</Button>
              )}
            </div>
          ) : s.needBatter || s.needBowler ? (
            <div className="notice">
              <h3>
                {s.needBatter ? 'Choose the next batter' : 'Over complete. Change the bowler.'}
              </h3>
              <Select
                label={s.needBatter ? 'Replacement batter' : 'Next bowler'}
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                options={(s.needBatter
                  ? m.teams[battingSide].squad.filter((p) => !s.batting[p.id].played)
                  : m.teams[1 - battingSide].squad.filter(
                      (p) => p.id !== s.bowler && s.bowling[p.id].balls < m.rules.maxBowler * 6,
                    )
                ).map(playerLabel)}
              />
              <Button
                onClick={async () => {
                  if (
                    await act({
                      type: 'event',
                      event: {
                        id: uuid(),
                        type: s.needBatter ? 'batter' : 'bowler',
                        player: selection,
                      },
                    })
                  )
                    setSelection('');
                }}
              >
                Confirm player
              </Button>
            </div>
          ) : (
            <section className="scoring-controls">
              <div className="row">
                <h3>Record delivery</h3>
                <span className="help">
                  Next ball {Math.floor(s.balls / 6)}.{(s.balls % 6) + 1}
                </span>
              </div>
              <div className="run-buttons">
                {[0, 1, 2, 3, 4, 6].map((n) => (
                  <button
                    key={n}
                    onClick={() => ball({ bat: n, running: n < 4 ? n : 0, boundary: n >= 4 })}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="extras-buttons">
                {[
                  ['Wide', 'wide'],
                  ['No-ball', 'noBall'],
                  ['Byes', 'bye'],
                  ['Leg-byes', 'legBye'],
                ].map(([label, value]) => (
                  <button key={value} onClick={() => detail(value)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="two-col">
                <Button secondary onClick={() => detail()}>
                  Other runs / details
                </Button>
                <Button danger onClick={() => detail('none', true)}>
                  Wicket
                </Button>
              </div>
            </section>
          )}
          {!frozen && latest && (
            <Button secondary onClick={() => setSheet('undo')}>
              Undo last delivery
            </Button>
          )}
        </>
      )}
      {tab === 'Scorecard' && (
        <>
          {states.map((state, index) => (
            <Scorecard
              key={index}
              s={state}
              team={m.teams[index === 0 ? m.firstBat : 1 - m.firstBat]}
            />
          ))}
          <p className="notice">{result(m, states)}</p>
        </>
      )}
      {tab === 'History' && (
        <>
          <p className="help">
            Correcting an older ball rewinds that delivery and all later play. You review and
            re-enter those deliveries. Reopen a finalized match first.
          </p>
          {states.map((state, index) => (
            <section key={index}>
              <h2>Innings {index + 1}</h2>
              {[...new Set(state.deliveries.map((e) => e.over))].map((over) => (
                <details className="history-over" key={over}>
                  <summary>
                    Over {over + 1} ·{' '}
                    {state.deliveries.filter((e) => e.over === over).at(-1)?.score}
                  </summary>
                  {state.deliveries
                    .filter((e) => e.over === over)
                    .map((e) => (
                      <div className="history-row" key={e.id}>
                        <span>
                          {e.label} · {e.total} run{e.total === 1 ? '' : 's'} · {e.extra}
                          {e.wicket ? ` · ${e.wicket.kind}` : ''}
                        </span>
                        <Button
                          secondary
                          disabled={frozen}
                          onClick={() => setSheet({ type: 'rewind', event: e })}
                        >
                          Correct
                        </Button>
                      </div>
                    ))}
                </details>
              ))}
            </section>
          ))}
          <h3>Correction audit</h3>
          {data.audits
            .filter((a) => a.matchId === id)
            .map((a) => (
              <details key={a.id}>
                <summary>
                  {new Date(a.at).toLocaleString()} · {a.action} ·{' '}
                  {a.events.filter((e) => e.type === 'delivery').length} deliveries
                </summary>
                <pre>{JSON.stringify(a.events, null, 2)}</pre>
              </details>
            ))}
        </>
      )}
      {sheet && (
        <Sheet
          title={
            sheet === 'delivery'
              ? 'Delivery details'
              : sheet === 'chase'
                ? 'Opening the chase'
                : 'Confirm match change'
          }
          close={() => {
            setSheet(null);
            setSheetError('');
          }}
        >
          {sheetError && (
            <p role="alert" className="notice error">
              {error || sheetError}
            </p>
          )}
          {sheet === 'delivery' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await ball({
                  bat: Number(delivery.bat),
                  extra: delivery.extra,
                  extraRuns: Number(delivery.extraRuns),
                  running: Number(delivery.running),
                  boundary: delivery.boundary,
                  wicket: delivery.kind
                    ? {
                        kind: delivery.kind,
                        player: delivery.player,
                        survivorEnd: delivery.survivorEnd,
                      }
                    : null,
                });
              }}
            >
              <Select
                label="Extras"
                value={delivery.extra}
                onChange={(e) => set('extra', e.target.value)}
                options={[
                  'none',
                  'wide',
                  'noBall',
                  'bye',
                  'legBye',
                  'noBallBye',
                  'noBallLegBye',
                ].map((id) => ({
                  id,
                  name: {
                    none: 'No extras',
                    wide: 'Wide (+1 penalty)',
                    noBall: 'No-ball + bat runs (+1 penalty)',
                    bye: 'Byes',
                    legBye: 'Leg-byes',
                    noBallBye: 'No-ball + byes (+1 penalty)',
                    noBallLegBye: 'No-ball + leg-byes (+1 penalty)',
                  }[id],
                }))}
              />
              <div className="two-col">
                <Field
                  label="Bat runs"
                  type="number"
                  min="0"
                  max="6"
                  value={delivery.bat}
                  onChange={(e) => set('bat', Number(e.target.value))}
                />
                <Field
                  label="Additional extras (no penalty)"
                  type="number"
                  min="0"
                  max="6"
                  value={delivery.extraRuns}
                  onChange={(e) => set('extraRuns', Number(e.target.value))}
                />
              </div>
              <Field
                label="Completed runs by running (for ends)"
                type="number"
                min="0"
                max="6"
                value={delivery.running}
                onChange={(e) => set('running', Number(e.target.value))}
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={delivery.boundary}
                  onChange={(e) => set('boundary', e.target.checked)}
                />
                Bat boundary (four or six)
              </label>
              <Select
                label="Dismissal (optional)"
                value={delivery.kind}
                onChange={(e) => set('kind', e.target.value)}
                options={['bowled', 'caught', 'lbw', 'stumped', 'hit wicket', 'run out']}
              />
              {delivery.kind && (
                <Select
                  label="Dismissed batter"
                  value={delivery.player}
                  onChange={(e) => set('player', e.target.value)}
                  options={[s.striker, s.nonStriker]
                    .filter(Boolean)
                    .map((id) => playerLabel(s.batting[id]))}
                />
              )}
              {delivery.kind === 'run out' && (
                <Select
                  label="Surviving batter's end after incident, before over change"
                  value={delivery.survivorEnd}
                  onChange={(e) => set('survivorEnd', e.target.value)}
                  options={[
                    { id: 'striker', name: 'Striker end' },
                    { id: 'nonStriker', name: 'Non-striker end' },
                  ]}
                />
              )}
              <p className="help">
                Penalties are added automatically. Enter only completed running, excluding penalties
                and boundary allowances. Umpire decisions determine the dismissal and ends.
              </p>
              <Button>Save delivery</Button>
            </form>
          )}
          {sheet === 'chase' && (
            <>
              <p>
                Target {states[0].runs + 1}. {m.teams[1 - m.firstBat].name} to bat.
              </p>
              {['striker', 'nonStriker', 'bowler'].map((key) => (
                <Select
                  key={key}
                  label={key === 'nonStriker' ? 'Opening non-striker' : `Opening ${key}`}
                  value={opening[key]}
                  onChange={(e) => setOpening((o) => ({ ...o, [key]: e.target.value }))}
                  options={m.teams[key === 'bowler' ? m.firstBat : 1 - m.firstBat].squad.map(
                    playerLabel,
                  )}
                />
              ))}
              <Button
                onClick={async () => {
                  if (await act({ type: 'startChase', opening })) setSheet(null);
                }}
              >
                Start second innings
              </Button>
            </>
          )}
          {sheet === 'undo' && (
            <>
              <p>
                Reverse the latest delivery:{' '}
                <strong>
                  {latest?.extra} · {latest?.bat || 0} bat runs
                  {latest?.wicket ? ` · ${latest.wicket.kind}` : ''}
                </strong>
                . Any selections made after it will also be reversed. If this was the first innings,
                an empty chase setup is removed.
              </p>
              <Button
                danger
                onClick={async () => {
                  if (await act({ type: 'undo' })) setSheet(null);
                }}
              >
                Confirm undo
              </Button>
            </>
          )}
          {sheet.type === 'rewind' && (
            <>
              <p>
                Re-enter from ball {sheet.event.label}. This removes{' '}
                <strong>
                  {events.filter((e) => e.seq >= sheet.event.seq && e.type === 'delivery').length}{' '}
                  deliveries
                </strong>{' '}
                and all subsequent selections, including a later innings. The removed records remain
                in the correction audit.
              </p>
              <Button
                danger
                onClick={async () => {
                  if (await act({ type: 'rewind', eventId: sheet.event.id })) {
                    setSheet(null);
                    setTab('Score');
                  }
                }}
              >
                Rewind and review
              </Button>
            </>
          )}
          {sheet === 'finalize' && (
            <>
              <p>{result(m, states)}. Finalize this result and include it in career statistics?</p>
              <Button
                onClick={async () => {
                  if (await act({ type: 'finalize' })) setSheet(null);
                }}
              >
                Confirm finalization
              </Button>
            </>
          )}
          {sheet === 'reopen' && (
            <>
              <p>
                Reopening removes this match from career statistics until you finalize it again.
              </p>
              <Button
                onClick={async () => {
                  if (await act({ type: 'reopen' })) setSheet(null);
                }}
              >
                Confirm reopen
              </Button>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
function Scorecard({ s, team }) {
  return (
    <section className="scorecard">
      <div className="row">
        <h2>{team.name}</h2>
        <strong>
          {s.runs}/{s.wickets} ({overs(s.balls)})
        </strong>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Batting</th>
              <th>R</th>
              <th>B</th>
              <th>4s</th>
              <th>6s</th>
              <th>SR</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(s.batting).map((b) => (
              <tr key={b.id}>
                <td>
                  {b.name}
                  <small>{!b.played ? 'Did not bat' : b.out ? b.dismissal : 'Not out'}</small>
                </td>
                <td>{b.runs}</td>
                <td>{b.balls}</td>
                <td>{b.fours}</td>
                <td>{b.sixes}</td>
                <td>{rate(b.runs, b.balls, 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="help">
        Extras {Object.values(s.extras).reduce((a, b) => a + b, 0)} · Wd {s.extras.wide} · Nb{' '}
        {s.extras.noBall} · B {s.extras.bye} · Lb {s.extras.legBye}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bowling</th>
              <th>O</th>
              <th>M</th>
              <th>R</th>
              <th>W</th>
              <th>ECO</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(s.bowling)
              .filter((b) => b.balls || b.runs || b.wickets)
              .map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{overs(b.balls)}</td>
                  <td>{b.maidens}</td>
                  <td>{b.runs}</td>
                  <td>{b.wickets}</td>
                  <td>{rate(b.runs, b.balls, 6)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <h3>Fall of wickets</h3>
      <p className="help">
        {s.falls
          .map((f) => `${f.runs}/${f.wickets} · ${s.batting[f.player].name} (${overs(f.balls)})`)
          .join(' / ') || 'No wickets'}
      </p>
    </section>
  );
}
