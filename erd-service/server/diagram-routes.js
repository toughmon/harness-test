// 다이어그램 CRUD — 전부 로그인 필수, 본인 소유만 접근 가능
const diagramBodySchema = {
  body: {
    type: 'object',
    required: ['data'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      data: { type: 'object' },
    },
  },
};

export default async function diagramRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  // 목록 (data 제외 — 페이로드 경량화)
  app.get('/', async (req) => {
    const res = await app.db.query(
      'SELECT id, name, updated_at FROM diagrams WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.user.id]
    );
    return res.rows;
  });

  // 생성
  app.post('/', { schema: diagramBodySchema }, async (req, reply) => {
    const { name, data } = req.body;
    if (!name) return reply.code(400).send({ error: 'name_required' });
    const res = await app.db.query(
      'INSERT INTO diagrams (user_id, name, data) VALUES ($1, $2, $3) RETURNING id, name, updated_at',
      [req.user.id, name, JSON.stringify(data)]
    );
    return reply.code(201).send(res.rows[0]);
  });

  // 단일 조회 (data 포함)
  app.get('/:id', async (req, reply) => {
    const res = await app.db.query(
      'SELECT id, name, data, updated_at FROM diagrams WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (res.rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    return res.rows[0];
  });

  // 저장(덮어쓰기) — name은 전달 시에만 변경
  app.put('/:id', { schema: diagramBodySchema }, async (req, reply) => {
    const { name, data } = req.body;
    const res = await app.db.query(
      `UPDATE diagrams SET data = $1, name = COALESCE($2, name), updated_at = now()
       WHERE id = $3 AND user_id = $4 RETURNING id, name, updated_at`,
      [JSON.stringify(data), name ?? null, req.params.id, req.user.id]
    );
    if (res.rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    return res.rows[0];
  });

  // 이름 변경 전용
  app.patch('/:id', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
      },
    },
  }, async (req, reply) => {
    const res = await app.db.query(
      `UPDATE diagrams SET name = $1, updated_at = now()
       WHERE id = $2 AND user_id = $3 RETURNING id, name, updated_at`,
      [req.body.name, req.params.id, req.user.id]
    );
    if (res.rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    return res.rows[0];
  });

  // 삭제
  app.delete('/:id', async (req, reply) => {
    const res = await app.db.query(
      'DELETE FROM diagrams WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (res.rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });
}
