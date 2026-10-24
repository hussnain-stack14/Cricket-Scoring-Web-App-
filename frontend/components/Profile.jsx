'use client';
import Link from 'next/link';
import { useState } from 'react';
import { career } from '../lib/engine';
import { Avatar, Select } from './ui';
export default function Profile({ data }) {
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
      </div>
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
