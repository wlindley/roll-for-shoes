import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { Workspace } from '../../campaign';
import { Character } from '../../character';

export interface CreateCharacterDialogProps {
  readonly workspace: Workspace;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onChange: (next: Workspace) => void;
}

export function CreateCharacterDialog(props: CreateCharacterDialogProps): React.JSX.Element {
  const { workspace, open, onClose, onChange } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const nameId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setName('');
      setDialogError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      onChange(workspace.activeCampaign.addCharacter(Character.create(name)));
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
        <div className="row">
          <button type="submit" className="btn btn-primary">Create Character</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </dialog>
  );
}
