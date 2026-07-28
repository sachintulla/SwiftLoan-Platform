// Ported from @ello/agent-sdk's transport/ws.ts (ElloSocket) — uses only the
// global WebSocket, which React Native provides natively, so this is a
// near-verbatim port.
type MessageHandler = (msg: any) => void;

export class ElloSocket {
  private ws: WebSocket | null = null;
  private messageHandlers: MessageHandler[] = [];
  private closeHandlers: Array<() => void> = [];

  constructor(private url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = (e: any) => reject(e?.message ? new Error(e.message) : new Error('ello websocket error'));
      ws.onmessage = (e: any) => {
        try {
          const msg = JSON.parse(e.data);
          this.messageHandlers.forEach(fn => fn(msg));
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => this.closeHandlers.forEach(fn => fn());
    });
  }

  onMessage(fn: MessageHandler): void {
    this.messageHandlers.push(fn);
  }

  onClose(fn: () => void): void {
    this.closeHandlers.push(fn);
  }

  send(payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  close(): void {
    this.ws?.close();
  }
}
