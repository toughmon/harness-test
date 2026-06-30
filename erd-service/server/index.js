// 프로덕션 서버 — dist/ 정적 서빙 + SPA fallback + /api 라우트(인증·다이어그램)
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import path from 'node:path';
import { createDb, initSchema } from './db.js';
import authRoutes from './auth-routes.js';
import diagramRoutes from './diagram-routes.js';
import mcpTokenRoutes from './mcp-token-routes.js';
import { hashToken, TOKEN_PREFIX } from './mcp-token-util.js';
import { tsImport } from 'tsx/esm/api';

// MCP 브리지는 TS(전이 의존 포함)라, plain node에서도 로드되도록 tsx의 tsImport로 런타임에 가져온다.
// (정적 import 시 `node --import tsx`로만 떠서, pm2가 plain node로 띄우면 .ts 확장자 에러로 크래시)
const { attachMcpHttp } = await tsImport('../mcp/src/httpServer.ts', import.meta.url);

// .env 로드 (없으면 무시) — 프로덕션에서도 로드해 DATABASE_URL/JWT_SECRET가 확실히 적용되게 한다.
// (pm2가 plain node로 띄우면 셸 export가 누락되기 쉬워, .env를 항상 시도하는 편이 안전하다.)
try { process.loadEnvFile(path.resolve(import.meta.dirname, '../.env')); } catch { /* no .env */ }

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = Fastify({ logger: true });

// DB 연결 + 스키마 초기화
const db = await createDb(app.log);
await initSchema(db);
app.decorate('db', db);

// 어떤 DB로 떴는지 명확히 표기 — pg-mem은 재시작 시 모든 데이터(계정·MCP 토큰·다이어그램) 소실.
// 프로덕션에서 영속 DB 없이 떠 있으면 "다음에 쓰면 토큰이 failed" 사고가 재발하므로 기동을 거부한다.
if (db.kind === 'pg-mem') {
  app.log.warn('──────────────────────────────────────────────────────────────');
  app.log.warn('⚠  pg-mem 인메모리 DB로 동작 중 — 재시작하면 계정·MCP 토큰·저장된 다이어그램이 모두 사라집니다.');
  app.log.warn('⚠  영속화하려면 .env(또는 환경변수)에 DATABASE_URL(PostgreSQL)을 설정하세요.');
  app.log.warn('──────────────────────────────────────────────────────────────');
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PGMEM !== '1') {
    app.log.error('프로덕션에서 영속 DB 없이 기동을 거부합니다. DATABASE_URL을 설정하거나, 의도적이라면 ALLOW_PGMEM=1로 허용하세요.');
    process.exit(1);
  }
} else {
  app.log.info(`영속 DB 연결됨 (kind=${db.kind})`);
}

// 인증 (JWT httpOnly 쿠키)
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  app.log.warn('JWT_SECRET 미설정 — 프로덕션에서는 반드시 환경변수로 설정하세요');
}
await app.register(fastifyCookie);
await app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me',
  cookie: { cookieName: 'token', signed: false },
});
app.decorate('authenticate', async (req, reply) => {
  try {
    await req.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

// MCP 개인 토큰(PAT) 또는 JWT(쿠키/베어러) 둘 다 허용 — 원격 MCP(/mcp) 인증용
app.decorate('authenticateAny', async (req, reply) => {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith(`Bearer ${TOKEN_PREFIX}`)) {
    const token = auth.slice('Bearer '.length);
    const res = await app.db.query(
      `SELECT t.id, u.id AS user_id, u.username
         FROM mcp_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1`,
      [hashToken(token)]
    );
    if (res.rows.length === 0) {
      return reply.code(401).send({ error: 'invalid_token' });
    }
    req.user = { id: res.rows[0].user_id, username: res.rows[0].username };
    // 마지막 사용시각 갱신(베스트 에포트 — 실패해도 요청은 진행)
    app.db.query('UPDATE mcp_tokens SET last_used_at = now() WHERE id = $1', [res.rows[0].id]).catch(() => {});
    return;
  }
  try {
    await req.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

// API 라우트
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(diagramRoutes, { prefix: '/api/diagrams' });
await app.register(mcpTokenRoutes, { prefix: '/api/mcp-tokens' });

// 헬스체크 — 현재 DB 종류 노출(운영 중 pg/pg-mem 즉시 확인). 인증 불요.
app.get('/api/health', async () => ({ ok: true, db: db.kind }));

// 원격 MCP 전송 (/mcp) — 정적 서빙/SPA fallback 보다 먼저 등록해 우선 매칭
attachMcpHttp(app, {
  selfOrigin: `http://127.0.0.1:${PORT}`,
  mintJwt: (user) => app.jwt.sign({ id: user.id, username: user.username }, { expiresIn: '10m' }),
});

// 정적 서빙
await app.register(fastifyStatic, {
  root: path.resolve(import.meta.dirname, '../dist'),
});

// SPA fallback — 클라이언트 라우트 새로고침 시 404 대신 index.html 반환
// (/api/*는 제외해 미구현 API 호출이 명확한 404 JSON을 받도록 함)
app.setNotFoundHandler((req, reply) => {
  if (req.raw.url?.startsWith('/api/')) {
    return reply.code(404).send({ error: 'Not Found' });
  }
  return reply.sendFile('index.html');
});

app.listen({ port: PORT, host: HOST }).catch(err => {
  app.log.error(err);
  process.exit(1);
});
