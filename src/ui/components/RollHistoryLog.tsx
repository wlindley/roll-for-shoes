import type React from 'react';
import type { CampaignRollLogEntry } from '../../campaign';
import { RollSummary } from './RollSummary';

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
          {entries.map((entry) => (
            <li key={entry.id} className="card stack">
              <RollSummary
                title={
                  entry.kind === 'character_opposed'
                    ? `${entry.actorName} (${entry.actorSkillName}) vs ${entry.defenderName} (${entry.defenderSkillName})`
                    : `${entry.actorName} — ${entry.actorSkillName}`
                }
                checkResult={entry.checkResult}
                actionDescription={entry.actionDescription}
                timestamp={entry.timestamp}
                xpText={
                  entry.kind === 'character_opposed'
                    ? `XP: ${entry.actorName} +${entry.actorXpEarned}, ${entry.defenderName} +${entry.defenderXpEarned}`
                    : `XP: +${entry.actorXpEarned}`
                }
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
