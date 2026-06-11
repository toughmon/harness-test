// ERD MCP 서버 e2e 검증
// 전제: 상위 erd-service가 npm run build && npm start (8080, pg-mem)로 떠 있고,
//       서비스 계정(mcp-bot)이 등록돼 있어야 한다(스크립트가 없으면 자동 등록 시도).
//
// Phase B: MCP SDK 클라이언트로 서버를 stdio로 띄워 도구를 호출 → 저장된 blob에 FK
//          자동생성/플래그전환/연쇄삭제가 반영됐는지 get_diagram(raw)으로 검증.
// Phase C: 같은 계정으로 브라우저 로그인 → 다이어그램 열기 → 노드/엣지/FK 렌더 확인.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const USER = process.env.ERD_USERNAME ?? 'mcp-bot';
const PASS = process.env.ERD_PASSWORD ?? 'mcp-bot-secret-123';
const MCP_DIR = 'C:/project/harness-test/erd-service/mcp';
const DIAG_NAME = `MCP Test ${Date.now()}`;

let fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail++;
}

// 서비스 계정 보장 (이미 있으면 409 무시)
async function ensureAccount() {
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (r.status !== 201 && r.status !== 409) {
    throw new Error(`서비스 계정 준비 실패 (HTTP ${r.status})`);
  }
}

let client;
async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (res.isError) throw new Error(`tool ${name} 오류: ${text}`);
  const jsonPart = text.replace(/\n\n※[\s\S]*$/, ''); // REFRESH_NOTE 제거
  try { return JSON.parse(jsonPart); } catch { return text; }
}

const browser = await chromium.launch({ headless: true });

try {
  await ensureAccount();

  // ───────── Phase B: MCP over stdio ─────────
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['--import', 'tsx', 'src/index.ts'],
    cwd: MCP_DIR,
    env: { ...process.env, ERD_BASE_URL: BASE, ERD_USERNAME: USER, ERD_PASSWORD: PASS },
    stderr: 'inherit',
  });
  client = new Client({ name: 'verify-mcp', version: '0.0.0' });
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map(t => t.name);
  check('도구 등록 (15개 이상)', toolNames.length >= 15, `${toolNames.length}개`);
  check('핵심 도구 존재', ['create_diagram', 'add_entity', 'add_column', 'add_relationship', 'get_diagram']
    .every(n => toolNames.includes(n)));

  const created = await call('create_diagram', { name: DIAG_NAME });
  const diagramId = created.created.id;
  check('create_diagram → id 발급', Number.isInteger(diagramId), `id=${diagramId}`);

  const userAdd = await call('add_entity', { name: 'User', logicalName: '사용자' });
  check('add_entity User', userAdd.added?.name === 'User');

  // 부모 PK를 자식 기본 id와 겹치지 않게 변경 (비식별 FK가 자식 id를 교체하지 않도록)
  await call('update_column', { entity: 'User', column: 'id', name: 'user_id' });

  const orderAdd = await call('add_entity', { name: 'Order', logicalName: '주문' });
  check('add_entity Order', orderAdd.added?.name === 'Order');

  await call('add_column', { entity: 'Order', name: 'amount', type: 'DECIMAL', size: '10,2' });

  const rel = await call('add_relationship', { source: 'User', target: 'Order', type: 'ONE_TO_MANY_NON_IDENTIFYING' });
  check('add_relationship → FK 자동생성 보고', rel.added?.fkColumnsAdded?.some(c => c.name === 'user_id'));

  // 저장된 blob 재조회로 FK 자동생성 검증
  const g1 = await call('get_diagram', { raw: true });
  const order1 = g1.raw.entities.find(e => e.name === 'Order');
  const user1 = g1.raw.entities.find(e => e.name === 'User');
  const userPk = user1.columns.find(c => c.isPK);
  const fk1 = order1.columns.find(c => c.name === 'user_id');
  check('Order에 FK 컬럼(user_id) 생성', !!fk1);
  check('FK isFK=true', fk1?.isFK === true);
  check('FK refEntityId == User.id', fk1?.refEntityId === user1.id);
  check('FK refColumnId == User PK.id', fk1?.refColumnId === userPk.id);
  check('비식별 FK는 PK 미포함(isPK=false)', fk1?.isPK === false);
  check('비식별 FK는 NOT NULL(isNN=true)', fk1?.isNN === true);
  check('Order 자체 PK(id) 보존', order1.columns.some(c => c.name === 'id' && c.isPK && !c.isFK));
  check('관계 1개 저장', g1.raw.relationships.length === 1);

  // 타입 변경: 비식별 → 식별 → FK가 PK로 승격
  await call('update_relationship_type', { source: 'User', target: 'Order', type: 'ONE_TO_MANY_IDENTIFYING' });
  const g2 = await call('get_diagram', { raw: true });
  const fk2 = g2.raw.entities.find(e => e.name === 'Order').columns.find(c => c.name === 'user_id');
  check('식별 전환 → FK가 PK로 승격(isPK=true)', fk2?.isPK === true && fk2?.isFK === true);

  // ───────── Phase C: 브라우저 렌더 ─────────
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('button[aria-label="User"]');
  await page.waitForTimeout(300);
  await page.click('button:text-is("로그인")');
  await page.fill('input[placeholder="영문/숫자 3자 이상"]', USER);
  await page.fill('input[placeholder="8자 이상"]', PASS);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(1000);
  check('브라우저 로그인 성공', await page.locator('[data-testid="my-diagrams"]').count() === 1);

  const item = page.locator(`[data-testid="my-diagrams"] >> text=${DIAG_NAME}`);
  check('MCP 생성 다이어그램이 목록에 표시', await item.count() >= 1);
  await item.first().click();
  await page.waitForTimeout(1000);
  await page.click('button[title="Fit View"]').catch(() => {});
  await page.waitForTimeout(500);

  check('렌더: 노드 2개', await page.locator('.react-flow__node').count() === 2);
  check('렌더: 관계선 1개', await page.locator('.react-flow__edge').count() === 1);
  const fkIcons = await page.locator('.react-flow__node').locator('[title="Foreign Key"]').count();
  check('렌더: FK 아이콘 표시', fkIcons >= 1, `fkIcons=${fkIcons}`);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_mcp.png' });

  // ───────── Phase D: 삭제 연쇄 (MCP) ─────────
  await call('delete_relationship', { source: 'User', target: 'Order' });
  const g3 = await call('get_diagram', { raw: true });
  const order3 = g3.raw.entities.find(e => e.name === 'Order');
  check('관계 삭제 → FK 컬럼 제거', !order3.columns.some(c => c.name === 'user_id' && c.isFK));
  check('관계 삭제 → 관계 0개', g3.raw.relationships.length === 0);

  await call('delete_entity', { entity: 'User' });
  const g4 = await call('get_diagram', { raw: true });
  check('엔티티 삭제 → 1개 남음', g4.raw.entities.length === 1 && g4.raw.entities[0].name === 'Order');

  await client.close();

  console.log(`\n총 ${fail === 0 ? '' : ''}${fail === 0 ? 'ALL PASS' : fail + ' FAILED'}`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  try { await client?.close(); } catch { /* noop */ }
}
