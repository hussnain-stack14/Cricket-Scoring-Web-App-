'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { changeMatch, deleteMatch } from '../lib/db';
import { matchLabel } from '../lib/matchLifecycle';
import { Button, Field, Sheet } from './ui';
import ReportActions from './ReportActions';

export default function MatchHeader({ match, states = [], w, run, error, session, onReopen }) {
  const router = useRouter();
  const menu = useRef(null);
  const [dialog, setDialog] = useState(null);
  const [venue, setVenue] = useState(match.venue || '');
  const [settings, setSettings] = useState({
    overs: String(match.rules.overs),
    size: String(match.rules.size),
  });
  const [settingsError, setSettingsError] = useState('');
  const [settingsConfirmation, setSettingsConfirmation] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [message, setMessage] = useState('');
  const canEdit = !session || ['owner', 'scorer'].includes(session.role);
  const owner = !session || session.role === 'owner';
  const open = (value) => {
    menu.current.open = false;
    if (value === 'edit') {
      setVenue(match.venue || '');
      setSettings({ overs: String(match.rules.overs), size: String(match.rules.size) });
      setSettingsError('');
      setSettingsConfirmation(null);
    }
    setDialog(value);
  };
  function reviewSettings(event) {
    event.preventDefault();
    const overs = Number(settings.overs);
    const size = Number(settings.size);
    const minimumOvers = Math.max(1, ...states.map((state) => Math.ceil(state.balls / 6)));
    const minimumPlayers = Math.max(...match.teams.map((team) => team.squad.length));
    if (match.status !== 'live') {
      run(() =>
        changeMatch(w.id, match.id, match.revision, { type: 'metadata', venue }),
      ).then((saved) => {
        if (saved) setDialog(null);
      });
      return;
    }
    if (!Number.isSafeInteger(overs) || overs < minimumOvers || overs > 50) {
      setSettingsError(
        `Overs must be a whole number from ${minimumOvers} to 50 to preserve all recorded deliveries.`,
      );
      return;
    }
    if (!Number.isSafeInteger(size) || size < Math.max(2, minimumPlayers)) {
      setSettingsError(
        `Players per team must be at least ${Math.max(2, minimumPlayers)} to include the selected match players.`,
      );
      return;
    }
    if (overs === match.rules.overs && size === match.rules.size && venue === (match.venue || '')) {
      setSettingsError('No match settings have changed.');
      return;
    }
    const current = states.at(-1);
    const maxBowler = Math.min(
      overs,
      Math.max(match.rules.maxBowler, Math.ceil(overs / size)),
    );
    setSettingsConfirmation({
      overs,
      size,
      venue,
      maxBowler,
      endsInnings:
        !!current &&
        !current.done &&
        (current.balls >= overs * 6 || current.wickets >= size - 1),
    });
    setSettingsError('');
  }
  async function saveSettings() {
    if (!settingsConfirmation || savingSettings) return;
    setSavingSettings(true);
    const saved = await run(() =>
      changeMatch(w.id, match.id, match.revision, {
        type: 'settings',
        overs: settingsConfirmation.overs,
        size: settingsConfirmation.size,
        venue: settingsConfirmation.venue,
        confirmEndInnings: settingsConfirmation.endsInnings,
      }),
    );
    setSavingSettings(false);
    if (saved) setDialog(null);
  }
  async function share() {
    const text =
      matchLabel(match) +
      ' | ' +
      match.rules.overs +
      ' overs' +
      (states.length ? ' | ' + states.map((s) => s.runs + '/' + s.wickets).join(' - ') : '');
    try {
      if (navigator.share) await navigator.share({ title: 'Crease match', text });
      else {
        await navigator.clipboard.writeText(text);
        setMessage('Match summary copied.');
      }
    } catch (e) {
      if (e.name !== 'AbortError') setMessage('Sharing is unavailable. Try exporting a scorecard.');
    }
    menu.current.open = false;
  }
  return (
    <header className="match-centre-header">
      <div className="match-heading">
        <span className={'match-status status-' + match.status}>
          {match.status === 'upcoming' ? 'Scheduled' : match.status}
        </span>
        <h2>{matchLabel(match)}</h2>
        <p>
          {match.format || 'Limited overs'} &middot; {match.rules.overs} overs &middot;{' '}
          {new Intl.DateTimeFormat('en-US', match.scheduledAt
            ? {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: match.timeZone || 'UTC',
              }
            : { dateStyle: 'medium', timeZone: 'UTC' }).format(
            new Date(match.scheduledAt || `${match.date}T00:00:00Z`),
          )}
          {match.venue ? ' | ' + match.venue : ''}
        </p>
      </div>
      <details
        className="match-more"
        ref={menu}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            menu.current.open = false;
            menu.current.querySelector('summary').focus();
          }
        }}
      >
        <summary aria-label="More actions">
          <MoreHorizontal size={20} />
          <span>More actions</span>
        </summary>
        <div className="match-menu-panel">
          {states.length > 0 && <ReportActions match={match} states={states} compact />}
          <Button secondary compact onClick={share}>
            Share match
          </Button>
          {canEdit && !['completed', 'cancelled'].includes(match.status) && (
            <Button secondary compact onClick={() => open('edit')}>
              Edit match
            </Button>
          )}
          {owner && onReopen && match.status === 'completed' && (
            <Button
              secondary
              compact
              onClick={() => {
                menu.current.open = false;
                onReopen();
              }}
            >
              Reopen match
            </Button>
          )}
          {owner && (
            <Button secondary compact danger onClick={() => open('delete')}>
              Delete match
            </Button>
          )}
        </div>
      </details>
      {message && (
        <p className="help" role="status">
          {message}
        </p>
      )}
      {dialog && (
        <Sheet
          title={
            dialog === 'delete'
              ? 'Delete match?'
              : 'Edit Match'
          }
          close={() => setDialog(null)}
        >
          <p>
            <strong>{matchLabel(match)}</strong>
          </p>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          {settingsError && dialog === 'edit' && (
            <p role="alert" className="notice error">
              {settingsError}
            </p>
          )}
          {dialog === 'edit' && match.status === 'live' ? (
            settingsConfirmation ? (
              <>
                <h3>Match details</h3>
                <p>
                  Venue: <strong>{settingsConfirmation.venue || 'Not set'}</strong>
                </p>
                <h3>Match rules</h3>
                <p>
                  Change this match to <strong>{settingsConfirmation.overs} overs</strong> per
                  innings and <strong>{settingsConfirmation.size} players per team</strong>?
                </p>
                {settingsConfirmation.maxBowler !== match.rules.maxBowler && (
                  <p className="help">
                    Maximum overs per bowler will adjust from {match.rules.maxBowler} to{' '}
                    {settingsConfirmation.maxBowler} so the innings can be completed.
                  </p>
                )}
                {settingsConfirmation.endsInnings && (
                  <p className="notice">
                    This change will end the current innings at the last recorded delivery. No
                    balls or scorecard figures will be removed.
                  </p>
                )}
                <p className="help">
                  Recorded deliveries, player statistics, scorecards and match history will be
                  preserved.
                </p>
                <div className="actions">
                  <Button
                    secondary
                    disabled={savingSettings}
                    onClick={() => setSettingsConfirmation(null)}
                  >
                    Back to settings
                  </Button>
                  <Button disabled={savingSettings} onClick={saveSettings}>
                    {savingSettings ? 'Saving…' : 'Confirm and save settings'}
                  </Button>
                </div>
              </>
            ) : (
              <form onSubmit={reviewSettings}>
                <h3>Match details</h3>
                <Field
                  label="Venue"
                  maxLength={100}
                  value={venue}
                  onChange={(event) => setVenue(event.target.value)}
                />
                <h3>Match rules</h3>
                <Field
                  label="Total overs per innings"
                  type="number"
                  min={Math.max(1, ...states.map((state) => Math.ceil(state.balls / 6)))}
                  max={50}
                  required
                  value={settings.overs}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, overs: event.target.value }))
                  }
                />
                <Field
                  label="Players per team"
                  type="number"
                  min={Math.max(2, ...match.teams.map((team) => team.squad.length))}
                  required
                  value={settings.size}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, size: event.target.value }))
                  }
                />
                <p className="help">
                  Choose how many players will take part in this match. The minimum keeps the
                  selected players and recorded deliveries valid.
                </p>
                <Button>Review changes</Button>
              </form>
            )
          ) : dialog === 'delete' ? (
            <>
              <p>
                Remove this match from lists and statistics? Historical records are retained for
                audit. Other matches and players are kept.
              </p>
              <div className="actions">
                <Button secondary onClick={() => setDialog(null)}>
                  Keep match
                </Button>
                <Button
                  danger
                  onClick={async () => {
                    if (await run(() => deleteMatch(w.id, match.id))) router.push('/app/matches/');
                  }}
                >
                  Confirm delete
                </Button>
              </div>
            </>
          ) : dialog === 'edit' ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await run(() =>
                    changeMatch(w.id, match.id, match.revision, { type: 'metadata', venue }),
                  )
                )
                  setDialog(null);
              }}
            >
              <Field
                label="Venue"
                maxLength={100}
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
              />
              <Button>Save details</Button>
            </form>
          ) : null}
        </Sheet>
      )}
    </header>
  );
}
