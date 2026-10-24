'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createMatch, saveRecord } from '../lib/db';
import { validateSetup } from '../lib/engine';
import { Button, Field, Select, playerLabel } from './ui';

export default function Setup({ w, data, run, setError }) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const saved = params.has('draft')
      ? data.drafts.find((d) => d.id === params.get('draft'))
      : !params.has('new')
        ? data.drafts[0]
        : null;
    return saved
      ? { teamNameA: '', teamNameB: '', ...saved, step: Math.min(saved.step, 1) }
      : {
          id: crypto.randomUUID(),
          step: 0,
          teamA: '',
          teamB: '',
          teamNameA: '',
          teamNameB: '',
          squadA: [],
          squadB: [],
          rules: { ...w.rules },
          venue: '',
          date: new Date().toISOString().slice(0, 10),
          toss: '0',
          decision: 'bat',
        };
  });
  const schedule = !!draft.scheduleForLater;
  const steps = ['Choose teams', 'Match rules & toss'];
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const selectedTeams = [draft.teamA, draft.teamB].map((id) =>
    data.teams.find((team) => team.id === id),
  );
  const firstBat = draft.decision === 'bat' ? Number(draft.toss) : 1 - Number(draft.toss);
  const squads = [draft.squadA, draft.squadB].map((ids, side) => {
    const team = selectedTeams[side];
    return data.players.filter(
      (player) =>
        ids.includes(player.id) &&
        data.memberships.some(
          (membership) => membership.playerId === player.id && membership.teamId === team?.id,
        ),
    );
  });

  async function addTeam(side) {
    const key = `team${side}`;
    const nameKey = `teamName${side}`;
    const name = draft[nameKey].trim();
    if (!name) {
      setError('Enter a team name first.');
      return;
    }
    const saved = await run(() => saveRecord(w.id, 'teams', { name }));
    if (saved && typeof saved === 'object') {
      setDraft((current) => ({
        ...current,
        [key]: saved.id,
        [`squad${side}`]: [],
        striker: '',
        nonStriker: '',
        bowler: '',
      }));
      setError('');
    }
  }

  async function next() {
    try {
      if (!selectedTeams[0] || !selectedTeams[1] || draft.teamA === draft.teamB)
        throw new Error('Choose or create two different teams.');
      if (draft.step === 0) {
        const updated = { ...draft, step: 1 };
        if (await run(() => saveRecord(w.id, 'drafts', updated))) {
          setDraft(updated);
          window.history.replaceState(null, '', `/app/setup/?draft=${draft.id}`);
        }
        return;
      }

      if (schedule && !(Date.parse(draft.scheduledAt) > Date.now()))
        throw new Error('Choose a future date and time.');
      const match = {
        teams: selectedTeams.map((team, index) => ({ ...team, squad: squads[index] })),
        rules: draft.rules,
        venue: draft.venue.trim(),
        date: draft.date,
        scheduledAt: schedule ? new Date(draft.scheduledAt).toISOString() : null,
        firstBat: schedule ? 0 : firstBat,
        toss: schedule ? null : draft.toss,
        decision: schedule ? null : draft.decision,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      if (schedule && !(Date.parse(match.scheduledAt) > Date.now()))
        throw new Error('Choose a future date and time.');
      validateSetup(match);
      const created = await run(() =>
        createMatch(w.id, match, { striker: '', nonStriker: '', bowler: '' }, draft.id),
      );
      if (created && typeof created === 'object') router.push(`/app/match/?id=${created.id}`);
    } catch (error) {
      setError(error.message);
    }
  }

  return (
    <div className="setup-layout">
      <div className="stepper">
        {steps.map((step, index) => (
          <div key={step} className={index <= draft.step ? 'current' : ''}>
            <span>{index + 1}</span>
            <small>{step}</small>
          </div>
        ))}
      </div>
      <section className="card setup-card">
        <p className="eyebrow">STEP {draft.step + 1} OF 2</p>
        <h2>{steps[draft.step]}</h2>
        {draft.step === 0 ? (
          <>
            {['A', 'B'].map((side, index) => {
              const team = selectedTeams[index];
              return (
                <div className="setup-team" key={side}>
                  <Select
                    label={`Team ${side}`}
                    value={draft[`team${side}`]}
                    options={data.teams.filter((item) => !item.archived)}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [`team${side}`]: event.target.value,
                        [`squad${side}`]: [],
                      }))
                    }
                  />
                  <div className="team-create-row">
                    <Field
                      label={`Or create Team ${side}`}
                      value={draft[`teamName${side}`]}
                      maxLength={100}
                      onChange={(event) => set(`teamName${side}`, event.target.value)}
                    />
                    <Button secondary onClick={() => addTeam(side)}>
                      Create team
                    </Button>
                  </div>
                  {team && (
                    <details className="optional-squad">
                      <summary>Add players before match (optional)</summary>
                      <p className="help">You can also add players from the scoring screen.</p>
                      {data.players
                        .filter(
                          (player) =>
                            !player.archived &&
                            data.memberships.some(
                              (membership) =>
                                membership.playerId === player.id && membership.teamId === team.id,
                            ),
                        )
                        .map((player) => (
                          <label className="check" key={player.id}>
                            <input
                              type="checkbox"
                              checked={draft[`squad${side}`].includes(player.id)}
                              onChange={(event) =>
                                set(
                                  `squad${side}`,
                                  event.target.checked
                                    ? [...draft[`squad${side}`], player.id]
                                    : draft[`squad${side}`].filter((id) => id !== player.id),
                                )
                              }
                            />
                            {playerLabel(player).name}
                          </label>
                        ))}
                      {!data.memberships.some((membership) => membership.teamId === team.id) && (
                        <p className="help">
                          No players are assigned yet. <Link href="/app/players/">Add players</Link>{' '}
                          or continue and create them during the match.
                        </p>
                      )}
                    </details>
                  )}
                </div>
              );
            })}
            <p className="help">
              Player lists and playing XIs are optional. Crease will ask for batters and a bowler
              when you start scoring.
            </p>
          </>
        ) : (
          <>
            <div className="two-col">
              {[
                ['overs', 'Overs per innings', 50],
                ['size', 'Players per side', 11],
                ['maxBowler', 'Maximum overs per bowler', 50],
              ].map(([key, label, max]) => (
                <Field
                  key={key}
                  label={label}
                  type="number"
                  min={key === 'size' ? 2 : 1}
                  max={max}
                  value={draft.rules[key]}
                  onChange={(event) =>
                    set('rules', { ...draft.rules, [key]: Number(event.target.value) })
                  }
                />
              ))}
            </div>
            <Field
              label="Venue (optional)"
              maxLength={100}
              value={draft.venue}
              onChange={(event) => set('venue', event.target.value)}
            />
            <Field
              label="Match date"
              type="date"
              required
              value={draft.date}
              onChange={(event) => set('date', event.target.value)}
            />
            {draft.step === 1 && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={schedule}
                  onChange={(e) => set('scheduleForLater', e.target.checked)}
                />
                Schedule for later
              </label>
            )}
            {schedule && (
              <Field
                label="Start date and time"
                type="datetime-local"
                value={draft.scheduledAt || ''}
                onChange={(e) => set('scheduledAt', e.target.value)}
              />
            )}
            {schedule && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.rules.allowEarlyStart !== false}
                  onChange={(e) =>
                    set('rules', { ...draft.rules, allowEarlyStart: e.target.checked })
                  }
                />
                Allow the owner to start early
              </label>
            )}
            {!schedule && (
              <>
                <Select
                  label="Toss winner"
                  value={draft.toss}
                  onChange={(event) => set('toss', event.target.value)}
                  options={selectedTeams.map((team, index) => ({
                    id: String(index),
                    name: team.name,
                  }))}
                />
                <Select
                  label="Decision"
                  value={draft.decision}
                  onChange={(event) => set('decision', event.target.value)}
                  options={[
                    { id: 'bat', name: 'Bat first' },
                    { id: 'field', name: 'Field first' },
                  ]}
                />
              </>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={draft.rules.freeHit}
                onChange={(event) =>
                  set('rules', { ...draft.rules, freeHit: event.target.checked })
                }
              />
              Free hit after every no-ball
            </label>
            <p className="help">
              Six-ball overs. One-run wide and no-ball penalties. Two batters at the crease. You can
              add players at any time, up to the configured team size.
            </p>
            <div className="notice">
              <strong>{selectedTeams.map((team) => team.name).join(' vs ')}</strong>
              <p>
                {draft.rules.overs} overs · up to {draft.rules.size} players per side ·{' '}
                {schedule
                  ? 'Toss and lineup saved before play'
                  : selectedTeams[firstBat].name + ' bats first'}
              </p>
            </div>
          </>
        )}
        <div className="setup-actions">
          {draft.step > 0 && (
            <Button secondary onClick={() => set('step', 0)}>
              Back
            </Button>
          )}
          <Button
            secondary
            onClick={() =>
              run(() => saveRecord(w.id, 'drafts', draft)).then((saved) => {
                if (saved) window.history.replaceState(null, '', `/app/setup/?draft=${draft.id}`);
              })
            }
          >
            Save draft
          </Button>
          <Button onClick={next}>
            {draft.step === 1 ? (schedule ? 'Schedule match' : 'Start match') : 'Continue'} →
          </Button>
        </div>
      </section>
    </div>
  );
}
