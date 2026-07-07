// 실시간 협업 WebSocket 엔드포인트 — GET /ws/diagram/:id (정적 서빙/SPA fallback보다 먼저 등록).
// 인증은 핸들러 안에서 수행하고, 실패 시 소켓을 닫는다(클라이언트는 init 수신 후에만 프레임 전송).
import { resolveConnection } from './collab-auth.js';
import { createCollabHub } from './collab-hub.js';

export default async function collabRoutes(app) {
  const hub = createCollabHub(app);

  app.get('/ws/diagram/:id', { websocket: true }, async (socket, req) => {
    let conn = null;
    try {
      conn = await resolveConnection(app, req);
    } catch (e) {
      app.log.warn({ err: e }, 'collab: 연결 인증 오류');
    }
    if (!conn) {
      try { socket.send(JSON.stringify({ type: 'error', code: 'forbidden', message: '접근 권한이 없습니다.' })); } catch { /* noop */ }
      try { socket.close(4403, 'forbidden'); } catch { /* noop */ }
      return;
    }
    hub.handleConnection(socket, conn);
  });
}
