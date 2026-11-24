import type React from 'react';
import { useId, useRef, useState } from 'react';
import type { Workspace } from '../../campaign';
import { Character, DEFAULT_STARTING_SKILL_NAME } from '../../character';
import { formatError } from '../error';
import { encodePortraitFile } from '../portrait-image';
import { CharacterAvatar } from './CharacterAvatar';
import { ModalDialog } from './ModalDialog';

export interface CreateCharacterDialogProps {
  readonly workspace: Workspace;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onChange: (next: Workspace) => void;
}

interface StartingSkillRow {
  readonly key: number;
  readonly name: string;
  readonly level: string;
}

function CreateCharacterForm({ workspace, onClose, onChange }: Omit<CreateCharacterDialogProps, 'open'>): React.JSX.Element {
  const allowCustom = workspace.activeCampaign.campaign.rules.allowCustomStartingSkills;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextRowKey = useRef(0);
  const [name, setName] = useState('');
  const [portrait, setPortrait] = useState<string | null>(null);
  const [startingSkills, setStartingSkills] = useState<readonly StartingSkillRow[]>([]);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const nameId = useId();
  const portraitId = useId();

  const updateRow = (key: number, patch: Partial<StartingSkillRow>) =>
    setStartingSkills((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const handlePortraitFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      setPortrait(await encodePortraitFile(file));
      setDialogError(null);
    } catch (err: unknown) {
      setDialogError(formatError(err, 'Unable to load portrait.'));
    } finally {
      input.value = '';
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const character = Character.create(name, {
        portrait: portrait ?? undefined,
        startingSkills: allowCustom ? startingSkills.map((row) => ({ name: row.name, level: Number(row.level) })) : undefined,
      });
      onChange(workspace.activeCampaign.addCharacter(character));
      onClose();
    } catch (err: unknown) {
      setDialogError(formatError(err, 'Unable to create character.'));
    }
  };

  return (
    <form className="stack" onSubmit={handleSubmit}>
      {dialogError && <div className="error-banner" role="alert">{dialogError}</div>}
      <label htmlFor={nameId}>Character name</label>
      <input id={nameId} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bob" autoFocus required />
      <div className="stack">
        <label htmlFor={portraitId}>Portrait (optional)</label>
        <div className="row">
          <CharacterAvatar name={name} portrait={portrait} alt="Character portrait preview" />
          <input ref={fileInputRef} id={portraitId} type="file" accept="image/*" onChange={handlePortraitFile} />
          {portrait && (
            <button type="button" className="btn" onClick={() => { setPortrait(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
              Clear Portrait
            </button>
          )}
        </div>
      </div>
        {allowCustom && (
          <fieldset className="stack">
            <legend>Custom Starting Skills</legend>
            <p className="muted">{DEFAULT_STARTING_SKILL_NAME} (1d6) is always included automatically.</p>
            {startingSkills.map((row, idx) => (
              <div key={row.key} className="row">
                <input
                  type="text"
                  aria-label={`Starting skill ${idx + 1} name`}
                  value={row.name}
                  onChange={(e) => updateRow(row.key, { name: e.target.value })}
                  placeholder="Skill name (e.g. Hacking)"
                  required
                />
                <input
                  type="number"
                  aria-label={`Starting skill ${idx + 1} level`}
                  min={1}
                  step={1}
                  value={row.level}
                  onChange={(e) => updateRow(row.key, { level: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="btn"
                  aria-label={`Remove starting skill ${row.name.trim() || idx + 1}`}
                  onClick={() => setStartingSkills((rows) => rows.filter((r) => r.key !== row.key))}
                >
                  Remove
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="btn" onClick={() => setStartingSkills((rows) => [...rows, { key: ++nextRowKey.current, name: '', level: '2' }])}>
                + Add Starting Skill
              </button>
            </div>
          </fieldset>
        )}
      <div className="row">
        <button type="submit" className="btn btn-primary">Create Character</button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

export function CreateCharacterDialog({ workspace, open, onClose, onChange }: CreateCharacterDialogProps): React.JSX.Element {
  return (
    <ModalDialog open={open} title="New Character" onClose={onClose}>
      {open && <CreateCharacterForm workspace={workspace} onClose={onClose} onChange={onChange} />}
    </ModalDialog>
  );
}
