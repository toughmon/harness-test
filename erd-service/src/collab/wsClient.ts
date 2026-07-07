import type { ClientFrame, ServerFrame } from './protocol';

// 얇은 WebSocket 전송 — JSON 프레임 인/디코드 + 지수 backoff 재연결. store를 알지 못한다.
export interface WsClientOptions {
  onOpen: () => void;
  onFrame: (frame: ServerFrame) => void;
  onClose: (intentional: boolean) => void;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private retries = 0;
  private url: string;
  private opts: WsClientOptions;

  constructor(url: string, opts: WsClientOptions) {
    this.url = url;
    this.opts = opts;
  }

  connect() {
    this.closed = false;
    this.open();
  }

  private open() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => { this.retries = 0; this.opts.onOpen(); };
    ws.onmessage = (ev) => {
      let frame: ServerFrame;
      try { frame = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
      this.opts.onFrame(frame);
    };
    ws.onclose = () => {
      this.opts.onClose(this.closed);
      if (!this.closed) this.scheduleReconnect();
    };
    ws.onerror = () => { /* onclose가 뒤따름 */ };
  }

  private scheduleReconnect() {
    this.retries += 1;
    const delay = Math.min(1000 * 2 ** (this.retries - 1), 10000);
    setTimeout(() => { if (!this.closed) this.open(); }, delay);
  }

  send(frame: ClientFrame) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  close() {
    this.closed = true;
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
  }
}
