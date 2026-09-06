// 다이어그램 공유 링크 관리 — 소유자가 발급/조회/폐기하고, 링크 소지자는 공개 읽기로 조회.
// 발급 토큰은 응답 1회만 노출(원문 미저장). 링크별 고정 역할(viewer/editor), 폐기는 soft.
import { generateShareToken, hashToken } from './mcp-token-util.js';
import { resolveShareToken } from './access-util.js';

export default async function shareRoutes(app) {
  // 소유권 확인 — 비소유자는 존재조차 알 수 없게 404
  async function ownsDiagram(userId, diagramId) {
    if (!Number.isInteger(diagramId)) return false;
    const res = await app.db.query('SELECT id FROM diagrams WHERE id = $1 AND user_id = $2', [diagramId, userId]);
    return res.rows.length > 0;
  }

  // 공유 링크 발급 (소유자) — 원문 토큰은 이 응답에서만 1회 노출
  app.post('/api/diagrams/:id/shares', {
    preHandler: app.authenticate,
    schema: {
      body: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['viewer', 'editor'] },
          label: { type: 'string', maxLength: 100 },
        },
      },
    },
  }, async (req, reply) => {
    const diagramId = Number(req.params.id);
    if (!(await ownsDiagram(req.user.id, diagramId))) return reply.code(404).send({ error: 'not_found' });
    const role = req.body?.role === 'editor' ? 'editor' : 'viewer';
    const token = generateShareToken();
    const res = await app.db.query(
      `INSERT INTO diagram_shares (diagram_id, token_hash, role, label, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, role, label, created_at`,
      [diagramId, hashToken(token), role, req.body?.label ?? null, req.user.id]
    );
    return reply.code(201).send({ ...res.rows[0], token });
  });

  // 공유 링크 목록 (소유자) — 토큰 해시·원문은 절대 반환하지 않음
  app.get('/api/diagrams/:id/shares', { preHandler: app.authenticate }, async (req, reply) => {
    const diagramId = Number(req.params.id);
    if (!(await ownsDiagram(req.user.id, diagramId))) return reply.code(404).send({ error: 'not_found' });
    const res = await app.db.query(
      `SELECT id, role, label, created_at, last_used_at, revoked_at
       FROM diagram_shares WHERE diagram_id = $1 ORDER BY created_at DESC`,
      [diagramId]
    );
    return res.rows;
  });

  // 공유 링크 폐기 (소유자, soft delete)
  app.delete('/api/diagrams/:id/shares/:shareId', { preHandler: app.authenticate }, async (req, reply) => {
    const diagramId = Number(req.params.id);
    if (!(await ownsDiagram(req.user.id, diagramId))) return reply.code(404).send({ error: 'not_found' });
    const res = await app.db.query(
      `UPDATE diagram_shares SET revoked_at = now()
       WHERE id = $1 AND diagram_id = $2 AND revoked_at IS NULL RETURNING id`,
      [Number(req.params.shareId), diagramId]
    );
    if (res.rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  // 공개 읽기 — 공유 토큰으로 다이어그램 데이터 조회. 소유자 전용 /api/diagrams/:id와 분리해
  // "다이어그램은 소유자 비공개" 불변식을 유지한다(공유는 별도 토큰 표면).
  // 링크를 가진 사람은 **로그인 없이** 볼 수 있다 — 토큰 자체가 그 다이어그램 하나에 대한 읽기 capability다.
  // 운영상 다시 잠그려면 REQUIRE_SHARE_LOGIN=1 (예: 사내 전용 인스턴스).
  app.get('/api/shared/:token', async (req, reply) => {
    let user = null;
    try { await req.jwtVerify(); user = req.user; } catch { /* 익명 접근 — 허용 */ }
    if (!user && process.env.REQUIRE_SHARE_LOGIN === '1') {
      return reply.code(401).send({ error: 'login_required' });
    }
    const share = await resolveShareToken(app, req.params.token);
    if (!share) return reply.code(403).send({ error: 'invalid_or_revoked_share' });
    const res = await app.db.query(
      'SELECT id, name, data, updated_at FROM diagrams WHERE id = $1',
      [share.diagramId]
    );
    if (res.rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    return { ...res.rows[0], role: share.role };
  });
}
