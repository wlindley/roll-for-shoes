import type React from 'react';
import { useId, useState } from 'react';
import type { Workspace } from '../../campaign';
import type { Character, PendingAdvancement } from '../../character';
import { DiceRow } from './CheckRollerPanel';

export interface AdvancementPromptProps {
  readonly workspace: Workspace;
  readonly character: Character;
  readonly pending: PendingAdvancement;
  readonly onChange: (next: Workspace) => void;
}

export function AdvancementPrompt(props: AdvancementPromptProps): React.JSX.Element {
  const { workspace, character, pending, onChange } = props;
  const [newSkillName, setNewSkillName] = useState('');
  const [promptError, setPromptError] = useState<string | null>(null);
  const inputId = useId();

  const handleClaim = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const res = workspace.activeCampaign.character(character.id).advance(newSkillName).claim();
      onChange(res.workspace);
    } catch (err: unknown) {
      setPromptError(err instanceof Error ? err.message : 'Unable to claim advancement.');
    }
  };

  const handleDismiss = () => {
    try {
      onChange(workspace.activeCampaign.character(character.id).dismissAdvancement().workspace);
    } catch (err: unknown) {
      setPromptError(err instanceof Error ? err.message : 'Unable to dismiss advancement.');
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
        <span className="badge">
          {pending.naturalAllSixes
            ? 'Natural all 6s — 0 XP free unlock!'
            : `Spend ${pending.xpCostToAdvance} XP to upgrade non-6 dice to 6s (for advancement only; ${character.xp} XP available)`}
        </span>
      </div>
      {promptError && <div className="error-banner" role="alert">{promptError}</div>}
      <form className="row" onSubmit={handleClaim}>
        <label htmlFor={inputId}>New Level {pending.targetLevel} skill</label>
        <input id={inputId} type="text" value={newSkillName} onChange={(e) => setNewSkillName(e.target.value)} placeholder={`Specific ${pending.usedSkillName} specialty`} required />
        <button type="submit" className="btn btn-primary">Claim Level {pending.targetLevel} Skill</button>
        <button type="button" className="btn" onClick={handleDismiss}>Dismiss</button>
      </form>
    </section>
  );
}
