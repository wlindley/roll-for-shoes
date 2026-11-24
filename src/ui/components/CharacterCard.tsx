import type React from 'react';
import { useRef } from 'react';
import type { Character, SkillSlotConfig } from '../../character';
import type { DiceRoller } from '../../dice';
import { formatError } from '../error';
import { encodePortraitFile } from '../portrait-image';
import { CharacterAvatar } from './CharacterAvatar';
import { SkillSlotBar } from './SkillSlotBar';
import { StatusManager } from './StatusManager';

export interface CharacterCardProps {
  readonly character: Character;
  readonly statusesEnabled: boolean;
  readonly slotConfig: SkillSlotConfig | null;
  readonly diceRoller: DiceRoller;
  readonly isSelected: boolean;
  readonly onSelectForCheck: (characterId: string) => void;
  readonly onRemove: (characterId: string) => void;
  readonly onUpdateCharacter: (transform: (character: Character) => Character) => void;
  readonly onError: (message: string) => void;
}

export function CharacterCard(props: CharacterCardProps): React.JSX.Element {
  const { character, statusesEnabled, slotConfig, diceRoller, isSelected, onSelectForCheck, onRemove, onUpdateCharacter, onError } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pending = character.pendingAdvancement;

  const handlePortraitChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const url = await encodePortraitFile(file);
      onUpdateCharacter((c) => c.withPortrait(url));
    } catch (err: unknown) {
      onError(formatError(err, 'Unable to update portrait.'));
    } finally {
      input.value = '';
    }
  };

  const handleClearPortrait = () => {
    try {
      onUpdateCharacter((c) => c.withPortrait(null));
    } catch (err: unknown) {
      onError(formatError(err, 'Unable to clear portrait.'));
    }
  };

  return (
    <article className="card stack" aria-label={`Character ${character.name}`}>
      <div className="character-header">
        <CharacterAvatar name={character.name} portrait={character.portrait} />
        <div className="character-header-body">
          <div className="row-between">
            <h3>{character.name}</h3>
            <span className="badge">{character.xp} XP</span>
          </div>
          <div className="row">
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePortraitChange} />
            <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
              {character.portrait ? 'Change Portrait' : 'Add Portrait'}
            </button>
            {character.portrait && (
              <button type="button" className="btn" aria-label={`Clear portrait for ${character.name}`} onClick={handleClearPortrait}>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
      {pending && <div><span className="badge badge-ready">Level {pending.targetLevel} skill ready</span></div>}
      <StatusManager character={character} statusesEnabled={statusesEnabled} diceRoller={diceRoller} onUpdateCharacter={onUpdateCharacter} onError={onError} />
      {slotConfig && (
        <SkillSlotBar
          character={character}
          slotConfig={slotConfig}
          onPurchaseSlot={(level) => onUpdateCharacter((c) => c.purchaseSkillSlot(level, slotConfig))}
          onError={onError}
        />
      )}
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
