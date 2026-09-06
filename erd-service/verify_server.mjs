// 프로덕션 Node 서버(server/index.js) 검증 — 정적 서빙 + 라우팅 + 404 처리
// 사전 조건: npm run build 후 npm start (기본 포트 8080) 실행 상태
//
// 2026-09-06 라우팅 개편 반영:
//   /            → 정적 랜딩 페이지(index.html)
//   /app, /app/* → 편집기 앱 셸(app.html)
//   /d/:token    → 공유 링크 진입도 앱 셸
//   그 외         → 진짜 404 (예전에는 전부 index.html을 200으로 반환하던 soft 404)
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });

let fail = 0;
function check(name, ok, extra) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${ok || extra === undefined ? '' : ` — ${extra}`}`);
  if (!ok) fail++;
}

try {
  // 1. 루트 = 정적 랜딩 페이지
  const res = await page.goto(BASE, { waitUntil: 'networkidle' });
  check('루트 응답 200', res.status() === 200, res.status());
  check('루트가 랜딩 페이지 (히어로 h1)', await page.locator('.hero h1').count() === 1);
  check('루트에 편집기 링크', await page.locator('a[href^="/app"]').count() > 0);
  check('루트는 SPA 셸이 아님 (#root 없음)', await page.locator('#root').count() === 0);

  // 2. /app = 편집기
  const appRes = await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  check('/app 응답 200', appRes.status() === 200, appRes.status());
  await page.waitForTimeout(1500);
  check('/app 앱 렌더링 (브랜드 표시)', await page.locator('text=YourERD').count() >= 1);

  // 3. 기본 기능 동작 (엔티티 추가)
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  check('엔티티 추가 동작', await page.locator('.react-flow__node').count() === 1);

  // 4. /app 하위 경로도 앱 셸로 fallback
  const appDeep = await page.goto(`${BASE}/app/anything`, { waitUntil: 'networkidle' });
  check('/app/* fallback 200', appDeep.status() === 200, appDeep.status());
  await page.waitForTimeout(1200);
  check('/app/* 에서 앱 렌더링', await page.locator('text=YourERD').count() >= 1);

  // 5. 공유 링크 경로(/d/:token)도 앱 셸 — 토큰이 유효하지 않아도 HTML은 앱이어야 한다
  const share = await page.request.get(`${BASE}/d/erdshare_dummy`);
  check('/d/:token 응답 200', share.status() === 200, share.status());
  check('/d/:token 이 앱 셸', (await share.text()).includes('id="root"'));

  // 6. 알 수 없는 경로는 진짜 404 (soft 404 회귀 방지)
  const missing = await page.request.get(`${BASE}/no-such-page-xyz123`);
  check('알 수 없는 경로 404', missing.status() === 404, missing.status());
  const missingHtml = await missing.text();
  check('404 페이지 본문', missingHtml.includes('404'));
  check('404 응답이 앱 셸이 아님', !missingHtml.includes('id="root"'));

  // 7. /api/* 는 fallback 제외 — 404 JSON
  const api = await page.request.get(`${BASE}/api/anything`);
  check('/api/* 404 응답', api.status() === 404, api.status());
  const body = await api.json().catch(() => null);
  check('/api/* JSON 에러 본문', body?.error === 'Not Found');

  // 8. 정적 에셋 서빙 (js 번들 — 랜딩이 아니라 앱 셸에서 참조된다)
  const html = await (await page.request.get(`${BASE}/app`)).text();
  const jsPath = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  const asset = jsPath ? await page.request.get(`${BASE}${jsPath}`) : null;
  check('정적 에셋(js 번들) 200', asset?.status() === 200, jsPath ?? '번들 경로 미발견');

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_server.png', fullPage: true });

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
