// Built-site checks for the article learning paths, language pairs, mobile layouts,
// downloads, and the actual SQL teaching results. Run after npm run build.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const screenshotDir = process.env.SCREENSHOT_DIR ?? join(tmpdir(), 'yourerd-content-review');
mkdirSync(screenshotDir, { recursive: true });
const slugs = ['ecommerce-erd-guide', 'normalization-guide', 'identifying-vs-non-identifying',
  'barker-vs-ie-notation', 'column-naming-convention', 'erd-antipatterns',
  'surrogate-vs-natural-key', 'data-model-levels'];
let passed = 0;
function check(label, condition) {
  assert.ok(condition, label);
  passed++;
  console.log(`PASS: ${label}`);
}
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
// External ads and fonts are outside the scope of these local content checks.
await context.route(/https:\/\/(?:pagead2\.googlesyndication\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, r => r.abort());
const page = await context.newPage();
const cache = new Map();
async function fetch(path) {
  if (!cache.has(path)) cache.set(path, await context.request.get(`${BASE}${path}`));
  return cache.get(path);
}
try {
  const sitemap = await (await fetch('/sitemap.xml')).text();
  const locations = [...sitemap.matchAll(/<loc>https:\/\/yourerd\.com([^<]*)<\/loc>/g)].map(m => m[1] || '/');
  check('sitemap has unique locations', new Set(locations).size === locations.length);
  const responses = await Promise.all(locations.map(fetch));
  check('every sitemap destination is reachable', responses.every(r => r.status() === 200));
  for (const lang of ['ko', 'en']) {
    const prefix = lang === 'en' ? '/en' : '';
    const index = await (await fetch(`${prefix}/articles/`)).text();
    check(`${lang} index links to all eight detail pages`, slugs.every(slug => index.includes(`href="${prefix}/articles/${slug}.html"`)));
    for (const slug of slugs) {
      const path = `${prefix}/articles/${slug}.html`;
      const html = await (await fetch(path)).text();
      check(`${path} has matching canonical and reciprocal language URLs`, html.includes(`rel="canonical" href="https://yourerd.com${path}"`) &&
        ['ko', 'en'].every(l => html.includes(`hreflang="${l}" href="https://yourerd.com${l === 'en' ? '/en' : ''}/articles/${slug}.html"`)));
      check(`${path} is listed in sitemap`, locations.includes(path));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      check(`${path} has one readable article heading`, await page.locator('h1').count() === 1 && await page.locator('h1').isVisible());
      const content = await page.locator('main').innerText();
      check(`${path} contains a worked example and SQL`, await page.locator('pre code').count() > 0 && (lang === 'en' ? /expected|should|reject|must/i.test(content) : content.includes('실습')));
      const dom = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
        const missing = [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href').slice(1)).filter(id => id && !document.getElementById(id));
        const json = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent));
        return { duplicates: ids.filter((id, i) => ids.indexOf(id) !== i), missing, json,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
      });
      check(`${path} has unique section IDs and working anchors`, dom.duplicates.length === 0 && dom.missing.length === 0);
      check(`${path} has valid Article metadata`, dom.json.some(d => d['@type'] === 'Article' && d.mainEntityOfPage === `https://yourerd.com${path}`));
      check(`${path} fits mobile viewport`, !dom.overflow);
      const links = await page.locator('a[href]').evaluateAll(nodes => nodes.map(a => a.getAttribute('href')).filter(h => h.startsWith('/')));
      const dests = [...new Set(links.map(h => h.split(/[?#]/)[0]))].filter(h => !h.startsWith('/app'));
      check(`${path} internal content links resolve`, (await Promise.all(dests.map(fetch))).every(r => r.status() === 200));
    }
  }

  for (const [path, anchor] of [['/', '/articles/ecommerce-erd-guide.html#practice'], ['/en/', '/en/articles/ecommerce-erd-guide.html']]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    const link = page.locator(`a[href="${anchor}"]`).first();
    await link.click();
    await page.waitForURL(`**${anchor}`);
    check(`${path} leads readers to the worked order-history guide`, await page.locator('h1').isVisible());
  }
  await page.goto(`${BASE}/en/articles/`, { waitUntil: 'domcontentloaded' });
  await page.locator('a[href="/en/articles/normalization-guide.html"]').click();
  await page.waitForURL('**/en/articles/normalization-guide.html');
  check('English article card opens a detail page', await page.locator('h1').isVisible());
  await page.locator('a[lang="ko"]').click();
  await page.waitForURL('**/articles/normalization-guide.html');
  check('language switch preserves the article topic', await page.locator('html').getAttribute('lang') === 'ko');

  const download = await fetch('/downloads/order-history-lab.sql');
  check('SQL download serves SQL rather than HTML fallback', download.status() === 200 && !(await download.text()).includes('<html'));
  // Validate the published, downloaded SQL, not an independent copy of the example.
  // SQLite tests the shared SQL semantics; this is not a MySQL-engine integration test.
  const sql = await download.text();
  const verification = execFileSync('python3', ['-c', `
import sqlite3, sys, json
sql = sys.stdin.read()
c = sqlite3.connect(':memory:')
c.execute('PRAGMA foreign_keys = ON')
results = []
executable = '\\n'.join(line for line in sql.splitlines() if not line.lstrip().startswith('--'))
for statement in executable.split(';'):
    statement = statement.strip()
    if not statement: continue
    rows = c.execute(statement)
    if rows.description: results.append(rows.fetchall())
assert results == [[(70000, 80000)], [(140000,)], [(1001, 70000, 70000)]], results
for statement in [
  'INSERT INTO lab_order_items VALUES (1001, 1, 1, "duplicate", 1, 1)',
  'INSERT INTO lab_order_items VALUES (9999, 1, 1, "missing order", 1, 1)',
  'INSERT INTO lab_order_items VALUES (1001, 3, 9999, "missing product", 1, 1)',
  'INSERT INTO lab_order_items VALUES (1001, 3, 1, "zero quantity", 1, 0)',
  'INSERT INTO lab_payments VALUES (13, 1001, -1)']:
    try: c.execute(statement)
    except sqlite3.IntegrityError: pass
    else: raise AssertionError('invalid row accepted: ' + statement)
c.execute('INSERT INTO lab_orders VALUES (1002)')
c.execute('INSERT INTO lab_order_items VALUES (1002, 1, 1, "Keyboard", 30000, 1)')
last_query = sql[sql.index('WITH item_totals AS'):]
assert c.execute(last_query).fetchall() == [(1001, 70000, 70000), (1002, 30000, 0)]
print(json.dumps({'expected_results': results, 'invalid_rows_rejected': 5, 'unpaid_order_retained': True}))
`], { input: sql, encoding: 'utf8' });
  console.log(verification.trim());
  check('downloaded lab reproduces published totals and rejects invalid rows', JSON.parse(verification).invalid_rows_rejected === 5);

  // Screenshot both language variants and layouts for direct visual review.
  for (const [name, path, width, height] of [
    ['ss_content_ko_desktop', '/articles/ecommerce-erd-guide.html#practice', 1440, 1000],
    ['ss_content_en_desktop', '/en/articles/ecommerce-erd-guide.html#worked-example', 1440, 1000],
    ['ss_content_ko_mobile', '/articles/ecommerce-erd-guide.html#practice', 390, 844],
    ['ss_content_en_mobile', '/en/articles/normalization-guide.html', 390, 844],
    ['ss_content_en_index', '/en/articles/', 1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: join(screenshotDir, `${name}.png`) });
  }
  console.log(`ALL PASS: ${passed} checks. Screenshots: ${screenshotDir}`);
} finally {
  await browser.close();
}
