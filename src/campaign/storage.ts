export interface StorageAdapter {
  load(): Promise<string | null>;
  save(serializedWorkspace: string): Promise<void>;
  clear(): Promise<void>;
}

export class LocalStorageAdapter implements StorageAdapter {
  private readonly key: string;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

  constructor(options?: { readonly key?: string; readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> }) {
    this.key = options?.key ?? 'roll_for_shoes.workspace.v1';
    this.storage = options?.storage ?? globalThis.localStorage;
    Object.freeze(this);
  }
  async load(): Promise<string | null> { return this.storage.getItem(this.key); }
  async save(serializedWorkspace: string): Promise<void> { this.storage.setItem(this.key, serializedWorkspace); }
  async clear(): Promise<void> { this.storage.removeItem(this.key); }
}

export class MemoryStorageAdapter implements StorageAdapter {
  constructor(private value: string | null = null) {}
  async load(): Promise<string | null> { return this.value; }
  async save(serializedWorkspace: string): Promise<void> { this.value = serializedWorkspace; }
  async clear(): Promise<void> { this.value = null; }
}
