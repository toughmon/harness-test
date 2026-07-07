// 엔티티 설정 패널 컬럼 드래그 순서 변경 검증
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
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 엔티티 추가 → 자동 선택됨. 편집 모달은 info 아이콘으로 별도 오픈.
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  await page.locator('[data-testid="entity-info-icon"]').click();
  await page.waitForTimeout(300);

  const panel = page.locator('[data-testid="entity-editor-modal"]');
  const rows = panel.locator('div.rounded.p-3');

  // 컬럼 2개 추가 (기본명 column) 후 각각 aaa / bbb 로 이름 변경
  await panel.locator('[data-testid="add-column"]').click();
  await page.waitForTimeout(300);
  await panel.locator('[data-testid="add-column"]').click();
  await page.waitForTimeout(300);
  check('컬럼 3개 (id + 신규 2)', await rows.count() === 3);

  await rows.nth(1).click(); // 확장
  await page.waitForTimeout(300);
  await panel.locator('input[placeholder="물리명"]').fill('aaa');
  await rows.nth(1).locator('span.font-mono').first().click(); // 접기
  await page.waitForTimeout(300);

  await rows.nth(2).click();
  await page.waitForTimeout(300);
  await panel.locator('input[placeholder="물리명"]').fill('bbb');
  await rows.nth(2).locator('span.font-mono').first().click();
  await page.waitForTimeout(300);

  const rowName = async (i) => (await rows.nth(i).locator('span.font-mono').first().innerText()).trim();
  check('초기 순서 id, aaa, bbb', (await rowName(1)) === 'aaa' && (await rowName(2)) === 'bbb');

  // 드래그: bbb 핸들을 aaa 행 위로
  await page.locator('[data-testid="col-drag-bbb"]').dragTo(rows.nth(1));
  await page.waitForTimeout(500);
  check('드래그 후 패널 순서 id, bbb, aaa', (await rowName(1)) === 'bbb' && (await rowName(2)) === 'aaa');

  // 캔버스 노드에도 순서 반영
  const nodeText = await page.locator('.react-flow__node').first().innerText();
  check('노드에 순서 반영 (bbb가 aaa보다 위)', nodeText.indexOf('bbb') < nodeText.indexOf('aaa'));

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_column_drag.png' });

  // Undo → 순서 복원
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  check('Undo → 순서 복원 id, aaa, bbb', (await rowName(1)) === 'aaa' && (await rowName(2)) === 'bbb');

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_column_drag_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
