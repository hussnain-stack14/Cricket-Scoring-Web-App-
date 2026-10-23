'use client';
import { useState } from 'react';
import { Leaf, UserPlus, Eye, EyeOff, Copy, Check, ArrowRight, ShieldCheck } from 'lucide-react';
import { isValidLoginTeamId, normalizeLoginTeamId } from '../lib/accountCredentials';

export default function AccountRegister() {
  const [teamName, setTeamName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null); // { teamId, teamName }
  const [copied, setCopied] = useState(false);

  function copyId() {
    navigator.clipboard.writeText(success.teamId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  // Password strength indicator
  const strength = (() => {
    if (password.length === 0) return 0;
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength];
  const strengthClass = ['', 'pw-weak', 'pw-fair', 'pw-good', 'pw-strong'][strength];

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;

    if (teamName.trim().length < 2) {
      setError('Team name must be at least 2 characters.');
      return;
    }
    const normalizedTeamId = normalizeLoginTeamId(teamId);
    if (!isValidLoginTeamId(normalizedTeamId)) {
      setError(
        'Team ID must be 4–24 characters using letters, numbers, underscores, or hyphens. Some IDs are reserved.',
      );
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must include at least one letter and one number.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError("You're offline. Connect to the internet to create an account.");
      return;
    }

    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName: teamName.trim(),
          teamId: normalizedTeamId,
          password,
          confirmPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          setError(
            data.error || 'Too many attempts. Please wait a few minutes before trying again.',
          );
        } else if (res.status === 503) {
          setError(
            data.error || 'Database service is temporarily unavailable. Please verify settings.',
          );
        } else if (res.status === 409) {
          setError(data.error || 'A team account with this identifier already exists.');
        } else {
          setError(data.error || 'Registration failed. Please check your details and try again.');
        }
        return;
      }
      setSuccess({ teamId: data.teamId, teamName: data.teamName });
    } catch {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setError("You're offline. Connect to the internet to create an account.");
      } else {
        setError(
          'Could not reach the server. Please check your internet connection or try again shortly.',
        );
      }
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
          <div className="auth-success-box">
            <span className="auth-success-icon">
              <ShieldCheck size={36} />
            </span>
            <h1>Team account created!</h1>
            <p>
              Welcome to Crease, <strong>{success.teamName}</strong>.
            </p>
            <p>
              Your Team ID is how you sign in from any device. Write it down or save it somewhere
              safe — you'll need it every time you log in.
            </p>

            <div className="auth-teamid-display">
              <span className="auth-teamid-label">Your Team ID</span>
              <div className="auth-teamid-value">
                <strong>{success.teamId}</strong>
                <button
                  className="auth-copy-btn"
                  onClick={copyId}
                  aria-label="Copy Team ID"
                  type="button"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="auth-next-steps">
              <p>
                <strong>What's next?</strong>
              </p>
              <ul>
                <li>Go to the app and start scoring — you're already signed in.</li>
                <li>To sync existing local data, open Settings → Link local data.</li>
                <li>To invite team members, open Account Settings → Team Members.</li>
              </ul>
            </div>

            <a
              className="auth-submit"
              href="/app/"
              style={{ display: 'inline-flex', justifyContent: 'center' }}
            >
              Go to the app <ArrowRight size={17} style={{ marginLeft: 6 }} />
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
            <UserPlus size={14} /> CREATE TEAM ACCOUNT
          </span>
          <h1>Register your team.</h1>
          <p>
            Create an account to sync your cricket records across devices. Choose a unique Team ID
            you can remember.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div role="alert" className="auth-error">
              {error}
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="teamName">Team name</label>
            <input
              id="teamName"
              type="text"
              placeholder="e.g. Youngs Squad"
              value={teamName}
              maxLength={100}
              autoComplete="organization"
              required
              onChange={(e) => setTeamName(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="register-team-id">Team ID</label>
            <input
              id="register-team-id"
              type="text"
              placeholder="royal-club"
              value={teamId}
              minLength={4}
              maxLength={24}
              autoComplete="username"
              spellCheck={false}
              required
              onChange={(event) => setTeamId(event.target.value)}
            />
            <p className="auth-field-hint">
              4–24 letters, numbers, underscores, or hyphens. Team IDs are case-insensitive.
            </p>
          </div>

          <div className="auth-field">
            <label htmlFor="reg-password">Password</label>
            <div className="auth-pw-wrap">
              <input
                id="reg-password"
                type={showPw ? 'text' : 'password'}
                placeholder="Choose a strong password"
                value={password}
                autoComplete="new-password"
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
            {password.length > 0 && (
              <div className="auth-pw-strength">
                <span className={`auth-pw-bar ${strengthClass}`} />
                <span className={`auth-pw-label ${strengthClass}`}>{strengthLabel}</span>
              </div>
            )}
            <p className="auth-field-hint">
              At least 8 characters with at least one letter and one number.
            </p>
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              type={showPw ? 'text' : 'password'}
              placeholder="Repeat your password"
              value={confirmPassword}
              autoComplete="new-password"
              required
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? (
              'Creating account…'
            ) : (
              <>
                Create team account <ArrowRight size={17} />
              </>
            )}
          </button>

          <div className="auth-form-links">
            <a href="/account/login/">Already have an account? Sign in</a>
            <a href="/app/">Continue Offline without account</a>
          </div>
        </form>

        <div className="auth-back">
          <a href="/app/">← Return to Crease Scorebook</a>
        </div>
      </main>
    </div>
  );
}
