'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Cloud,
  Download,
  Menu,
  Moon,
  Play,
  ShieldCheck,
  Smartphone,
  Trophy,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { useOffline } from './offline';
import CreaseLogo from './CreaseLogo';

const links = [
  ['Features', '/features/'],
  ['How it works', '/how-it-works/'],
  ['Download', '/download/'],
  ['About', '/about/'],
];

const featureData = [
  [
    'Ball-by-ball scoring',
    'Record runs, extras, wickets and every legal delivery with touch-friendly controls.',
    Play,
  ],
  [
    'Scorecards that add up',
    'See innings totals, batting, bowling, extras and a result calculated from the match history.',
    Trophy,
  ],
  [
    'Teams and players',
    'Build squads, manage team memberships and retain the players behind each scorebook.',
    Users,
  ],
  [
    'Statistics and rankings',
    'Review completed-match performance with transparent player rankings and team statistics.',
    BarChart3,
  ],
  [
    'Backups and sync',
    'Keep eligible account records backed up and synchronized when connectivity is available.',
    Cloud,
  ],
  [
    'Offline-first',
    'Prepare Crease while connected, then score matches offline with local records.',
    WifiOff,
  ],
];

function Brand() {
  return (
    <Link className="site-brand" href="/" aria-label="Crease home">
      <CreaseLogo />
    </Link>
  );
}

function ProductPreview({ kind = 'score' }) {
  if (kind === 'setup')
    return (
      <div className="product-preview preview-setup" aria-label="Match setup preview">
        <div className="preview-bar">
          <span>NEW MATCH</span>
          <b>STEP 1 OF 3</b>
        </div>
        <label>
          Team one<strong>Royal club</strong>
        </label>
        <label>
          Team two<strong>Chota latiyawala</strong>
        </label>
        <div className="setup-format">
          <span>20 overs</span>
          <span>11 players</span>
          <span>Local match</span>
        </div>
        <button type="button" tabIndex={-1}>
          Continue to toss <ArrowRight size={13} />
        </button>
      </div>
    );
  if (kind === 'matches')
    return (
      <div className="product-preview preview-matches" aria-label="Match list preview">
        <div className="preview-bar">
          <span>MY MATCHES</span>
          <b>+ New match</b>
        </div>
        <div className="match-preview-row">
          <i className="match-live-dot" />
          <span>
            <strong>Royal club v North stars</strong>
            <small>20 overs · In progress</small>
          </span>
          <b>96/3</b>
        </div>
        <div className="match-preview-row">
          <i className="match-complete-dot" />
          <span>
            <strong>Chota latiyawala v Royal club</strong>
            <small>Completed · 16.2 overs</small>
          </span>
          <b>146/6</b>
        </div>
        <div className="match-preview-row">
          <i className="match-upcoming-dot" />
          <span>
            <strong>Weekend XI v North stars</strong>
            <small>Scheduled · Sunday</small>
          </span>
          <b>›</b>
        </div>
      </div>
    );
  if (kind === 'teams')
    return (
      <div
        className="product-preview preview-teams"
        aria-label="Team and player management preview"
      >
        <div className="preview-bar">
          <span>Teams</span>
          <b>+ Add team</b>
        </div>
        {['Royal club', 'Chota latiyawala', 'North stars'].map((team, index) => (
          <div className="team-preview-row" key={team}>
            <i>{team[0]}</i>
            <span>
              <strong>{team}</strong>
              <small>{11 - index} players</small>
            </span>
            <b>›</b>
          </div>
        ))}
      </div>
    );
  if (kind === 'stats')
    return (
      <div className="product-preview preview-stats" aria-label="Player statistics preview">
        <div className="preview-bar">
          <span>Player rankings</span>
          <b>Top 20</b>
        </div>
        {[
          ['1', 'A. Khan', '418 runs'],
          ['2', 'M. Ali', '15 wickets'],
          ['3', 'S. Ahmed', '316 runs'],
        ].map(([rank, name, detail]) => (
          <div className="stat-preview-row" key={rank}>
            <i>{rank}</i>
            <span>
              <strong>{name}</strong>
              <small>{detail}</small>
            </span>
            <b>›</b>
          </div>
        ))}
      </div>
    );
  if (kind === 'scorecard')
    return (
      <div className="product-preview preview-scorecard" aria-label="Completed scorecard preview">
        <div className="preview-bar">
          <span>FINAL SCORECARD</span>
          <b>Chota latiyawala won</b>
        </div>
        <div className="scorecard-result">
          <strong>146/6</strong>
          <span>16.2 overs · won by 4 wickets</span>
        </div>
        <div className="scorecard-table">
          <b>BATTER</b>
          <b>R</b>
          <b>B</b>
          <span>Hussnain Ali</span>
          <span>42</span>
          <span>31</span>
          <span>Imran Khan</span>
          <span>36</span>
          <span>27</span>
        </div>
        <div className="scorecard-bowling">
          <span>Royal club 145 all out</span>
          <span>Extras 12 · 18.4 overs</span>
        </div>
      </div>
    );
  if (kind === 'sync')
    return (
      <div
        className="product-preview preview-sync"
        aria-label="Illustrative cloud sync status preview"
      >
        <div className="preview-bar">
          <span>SYNC &amp; OFFLINE</span>
          <b>ILLUSTRATIVE VIEW</b>
        </div>
        <div className="sync-state">
          <Cloud size={25} />
          <div>
            <strong>Cloud status after confirmation</strong>
            <small>Shown only when an account is signed in</small>
          </div>
          <Check size={20} />
        </div>
        <div className="sync-row">
          <span>Offline scoring</span>
          <b>Ready after setup</b>
        </div>
        <div className="sync-row">
          <span>Pending changes</span>
          <b>Shown when queued</b>
        </div>
        <div className="sync-row">
          <span>Last cloud sync</span>
          <b>Shown after success</b>
        </div>
      </div>
    );
  if (kind === 'offline')
    return (
      <div className="product-preview preview-offline" aria-label="Offline-ready scoring preview">
        <div className="preview-bar">
          <span>OFFLINE READY</span>
          <b>LOCAL RECORDS</b>
        </div>
        <div className="offline-state">
          <WifiOff size={25} />
          <div>
            <strong>Keep scoring without a signal</strong>
            <small>Deliveries stay on this device until a connection returns.</small>
          </div>
        </div>
        <div className="offline-meter">
          <span>
            <i />
            <i />
            <i />
            <i />
          </span>
          <b>Match setup saved locally</b>
        </div>
        <div className="offline-note">
          Cloud backup resumes only after successful synchronization.
        </div>
      </div>
    );
  if (kind === 'scoring')
    return (
      <div
        className="product-preview preview-scoring"
        aria-label="Ball by ball scoring controls preview"
      >
        <div className="preview-bar">
          <span>LIVE SCORING</span>
          <b>12.4 overs</b>
        </div>
        <div className="scoring-score">
          <span>Royal club</span>
          <strong>
            96<em>/3</em>
          </strong>
          <small>Striker 36 (24) · Bowler 2/18</small>
        </div>
        <div className="scoring-controls-preview">
          <span>0</span>
          <span>1</span>
          <span>2</span>
          <span>3</span>
          <b>4</b>
          <b>6</b>
          <i>WD</i>
          <i>NB</i>
          <i>WKT</i>
        </div>
        <div className="preview-balls">
          <small>THIS OVER</small>
          {[1, 0, 4, 'WD', 2, 1].map((ball, index) => (
            <i className={ball === 4 ? 'boundary' : ball === 'WD' ? 'wicket' : ''} key={index}>
              {ball}
            </i>
          ))}
        </div>
      </div>
    );
  return (
    <div className="product-preview preview-score" aria-label="Crease scoring interface preview">
      <div className="preview-bar">
        <span>LIVE MATCH</span>
        <b>16.2 overs</b>
      </div>
      <p className="preview-team-label">CHOTA LATIYAWALA</p>
      <strong className="preview-score-total">
        146<span>/6</span>
      </strong>
      <p className="preview-subscore">Need 0 from 22 balls</p>
      <div className="preview-players">
        <span>
          <b>Hussnain Ali</b>
          <small>42 (31)</small>
        </span>
        <span>
          <b>Royal club</b>
          <small>145 all out</small>
        </span>
      </div>
      <div className="preview-balls">
        <small>THIS OVER</small>
        {[1, 4, 0, 2, 'W', 1].map((ball, index) => (
          <i className={ball === 4 ? 'boundary' : ball === 'W' ? 'wicket' : ''} key={index}>
            {ball}
          </i>
        ))}
      </div>
    </div>
  );
}

function InstallButton({ className = 'site-button primary' }) {
  const offline = useOffline();
  const [showHelp, setShowHelp] = useState(false);
  const [device, setDevice] = useState('desktop');
  useEffect(() => {
    const ua = navigator.userAgent;
    setDevice(/iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop');
  }, []);
  async function install() {
    const result = await offline.install();
    if (['instructions', 'dismissed', 'error'].includes(result)) setShowHelp(true);
  }
  return (
    <div className="install-control">
      {offline.installed ? (
        <Link className={className} href="/app/">
          <ArrowRight size={17} /> Open Crease
        </Link>
      ) : (
        <button className={className} type="button" onClick={install}>
          <Download size={17} /> Install Crease
        </button>
      )}
      {showHelp && (
        <p className="install-guidance" role="status">
          {device === 'ios'
            ? 'In Safari, choose Share, then Add to Home Screen.'
            : device === 'android'
              ? 'Open your browser menu and choose Install app or Add to Home screen.'
              : 'Use your browser address-bar install icon or its Install app menu item.'}
        </p>
      )}
    </div>
  );
}

function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const navRef = useRef(null);
  useEffect(() => {
    setOpen(false);
  }, [path]);
  useEffect(() => {
    const close = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!navRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <header className="site-header">
      <nav ref={navRef} className="site-nav" aria-label="Main navigation">
        <Brand />
        <button
          className="site-menu-button"
          type="button"
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <div id="site-menu" className={`site-nav-links ${open ? 'open' : ''}`}>
          {links.map(([label, href]) => (
            <Link key={href} className={path === href ? 'active' : ''} href={href}>
              {label}
            </Link>
          ))}
          <Link href="/account/login/">Sign in</Link>
          <Link className="site-button nav-button" href="/app/">
            Open app <ArrowRight size={15} />
          </Link>
        </div>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <Brand />
        <p>Cricket scoring built for the moments that matter, wherever the match takes you.</p>
      </div>
      <div>
        <strong>Product</strong>
        <Link href="/features/">Features</Link>
        <Link href="/how-it-works/">How it works</Link>
        <Link href="/download/">Install Crease</Link>
        <Link href="/app/">Open app</Link>
      </div>
      <div>
        <strong>Resources</strong>
        <Link href="/help/">Help centre</Link>
        <Link href="/privacy/">Privacy</Link>
        <Link href="/terms/">Terms</Link>
        <Link href="/about/">About Crease</Link>
      </div>
      <small>© {new Date().getFullYear()} Crease. Made for local cricket.</small>
    </footer>
  );
}

function Home() {
  return (
    <>
      <section className="site-hero">
        <div className="hero-copy">
          <p className="site-kicker">
            <i /> CRICKET, KEPT CLEAR
          </p>
          <h1>
            Every Ball.
            <br />
            <em>Every Moment.</em>
          </h1>
          <p>
            Score cricket matches with confidence, even without internet. Manage teams, track player
            performances, and keep every match organized with Crease.
          </p>
          <div className="site-actions">
            <Link className="site-button primary" href="/app/">
              Start scoring <ArrowRight size={17} />
            </Link>
            <InstallButton className="site-button secondary" />
          </div>
          <div className="hero-notes">
            <span>
              <ShieldCheck size={16} /> Local-first records
            </span>
            <span>
              <WifiOff size={16} /> Offline-ready scoring
            </span>
          </div>
        </div>
        <div className="hero-stage">
          <div className="hero-glow" />
          <ProductPreview />
          <div className="hero-chip">
            <i>
              <WifiOff size={16} />
            </i>
            <span>
              <strong>Keep scoring</strong>
              <small>Even without a signal</small>
            </span>
            <Check size={18} />
          </div>
          <div className="hero-signal">C</div>
        </div>
      </section>
      <section className="site-proof">
        <p>BUILT FOR LOCAL CRICKET</p>
        <div>
          <span>
            <Play /> Ball-by-ball
          </span>
          <span>
            <WifiOff /> Offline ready
          </span>
          <span>
            <Users /> Team management
          </span>
          <span>
            <BarChart3 /> Match statistics
          </span>
        </div>
      </section>
      <FeatureSection />
      <section className="site-showcase alternate">
        <div>
          <p className="site-kicker">MATCH DAY, MADE SIMPLE</p>
          <h2>
            Keep the score moving.
            <br />
            Keep the details right.
          </h2>
          <p>
            Runs, extras, wickets, strike changes and overs are captured from the same delivery
            history that powers the scorecard.
          </p>
          <Link className="text-action" href="/features/">
            Explore scoring features <ArrowRight size={16} />
          </Link>
        </div>
        <ProductPreview />
      </section>
      <section className="site-showcase">
        <ProductPreview kind="teams" />
        <div>
          <p className="site-kicker">ONE SCOREBOOK, ONE PLACE</p>
          <h2>Teams, players and match history—organized.</h2>
          <p>
            Create squads, keep player identities connected to matches, and return to completed
            scorecards whenever you need them.
          </p>
          <Link className="text-action" href="/how-it-works/">
            See how Crease works <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      <section className="site-showcase alternate">
        <div>
          <p className="site-kicker">PERFORMANCE WITH CONTEXT</p>
          <h2>See the game behind the score.</h2>
          <p>
            Completed match histories power player statistics, team performance and transparent
            rankings.
          </p>
          <Link className="text-action" href="/features/">
            View all capabilities <ArrowRight size={16} />
          </Link>
        </div>
        <ProductPreview kind="stats" />
      </section>
      <Steps />
      <FinalCta />
    </>
  );
}

function FeatureSection() {
  return (
    <section className="site-section">
      <header className="site-section-heading">
        <p className="site-kicker">A COMPLETE SCOREBOOK</p>
        <h2>Everything needed to record a real match.</h2>
        <p>
          Crease keeps the scorebook practical: quick at the boundary, detailed after the final
          ball.
        </p>
      </header>
      <div className="benefit-grid">
        {featureData.slice(0, 4).map(([title, text, Icon], index) => (
          <article key={title}>
            <span>
              <Icon size={20} />
            </span>
            <small>0{index + 1}</small>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
function Steps({ visual = false }) {
  const steps = [
    [
      '01',
      'Set up the match',
      'Choose teams, players, match rules and the opening lineup.',
      'teams',
    ],
    [
      '02',
      'Score every delivery',
      'Record runs, extras, wickets and overs with a scorebook built for match day.',
      'scoring',
    ],
    [
      '03',
      'Review the result',
      'Open the completed scorecard and see player performance in context.',
      'scorecard',
    ],
  ];
  return (
    <section className={`steps-section ${visual ? 'steps-visual' : ''}`}>
      <div>
        <p className="site-kicker">HOW IT WORKS</p>
        <h2>
          {visual
            ? 'Three practical moments. One reliable scorebook.'
            : 'From toss to scorecard in a few clear steps.'}
        </h2>
        <p>{visual ? 'Each screen follows the match in the same order a scorer does.' : null}</p>
      </div>
      <ol>
        {steps.map(([number, title, text, kind]) => (
          <li key={number}>
            <b>{number}</b>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
              {visual && <ProductPreview kind={kind} />}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
function FinalCta() {
  return (
    <section className="final-cta">
      <p className="site-kicker">READY AT THE BOUNDARY</p>
      <h2>Your cricket deserves a reliable scorebook.</h2>
      <p>Start a scorebook in your browser, then take it wherever the next match is played.</p>
      <div className="site-actions">
        <Link className="site-button light" href="/app/">
          Start scoring <ArrowRight size={17} />
        </Link>
        <Link className="site-button ghost" href="/download/">
          Install Crease
        </Link>
      </div>
    </section>
  );
}

function Features() {
  const visuals = ['scoring', 'scorecard', 'teams', 'stats', 'sync', 'offline'];
  const anchors = [
    'live-scoring',
    'scorecards',
    'teams-players',
    'statistics',
    'backup-sync',
    'offline-first',
  ];
  return (
    <>
      <section className="features-hero">
        <div>
          <p className="site-kicker">FEATURES</p>
          <h1>
            Every detail of the game.
            <br />
            <em>One scorebook.</em>
          </h1>
          <p>
            Crease turns a live cricket match into a clear, replayable record without making scoring
            feel like admin.
          </p>
          <div className="site-actions">
            <Link className="site-button primary" href="/app/">
              Start Scoring <ArrowRight size={17} />
            </Link>
            <Link className="site-button secondary" href="/how-it-works/">
              How it works <Play size={16} />
            </Link>
          </div>
          <div className="feature-benefits">
            <span>
              <WifiOff size={15} /> Offline-first
            </span>
            <span>
              <Check size={15} /> Fast &amp; simple
            </span>
            <span>
              <Trophy size={15} /> Built for local cricket
            </span>
          </div>
        </div>
        <div className="features-phones">
          <ProductPreview kind="scoring" />
          <ProductPreview kind="matches" />
        </div>
      </section>
      <nav className="feature-nav-strip" aria-label="Feature sections">
        {featureData.map(([title, , Icon], index) => (
          <a key={title} href={`#${anchors[index]}`}>
            <Icon size={17} />
            <span>{title}</span>
          </a>
        ))}
      </nav>
      <section className="features-grid-intro">
        <p className="site-kicker">A CLOSER LOOK</p>
        <h2>A closer look at Crease features</h2>
        <p>Everything you need to score, manage and review cricket matches—in one place.</p>
      </section>
      <section className="feature-card-grid">
        {featureData.map(([title, text, Icon], index) => (
          <article id={anchors[index]} key={title}>
            <header>
              <span>
                <Icon size={19} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </header>
            <div className={`feature-card-preview feature-art-${visuals[index]}`}>
              <ProductPreview kind={visuals[index]} />
            </div>
          </article>
        ))}
      </section>
      <section className="features-cta">
        <div>
          <p className="site-kicker">READY TO START SCORING?</p>
          <h2>Create a match, score live and keep a complete record.</h2>
        </div>
        <div className="site-actions">
          <Link className="site-button light" href="/app/">
            Start Scoring <ArrowRight size={17} />
          </Link>
          <InstallButton className="site-button ghost" />
        </div>
      </section>
    </>
  );
}

const howSteps = [
  [
    '01',
    'Set up the match',
    'Choose teams, players, match rules and the opening lineup.',
    Users,
    'setup',
  ],
  [
    '02',
    'Score every delivery',
    'Record runs, extras, wickets and overs with simple, touch-friendly controls.',
    Play,
    'scoring',
  ],
  [
    '03',
    'Review the result',
    'Open the completed scorecard and see player performance.',
    Trophy,
    'scorecard',
  ],
];

function HowItWorks() {
  return (
    <>
      <section className="how-hero">
        <div className="how-hero-copy">
          <p className="site-kicker">HOW IT WORKS</p>
          <h1>
            From setup to the
            <br />
            <em>final result.</em>
          </h1>
          <p>
            A simple, reliable workflow for every match. Create a match, score each delivery and get
            a complete scorecard with player performance, all in one place.
          </p>
          <div className="site-actions">
            <Link className="site-button primary" href="/app/">
              Start Scoring <ArrowRight size={17} />
            </Link>
            <Link className="site-button secondary" href="/features/">
              Explore Features <Play size={16} />
            </Link>
          </div>
        </div>
        <div className="how-ground" aria-hidden="true">
          <picture>
            <source media="(max-width: 900px)" srcSet="/howitwork-mobile.webp" type="image/webp" />
            <Image
              src="/howitwork.webp"
              alt=""
              width={1536}
              height={1024}
              sizes="(max-width: 900px) 100vw, 50vw"
              fetchPriority="high"
            />
          </picture>
        </div>
      </section>
      <section className="how-process">
        <header>
          <p className="site-kicker">THE PROCESS</p>
          <h2>Three simple steps to a complete scorecard.</h2>
          <p>Each screen follows the same practical order a scorer uses on match day.</p>
        </header>
        <div className="how-step-grid">
          {howSteps.map(([number, title, text, Icon, kind], index) => (
            <article key={number}>
              <span className="how-step-number">{number}</span>
              <span className="how-step-icon">
                <Icon size={21} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
              <div className="how-step-preview">
                <ProductPreview kind={kind} />
              </div>
              {index < howSteps.length - 1 && (
                <ArrowRight className="how-step-arrow" size={24} aria-hidden="true" />
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="how-completion">
        <div>
          <span>
            <Check size={22} />
          </span>
          <div>
            <p className="site-kicker">THAT&apos;S IT</p>
            <h2>Set up, score and review a complete match.</h2>
            <p>
              Crease keeps the match record connected from the first ball to the finished scorecard.
            </p>
          </div>
        </div>
        <div className="completion-stumps" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </section>
      <section className="how-faq">
        <div>
          <p className="site-kicker">COMMON QUESTIONS</p>
          <h2>Good to know before match day.</h2>
          <p>
            Quick answers to common questions about scoring, offline use, installation and data
            safety.
          </p>
        </div>
        <div>
          {[
            [
              'Can I score without internet?',
              'Yes, after offline preparation completes. Changes stay on this device and can synchronize only after a signed-in account reconnects successfully.',
            ],
            [
              'Can I correct a score?',
              'Use the supported correction and undo controls in the match experience. Crease preserves the delivery history used to calculate the scorecard.',
            ],
            [
              'Will a backup restore my records?',
              'A valid Crease JSON backup can be imported into the appropriate workspace. Pending local changes are not a confirmed cloud backup until synchronization succeeds.',
            ],
            [
              'Does installation require an app store?',
              'No. Crease is a Progressive Web App installed through supported browsers, not an APK, EXE or required app-store download.',
            ],
          ].map(([question, answer], index) => (
            <details key={question} open={index === 0}>
              <summary>
                {question}
                <ChevronDown size={18} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="how-final-cta">
        <div>
          <p className="site-kicker">READY AT THE BOUNDARY</p>
          <h2>Your cricket deserves a reliable scorebook.</h2>
          <p>Create a match, score live and keep a complete record with Crease.</p>
          <div className="site-actions">
            <Link className="site-button light" href="/app/">
              Start Scoring <ArrowRight size={17} />
            </Link>
            <InstallButton className="site-button ghost" />
          </div>
        </div>
        <div className="how-cta-preview">
          <ProductPreview kind="scorecard" />
        </div>
      </section>
    </>
  );
}

function DownloadPage() {
  return (
    <>
      <section className="download-hero">
        <div>
          <p className="site-kicker">INSTALL CREASE</p>
          <h1>Bring the scorebook to the ground.</h1>
          <p>
            Crease is a Progressive Web App: open it in a browser, optionally install it, then
            prepare it for offline scoring while connected.
          </p>
          <InstallButton />
          <p className="subtle-note">Crease is not an APK, EXE or separate native app download.</p>
        </div>
        <div className="phone-shell">
          <ProductPreview />
        </div>
      </section>
      <section className="install-steps">
        <article>
          <Smartphone />
          <h2>Android</h2>
          <p>
            Open the browser menu and choose <b>Install app</b> or <b>Add to Home screen</b> when
            available.
          </p>
        </article>
        <article>
          <Moon />
          <h2>iPhone &amp; iPad</h2>
          <p>
            Open Crease in Safari, tap <b>Share</b>, then choose <b>Add to Home Screen</b>.
          </p>
        </article>
        <article>
          <Download />
          <h2>Desktop</h2>
          <p>
            Use your browser address-bar install icon or the browser menu on supported browsers.
          </p>
        </article>
      </section>
      <section className="site-section install-explainer">
        <p className="site-kicker">WHAT TO EXPECT</p>
        <h2>Offline, updates and your records.</h2>
        <div>
          <p>
            <strong>Offline scoring:</strong> Prepare while connected; Crease caches the application
            shell and keeps scorebook data locally.
          </p>
          <p>
            <strong>Updates:</strong> New versions are detected when you return online. Crease waits
            during live scoring and restarts safely when appropriate.
          </p>
          <p>
            <strong>Cloud backup:</strong> A record is available on another device only after it has
            successfully synchronized to your signed-in account.
          </p>
        </div>
      </section>
    </>
  );
}

function About() {
  return (
    <>
      <section className="about-editorial-hero">
        <div className="about-editorial-title">
          <p className="site-kicker">ABOUT CREASE · A SCOREBOOK FOR LOCAL CRICKET</p>
          <h1>
            Built for the game
            <br />
            <em>we play.</em>
          </h1>
        </div>
        <div className="about-editorial-intro">
          <p>
            Crease was created to make cricket scoring simpler for local players and teams, even
            when the internet is unreliable.
          </p>
          <Link className="text-action" href="/how-it-works/">
            Explore how Crease works <ArrowRight size={16} />
          </Link>
        </div>
        <figure className="about-editorial-photo">
          <picture>
            <source media="(max-width: 900px)" srcSet="/about-mobile.webp" type="image/webp" />
            <Image
              src="/about.webp"
              alt="A cricket pitch, stumps and ball beneath an open sky."
              width={1448}
              height={1086}
              sizes="(max-width: 900px) calc(100vw - 28px), 92vw"
              fetchPriority="high"
            />
          </picture>
        </figure>
        <div className="about-editorial-caption">
          <span>A local game, recorded as it unfolds.</span>
          <span>01 / THE SCOREBOOK</span>
        </div>
      </section>
      <section className="about-story">
        <div className="about-section-index">
          <span>OUR STORY</span>
          <span>01 — WHY CREASE EXISTS</span>
        </div>
        <div className="about-story-copy">
          <h2>Cricket deserves more than a forgotten scorebook.</h2>
          <p>
            Local cricket creates moments worth remembering. Paper scorebooks, scattered match
            details and unreliable connectivity can make an accurate record difficult to keep.
            Crease brings scoring, teams and player performances into one organized place.
          </p>
        </div>
      </section>
      <section className="about-comparison">
        <header className="about-section-heading">
          <p className="site-kicker">THE CHALLENGE, AND A PRACTICAL RESPONSE</p>
          <h2>Keep the whole match connected.</h2>
        </header>
        <div className="about-comparison-columns">
          <article>
            <p className="about-column-label">THE CHALLENGE</p>
            <ul>
              <li><span>01</span> Paper scorebooks take care and attention to maintain.</li>
              <li><span>02</span> Player and match details can end up scattered.</li>
              <li><span>03</span> A ground’s internet connection can be unreliable.</li>
            </ul>
          </article>
          <article>
            <p className="about-column-label">THE CREASE APPROACH</p>
            <ul>
              <li><span>01</span> Record the innings delivery by delivery.</li>
              <li><span>02</span> Keep teams, players and completed scorecards together.</li>
              <li><span>03</span> Prepare while connected, then score locally offline.</li>
            </ul>
            <p className="about-sync-note">
              Account copies appear on another device after synchronization succeeds.
            </p>
          </article>
        </div>
      </section>
      <section className="about-principles">
        <header>
          <p className="site-kicker">PRODUCT PHILOSOPHY · 02</p>
          <h2>Useful at the boundary. Careful with the record.</h2>
        </header>
        <div className="about-principle-list">
          <article>
            <span>01</span>
            <div>
              <h3>Simplicity</h3>
              <p>Scoring should be easy to understand and quick to operate during a real match.</p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>Reliability</h3>
              <p>Keep records on this device and show cloud status only after confirmed sync.</p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>Accessibility</h3>
              <p>Score with ordinary phones and supported browsers, at the ground or at home.</p>
            </div>
          </article>
        </div>
      </section>
      <section className="about-showcase">
        <div className="about-showcase-copy">
          <p className="site-kicker">ONE MATCH, CLEARLY RECORDED · 03</p>
          <h2>From the first ball to the final score.</h2>
          <p>
            Set up the sides, record each delivery, then review the completed scorecard and player
            performance in one place.
          </p>
          <Link className="text-action" href="/features/#live-scoring">
            See how scoring works <ArrowRight size={16} />
          </Link>
        </div>
        <div className="about-sample-scorecard" aria-label="Illustrative sample scorecard">
          <div className="about-sample-heading">
            <span>ILLUSTRATIVE SAMPLE</span>
            <span>COMPLETED MATCH</span>
          </div>
          <h3>Final scorecard</h3>
          <div className="about-sample-innings">
            <div><span>Team A</span><strong>110/4</strong><small>15.3 overs</small></div>
            <div><span>Team B</span><strong>108/7</strong><small>20 overs</small></div>
          </div>
          <p className="about-sample-result">Team A won by 6 wickets</p>
          <p className="about-sample-footnote">Example figures shown for illustration.</p>
        </div>
      </section>
      <section className="about-closing">
        <div className="about-closing-copy">
          <p className="site-kicker">YOUR NEXT SCOREBOOK</p>
          <h2>Every match has a story. Keep yours.</h2>
          <p>Start scoring with Crease and keep the moments that matter organized.</p>
          <div className="site-actions">
            <Link className="site-button primary" href="/app/">
              Start Scoring <ArrowRight size={17} />
            </Link>
            <Link className="site-button secondary" href="/how-it-works/">
              Learn how it works
            </Link>
          </div>
        </div>
        <figure className="about-closing-image">
          <picture>
            <source media="(max-width: 720px)" srcSet="/ready-mobile.webp" type="image/webp" />
            <Image
              className="about-closing-photo"
              src="/ready.webp"
              alt="A batter playing a shot on a lit cricket ground."
              width={1448}
              height={1086}
              sizes="(max-width: 720px) calc(100vw - 56px), 42vw"
              loading="lazy"
            />
          </picture>
        </figure>
      </section>
    </>
  );
}

function Help() {
  const [query, setQuery] = useState('');
  const topics = [
    ['Starting a match', 'Create teams and players, then set match rules and lineups before play.'],
    [
      'Scoring deliveries',
      'Use scoring controls to record runs, extras, wickets and bowling changes.',
    ],
    [
      'Editing scores',
      'Use the supported match correction and undo controls; preserve the delivery history.',
    ],
    ['Teams and players', 'Manage teams, memberships and player records from the app navigation.'],
    ['Statistics', 'Statistics and rankings use completed, eligible match histories.'],
    [
      'Offline scoring',
      'Prepare the app while online before relying on it at a ground with no signal.',
    ],
    [
      'Cloud backup and recovery',
      'Sign in, allow confirmed synchronization, and check pending changes before moving devices.',
    ],
    [
      'Troubleshooting',
      'Check connection, sync status and a local JSON backup before taking destructive action.',
    ],
  ];
  const filtered = useMemo(
    () =>
      topics.filter(([title, text]) =>
        `${title} ${text}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );
  return (
    <>
      <section className="page-hero compact">
        <p className="site-kicker">HELP CENTRE</p>
        <h1>Find the next step, quickly.</h1>
        <p>Practical guidance for common Crease tasks.</p>
        <label className="help-search">
          <span className="sr-only">Search help</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search help topics"
          />
        </label>
      </section>
      <section className="help-grid">
        {filtered.map(([title, text]) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
            <Link href="/app/">
              Open Crease <ArrowRight size={15} />
            </Link>
          </article>
        ))}
      </section>
    </>
  );
}

function Legal({ type }) {
  const privacy = type === 'privacy';
  return (
    <section className="legal-page">
      <p className="site-kicker">{privacy ? 'PRIVACY POLICY' : 'TERMS OF SERVICE'}</p>
      <h1>{privacy ? 'Your scorebook, explained clearly.' : 'Using Crease responsibly.'}</h1>
      <p className="legal-lead">
        This plain-language {privacy ? 'privacy policy' : 'terms page'} describes the current Crease
        product. It requires owner and legal review before a public production launch.
      </p>
      <h2>{privacy ? 'What Crease stores' : 'Using the service'}</h2>
      <p>
        {privacy
          ? 'Crease stores scoring records in the browser on the device you use. If you sign in and synchronization succeeds, account-scoped records are sent to the authorized Crease cloud service. JSON backups are created only when you request an export.'
          : 'You are responsible for the accuracy of the scorebooks you create and for protecting access to your team account and exported backup files.'}
      </p>
      <h2>{privacy ? 'How data is shared' : 'Availability and changes'}</h2>
      <p>
        {privacy
          ? 'Crease does not intentionally share your account data with other teams. Team members and authorized devices may access team records according to the application’s account and membership controls.'
          : 'Crease is provided as an evolving web application. Features, compatibility and availability may change as the product develops.'}
      </p>
      <h2>{privacy ? 'Important limitations' : 'Data and backups'}</h2>
      <p>
        {privacy
          ? 'Browser storage can be removed by a browser, operating system or user action. Uninstall behavior varies by platform. Unsynchronized local changes are not cloud backups.'
          : 'Keep exports of important scorebooks. Do not depend on a local browser cache as your sole archive, and do not clear pending changes before synchronization completes.'}
      </p>
      <h2>Review required</h2>
      <p>
        Contact details, retention periods, jurisdiction, ownership and final legal terms require
        confirmation by the product owner before publication.
      </p>
    </section>
  );
}

export default function PublicSite({ page = 'home' }) {
  const content = {
    home: <Home />,
    features: <Features />,
    how: <HowItWorks />,
    download: <DownloadPage />,
    about: <About />,
    help: <Help />,
    privacy: <Legal type="privacy" />,
    terms: <Legal type="terms" />,
  }[page];
  return (
    <div className="public-site">
      <Header />
      <main>{content}</main>
      <Footer />
    </div>
  );
}
