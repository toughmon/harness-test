// 웹 "MCP 연결" 모달 e2e (Playwright)
// 전제: erd-service가 `npm start`(기본 8080, 또는 BASE_URL)로 떠 있어야 한다.
// 흐름: ① 비로그인 → 모달이 로그인 유도, ② 로그인 후 → 토큰 발급 → 명령에 토큰 반영,
//        ③ 토큰 목록/취소.

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const TS = Date.now();
const U = { username: `uiuser_${TS}`, password: 'ui-pass-12345' };

let fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail++;
}

const browser = await chromium.launch({ headless: true });
try {
  // 계정 미리 생성 (UI 로그인용)
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(U),
  });
  if (reg.status !== 201 && reg.status !== 409) throw new Error(`가입 실패 (HTTP ${reg.status})`);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // http 배포(비보안 컨텍스트) 재현 — navigator.clipboard를 제거해 execCommand 폴백 경로를 강제
  await page.addInitScript(() => {
    try { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); } catch { /* noop */ }
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // ① 비로그인 상태에서 모달 → 로그인 유도
  await page.click('[data-testid="sidebar-mcp-connect"]');
  await page.waitForTimeout(300);
  check('MCP 연결 모달 열림', await page.locator('[data-testid="mcp-connect-modal"]').count() === 1);
  check('비로그인 → 로그인 유도 표시', await page.locator('[data-testid="mcp-connect-modal"]').getByText('로그인').count() >= 1);
  // 모달 내 로그인 버튼 → AuthModal 전환
  await page.click('[data-testid="mcp-connect-modal"] >> text=로그인 / 회원가입');
  await page.waitForTimeout(300);
  check('로그인 모달로 전환', await page.locator('input[placeholder="영문/숫자 3자 이상"]').count() === 1);

  // 로그인
  await page.fill('input[placeholder="영문/숫자 3자 이상"]', U.username);
  await page.fill('input[placeholder="8자 이상"]', U.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(1000);
  check('로그인 성공', await page.locator('[data-testid="my-diagrams"]').count() === 1);

  // ② 로그인 후 모달 → 토큰 발급
  await page.click('[data-testid="sidebar-mcp-connect"]');
  await page.waitForTimeout(300);
  const cmd0 = await page.locator('[data-testid="mcp-command"]').textContent();
  check('명령에 원격 HTTP 형태', !!cmd0 && cmd0.includes('claude mcp add --transport http') && cmd0.includes('/mcp'));
  check('발급 전엔 토큰 placeholder', !!cmd0 && cmd0.includes('<발급한_토큰>'));
  check('명령에 현재 오리진 포함', !!cmd0 && cmd0.includes(new URL(BASE).host));
  // --header는 가변인자라 반드시 name/url 뒤(맨 끝)에 와야 함 (앞에 두면 CLI가 name을 못 찾음)
  check('인자 순서: --header가 url(/mcp) 뒤', !!cmd0 && cmd0.includes('--header') && cmd0.indexOf('/mcp') < cmd0.indexOf('--header'));

  await page.click('[data-testid="mcp-issue-token"]');
  await page.waitForTimeout(600);
  check('발급 후 경고 박스 표시', await page.locator('[data-testid="mcp-issued-token"]').count() === 1);
  const cmd1 = await page.locator('[data-testid="mcp-command"]').textContent();
  check('명령에 실제 토큰(erdmcp_) 반영', !!cmd1 && cmd1.includes('erdmcp_'));
  check('placeholder 사라짐', !!cmd1 && !cmd1.includes('<발급한_토큰>'));

  // 비보안(http) 컨텍스트에서도 복사 동작: navigator.clipboard 없음 → execCommand 폴백 → 'check' 아이콘
  await page.click('[data-testid="mcp-copy"]');
  await page.waitForTimeout(300);
  const copyIcon = (await page.locator('[data-testid="mcp-copy"]').textContent())?.trim();
  check('복사 버튼 동작(http 폴백) → check 표시', copyIcon === 'check', `icon=${copyIcon}`);

  // ③ 토큰 목록/취소
  const listCount = await page.locator('[data-testid="mcp-token-list"] > div').count();
  check('토큰 목록에 1개', listCount === 1, `count=${listCount}`);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_mcp_connect.png' });

  await page.click('[data-testid="mcp-token-list"] button[aria-label^="Revoke token"]');
  await page.waitForTimeout(500);
  const after = await page.locator('[data-testid="mcp-token-list"] > div').count();
  // 취소 후: 안내 문구 1줄만 (목록 항목 0개로 "아직 발급한 토큰이 없습니다" placeholder)
  const emptyMsg = await page.locator('[data-testid="mcp-token-list"]').getByText('아직 발급한 토큰이 없습니다').count();
  check('취소 후 목록 비워짐', emptyMsg === 1, `rows=${after}`);

  console.log(`\n총 ${fail === 0 ? 'ALL PASS' : fail + ' FAILED'}`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.stack ?? e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
