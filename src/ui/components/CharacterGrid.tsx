import type React from 'react';
import { useState } from 'react';
import type { Campaign } from '../../campaign';
import type { DiceRoller } from '../../dice';
import { formatError } from '../error';
import { CharacterCard } from './CharacterCard';
import { CreateCharacterDialog } from './CreateCharacterDialog';

export interface CharacterGridProps {
  readonly campaign: Campaign;
  readonly diceRoller: DiceRoller;
  readonly selectedActorId: string | null;
  readonly onSelectActor: (characterId: string) => void;
  readonly onCampaignChange: (next: Campaign) => void;
  readonly onError: (message: string) => void;
}

export function CharacterGrid(props: CharacterGridProps): React.JSX.Element {
  const { campaign, diceRoller, selectedActorId, onSelectActor, onCampaignChange, onError } = props;
  const [createOpen, setCreateOpen] = useState(false);
  const { characters, rules } = campaign;

  const handleRemove = (characterId: string) => {
    try {
      onCampaignChange(campaign.removeCharacter(characterId));
    } catch (err: unknown) {
      onError(formatError(err, 'Unable to remove character.'));
    }
  };

  return (
    <section className="stack" aria-label="Campaign characters">
      <div className="row-between">
        <h2>Characters ({characters.length})</h2>
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>+ New Character</button>
      </div>
      {characters.length === 0 ? (
        <div className="panel"><p className="muted">No characters yet. Add characters to track their sheets side-by-side.</p></div>
      ) : (
        <div className="card-grid">
          {characters.map((c) => (
            <CharacterCard
              key={c.id}
              character={c}
              statusesEnabled={rules.statusesEnabled}
              slotConfig={rules.skillSlots}
              diceRoller={diceRoller}
              isSelected={c.id === selectedActorId}
              onSelectForCheck={onSelectActor}
              onRemove={handleRemove}
              onUpdateCharacter={(fn) => onCampaignChange(campaign.character(c.id).update(fn).campaign)}
              onError={onError}
            />
          ))}
        </div>
      )}
      <CreateCharacterDialog
        open={createOpen}
        allowCustomStartingSkills={rules.allowCustomStartingSkills}
        onAddCharacter={(ch) => onCampaignChange(campaign.addCharacter(ch))}
        onClose={() => setCreateOpen(false)}
      />
    </section>
  );
}
