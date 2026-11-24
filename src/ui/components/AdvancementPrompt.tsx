import type React from 'react';
import { useId, useState } from 'react';
import type { Character, PendingAdvancement, SkillSlotConfig } from '../../character';
import { formatError } from '../error';
import { DiceRow } from './DiceRow';

export interface AdvancementPromptProps {
  readonly character: Character;
  readonly pending: PendingAdvancement;
  readonly slotConfig: SkillSlotConfig | null;
  readonly onUpdateCharacter: (transform: (character: Character) => Character) => void;
}

export function AdvancementPrompt(props: AdvancementPromptProps): React.JSX.Element {
  const { character, pending, slotConfig, onUpdateCharacter } = props;
  const slotSummary = character.getSkillSlotSummary(pending.targetLevel, slotConfig);
  const fullSlotSummary = slotSummary.kind === 'capped' && slotSummary.availableSlots === 0 ? slotSummary : null;
  const replaceableSkills = character.skills.filter((s) => s.level === pending.targetLevel);
  const canReplace = replaceableSkills.length > 0;
  const purchaseCost = fullSlotSummary?.nextSlotXpCost ?? null;
  const canPurchaseSlot = purchaseCost !== null;

  const [newSkillName, setNewSkillName] = useState('');
  const [slotAction, setSlotAction] = useState<'replace' | 'buy'>('replace');
  const [replaceSkillId, setReplaceSkillId] = useState('');
  const [promptError, setPromptError] = useState<string | null>(null);
  const baseId = useId();

  const effectiveAction = !canReplace ? (canPurchaseSlot ? 'buy' : 'none') : !canPurchaseSlot ? 'replace' : slotAction;
  const selectedReplaceId = replaceableSkills.find((s) => s.id === replaceSkillId)?.id ?? replaceableSkills[0]?.id ?? '';

  const handleClaim = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      onUpdateCharacter((c) => {
        const base = c.advance(newSkillName).withSlotConfig(slotConfig);
        const claimable =
          fullSlotSummary && effectiveAction === 'replace' && selectedReplaceId
            ? base.replacingSkill(selectedReplaceId)
            : fullSlotSummary && effectiveAction === 'buy'
              ? base.purchasingSlot()
              : base;
        return claimable.claim().character;
      });
    } catch (err: unknown) {
      setPromptError(formatError(err, 'Unable to claim advancement.'));
    }
  };

  const handleDismiss = () => {
    try {
      onUpdateCharacter((c) => c.dismissAdvancement());
    } catch (err: unknown) {
      setPromptError(formatError(err, 'Unable to dismiss advancement.'));
    }
  };

  return (
    <section className="panel stack" aria-label={`Skill advancement for ${character.name}`}>
      <div className="row-between">
        <h3>Skill Advancement — {character.name}</h3>
        <span className="badge badge-ready">
          {pending.usedSkillName} ({pending.usedSkillLevel}d6 → Level {pending.targetLevel})
        </span>
      </div>
      {pending.actionDescription && <p className="muted">Action: “{pending.actionDescription}” ({pending.checkOutcome})</p>}
      <div className="row">
        <span>Rolled:</span>
        <DiceRow dice={pending.rawDice} />
        <span className="badge">{pending.naturalAllSixes ? 'Natural all 6s — 0 XP!' : `Cost: ${pending.xpCostToAdvance} XP`}</span>
        {!pending.naturalAllSixes && (
          <span className="muted">
            Spend {pending.xpCostToAdvance} XP to upgrade non-6 dice to 6s (for advancement only; {character.xp} XP available)
          </span>
        )}
      </div>
      {promptError && <div className="error-banner" role="alert">{promptError}</div>}
      <form className="stack" onSubmit={handleClaim}>
        {fullSlotSummary && (
          <fieldset className="stack">
            <legend>Level {pending.targetLevel} Skill Slots Full ({fullSlotSummary.usedSlots}/{fullSlotSummary.maxSlots} slots used)</legend>
            {canReplace && purchaseCost !== null && (
              <div className="row">
                <label className="field-inline">
                  <input type="radio" name={`${baseId}-mode`} checked={effectiveAction === 'replace'} onChange={() => setSlotAction('replace')} />
                  Replace existing skill
                </label>
                <label className="field-inline">
                  <input type="radio" name={`${baseId}-mode`} checked={effectiveAction === 'buy'} onChange={() => setSlotAction('buy')} />
                  Buy Slot +{purchaseCost} XP
                </label>
              </div>
            )}
            {effectiveAction === 'replace' && (
              <div className="field-inline">
                <label htmlFor={`${baseId}-replace`}>Replace Level {pending.targetLevel} skill</label>
                <select id={`${baseId}-replace`} value={selectedReplaceId} onChange={(e) => setReplaceSkillId(e.target.value)}>
                  {replaceableSkills.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.level}d6)</option>)}
                </select>
              </div>
            )}
            {!canReplace && (
              <p className="muted">
                {purchaseCost !== null
                  ? `No existing Level ${pending.targetLevel} skill to replace — claiming will Buy Slot +${purchaseCost} XP.`
                  : `No available slots or replaceable skills at Level ${pending.targetLevel}.`}
              </p>
            )}
          </fieldset>
        )}
        <div className="row">
          <div className="field-inline field-grow">
            <label htmlFor={`${baseId}-skill`}>New Level {pending.targetLevel} skill</label>
            <input id={`${baseId}-skill`} type="text" value={newSkillName} onChange={(e) => setNewSkillName(e.target.value)} placeholder={`Specific ${pending.usedSkillName} specialty`} required />
          </div>
          <button type="submit" className="btn btn-primary">
            {fullSlotSummary && effectiveAction === 'buy' && purchaseCost !== null ? `Buy Slot (+${purchaseCost} XP) & Claim` : `Claim Level ${pending.targetLevel} Skill`}
          </button>
          <button type="button" className="btn" onClick={handleDismiss}>Dismiss</button>
        </div>
      </form>
    </section>
  );
}
