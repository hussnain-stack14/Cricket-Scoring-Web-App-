'use client';
import { useId, useState } from 'react';
import { Eye, EyeOff, KeyRound, LoaderCircle, Shield, X } from 'lucide-react';
import { isValidLoginTeamId, normalizeLoginTeamId } from '../lib/accountCredentials';
import { fetchWithTimeout } from '../lib/request';

function PasswordField({ label, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();
  return (
    <div className="auth-field">
      <label htmlFor={inputId}>{label}</label>
      <span className="security-password-input">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required
        />
        <button
          className="security-visibility-button"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
    </div>
  );
}

export default function AccountSecurity({ session, onTeamIdChanged }) {
  const [dialog, setDialog] = useState('');
  const [confirmTeamId, setConfirmTeamId] = useState(false);
  const [newTeamId, setNewTeamId] = useState('');
  const [teamIdPassword, setTeamIdPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  function closeDialog() {
    if (busy) return;
    setDialog('');
    setConfirmTeamId(false);
    setError('');
    setNewTeamId('');
    setTeamIdPassword('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  function openDialog(next) {
    setSuccess('');
    setError('');
    setDialog(next);
  }

  async function saveTeamId() {
    setBusy(true);
    setError('');
    try {
      const response = await fetchWithTimeout('/api/account/team-id', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newTeamId, currentPassword: teamIdPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update the Team ID.');
      onTeamIdChanged(result.teamId);
      setSuccess('Team ID updated. Existing devices and team records remain linked.');
      setDialog('');
      setConfirmTeamId(false);
      setNewTeamId('');
      setTeamIdPassword('');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Could not update the Team ID.',
      );
      setConfirmTeamId(false);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetchWithTimeout('/api/account/password', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not change the password.');
      setSuccess('Password changed. Other signed-in devices must sign in again.');
      setDialog('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Could not change the password.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-section account-security-section" id="security">
      <span className="auth-kicker">
        <Shield size={14} /> ACCOUNT SECURITY
      </span>
      <h2>Account security</h2>
      <div className="security-account-summary">
        <div>
          <span>Current Team Name</span>
          <strong>{session.teamName}</strong>
        </div>
        <div>
          <span>Current Team ID</span>
          <strong>{session.teamId}</strong>
        </div>
      </div>
      <p className="auth-field-hint">
        Your team records and sync identity remain unchanged when you update sign-in credentials.
      </p>
      <div className="actions">
        <button className="button secondary" type="button" onClick={() => openDialog('team-id')}>
          Edit Team ID
        </button>
        <button className="button secondary" type="button" onClick={() => openDialog('password')}>
          <KeyRound size={16} /> Change Password
        </button>
      </div>
      {success && (
        <p className="auth-success" role="status">
          {success}
        </p>
      )}

      {dialog === 'team-id' && (
        <div className="security-modal-backdrop">
          <section
            className="security-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-id-dialog-title"
          >
            <button
              className="security-modal-close"
              type="button"
              onClick={closeDialog}
              aria-label="Close"
              disabled={busy}
            >
              <X size={19} />
            </button>
            {!confirmTeamId ? (
              <>
                <span className="auth-kicker">
                  <Shield size={14} /> LOGIN IDENTIFIER
                </span>
                <h2 id="team-id-dialog-title">Change Team ID</h2>
                <p>
                  Your current Team ID is read-only. Changing it will not change your team data.
                </p>
                <label className="auth-field">
                  <span>Current Team ID</span>
                  <input value={session.teamId} readOnly />
                </label>
                <label className="auth-field">
                  <span>New Team ID</span>
                  <input
                    value={newTeamId}
                    onChange={(event) => setNewTeamId(event.target.value)}
                    autoComplete="off"
                    placeholder="royal-club"
                    minLength={4}
                    maxLength={24}
                    pattern="[A-Za-z0-9_-]{4,24}"
                    required
                  />
                  <small>
                    Use 4–24 letters, numbers, underscores, or hyphens. IDs are case-insensitive.
                  </small>
                </label>
                <PasswordField
                  label="Current Password"
                  value={teamIdPassword}
                  onChange={setTeamIdPassword}
                  autoComplete="current-password"
                />
              </>
            ) : (
              <>
                <span className="auth-kicker">
                  <Shield size={14} /> CONFIRM CHANGE
                </span>
                <h2 id="team-id-dialog-title">Confirm your new Team ID</h2>
                <p>
                  New sign-ins will use <strong>{normalizeLoginTeamId(newTeamId)}</strong>. Your
                  current signed-in devices will remain linked to the same team.
                </p>
              </>
            )}
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <div className="actions security-modal-actions">
              {confirmTeamId ? (
                <>
                  <button className="button" type="button" onClick={saveTeamId} disabled={busy}>
                    {busy ? (
                      <>
                        <LoaderCircle size={16} className="spin" /> Saving…
                      </>
                    ) : (
                      'Confirm and save'
                    )}
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setConfirmTeamId(false)}
                    disabled={busy}
                  >
                    Back
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      setError('');
                      const normalized = normalizeLoginTeamId(newTeamId);
                      if (!isValidLoginTeamId(normalized)) {
                        setError(
                          'Use 4–24 letters, numbers, underscores, or hyphens. Some IDs are reserved.',
                        );
                        return;
                      }
                      setNewTeamId(normalized);
                      setConfirmTeamId(true);
                    }}
                    disabled={busy || !newTeamId || !teamIdPassword}
                  >
                    Continue
                  </button>
                  <button className="button secondary" type="button" onClick={closeDialog}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {dialog === 'password' && (
        <div className="security-modal-backdrop">
          <form
            className="security-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-dialog-title"
            onSubmit={savePassword}
          >
            <button
              className="security-modal-close"
              type="button"
              onClick={closeDialog}
              aria-label="Close"
              disabled={busy}
            >
              <X size={19} />
            </button>
            <span className="auth-kicker">
              <KeyRound size={14} /> PASSWORD
            </span>
            <h2 id="password-dialog-title">Change Password</h2>
            <p>
              Other signed-in devices will need to sign in again. Their offline records are kept.
            </p>
            <PasswordField
              label="Current Password"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
            />
            <PasswordField
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
            />
            <PasswordField
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />
            <small className="security-password-hint">
              At least 8 characters, including a letter and a number.
            </small>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <div className="actions security-modal-actions">
              <button className="button" type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <LoaderCircle size={16} className="spin" /> Saving…
                  </>
                ) : (
                  'Save new password'
                )}
              </button>
              <button className="button secondary" type="button" onClick={closeDialog}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
