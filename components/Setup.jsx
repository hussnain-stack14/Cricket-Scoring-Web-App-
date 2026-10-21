'use client';
import { useState } from 'react';
import { createMatch, saveRecord, uuid } from '../lib/db';
import { validateSetup } from '../lib/engine';
import { Button, Field, Select, playerLabel } from './ui';
export default function Setup({ w, data, run, setError }) {
  const [draft, setDraft] = useState(
    () =>
      data.drafts[0] || {
        id: uuid(),
        step: 0,
        teamA: '',
        teamB: '',
        squadA: [],
        squadB: [],
        rules: { ...w.rules },
        venue: '',
        date: new Date().toISOString().slice(0, 10),
        toss: '0',
        decision: 'bat',
        striker: '',
        nonStriker: '',
        bowler: '',
      },
  );
  const steps = ['Teams & squads', 'Match rules', 'Toss', 'Opening players'];
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const firstBat = draft.decision === 'bat' ? Number(draft.toss) : 1 - Number(draft.toss);
  const squads = [draft.squadA, draft.squadB].map((ids) =>
    data.players.filter((p) => ids.includes(p.id)),
  );
  const teams = [draft.teamA, draft.teamB].map((id, i) => ({
    ...data.teams.find((t) => t.id === id),
    squad: squads[i],
  }));
  const match = {
    teams,
    rules: draft.rules,
    venue: draft.venue,
    date: draft.date,
    firstBat,
    toss: draft.toss,
    decision: draft.decision,
  };
  async function next() {
    try {
      if (draft.step === 0) {
        if (!draft.teamA || !draft.teamB || draft.teamA === draft.teamB)
          throw new Error('Select two different teams.');
        if (squads.some((s) => s.length < 2))
          throw new Error('Select at least two players for each side.');
        if (draft.squadA.some((id) => draft.squadB.includes(id)))
          throw new Error('A player cannot play on both sides.');
      }
      if (draft.step >= 1) validateSetup(match);
      if (draft.step === 3) {
        await run(async () => {
          const m = await createMatch(w.id, match, {
            striker: draft.striker,
            nonStriker: draft.nonStriker,
            bowler: draft.bowler,
          });
          window.location.assign(`/match/?id=${m.id}`);
        });
        return;
      }
      const updated = { ...draft, step: draft.step + 1 };
      if (await run(() => saveRecord(w.id, 'drafts', updated))) setDraft(updated);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <div className="stepper">
        {steps.map((s, i) => (
          <div key={s} className={i <= draft.step ? 'current' : ''}>
            <span>{i + 1}</span>
            <small>{s}</small>
          </div>
        ))}
      </div>
      <section className="card">
        <p className="eyebrow">STEP {draft.step + 1} OF 4</p>
        <h2>{steps[draft.step]}</h2>
        {draft.step === 0 && (
          <>
            {['A', 'B'].map((side, index) => (
              <div key={side} className="setup-team">
                <Select
                  label={`Team ${side}`}
                  value={draft[`team${side}`]}
                  options={data.teams.filter((t) => !t.archived)}
                  onChange={(e) => {
                    setDraft((d) => ({
                      ...d,
                      [`team${side}`]: e.target.value,
                      [`squad${side}`]: [],
                      striker: '',
                      nonStriker: '',
                      bowler: '',
                    }));
                  }}
                />
                <p className="help">Playing squad · {draft[`squad${side}`].length} selected</p>
                {data.players
                  .filter(
                    (p) =>
                      !p.archived &&
                      data.memberships.some(
                        (m) => m.playerId === p.id && m.teamId === draft[`team${side}`],
                      ),
                  )
                  .map((p) => (
                    <label className="check" key={p.id}>
                      <input
                        type="checkbox"
                        checked={draft[`squad${side}`].includes(p.id)}
                        onChange={(e) =>
                          set(
                            `squad${side}`,
                            e.target.checked
                              ? [...draft[`squad${side}`], p.id]
                              : draft[`squad${side}`].filter((id) => id !== p.id),
                          )
                        }
                      />
                      {p.name} <small>{p.id.slice(0, 6)}</small>
                    </label>
                  ))}
              </div>
            ))}
            {data.teams.length < 2 && (
              <p className="notice">
                First <a href="/players/">add players</a> and{' '}
                <a href="/teams/">create two teams with squads</a>.
              </p>
            )}
          </>
        )}
        {draft.step === 1 && (
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
                  onChange={(e) => set('rules', { ...draft.rules, [key]: Number(e.target.value) })}
                />
              ))}
            </div>
            <Field
              label="Venue (optional)"
              maxLength={100}
              value={draft.venue}
              onChange={(e) => set('venue', e.target.value)}
            />
            <Field
              label="Match date"
              type="date"
              required
              value={draft.date}
              onChange={(e) => set('date', e.target.value)}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={draft.rules.freeHit}
                onChange={(e) => set('rules', { ...draft.rules, freeHit: e.target.checked })}
              />
              Free hit after every no-ball
            </label>
            <p className="help">
              Six-ball overs. One-run wide and no-ball penalties. Standard two-batter play. No
              consecutive overs by one bowler.
            </p>
          </>
        )}
        {draft.step === 2 && (
          <>
            <Select
              label="Toss winner"
              value={draft.toss}
              onChange={(e) => set('toss', e.target.value)}
              options={teams.map((t, i) => ({ id: String(i), name: t.name }))}
            />
            <Select
              label="Decision"
              value={draft.decision}
              onChange={(e) => set('decision', e.target.value)}
              options={[
                { id: 'bat', name: 'Bat first' },
                { id: 'field', name: 'Field first' },
              ]}
            />
            <div className="notice">{teams[firstBat]?.name} will bat first.</div>
          </>
        )}
        {draft.step === 3 && (
          <>
            <Select
              label="Opening striker"
              value={draft.striker}
              options={squads[firstBat].map(playerLabel)}
              onChange={(e) => set('striker', e.target.value)}
            />
            <Select
              label="Opening non-striker"
              value={draft.nonStriker}
              options={squads[firstBat].map(playerLabel)}
              onChange={(e) => set('nonStriker', e.target.value)}
            />
            <Select
              label="Opening bowler"
              value={draft.bowler}
              options={squads[1 - firstBat].map(playerLabel)}
              onChange={(e) => set('bowler', e.target.value)}
            />
            <div className="notice">
              <strong>{teams.map((t) => t.name).join(' vs ')}</strong>
              <p>
                {draft.rules.overs} overs · {draft.rules.size} players per side ·{' '}
                {draft.venue || 'No venue set'}
              </p>
              <p>
                {draft.date} · Maximum {draft.rules.maxBowler} overs per bowler
              </p>
            </div>
          </>
        )}
      </section>
      <div className="setup-actions">
        {draft.step > 0 && (
          <Button secondary onClick={() => set('step', draft.step - 1)}>
            Back
          </Button>
        )}
        <Button secondary onClick={() => run(() => saveRecord(w.id, 'drafts', draft))}>
          Save draft
        </Button>
        <Button onClick={next}>{draft.step === 3 ? 'Create match' : 'Continue'} →</Button>
      </div>
    </>
  );
}
