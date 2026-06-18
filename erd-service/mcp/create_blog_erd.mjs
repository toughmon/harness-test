/**
 * 블로그 ERD 자동 생성 스크립트
 * 실행: node create_blog_erd.mjs  (erd-service 디렉토리에서)
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const BASE_URL = process.env.ERD_BASE_URL ?? 'http://localhost:8080';
const USERNAME = process.env.ERD_USERNAME ?? 'blog-bot';
const PASSWORD = process.env.ERD_PASSWORD ?? 'BlogBot123!';

const MCP_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const transport = new StdioClientTransport({
  command: 'node',
  args: ['--import', 'tsx', 'src/index.ts'],
  cwd: MCP_DIR,
  env: {
    ...process.env,
    ERD_BASE_URL: BASE_URL,
    ERD_USERNAME: USERNAME,
    ERD_PASSWORD: PASSWORD,
  },
  stderr: 'inherit',
});

const client = new Client({ name: 'blog-erd-creator', version: '1.0.0' });
await client.connect(transport);

async function call(name, args) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? '';
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  console.log(`✓ ${name}:`, JSON.stringify(parsed, null, 2).slice(0, 400));
  return parsed;
}

// ─── 1. 새 다이어그램 생성 ────────────────────────────────────────
await call('create_diagram', { name: '블로그 ERD v2' });

// ─── 2. 엔티티 추가 ──────────────────────────────────────────────
await call('add_entity', { name: 'User',    logicalName: '사용자',     withDefaultId: false });
await call('add_entity', { name: 'Post',    logicalName: '게시글',     withDefaultId: false });
await call('add_entity', { name: 'Comment', logicalName: '댓글',       withDefaultId: false });
await call('add_entity', { name: 'Tag',     logicalName: '태그',       withDefaultId: false });
await call('add_entity', { name: 'PostTag', logicalName: '게시글-태그', withDefaultId: false });

// ─── 3. 컬럼 추가 ────────────────────────────────────────────────
// ※ PK는 엔티티 접두사 명명 (user_id, post_id…) — FK와 이름 충돌 방지

// User
await call('add_column', { entity: 'User', name: 'user_id',    logicalName: '사용자아이디', type: 'INT',      size: '', isPK: true,  isNN: true });
await call('add_column', { entity: 'User', name: 'nickname',   logicalName: '닉네임',       type: 'VARCHAR',  size: '100', isPK: false, isNN: true });
await call('add_column', { entity: 'User', name: 'email',      logicalName: '이메일',       type: 'VARCHAR',  size: '200', isPK: false, isNN: true, isUnique: true });
await call('add_column', { entity: 'User', name: 'created_at', logicalName: '가입일',       type: 'DATETIME', size: '', isPK: false, isNN: true });

// Post  (user_id FK는 관계에서 자동 생성)
await call('add_column', { entity: 'Post', name: 'post_id',      logicalName: '게시글아이디', type: 'INT',      size: '', isPK: true,  isNN: true });
await call('add_column', { entity: 'Post', name: 'title',        logicalName: '제목',         type: 'VARCHAR',  size: '500', isPK: false, isNN: true });
await call('add_column', { entity: 'Post', name: 'content',      logicalName: '본문',         type: 'TEXT',     size: '', isPK: false, isNN: false });
await call('add_column', { entity: 'Post', name: 'published_at', logicalName: '게시일',       type: 'DATETIME', size: '', isPK: false, isNN: false });

// Comment  (post_id FK+PK, user_id FK는 관계에서 자동 생성)
await call('add_column', { entity: 'Comment', name: 'comment_id', logicalName: '댓글아이디', type: 'INT',      size: '', isPK: true,  isNN: true });
await call('add_column', { entity: 'Comment', name: 'content',    logicalName: '내용',       type: 'TEXT',     size: '', isPK: false, isNN: true });
await call('add_column', { entity: 'Comment', name: 'created_at', logicalName: '작성일',     type: 'DATETIME', size: '', isPK: false, isNN: true });

// Tag
await call('add_column', { entity: 'Tag', name: 'tag_id', logicalName: '태그아이디', type: 'INT',     size: '', isPK: true,  isNN: true });
await call('add_column', { entity: 'Tag', name: 'name',   logicalName: '태그명',     type: 'VARCHAR', size: '100', isPK: false, isNN: true, isUnique: true });

// PostTag  (post_id FK+PK는 식별 관계에서, tag_id FK는 비식별 관계에서 자동 생성)

// ─── 4. 관계 추가 (FK 자동 생성) ────────────────────────────────

// User 1:M Post  (비식별 — user_id가 Post PK 아님)
await call('add_relationship', { source: 'User', target: 'Post',    type: 'ONE_TO_MANY_NON_IDENTIFYING' });

// Post 1:M Comment  (식별 — post_id가 Comment PK에 포함)
await call('add_relationship', { source: 'Post',    target: 'Comment', type: 'ONE_TO_MANY_IDENTIFYING' });

// User 1:M Comment  (비식별 — user_id가 Comment PK 아님)
await call('add_relationship', { source: 'User', target: 'Comment', type: 'ONE_TO_MANY_NON_IDENTIFYING' });

// Post 1:M PostTag  (식별 — post_id가 PostTag 복합 PK)
await call('add_relationship', { source: 'Post', target: 'PostTag', type: 'ONE_TO_MANY_IDENTIFYING' });

// Tag 1:M PostTag  (비식별 — tag_id는 PostTag PK에 비포함)
await call('add_relationship', { source: 'Tag',  target: 'PostTag', type: 'ONE_TO_MANY_NON_IDENTIFYING' });

// ─── 5. 결과 확인 ────────────────────────────────────────────────
const result = await call('get_diagram', {});
const entityNames = result?.entities?.map(e => e.name) ?? [];
console.log('\n생성된 엔티티:', entityNames.join(', '));

await client.close();
console.log('\n블로그 ERD 생성 완료!');
