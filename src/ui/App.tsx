import type React from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
import { MemoryStorageAdapter, type StorageAdapter, Workspace } from '../campaign';
import type { DiceRoller } from '../dice';

export type StorageMode = 'persistent' | 'memory';

export interface AppProps {
  readonly diceRoller: DiceRoller;
  readonly storageAdapter: StorageAdapter;
}

const toErrorMessage = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

export function App(props: AppProps): React.JSX.Element {
  const [storageMode, setStorageMode] = useState<StorageMode>('persistent');
  const [memoryAdapter] = useState(() => new MemoryStorageAdapter());
  const activeAdapter = storageMode === 'persistent' ? props.storageAdapter : memoryAdapter;
  const [loaded, setLoaded] = useState<{ readonly adapter: StorageAdapter; readonly workspace: Workspace } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const campaignNameId = useId();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Workspace.load(activeAdapter)
      .then((ws) => { if (!cancelled) setLoaded({ adapter: activeAdapter, workspace: ws }); })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(toErrorMessage(err, 'Failed to load workspace.'));
          setLoaded({ adapter: activeAdapter, workspace: Workspace.empty() });
        }
      });
    return () => { cancelled = true; };
  }, [activeAdapter]);

  const commitWorkspace = useCallback((next: Workspace) => {
    setError(null);
    setLoaded({ adapter: activeAdapter, workspace: next });
    void next.save(activeAdapter).catch((err: unknown) => setError(toErrorMessage(err, 'Failed to save workspace.')));
  }, [activeAdapter]);

  const workspace = loaded?.adapter === activeAdapter ? loaded.workspace : null;
  const activeCampaign = workspace?.tryGetActiveCampaign() ?? null;

  const handleCreateCampaign = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace) return;
    try {
      commitWorkspace(workspace.createCampaign(campaignName));
      setCampaignName('');
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'Unable to create campaign.'));
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Roll for Shoes</h1>
        <div className="row">
          <span className="badge">{storageMode === 'persistent' ? 'Persistent' : 'In-Memory'}</span>
          <button type="button" className="btn" onClick={() => setStorageMode((m) => (m === 'persistent' ? 'memory' : 'persistent'))}>
            Switch to {storageMode === 'persistent' ? 'In-Memory' : 'Persistent'}
          </button>
        </div>
      </header>
      <aside className="sidebar" aria-label="Campaigns">
        <h2>Campaigns</h2>
        <p className="muted">{workspace ? `${workspace.campaigns.length} saved` : 'Loading…'}</p>
      </aside>
      <main className="main-stage">
        {error && <div className="error-banner" role="alert">{error}</div>}
        {!workspace ? (
          <section className="panel"><p className="muted">Loading workspace…</p></section>
        ) : activeCampaign ? (
          <section className="panel stack">
            <div className="row">
              <h2>{activeCampaign.name}</h2>
              <span className="badge">{activeCampaign.characters.length} characters</span>
              <span className="badge">{activeCampaign.rollLog.length} rolls</span>
            </div>
            {activeCampaign.description && <p className="muted">{activeCampaign.description}</p>}
          </section>
        ) : (
          <section className="panel stack">
            <h2>Welcome to Roll for Shoes</h2>
            <p className="muted">Create your first campaign to begin tracking characters and rolls.</p>
            <form className="row" onSubmit={handleCreateCampaign}>
              <label htmlFor={campaignNameId}>Campaign name</label>
              <input id={campaignNameId} type="text" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Cobblestone Heist" required />
              <button type="submit" className="btn btn-primary">Create First Campaign</button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
