// Undo/Redo · PNG 내보내기 · 자동 정렬 · 관계 타입 변경 검증
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

const nodeCount = () => page.locator('.react-flow__node').count();
const edgeCount = () => page.locator('.react-flow__edge').count();

// 엣지 path 중간점의 화면 좌표를 구해 클릭 (bbox 중앙은 ㄱ자 경로에서 빗나감)
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
  await page.waitForTimeout(2500);

  // ───── 1. Undo/Redo ─────
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  check('엔티티 추가', await nodeCount() === 1);

  // 버튼 undo
  await page.click('button[aria-label="Undo"]');
  await page.waitForTimeout(400);
  check('Undo 버튼 → 엔티티 제거', await nodeCount() === 0);

  // 버튼 redo
  await page.click('button[aria-label="Redo"]');
  await page.waitForTimeout(400);
  check('Redo 버튼 → 엔티티 복원', await nodeCount() === 1);

  // 키보드 Ctrl+Z (캔버스 클릭으로 입력 포커스 해제 후)
  await page.mouse.click(700, 750);
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  check('Ctrl+Z → 엔티티 제거', await nodeCount() === 0);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(400);
  check('Ctrl+Y → 엔티티 복원', await nodeCount() === 1);

  // ───── 2. 관계 타입 변경 ─────
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  await page.mouse.click(700, 750);
  await page.waitForTimeout(200);
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(500);

  // 부모 Entity1의 PK명을 자식 기본 PK(id)와 겹치지 않게 변경 — 이름 충돌 시 자식 PK가
  // FK로 교체되는 동작(verify_fk_namedup에서 검증)과 분리해, 여기선 FK 플래그 전환만 본다.
  await page.locator('.react-flow__node').nth(0).click();
  await page.waitForTimeout(300);
  const setupPanel = page.locator('aside').last();
  await setupPanel.locator('.font-mono', { hasText: /^id$/ }).first().click();
  await page.waitForTimeout(300);
  await setupPanel.locator('input[placeholder="물리명"]').first().fill('pid');
  await page.waitForTimeout(300);
  await page.mouse.click(700, 750);
  await page.waitForTimeout(300);

  const relOk = await drawRelationship(0, 1, '1:M 비식별 (점선 + 실선)');
  check('관계 생성 (비식별)', relOk && await edgeCount() === 1);
  // FK는 link 아이콘으로 카운트 (PK/FK 아이콘 수로 플래그 판정)
  const fkIconCount = () => page.locator('.react-flow__node').nth(1).locator('[title="Foreign Key"]').count();
  const pkIconCount = () => page.locator('.react-flow__node').nth(1).locator('[title="Primary Key"]').count();
  // 비식별 FK는 생성되되 식별자(PK) 미포함 — 자식 원래 PK(id) 1개 + FK(pid) 1개
  let pkIcons = await pkIconCount();
  let fkIcons = await fkIconCount();
  check('비식별 → FK 생성 (식별자 미포함)', fkIcons === 1 && pkIcons === 1);

  // 기본 배치는 노드 간격이 좁아 엣지 중간점이 핸들에 가려짐 → 자동 정렬로 간격 확보
  await page.click('button[title="자동 정렬"]');
  await page.waitForTimeout(800);

  // 엣지 클릭 → 툴바 → 타입 변경 (식별로)
  await clickEdge(0);
  const editBtn = page.locator('button[title="관계 종류 변경"]');
  check('엣지 선택 시 타입 변경 툴바 표시', await editBtn.count() === 1);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_edge_toolbar.png' });

  await editBtn.click();
  await page.waitForTimeout(400);
  const modalTitle = await page.locator('h3:has-text("관계 종류 변경")').count();
  const currentChip = await page.locator('text=현재').count();
  check('타입 변경 모달 (현재 타입 표시)', modalTitle === 1 && currentChip >= 1);

  await page.locator('button').filter({ hasText: '1:M 식별자 상속 (점선 + 실선)' }).first().click();
  await page.waitForTimeout(500);
  pkIcons = await pkIconCount();
  fkIcons = await fkIconCount();
  // FK가 PK로 승격 — 중복 생성 없이 FK 아이콘 1개, PK 아이콘은 원래 id + 승격된 FK = 2개
  check('비식별→식별 전환 시 FK가 PK로 승격', fkIcons === 1 && pkIcons === 2);

  // 다시 비식별로 → FK 유지 + PK 해제
  await clickEdge(0);
  await page.locator('button[title="관계 종류 변경"]').click();
  await page.waitForTimeout(400);
  await page.locator('button').filter({ hasText: '1:M 비식별 (점선 + 실선)' }).first().click();
  await page.waitForTimeout(500);
  pkIcons = await pkIconCount();
  fkIcons = await fkIconCount();
  check('식별→비식별 전환 시 FK 유지 + PK 해제', fkIcons === 1 && pkIcons === 1);

  // ───── 3. 자동 정렬 ─────
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  await page.mouse.click(700, 750);
  await page.waitForTimeout(200);

  const before = await page.locator('.react-flow__node').evaluateAll(
    els => els.map(el => el.style.transform)
  );
  await page.click('button[title="자동 정렬"]');
  await page.waitForTimeout(800);
  const after = await page.locator('.react-flow__node').evaluateAll(
    els => els.map(el => el.style.transform)
  );
  check('자동 정렬 → 노드 위치 변경', JSON.stringify(before) !== JSON.stringify(after));

  // 자동 정렬도 undo 가능한지
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  const reverted = await page.locator('.react-flow__node').evaluateAll(
    els => els.map(el => el.style.transform)
  );
  check('자동 정렬 Undo → 위치 복원', JSON.stringify(reverted) === JSON.stringify(before));
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_autolayout.png' });

  // ───── 4. PNG 내보내기 ─────
  const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
  await page.click('button[title="PNG 내보내기"]');
  const download = await downloadPromise;
  const fname = download.suggestedFilename();
  check('PNG 내보내기 다운로드', /^erd-\d{4}-\d{2}-\d{2}\.png$/.test(fname), fname);
  await download.saveAs('C:/project/harness-test/erd-service/ss_export_result.png');

  // ───── 요약 ─────
  const failed = results.filter(r => !r.pass);
  console.log(`\n총 ${results.length}개 중 ${results.length - failed.length} PASS / ${failed.length} FAIL`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_features_error.png' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
