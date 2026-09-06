// 애드센스 승인 대응 검증 — 랜딩 페이지 / 정책 페이지 / robots·sitemap / 소프트404 제거 / 메타태그
// 사전 조건: npm run build 후 npm start (기본 포트 8080) 실행 상태
//   BASE_URL=http://localhost:8080 node verify_seo.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

let fail = 0;
function check(name, ok, extra) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${ok || extra === undefined ? '' : ` — ${extra}`}`);
  if (!ok) fail++;
}

const get = p => page.request.get(`${BASE}${p}`);

try {
  // ── 1. robots.txt — 실제 파일이어야 하며 SPA fallback이 삼키면 안 된다 ──────────
  const robots = await get('/robots.txt');
  check('robots.txt 200', robots.status() === 200, robots.status());
  check('robots.txt content-type이 text/plain',
    (robots.headers()['content-type'] ?? '').includes('text/plain'),
    robots.headers()['content-type']);
  const robotsBody = await robots.text();
  check('robots.txt가 HTML이 아님', !robotsBody.includes('<!doctype html'));
  check('robots.txt에 Sitemap 선언', robotsBody.includes('Sitemap: https://yourerd.com/sitemap.xml'));
  check('robots.txt가 공유 링크(/d/) 색인 차단', /^Disallow:\s*\/d\//m.test(robotsBody));
  check('robots.txt가 /api/ 차단', /^Disallow:\s*\/api\//m.test(robotsBody));

  // ── 2. sitemap.xml ────────────────────────────────────────────────────────────
  const sitemap = await get('/sitemap.xml');
  check('sitemap.xml 200', sitemap.status() === 200, sitemap.status());
  check('sitemap.xml content-type이 xml',
    (sitemap.headers()['content-type'] ?? '').includes('xml'),
    sitemap.headers()['content-type']);
  const smBody = await sitemap.text();
  check('sitemap.xml이 HTML이 아님', !smBody.includes('<!doctype html'));
  check('sitemap.xml urlset 루트', smBody.includes('<urlset'));
  for (const loc of ['https://yourerd.com/', 'https://yourerd.com/en/',
                     'https://yourerd.com/manual.html', 'https://yourerd.com/privacy.html',
                     'https://yourerd.com/terms.html']) {
    check(`sitemap에 ${loc}`, smBody.includes(`<loc>${loc}</loc>`));
  }
  // sitemap에 실린 상대 경로가 실제로 200인지 (오탈자·미배포 방지)
  const locs = [...smBody.matchAll(/<loc>https:\/\/yourerd\.com([^<]*)<\/loc>/g)].map(m => m[1] || '/');
  let allOk = true;
  for (const p of locs) {
    const r = await get(p);
    if (r.status() !== 200) { allOk = false; console.log(`   ↳ ${p} => ${r.status()}`); }
  }
  check(`sitemap의 모든 URL이 200 (${locs.length}건)`, allOk);

  // ── 3. ads.txt 유지 ───────────────────────────────────────────────────────────
  const ads = await get('/ads.txt');
  check('ads.txt 200', ads.status() === 200, ads.status());
  check('ads.txt 퍼블리셔 ID', (await ads.text()).includes('pub-1397420722330666'));

  // ── 4. 소프트 404 제거 ────────────────────────────────────────────────────────
  // Vite dev 서버는 자체 SPA fallback으로 알 수 없는 경로에 index.html을 200으로 돌려준다.
  // 이건 우리 코드가 아니라 dev 서버의 동작이고, 실제 배포되는 것은 server/index.js이므로
  // dev를 대상으로 돌 때는 건너뛴다(프로덕션 판정은 verify_server.mjs가 담당).
  const isViteDev = (await get('/@vite/client')).status() === 200;
  if (isViteDev) {
    console.log('SKIP: 없는 경로 404 — Vite dev 서버 대상이라 생략 (프로덕션은 verify_server가 검증)');
  } else {
    const missing = await get('/definitely-not-a-page-2026');
    check('없는 경로가 404', missing.status() === 404, missing.status());
    check('404 본문이 앱 셸이 아님', !(await missing.text()).includes('id="root"'));
  }

  // ── 5. 랜딩 페이지(/) 콘텐츠 ──────────────────────────────────────────────────
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const desc = await page.locator('meta[name="description"]').getAttribute('content');
  check('랜딩 meta description 존재', !!desc && desc.length > 50, desc?.length);
  check('랜딩 canonical', await page.locator('link[rel="canonical"][href="https://yourerd.com/"]').count() === 1);
  check('랜딩 og:title', await page.locator('meta[property="og:title"]').count() === 1);
  check('랜딩 og:url', await page.locator('meta[property="og:url"]').count() === 1);
  check('랜딩 hreflang ko/en', await page.locator('link[rel="alternate"][hreflang]').count() >= 2);
  check('랜딩 h1 정확히 1개', await page.locator('h1').count() === 1);

  // 크롤러가 JS 없이 읽는 실제 텍스트 분량 — 예전 루트는 빈 <div id="root">뿐이었다
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  check(`랜딩 본문 텍스트 1000자 이상 (실제 ${text.length}자)`, text.length >= 1000);
  check('랜딩에 FAQ 섹션', await page.locator('#faq details').count() >= 5);

  for (const [label, href] of [['편집기', '/app?lang=ko'], ['개인정보처리방침', '/privacy.html'],
                               ['이용약관', '/terms.html'], ['사용 설명서', '/manual.html'],
                               ['영문판', '/en/']]) {
    check(`랜딩에 ${label} 링크(${href})`, await page.locator(`a[href="${href}"]`).count() > 0);
  }

  // ── 6. 정책 페이지 ────────────────────────────────────────────────────────────
  for (const p of ['/privacy.html', '/terms.html', '/en/privacy.html', '/en/terms.html']) {
    const r = await get(p);
    const body = await r.text();
    check(`${p} 200`, r.status() === 200, r.status());
    check(`${p} 실제 파일 (앱 셸 아님)`, !body.includes('id="root"'));
    check(`${p} meta description`, body.includes('name="description"'));
  }

  // 애드센스가 요구하는 쿠키·광고 고지가 개인정보처리방침에 있는지
  await page.goto(`${BASE}/privacy.html`, { waitUntil: 'domcontentloaded' });
  const privacyText = await page.locator('body').innerText();
  for (const kw of ['Google AdSense', '쿠키', '광고', 'httpOnly']) {
    check(`개인정보처리방침에 "${kw}" 고지`, privacyText.includes(kw));
  }
  check('개인정보처리방침에 문의처', privacyText.includes('@'));
  check('개인정보처리방침 시행일 명시', /시행일/.test(privacyText));

  await page.goto(`${BASE}/en/privacy.html`, { waitUntil: 'domcontentloaded' });
  const enPrivacy = await page.locator('body').innerText();
  check('영문 개인정보처리방침에 AdSense 고지', enPrivacy.includes('Google AdSense'));

  // ── 7. 영문 랜딩 ─────────────────────────────────────────────────────────────
  // 디렉터리 경로(/en/, /en)가 실제로 영문 파일로 해석되는지 — dev의 SPA fallback이
  // 이걸 삼키면 한국어 랜딩이 200으로 돌아와 "EN을 눌러도 안 바뀌는" 증상이 된다.
  for (const p of ['/en/', '/en']) {
    await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
    check(`${p} 가 영문 랜딩으로 해석됨 (lang=en)`,
      await page.locator('html').getAttribute('lang') === 'en',
      await page.locator('html').getAttribute('lang'));
  }
  await page.goto(`${BASE}/en/`, { waitUntil: 'networkidle' });
  check('영문 랜딩 h1', await page.locator('h1').count() === 1);
  check('영문 랜딩 meta description',
    ((await page.locator('meta[name="description"]').getAttribute('content')) ?? '').length > 50);
  check('영문 랜딩에 한국어 링크', await page.locator('a[href="/"]').count() > 0);
  check('영문 랜딩의 편집기 링크가 ?lang=en',
    await page.locator('a[href="/app?lang=en"]').count() > 0);

  // ── 7-b. 랜딩에서 고른 언어가 편집기까지 이어지는지 ───────────────────────────
  const fresh = await browser.newContext();          // localStorage가 비어 있는 새 방문자
  const fp = await fresh.newPage();
  await fp.goto(`${BASE}/app?lang=en`, { waitUntil: 'networkidle' });
  await fp.waitForTimeout(1500);
  check('?lang=en 으로 연 편집기가 영어', await fp.locator('button:has-text("Add Entity")').count() === 1);
  check('?lang=en 이 적용 후 주소에서 제거됨', !fp.url().includes('lang='), fp.url());
  check('?lang=en 이 로케일로 반영됨', await fp.locator('html').getAttribute('lang') === 'en');
  // 같은 컨텍스트에서 파라미터 없이 다시 열면 선택이 유지되어야 한다(persist 확인)
  await fp.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await fp.waitForTimeout(1200);
  check('언어 선택이 이후 방문에도 유지됨', await fp.locator('html').getAttribute('lang') === 'en');
  await fp.goto(`${BASE}/app?lang=ko`, { waitUntil: 'networkidle' });
  await fp.waitForTimeout(1200);
  check('?lang=ko 로 되돌리기', await fp.locator('html').getAttribute('lang') === 'ko');
  await fresh.close();

  // ── 8. 가이드 6종 메타태그 ────────────────────────────────────────────────────
  for (const p of ['/manual.html', '/mcp-guide.html', '/prompt-guide.html',
                   '/en/manual.html', '/en/mcp-guide.html', '/en/prompt-guide.html']) {
    const body = await (await get(p)).text();
    check(`${p} meta description`, body.includes('name="description"'));
    check(`${p} canonical`, body.includes('rel="canonical"'));
    check(`${p} 푸터에 정책 링크`, body.includes('privacy.html') && body.includes('terms.html'));
  }

  // ── 9. 앱 셸(/app) 메타 + 사이드바 정책 링크 ──────────────────────────────────
  const appBody = await (await get('/app')).text();
  check('/app meta description', appBody.includes('name="description"'));
  check('/app 애드센스 스크립트 유지', appBody.includes('adsbygoogle.js'));

  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('앱 사이드바에 개인정보처리방침 링크',
    await page.locator('aside a[href="/privacy.html"]').count() === 1);
  check('앱 사이드바에 이용약관 링크',
    await page.locator('aside a[href="/terms.html"]').count() === 1);
  check('앱 사이드바에 홈 링크', await page.locator('aside a[href="/"]').count() === 1);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_landing.png', fullPage: true });
  await page.goto(`${BASE}/privacy.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_privacy.png', fullPage: true });

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
