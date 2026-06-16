// 원격(co-host) HTTP MCP + 개인토큰(PAT) e2e 검증
// 전제: 상위 erd-service가 `npm run build && npm start` (8080, pg-mem)로 떠 있어야 한다.
//
// Phase A: 사용자 가입 → /api/mcp-tokens로 PAT 발급 → StreamableHTTP 클라이언트가
//          Authorization: Bearer <PAT>로 /mcp에 붙어 도구 호출 → 저장 blob 검증.
// Phase B: 다른 사용자 PAT로는 그 사용자 다이어그램만 보임(격리) + 잘못된 토큰은 거부.
// Phase C: 발급 사용자로 브라우저 로그인 → MCP가 만든 다이어그램 렌더 확인 + 스크린샷.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const TS = Date.now();
const UA = { username: `rmtA_${TS}`, password: 'remote-pass-A-123' };
const UB = { username: `rmtB_${TS}`, password: 'remote-pass-B-123' };
const DIAG_NAME = `Remote MCP ${TS}`;

let fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail++;
}

// 가입(자동 로그인) → set-cookie의 token 추출
async function registerUser(u) {
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(u),
  });
  if (r.status !== 201 && r.status !== 409) throw new Error(`가입 실패 ${u.username} (HTTP ${r.status})`);
  if (r.status === 409) {
    const r2 = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(u),
    });
    return cookieOf(r2);
  }
  return cookieOf(r);
}
function cookieOf(res) {
  const list = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  for (const raw of list) {
    const pair = raw.split(';')[0]?.trim();
    if (pair?.startsWith('token=')) return pair;
  }
  throw new Error('token 쿠키 없음');
}

// PAT 발급 (쿠키 인증)
async function issueToken(cookie, label) {
  const r = await fetch(`${BASE}/api/mcp-tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ label }),
  });
  if (r.status !== 201) throw new Error(`토큰 발급 실패 (HTTP ${r.status})`);
  return r.json();
}

function mkClient(token) {
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: 'verify-remote', version: '0.0.0' });
  return { client, transport };
}
async function callOn(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (res.isError) throw new Error(`tool ${name} 오류: ${text}`);
  const jsonPart = text.replace(/\n\n※[\s\S]*$/, '');
  try { return JSON.parse(jsonPart); } catch { return text; }
}

const browser = await chromium.launch({ headless: true });
let clientA, clientB;

try {
  // ───────── Phase A: PAT 발급 + 원격 MCP 도구 호출 ─────────
  const cookieA = await registerUser(UA);
  const issued = await issueToken(cookieA, 'claude-code');
  check('PAT 발급 → 원문/접두사', typeof issued.token === 'string' && issued.token.startsWith('erdmcp_'), issued.token?.slice(0, 12));
  check('PAT 발급 → 토큰 원문은 1회 응답에만 (목록엔 없음)', !('token' in (await (await fetch(`${BASE}/api/mcp-tokens`, { headers: { Cookie: cookieA } })).json())[0]));

  const a = mkClient(issued.token);
  clientA = a.client;
  await clientA.connect(a.transport);
  check('원격 MCP 연결 (PAT 인증)', !!a.transport.sessionId, `session=${a.transport.sessionId?.slice(0, 8)}`);

  const tools = await clientA.listTools();
  const toolNames = tools.tools.map(t => t.name);
  check('도구 등록 (15개 이상)', toolNames.length >= 15, `${toolNames.length}개`);
  check('핵심 도구 존재', ['create_diagram', 'add_entity', 'add_relationship', 'get_diagram'].every(n => toolNames.includes(n)));

  const created = await callOn(clientA, 'create_diagram', { name: DIAG_NAME });
  const diagramId = created.created.id;
  check('create_diagram → id 발급', Number.isInteger(diagramId), `id=${diagramId}`);

  await callOn(clientA, 'add_entity', { name: 'User', logicalName: '사용자' });
  await callOn(clientA, 'update_column', { entity: 'User', column: 'id', name: 'user_id' });
  await callOn(clientA, 'add_entity', { name: 'Order', logicalName: '주문' });
  const rel = await callOn(clientA, 'add_relationship', { source: 'User', target: 'Order', type: 'ONE_TO_MANY_NON_IDENTIFYING' });
  check('add_relationship → FK 자동생성 보고', rel.added?.fkColumnsAdded?.some(c => c.name === 'user_id'));

  const g1 = await callOn(clientA, 'get_diagram', { raw: true });
  const user1 = g1.raw.entities.find(e => e.name === 'User');
  const order1 = g1.raw.entities.find(e => e.name === 'Order');
  const fk1 = order1.columns.find(c => c.name === 'user_id');
  check('Order에 FK(user_id) 생성', !!fk1 && fk1.isFK === true);
  check('FK refEntityId == User.id', fk1?.refEntityId === user1.id);
  check('비식별 FK: PK 미포함·NOT NULL', fk1?.isPK === false && fk1?.isNN === true);
  check('관계 1개 저장', g1.raw.relationships.length === 1);

  await callOn(clientA, 'update_relationship_type', { source: 'User', target: 'Order', type: 'ONE_TO_MANY_IDENTIFYING' });
  const g2 = await callOn(clientA, 'get_diagram', { raw: true });
  const fk2 = g2.raw.entities.find(e => e.name === 'Order').columns.find(c => c.name === 'user_id');
  check('식별 전환 → FK가 PK로 승격', fk2?.isPK === true && fk2?.isFK === true);

  // ───────── Phase B: 사용자 격리 + 잘못된 토큰 거부 ─────────
  const listA = await callOn(clientA, 'list_diagrams');
  check('A: 자기 다이어그램 보임', listA.diagrams.some(d => d.id === diagramId));

  const cookieB = await registerUser(UB);
  const issuedB = await issueToken(cookieB, 'claude-code');
  const b = mkClient(issuedB.token);
  clientB = b.client;
  await clientB.connect(b.transport);
  const listB = await callOn(clientB, 'list_diagrams');
  check('B: A의 다이어그램은 안 보임 (사용자 격리)', !listB.diagrams.some(d => d.id === diagramId));

  let rejected = false;
  try {
    const bad = mkClient('erdmcp_bogus_invalid_token_value');
    await bad.client.connect(bad.transport);
    await bad.client.close();
  } catch { rejected = true; }
  check('잘못된 PAT → 연결 거부', rejected);

  // ───────── Phase C: 브라우저 렌더 ─────────
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.click('button[aria-label="User"]');
  await page.waitForTimeout(300);
  await page.click('button:text-is("로그인")');
  await page.fill('input[placeholder="영문/숫자 3자 이상"]', UA.username);
  await page.fill('input[placeholder="8자 이상"]', UA.password);
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
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_mcp_remote.png' });

  await clientA.close();
  await clientB.close();

  console.log(`\n총 ${fail === 0 ? 'ALL PASS' : fail + ' FAILED'}`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.stack ?? e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  try { await clientA?.close(); } catch { /* noop */ }
  try { await clientB?.close(); } catch { /* noop */ }
}
