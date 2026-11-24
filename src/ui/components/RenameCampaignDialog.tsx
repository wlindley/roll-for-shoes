import type React from 'react';
import { useId, useState } from 'react';
import { formatError } from '../error';
import { ModalDialog } from './ModalDialog';

export interface RenameCampaignDialogProps {
  readonly open: boolean;
  readonly currentName: string;
  readonly onRename: (name: string) => void;
  readonly onClose: () => void;
}

function RenameCampaignForm({ currentName, onRename, onClose }: Omit<RenameCampaignDialogProps, 'open'>): React.JSX.Element {
  const [name, setName] = useState(currentName);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const nameId = useId();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      onRename(name);
      onClose();
    } catch (err: unknown) {
      setDialogError(formatError(err, 'Unable to rename campaign.'));
    }
  };

  return (
    <form className="stack" onSubmit={handleSubmit}>
      {dialogError && <div className="error-banner" role="alert">{dialogError}</div>}
      <div className="field">
        <label htmlFor={nameId}>Campaign name</label>
        <input id={nameId} type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </div>
      <div className="row">
        <button type="submit" className="btn btn-primary">Save Name</button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

export function RenameCampaignDialog({ open, currentName, onRename, onClose }: RenameCampaignDialogProps): React.JSX.Element {
  return (
    <ModalDialog open={open} title="Rename Campaign" onClose={onClose}>
      {open && <RenameCampaignForm currentName={currentName} onRename={onRename} onClose={onClose} />}
    </ModalDialog>
  );
}
