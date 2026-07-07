// 엔티티 선택 후 키보드 Delete 키로 삭제하는 기능 검증
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
};

const nodeCount = () => page.locator('.react-flow__node').count();
const edgeCount = () => page.locator('.react-flow__edge').count();
const dialogVisible = () => page.locator('[data-testid="app-dialog"]').count();

async function drawRelationship(srcIdx, tgtIdx, relButtonText) {
  const nodes = page.locator('.react-flow__node');
  const src = nodes.nth(srcIdx);
  const tgt = nodes.nth(tgtIdx);
  const sBox = await src.boundingBox();
  await page.mouse.move(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2);
  await page.waitForTimeout(300);
  const hb = await src.locator('.react-flow__handle[data-handlepos="right"]').first().boundingBox();
  const tBox = await tgt.boundingBox();
  await page.mouse.move(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);
  await page.waitForTimeout(200);
  const thb = await tgt.locator('.react-flow__handle[data-handlepos="left"]').first().boundingBox();
  const sx = hb.x + hb.width / 2, sy = hb.y + hb.height / 2;
  const tx = thb.x + thb.width / 2, ty = thb.y + thb.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.waitForTimeout(150);
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(sx + (tx - sx) * i / 30, sy + (ty - sy) * i / 30);
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await page.waitForTimeout(800);
  if (!await page.locator('h3:has-text("관계 종류 선택")').count()) return false;
  await page.locator('button').filter({ hasText: relButtonText }).first().click();
  await page.waitForTimeout(500);
  return true;
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // ───── 0. 선택 없을 때는 Delete가 아무 영향 없음 ─────
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  await page.mouse.click(900, 750); // 빈 캔버스 클릭 → 선택 해제
  await page.waitForTimeout(200);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  check('선택 없을 때 Delete → 변화 없음 (다이얼로그 없음)', await dialogVisible() === 0 && await nodeCount() === 1);

  // ───── 1. 엔티티 선택 후 Delete → 확인 다이얼로그 ─────
  await page.locator('.react-flow__node').nth(0).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  check('엔티티 선택 후 Delete → 확인 다이얼로그 표시', await dialogVisible() === 1);
  const dialogText = await page.locator('[data-testid="app-dialog"]').innerText();
  check('다이얼로그 메시지에 엔티티 삭제 안내 포함', dialogText.includes('삭제'));

  // ───── 2. 취소 → 삭제 안 됨 ─────
  await page.click('[data-testid="dialog-cancel"]');
  await page.waitForTimeout(300);
  check('취소 클릭 → 엔티티 유지', await nodeCount() === 1 && await dialogVisible() === 0);

  // ───── 3. 입력 필드에 포커스 중엔 Delete가 삭제 아님(브라우저 기본 동작) ─────
  // 입력 필드는 편집 모달 안에 있으므로 info 아이콘으로 모달을 먼저 연다.
  await page.locator('.react-flow__node').nth(0).locator('[data-testid="entity-info-icon"]').click();
  await page.waitForTimeout(300);
  const panel = page.locator('[data-testid="entity-editor-modal"]');
  const nameInput = panel.locator('input').first();
  await nameInput.click();
  await nameInput.press('End');
  await page.waitForTimeout(150);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  check('입력 필드 포커스 중 Delete → 엔티티 삭제 안 됨', await dialogVisible() === 0 && await nodeCount() === 1);
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);
  await page.mouse.click(900, 750);
  await page.waitForTimeout(200);

  // ───── 4. 실제 확인 → 삭제 + Undo/Redo ─────
  await page.locator('.react-flow__node').nth(0).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  await page.click('[data-testid="dialog-ok"]');
  await page.waitForTimeout(400);
  check('확인 클릭 → 엔티티 삭제됨', await nodeCount() === 0);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  check('Undo → 엔티티 복원', await nodeCount() === 1);

  await page.keyboard.press('Control+y');
  await page.waitForTimeout(400);
  check('Redo → 엔티티 다시 삭제', await nodeCount() === 0);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);

  // ───── 5. 관계로 연결된 엔티티 삭제 시 관계선도 함께 제거 ─────
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  await page.mouse.click(900, 750);
  await page.waitForTimeout(200);
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(400);

  const relOk = await drawRelationship(0, 1, '1:M 비식별 (점선 + 실선)');
  check('관계 생성', relOk && await edgeCount() === 1);

  await page.locator('.react-flow__node').nth(1).click(); // 자식 엔티티 선택
  await page.waitForTimeout(300);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  await page.click('[data-testid="dialog-ok"]');
  await page.waitForTimeout(400);
  check('연결된 엔티티 삭제 → 엔티티·관계선 함께 제거', await nodeCount() === 1 && await edgeCount() === 0);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_entity_delete_key.png' });

  // ───── 요약 ─────
  const failed = results.filter(r => !r.pass);
  console.log(`\n총 ${results.length}개 중 ${results.length - failed.length} PASS / ${failed.length} FAIL`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_entity_delete_key_error.png' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
