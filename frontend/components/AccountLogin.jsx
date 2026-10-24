'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Leaf, LogIn, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { isValidLoginTeamId, normalizeLoginTeamId } from '../lib/accountCredentials';
import { fetchWithTimeout } from '../lib/request';

export default function AccountLogin() {
  const router = useRouter();
  const [retryUntil, setRetryUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!retryUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryUntil]);
  const remaining = Math.max(0, Math.ceil((retryUntil - now) / 1000));
  const [teamId, setTeamId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy || remaining > 0) return;
    setBusy(true);
    setError('');

    const normalised = normalizeLoginTeamId(teamId);
    if (!isValidLoginTeamId(normalised)) {
      setError('Team ID must be 4–24 characters using letters, numbers, underscores, or hyphens.');
      setBusy(false);
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError("You're offline. Connect to the internet to sign in.");
      setBusy(false);
      return;
    }

    try {
      const res = await fetchWithTimeout('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: normalised, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          const receivedAt = Date.now();
          setNow(receivedAt);
          setRetryUntil(receivedAt + (Number(data.retryAfter) || 60) * 1000);
          setError(data.error || 'Too many sign-in attempts. Please wait a few minutes.');
        } else if (res.status === 503) {
          setError(data.error || 'Database service is temporarily unavailable.');
        } else {
          setError(data.error || 'Sign in failed. Check your Team ID and password.');
        }
        return;
      }
      // Redirect to app after successful login
      router.push('/app/');
    } catch {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setError("You're offline. Connect to the internet to sign in.");
      } else {
        setError('Could not reach the server. Please check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <Link className="auth-brand" href="/">
          <span className="brand-mark">
            <Leaf size={20} />
          </span>
          crease<span>.</span>
        </Link>
      </header>

      <main className="auth-main auth-main-narrow">
        <div className="auth-hero">
          <span className="auth-kicker">
            <LogIn size={14} /> TEAM SIGN IN
          </span>
          <h1>Welcome back.</h1>
          <p>Enter your Team ID and password to access your records.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div role="alert" className="auth-error">
              {error}
              {remaining > 0 && (
                <p>
                  Try again in {Math.floor(remaining / 60)}:
                  {String(remaining % 60).padStart(2, '0')}.
                </p>
              )}
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="teamId">Team ID</label>
            <input
              id="teamId"
              type="text"
              placeholder="royal-club"
              value={teamId}
              autoComplete="username"
              spellCheck={false}
              maxLength={24}
              required
              onChange={(e) => setTeamId(e.target.value)}
            />
            <p className="auth-field-hint">Use the Team ID you chose when you registered.</p>
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <div className="auth-pw-wrap">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                placeholder="Your team password"
                value={password}
                autoComplete="current-password"
                required
                onChange={(e) => setPassword(e.target.value)}
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

          <button className="auth-submit" type="submit" disabled={busy || remaining > 0}>
            {busy ? (
              'Signing in…'
            ) : (
              <>
                Sign in <ArrowRight size={17} />
              </>
            )}
          </button>

          <div className="auth-form-links">
            <Link href="/account/recovery/">Forgot your password?</Link>
            <Link href="/account/register/">Create a team account</Link>
          </div>
        </form>

        <div className="auth-back">
          <Link href="/app/">← Back to the app without signing in</Link>
        </div>
      </main>
    </div>
  );
}
