'use client';
import { useState } from 'react';
import {
  ArrowRight,
  ChartColumnIncreasing,
  Check,
  Download,
  Leaf,
  Menu,
  Smartphone,
  Trophy,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { useOffline } from './offline';

const features = [
  {
    icon: WifiOff,
    title: 'Offline-first scoring',
    text: 'Prepare once while connected, then score without a signal.',
  },
  {
    icon: Trophy,
    title: 'Live match scorecards',
    text: 'Follow every innings, over, batter, bowler and match result.',
  },
  {
    icon: Users,
    title: 'Flexible player management',
    text: 'Prepare a squad ahead of time or add players as the match unfolds.',
  },
  {
    icon: ChartColumnIncreasing,
    title: 'Automatic score calculations',
    text: 'Runs, extras, strike, overs and player figures update from deliveries.',
  },
  {
    icon: Check,
    title: 'History and corrections',
    text: 'Resume local matches and review scoring changes with an audit trail.',
  },
  {
    icon: Smartphone,
    title: 'Phone to desktop',
    text: 'A responsive scorebook with touch-friendly controls and install support.',
  },
];

export default function Landing() {
  const offline = useOffline();
  const [instructions, setInstructions] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function download() {
    const result = await offline.install();
    if (result === 'instructions' || result === 'dismissed' || result === 'error') {
      setInstructions(true);
      document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  const device =
    typeof navigator === 'undefined'
      ? 'browser'
      : /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
          (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
        ? 'ios'
        : /Android/i.test(navigator.userAgent)
          ? 'android'
          : 'desktop';

  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label="Crease home">
          <span className="landing-logo">
            <Leaf size={20} />
          </span>
          crease<span>.</span>
        </a>
        <button
          className="landing-menu-toggle"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
        <nav className={menuOpen ? 'landing-links open' : 'landing-links'}>
          <a href="#features" onClick={() => setMenuOpen(false)}>
            Features
          </a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
            How it works
          </a>
          <button
            className="landing-download-link"
            onClick={() => {
              setMenuOpen(false);
              download();
            }}
          >
            Download app
          </button>
          <a className="button landing-nav-cta" href="/app/">
            Open app <ArrowRight size={16} />
          </a>
        </nav>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="landing-kicker">
              <span /> YOUR LOCAL CRICKET SCOREBOOK
            </span>
            <h1>
              Every Ball.
              <br />
              Every Run.
              <br />
              <em>Every Moment.</em>
            </h1>
            <p>
              Meet Crease — your personal cricket scoring companion. Score matches, manage teams,
              and track every performance, even without internet.
            </p>
            <div className="hero-actions">
              <button className="button landing-primary" onClick={download}>
                <Download size={18} /> Download app
              </button>
              <a className="button landing-secondary" href="/app/">
                Open web app <ArrowRight size={17} />
              </a>
            </div>
            <div className="hero-trust">
              <span>
                <Check size={15} /> No account
              </span>
              <span>
                <WifiOff size={15} /> Scores stay on your device
              </span>
            </div>
          </div>
          <div className="hero-visual" aria-label="Illustrative cricket scorecard preview">
            <div className="hero-orbit orbit-one" />
            <div className="hero-orbit orbit-two" />
            <div className="preview-card">
              <div className="preview-topline">
                <span>
                  CREASE <b>·</b> SCORECARD PREVIEW
                </span>
                <span className="preview-live">
                  <i /> LOCAL
                </span>
              </div>
              <div className="preview-match">
                <span>INNINGS 1</span>
                <span>10 OVERS</span>
              </div>
              <div className="preview-team">YOUR TEAM</div>
              <div className="preview-score">
                128<span>/3</span>
                <small>(14.2)</small>
              </div>
              <div className="preview-chase">
                <span>RUN RATE</span>
                <strong>8.93</strong>
                <span>PARTNERSHIP</span>
                <strong>42</strong>
              </div>
              <div className="preview-divider" />
              <div className="preview-row preview-header">
                <span>BATTER</span>
                <span>R</span>
                <span>B</span>
              </div>
              <div className="preview-row">
                <b>
                  Striker <i>●</i>
                </b>
                <strong>36</strong>
                <span>24</span>
              </div>
              <div className="preview-row">
                <b>Non-striker</b>
                <strong>19</strong>
                <span>16</span>
              </div>
              <div className="preview-over">
                <span>THIS OVER</span>
                {[1, 0, 4, 2, 'W', 1].map((ball, index) => (
                  <i
                    className={
                      ball === 4 ? 'preview-boundary' : ball === 'W' ? 'preview-wicket' : ''
                    }
                    key={index}
                  >
                    {ball}
                  </i>
                ))}
              </div>
            </div>
            <div className="preview-note">
              <span>
                <WifiOff size={15} />
              </span>
              <div>
                <strong>Ready when you are</strong>
                <small>Prepared for offline scoring</small>
              </div>
              <Check size={17} />
            </div>
            <div className="hero-ball">C</div>
          </div>
        </section>

        <section className="landing-proof">
          <p>MADE FOR THE GAME, NOT THE SIGNAL</p>
          <div>
            <span>
              <WifiOff /> Offline ready
            </span>
            <span>
              <Users /> Your teams
            </span>
            <span>
              <ChartColumnIncreasing /> Ball-by-ball
            </span>
            <span>
              <Smartphone /> Installable
            </span>
          </div>
        </section>

        <section className="landing-section features-section" id="features">
          <div className="landing-section-heading">
            <span className="landing-eyebrow">THE SCOREBOOK, REIMAGINED</span>
            <h2>Everything you need to keep the game moving.</h2>
            <p>Simple to start. Detailed enough for every innings.</p>
          </div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, text }, index) => (
              <article className="feature-card" key={title}>
                <span className="feature-icon">
                  <Icon size={21} />
                </span>
                <small>0{index + 1}</small>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <div className="backup-strip">
            <span>
              <Check size={18} />
            </span>
            <p>
              <strong>Your scorebook, in your hands.</strong> Export and restore backups whenever
              you choose.
            </p>
            <a href="/app/more/">
              Backup details <ArrowRight size={16} />
            </a>
          </div>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="how-intro">
            <span className="landing-eyebrow">FROM FIRST TAP TO FINAL BALL</span>
            <h2>Ready for the boundary line.</h2>
            <p>
              Get set up before the toss. Once prepared, your scorebook works wherever the match
              takes you.
            </p>
            <a href="/app/" className="text-link">
              Explore the app <ArrowRight size={16} />
            </a>
          </div>
          <div className="how-steps">
            {[
              ['01', 'Open Crease', 'Start on the website or open the scoring app.'],
              ['02', 'Install on your device', 'Add Crease to your home screen from your browser.'],
              ['03', 'Set up the match', 'Choose teams, match rules and start scoring.'],
              [
                '04',
                'Keep scoring offline',
                'Prepare while connected, then take your scorebook anywhere.',
              ],
            ].map(([number, title, text]) => (
              <article className="how-step" key={number}>
                <span>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
                <ArrowRight size={18} />
              </article>
            ))}
          </div>
        </section>

        <section className="download-section" id="download">
          <div className="download-mark">
            <Leaf size={27} />
          </div>
          <span className="landing-eyebrow">YOUR GAME TRAVELS WITH YOU</span>
          <h2>
            Your Cricket.
            <br />
            <em>Your Score. Anywhere.</em>
          </h2>
          <p>
            No account or connection is needed to score after installation and offline preparation.
            Your records stay in this browser profile.
          </p>
          {offline.installed ? (
            <a className="button landing-primary" href="/app/">
              <ArrowRight size={18} /> Open Crease
            </a>
          ) : (
            <button className="button landing-primary" onClick={download}>
              <Download size={18} /> Install Crease
            </button>
          )}
          {instructions && !offline.installed && (
            <div className="install-instructions" id="install-instructions" role="status">
              <strong>
                {device === 'ios'
                  ? 'Install on iPhone or iPad'
                  : device === 'android'
                    ? 'Install on Android'
                    : 'Install on desktop'}
              </strong>
              <p>
                {device === 'ios'
                  ? 'Open this page in Safari, tap Share, then Add to Home Screen. iPhone and iPad do not use the Chromium installation prompt.'
                  : device === 'android'
                    ? 'Open your browser menu and choose Install app or Add to Home screen.'
                    : 'Use the install icon in your browser address bar, or choose Install Crease from the browser menu.'}
              </p>
              <p className="offline-setup-status">{offline.installationMessage}</p>
            </div>
          )}
          <p className="offline-setup-status" role="status">
            {offline.installationMessage} · {offline.message}
          </p>
          {!offline.ready && offline.message.startsWith('Offline Preparation Failed') && (
            <button className="text-link" onClick={offline.retry}>
              Retry Offline Preparation
            </button>
          )}
          <p className="install-note">Crease is a web app, not an APK or EXE download.</p>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="landing-brand" href="/" aria-label="Crease home">
          <span className="landing-logo">
            <Leaf size={20} />
          </span>
          crease<span>.</span>
        </a>
        <p>Your game, recorded. Your records stay on your device.</p>
        <nav aria-label="Footer navigation">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="/app/">Open app</a>
          <a href="/app/more/">Privacy & backups</a>
        </nav>
        <small>© {new Date().getFullYear()} Crease · Built for the love of the game.</small>
      </footer>
    </div>
  );
}
