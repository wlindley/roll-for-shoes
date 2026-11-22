import type React from 'react';
import { useEffect, useId, useState } from 'react';
import type { Workspace } from '../../campaign';

export interface CampaignSidebarProps {
  readonly workspace: Workspace | null;
  readonly onChange: (next: Workspace) => void;
  readonly onError: (message: string) => void;
}

export function CampaignSidebar(props: CampaignSidebarProps): React.JSX.Element {
  const { workspace, onChange, onError } = props;
  const activeCampaign = workspace?.tryGetActiveCampaign() ?? null;

  const [newName, setNewName] = useState('');
  const [renameValue, setRenameValue] = useState(activeCampaign?.name ?? '');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const newNameId = useId();
  const renameId = useId();
  const importId = useId();
  const drawerId = useId();

  useEffect(() => {
    setRenameValue(activeCampaign?.name ?? '');
  }, [activeCampaign?.id, activeCampaign?.name]);

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
    }
  };

  const handleRename = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (workspace && activeCampaign) {
      run(() => workspace.activeCampaign.rename(renameValue), 'Unable to rename campaign.');
    }
  };

  const handleExport = () => {
    if (!activeCampaign) return;
    const slug = activeCampaign.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign';
    const url = URL.createObjectURL(new Blob([activeCampaign.exportJson()], { type: 'application/json' }));
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
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Failed to import campaign.');
    } finally {
      input.value = '';
    }
  };

  const expanded = drawerOpen || !activeCampaign;

  return (
    <aside className="sidebar" aria-label="Campaign management">
      <div className="row-between sidebar-mobile-bar">
        <strong className="roll-title">{activeCampaign ? activeCampaign.name : 'Create a campaign'}</strong>
        {activeCampaign && (
          <button type="button" className="btn" aria-expanded={expanded} aria-controls={drawerId} onClick={() => setDrawerOpen((o) => !o)}>
            {expanded ? 'Hide Campaigns' : 'Campaigns'}
          </button>
        )}
      </div>
      <div id={drawerId} className={expanded ? 'sidebar-drawer is-open' : 'sidebar-drawer'}>
        <section className="stack">
          <h2>Campaigns</h2>
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
                      <button type="button" className={isActive ? 'btn btn-primary campaign-select' : 'btn campaign-select'} aria-current={isActive ? 'true' : undefined} onClick={() => run(() => workspace.selectCampaign(c.id), 'Unable to select campaign.')}>
                        <span className="roll-title">{c.name}</span>
                        <span className="badge">{c.characters.length}</span>
                      </button>
                      <button type="button" className="btn btn-danger" aria-label={`Delete ${c.name}`} onClick={() => run(() => workspace.deleteCampaign(c.id), 'Unable to delete campaign.')}>Delete</button>
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

        {activeCampaign && (
          <form className="field" onSubmit={handleRename}>
            <label htmlFor={renameId}>Rename active campaign</label>
            <input id={renameId} type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} required />
            <button type="submit" className="btn">Rename</button>
          </form>
        )}

        <section className="field">
          {activeCampaign && <button type="button" className="btn" onClick={handleExport}>Export Active JSON</button>}
          <label htmlFor={importId}>Import campaign (.json)</label>
          <input id={importId} type="file" accept=".json,application/json" onChange={handleImport} disabled={!workspace} />
        </section>
      </div>
    </aside>
  );
}
