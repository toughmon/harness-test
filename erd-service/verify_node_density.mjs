// 엔티티 노드 가독성 개선 검증 (작은 화면 100% 편집 기준)
//  - Material Symbols 아이콘이 지정한 크기로 렌더되는지 (Tailwind v4 레이어 문제 회귀 방지)
//  - 컬럼 행 높이 압축
//  - 노드 테두리 대비
//  - 접기/펼치기: 개별 · 일괄, 접힘 상태에서도 연결/선택이 살아있는지
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
// 작은 노트북을 가정
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

const node = (i = 0) => page.locator('.react-flow__node').nth(i);
const colRows = () => page.locator('[data-testid="col-name"]');

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("Add Entity")');
  await page.click('button:has-text("Add Entity")');
  await page.click('button:has-text("Add Entity")');
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(600);

  // ───── 1. 아이콘 크기 (Tailwind v4 @layer vs Google CSS 회귀 방지) ─────
  const iconSizes = await page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('.material-symbols-outlined')) {
      const cls = [...el.classList].find(c => /^text-\[\d+px\]$/.test(c));
      if (!cls) continue;
      out[cls] = getComputedStyle(el).fontSize;
    }
    return out;
  });
  const mismatched = Object.entries(iconSizes).filter(([cls, fs]) => cls !== `text-[${parseInt(fs)}px]`);
  check('아이콘이 지정한 크기로 렌더됨 (24px 강제 안 됨)', mismatched.length === 0, JSON.stringify(mismatched));
  check('노드 PK/FK 아이콘이 14px', iconSizes['text-[14px]'] === '14px', iconSizes['text-[14px]']);

  // ───── 2. 컬럼 행 높이 ─────
  const rowH = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="col-name"]').closest('div.px-3');
    return parseFloat(getComputedStyle(row).height);
  });
  check('컬럼 행 높이 ≤ 20px (개선 전 32px)', rowH <= 20, `${rowH}px`);

  // ───── 3. 노드 테두리 대비 ─────
  const contrast = await page.evaluate(() => {
    const el = document.querySelector('.entity-node');
    const cs = getComputedStyle(el);
    const parse = c => c.match(/\d+/g).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const a = lum(parse(cs.borderTopColor)), b = lum(parse(cs.backgroundColor));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  check('노드 테두리 대비 ≥ 3:1 (개선 전 약 1.8:1)', contrast >= 3, contrast.toFixed(2) + ':1');

  // ───── 4. 접기 ─────
  const before = await colRows().count();
  check('접기 전 컬럼 행 존재', before > 0, String(before));
  await node(0).locator('[data-testid="entity-collapse-toggle"]').click();
  await page.waitForTimeout(400);
  check('접으면 그 노드의 컬럼이 사라짐', await colRows().count() < before, String(await colRows().count()));
  check('접혀도 info 아이콘 유지 (편집 모달 진입 경로)',
    await node(0).locator('[data-testid="entity-info-icon"]').count() === 1);
  check('접히면 컬럼 수 배지 노출', await node(0).locator('[data-testid="entity-column-count"]').count() === 1);
  const badge = await node(0).locator('[data-testid="entity-column-count"]').textContent();
  check('배지 숫자가 컬럼 수와 일치', badge.trim() === '1', badge);

  // 접힘 상태에서도 선택·핸들이 살아있어야 한다
  await node(0).click();
  await page.waitForTimeout(300);
  check('접힌 노드도 선택됨', await page.locator('.react-flow__node.selected').count() === 1);
  const nb = await node(0).boundingBox();
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await page.waitForTimeout(300);
  check('접힌 노드에도 연결 핸들이 있음',
    await node(0).locator('.react-flow__handle').count() === 8);

  // ───── 5. 다시 펼치기 ─────
  await node(0).locator('[data-testid="entity-collapse-toggle"]').click();
  await page.waitForTimeout(400);
  check('다시 펼치면 컬럼 복원', await colRows().count() === before, String(await colRows().count()));
  check('펼치면 배지 사라짐', await node(0).locator('[data-testid="entity-column-count"]').count() === 0);

  // ───── 6. 일괄 접기/펼치기 ─────
  await page.click('[data-testid="collapse-all-toggle"]');
  await page.waitForTimeout(500);
  check('모두 접기 → 컬럼 0개', await colRows().count() === 0, String(await colRows().count()));
  check('모두 접기 → 배지가 전 노드에', await page.locator('[data-testid="entity-column-count"]').count() === 2);
  await page.click('[data-testid="collapse-all-toggle"]');
  await page.waitForTimeout(500);
  check('모두 펼치기 → 컬럼 복원', await colRows().count() === before, String(await colRows().count()));

  // ───── 7. 개별 토글을 여러 노드에 연속 적용 ─────
  await page.click('[data-testid="collapse-all-toggle"]');
  await page.waitForTimeout(500);
  await node(0).locator('[data-testid="entity-collapse-toggle"]').click();
  await page.waitForTimeout(250);
  await node(1).locator('[data-testid="entity-collapse-toggle"]').click();
  await page.waitForTimeout(250);
  check('접힌 상태에서 두 노드를 각각 펼칠 수 있음', await colRows().count() === before, String(await colRows().count()));

  await page.screenshot({ path: 'ss_node_density.png' });
} catch (e) {
  fail++;
  console.log('  FAIL  예외:', e.message.split('\n')[0]);
  await page.screenshot({ path: 'ss_node_density_error.png' }).catch(() => {});
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'} — ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
