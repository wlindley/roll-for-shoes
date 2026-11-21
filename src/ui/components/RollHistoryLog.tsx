import type React from 'react';
import type { CampaignRollLogEntry } from '../../campaign';
import { DiceRow, outcomeBadgeClass, outcomeLabel } from './CheckRollerPanel';

export interface RollHistoryLogProps {
  readonly entries: readonly CampaignRollLogEntry[];
}

export function RollHistoryLog({ entries }: RollHistoryLogProps): React.JSX.Element {
  return (
    <section className="panel stack" aria-label="Roll history">
      <h2>Roll History ({entries.length})</h2>
      {entries.length === 0 ? (
        <p className="muted">No checks rolled in this campaign yet.</p>
      ) : (
        <ol className="skill-list">
          {entries.map((entry) => {
            const { checkResult } = entry;
            const marginText = checkResult.margin > 0 ? `+${checkResult.margin}` : `${checkResult.margin}`;
            return (
              <li key={entry.id} className="card stack">
                <div className="row-between">
                  <strong>
                    {entry.kind === 'character_opposed'
                      ? `${entry.actorName} (${entry.actorSkillName}) vs ${entry.defenderName} (${entry.defenderSkillName})`
                      : `${entry.actorName} — ${entry.actorSkillName}`}
                  </strong>
                  <div className="row">
                    <span className={outcomeBadgeClass(checkResult.outcome)}>{outcomeLabel(checkResult.outcome)} ({marginText})</span>
                    <time className="muted" dateTime={entry.timestamp}>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </time>
                  </div>
                </div>
                {entry.actionDescription && <p className="muted">“{entry.actionDescription}”</p>}
                <div className="row">
                  <DiceRow dice={checkResult.actor.rawDice} />
                  <span className="badge">Total {checkResult.actor.finalTotal} (raw {checkResult.actor.rawTotal})</span>
                  <span>vs</span>
                  {checkResult.opposition.pool && <DiceRow dice={checkResult.opposition.pool.rawDice} />}
                  <span className="badge">{checkResult.opposition.pool ? 'Opposition' : 'Target'} {checkResult.opposition.total}</span>
                  <span className="muted">
                    {entry.kind === 'character_opposed'
                      ? `XP: ${entry.actorName} +${entry.actorXpEarned}, ${entry.defenderName} +${entry.defenderXpEarned ?? 0}`
                      : `XP: +${entry.actorXpEarned}`}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
