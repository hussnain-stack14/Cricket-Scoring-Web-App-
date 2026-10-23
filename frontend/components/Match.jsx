'use client';
import { useState, useRef } from 'react';
import { FileText } from 'lucide-react';
import { addMatchPlayer, changeMatch, uuid } from '../lib/db';
import { matchStates, overs, rate, result } from '../lib/engine';
import { Button, Field, Select, Sheet, playerLabel } from './ui';
import ReportActions from './ReportActions';
export default function Match({ w, data, run, error }) {
  const base = '/app';
  const id = new URLSearchParams(window.location.search).get('id'),
    m = data.matches.find((x) => x.id === id);
  const [tab, setTab] = useState('Score'),
    [sheet, setSheet] = useState(null),
    [selection, setSelection] = useState(''),
    [delivery, setDelivery] = useState({}),
    [newPlayerName, setNewPlayerName] = useState(''),
    [playerTeamId, setPlayerTeamId] = useState(''),
    [sheetError, setSheetError] = useState(''),
    [savingDelivery, setSavingDelivery] = useState(false);
  const deliveryInFlight = useRef(false);
  if (!m)
    return (
      <p>
        Match not found on this device. <a href={`${base}/`}>View matches</a>
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
  const pendingSelection = s.needBatter
    ? { type: 'batter' }
    : s.needBowler
      ? { type: 'bowler' }
      : null;
  const selectionTeamId = pendingSelection
    ? m.teams[pendingSelection.type === 'batter' ? battingSide : 1 - battingSide].id
    : playerTeamId;
  const candidates = data.players.filter((player) => {
    const member = data.memberships.some(
      (membership) => membership.playerId === player.id && membership.teamId === selectionTeamId,
    );
    if (!member || player.archived) return false;
    const ownTeam = m.teams.find((team) => team.id === selectionTeamId);
    const otherTeam = m.teams.find((team) => team.id !== selectionTeamId);
    if (otherTeam?.squad.some((memberPlayer) => memberPlayer.id === player.id)) return false;
    if (pendingSelection?.type === 'batter')
      return (
        !s.batting[player.id]?.played &&
        ((ownTeam?.squad.length ?? 0) < m.rules.size ||
          ownTeam?.squad.some((memberPlayer) => memberPlayer.id === player.id))
      );
    if (pendingSelection?.type === 'bowler')
      return (
        player.id !== s.bowler &&
        (s.bowling[player.id]?.balls ?? 0) < m.rules.maxBowler * 6 &&
        ((ownTeam?.squad.length ?? 0) < m.rules.size ||
          ownTeam?.squad.some((memberPlayer) => memberPlayer.id === player.id))
      );
    return (ownTeam?.squad.length ?? 0) < m.rules.size;
  });
  async function act(action) {
    const ok = await run(() => changeMatch(w.id, m.id, m.revision, action));
    if (!ok)
      setSheetError(
        'Could not save. Check your selections and the save error shown on the page. Close this sheet to refresh if another tab changed the match.',
      );
    return ok;
  }
  async function ball(e) {
    if (deliveryInFlight.current || frozen || s.done || pendingSelection) return false;
    deliveryInFlight.current = true;
    setSavingDelivery(true);
    try {
      const saved = await act({
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
      });
      if (saved) setSheet(null);
      return !!saved;
    } finally {
      deliveryInFlight.current = false;
      setSavingDelivery(false);
    }
  }
  function detail(extra = 'none') {
    setSheetError('');
    setDelivery({
      bat: 0,
      extra,
      extraRuns: 0,
      running: 0,
      boundary: false,
      kind: '',
      player: s.striker,
      survivorEnd: 'striker',
    });
    setSheet('advanced');
  }
  function quickExtra(extra) {
    setSheetError('');
    setDelivery({
      ...simpleDelivery(extra, 0),
      kind: '',
      player: s.striker,
      survivorEnd: 'striker',
    });
    setSheet({ type: 'simple-delivery' });
  }
  function chooseWicket(kind) {
    setSheetError('');
    setDelivery({
      bat: 0,
      extra: 'none',
      extraRuns: 0,
      running: 0,
      boundary: false,
      kind,
      player: s.striker,
      survivorEnd: 'striker',
    });
    setSheet({ type: 'wicket', kind });
  }
  async function recordWicket() {
    return ball({
      bat: 0,
      extra: 'none',
      extraRuns: 0,
      running: 0,
      wicket: {
        kind: delivery.kind,
        player: delivery.player,
        ...(delivery.kind === 'run out' ? { survivorEnd: delivery.survivorEnd } : {}),
      },
    });
  }
  function simpleDelivery(extra, runs) {
    if (extra === 'none')
      return {
        extra,
        runs,
        bat: runs,
        extraRuns: 0,
        running: runs === 4 || runs === 6 ? 0 : runs,
        boundary: runs === 4 || runs === 6,
      };
    if (extra === 'wide')
      return { extra, runs, bat: 0, extraRuns: runs, running: runs, boundary: false };
    if (extra === 'noBall')
      return {
        extra,
        runs,
        bat: runs,
        extraRuns: 0,
        running: runs === 4 || runs === 6 ? 0 : runs,
        boundary: runs === 4 || runs === 6,
      };
    return { extra, runs, bat: 0, extraRuns: runs, running: runs, boundary: false };
  }
  function selectDeliveryType(extra) {
    setDelivery((current) => ({
      ...current,
      ...simpleDelivery(extra, current.runs ?? 0),
      kind: '',
    }));
  }
  function selectDeliveryRuns(runs) {
    setDelivery((current) => ({
      ...current,
      ...simpleDelivery(current.extra, runs),
      kind: runs === 0 || current.kind === 'run out' ? current.kind : '',
    }));
  }
  function advancedDismissal() {
    set('kind', '');
    setSheet('advanced');
  }
  function recordSimpleDelivery() {
    const wicket = delivery.kind
      ? {
          kind: delivery.kind,
          player: delivery.player,
          ...(delivery.kind === 'run out' ? { survivorEnd: delivery.survivorEnd } : {}),
        }
      : null;
    return ball({
      bat: delivery.bat,
      extra: delivery.extra,
      extraRuns: delivery.extraRuns,
      running: delivery.running,
      boundary: delivery.boundary,
      wicket,
    });
  }
  function getDismissalKinds(extra = 'none') {
    if (extra === 'noBall' || s.freeHit) return ['run out'];
    if (extra === 'wide') return ['run out', 'stumped', 'hit wicket'];
    if (extra === 'bye' || extra === 'legBye') return ['run out'];
    return ['bowled', 'caught', 'lbw', 'run out', 'stumped', 'hit wicket'];
  }
  function undoLatest() {
    if (!latest || deliveryInFlight.current) return;
    deliveryInFlight.current = true;
    setSavingDelivery(true);
    act({ type: 'undo' }).finally(() => {
      deliveryInFlight.current = false;
      setSavingDelivery(false);
    });
  }
  function addPlayer(teamId = '', selection = null) {
    setPlayerTeamId(teamId);
    setNewPlayerName('');
    setSheetError('');
    setSheet({ type: 'player', teamId, selection });
  }
  async function savePlayer(event) {
    event.preventDefault();
    const targetTeam = sheet.teamId || playerTeamId;
    if (!targetTeam) {
      setSheetError('Choose which team this player represents.');
      return;
    }
    const saved = await run(() =>
      addMatchPlayer(w.id, m.id, m.revision, targetTeam, {
        name: newPlayerName,
        role: sheet.selection?.type === 'bowler' ? 'Bowler' : 'Batter',
        selection: sheet.selection,
      }),
    );
    if (saved && typeof saved === 'object') setSheet(null);
    else
      setSheetError(error || 'Could not add this player. Check the team and match player limit.');
  }
  async function selectPlayer(playerId) {
    const added = await run(() =>
      addMatchPlayer(w.id, m.id, m.revision, selectionTeamId, {
        playerId,
        selection: pendingSelection,
      }),
    );
    if (added && typeof added === 'object') setSelection('');
    else setSheetError(error || 'Could not select this player. Refresh the match and try again.');
  }
  const set = (k, v) => setDelivery((d) => ({ ...d, [k]: v }));
  const latest = [...events].reverse().find((e) => e.type === 'delivery');
  const dismissalKinds = getDismissalKinds();
  return (
    <>
      <div className="match-meta">
        <div className="row">
          <div>
            <strong>{m.teams.map((t) => t.name).join(' vs ')}</strong>
            <p>
              {m.date} · {m.venue || 'Local match'} · {m.rules.overs} overs
            </p>
          </div>
          {!frozen && <ReportActions match={m} states={states} />}
          {!frozen && (
            <Button secondary onClick={() => addPlayer()}>
              + Add player
            </Button>
          )}
        </div>
        {frozen && (
          <section className="completed-result">
            <p className="completed-result-label">Final result</p>
            <h2>{result(m, states)}</h2>
            <div className="completed-result-scores">
              {states.map((state, index) => {
                const side = index === 0 ? m.firstBat : 1 - m.firstBat;
                return (
                  <span key={side}>
                    <strong>{m.teams[side].name}</strong>
                    <b>
                      {state.runs}/{state.wickets}
                    </b>
                    <small>
                      {Math.floor(state.balls / 6)}.{state.balls % 6} overs
                    </small>
                  </span>
                );
              })}
            </div>
            <button className="text-button" onClick={() => setTab('Scorecard')}>
              <FileText size={17} /> View Scorecard
            </button>
            <ReportActions match={m} states={states} />
          </section>
        )}
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
          <div className="live-score-layout">
            <div className="live-score-details">
              <section className="score-panel">
                <div className="row">
                  <span className="pill">
                    INNINGS {inn.number} · {frozen ? 'FINAL' : 'LOCAL MATCH'}
                  </span>
                  <span>{s.freeHit ? 'FREE HIT' : `${m.rules.overs} OVERS`}</span>
                </div>
                <h2>{m.teams[battingSide].name}</h2>
                <div className="big-score" key={`${s.runs}-${s.wickets}-${s.balls}`}>
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
                    {[s.bowler ? s.bowling[s.bowler] : null].filter(Boolean).map((b) => (
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
            </div>
            <div className="live-score-actions">
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
                    {s.needBatter
                      ? s.wickets
                        ? 'Select next batsman'
                        : s.striker
                          ? 'Select non-striker'
                          : 'Who is batting? Select striker'
                      : s.balls
                        ? 'Over complete. Who is bowling next?'
                        : 'Who is bowling?'}
                  </h3>
                  <Select
                    label={
                      s.needBatter
                        ? s.striker
                          ? 'Select non-striker'
                          : 'Select striker'
                        : s.balls
                          ? 'Select next bowler'
                          : 'Select opening bowler'
                    }
                    value={selection}
                    onChange={(e) => setSelection(e.target.value)}
                    options={candidates.map(playerLabel)}
                  />
                  <Button disabled={!selection} onClick={() => selectPlayer(selection)}>
                    Confirm player
                  </Button>
                  {!frozen && (
                    <Button secondary onClick={() => addPlayer(selectionTeamId, pendingSelection)}>
                      + Add new {s.needBatter ? 'batsman' : 'bowler'}
                    </Button>
                  )}
                  {!candidates.length && (
                    <p className="help">No eligible existing players. Add a player to continue.</p>
                  )}
                </div>
              ) : (
                <section className="scoring-controls">
                  <div className="row">
                    <h3>Tap to score</h3>
                    <span className="help">
                      {savingDelivery
                        ? 'Saving…'
                        : `Next ball ${Math.floor(s.balls / 6)}.${(s.balls % 6) + 1}`}
                    </span>
                  </div>
                  <div className="run-buttons quick-score-buttons">
                    {[0, 1, 2, 3, 4, 6, 'W', 'Undo'].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={
                          value === 'W'
                            ? 'score-wicket'
                            : value === 'Undo'
                              ? 'score-undo'
                              : value === 4 || value === 6
                                ? 'score-boundary'
                                : ''
                        }
                        disabled={savingDelivery || (value === 'Undo' && !latest)}
                        onClick={() => {
                          if (value === 'W') {
                            chooseWicket(dismissalKinds[0]);
                          } else if (value === 'Undo') undoLatest();
                          else
                            ball({
                              bat: value,
                              running: value === 4 || value === 6 ? 0 : value,
                              boundary: value === 4 || value === 6,
                            });
                        }}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <p className="scoring-section-label">Extras</p>
                  <div className="extras-buttons quick-extra-buttons">
                    {[
                      ['Wide', 'wide'],
                      ['No-ball', 'noBall'],
                      ['Bye', 'bye'],
                      ['Leg Bye', 'legBye'],
                    ].map(([label, value]) => (
                      <button
                        key={value}
                        type="button"
                        disabled={savingDelivery}
                        onClick={() => quickExtra(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="advanced-delivery-link">
                    <Button secondary disabled={savingDelivery} onClick={() => detail()}>
                      Advanced delivery
                    </Button>
                  </div>
                </section>
              )}
            </div>
          </div>
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
          <h3>Correction history</h3>
          {data.audits
            .filter((a) => a.matchId === id)
            .map((a) => (
              <details key={a.id}>
                <summary>
                  {new Date(a.at).toLocaleString()} · {a.action === 'undo' ? 'Undo' : 'Correction'}{' '}
                  · {a.events.filter((e) => e.type === 'delivery').length} deliveries
                </summary>
                <ul className="correction-history">
                  {a.events
                    .filter((event) => event.type === 'delivery')
                    .map((event, index) => (
                      <li key={event.id}>
                        Delivery {index + 1}:{' '}
                        {(event.bat || 0) +
                          (event.extraRuns || 0) +
                          (event.extra === 'wide' || event.extra?.startsWith('noBall')
                            ? 1
                            : 0)}{' '}
                        run
                        {(event.bat || 0) +
                          (event.extraRuns || 0) +
                          (event.extra === 'wide' || event.extra?.startsWith('noBall') ? 1 : 0) ===
                        1
                          ? ''
                          : 's'}
                        {event.wicket ? ` · ${event.wicket.kind}` : ''}
                      </li>
                    ))}
                </ul>
              </details>
            ))}
        </>
      )}
      {sheet && (
        <Sheet
          title={
            sheet === 'advanced'
              ? 'Advanced delivery'
              : sheet?.type === 'wicket'
                ? 'Record wicket'
                : sheet?.type === 'simple-delivery'
                  ? 'Record delivery'
                  : sheet === 'chase'
                    ? 'Opening the chase'
                    : sheet.type === 'player'
                      ? sheet.selection?.type === 'batter'
                        ? 'Add a batsman'
                        : sheet.selection?.type === 'bowler'
                          ? 'Add a bowler'
                          : 'Add player to match'
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
          {sheet.type === 'player' && (
            <form onSubmit={savePlayer}>
              {!sheet.selection && (
                <Select
                  label="Team"
                  value={playerTeamId}
                  options={m.teams}
                  onChange={(event) => setPlayerTeamId(event.target.value)}
                />
              )}
              {sheet.selection && (
                <p className="help">
                  Adding this player to {m.teams.find((team) => team.id === sheet.teamId)?.name}.
                </p>
              )}
              <Field
                label="Player name"
                required
                maxLength={100}
                value={newPlayerName}
                onChange={(event) => setNewPlayerName(event.target.value)}
              />
              <Button>Add player</Button>
            </form>
          )}
          {sheet?.type === 'wicket' && (
            <div className="quick-sheet-content">
              <p className="help">
                Choose how the batter was dismissed.{' '}
                {s.freeHit ? 'A free hit allows run out only.' : ''}
              </p>
              <div className="wicket-options">
                {dismissalKinds.map((kind) => (
                  <button
                    type="button"
                    key={kind}
                    className={delivery.kind === kind ? 'selected' : ''}
                    onClick={() => set('kind', kind)}
                  >
                    {kind[0].toUpperCase() + kind.slice(1)}
                  </button>
                ))}
                <button type="button" onClick={advancedDismissal}>
                  Other
                </button>
              </div>
              <Select
                label="Dismissed batter"
                value={delivery.player}
                onChange={(event) => set('player', event.target.value)}
                options={[s.striker, s.nonStriker]
                  .filter(Boolean)
                  .map((playerId) => playerLabel(s.batting[playerId]))}
              />
              {delivery.kind === 'run out' && (
                <Select
                  label="Which end does the not-out batter take?"
                  value={delivery.survivorEnd}
                  onChange={(event) => set('survivorEnd', event.target.value)}
                  options={[
                    { id: 'striker', name: 'Striker end' },
                    { id: 'nonStriker', name: 'Non-striker end' },
                  ]}
                />
              )}
              <Button
                disabled={savingDelivery || !delivery.kind || !delivery.player}
                onClick={recordWicket}
              >
                {savingDelivery ? 'Saving…' : 'Record wicket'}
              </Button>
              <Button secondary onClick={() => detail()}>
                Advanced dismissal details
              </Button>
            </div>
          )}
          {sheet?.type === 'simple-delivery' && (
            <div className="quick-sheet-content">
              <p className="simple-field-label">Delivery Type</p>
              <div className="delivery-type-options">
                {[
                  ['none', 'Normal'],
                  ['wide', 'Wide'],
                  ['noBall', 'No Ball'],
                  ['bye', 'Bye'],
                  ['legBye', 'Leg Bye'],
                ].map(([type, label]) => (
                  <button
                    type="button"
                    key={type}
                    className={delivery.extra === type ? 'selected' : ''}
                    aria-pressed={delivery.extra === type}
                    onClick={() => selectDeliveryType(type)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="simple-field-label">
                {delivery.extra === 'wide'
                  ? 'Completed runs'
                  : delivery.extra === 'noBall'
                    ? 'Runs off the bat'
                    : delivery.extra === 'bye'
                      ? 'Completed byes'
                      : delivery.extra === 'legBye'
                        ? 'Completed leg byes'
                        : 'Runs'}
              </p>
              <div className="delivery-run-options">
                {[0, 1, 2, 3, 4, 6].map((runs) => (
                  <button
                    type="button"
                    key={runs}
                    className={delivery.runs === runs ? 'selected' : ''}
                    aria-pressed={delivery.runs === runs}
                    onClick={() => selectDeliveryRuns(runs)}
                  >
                    {runs}
                  </button>
                ))}
                <button type="button" onClick={() => setSheet('advanced')}>
                  Other
                </button>
              </div>
              <div className="simple-total" aria-live="polite">
                Team total for this ball:{' '}
                <strong>
                  {delivery.runs +
                    (delivery.extra === 'wide' || delivery.extra === 'noBall' ? 1 : 0)}
                </strong>
              </div>
              <label className="simple-wicket-toggle">
                <input
                  type="checkbox"
                  checked={!!delivery.kind}
                  onChange={(event) => {
                    if (event.target.checked) {
                      set('kind', getDismissalKinds(delivery.extra)[0]);
                    } else set('kind', '');
                  }}
                />
                Wicket
              </label>
              {delivery.kind && (
                <>
                  <div className="wicket-options">
                    {getDismissalKinds(delivery.extra)
                      .filter((kind) => delivery.runs === 0 || kind === 'run out')
                      .map((kind) => (
                        <button
                          type="button"
                          key={kind}
                          className={delivery.kind === kind ? 'selected' : ''}
                          onClick={() => set('kind', kind)}
                        >
                          {kind[0].toUpperCase() + kind.slice(1)}
                        </button>
                      ))}
                    <button type="button" onClick={advancedDismissal}>
                      Other
                    </button>
                  </div>
                  <Select
                    label="Dismissed batter"
                    value={delivery.player}
                    onChange={(event) => set('player', event.target.value)}
                    options={[s.striker, s.nonStriker]
                      .filter(Boolean)
                      .map((playerId) => playerLabel(s.batting[playerId]))}
                  />
                  {delivery.kind === 'run out' && (
                    <Select
                      label="Which end does the not-out batter take?"
                      value={delivery.survivorEnd}
                      onChange={(event) => set('survivorEnd', event.target.value)}
                      options={[
                        { id: 'striker', name: 'Striker end' },
                        { id: 'nonStriker', name: 'Non-striker end' },
                      ]}
                    />
                  )}
                </>
              )}
              <Button
                disabled={savingDelivery || (!!delivery.kind && !delivery.player)}
                onClick={recordSimpleDelivery}
              >
                {savingDelivery ? 'Saving…' : 'Record Ball'}
              </Button>
              <Button secondary disabled={savingDelivery} onClick={() => setSheet('advanced')}>
                Advanced
              </Button>
            </div>
          )}
          {sheet === 'advanced' && (
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
                label="Runs taken"
                type="number"
                min="0"
                max="6"
                value={delivery.running}
                onChange={(e) => set('running', Number(e.target.value))}
              />
              <p className="help">Enter runs completed by the batters, not penalties.</p>
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
                options={[
                  { id: '', name: 'No wicket' },
                  ...getDismissalKinds(delivery.extra).concat(
                    getDismissalKinds(delivery.extra).includes('hit wicket') ? [] : ['hit wicket'],
                  ),
                ]}
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
              <Button disabled={savingDelivery}>
                {savingDelivery ? 'Saving…' : 'Save advanced delivery'}
              </Button>
            </form>
          )}
          {sheet === 'chase' && (
            <>
              <p>
                Target {states[0].runs + 1}. {m.teams[1 - m.firstBat].name} to bat. Choose or create
                opening players on the scoring screen.
              </p>
              <Button
                onClick={async () => {
                  if (
                    await act({
                      type: 'startChase',
                      opening: { striker: '', nonStriker: '', bowler: '' },
                    })
                  )
                    setSheet(null);
                }}
              >
                Start second innings
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
