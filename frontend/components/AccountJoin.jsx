'use client';
import { useEffect, useState } from 'react';
import { Leaf, Eye, EyeOff, ArrowRight, Users } from 'lucide-react';
import { fetchWithTimeout } from '../lib/request';

export default function AccountJoin() {
  const [params, setParams] = useState({ token: '', teamId: '', memberId: '' });
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setParams({
      token: p.get('token') || '',
      teamId: p.get('teamId') || '',
      memberId: p.get('memberId') || '',
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await fetchWithTimeout('/api/team/join', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, displayName, password, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not accept invite. The link may have expired.');
        return;
      }
      setSuccess(true);
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="auth-shell">
        <header className="auth-header">
          <a className="auth-brand" href="/"><span className="brand-mark"><Leaf size={20} /></span>crease<span>.</span></a>
        </header>
        <main className="auth-main auth-main-narrow">
          <div className="auth-success-box">
            <span className="auth-success-icon"><Users size={36} /></span>
            <h1>You're in!</h1>
            <p>Your team account is active. You can now score or view matches on this device.</p>
            <a className="auth-submit" href="/app/" style={{ display: 'inline-flex', justifyContent: 'center' }}>
              Open the app <ArrowRight size={17} style={{ marginLeft: 6 }} />
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <a className="auth-brand" href="/"><span className="brand-mark"><Leaf size={20} /></span>crease<span>.</span></a>
      </header>
      <main className="auth-main auth-main-narrow">
        <div className="auth-hero">
          <span className="auth-kicker"><Users size={14} /> TEAM INVITE</span>
          <h1>Join the team.</h1>
          <p>Set up your personal password to access this team account on Crease.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {error && <div role="alert" className="auth-error">{error}</div>}
          <div className="auth-field">
            <label htmlFor="join-name">Your display name (optional)</label>
            <input
              id="join-name"
              type="text"
              placeholder="Leave blank to keep the invited name"
              value={displayName}
              maxLength={100}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="join-password">Choose a password</label>
            <div className="auth-pw-wrap">
              <input
                id="join-password"
                type={showPw ? 'text' : 'password'}
                placeholder="At least 6 characters"
                value={password}
                autoComplete="new-password"
                required
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="auth-pw-toggle" onClick={() => setShowPw((v) => !v)}>
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="join-confirm">Confirm password</label>
            <input
              id="join-confirm"
              type={showPw ? 'text' : 'password'}
              value={confirmPassword}
              autoComplete="new-password"
              required
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? 'Setting up account…' : <>Accept invite <ArrowRight size={17} /></>}
          </button>
        </form>
      </main>
    </div>
  );
}
