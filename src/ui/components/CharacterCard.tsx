import type React from 'react';
import type { Workspace } from '../../campaign';
import type { Character } from '../../character';
import type { DiceRoller } from '../../dice';
import { SkillSlotBar } from './SkillSlotBar';
import { StatusManager } from './StatusManager';

export interface CharacterCardProps {
  readonly workspace: Workspace;
  readonly character: Character;
  readonly diceRoller: DiceRoller;
  readonly isSelected: boolean;
  readonly onSelectForCheck: (characterId: string) => void;
  readonly onRemove: (characterId: string) => void;
  readonly onChange: (next: Workspace) => void;
  readonly onError: (message: string) => void;
}

export function CharacterCard(props: CharacterCardProps): React.JSX.Element {
  const { workspace, character, diceRoller, isSelected, onSelectForCheck, onRemove, onChange, onError } = props;
  const pending = character.pendingAdvancement;
  const slotConfig = workspace.activeCampaign.campaign.rules.skillSlots;

  return (
    <article className="card stack" aria-label={`Character ${character.name}`}>
      <div className="row-between">
        <h3>{character.name}</h3>
        <span className="badge">{character.xp} XP</span>
      </div>
      {pending && <div><span className="badge badge-ready">Level {pending.targetLevel} skill ready</span></div>}
      <StatusManager workspace={workspace} character={character} diceRoller={diceRoller} onChange={onChange} onError={onError} />
      {slotConfig && <SkillSlotBar workspace={workspace} character={character} slotConfig={slotConfig} onChange={onChange} onError={onError} />}
      <ul className="skill-list">
        {character.skills.map((skill) => {
          const parent = skill.parentSkillId ? character.skills.find((s) => s.id === skill.parentSkillId) : undefined;
          return (
            <li key={skill.id} className="skill-item">
              <div>
                <strong>{skill.name}</strong>
                {parent && <span className="muted"> (from {parent.name})</span>}
              </div>
              <span className="badge">{skill.level}d6</span>
            </li>
          );
        })}
      </ul>
      <div className="row">
        <button type="button" className={isSelected ? 'btn btn-primary' : 'btn'} aria-pressed={isSelected} onClick={() => onSelectForCheck(character.id)}>
          {isSelected ? 'Selected Actor' : 'Select for Check'}
        </button>
        <button type="button" className="btn btn-danger" aria-label={`Remove ${character.name}`} onClick={() => onRemove(character.id)}>
          Remove
        </button>
      </div>
    </article>
  );
}
