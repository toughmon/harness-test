// MCP 개인 액세스 토큰 관리 — 로그인(쿠키/JWT)한 사용자가 자신의 토큰을 발급/조회/취소.
// 발급된 토큰은 Claude Code의 `claude mcp add --transport http --header "Authorization: Bearer <token>"`
// 한 줄에 넣어 원격 MCP(/mcp)에 인증한다.
import { generateToken, hashToken } from './mcp-token-util.js';

export default async function mcpTokenRoutes(app) {
  // 토큰 관리는 사람이 웹에 로그인한 상태에서만 (PAT로 PAT를 발급하지 못하게 쿠키/JWT만)
  app.addHook('preHandler', app.authenticate);

  // 목록 (토큰 원문은 절대 반환하지 않음)
  app.get('/', async (req) => {
    const res = await app.db.query(
      'SELECT id, label, created_at, last_used_at FROM mcp_tokens WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    return res.rows;
  });

  // 발급 — 원문은 이 응답에서만 1회 노출
  app.post('/', {
    schema: {
      body: {
        type: 'object',
        properties: { label: { type: 'string', maxLength: 100 } },
      },
    },
  }, async (req, reply) => {
    const token = generateToken();
    const res = await app.db.query(
      'INSERT INTO mcp_tokens (user_id, token_hash, label) VALUES ($1, $2, $3) RETURNING id, label, created_at',
      [req.user.id, hashToken(token), req.body?.label ?? null]
    );
    return reply.code(201).send({ ...res.rows[0], token });
  });

  // 취소 (삭제)
  app.delete('/:id', async (req, reply) => {
    const res = await app.db.query(
      'DELETE FROM mcp_tokens WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (res.rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });
}
