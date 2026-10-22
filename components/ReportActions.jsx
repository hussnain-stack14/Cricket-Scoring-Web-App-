'use client';
import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { result as matchResult } from '../lib/engine';
import { printReport } from '../lib/reports';
import { Button } from './ui';

export function DownloadScorecardButton({ match, states, compact = false }) {
  const [error, setError] = useState('');
  async function download() {
    try {
      setError('');
      const { downloadScorecardPdf } = await import('../lib/scorecardPdf');
      downloadScorecardPdf(match, states);
    } catch (downloadError) {
      console.error('Could not generate scorecard PDF', downloadError);
      setError(downloadError.message || 'Could not create the scorecard PDF.');
    }
  }
  return (
    <div className="scorecard-download-action">
      <Button compact={compact} onClick={download}>
        <Download size={17} /> Download Scorecard
      </Button>
      {error && (
        <span className="report-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export default function ReportActions({ match, states }) {
  const [error, setError] = useState('');
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    const checkShareSupport = async () => {
      if (!navigator.share || !navigator.canShare || typeof File === 'undefined') return;
      const probe = new File([''], 'scorecard.pdf', { type: 'application/pdf' });
      setCanShare(navigator.canShare({ files: [probe] }));
    };
    checkShareSupport();
  }, []);
  const teams = match.teams;
  const resultText = `${teams[0].name} vs ${teams[1].name} · ${matchResult(match, states)}`;
  const scores = states.map((state, index) => [
    teams[index === 0 ? match.firstBat : 1 - match.firstBat].name,
    `${state.runs}/${state.wickets}`,
    `${Math.floor(state.balls / 6)}.${state.balls % 6}`,
  ]);

  function saveReport(fullScorecard) {
    const sections = [
      {
        title: fullScorecard ? 'Innings summary' : 'Match result',
        headers: ['Team', 'Score', 'Overs'],
        rows: scores,
      },
    ];
    if (fullScorecard) {
      states.forEach((state, index) => {
        const battingIndex = index === 0 ? match.firstBat : 1 - match.firstBat;
        const battingTeam = teams[battingIndex];
        const fieldingTeam = teams[1 - battingIndex];
        sections.push({
          title: `${battingTeam.name} · Batting`,
          headers: ['Player', 'Runs', 'Balls', '4s', '6s', 'Strike rate', 'Dismissal'],
          rows: Object.values(state.batting).map((player) => [
            player.name,
            player.runs,
            player.balls,
            player.fours,
            player.sixes,
            player.balls ? ((player.runs / player.balls) * 100).toFixed(2) : '—',
            !player.played ? 'Did not bat' : player.out ? player.dismissal : 'Not out',
          ]),
        });
        sections.push({
          title: `${fieldingTeam.name} · Bowling`,
          headers: ['Player', 'Overs', 'Maidens', 'Runs', 'Wickets', 'Economy', 'Dots'],
          rows: Object.values(state.bowling)
            .filter((player) => player.bowled)
            .map((player) => [
              player.name,
              `${Math.floor(player.balls / 6)}.${player.balls % 6}`,
              player.maidens,
              player.runs,
              player.wickets,
              player.balls ? ((player.runs * 6) / player.balls).toFixed(2) : '—',
              player.dots,
            ]),
        });
        sections.push({
          title: 'Extras and fall of wickets',
          headers: ['Extras', 'Wides', 'No-balls', 'Byes', 'Leg-byes', 'Fall of wickets'],
          rows: [
            [
              Object.values(state.extras).reduce((sum, value) => sum + value, 0),
              state.extras.wide,
              state.extras.noBall,
              state.extras.bye,
              state.extras.legBye,
              state.falls.length
                ? state.falls
                    .map(
                      (fall) =>
                        `${fall.runs}/${fall.wickets} · ${state.batting[fall.player].name} (${Math.floor(fall.balls / 6)}.${fall.balls % 6})`,
                    )
                    .join('; ')
                : 'No wickets',
            ],
          ],
        });
      });
    }
    try {
      setError('');
      printReport({
        title: fullScorecard ? 'Full match scorecard' : 'Match result',
        subtitle: `${resultText} · ${match.date}${match.venue ? ` · ${match.venue}` : ''}`,
        sections,
      });
    } catch (reportError) {
      setError(reportError.message || 'Could not open the report. Allow pop-ups and try again.');
    }
  }

  async function shareScorecard() {
    try {
      setError('');
      const { shareScorecardPdf } = await import('../lib/scorecardPdf');
      await shareScorecardPdf(match, states);
    } catch (shareError) {
      if (shareError.name !== 'AbortError') {
        console.error('Could not share scorecard PDF', shareError);
        setError(shareError.message || 'Could not share the scorecard.');
      }
    }
  }

  return (
    <div className="report-actions" aria-label="Download match report">
      {match.status === 'completed' && (
        <>
          <DownloadScorecardButton match={match} states={states} />
          {canShare && (
            <Button secondary onClick={shareScorecard}>
              <FileText size={17} /> Share Scorecard
            </Button>
          )}
        </>
      )}
      <Button secondary onClick={() => saveReport(false)}>
        <FileText size={17} /> Result PDF
      </Button>
      {match.status !== 'completed' && (
        <>
          <Button secondary onClick={() => saveReport(true)}>
            <Download size={17} /> Full scorecard PDF
          </Button>
          <small>Opens a print-ready report. Choose “Save as PDF” in your browser.</small>
        </>
      )}
      {error && (
        <span className="report-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
