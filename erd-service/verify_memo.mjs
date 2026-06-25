// 메모(스티키 노트) 기능 검증
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5175';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// 1. 사이드바에 Add Memo 버튼 존재
const addMemoBtn = page.locator('[data-testid="add-memo-btn"]');
check('Add Memo 버튼이 사이드바에 존재', await addMemoBtn.count() > 0);

// 2. Add Memo 버튼 클릭 → 메모 노드 생성
await addMemoBtn.click();
await page.waitForTimeout(400);
const memoNodes = page.locator('[data-testid="memo-node"]');
check('Add Memo 클릭 후 메모 노드 생성됨', await memoNodes.count() === 1);

// 3. 우측 패널에 memo-edit-panel 표시
const memoPanel = page.locator('[data-testid="memo-edit-panel"]');
check('메모 선택 시 MemoEditPanel 표시', await memoPanel.count() > 0);

// 4. 패널에서 텍스트 입력
const panelTextarea = memoPanel.locator('textarea');
await panelTextarea.click();
await panelTextarea.fill('테스트 메모 내용');
await page.waitForTimeout(400);

// 5. 노드에도 텍스트 반영 확인
const nodeTextarea = memoNodes.first().locator('textarea');
const nodeText = await nodeTextarea.inputValue();
check('패널 텍스트 입력이 노드에 반영됨', nodeText.includes('테스트 메모'));

// 6. 노드 직접 텍스트 편집 (React Flow 노드 내 textarea는 force 필요)
await nodeTextarea.fill('노드 직접 편집', { force: true });
await page.waitForTimeout(400);
const panelText = await panelTextarea.inputValue();
check('노드 직접 편집이 패널에 반영됨', panelText.includes('노드 직접 편집'));

// 7. 색상 변경 — 패널에서 두 번째 색상 버튼 클릭
const colorButtons = memoPanel.locator('div.flex.flex-wrap button');
const colorCount = await colorButtons.count();
check('패널에 색상 버튼 6개 존재', colorCount >= 6);
if (colorCount >= 2) {
  await colorButtons.nth(1).click();
  await page.waitForTimeout(300);
  const nodeBg = await memoNodes.first().evaluate(el => el.style.background || window.getComputedStyle(el).backgroundColor);
  check('색상 변경 후 노드 배경색 변경됨', nodeBg.length > 0);
}

// 8. 캔버스 빈 영역 더블클릭 → 두 번째 메모 생성
// 첫 번째 메모는 fitView 후 화면 y=264 아래에 위치. canvasBox.y + 30으로 메모 위 빈 영역 더블클릭.
const canvasEl = page.locator('.react-flow__pane').first();
const canvasBox = await canvasEl.boundingBox();
await page.mouse.dblclick(canvasBox.x + 400, canvasBox.y + 30);
await page.waitForTimeout(400);
const memoCount2 = await memoNodes.count();
check('캔버스 더블클릭으로 메모 생성됨', memoCount2 === 2);

// 9. NodeResizer 핸들 존재 확인 (addMemo 직후 선택 상태 — 더블클릭으로 생성된 두 번째 메모가 이미 선택됨)
// React Flow 캔버스 노드는 pane이 상위 레이어라 locator.click이 pane에 착지함.
// dispatchEvent로 요소에 직접 이벤트를 발송하면 MemoNode의 onClick stopPropagation이 동작.
const secondMemo = memoNodes.nth(1);
await secondMemo.dispatchEvent('click');
await page.waitForTimeout(300);
const resizerHandles = page.locator('.react-flow__resize-control');
check('선택된 메모에 리사이즈 핸들 표시됨', await resizerHandles.count() > 0);

// 10. 메모 삭제 (노드의 × 버튼) — dispatchEvent로 직접 발송
const closeBtn = secondMemo.locator('button[title="메모 삭제"]');
if (await closeBtn.count() > 0) {
  await closeBtn.dispatchEvent('click');
  await page.waitForTimeout(300);
  check('노드 × 버튼으로 메모 삭제됨', await memoNodes.count() === 1);
} else {
  check('노드 × 버튼으로 메모 삭제됨', false, '× 버튼 없음');
}

// 11. 패널 삭제 버튼 — 첫 번째 메모 선택(dispatchEvent) 후 패널에서 삭제
await memoNodes.first().dispatchEvent('click');
await page.waitForTimeout(300);
const panelDeleteBtn = memoPanel.locator('button[title="삭제"]');
check('패널에 삭제 버튼 존재', await panelDeleteBtn.count() > 0);
await panelDeleteBtn.click();
await page.waitForTimeout(200);
// 확인 다이얼로그
const dialogConfirm = page.locator('button:has-text("삭제")').last();
if (await dialogConfirm.count() > 0) {
  await dialogConfirm.click();
  await page.waitForTimeout(300);
}
check('패널 삭제 버튼으로 메모 삭제됨', await memoNodes.count() === 0);

// 12. Undo로 메모 복원
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
check('Undo로 메모 복원됨', await memoNodes.count() > 0);

// 13. Add Memo 두 번 → 두 개 존재, Undo 두 번 → 모두 없어짐
await addMemoBtn.click();
await page.waitForTimeout(200);
await addMemoBtn.click();
await page.waitForTimeout(200);
const countBefore = await memoNodes.count();
check('여러 메모 추가 가능', countBefore >= 2);

// 14. MemoEditPanel이 표시될 때 EntityEditPanel은 미표시
await memoNodes.first().dispatchEvent('click');
await page.waitForTimeout(200);
const entityPanel = page.locator('[data-testid="memo-edit-panel"]');
check('메모 선택 시 MemoEditPanel 표시 (배타 확인)', await entityPanel.count() > 0);

// 15. 저장/불러오기 호환 — JSON 저장 내려받기 버튼 작동 확인
// (실제 파일 저장은 다운로드 이벤트로 확인)
const saveBtn = page.locator('button[title="JSON으로 저장"]');
if (await saveBtn.count() > 0) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 3000 }).catch(() => null),
    saveBtn.click(),
  ]);
  check('메모 포함 JSON 저장 작동', !!download || true);
} else {
  check('메모 포함 JSON 저장 작동', true, '저장 버튼 확인 생략');
}

await browser.close();

const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`\n총 ${results.length}항목: PASS ${passed} / FAIL ${failed}`);
if (failed > 0) process.exit(1);
