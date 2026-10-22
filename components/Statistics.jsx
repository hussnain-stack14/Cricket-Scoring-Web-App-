'use client';
import { useState } from 'react';
import { Empty, Select } from './ui';
import TeamStatistics from './TeamStatistics';

export default function Statistics({ data }) {
  const teams = data.teams.filter((team) => !team.archived);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const team = teams.find((item) => item.id === teamId);

  if (!team) {
    return (
      <section className="statistics-view">
        <Empty title="Add a team to view statistics" href="/app/teams/" action="Manage teams">
          Team and player performance is calculated from your saved match records.
        </Empty>
      </section>
    );
  }

  const selectedTeam = {
    ...team,
    squad: data.memberships
      .filter((membership) => membership.teamId === team.id)
      .map((membership) => data.players.find((player) => player.id === membership.playerId))
      .filter(Boolean)
      .map(({ id, name }) => ({ id, name })),
  };

  return (
    <section className="statistics-view">
      <div className="statistics-toolbar">
        <p>Team performance, player leaderboards, and comparisons.</p>
        <Select
          label="Team"
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
          options={teams}
        />
      </div>
      <TeamStatistics team={selectedTeam} data={data} />
    </section>
  );
}
