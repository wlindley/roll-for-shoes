import type React from 'react';
import type { Workspace } from '../../campaign';
import type { Character, SkillSlotConfig } from '../../character';

export interface SkillSlotBarProps {
  readonly workspace: Workspace;
  readonly character: Character;
  readonly slotConfig: SkillSlotConfig;
  readonly onChange: (next: Workspace) => void;
  readonly onError: (message: string) => void;
}

export function SkillSlotBar({ workspace, character, slotConfig, onChange, onError }: SkillSlotBarProps): React.JSX.Element {
  const highestLevel = Math.max(
    2,
    ...Object.keys(slotConfig.limitsByLevel).map(Number),
    ...character.skills.map((s) => s.level),
    ...(slotConfig.allowSlotPurchase ? Object.keys(character.purchasedSlots).map(Number) : []),
  );
  const maxLevel = highestLevel + (slotConfig.allowSlotPurchase ? 1 : 0);
  const levels = Array.from({ length: maxLevel - 1 }, (_, i) => i + 2);

  const handleBuySlot = (level: number) => {
    try {
      onChange(workspace.activeCampaign.character(character.id).update((c) => c.purchaseSkillSlot(level, slotConfig)).workspace);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Unable to purchase skill slot.');
    }
  };

  return (
    <ul className="skill-list" aria-label={`Skill slots for ${character.name}`}>
      {levels.map((level) => {
        const summary = character.getSkillSlotSummary(level, slotConfig);
        if (summary.kind !== 'capped') return null;
        return (
          <li key={level} className="skill-item">
            <span className="row">
              <span>Lv {summary.level}:</span>
              <span className={summary.availableSlots === 0 ? 'badge badge-failure' : 'badge'}>
                {summary.usedSlots}/{summary.maxSlots} ({summary.availableSlots} left)
              </span>
            </span>
            {summary.nextSlotXpCost !== null && (
              <button
                type="button"
                className="btn"
                disabled={character.xp < summary.nextSlotXpCost}
                aria-label={`Buy level ${summary.level} slot for ${character.name} (${summary.nextSlotXpCost} XP)`}
                onClick={() => handleBuySlot(summary.level)}
              >
                Buy Slot ({summary.nextSlotXpCost} XP)
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
