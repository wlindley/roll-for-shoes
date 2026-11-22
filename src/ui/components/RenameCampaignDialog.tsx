import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { Workspace } from '../../campaign';

export interface RenameCampaignDialogProps {
  readonly workspace: Workspace;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onChange: (next: Workspace) => void;
}

export function RenameCampaignDialog(props: RenameCampaignDialogProps): React.JSX.Element {
  const { workspace, open, onClose, onChange } = props;
  const campaignName = workspace.activeCampaign.campaign.name;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(campaignName);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const baseId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setName(campaignName);
      setDialogError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, campaignName]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      onChange(workspace.activeCampaign.rename(name));
      onClose();
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Unable to rename campaign.');
    }
  };

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby={`${baseId}-title`}>
      <form className="stack" onSubmit={handleSubmit}>
        <h3 id={`${baseId}-title`}>Rename Campaign</h3>
        {dialogError && <div className="error-banner" role="alert">{dialogError}</div>}
        <div className="field">
          <label htmlFor={`${baseId}-name`}>Campaign name</label>
          <input id={`${baseId}-name`} type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="row">
          <button type="submit" className="btn btn-primary">Save Name</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </dialog>
  );
}
