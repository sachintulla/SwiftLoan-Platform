// Node 22+ ships its own global `localStorage`, which is `undefined` unless Node is started with
// --localstorage-file, and in vitest's jsdom environment it hides jsdom's working one
// (`window.localStorage.clear()` then throws). Where that happens, give jsdom tests a plain
// in-memory Storage. A no-op in node-environment tests and on Node versions without the clash.
if (typeof window !== 'undefined') {
  let missing = false;
  try {
    missing = !window.localStorage;
  } catch {
    missing = true;
  }
  if (missing) {
    const data = new Map<string, string>();
    const storage: Storage = {
      get length() { return data.size; },
      clear: () => data.clear(),
      getItem: (k) => (data.has(String(k)) ? data.get(String(k))! : null),
      key: (i) => Array.from(data.keys())[i] ?? null,
      removeItem: (k) => { data.delete(String(k)); },
      setItem: (k, v) => { data.set(String(k), String(v)); },
    };
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  }
}
