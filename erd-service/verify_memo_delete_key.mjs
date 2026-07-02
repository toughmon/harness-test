// 메모(스티키 노트) 선택 후 키보드 Delete 키로 삭제하는 기능 검증
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

const dialogVisible = () => page.locator('[data-testid="app-dialog"]').count();
const memoNodes = () => page.locator('[data-testid="memo-node"]');

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // ───── 0. 선택 없을 때 Delete → 변화 없음 ─────
  await page.locator('[data-testid="add-memo-btn"]').click();
  await page.waitForTimeout(400);
  check('Add Memo → 메모 생성', await memoNodes().count() === 1);

  await page.mouse.click(900, 750); // 빈 캔버스 클릭 → 선택 해제
  await page.waitForTimeout(200);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  check('선택 없을 때 Delete → 변화 없음 (다이얼로그 없음)', await dialogVisible() === 0 && await memoNodes().count() === 1);

  // ───── 1. 메모 선택 후 Delete → 확인 다이얼로그 ─────
  // React Flow pane이 상위 레이어라 dispatchEvent로 클릭 (verify_memo.mjs와 동일 패턴)
  await memoNodes().first().dispatchEvent('click');
  await page.waitForTimeout(300);
  const memoPanel = page.locator('[data-testid="memo-edit-panel"]');
  check('메모 선택 → MemoEditPanel 표시', await memoPanel.count() === 1);

  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  check('메모 선택 후 Delete → 확인 다이얼로그 표시', await dialogVisible() === 1);
  const dialogTitle = await page.locator('[data-testid="app-dialog"] h3').innerText();
  check('다이얼로그 타이틀 = "메모 삭제"', dialogTitle === '메모 삭제');

  // ───── 2. 취소 → 유지 ─────
  await page.click('[data-testid="dialog-cancel"]');
  await page.waitForTimeout(300);
  check('취소 클릭 → 메모 유지', await memoNodes().count() === 1 && await dialogVisible() === 0);

  // ───── 3. 입력 필드(textarea) 포커스 중엔 Delete가 삭제 아님 ─────
  await memoNodes().first().dispatchEvent('click');
  await page.waitForTimeout(300);
  const textarea = memoPanel.locator('textarea');
  await textarea.click();
  await page.waitForTimeout(150);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  check('텍스트 영역 포커스 중 Delete → 메모 삭제 안 됨', await dialogVisible() === 0 && await memoNodes().count() === 1);
  await page.mouse.click(900, 750);
  await page.waitForTimeout(200);

  // ───── 4. 실제 확인 → 삭제 + Undo/Redo ─────
  await memoNodes().first().dispatchEvent('click');
  await page.waitForTimeout(300);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  await page.click('[data-testid="dialog-ok"]');
  await page.waitForTimeout(400);
  check('확인 클릭 → 메모 삭제됨', await memoNodes().count() === 0);
  check('삭제 후 우측 패널 닫힘', await memoPanel.count() === 0);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  check('Undo → 메모 복원', await memoNodes().count() === 1);

  await page.keyboard.press('Control+y');
  await page.waitForTimeout(400);
  check('Redo → 메모 다시 삭제', await memoNodes().count() === 0);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_memo_delete_key.png' });

  // ───── 요약 ─────
  const failed = results.filter(r => !r.pass);
  console.log(`\n총 ${results.length}개 중 ${results.length - failed.length} PASS / ${failed.length} FAIL`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_memo_delete_key_error.png' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
