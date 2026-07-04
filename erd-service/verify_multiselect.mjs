// 엔티티/메모 다중 선택(러버밴드 드래그 박스) + 그룹 이동 + 일괄 삭제 검증
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
};

const nodes = () => page.locator('.react-flow__node');
const selectedNodes = () => page.locator('.react-flow__node.selected');
const dialogVisible = () => page.locator('[data-testid="app-dialog"]').count();
const multiPanel = page.locator('[data-testid="multi-select-panel"]');

// (50,50) 같은 뷰포트 절대좌표는 좌측 사이드바(폭 280px)에 걸릴 수 있어, pane 요소
// 기준 상대좌표로 클릭해 확실히 캔버스 빈 곳을 누르게 한다.
async function clickEmptyPane() {
  await page.locator('.react-flow__pane').click({ position: { x: 40, y: 40 } });
}

async function boxSelect(rects) {
  const xs = rects.flatMap(r => [r.x, r.x + r.width]);
  const ys = rects.flatMap(r => [r.y, r.y + r.height]);
  const minX = Math.min(...xs) - 30, maxX = Math.max(...xs) + 30;
  const minY = Math.min(...ys) - 30, maxY = Math.max(...ys) + 30;
  await page.keyboard.down('Shift');
  await page.mouse.move(minX, minY);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.move((minX + maxX) / 2, (minY + maxY) / 2, { steps: 5 });
  await page.mouse.move(maxX, maxY, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(300);
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const addEntityBtn = page.locator('button').filter({ hasText: 'Add Entity' }).first();
  const addMemoBtn = page.locator('[data-testid="add-memo-btn"]');

  // ───── 0. 준비: 엔티티 2개 + 메모 1개 ─────
  await addEntityBtn.click();
  await page.waitForTimeout(300);
  await addEntityBtn.click();
  await page.waitForTimeout(300);
  await addMemoBtn.click();
  await page.waitForTimeout(300);
  check('엔티티 2개 + 메모 1개 생성됨', await nodes().count() === 3);

  // ───── 1. 회귀: 단일 클릭은 여전히 단일 선택(EntityEditPanel) ─────
  await nodes().nth(0).click();
  await page.waitForTimeout(200);
  check('단일 엔티티 클릭 → multi-select-panel 안 뜸(회귀)', await multiPanel.count() === 0);
  check('단일 엔티티 클릭 → 우측 편집 패널(aside) 표시(회귀)', await page.locator('aside').count() > 0);

  await clickEmptyPane(); // 빈 캔버스 클릭 → 선택 해제
  await page.waitForTimeout(200);

  // ───── 2. 러버밴드 박스 선택: Shift+드래그로 3개 모두 감싸기 ─────
  const b0 = await nodes().nth(0).boundingBox();
  const b1 = await nodes().nth(1).boundingBox();
  const b2 = await nodes().nth(2).boundingBox();
  await boxSelect([b0, b1, b2]);

  check('Shift+드래그 박스 선택 → 3개 모두 선택됨(react-flow selected)', await selectedNodes().count() === 3, `count=${await selectedNodes().count()}`);
  check('다중 선택 패널 표시', await multiPanel.count() === 1);
  const countText = await page.locator('[data-testid="multi-select-count"]').innerText();
  check('다중 선택 패널에 "3개 선택됨" 표시', countText.includes('3'), countText);

  await page.screenshot({ path: 'ss_multiselect_boxselect.png' });

  // ───── 3. 그룹 드래그: 하나를 옮기면 셋 다 같은 만큼 이동 ─────
  const before = [
    await nodes().nth(0).boundingBox(),
    await nodes().nth(1).boundingBox(),
    await nodes().nth(2).boundingBox(),
  ];
  const header0 = nodes().nth(0).locator('.bg-node-header').first();
  const hCount = await header0.count();
  // 메모가 0번일 수도 있으므로(추가 순서상 엔티티가 먼저 오지만 방어적으로) 헤더 없으면 노드 자체를 드래그 기점으로 사용
  const dragSourceBox = hCount > 0 ? await header0.boundingBox() : before[0];
  const sx = dragSourceBox.x + dragSourceBox.width / 2;
  const sy = dragSourceBox.y + Math.min(10, dragSourceBox.height / 2);
  const dx = 140, dy = 90;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.waitForTimeout(80);
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(sx + dx * i / 15, sy + dy * i / 15);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);

  const after = [
    await nodes().nth(0).boundingBox(),
    await nodes().nth(1).boundingBox(),
    await nodes().nth(2).boundingBox(),
  ];
  const deltas = before.map((b, i) => ({ dx: after[i].x - b.x, dy: after[i].y - b.y }));
  const allMoved = deltas.every(d => Math.abs(d.dx) > 20 || Math.abs(d.dy) > 20);
  const sameDelta = deltas.every(d => Math.abs(d.dx - deltas[0].dx) < 5 && Math.abs(d.dy - deltas[0].dy) < 5);
  check('그룹 드래그 → 셋 다 이동함', allMoved, JSON.stringify(deltas));
  check('그룹 드래그 → 셋 다 같은 만큼 이동(상대 위치 유지)', sameDelta, JSON.stringify(deltas));

  // ───── 4. 드래그 종료 후에도 다중 선택이 유지됨(선택이 사라지는 회귀 방지) ─────
  check('그룹 드래그 종료 후에도 3개 선택 유지', await selectedNodes().count() === 3, `count=${await selectedNodes().count()}`);
  check('그룹 드래그 종료 후에도 다중 선택 패널 유지', await multiPanel.count() === 1);

  await page.screenshot({ path: 'ss_multiselect_groupdrag.png' });

  // ───── 5. Undo 한 번으로 그룹 이동 전체 복원 ─────
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const restored = [
    await nodes().nth(0).boundingBox(),
    await nodes().nth(1).boundingBox(),
    await nodes().nth(2).boundingBox(),
  ];
  const allRestored = restored.every((b, i) => Math.abs(b.x - before[i].x) < 5 && Math.abs(b.y - before[i].y) < 5);
  check('Undo 1회로 그룹 이동 전체 복원', allRestored, JSON.stringify(restored.map((b, i) => ({ dx: b.x - before[i].x, dy: b.y - before[i].y }))));

  // ───── 6. Delete 키 → 일괄 삭제 확인 다이얼로그 ─────
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  check('다중 선택 상태에서 Delete → 확인 다이얼로그 표시', await dialogVisible() === 1);
  const dialogText = await page.locator('[data-testid="app-dialog"]').innerText();
  check('다이얼로그 타이틀이 "일괄 삭제"', dialogText.includes('일괄 삭제'));
  check('다이얼로그 메시지에 개수(3) 포함', dialogText.includes('3'));

  // ───── 7. 취소 → 유지 ─────
  await page.click('[data-testid="dialog-cancel"]');
  await page.waitForTimeout(300);
  check('취소 → 3개 노드 유지', await nodes().count() === 3);
  check('취소 → 다중 선택 유지', await multiPanel.count() === 1);

  // ───── 8. 확인 → 3개 한 번에 삭제 ─────
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  await page.click('[data-testid="dialog-ok"]');
  await page.waitForTimeout(400);
  check('확인 → 3개 모두 삭제됨', await nodes().count() === 0);
  check('일괄 삭제 후 다중 선택 패널 닫힘', await multiPanel.count() === 0);

  // ───── 9. Undo 한 번으로 3개 전체 복원, Redo로 다시 삭제 ─────
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  check('Undo 1회로 3개 전체 복원', await nodes().count() === 3);

  await page.keyboard.press('Control+y');
  await page.waitForTimeout(400);
  check('Redo → 3개 다시 삭제됨', await nodes().count() === 0);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);

  // 반복된 드래그로 노드들이 화면 아래쪽(플로팅 줌 툴바 근처)까지 밀려났을 수 있으므로
  // Fit View로 다시 화면 안에 정렬해 이후 박스 선택 좌표가 툴바와 겹치지 않게 한다.
  await page.locator('button[title="Fit View"]').click();
  await page.waitForTimeout(400);

  // ───── 10. 빈 캔버스 클릭 → 다중 선택 완전 해제 ─────
  // (React Flow는 다중 선택 시 그 위에 투명한 그룹-드래그 오버레이를 씌우므로, 선택된
  //  노드 하나를 다시 클릭하면 그 오버레이가 클릭을 가로채 그룹 드래그로 처리된다 — 개별
  //  항목으로 좁히려면 먼저 빈 캔버스를 클릭해 선택을 비운 뒤 새로 클릭해야 한다.)
  const bb0 = await nodes().nth(0).boundingBox();
  const bb1 = await nodes().nth(1).boundingBox();
  const bb2 = await nodes().nth(2).boundingBox();
  await boxSelect([bb0, bb1, bb2]);
  check('재선택 박스 선택 → 3개 선택', await selectedNodes().count() === 3);
  await clickEmptyPane();
  await page.waitForTimeout(200);
  check('빈 캔버스 클릭 → 선택 전부 해제', await selectedNodes().count() === 0 && await multiPanel.count() === 0);

  // ───── 11. 선택 해제 후 개별 클릭 → 정상적으로 단일 선택(회귀) ─────
  await nodes().nth(1).click();
  await page.waitForTimeout(200);
  check('전체 해제 후 개별 노드 클릭 → 단일 선택으로 정상 동작', await selectedNodes().count() === 1 && await multiPanel.count() === 0);

  await page.screenshot({ path: 'ss_multiselect_final.png' });

  const failed = results.filter(r => !r.pass);
  console.log(`\n총 ${results.length}개 중 ${results.length - failed.length} PASS / ${failed.length} FAIL`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'ss_multiselect_error.png' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
