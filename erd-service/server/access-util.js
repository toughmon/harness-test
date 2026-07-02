// 다이어그램 접근 판정 — REST 공개 읽기(GET /api/shared/:token)와 WS 업그레이드(collab)가 공유.
// 소유자(JWT) 또는 그 다이어그램에 바인딩된 유효 공유 토큰만 접근을 허용한다.
import { randomUUID } from 'node:crypto';
import { SHARE_TOKEN_PREFIX, hashToken } from './mcp-token-util.js';

// 공유 토큰 → 그 토큰이 가리키는 다이어그램/역할. 무효·폐기면 null.
// (토큰 자체가 특정 다이어그램에 대한 capability이므로, 토큰만으로 대상이 정해진다.)
export async function resolveShareToken(app, token) {
  if (!token || !token.startsWith(SHARE_TOKEN_PREFIX)) return null;
  const res = await app.db.query(
    'SELECT id, diagram_id, role FROM diagram_shares WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(token)]
  );
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  // 마지막 사용시각 갱신 (베스트 에포트 — 실패해도 접근은 진행)
  app.db.query('UPDATE diagram_shares SET last_used_at = now() WHERE id = $1', [r.id]).catch(() => {});
  return { shareId: r.id, diagramId: Number(r.diagram_id), role: r.role };
}

// 명시된 diagramId에 대한 접근 판정 (WS /ws/diagram/:id 등, id를 아는 경로).
// 반환: { diagramId, userId|null, guestId|null, role } | null(접근 불가).
//   - 소유자(JWT로 user 확보 + 소유): role='owner'
//   - 그 다이어그램에 바인딩된 유효 공유 토큰: role=share.role
//       · JWT도 있으면 userId로 신원, 없으면 ALLOW_ANON_SHARE일 때만 게스트, 아니면 로그인 필요(null)
// 공유 토큰이 다른 다이어그램을 열지 못하도록 share.diagramId === id를 강제한다.
export async function resolveDiagramAccess(app, { diagramId, user, shareToken }) {
  const id = Number(diagramId);
  if (!Number.isInteger(id)) return null;

  if (user) {
    const owns = await app.db.query('SELECT 1 FROM diagrams WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (owns.rows.length > 0) {
      return { diagramId: id, userId: user.id, guestId: null, role: 'owner' };
    }
  }

  const share = await resolveShareToken(app, shareToken);
  if (share && share.diagramId === id) {
    if (user) return { diagramId: id, userId: user.id, guestId: null, role: share.role };
    if (process.env.ALLOW_ANON_SHARE === '1') {
      return { diagramId: id, userId: null, guestId: 'g' + randomUUID(), role: share.role };
    }
    return null; // 토큰은 유효하나 로그인 필요(MVP 기본)
  }

  return null;
}
