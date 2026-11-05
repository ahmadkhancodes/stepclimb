/** In-memory file tree the engine works on. The run agent loads the repo into this (or a real FS adapter implements it). */
export interface VirtualFs {
  read(path: string): string | undefined;
  write(path: string, content: string): void;
  delete(path: string): void;
  exists(path: string): boolean;
  list(prefix?: string): string[];
}
export class MemoryFs implements VirtualFs {
  private files = new Map<string, string>();
  constructor(init: Record<string, string> = {}) { for (const [k, v] of Object.entries(init)) this.files.set(k, v); }
  read(p: string) { return this.files.get(p); }
  write(p: string, c: string) { this.files.set(p, c); }
  delete(p: string) { this.files.delete(p); }
  exists(p: string) { return this.files.has(p); }
  list(prefix = '') { return [...this.files.keys()].filter((k) => k.startsWith(prefix)).sort(); }
  snapshot(): Record<string, string> { return Object.fromEntries([...this.files.entries()].sort()); }
}
