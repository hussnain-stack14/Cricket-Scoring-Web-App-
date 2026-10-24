'use client';
import { useEffect, useRef, useState } from 'react';
import { addMatchPlayer, changeMatch } from '../lib/db';
import { battingFirst, scheduledTime } from '../lib/matchLifecycle';
import { Button, Field, Select, Sheet } from './ui';
import MatchHeader from './MatchHeader';

export default function PreMatch({ match, w, data, run, error, session }) {
  const [setup, setSetup] = useState(match.preMatch || { step: 0 });
  const [saving, setSaving] = useState(false);
  const [early, setEarly] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [schedule, setSchedule] = useState('');
  const [dialog, setDialog] = useState(null);
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState(match.teams[0].id);
  const revision = useRef(match.revision);
  const startId = useRef(crypto.randomUUID());
  const inFlight = useRef(false);
  useEffect(() => {
    revision.current = match.revision;
    setSetup(match.preMatch || { step: 0 });
  }, [match.revision]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const owner = !session || session.role === 'owner';
  const canEdit = !session || ['owner', 'scorer'].includes(session.role);
  const due = scheduledTime(match) <= now;
  const cancelled = match.status === 'cancelled';
  const canStart = due || (owner && early && match.rules.allowEarlyStart !== false);
  const firstBat = [0, 1].includes(setup.toss) && setup.decision ? battingFirst(setup) : 0;
  const roster = (side) =>
    data.players.filter(
      (p) =>
        !p.archived &&
        data.memberships.some((r) => r.teamId === match.teams[side].id && r.playerId === p.id) &&
        !match.teams[1 - side].squad.some((q) => q.id === p.id),
    );
  const playerName = (id) => data.players.find((p) => p.id === id)?.name || 'Not selected';
  async function save(next) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setSaving(true);
    setSetup(next);
    try {
      const result = await run(() =>
        changeMatch(w.id, match.id, revision.current, { type: 'preMatch', setup: next }),
      );
      if (result) revision.current = result.revision;
      else setSetup(match.preMatch || { step: 0 });
      return result;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      await run(() =>
        changeMatch(w.id, match.id, revision.current, {
          type: 'start',
          setup,
          startId: startId.current,
          earlyOverride: early,
        }),
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  return (
    <div className="match-centre prematch-centre">
      <MatchHeader match={match} w={w} run={run} error={error} session={session} />
      {cancelled ? (
        <section className="card">
          <h3>Match cancelled</h3>
          <p>This fixture is kept for your records.</p>
        </section>
      ) : (
        <>
          <section className="schedule-summary card">
            <div>
              <strong>{due ? 'Ready to start' : 'Scheduled'}</strong>
              <p>
                {new Date(match.scheduledAt || match.date).toLocaleString([], {
                  timeZone: match.timeZone || undefined,
                })}{' '}
                <small>{match.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone}</small>
              </p>
            </div>
            {canEdit && (
              <details>
                <summary>Reschedule or cancel</summary>
                <Field
                  label="Reschedule start"
                  type="datetime-local"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                />
                <div className="actions">
                  <Button
                    secondary
                    disabled={!schedule || saving}
                    onClick={() =>
                      run(() =>
                        changeMatch(w.id, match.id, revision.current, {
                          type: 'reschedule',
                          scheduledAt: new Date(schedule).toISOString(),
                        }),
                      )
                    }
                  >
                    Save schedule
                  </Button>
                  <Button secondary danger onClick={() => setDialog('cancel')}>
                    Cancel match
                  </Button>
                </div>
              </details>
            )}
          </section>
          {canEdit ? (
            <section className="card prematch-setup" aria-busy={saving}>
              <ol className="prematch-steps" aria-label="Pre-match progress">
                {['Toss', 'Decision', 'Lineup', 'Review'].map((label, index) => (
                  <li key={label} aria-current={setup.step === index ? 'step' : undefined}>
                    <span>{index + 1}</span>
                    {label}
                  </li>
                ))}
              </ol>
              {setup.step === 0 && (
                <>
                  <h3>Who won the toss?</h3>
                  <div className="toss-options">
                    {match.teams.map((team, index) => (
                      <button
                        type="button"
                        className={setup.toss === index ? 'selected' : ''}
                        aria-pressed={setup.toss === index}
                        disabled={saving}
                        key={team.id}
                        onClick={() =>
                          save({
                            ...setup,
                            toss: index,
                            decision: null,
                            striker: '',
                            nonStriker: '',
                            bowler: '',
                            step: 1,
                          })
                        }
                      >
                        {team.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {setup.step === 1 && (
                <>
                  <h3>What did they choose?</h3>
                  <p>{match.teams[setup.toss]?.name} won the toss.</p>
                  <div className="toss-options">
                    {[
                      ['bat', 'Bat first'],
                      ['field', 'Bowl first'],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        disabled={saving}
                        aria-pressed={setup.decision === value}
                        className={setup.decision === value ? 'selected' : ''}
                        onClick={() =>
                          save({
                            ...setup,
                            decision: value,
                            striker: '',
                            nonStriker: '',
                            bowler: '',
                            step: 2,
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {setup.step === 2 && (
                <>
                  <h3>Opening lineup</h3>
                  <p>
                    <strong>{match.teams[firstBat].name}</strong> bat first. Up to{' '}
                    {match.rules.size} players per side.
                  </p>
                  <div className="prematch-lineup">
                    <Select
                      label="Opening striker"
                      value={setup.striker || ''}
                      disabled={saving}
                      options={roster(firstBat).filter((p) => p.id !== setup.nonStriker)}
                      onChange={(e) => save({ ...setup, striker: e.target.value })}
                    />
                    <Select
                      label="Opening non-striker"
                      value={setup.nonStriker || ''}
                      disabled={saving}
                      options={roster(firstBat).filter((p) => p.id !== setup.striker)}
                      onChange={(e) => save({ ...setup, nonStriker: e.target.value })}
                    />
                    <Select
                      label="Opening bowler"
                      value={setup.bowler || ''}
                      disabled={saving}
                      options={roster(1 - firstBat)}
                      onChange={(e) => save({ ...setup, bowler: e.target.value })}
                    />
                  </div>
                  <div className="actions">
                    <Button
                      disabled={saving || !setup.striker || !setup.nonStriker || !setup.bowler}
                      onClick={() => save({ ...setup, step: 3 })}
                    >
                      Review match
                    </Button>
                    <Button secondary compact onClick={() => setDialog('player')}>
                      Add player
                    </Button>
                  </div>
                </>
              )}
              {setup.step === 3 && (
                <>
                  <h3>Ready for the first ball</h3>
                  <dl className="prematch-review">
                    <div>
                      <dt>Format</dt>
                      <dd>
                        {match.format || 'Limited overs'} · {match.rules.overs} overs ·{' '}
                        {match.rules.size} players per side
                      </dd>
                    </div>
                    <div>
                      <dt>Toss</dt>
                      <dd>
                        {match.teams[setup.toss]?.name} chose to{' '}
                        {setup.decision === 'bat' ? 'bat' : 'bowl'} first
                      </dd>
                    </div>
                    <div>
                      <dt>Batting</dt>
                      <dd>{match.teams[firstBat].name}</dd>
                    </div>
                    <div>
                      <dt>Bowling</dt>
                      <dd>{match.teams[1 - firstBat].name}</dd>
                    </div>
                    <div>
                      <dt>Openers</dt>
                      <dd>
                        {playerName(setup.striker)} & {playerName(setup.nonStriker)}
                      </dd>
                    </div>
                    <div>
                      <dt>Opening bowler</dt>
                      <dd>{playerName(setup.bowler)}</dd>
                    </div>
                  </dl>
                  {!due && (
                    <p className="help">
                      Scheduled for{' '}
                      {new Date(match.scheduledAt).toLocaleString([], {
                        timeZone: match.timeZone || undefined,
                      })}
                      . Setup is saved; the match stays scheduled until you start it.
                    </p>
                  )}
                  {!due && owner && match.rules.allowEarlyStart !== false && (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={early}
                        onChange={(e) => setEarly(e.target.checked)}
                      />
                      Allow early start for this match
                    </label>
                  )}
                  <Button disabled={!canStart || saving} onClick={start}>
                    {saving ? 'Saving...' : 'Start Scoring'}
                  </Button>
                </>
              )}
              {setup.step > 0 && (
                <Button
                  secondary
                  compact
                  disabled={saving}
                  onClick={() => save({ ...setup, step: setup.step - 1 })}
                >
                  Back
                </Button>
              )}
              <p className="prematch-save-status" role="status">
                {saving
                  ? 'Saving setup...'
                  : error
                    ? 'Setup could not be saved. Please retry.'
                    : 'Setup saved on this device'}
              </p>
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
            </section>
          ) : (
            <p className="notice">A scorer or owner can prepare and start this match.</p>
          )}
        </>
      )}
      {dialog && (
        <Sheet
          title={dialog === 'cancel' ? 'Cancel this match?' : 'Add player'}
          close={() => setDialog(null)}
        >
          {error && <p role="alert">{error}</p>}
          {dialog === 'cancel' ? (
            <>
              <p>{match.teams.map((t) => t.name).join(' vs ')} will be marked cancelled.</p>
              <Button
                danger
                onClick={async () => {
                  if (
                    await run(() =>
                      changeMatch(w.id, match.id, revision.current, { type: 'cancel' }),
                    )
                  )
                    setDialog(null);
                }}
              >
                Confirm cancellation
              </Button>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const result = await run(() =>
                  addMatchPlayer(w.id, match.id, revision.current, teamId, { name }),
                );
                if (result) {
                  revision.current = result.revision;
                  setDialog(null);
                  setName('');
                }
              }}
            >
              <Select
                label="Player team"
                value={teamId}
                options={match.teams}
                onChange={(e) => setTeamId(e.target.value)}
              />
              <Field
                label="Player name"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button>Add player</Button>
            </form>
          )}
        </Sheet>
      )}
    </div>
  );
}
