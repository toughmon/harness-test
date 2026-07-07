// 공유 링크 + 실시간 "함께 보기"(Phase 1) e2e 검증
// 전제: npm run build && ALLOW_PGMEM=1 npm start (8080)
// 커버: 링크 발급/목록/폐기 · 접근제어(익명 401·소유자 라우트 비공개·토큰↔다이어그램 바인딩)
//       · 뷰어 읽기 전용 · 소유자 편집 실시간 반영 · presence
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });

let fail = 0;
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) fail++;
}

async function register(page, username) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('button[aria-label="User"]');
  await page.waitForTimeout(300);
  await page.click('button:text-is("회원가입")');
  await page.fill('input[placeholder="영문/숫자 3자 이상"]', username);
  await page.fill('input[placeholder="8자 이상"]', 'password123');
  await page.click('button:has-text("가입하기")');
  await page.waitForTimeout(900);
}

const owner = `own${Math.floor(Date.now() % 1000000)}`;
const viewer = `viw${Math.floor((Date.now() + 7) % 1000000)}`;

const ownerCtx = await browser.newContext();
const page = await ownerCtx.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('OWNER PAGE ERROR:', e.message));

try {
  // ── 1. 소유자 가입 + 엔티티 1개 + DB 저장 ──
  await register(page, owner);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  check('소유자: 엔티티 1개', await page.locator('.react-flow__node').count() === 1);
  await page.click('button[aria-label="DB Save"]');
  await page.waitForTimeout(400);
  await page.fill('[data-testid="dialog-input"]', 'Shared ERD');
  await page.click('[data-testid="dialog-ok"]');
  await page.waitForTimeout(900);
  const diagrams = await page.request.get(`${BASE}/api/diagrams`).then(r => r.json());
  const diagA = diagrams.find(d => d.name === 'Shared ERD');
  check('DB 저장 → 다이어그램 A 생성', !!diagA);

  // ── 2. 공유 모달에서 뷰어 링크 발급 ──
  await page.click('[data-testid="share-btn"]');
  await page.waitForTimeout(500);
  check('공유 모달 노출', await page.locator('[data-testid="share-modal"]').count() === 1);
  await page.click('[data-testid="share-create"]');
  await page.waitForTimeout(700);
  const link = (await page.locator('[data-testid="share-link"]').textContent())?.trim() ?? '';
  check('뷰어 링크 생성 (/d/erdshare_)', link.includes('/d/erdshare_'));
  const token = link.split('/d/')[1];
  check('공유 링크 목록에 1개', await page.locator('[data-testid="share-list"] button[aria-label^="Revoke share"]').count() === 1);
  // 모달 닫기 (소유자 협업 연결은 유지됨)
  await page.click('[data-testid="share-modal"] button[aria-label="닫기"]');
  await page.waitForTimeout(300);

  // ── 3. 접근제어 (API) ──
  // 3-1. 익명(쿠키 없음) → 로그인 필요 401 (ALLOW_ANON_SHARE 미설정)
  const anonCtx = await browser.newContext();
  const anonShared = await anonCtx.request.get(`${BASE}/api/shared/${token}`);
  check('익명 GET /api/shared/:token → 401(로그인 필요)', anonShared.status() === 401);
  // 3-2. 소유자 전용 라우트는 쿠키 없이는 여전히 비공개
  const anonOwn = await anonCtx.request.get(`${BASE}/api/diagrams/${diagA.id}`);
  check('익명 GET /api/diagrams/:id → 401', anonOwn.status() === 401);
  await anonCtx.close();

  // ── 4. 뷰어(다른 계정) 가입 후 공유 링크 열기 ──
  const viewerCtx = await browser.newContext();
  const page2 = await viewerCtx.newPage();
  await page2.setViewportSize({ width: 1400, height: 900 });
  page2.on('pageerror', e => console.log('VIEWER PAGE ERROR:', e.message));
  await register(page2, viewer);
  await page2.goto(`${BASE}/d/${token}`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1800);
  check('뷰어: 공유 다이어그램 렌더(노드 1개)', await page2.locator('.react-flow__node').count() === 1);
  check('뷰어: 읽기 전용 배지', await page2.locator('[data-testid="readonly-badge"]').count() === 1);
  check('뷰어: Add Entity 버튼 없음(읽기 전용)', await page2.locator('button:has-text("Add Entity")').count() === 0);
  const vStatus = await page2.locator('[data-testid="collab-status"]').getAttribute('data-status');
  check('뷰어: 협업 연결 live', vStatus === 'live');

  // 4-1. 뷰어 계정은 소유자 전용 라우트로 A를 못 읽음 (공유는 /api/shared 전용)
  const viewerOwn = await page2.request.get(`${BASE}/api/diagrams/${diagA.id}`);
  check('뷰어: GET /api/diagrams/:id(소유 아님) → 404', viewerOwn.status() === 404);
  // 4-2. 토큰은 자기 다이어그램(A)만 가리킴
  const sharedJson = await page2.request.get(`${BASE}/api/shared/${token}`).then(r => r.json());
  check('토큰 → 다이어그램 A 바인딩', sharedJson.id === diagA.id);

  // ── 5. presence: 소유자 화면에 참여자 2명 ──
  await page.waitForTimeout(1200);
  const pcount = await page.locator('[data-testid="collab-participants"]').getAttribute('data-count').catch(() => null);
  check('소유자: presence 참여자 2명', pcount === '2');

  // ── 6. 실시간 반영: 소유자가 엔티티 추가 → 뷰어에 나타남 ──
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(500);
  check('소유자: 엔티티 2개', await page.locator('.react-flow__node').count() === 2);
  await page2.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 2, { timeout: 8000 }).catch(() => {});
  check('뷰어: 실시간으로 엔티티 2개 반영', await page2.locator('.react-flow__node').count() === 2);
  await page2.screenshot({ path: 'C:/project/harness-test/erd-service/ss_share_viewer.png' });
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_share_owner.png' });

  // ── 7. 폐기 → 뷰어 재접속 시 거부 ──
  await page.click('[data-testid="share-btn"]');
  await page.waitForTimeout(500);
  await page.click('[data-testid="share-list"] button[aria-label^="Revoke share"]');
  await page.waitForTimeout(700);
  // 로그인한 뷰어 쿠키로 조회 → 로그인 가드는 통과하고 토큰 검증에서 폐기로 403 (익명이면 401이라 폐기 증명 안 됨)
  const revoked = await page2.request.get(`${BASE}/api/shared/${token}`);
  check('폐기된 토큰 GET /api/shared/:token → 403', revoked.status() === 403);
  await page2.goto(`${BASE}/d/${token}`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1500);
  check('뷰어: 폐기된 링크 → 에러 배너', await page2.locator('[data-testid="shared-error"]').count() === 1);

  await viewerCtx.close();

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_share_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
