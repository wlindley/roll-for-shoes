import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { Workspace } from '../../campaign';
import { Character, DEFAULT_STARTING_SKILL_NAME } from '../../character';
import { characterInitials, encodePortraitFile } from '../portrait-image';

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

export function CreateCharacterDialog(props: CreateCharacterDialogProps): React.JSX.Element {
  const { workspace, open, onClose, onChange } = props;
  const allowCustom = workspace.activeCampaign.campaign.rules.allowCustomStartingSkills;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextRowKey = useRef(0);
  const [name, setName] = useState('');
  const [portrait, setPortrait] = useState<string | null>(null);
  const [startingSkills, setStartingSkills] = useState<readonly StartingSkillRow[]>([]);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const nameId = useId();
  const portraitId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setName('');
      setPortrait(null);
      setStartingSkills([]);
      setDialogError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

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
      setDialogError(err instanceof Error ? err.message : 'Unable to load portrait.');
    } finally {
      input.value = '';
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      let builder = Character.builder(name);
      if (portrait) builder = builder.withPortrait(portrait);
      if (allowCustom) builder = startingSkills.reduce((b, row) => b.withStartingSkill(row.name, Number(row.level)), builder);
      onChange(workspace.activeCampaign.addCharacter(builder.build()));
      onClose();
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Unable to create character.');
    }
  };

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby={`${nameId}-title`}>
      <form className="stack" onSubmit={handleSubmit}>
        <h3 id={`${nameId}-title`}>New Character</h3>
        {dialogError && <div className="error-banner" role="alert">{dialogError}</div>}
        <label htmlFor={nameId}>Character name</label>
        <input id={nameId} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bob" required />
        <div className="stack">
          <label htmlFor={portraitId}>Portrait (optional)</label>
          <div className="row">
            {portrait ? (
              <img src={portrait} alt="Character portrait preview" width={64} height={64} className="character-avatar" />
            ) : (
              <div className="character-avatar character-avatar-fallback" aria-hidden="true">{characterInitials(name.trim() || '?')}</div>
            )}
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
    </dialog>
  );
}
