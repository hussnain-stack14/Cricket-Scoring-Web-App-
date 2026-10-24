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
  const [message, setMessage] = useState('');
  const canEdit = !session || ['owner', 'scorer'].includes(session.role);
  const owner = !session || session.role === 'owner';
  const open = (value) => {
    menu.current.open = false;
    setDialog(value);
  };
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
          {new Date(match.scheduledAt || match.date).toLocaleString(
            [],
            match.scheduledAt
              ? { dateStyle: 'medium', timeStyle: 'short', timeZone: match.timeZone || undefined }
              : { dateStyle: 'medium' },
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
          title={dialog === 'delete' ? 'Delete match?' : 'Edit match'}
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
          {dialog === 'delete' ? (
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
          ) : (
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
          )}
        </Sheet>
      )}
    </header>
  );
}
