// Bridges the imperative ConfirmFn contract ElloAgent needs ((message) =>
// Promise<boolean>) to the React-rendered ConfirmationSheet mounted once near
// the app root — replacing the browser SDK's tools/confirmation.ts (which
// appends a DOM chip into the widget's shadow root).
type ConfirmationRequest = { message: string; resolve: (allowed: boolean) => void };
type Listener = (req: ConfirmationRequest | null) => void;

let listener: Listener | null = null;

export function subscribeConfirmationRequests(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function requestConfirmation(message: string): Promise<boolean> {
  return new Promise(resolve => {
    if (!listener) {
      resolve(false); // no ConfirmationSheet mounted — fail closed, never silently allow
      return;
    }
    listener({
      message,
      resolve: allowed => {
        resolve(allowed);
        listener?.(null);
      },
    });
  });
}
