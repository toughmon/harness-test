// 실시간 협업 릴레이 허브 — 다이어그램 id당 룸 1개(단일 프로세스 인메모리 맵, MCP 세션맵과 동형).
// 서버는 op를 수신 순서대로 룸 doc에 적용(erdOps 공유)하고 나머지 참여자에게 브로드캐스트한다.
// Phase 1: 소유자가 유일 편집자이며 자기 5초 autosave로 영속화 → 서버는 릴레이+지각 참여자
// 스냅샷만 담당(영속 권위 아님). Phase 2에서 서버 영속 권위·동시 편집 가드레일을 추가한다.
import { tsImport } from 'tsx/esm/api';

// 공유 TS 모듈(op 어휘·직렬화)을 plain node에서 로드 — index.js의 MCP 브리지와 동일 방식.
let _mods = null;
async function mods() {
  if (!_mods) {
    const [opd, erdData] = await Promise.all([
      tsImport('../src/core/opDispatch.ts', import.meta.url),
      tsImport('../src/utils/erdData.ts', import.meta.url),
    ]);
    _mods = { applyOp: opd.applyOp, fromERDData: erdData.fromERDData };
  }
  return _mods;
}

// Phase 1: 소유자만 편집(공유 링크는 뷰어). 'editor'는 Phase 2에서 활성(스키마·판정은 이미 준비).
const canEdit = (role) => role === 'owner' || role === 'editor';

function colorFor(actorId) {
  let h = 0;
  for (const ch of actorId) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 55%)`;
}

function emptyDoc() {
  return { entities: [], relationships: [], nodePositions: {}, memos: [] };
}
function normalizeDoc(doc) {
  if (!doc || typeof doc !== 'object') return emptyDoc();
  return {
    entities: Array.isArray(doc.entities) ? doc.entities : [],
    relationships: Array.isArray(doc.relationships) ? doc.relationships : [],
    nodePositions: doc.nodePositions && typeof doc.nodePositions === 'object' ? doc.nodePositions : {},
    memos: Array.isArray(doc.memos) ? doc.memos : [],
  };
}

export function createCollabHub(app) {
  const rooms = new Map(); // diagramId(number) -> { doc, seq, clients:Set }

  async function ensureRoom(diagramId) {
    let room = rooms.get(diagramId);
    if (room) return room;
    // DB의 마지막 저장 상태로 룸 doc 시드 (memos 포함)
    let doc = emptyDoc();
    try {
      const res = await app.db.query('SELECT data FROM diagrams WHERE id = $1', [diagramId]);
      if (res.rows.length) {
        const { fromERDData } = await mods();
        const d = fromERDData(res.rows[0].data);
        doc = { entities: d.entities, relationships: d.relationships, nodePositions: d.positions, memos: d.memos };
      }
    } catch (e) {
      app.log.warn({ err: e, diagramId }, 'collab: 룸 시드 실패 — 빈 문서로 시작');
    }
    room = { doc, seq: 0, clients: new Set() };
    rooms.set(diagramId, room);
    return room;
  }

  const participantsOf = (room) =>
    [...room.clients].map(c => ({ actorId: c.actorId, label: c.label, role: c.role, color: c.color }));

  function send(socket, frame) {
    if (socket.readyState === 1) socket.send(JSON.stringify(frame));
  }
  function broadcast(room, frame, exceptSocket) {
    const msg = JSON.stringify(frame);
    for (const c of room.clients) {
      if (c.socket === exceptSocket) continue;
      if (c.socket.readyState === 1) c.socket.send(msg);
    }
  }

  async function handleConnection(socket, conn) {
    const room = await ensureRoom(conn.diagramId);
    const color = colorFor(conn.actorId);
    const client = { socket, actorId: conn.actorId, label: conn.label, role: conn.role, color };
    room.clients.add(client);

    // 접속 즉시 현재 룸 스냅샷 + 참여자 명단 + 내 신원 전달
    const you = { actorId: conn.actorId, label: conn.label, role: conn.role, color };
    send(socket, { type: 'init', seq: room.seq, doc: room.doc, participants: participantsOf(room), you });
    // 기존 참여자에게 갱신된 명단 알림
    broadcast(room, { type: 'presence', participants: participantsOf(room) }, socket);

    socket.on('message', async (raw) => {
      let frame;
      try { frame = JSON.parse(raw.toString()); } catch { return; }
      if (frame.type === 'ping') { send(socket, { type: 'pong' }); return; }

      if (frame.type === 'op' || frame.type === 'snapshot') {
        if (!canEdit(client.role)) {
          send(socket, { type: 'error', code: 'read_only', message: '읽기 전용 참여자입니다.' });
          return;
        }
        if (frame.type === 'op') {
          try {
            const { applyOp } = await mods();
            room.doc = applyOp(room.doc, { op: frame.op, args: frame.args });
          } catch (e) {
            app.log.warn({ err: e }, 'collab: op 적용 실패');
            send(socket, { type: 'error', code: 'bad_op', message: 'op 적용 실패' });
            return;
          }
          room.seq += 1;
          broadcast(room, { type: 'op', seq: room.seq, op: frame.op, args: frame.args, actorId: client.actorId }, socket);
        } else {
          room.doc = normalizeDoc(frame.doc);
          room.seq += 1;
          broadcast(room, { type: 'snapshot', seq: room.seq, doc: room.doc }, socket);
        }
      }
    });

    socket.on('close', () => {
      room.clients.delete(client);
      if (room.clients.size === 0) rooms.delete(conn.diagramId);
      else broadcast(room, { type: 'presence', participants: participantsOf(room) });
    });

    socket.on('error', () => { /* close 이벤트에서 정리됨 */ });
  }

  return { handleConnection };
}
