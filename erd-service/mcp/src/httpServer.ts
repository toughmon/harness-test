// 원격(co-host) HTTP MCP 전송 — 기존 Fastify 앱에 /mcp 엔드포인트로 MCP 서버를 합쳐
// 호스팅한다. Claude Code는 `claude mcp add --transport http ... <origin>/mcp` 한 줄로
// 붙고, 사용자별 개인 토큰(PAT)으로 인증한다(서비스계정 불필요).
//
// 도구 코드(tools/*, shared erdOps)는 stdio 서버와 100% 공유. 요청마다 reqCtx에 그 사용자의
// 단기 JWT와 세션 id를 실어 httpClient/session이 "현재 요청 사용자"로 동작하게 한다.
//
// SDK·zod import가 이 파일(mcp/src) 기준으로 해석되므로, 도구들과 항상 동일한 사본을
// 쓰게 되어 dual-package(서로 다른 zod 인스턴스) 문제를 피한다.

import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { reqCtx } from './requestContext';
import { clearSession } from './session';
import { registerDiagramTools } from './tools/diagrams';
import { registerEntityTools } from './tools/entities';
import { registerColumnTools } from './tools/columns';
import { registerRelationshipTools } from './tools/relationships';

interface Entry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

// JSON-RPC initialize 요청인지 (단건/배치 모두 허용)
function isInitialize(body: unknown): boolean {
  const has = (m: unknown) => !!m && typeof m === 'object' && (m as { method?: string }).method === 'initialize';
  return Array.isArray(body) ? body.some(has) : has(body);
}

export interface AttachOptions {
  // /api/* 자기호출에 쓸 베이스 URL (보통 자기 자신: http://127.0.0.1:<PORT>)
  selfOrigin: string;
  // 인증된 사용자에 대한 단기 JWT 발급기 (app.jwt.sign 래퍼)
  mintJwt: (user: { id: number; username: string }) => string;
}

// app: Fastify 인스턴스. app.authenticateAny preHandler가 req.user를 채워야 한다.
export function attachMcpHttp(app: any, opts: AttachOptions): void {
  const sessions = new Map<string, Entry>();

  function buildServer(): McpServer {
    const server = new McpServer({ name: 'erd', version: '0.1.0' });
    registerDiagramTools(server);
    registerEntityTools(server);
    registerColumnTools(server);
    registerRelationshipTools(server);
    return server;
  }

  const handler = async (request: any, reply: any): Promise<void> => {
    const sid: string | undefined = request.headers['mcp-session-id'];
    const body = request.method === 'POST' ? request.body : undefined;
    let entry = sid ? sessions.get(sid) : undefined;

    if (!entry) {
      // 세션이 없으면 initialize POST만 허용 — 새 서버/전송 생성
      if (request.method !== 'POST' || !isInitialize(body)) {
        reply.code(400).send({
          jsonrpc: '2.0',
          error: { code: -32000, message: '유효한 세션이 없습니다. 먼저 initialize 하세요.' },
          id: null,
        });
        return;
      }
      const server = buildServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newId: string) => { sessions.set(newId, { transport, server }); },
      });
      transport.onclose = () => {
        const id = transport.sessionId;
        if (id) { sessions.delete(id); clearSession(id); }
      };
      await server.connect(transport);
      entry = { transport, server };
    }

    // 인증된 사용자로 동작하는 단기 JWT를 reqCtx에 실어 도구 코드까지 전달
    const jwt = opts.mintJwt({ id: request.user.id, username: request.user.username });
    const sessionId = entry.transport.sessionId ?? sid;

    reply.hijack(); // 응답을 transport가 직접 raw로 기록
    await reqCtx.run({ jwt, baseUrl: opts.selfOrigin, sessionId }, () =>
      entry!.transport.handleRequest(request.raw, reply.raw, body));
  };

  app.post('/mcp', { preHandler: app.authenticateAny }, handler);
  app.get('/mcp', { preHandler: app.authenticateAny }, handler);
  app.delete('/mcp', { preHandler: app.authenticateAny }, handler);
}
