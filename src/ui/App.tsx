import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { MemoryStorageAdapter, type StorageAdapter, Workspace } from '../campaign';
import type { DiceRoller } from '../dice';
import { CampaignSidebar } from './components/CampaignSidebar';
import { CharacterGrid } from './components/CharacterGrid';

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
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);

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
  const effectiveActorId = activeCampaign?.characters.some((c) => c.id === selectedActorId)
    ? selectedActorId
    : (activeCampaign?.characters[0]?.id ?? null);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Roll for Shoes</h1>
        <span className="badge">{storageMode === 'persistent' ? 'Persistent Storage' : 'In-Memory Session'}</span>
      </header>
      <CampaignSidebar
        workspace={workspace}
        storageMode={storageMode}
        onToggleStorageMode={() => setStorageMode((m) => (m === 'persistent' ? 'memory' : 'persistent'))}
        onChange={commitWorkspace}
        onError={setError}
      />
      <main className="main-stage">
        {error && <div className="error-banner" role="alert">{error}</div>}
        {!workspace ? (
          <section className="panel"><p className="muted">Loading workspace…</p></section>
        ) : activeCampaign ? (
          <>
            <section className="panel stack">
              <div className="row">
                <h2>{activeCampaign.name}</h2>
                <span className="badge">{activeCampaign.characters.length} characters</span>
                <span className="badge">{activeCampaign.rollLog.length} rolls</span>
              </div>
              {activeCampaign.description && <p className="muted">{activeCampaign.description}</p>}
            </section>
            <CharacterGrid
              workspace={workspace}
              selectedActorId={effectiveActorId}
              onSelectActor={setSelectedActorId}
              onChange={commitWorkspace}
              onError={setError}
            />
          </>
        ) : (
          <section className="panel stack">
            <h2>Welcome to Roll for Shoes</h2>
            <p className="muted">Create a campaign or import a JSON backup from the sidebar to begin.</p>
          </section>
        )}
      </main>
    </div>
  );
}
