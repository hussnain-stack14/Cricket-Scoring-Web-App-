'use client';
import { useState } from 'react';
import { Leaf, LogIn, UserPlus, Copy, Check, ArrowRight, Shield } from 'lucide-react';

export default function AccountHub() {
  const [copied, setCopied] = useState(false);

  function copy(text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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

      <main className="auth-main">
        <div className="auth-hero">
          <span className="auth-kicker">
            <Shield size={14} /> TEAM ACCOUNTS
          </span>
          <h1>Your team, anywhere.</h1>
          <p>
            Create a team account to sync your players, matches and statistics across all your
            devices. Your Team ID is your team's unique address — keep it safe.
          </p>
        </div>

        <div className="auth-card-grid">
          <a className="auth-action-card" href="/account/login/">
            <span className="auth-action-icon">
              <LogIn size={22} />
            </span>
            <div>
              <h2>Sign in</h2>
              <p>Already have a team account? Enter your Team ID and password.</p>
            </div>
            <ArrowRight size={18} />
          </a>

          <a className="auth-action-card" href="/account/register/">
            <span className="auth-action-icon primary">
              <UserPlus size={22} />
            </span>
            <div>
              <h2>Create team account</h2>
              <p>New to Crease accounts? Register your team in seconds.</p>
            </div>
            <ArrowRight size={18} />
          </a>
        </div>

        <div className="auth-info-strip">
          <div>
            <strong>What is a Team ID?</strong>
            <p>
              A Team ID looks like <code>CRS-482916</code>. It's generated when your team registers
              and can be changed later in Account Settings. Share your current Team ID with
              teammates so they can request to join.
            </p>
          </div>
          <div>
            <strong>Is my local data deleted?</strong>
            <p>
              No. Your existing local records stay on this device. After signing in you can choose
              to upload them to your account using the "Link local data" option in Settings.
            </p>
          </div>
          <div>
            <strong>What if I'm offline?</strong>
            <p>
              Crease still works fully offline. Changes made offline are queued and synced
              automatically when you reconnect.
            </p>
          </div>
        </div>

        <div className="auth-back">
          <a href="/app/">← Back to the app</a>
        </div>
      </main>
    </div>
  );
}
