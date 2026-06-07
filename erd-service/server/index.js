// 프로덕션 서버 — dist/ 정적 서빙 + SPA fallback + /api 라우트(인증·다이어그램)
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import path from 'node:path';
import { createDb, initSchema } from './db.js';
import authRoutes from './auth-routes.js';
import diagramRoutes from './diagram-routes.js';

// 로컬 개발용 .env 로드 (없으면 무시)
if (process.env.NODE_ENV !== 'production') {
  try { process.loadEnvFile(path.resolve(import.meta.dirname, '../.env')); } catch { /* no .env */ }
}

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = Fastify({ logger: true });

// DB 연결 + 스키마 초기화
const db = await createDb(app.log);
await initSchema(db);
app.decorate('db', db);

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

// API 라우트
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(diagramRoutes, { prefix: '/api/diagrams' });

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
