import type React from 'react';
import { useState } from 'react';
import type { Workspace } from '../../campaign';
import type { DiceRoller } from '../../dice';
import { CharacterCard } from './CharacterCard';
import { CreateCharacterDialog } from './CreateCharacterDialog';

export interface CharacterGridProps {
  readonly workspace: Workspace;
  readonly diceRoller: DiceRoller;
  readonly selectedActorId: string | null;
  readonly onSelectActor: (characterId: string) => void;
  readonly onChange: (next: Workspace) => void;
  readonly onError: (message: string) => void;
}

export function CharacterGrid(props: CharacterGridProps): React.JSX.Element {
  const { workspace, diceRoller, selectedActorId, onSelectActor, onChange, onError } = props;
  const [createOpen, setCreateOpen] = useState(false);
  const characters = workspace.activeCampaign.campaign.characters;

  const handleRemove = (characterId: string) => {
    try {
      onChange(workspace.activeCampaign.removeCharacter(characterId));
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Unable to remove character.');
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
            <CharacterCard key={c.id} workspace={workspace} character={c} diceRoller={diceRoller} isSelected={c.id === selectedActorId} onSelectForCheck={onSelectActor} onRemove={handleRemove} onChange={onChange} onError={onError} />
          ))}
        </div>
      )}
      <CreateCharacterDialog workspace={workspace} open={createOpen} onClose={() => setCreateOpen(false)} onChange={onChange} />
    </section>
  );
}
