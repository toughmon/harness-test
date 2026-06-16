// DB 커넥션 — DATABASE_URL 있으면 PostgreSQL, 없으면 pg-mem 인메모리 폴백(개발/QA용)
export async function createDb(log) {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    log.info('PostgreSQL 연결 (DATABASE_URL)');
    return { query: (text, params) => pool.query(text, params), kind: 'pg', pool };
  }
  const { newDb } = await import('pg-mem');
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();
  log.warn('DATABASE_URL 미설정 — pg-mem 인메모리 DB 사용 (재시작 시 데이터 소실)');
  return { query: (text, params) => pool.query(text, params), kind: 'pg-mem', pool };
}

// 테이블이 없으면 생성 (소규모라 마이그레이션 도구 없이 idempotent DDL로 관리)
export async function initSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      username   VARCHAR(50)  NOT NULL UNIQUE,
      pw_hash    VARCHAR(255) NOT NULL,
      created_at TIMESTAMP    NOT NULL DEFAULT now()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS diagrams (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       VARCHAR(120) NOT NULL,
      data       JSONB        NOT NULL,
      created_at TIMESTAMP    NOT NULL DEFAULT now(),
      updated_at TIMESTAMP    NOT NULL DEFAULT now()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_diagrams_user ON diagrams(user_id)`);
  // MCP 개인 액세스 토큰 — 원문은 저장하지 않고 sha256 해시만 보관
  await db.query(`
    CREATE TABLE IF NOT EXISTS mcp_tokens (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash   VARCHAR(64)  NOT NULL UNIQUE,
      label        VARCHAR(100),
      created_at   TIMESTAMP    NOT NULL DEFAULT now(),
      last_used_at TIMESTAMP
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user ON mcp_tokens(user_id)`);
}
