'use client';
import { useState } from 'react';
import {
  clearWorkspace,
  exportBackup,
  importBackup,
  saveWorkspace,
  validateBackup,
} from '../lib/db';
import { Button, Field, Sheet } from './ui';
export default function Settings({ w, data, run, setError, offline }) {
  const [name, setName] = useState(w.name),
    [rules, setRules] = useState(w.rules),
    [backup, setBackup] = useState(null),
    [confirm, setConfirm] = useState(false),
    [erase, setErase] = useState(''),
    [storage, setStorage] = useState(''),
    [localError, setLocalError] = useState('');
  async function download() {
    await run(async () => {
      const b = await exportBackup(w);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `crease-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      await saveWorkspace({ ...w, lastExport: new Date().toISOString() });
    });
  }
  async function preview(file) {
    try {
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) throw new Error('Backup exceeds the 20 MB limit.');
      const b = validateBackup(JSON.parse(await file.text()));
      setBackup(b);
      setLocalError('');
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <section className="card">
        <h2>Your workspace</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveWorkspace({ ...w, name: name.trim() }));
          }}
        >
          <Field
            label="Local scorer name"
            value={name}
            required
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
          <Button>Save name</Button>
        </form>
        <p className="help">
          Workspace {w.id.slice(0, 8)}. This is a local display name, not a secure login.
        </p>
      </section>
      <section className="card">
        <h2>Offline & installation</h2>
        <p role="status">{offline.message}</p>
        <Button secondary onClick={offline.retry}>
          Retry offline preparation
        </Button>
        {offline.install && <Button onClick={offline.install}>Install Crease</Button>}
        <p className="help">
          Android / Chromium: use Install in your browser menu. iPhone / iPad: open in Safari, tap
          Share, then Add to Home Screen. Prepare offline while connected before leaving for the
          ground.
        </p>
        {offline.update && (
          <div className="notice">
            <p>
              An update is ready. Finish scoring and save your drafts before applying it. Other open
              tabs must also finish scoring.
            </p>
            <Button
              disabled={data.matches.some((m) => m.status === 'live')}
              onClick={offline.applyUpdate}
            >
              Apply update & reload
            </Button>
            {data.matches.some((m) => m.status === 'live') && (
              <p className="help">Available after your live matches are finalized.</p>
            )}
          </div>
        )}
      </section>
      <section className="card">
        <h2>Storage & backup</h2>
        <p>
          Records live only in this browser profile. Clearing browser data, storage eviction, or
          losing this device can remove them. Export regularly and keep the file somewhere safe.
        </p>
        <p className="help">
          Last export requested: {w.lastExport ? new Date(w.lastExport).toLocaleString() : 'Never'}.
          This is not ongoing backup protection; check that your downloaded file is saved.
        </p>
        <div className="actions">
          <Button onClick={download}>Export JSON backup</Button>
          <label className="button secondary">
            Import backup
            <input
              className="file-input"
              type="file"
              accept="application/json,.json"
              aria-label="Import backup"
              onChange={(e) => {
                preview(e.target.files[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <Button
          secondary
          onClick={async () => {
            const persisted = await navigator.storage?.persist?.();
            const estimate = await navigator.storage?.estimate?.();
            setStorage(
              `${persisted ? 'Persistent storage granted.' : 'Persistent storage unavailable or not granted.'} Using approximately ${Math.round((estimate?.usage || 0) / 1024)} KB.`,
            );
          }}
        >
          Request persistent storage
        </Button>
        <p role="status" className="help">
          {storage}
        </p>
      </section>
      <section className="card">
        <h2>Default match rules</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (rules.maxBowler > rules.overs || rules.maxBowler * rules.size < rules.overs) {
              setError('Bowler limit must cover the innings and not exceed match overs.');
              return;
            }
            run(() => saveWorkspace({ ...w, rules }));
          }}
        >
          {[
            ['overs', 'Overs per innings', 1, 50],
            ['size', 'Players per side', 2, 11],
            ['maxBowler', 'Maximum overs per bowler', 1, 50],
          ].map(([key, label, min, max]) => (
            <Field
              key={key}
              label={label}
              required
              type="number"
              min={min}
              max={max}
              value={rules[key]}
              onChange={(e) => setRules({ ...rules, [key]: Number(e.target.value) })}
            />
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={rules.freeHit}
              onChange={(e) => setRules({ ...rules, freeHit: e.target.checked })}
            />
            Free hit after every no-ball
          </label>
          <Button>Save default rules</Button>
        </form>
      </section>
      <section className="card">
        <h2>About Crease</h2>
        <p>
          Your game, recorded. Six-ball limited-overs cricket with local teams, match history and
          statistics. No cloud account or cross-device synchronization.
        </p>
        <p className="help">
          Supports bowled, caught, LBW, stumped, hit wicket and run out. No retired batters, DLS,
          penalty-run incidents, super overs or mid-over bowler substitutions. Full rule contract is
          in the project documentation.
        </p>
        <Button danger secondary onClick={() => setConfirm(true)}>
          Delete all local records
        </Button>
      </section>
      {backup && (
        <Sheet title="Preview backup replacement" close={() => setBackup(null)}>
          <p>
            From {backup.workspace.name} · {backup.exportedAt}
          </p>
          <p>
            {backup.players.length} players · {backup.teams.length} teams · {backup.matches.length}{' '}
            matches · {backup.events.length} events · {backup.audits.length} audit records.
          </p>
          <p>
            This replaces all records in this workspace in one transaction. Export your current
            records first. Other tabs should be closed.
          </p>
          <Button secondary onClick={download}>
            Export current records first
          </Button>
          {localError && <p role="alert">{localError}</p>}
          <Button
            danger
            onClick={async () => {
              if (await run(() => importBackup(w.id, backup))) setBackup(null);
              else
                setLocalError(
                  'Import failed. Existing records were preserved. Close this sheet to see the error.',
                );
            }}
          >
            Confirm replacement
          </Button>
        </Sheet>
      )}
      {confirm && (
        <Sheet title="Delete all local records?" close={() => setConfirm(false)}>
          <p>
            This permanently removes this workspace, teams, players, matches and history. Export a
            backup before continuing.
          </p>
          <Button secondary onClick={download}>
            Export backup first
          </Button>
          <Field
            label="Type DELETE to confirm"
            value={erase}
            onChange={(e) => setErase(e.target.value)}
          />
          <Button
            danger
            disabled={erase !== 'DELETE'}
            onClick={() => run(() => clearWorkspace(w.id))}
          >
            Permanently delete records
          </Button>
        </Sheet>
      )}
    </>
  );
}
