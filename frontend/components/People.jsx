'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { deleteRecord, saveRecord, saveTeam } from '../lib/db';
import { Avatar, Button, Empty, Field, Select, Sheet, playerLabel } from './ui';
import TeamStatistics from './TeamStatistics';
export default function People({ screen, w, data, run, error, session }) {
  const base = '/app';
  const canDelete = !session || session.role === 'owner';
  const [sort, setSort] = useState('name');
  const isTeam = screen === 'teams',
    [edit, setEdit] = useState(null),
    [statisticsTeam, setStatisticsTeam] = useState(null),
    [deleting, setDeleting] = useState(false),
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
  rows.sort((a, b) =>
    sort === 'role'
      ? (a.role || '').localeCompare(b.role || '') || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name),
  );
  const hasHistory =
    edit?.id &&
    data.matches.some((m) =>
      m.teams.some((t) => (isTeam ? t.id === edit.id : t.squad.some((p) => p.id === edit.id))),
    );
  if (isTeam && statisticsTeam) {
    return (
      <TeamStatistics team={statisticsTeam} data={data} onBack={() => setStatisticsTeam(null)} />
    );
  }
  function open(p = {}) {
    setDeleting(false);
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
      <Select
        label="Sort by"
        value={sort}
        onChange={(e) => setSort(e.target.value)}
        options={[
          { id: 'name', name: 'Name' },
          { id: 'role', name: 'Role' },
        ]}
      />
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
                <Link className="name-link" href={`${base}/player/?id=${p.id}`}>
                  {p.name}
                </Link>
              )}
              <p>
                {isTeam
                  ? `${data.memberships.filter((m) => m.teamId === p.id).length} squad members`
                  : p.role}
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
            {isTeam && (
              <Button
                secondary
                compact
                onClick={() =>
                  setStatisticsTeam({
                    ...p,
                    squad: data.memberships
                      .filter((membership) => membership.teamId === p.id)
                      .map((membership) =>
                        data.players.find((player) => player.id === membership.playerId),
                      )
                      .filter(Boolean)
                      .map(({ id, name }) => ({ id, name })),
                  })
                }
              >
                Statistics
              </Button>
            )}
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
          close={() => {
            setEdit(null);
            setDeleting(false);
          }}
        >
          <>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
          </>
          {deleting ? (
            <>
              <p>
                {deleting === 'archive'
                  ? `${edit.archived ? 'Restore' : 'Archive'} ${edit.name}? Historical matches and statistics will be preserved.`
                  : `Permanently delete ${edit.name}? This cannot be undone. Records used by match history cannot be deleted; archive those instead.`}
              </p>
              <div className="actions">
                <Button
                  danger
                  onClick={async () => {
                    if (
                      await run(() =>
                        deleting === 'archive'
                          ? saveRecord(w.id, screen, { ...edit, archived: !edit.archived })
                          : deleteRecord(w.id, screen, edit.id),
                      )
                    ) {
                      setEdit(null);
                      setDeleting(false);
                    }
                  }}
                >
                  {deleting === 'archive'
                    ? edit.archived
                      ? 'Confirm restore'
                      : 'Confirm archive'
                    : 'Permanently delete'}
                </Button>
                <Button secondary onClick={() => setDeleting(false)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
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
                            {p.name}
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
              {edit.id && canDelete && (
                <>
                  <Button secondary danger onClick={() => setDeleting('archive')}>
                    {edit.archived ? 'Restore' : 'Archive'} {isTeam ? 'team' : 'player'}
                  </Button>
                  <Button secondary danger disabled={hasHistory} onClick={() => setDeleting(true)}>
                    Delete {isTeam ? 'team' : 'player'}
                  </Button>
                </>
              )}
              <p className="help">
                Archiving preserves every historical match and player reference.
              </p>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
