// 좌측 사이드바 Entities/Relations/Layers/History 메뉴 제거 검증
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
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
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const aside = page.locator('aside').first();

  // 1. 제거 대상 4개 메뉴가 사이드바에 없어야 함
  for (const label of ['Entities', 'Relations', 'Layers', 'History']) {
    const count = await aside.locator(`span:text-is("${label}")`).count();
    check(`사이드바에 "${label}" 메뉴 없음`, count === 0);
  }

  // 2. 유지 대상 요소는 그대로 있어야 함
  check('Add Entity 버튼 유지', await aside.locator('button:has-text("Add Entity")').count() === 1);
  check('Entity List 헤더 유지', await aside.locator('text=Entity List').count() === 1);
  check('Help 메뉴 유지', await aside.locator('span:text-is("Help")').count() === 1);
  check('Docs 메뉴 유지', await aside.locator('span:text-is("Docs")').count() === 1);

  // 3. Entity List 기능 동작 확인 (추가 → 목록 표시 → 선택)
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  const listCount = await aside.locator('button:has-text("Entity")').count();
  check('엔티티 2개 추가 후 목록 표시', listCount >= 2);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_sidebar_cleanup.png' });

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
