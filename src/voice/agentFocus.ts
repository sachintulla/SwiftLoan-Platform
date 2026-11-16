/**
 * A tiny per-screen "focus" channel so the voice agent can point at what it is
 * talking about on screens the generic reveal/ring system cannot reach — chiefly
 * the compare matrix, which scrolls horizontally and lays its numbers out as a
 * grid of prop-only cells (no registered controls to ring).
 *
 * The `highlight` tool (tools.ts) calls `focusOnScreen(screen, query)`. A screen
 * registers a handler with `registerFocusHandler(screen, fn)` and does its own
 * thing — scroll to a lender column, pulse a metric row, bump a number. The
 * handler returns true if it handled the query; when no screen handles it, the
 * tool falls back to the ordinary reveal-and-ring ("show") path.
 *
 * Purely visual and advisory: nothing here changes app state or selection.
 */

export type FocusHandler = (query: string) => boolean;

const handlers = new Map<string, FocusHandler>();

/** A screen registers how it highlights things the agent names. Returns an unsubscribe. */
export function registerFocusHandler(screen: string, fn: FocusHandler): () => void {
  handlers.set(screen, fn);
  return () => {
    if (handlers.get(screen) === fn) handlers.delete(screen);
  };
}

/** Ask the current screen to highlight `query`. Returns true if a handler consumed it. */
export function focusOnScreen(screen: string, query: string): boolean {
  try {
    return handlers.get(screen)?.(query) ?? false;
  } catch {
    return false;
  }
}
