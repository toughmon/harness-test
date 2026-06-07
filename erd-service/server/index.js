// 프로덕션 서버 — dist/ 정적 서빙 + SPA fallback
// 향후 로그인/DB 저장 백엔드가 추가되면 이 파일에 /api/* 라우트를 등록한다.
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = Fastify({ logger: true });

app.register(fastifyStatic, {
  root: path.resolve(import.meta.dirname, '../dist'),
});

// 향후 백엔드 라우트 등록 지점:
// app.register(authRoutes,    { prefix: '/api/auth' });
// app.register(diagramRoutes, { prefix: '/api/diagrams' });

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
