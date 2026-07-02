// 프로덕션 Node 서버(server/index.js) 검증 — 정적 서빙 + SPA fallback + /api 404
// 사전 조건: npm run build 후 npm start (기본 포트 8080) 실행 상태
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });

let fail = 0;
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) fail++;
}

try {
  // 1. 루트에서 앱 로드
  const res = await page.goto(BASE, { waitUntil: 'networkidle' });
  check('루트 응답 200', res.status() === 200);
  await page.waitForTimeout(1500);
  check('앱 렌더링 (브랜드 표시)', await page.locator('text=YourERD').count() === 1);

  // 2. 기본 기능 동작 (엔티티 추가)
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  check('엔티티 추가 동작', await page.locator('.react-flow__node').count() === 1);

  // 3. SPA fallback — 깊은 경로 새로고침에도 index.html 반환
  const deep = await page.goto(`${BASE}/some/client/route`, { waitUntil: 'networkidle' });
  check('SPA fallback 응답 200', deep.status() === 200);
  await page.waitForTimeout(1500);
  check('SPA fallback에서 앱 렌더링', await page.locator('text=YourERD').count() === 1);

  // 4. /api/* 는 fallback 제외 — 404 JSON
  const api = await page.request.get(`${BASE}/api/anything`);
  check('/api/* 404 응답', api.status() === 404);
  const body = await api.json().catch(() => null);
  check('/api/* JSON 에러 본문', body?.error === 'Not Found');

  // 5. 정적 에셋 서빙 (js 번들)
  const html = await (await page.request.get(BASE)).text();
  const jsPath = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  const asset = jsPath ? await page.request.get(`${BASE}${jsPath}`) : null;
  check('정적 에셋(js 번들) 200', asset?.status() === 200);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_server.png' });

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
