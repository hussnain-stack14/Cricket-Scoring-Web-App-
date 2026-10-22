'use client';
import { useState, useEffect } from 'react';
import { Leaf, KeyRound, Eye, EyeOff, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function AccountResetPassword() {
  const [teamId, setTeamId] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token') || '';
    const id = params.get('teamId') || '';
    if (t) setToken(t);
    if (id) setTeamId(id);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;

    if (!teamId.trim()) {
      setError('Please provide a Team ID.');
      return;
    }
    if (!token.trim()) {
      setError('Reset token is missing. Please open the link sent to your email.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one letter and one number.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/auth/recovery/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: teamId.toUpperCase().trim(),
          token,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to reset password. The link may have expired.');
        return;
      }
      setSuccess(true);
    } catch {
      setError('Could not reach the server. Please check your connection.');
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="auth-shell">
        <header className="auth-header">
          <a className="auth-brand" href="/">
            <span className="brand-mark">
              <Leaf size={20} />
            </span>
            crease<span>.</span>
          </a>
        </header>

        <main className="auth-main auth-main-narrow">
          <div className="auth-success-card" style={{ textAlign: 'center' }}>
            <span
              style={{
                color: 'var(--color-primary, #7fae42)',
                display: 'inline-block',
                marginBottom: '1rem',
              }}
            >
              <CheckCircle2 size={48} />
            </span>
            <h1>Password updated!</h1>
            <p>
              Your team password has been successfully reset. You can now sign in with your new
              credentials.
            </p>
            <a
              className="button landing-primary auth-submit"
              href="/account/login/"
              style={{ display: 'inline-flex', marginTop: '1.5rem' }}
            >
              Sign in now <ArrowRight size={17} />
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <a className="auth-brand" href="/">
          <span className="brand-mark">
            <Leaf size={20} />
          </span>
          crease<span>.</span>
        </a>
      </header>

      <main className="auth-main auth-main-narrow">
        <div className="auth-hero">
          <span className="auth-kicker">
            <KeyRound size={14} /> ACCOUNT RECOVERY
          </span>
          <h1>Reset Password</h1>
          <p>Choose a new password for your Crease team account.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div role="alert" className="auth-error">
              {error}
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="teamId">Team ID</label>
            <input
              id="teamId"
              type="text"
              placeholder="CRS-YOUNGS01"
              value={teamId}
              spellCheck={false}
              maxLength={16}
              required
              onChange={(e) => setTeamId(e.target.value.toUpperCase())}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="token">Reset Token</label>
            <input
              id="token"
              type="text"
              placeholder="Paste token from email"
              value={token}
              spellCheck={false}
              required
              onChange={(e) => setToken(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="newPassword">New Password</label>
            <div className="auth-pw-wrap">
              <input
                id="newPassword"
                type={showPw ? 'text' : 'password'}
                placeholder="At least 8 characters (letters & numbers)"
                value={newPassword}
                required
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                className="auth-pw-toggle"
                aria-label={showPw ? 'Hide password' : 'Show password'}
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              id="confirmPassword"
              type={showPw ? 'text' : 'password'}
              placeholder="Repeat your new password"
              value={confirmPassword}
              required
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? (
              'Updating password…'
            ) : (
              <>
                Reset password <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>

        <div className="auth-back">
          <a href="/account/login/">← Back to sign in</a>
        </div>
      </main>
    </div>
  );
}
