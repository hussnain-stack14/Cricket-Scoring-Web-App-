'use client';
import { useEffect, useRef, useState } from 'react';
import { Trophy, Users, UserRound, Ellipsis, Plus, ArrowUpRight, Leaf } from 'lucide-react';
import { all, workspace, createWorkspace } from '../lib/db';
import { matchStates, result } from '../lib/engine';
import { Button, Field, Empty } from './ui';
import People from './People';
import Setup from './Setup';
import Match from './Match';
import Profile from './Profile';
import Settings from './Settings';
import { useOffline } from './offline';
function userError(error) {
  const message = error instanceof Error ? error.message : '';
  if (/another tab|revision/i.test(message))
    return 'This match was updated in another tab. Refresh to see the latest score.';
  if (/indexeddb|dexie|transaction|quota|database|storage/i.test(message))
    return 'Could not save your changes. Check available storage and try again.';
  if (/service.?worker|precache|cache registration/i.test(message))
    return "Offline setup couldn't finish. Connect to the internet and try again.";
  if (/delivery validation|invalid delivery/i.test(message))
    return 'Please check this ball and try again.';
  if (/match missing|record missing|workspace missing/i.test(message))
    return 'This record is no longer available. Refresh and try again.';
  return message && message.length < 180 ? message : 'Something went wrong. Please try again.';
}
export default function App({ screen }) {
  const [w, setW] = useState(null),
    [data, setData] = useState(null),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [loaded, setLoaded] = useState(false),
    [name, setName] = useState(''),
    [filter, setFilter] = useState('live');
  const busy = useRef(false);
  const offline = useOffline();
  const base = '/app';
  async function refresh() {
    const ws = await workspace();
    setW(ws);
    setData(ws ? await all(ws.id) : null);
    setLoaded(true);
  }
  useEffect(() => {
    refresh().catch((e) => {
      setError(userError(e));
      setLoaded(true);
    });
  }, []);
  async function run(fn) {
    if (busy.current) return false;
    busy.current = true;
    setError('');
    setStatus('Saving…');
    try {
      const value = await fn();
      await refresh();
      setStatus('Saved on this device');
      return value === undefined ? true : value;
    } catch (e) {
      console.error('Crease operation failed', e);
      setError(userError(e));
      setStatus('Save failed');
      return false;
    } finally {
      busy.current = false;
    }
  }
  const ctx = { w, data, run, refresh, setError, error };
  const titles = {
    matches: 'Matches',
    teams: 'Teams',
    players: 'Players',
    more: 'More',
    setup: 'New match',
    match: 'Match centre',
    player: 'Player profile',
  };
  return (
    <div className="app">
      <header className="brand">
        <a href={`${base}/`} aria-label="Crease home">
          <span className="brand-mark">
            <Leaf size={22} />
          </span>{' '}
          crease<span className="brand-dot">.</span>
        </a>
        <span className="local-badge">
          <span /> ON THIS DEVICE
        </span>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">YOUR GAME. YOUR RECORD.</p>
            <h1>{titles[screen]}</h1>
          </div>
          {screen === 'matches' && w && (
            <a className="button compact" href={`${base}/setup/`}>
              <Plus size={18} />
              New match
            </a>
          )}
        </div>
        {error && (
          <div role="alert" className="notice error">
            {error}
            <button
              onClick={() =>
                refresh()
                  .then(() => setError(''))
                  .catch((e) => setError(e.message))
              }
            >
              Refresh records
            </button>
          </div>
        )}
        {status && (
          <div role="status" className={`save-status ${status === 'Save failed' ? 'red' : ''}`}>
            {status}
          </div>
        )}
        {!loaded ? (
          <p>Opening local records…</p>
        ) : !w ? (
          <section className="welcome">
            <span className="pill">WELCOME TO YOUR CREASE</span>
            <h2>
              Every ball.
              <br />
              Every little victory.
            </h2>
            <p>
              Your teams, matches and statistics, together in one place. Ready for the ground, even
              without a signal.
            </p>
            <div className="card">
              <h3>A workspace of your own</h3>
              <p>
                Records stay in this browser on this device. Your display name is not a login.
                Anyone using this browser profile can access these records.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => createWorkspace(name));
                }}
              >
                <Field
                  label="Your scorer name"
                  value={name}
                  maxLength={100}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
                <Button>
                  Get started <ArrowUpRight size={18} />
                </Button>
              </form>
            </div>
          </section>
        ) : (
          data && (
            <>
              {screen === 'matches' && (
                <>
                  <div className="intro-line">
                    <p>
                      Good to see you, <strong>{w.name}</strong>
                    </p>
                    <span className="pill">
                      {offline.ready ? 'Ready offline' : 'Offline preparation needed'}
                    </span>
                  </div>
                  <div className="tabs" aria-label="Match status">
                    {['live', 'upcoming', 'completed'].map((f) => (
                      <button
                        key={f}
                        className={filter === f ? 'active' : ''}
                        onClick={() => setFilter(f)}
                      >
                        {f[0].toUpperCase() + f.slice(1)}{' '}
                        <span>{data.matches.filter((m) => m.status === f).length}</span>
                      </button>
                    ))}
                  </div>
                  <p className="section-caption">
                    {filter === 'live'
                      ? 'IN PROGRESS ON THIS DEVICE'
                      : filter === 'upcoming'
                        ? 'READY FOR THE FIRST BALL'
                        : 'FROM THE SCOREBOOK'}
                  </p>
                  {data.matches.filter((m) => m.status === filter).length ? (
                    data.matches
                      .filter((m) => m.status === filter)
                      .map((m) => {
                        const states = matchStates(
                          m,
                          data.innings.filter((i) => i.matchId === m.id),
                          data.events.filter((e) => e.matchId === m.id),
                        );
                        return (
                          <a className="match-card" key={m.id} href={`${base}/match/?id=${m.id}`}>
                            <div className="row">
                              <span className="pill">
                                {m.rules.overs} overs · {m.rules.size} a side
                              </span>
                              <small>{new Date(m.date).toLocaleDateString()}</small>
                            </div>
                            {m.teams.map((t, i) => {
                              const s = states[i === m.firstBat ? 0 : 1];
                              return (
                                <div key={t.id} className="team-score">
                                  <strong>{t.name}</strong>
                                  <b>{s ? `${s.runs}/${s.wickets}` : 'Yet to bat'}</b>
                                </div>
                              );
                            })}
                            <p>
                              {m.status === 'completed'
                                ? result(m, states)
                                : m.venue || 'Local match'}
                            </p>
                            <div className="card-footer">
                              {m.status === 'completed' ? 'View scorecard' : 'Continue scoring'}
                              <ArrowUpRight size={18} />
                            </div>
                          </a>
                        );
                      })
                  ) : (
                    <Empty
                      title={
                        filter === 'completed'
                          ? 'A scorebook waiting for stories'
                          : 'The next innings starts here'
                      }
                      href={`${base}/setup/`}
                      action="Set up a match"
                    >
                      {filter === 'live'
                        ? 'No matches in progress. Choose your teams and make the first ball count.'
                        : 'Your matches will appear here when you create and score them.'}
                    </Empty>
                  )}
                  <div className="tip">
                    <Trophy size={22} />
                    <div>
                      <strong>Built for your boundary line</strong>
                      <p>
                        Create your teams and players before match day. Your scorebook travels with
                        this device.
                      </p>
                    </div>
                  </div>
                </>
              )}
              {(screen === 'teams' || screen === 'players') && <People {...ctx} screen={screen} />}
              {screen === 'setup' && <Setup {...ctx} />}
              {screen === 'match' && <Match {...ctx} />}
              {screen === 'player' && <Profile {...ctx} />}
              {screen === 'more' && <Settings {...ctx} offline={offline} />}
            </>
          )
        )}
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {[
          ['matches', `${base}/`, Trophy],
          ['teams', `${base}/teams/`, Users],
          ['players', `${base}/players/`, UserRound],
          ['more', `${base}/more/`, Ellipsis],
        ].map(([key, href, Icon]) => (
          <a
            key={key}
            href={href}
            className={
              screen === key ||
              (screen === 'match' && key === 'matches') ||
              (screen === 'player' && key === 'players')
                ? 'selected'
                : ''
            }
          >
            <Icon size={21} />
            <span>{key[0].toUpperCase() + key.slice(1)}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
