import type React from 'react';
import type { CheckOutcome, CheckResult } from '../../checks';
import { DiceRow } from './DiceRow';

function outcomeBadgeClass(outcome: CheckOutcome): string {
  if (outcome === 'success') return 'badge badge-success';
  if (outcome === 'tie') return 'badge badge-tie';
  return 'badge badge-failure';
}

function outcomeLabel(outcome: CheckOutcome): string {
  return outcome === 'tie' ? 'TIE — Twist' : outcome.toUpperCase();
}

export interface RollSummaryProps {
  readonly title: string;
  readonly checkResult: CheckResult;
  readonly xpText: string;
  readonly actionDescription?: string;
  readonly timestamp?: string;
  readonly showTwistBanner?: boolean;
}

export function RollSummary(props: RollSummaryProps): React.JSX.Element {
  const { title, checkResult, xpText, actionDescription, timestamp, showTwistBanner } = props;
  const marginText = checkResult.margin > 0 ? `+${checkResult.margin}` : `${checkResult.margin}`;
  const { opposition } = checkResult;

  return (
    <>
      <div className="row-between">
        <strong className="roll-title">{title}</strong>
        <div className="row">
          <span className={outcomeBadgeClass(checkResult.outcome)}>
            {outcomeLabel(checkResult.outcome)} ({marginText})
          </span>
          {timestamp && (
            <time className="muted" dateTime={timestamp}>
              {new Date(timestamp).toLocaleTimeString()}
            </time>
          )}
        </div>
      </div>
      {actionDescription && <p className="muted">“{actionDescription}”</p>}
      {showTwistBanner && checkResult.outcome === 'tie' && (
        <p className="twist-banner">
          TIE — Partial Success with Twist (0 XP): Accomplish your goal barely, with an unexpected twist or minor consequence.
        </p>
      )}
      <div className="row">
        <span className="row">
          <span>Actor:</span>
          <DiceRow dice={checkResult.actor.rawDice} />
          <span className="badge">Total {checkResult.actor.finalTotal} (raw {checkResult.actor.rawTotal})</span>
        </span>
        <span className="row">
          <span>vs</span>
          {opposition.kind === 'rolled' && <DiceRow dice={opposition.pool.rawDice} />}
          <span className="badge">{opposition.kind === 'rolled' ? 'Opposition' : 'Target'} {opposition.total}</span>
        </span>
        <span className="muted">{xpText}</span>
      </div>
    </>
  );
}
