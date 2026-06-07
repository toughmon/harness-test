// 백엔드(로그인 + 다이어그램 DB 저장) e2e 검증
// 전제: npm run build && npm start (8080, DATABASE_URL 미설정 → pg-mem)
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
// confirm/prompt 자동 응답 (다이어그램 이름 입력, 전환 경고)
let promptValue = 'My First ERD';
page.on('dialog', d => {
  if (d.type() === 'prompt') d.accept(promptValue);
  else d.accept();
});

let fail = 0;
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) fail++;
}

const username = `user${Math.floor(Date.now() % 1000000)}`;

try {
  // ── 1. 익명 상태: 기존 기능 유지 + DB UI 비노출 ──
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('익명: Save(JSON) 버튼 존재', await page.locator('button:has-text("Save")').count() === 1);
  check('익명: 불러오기 버튼 존재', await page.locator('button[aria-label="Open file"]').count() === 1);
  check('익명: DB 저장 버튼 없음', await page.locator('button[aria-label="DB Save"]').count() === 0);
  check('익명: 내 다이어그램 섹션 없음', await page.locator('[data-testid="my-diagrams"]').count() === 0);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  check('익명: 엔티티 추가 동작(기존 기능)', await page.locator('.react-flow__node').count() === 1);

  // ── 2. 가입 ──
  await page.click('button[aria-label="User"]');
  await page.waitForTimeout(300);
  await page.click('button:text-is("회원가입")'); // 탭 전환
  await page.fill('input[placeholder="영문/숫자 3자 이상"]', username);
  await page.fill('input[placeholder="8자 이상"]', 'password123');
  await page.click('button:has-text("가입하기")');
  await page.waitForTimeout(800);
  check('가입 후 authed: DB 저장 버튼 노출', await page.locator('button[aria-label="DB Save"]').count() === 1);
  check('가입 후 authed: 내 다이어그램 섹션 노출', await page.locator('[data-testid="my-diagrams"]').count() === 1);

  // ── 3. DB 저장 (새 다이어그램 — prompt로 이름 입력) ──
  await page.click('button[aria-label="DB Save"]');
  await page.waitForTimeout(800);
  const listItem = page.locator('[data-testid="my-diagrams"] >> text=My First ERD');
  check('저장 후 목록에 표시', await listItem.count() === 1);
  check('툴바에 현재 다이어그램 이름 표시', await page.locator('[data-testid="current-diagram"]').count() === 1);

  // ── 4. 새로고침 → 세션 복원(쿠키) + 목록 유지 → open으로 복원 ──
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('reload 후 세션 복원 (내 다이어그램 노출)', await page.locator('[data-testid="my-diagrams"]').count() === 1);
  check('reload 후 목록 유지', await page.locator('[data-testid="my-diagrams"] >> text=My First ERD').count() === 1);
  check('reload 후 캔버스는 빈 상태', await page.locator('.react-flow__node').count() === 0);
  await page.click('[data-testid="my-diagrams"] >> text=My First ERD');
  await page.waitForTimeout(800);
  check('다이어그램 열기 → 엔티티 복원', await page.locator('.react-flow__node').count() === 1);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_backend.png' });

  // ── 5. 이름 변경 ──
  promptValue = 'Renamed ERD';
  await page.hover('[data-testid="my-diagrams"] >> text=My First ERD');
  await page.click('button[aria-label="Rename My First ERD"]');
  await page.waitForTimeout(600);
  check('이름 변경 반영', await page.locator('[data-testid="my-diagrams"] >> text=Renamed ERD').count() === 1);

  // ── 6. 중복 가입 → 409 에러 메시지 ──
  const dupPage = await (await browser.newContext()).newPage();
  await dupPage.goto(BASE, { waitUntil: 'networkidle' });
  await dupPage.waitForTimeout(1200);
  await dupPage.click('button[aria-label="User"]');
  await dupPage.click('button:text-is("회원가입")');
  await dupPage.fill('input[placeholder="영문/숫자 3자 이상"]', username);
  await dupPage.fill('input[placeholder="8자 이상"]', 'password123');
  await dupPage.click('button:has-text("가입하기")');
  await dupPage.waitForTimeout(600);
  const dupErr = await dupPage.locator('[data-testid="auth-error"]').textContent().catch(() => '');
  check('중복 가입 → 에러 메시지', (dupErr ?? '').includes('이미 사용 중'));

  // ── 7. 잘못된 비밀번호 로그인 → 401 메시지 ──
  await dupPage.click('button:text-is("로그인")');
  await dupPage.fill('input[placeholder="영문/숫자 3자 이상"]', username);
  await dupPage.fill('input[placeholder="8자 이상"]', 'wrongpass99');
  await dupPage.locator('form button[type="submit"]').click();
  await dupPage.waitForTimeout(600);
  const loginErr = await dupPage.locator('[data-testid="auth-error"]').textContent().catch(() => '');
  check('잘못된 비밀번호 → 에러 메시지', (loginErr ?? '').includes('올바르지 않습니다'));
  await dupPage.context().close();

  // ── 8. 로그아웃 → anon 복귀 ──
  await page.click('button[aria-label="User"]');
  await page.waitForTimeout(300);
  await page.click('button:has-text("로그아웃")');
  await page.waitForTimeout(800);
  check('로그아웃 후 DB 저장 버튼 숨김', await page.locator('button[aria-label="DB Save"]').count() === 0);
  check('로그아웃 후 내 다이어그램 숨김', await page.locator('[data-testid="my-diagrams"]').count() === 0);

  // ── 9. API 직접: 쿠키 없이 401 ──
  const anonApi = await page.request.get(`${BASE}/api/diagrams`);
  check('쿠키 없이 GET /api/diagrams → 401', anonApi.status() === 401);

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_backend_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
