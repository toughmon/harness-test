// 상단 GNB File/Edit/View/Export 메뉴 + 식별/비식별/선택 범례 제거 검증
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

  const header = page.locator('header').first();

  // 1. 제거 대상: GNB 메뉴 4개
  for (const label of ['File', 'Edit', 'View', 'Export']) {
    const count = await header.locator(`span:text-is("${label}")`).count();
    check(`GNB에 "${label}" 메뉴 없음`, count === 0);
  }

  // 2. 제거 대상: Barker 범례 3개
  for (const label of ['식별', '비식별', '선택']) {
    const count = await header.locator(`text=${label}`).count();
    check(`GNB에 "${label}" 범례 없음`, count === 0);
  }

  // 3. 유지 대상
  check('브랜드(EasyRD) 유지', await header.locator('text=EasyRD').count() === 1);
  check('Undo 버튼 유지', await header.locator('button[aria-label="Undo"]').count() === 1);
  check('Redo 버튼 유지', await header.locator('button[aria-label="Redo"]').count() === 1);
  check('Save 버튼 유지', await header.locator('button:has-text("Save")').count() === 1);
  check('불러오기 버튼 유지', await header.locator('button[aria-label="Open file"]').count() === 1);

  // 4. Save/Undo 기능 동작 확인 (엔티티 추가 → Undo 활성화)
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  check('엔티티 추가 후 Undo 활성화', await header.locator('button[aria-label="Undo"]:not([disabled])').count() === 1);
  check('엔티티 추가 후 Save 활성화', await header.locator('button:has-text("Save"):not([disabled])').count() === 1);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_gnb_cleanup.png' });

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
