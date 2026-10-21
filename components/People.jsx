'use client';
import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { saveRecord, saveTeam } from '../lib/db';
import { Avatar, Button, Empty, Field, Select, Sheet, playerLabel } from './ui';
export default function People({ screen, w, data, run, error }) {
  const isTeam = screen === 'teams',
    [edit, setEdit] = useState(null),
    [members, setMembers] = useState([]),
    [query, setQuery] = useState(''),
    [role, setRole] = useState(''),
    [team, setTeam] = useState(''),
    [archived, setArchived] = useState(false);
  const rows = data[screen].filter(
    (p) =>
      !!p.archived === archived &&
      p.name.toLowerCase().includes(query.toLowerCase()) &&
      (isTeam ||
        ((!role || p.role === role) &&
          (!team || data.memberships.some((m) => m.playerId === p.id && m.teamId === team)))),
  );
  function open(p = {}) {
    setEdit(
      isTeam
        ? { name: '', captain: '', keeper: '', ...p }
        : { name: '', role: 'Batter', battingStyle: 'Right handed', bowlingStyle: '', ...p },
    );
    setMembers(data.memberships.filter((m) => m.teamId === p.id).map((m) => m.playerId));
  }
  const set = (k, v) => setEdit((x) => ({ ...x, [k]: v }));
  return (
    <>
      <div className="row">
        <p>
          {data[screen].filter((p) => !p.archived).length} active {screen}
        </p>
        <Button onClick={() => open()}>
          <Plus size={18} />
          Add {isTeam ? 'team' : 'player'}
        </Button>
      </div>
      <Field
        label={`Search ${screen}`}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name"
      />
      {!isTeam && (
        <div className="two-col">
          <Select
            label="Team filter"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            options={data.teams}
          />
          <Select
            label="Role filter"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper']}
          />
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        Show archived {screen}
      </label>
      <div className="list">
        {rows.map((p) => (
          <div className="person-row" key={p.id}>
            <Avatar name={p.name} />
            <div className="grow">
              {isTeam ? (
                <strong>{p.name}</strong>
              ) : (
                <a className="name-link" href={`/player/?id=${p.id}`}>
                  {p.name}
                </a>
              )}
              <p>
                {isTeam
                  ? `${data.memberships.filter((m) => m.teamId === p.id).length} squad members`
                  : `${p.role} · ${p.id.slice(0, 6)}`}
              </p>
              {!isTeam && (
                <small>
                  {data.teams
                    .filter((t) =>
                      data.memberships.some((m) => m.teamId === t.id && m.playerId === p.id),
                    )
                    .map((t) => t.name)
                    .join(' · ') || 'No team yet'}
                </small>
              )}
            </div>
            <button className="icon-button" aria-label={`Edit ${p.name}`} onClick={() => open(p)}>
              <Pencil size={18} />
            </button>
          </div>
        ))}
      </div>
      {!rows.length && (
        <Empty title={`No ${archived ? 'archived ' : ''}${screen} yet`}>
          Use Add {isTeam ? 'team' : 'player'} to build your own local scorebook.
        </Empty>
      )}
      {edit && (
        <Sheet
          title={`${edit.id ? 'Edit' : 'Add'} ${isTeam ? 'team' : 'player'}`}
          close={() => setEdit(null)}
        >
          <>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
          </>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run(() =>
                  isTeam ? saveTeam(w.id, edit, members) : saveRecord(w.id, 'players', edit),
                )
              )
                setEdit(null);
            }}
          >
            <Field
              label="Name"
              required
              maxLength={100}
              value={edit.name}
              onChange={(e) => set('name', e.target.value)}
            />
            {isTeam ? (
              <>
                <h3>Squad members</h3>
                {!data.players.length && <p>Add players from the Players tab first.</p>}
                <div className="squad-list">
                  {data.players
                    .filter((p) => !p.archived || members.includes(p.id))
                    .map((p) => (
                      <label className="check" key={p.id}>
                        <input
                          type="checkbox"
                          checked={members.includes(p.id)}
                          onChange={(e) => {
                            setMembers(
                              e.target.checked
                                ? [...members, p.id]
                                : members.filter((id) => id !== p.id),
                            );
                            if (!e.target.checked) {
                              if (edit.captain === p.id) set('captain', '');
                              if (edit.keeper === p.id) set('keeper', '');
                            }
                          }}
                        />
                        {p.name} · {p.id.slice(0, 6)}
                      </label>
                    ))}
                </div>
                <Select
                  label="Captain (optional)"
                  value={edit.captain}
                  onChange={(e) => set('captain', e.target.value)}
                  options={data.players.filter((p) => members.includes(p.id)).map(playerLabel)}
                />
                <Select
                  label="Wicketkeeper (optional)"
                  value={edit.keeper}
                  onChange={(e) => set('keeper', e.target.value)}
                  options={data.players.filter((p) => members.includes(p.id)).map(playerLabel)}
                />
              </>
            ) : (
              <>
                <Select
                  label="Role"
                  required
                  value={edit.role}
                  onChange={(e) => set('role', e.target.value)}
                  options={['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper']}
                />
                <Select
                  label="Batting style"
                  required
                  value={edit.battingStyle}
                  onChange={(e) => set('battingStyle', e.target.value)}
                  options={['Right handed', 'Left handed']}
                />
                <Field
                  label="Bowling style (optional)"
                  maxLength={100}
                  value={edit.bowlingStyle}
                  onChange={(e) => set('bowlingStyle', e.target.value)}
                />
              </>
            )}
            <Button>Save {isTeam ? 'team' : 'player'}</Button>
          </form>
          {edit.id && (
            <Button
              secondary
              danger
              onClick={async () => {
                if (
                  await run(() => saveRecord(w.id, screen, { ...edit, archived: !edit.archived }))
                )
                  setEdit(null);
              }}
            >
              {edit.archived ? 'Restore' : 'Archive'} {isTeam ? 'team' : 'player'}
            </Button>
          )}
          <p className="help">Archiving preserves every historical match and player reference.</p>
        </Sheet>
      )}
    </>
  );
}
