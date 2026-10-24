'use client';
import Link from 'next/link';
import { useState } from 'react';
import { career } from '../lib/engine';
import { useRouter } from 'next/navigation';
import { saveRecord, deleteRecord } from '../lib/db';
import { Avatar, Select, Button, Sheet } from './ui';
export default function Profile({ data, w, run, error, session }) {
  const router = useRouter();
  const [action, setAction] = useState(null);
  const owner = !session || session.role === 'owner';
  const base = '/app';
  const id = new URLSearchParams(window.location.search).get('id'),
    p = data.players.find((x) => x.id === id);
  const [tab, setTab] = useState('Batting'),
    [format, setFormat] = useState('all');
  if (!p)
    return (
      <p>
        Player not found on this device. <Link href={`${base}/players/`}>View players</Link>
      </p>
    );
  const stats = career(id, data.matches, data.innings, data.events, format);
  const batting = [
    ['Matches', stats.matches],
    ['Innings', stats.innings],
    ['Runs', stats.runs],
    ['Average', stats.average],
    ['Strike rate', stats.strikeRate],
    ['Highest', stats.highest],
    ['Balls faced', stats.balls],
    ['Dismissals', stats.dismissals],
    ['Not outs', stats.notOuts],
    ['Fours', stats.fours],
    ['Sixes', stats.sixes],
    ['Fifties', stats.fifties],
    ['Hundreds', stats.hundreds],
  ];
  const bowling = [
    ['Legal balls', stats.legalBalls],
    ['Overs', `${Math.floor(stats.legalBalls / 6)}.${stats.legalBalls % 6}`],
    ['Runs conceded', stats.conceded],
    ['Wickets', stats.wickets],
    ['Maidens', stats.maidens],
    ['Economy', stats.economy],
    ['Average', stats.bowlingAverage],
    ['Strike rate', stats.bowlingStrikeRate],
    ['Best figures', stats.bestRuns === null ? '—' : `${stats.bestWickets}/${stats.bestRuns}`],
  ];
  return (
    <>
      <div className="profile-heading">
        <Avatar name={p.name} />
        <h2>{p.name}</h2>
        <p>
          {p.role} · {p.battingStyle}
        </p>
        {p.bowlingStyle && <small>{p.bowlingStyle}</small>}
        {owner && (
          <details className="profile-management">
            <summary>Manage player</summary>
            <div className="actions">
              <Button secondary onClick={() => setAction('archive')}>
                {p.archived ? 'Restore player' : 'Archive player'}
              </Button>
              <Button
                secondary
                danger
                disabled={data.matches.some((m) =>
                  m.teams.some((t) => t.squad.some((x) => x.id === p.id)),
                )}
                onClick={() => setAction('delete')}
              >
                Delete player
              </Button>
            </div>
          </details>
        )}
      </div>
      {action && (
        <Sheet
          title={
            action === 'delete'
              ? 'Delete player?'
              : p.archived
                ? 'Restore player?'
                : 'Archive player?'
          }
          close={() => setAction(null)}
        >
          <p>
            {action === 'delete'
              ? 'Permanently delete ' + p.name + '? This cannot be undone.'
              : (p.archived ? 'Restore ' : 'Archive ') +
                p.name +
                '? Historical matches and statistics are preserved.'}
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="actions">
            <Button
              danger={action === 'delete'}
              onClick={async () => {
                const saved = await run(() =>
                  action === 'delete'
                    ? deleteRecord(w.id, 'players', p.id)
                    : saveRecord(w.id, 'players', { ...p, archived: !p.archived }),
                );
                if (saved) {
                  setAction(null);
                  if (action === 'delete') router.push('/app/players/');
                }
              }}
            >
              {action === 'delete'
                ? 'Permanently delete'
                : p.archived
                  ? 'Confirm restore'
                  : 'Confirm archive'}
            </Button>
            <Button secondary onClick={() => setAction(null)}>
              Cancel
            </Button>
          </div>
        </Sheet>
      )}
      <Select
        label="Format"
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        options={[
          { id: 'all', name: 'All formats' },
          ...[...new Set(data.matches.map((m) => m.rules.overs))].map((n) => ({
            id: String(n),
            name: `${n} overs`,
          })),
        ]}
      />
      <div className="tabs">
        {['Batting', 'Bowling', 'Matches'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <p className="help">Career totals include finalized matches only.</p>
      {tab === 'Matches' ? (
        data.matches
          .filter(
            (m) =>
              m.teams.some((t) => t.squad.some((x) => x.id === id)) &&
              (format === 'all' || String(m.rules.overs) === format),
          )
          .map((m) => (
            <Link className="list-link" key={m.id} href={`${base}/match/?id=${m.id}`}>
              <strong>{m.teams.map((t) => t.name).join(' vs ')}</strong>
              <small>
                {m.date} · {m.status}
              </small>
            </Link>
          ))
      ) : (
        <div className="stats-grid">
          {(tab === 'Batting' ? batting : bowling).map(([label, value]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
