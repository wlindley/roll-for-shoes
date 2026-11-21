import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { Workspace } from '../../campaign';
import { Character, DEFAULT_STARTING_SKILL_NAME } from '../../character';

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
  const nextRowKey = useRef(0);
  const [name, setName] = useState('');
  const [startingSkills, setStartingSkills] = useState<readonly StartingSkillRow[]>([]);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const nameId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setName('');
      setStartingSkills([]);
      setDialogError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const updateRow = (key: number, patch: Partial<StartingSkillRow>) =>
    setStartingSkills((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const character =
        allowCustom && startingSkills.length > 0
          ? startingSkills.reduce((b, row) => b.withStartingSkill(row.name, Number(row.level)), Character.builder(name)).build()
          : Character.create(name);
      onChange(workspace.activeCampaign.addCharacter(character));
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
