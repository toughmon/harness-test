import type { Op } from '../core/opDispatch';
import type { ErdDoc } from '../core/erdOps';

// ──────────────────────────────────────────────────────────────────────────
// 실시간 협업 WebSocket 와이어 프로토콜 — client(TS)와 server(JS, 동일 shape 수기 구성)가 공유.
// 서버는 doc을 ErdDoc과 동일 shape(entities/relationships/nodePositions/memos)로 주고받는다.
// ──────────────────────────────────────────────────────────────────────────

export type CollabRole = 'owner' | 'editor' | 'viewer';

export function canEdit(role: CollabRole): boolean {
  return role === 'owner' || role === 'editor';
}

export interface Participant {
  actorId: string;   // 'u<userId>' | 'g<guestId>'
  label: string;     // 표시 이름(username 등)
  role: CollabRole;
  color: string;     // actorId 해시 기반 아바타 색
}

// 직렬화 스냅샷 — ErdDoc과 동일 shape
export type CollabDoc = ErdDoc;

// Client → Server (op/snapshot은 편집 권한 있는 클라이언트만; 서버가 역할로 강제)
export type ClientFrame =
  | { type: 'op'; op: Op['op']; args: Op['args'] }
  | { type: 'snapshot'; doc: CollabDoc }
  | { type: 'ping' };

// Server → Client
export type ServerFrame =
  | { type: 'init'; seq: number; doc: CollabDoc; participants: Participant[]; you: Participant }
  | { type: 'op'; seq: number; op: Op['op']; args: Op['args']; actorId: string }
  | { type: 'snapshot'; seq: number; doc: CollabDoc }
  | { type: 'presence'; participants: Participant[] }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };
