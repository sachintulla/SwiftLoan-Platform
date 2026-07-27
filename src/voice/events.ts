// Ported from @ello/agent-sdk's events.ts (Emitter) — pure TS, no DOM dependency.
type Listener<T> = (payload: T) => void;

export class Emitter<Events> {
  private listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    const set = this.listeners[event] ?? (this.listeners[event] = new Set());
    set.add(fn);
    return () => set.delete(fn);
  }

  off<K extends keyof Events>(event: K, fn: Listener<Events[K]>): void {
    this.listeners[event]?.delete(fn);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners[event]?.forEach(fn => fn(payload));
  }
}
