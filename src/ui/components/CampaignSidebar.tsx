import type React from 'react';
import { useId, useRef, useState } from 'react';
import type { Workspace } from '../../campaign';
import { ActionMenu } from './ActionMenu';

export interface CampaignSidebarProps {
  readonly id: string;
  readonly hidden: boolean;
  readonly workspace: Workspace | null;
  readonly onClose: () => void;
  readonly onChange: (next: Workspace) => void;
  readonly onError: (message: string) => void;
}

export function CampaignSidebar(props: CampaignSidebarProps): React.JSX.Element {
  const { id, hidden, workspace, onClose, onChange, onError } = props;
  const activeCampaign = workspace?.tryGetActiveCampaign() ?? null;

  const [newName, setNewName] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const newNameId = useId();

  const run = (fn: () => Workspace, fallback: string): boolean => {
    try {
      onChange(fn());
      return true;
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : fallback);
      return false;
    }
  };

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (workspace && run(() => workspace.createCampaign(newName), 'Unable to create campaign.')) {
      setNewName('');
      onClose();
    }
  };

  const handleSelect = (campaignId: string) => {
    if (workspace && run(() => workspace.selectCampaign(campaignId), 'Unable to select campaign.')) {
      onClose();
    }
  };

  const handleExport = () => {
    if (!activeCampaign) return;
    const slug = activeCampaign.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign';
    const url = URL.createObjectURL(new Blob([activeCampaign.serialize()], { type: 'application/json' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `${slug}.json` });
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || !workspace) return;
    try {
      onChange(workspace.importCampaign(await file.text()));
      onClose();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Failed to import campaign.');
    } finally {
      input.value = '';
    }
  };

  const advancedItems = [
    ...(activeCampaign ? [{ label: 'Export Active Campaign (.json)', onSelect: handleExport }] : []),
    { label: 'Import Campaign (.json)…', onSelect: () => importInputRef.current?.click(), disabled: !workspace },
  ];

  return (
    <aside id={id} hidden={hidden} className="sidebar" aria-label="Campaign management">
      <section className="stack">
        <div className="row-between">
          <h2>Campaigns</h2>
          {activeCampaign && (
            <button type="button" className="btn" onClick={onClose}>Hide</button>
          )}
        </div>
        {!workspace ? (
          <p className="muted">Loading…</p>
        ) : workspace.campaigns.length === 0 ? (
          <p className="muted">No campaigns yet.</p>
        ) : (
          <nav aria-label="Saved campaigns">
            <ul className="campaign-list">
              {workspace.campaigns.map((c) => {
                const isActive = c.id === workspace.activeCampaignId;
                return (
                  <li key={c.id} className="campaign-item">
                    <button
                      type="button"
                      className={isActive ? 'btn btn-primary campaign-select' : 'btn campaign-select'}
                      aria-current={isActive ? 'true' : undefined}
                      onClick={() => handleSelect(c.id)}
                    >
                      <span className="roll-title">{c.name}</span>
                      <span className="badge">{c.characters.length}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      aria-label={`Delete ${c.name}`}
                      onClick={() => run(() => workspace.deleteCampaign(c.id), 'Unable to delete campaign.')}
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </section>

      <form className="field" onSubmit={handleCreate}>
        <label htmlFor={newNameId}>New campaign</label>
        <input id={newNameId} type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tavern Brawl" disabled={!workspace} required />
        <button type="submit" className="btn btn-primary" disabled={!workspace}>Create Campaign</button>
      </form>

      <div>
        <ActionMenu label="Advanced Options" align="left" disabled={!workspace} items={advancedItems} />
        <input ref={importInputRef} type="file" accept=".json,application/json" onChange={handleImport} hidden />
      </div>
    </aside>
  );
}
