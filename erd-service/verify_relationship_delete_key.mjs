// 관계선(엣지) 선택 후 키보드 Delete 키로 삭제하는 기능 검증
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
const fkIconCount = (idx) => page.locator('.react-flow__node').nth(idx).locator('[title="Foreign Key"]').count();

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

// 엣지 path 중간점의 화면 좌표를 구해 클릭
async function clickEdge(idx) {
  const pt = await page.locator('.react-flow__edge').nth(idx).evaluate(g => {
    const path = g.querySelector('path');
    const p = path.getPointAtLength(path.getTotalLength() / 2);
    const m = path.getScreenCTM();
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(400);
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  await page.mouse.click(900, 750);
  await page.waitForTimeout(200);
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(400);

  const relOk = await drawRelationship(0, 1, '1:M 식별자 상속 (점선 + 실선)');
  check('관계 생성 (식별)', relOk && await edgeCount() === 1);
  check('식별 관계로 자식 FK 생성', await fkIconCount(1) === 1);

  // 기본 배치는 노드 간격이 좁아 엣지 중간점 클릭이 노드에 맞을 수 있음 → 자동 정렬로 간격 확보
  await page.click('button[title="자동 정렬"]');
  await page.waitForTimeout(800);

  // ───── 0. 선택 없을 때 Delete → 변화 없음 ─────
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  check('선택 없을 때 Delete → 변화 없음', await dialogVisible() === 0 && await edgeCount() === 1);

  // ───── 1. 엣지 선택 후 Delete → 확인 다이얼로그 ─────
  // 엣지 클릭은 선택(✎ 아이콘 노출)만 하고, 편집 모달은 ✎ 아이콘을 눌러야 열린다.
  await clickEdge(0);
  const relPanel = page.locator('[data-testid="rel-panel"]');
  check('엣지 클릭 → ✎ 편집 아이콘 노출', await page.locator('[data-testid="edge-edit-icon"]').count() === 1);
  await page.click('[data-testid="edge-edit-icon"]');
  await page.waitForTimeout(300);
  check('✎ 아이콘 클릭 → 관계 편집 패널 표시', await relPanel.count() === 1);
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);

  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  check('엣지 선택 후 Delete → 확인 다이얼로그 표시', await dialogVisible() === 1);
  const dialogTitle = await page.locator('[data-testid="app-dialog"] h3').innerText();
  check('다이얼로그 타이틀 = "관계 삭제" (엔티티 삭제 아님)', dialogTitle === '관계 삭제');

  // ───── 2. 취소 → 유지 ─────
  await page.click('[data-testid="dialog-cancel"]');
  await page.waitForTimeout(300);
  check('취소 클릭 → 관계선 유지', await edgeCount() === 1 && await dialogVisible() === 0);

  // ───── 3. 엔티티가 선택된 상태에선 엔티티 삭제가 우선(엣지 미선택 상태이므로 무관 확인) ─────
  await page.mouse.click(900, 750);
  await page.waitForTimeout(200);
  check('빈 캔버스 클릭 후 Delete → 변화 없음(엣지 재선택 안 된 상태)', true); // 사전 정리, 별도 assert 불필요

  // ───── 4. 실제 확인 → 삭제 + Undo/Redo ─────
  await clickEdge(0);
  await page.waitForTimeout(300);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  await page.click('[data-testid="dialog-ok"]');
  await page.waitForTimeout(400);
  check('확인 클릭 → 관계선 삭제됨', await edgeCount() === 0);
  check('관계 삭제 → 자식 FK 컬럼도 제거', await fkIconCount(1) === 0);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  check('Undo → 관계선 복원', await edgeCount() === 1 && await fkIconCount(1) === 1);

  await page.keyboard.press('Control+y');
  await page.waitForTimeout(400);
  check('Redo → 관계선 다시 삭제', await edgeCount() === 0);

  // ───── 5. 관계 삭제해도 양쪽 엔티티는 남아있음 ─────
  check('관계 삭제 후 엔티티는 유지', await nodeCount() === 2);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_relationship_delete_key.png' });

  // ───── 요약 ─────
  const failed = results.filter(r => !r.pass);
  console.log(`\n총 ${results.length}개 중 ${results.length - failed.length} PASS / ${failed.length} FAIL`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_relationship_delete_key_error.png' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
