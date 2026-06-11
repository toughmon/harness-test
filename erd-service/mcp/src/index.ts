#!/usr/bin/env node
// ERD MCP 서버 — Claude Code가 stdio로 연결해 배포된 ERD 서비스의 다이어그램을
// 생성·편집한다. 변형 로직은 상위 앱과 공유하는 src/core/erdOps를 그대로 사용.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getConfig } from './config';
import { setCurrentId } from './session';
import { registerDiagramTools } from './tools/diagrams';
import { registerEntityTools } from './tools/entities';
import { registerColumnTools } from './tools/columns';
import { registerRelationshipTools } from './tools/relationships';

async function main(): Promise<void> {
  const cfg = getConfig();
  const server = new McpServer({ name: 'erd', version: '0.1.0' });

  registerDiagramTools(server);
  registerEntityTools(server);
  registerColumnTools(server);
  registerRelationshipTools(server);

  // ERD_DIAGRAM_ID가 주어지면 시작 시 현재 다이어그램으로 미리 선택
  if (cfg.diagramId != null) setCurrentId(cfg.diagramId);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[erd-mcp] ready (baseUrl=${cfg.baseUrl})\n`);
}

main().catch((e) => {
  process.stderr.write(`[erd-mcp] fatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
