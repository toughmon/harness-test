// 애드센스 재승인 대응 2차 검증 — robots.txt /mcp$ 수정, /app noindex+noscript,
// About/Contact 페이지, 아티클 8편 + 목록, 전 페이지 내비게이션 연결.
// 사전 조건: npm run build 후 npm start (기본 포트 8080) 실행 상태
//   BASE_URL=http://localhost:8080 node verify_seo2.mjs
import { chromium } from 'playwright';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? tmpdir();
const textLen = async p => {
  await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' });
  const t = await page.locator('main').innerText().catch(() => page.locator('body').innerText());
  return t.replace(/\s+/g, ' ').trim().length;
};

const ARTICLES = [
  '/articles/ecommerce-erd-guide.html',
  '/articles/normalization-guide.html',
  '/articles/identifying-vs-non-identifying.html',
  '/articles/barker-vs-ie-notation.html',
  '/articles/column-naming-convention.html',
  '/articles/erd-antipatterns.html',
  '/articles/surrogate-vs-natural-key.html',
  '/articles/data-model-levels.html',
];

const KOREAN_FOOTER = [
  ['/articles/', '아티클'],
  ['/manual.html', '사용 설명서'],
  ['/mcp-guide.html', 'MCP 연결 가이드'],
  ['/prompt-guide.html', '프롬프트 가이드'],
  ['/about.html', '소개'],
  ['/contact.html', '문의'],
  ['/privacy.html', '개인정보처리방침'],
  ['/terms.html', '이용약관'],
  ['/en/', 'English'],
];

const ENGLISH_FOOTER = [
  ['/en/articles/', 'Articles'],
  ['/en/manual.html', 'Manual'],
  ['/en/mcp-guide.html', 'MCP guide'],
  ['/en/prompt-guide.html', 'Prompt guide'],
  ['/en/about.html', 'About'],
  ['/en/contact.html', 'Contact'],
  ['/en/privacy.html', 'Privacy'],
  ['/en/terms.html', 'Terms'],
  ['/', '한국어'],
];

const footerLinks = async p => {
  await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' });
  return page.locator('footer a').evaluateAll(links => links.map(link => [
    link.getAttribute('href'),
    link.textContent?.trim(),
  ]));
};

try {
  // ── 1. robots.txt — /mcp$ 로 정확히 전송 엔드포인트만 차단 ────────────────
  const robots = await (await get('/robots.txt')).text();
  check('robots.txt에 정확한 /mcp$ 규칙', /^Disallow:\s*\/mcp\$\s*$/m.test(robots), robots);
  check('robots.txt가 접두사 /mcp 만으로는 안 막음(문자열상 /mcp-guide 없음)',
    !robots.includes('Disallow: /mcp\n') || robots.includes('/mcp$'));
  // robots.txt 규칙을 그대로 파싱해 실제로 /mcp-guide.html이 차단되지 않는지 판정
  const disallow = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map(m => m[1]);
  const isBlocked = path => disallow.some(rule => {
    if (rule.endsWith('$')) return path === rule.slice(0, -1);
    return path.startsWith(rule);
  });
  check('규칙 적용 시 /mcp-guide.html은 차단 안 됨', !isBlocked('/mcp-guide.html'));
  check('규칙 적용 시 /en/mcp-guide.html은 차단 안 됨', !isBlocked('/en/mcp-guide.html'));
  check('규칙 적용 시 /mcp(전송 엔드포인트)는 차단됨', isBlocked('/mcp'));
  check('규칙 적용 시 /mcp-guide.html과 정확히 같은 문자열만 예외 없이 차단 안 됨',
    !isBlocked('/mcp-guide.html'));

  // ── 2. /app — noindex + noscript, sitemap에서 제외 ────────────────────────
  const appHtml = await (await get('/app')).text();
  check('/app 에 noindex 메타', /<meta\s+name="robots"\s+content="noindex/.test(appHtml));
  check('/app 에 noscript 안내', appHtml.includes('<noscript>'));
  const sitemap = await (await get('/sitemap.xml')).text();
  check('sitemap.xml에 /app 없음', !sitemap.includes('<loc>https://yourerd.com/app</loc>'));
  check('sitemap.xml에 /about.html 있음', sitemap.includes('<loc>https://yourerd.com/about.html</loc>'));
  check('sitemap.xml에 /contact.html 있음', sitemap.includes('<loc>https://yourerd.com/contact.html</loc>'));
  check('sitemap.xml에 아티클 목록 있음', sitemap.includes('<loc>https://yourerd.com/articles/</loc>'));
  check('sitemap.xml에 영문 아티클 목록 있음', sitemap.includes('<loc>https://yourerd.com/en/articles/</loc>'));
  for (const a of ARTICLES) {
    check(`sitemap.xml에 ${a} 있음`, sitemap.includes(`<loc>https://yourerd.com${a}</loc>`));
  }
  // sitemap에 실린 URL이 실제로 200인지 전수 확인
  const locs = [...sitemap.matchAll(/<loc>https:\/\/yourerd\.com([^<]*)<\/loc>/g)].map(m => m[1] || '/');
  let allOk = true;
  for (const p of locs) {
    const r = await get(p);
    if (r.status() !== 200) { allOk = false; console.log(`   ↳ ${p} => ${r.status()}`); }
  }
  check(`sitemap의 모든 URL이 200 (${locs.length}건)`, allOk);

  // ── 3. About / Contact (ko + en) ──────────────────────────────────────────
  for (const p of ['/about.html', '/contact.html', '/en/about.html', '/en/contact.html']) {
    const body = await (await get(p)).text();
    check(`${p} 200 + meta description`, body.includes('name="description"'));
    check(`${p} canonical`, body.includes('rel="canonical"'));
    check(`${p} 실제 파일(앱 셸 아님)`, !body.includes('id="root"'));
    check(`${p} 에 애드센스 스크립트 없음`, !body.includes('adsbygoogle.js'));
  }
  // 문의 이메일 — 실제 수신 가능한 주소로 교체됐는지, 플레이스홀더가 남아있지 않은지 확인
  const REAL_EMAIL = 'toughmon777@gmail.com';
  for (const p of ['/contact.html', '/en/contact.html', '/privacy.html', '/en/privacy.html']) {
    const body = await (await get(p)).text();
    check(`${p} 에 실제 이메일(${REAL_EMAIL}) 사용`, body.includes(`mailto:${REAL_EMAIL}`), p);
    check(`${p} 에 플레이스홀더 이메일 잔존 없음`, !body.includes('contact@yourerd.com'), p);
  }

  // ── 4. 아티클 8편 + 목록 ──────────────────────────────────────────────────
  const idxBody = await (await get('/articles/')).text();
  check('아티클 목록 200 + meta description', idxBody.includes('name="description"'));
  for (const a of ARTICLES) {
    check(`목록 페이지에 ${a} 링크`, idxBody.includes(a));
  }
  for (const a of ARTICLES) {
    const body = await (await get(a)).text();
    check(`${a} meta description`, body.includes('name="description"'));
    check(`${a} canonical`, body.includes('rel="canonical"'));
    check(`${a} 목록으로 돌아가는 링크`, body.includes('href="/articles/"'));
    const len = await textLen(a);
    check(`${a} 본문 3,000자 이상 (실제 ${len}자)`, len >= 3000, len);
  }
  const enArticlesBody = await (await get('/en/articles/')).text();
  check('영문 아티클 목록 200 + meta description', enArticlesBody.includes('name="description"'));
  check('영문 아티클 목록 canonical', enArticlesBody.includes('rel="canonical"'));
  const enArticlesLen = await textLen('/en/articles/');
  check(`영문 아티클 본문 5,000자 이상 (실제 ${enArticlesLen}자)`, enArticlesLen >= 5000, enArticlesLen);

  // ── 5. 랜딩 페이지 연결 ───────────────────────────────────────────────────
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('랜딩 nav에 아티클 링크', await page.locator('header a[href="/articles/"]').count() > 0);
  check('랜딩에 아티클 섹션', await page.locator('#articles').count() === 1);
  check('랜딩 footer에 소개 링크', await page.locator('footer a[href="/about.html"]').count() > 0);
  check('랜딩 footer에 문의 링크', await page.locator('footer a[href="/contact.html"]').count() > 0);

  await page.goto(`${BASE}/en/`, { waitUntil: 'networkidle' });
  check('영문 랜딩 footer에 Articles 링크', await page.locator('footer a[href="/en/articles/"]').count() > 0);
  check('영문 랜딩 footer에 About 링크', await page.locator('footer a[href="/en/about.html"]').count() > 0);
  check('영문 랜딩 footer에 Contact 링크', await page.locator('footer a[href="/en/contact.html"]').count() > 0);

  // ── 6. 가이드/정책 페이지 footer 연결 ────────────────────────────────────
  for (const p of ['/manual.html', '/mcp-guide.html', '/prompt-guide.html', '/privacy.html', '/terms.html']) {
    const body = await (await get(p)).text();
    check(`${p} footer에 아티클 링크`, body.includes('href="/articles/"'));
    check(`${p} footer에 소개 링크`, body.includes('href="/about.html"'));
    check(`${p} footer에 문의 링크`, body.includes('href="/contact.html"'));
    if (p === '/privacy.html' || p === '/terms.html') {
      check(`${p} 에 애드센스 스크립트 없음`, !body.includes('adsbygoogle.js'));
    }
  }
  for (const p of ['/en/manual.html', '/en/mcp-guide.html', '/en/prompt-guide.html', '/en/privacy.html', '/en/terms.html']) {
    const body = await (await get(p)).text();
    check(`${p} footer에 About 링크`, body.includes('href="/en/about.html"'));
    check(`${p} footer에 Contact 링크`, body.includes('href="/en/contact.html"'));
    if (p === '/en/privacy.html' || p === '/en/terms.html') {
      check(`${p} 에 애드센스 스크립트 없음`, !body.includes('adsbygoogle.js'));
    }
  }

  // ── 7. 푸터 메뉴 통일 ──────────────────────────────────────────────────────
  // 정적 HTML을 페이지마다 별도로 관리하므로, 메뉴 하나를 빼먹어도 빌드에서는 잡히지 않는다.
  // 한국어와 영문 각각의 기준 메뉴·순서·링크가 모든 공개 페이지에서 동일한지 검증한다.
  const koreanFooterPages = [
    '/', '/404.html', '/articles/', ...ARTICLES,
    '/manual.html', '/mcp-guide.html', '/prompt-guide.html',
    '/about.html', '/contact.html', '/privacy.html', '/terms.html',
  ];
  for (const p of koreanFooterPages) {
    const actual = await footerLinks(p);
    check(`${p} 한국어 푸터 메뉴 통일`, JSON.stringify(actual) === JSON.stringify(KOREAN_FOOTER), JSON.stringify(actual));
  }
  const englishFooterPages = [
    '/en/', '/en/articles/', '/en/manual.html', '/en/mcp-guide.html', '/en/prompt-guide.html',
    '/en/about.html', '/en/contact.html', '/en/privacy.html', '/en/terms.html',
  ];
  for (const p of englishFooterPages) {
    const actual = await footerLinks(p);
    check(`${p} 영문 푸터 메뉴 통일`, JSON.stringify(actual) === JSON.stringify(ENGLISH_FOOTER), JSON.stringify(actual));
  }

  // ── 8. 앱 사이드바 About/Contact 링크 ─────────────────────────────────────
  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('앱 사이드바에 소개 링크', await page.locator('aside a[href="/about.html"]').count() === 1);
  check('앱 사이드바에 문의 링크', await page.locator('aside a[href="/contact.html"]').count() === 1);
  check('앱 사이드바에 기존 개인정보처리방침 링크 유지', await page.locator('aside a[href="/privacy.html"]').count() === 1);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'yourerd-landing.png'), fullPage: true });
  await page.goto(`${BASE}/articles/`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'yourerd-articles-index.png'), fullPage: true });
  await page.goto(`${BASE}/articles/normalization-guide.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'yourerd-article-detail.png'), fullPage: true });
  await page.goto(`${BASE}/about.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'yourerd-about.png'), fullPage: true });

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
