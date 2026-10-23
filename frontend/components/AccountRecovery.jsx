'use client';
import { useState } from 'react';
import { Leaf, KeyRound, Mail, ArrowRight, CheckCircle2 } from 'lucide-react';
import { fetchWithTimeout } from '../lib/request';

export default function AccountRecovery() {
  const [teamId, setTeamId] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;

    if (!teamId.trim()) {
      setError('Please enter your Team ID.');
      return;
    }
    if (!recoveryEmail.trim() || !recoveryEmail.includes('@')) {
      setError('Please enter a valid recovery email address.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const res = await fetchWithTimeout('/api/auth/recovery/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: teamId.toUpperCase().trim(),
          recoveryEmail: recoveryEmail.toLowerCase().trim(),
        }),
      });

      if (!res.ok) {
        setError('Could not process recovery request. Please try again.');
        return;
      }

      setSubmitted(true);
    } catch {
      setError('Could not reach the server. Please check your connection.');
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
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
            <h1>Check your email</h1>
            <p>
              If a team account exists for <strong>{teamId}</strong> with matching recovery details,
              we have dispatched a password reset link to your email.
            </p>
            <div className="auth-form-links" style={{ marginTop: '2rem' }}>
              <a href="/account/reset-password/">Already have a token? Reset password here</a>
              <a href="/account/login/">← Return to sign in</a>
            </div>
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
            <KeyRound size={14} /> FORGOT PASSWORD
          </span>
          <h1>Recover Team Account</h1>
          <p>Enter your Team ID and the recovery email configured for your team.</p>
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
              placeholder="royal-club"
              value={teamId}
              spellCheck={false}
              maxLength={24}
              required
              onChange={(e) => setTeamId(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="recoveryEmail">Registered Email</label>
            <input
              id="recoveryEmail"
              type="email"
              placeholder="team-contact@example.com"
              value={recoveryEmail}
              required
              onChange={(e) => setRecoveryEmail(e.target.value)}
            />
          </div>

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? (
              'Sending link…'
            ) : (
              <>
                Send Reset Link <ArrowRight size={17} />
              </>
            )}
          </button>

          <div className="auth-form-links">
            <a href="/account/login/">Remember your password? Sign in</a>
            <a href="/account/register/">Create a new team account</a>
          </div>
        </form>

        <div className="auth-back">
          <a href="/app/">← Back to app</a>
        </div>
      </main>
    </div>
  );
}
