// 관계선 끝점 드래그로 부착 위치 이동 검증
// 선택된 관계선의 source/target 끝점을 같은 엔티티 테두리의 다른 면으로 드래그 → 부착 위치 이동,
// 더블클릭으로 자동 복귀, 재선택 시 위치 유지(스토어 영속), Undo/Redo, 비(非)앵커 FK 무변경.
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

async function clickEdge(idx = 0) {
  const pt = await page.locator('.react-flow__edge').nth(idx).evaluate(g => {
    const path = g.querySelector('path');
    const p = path.getPointAtLength(path.getTotalLength() / 2);
    const m = path.getScreenCTM();
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(400);
}

// 엣지 끝점(source=path 시작, target=path 끝)을 플로우 좌표로 읽음
const edgeEndpoint = (which) => page.locator('.react-flow__edge').nth(0).evaluate((g, which) => {
  const path = g.querySelector('path');
  const len = path.getTotalLength();
  const p = which === 'source' ? path.getPointAtLength(0) : path.getPointAtLength(len);
  return { x: p.x, y: p.y };
}, which);

const handleCount = () => page.locator('.edge-anchor-handle').count();

async function dragHandle(end, toX, toY) {
  const h = await page.locator(`[data-testid="edge-anchor-${end}"]`).boundingBox();
  const fromX = h.x + h.width / 2, fromY = h.y + h.height / 2;
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.waitForTimeout(60);
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(fromX + (toX - fromX) * i / 20, fromY + (toY - fromY) * i / 20);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(350);
}

async function deselect() {
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(300);
}

const childPk = () => page.locator('.react-flow__node').nth(1).locator('[title="Primary Key"]').count();
const childFk = () => page.locator('.react-flow__node').nth(1).locator('[title="Foreign Key"]').count();

try {
  await page.goto(BASE + '/app', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // ── 준비: 엔티티 2개 + 부모 PK명 충돌 회피(id→pid) + 관계 생성 + 자동 정렬 ──
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(400);

  await page.locator('.react-flow__node').nth(0).locator('[data-testid="entity-info-icon"]').click();
  await page.waitForTimeout(300);
  const setupPanel = page.locator('[data-testid="entity-editor-modal"]');
  await setupPanel.locator('.font-mono', { hasText: /^id$/ }).first().click();
  await page.waitForTimeout(300);
  await setupPanel.locator('input[placeholder="물리명"]').first().fill('pid');
  await page.waitForTimeout(300);
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);
  await deselect();

  const relOk = await drawRelationship(0, 1, '1:M 비식별 (점선 + 실선)');
  check('관계 생성', relOk && await page.locator('.react-flow__edge').count() === 1);

  await page.click('button[title="자동 정렬"]');
  await page.waitForTimeout(800);

  const pk0 = await childPk(), fk0 = await childFk();

  // ── 1. 엣지 선택 → 끝점 핸들 2개 ──
  await clickEdge(0);
  check('엣지 선택 → 끝점 핸들 2개', await handleCount() === 2);
  check('source/target 핸들 각 1개',
    await page.locator('[data-testid="edge-anchor-source"]').count() === 1 &&
    await page.locator('[data-testid="edge-anchor-target"]').count() === 1);

  // ── 2. source 끝점을 source 엔티티 상단으로 드래그 → 부착 위치 이동 ──
  const P0 = await edgeEndpoint('source');
  const srcBox = await page.locator('.react-flow__node').nth(0).boundingBox();
  await dragHandle('source', srcBox.x + srcBox.width / 2, srcBox.y + 5);
  const P1 = await edgeEndpoint('source');
  check('source 끝점 위로 이동 (상단 면 부착)', P1.y < P0.y - 10, `P0.y=${P0.y.toFixed(0)} → P1.y=${P1.y.toFixed(0)}`);
  check('드래그 후에도 엣지 1개 유지(같은 엔티티)', await page.locator('.react-flow__edge').count() === 1);
  check('드래그 후에도 핸들 2개(선택 유지)', await handleCount() === 2);
  check('앵커는 순수 기하 — 자식 PK/FK 무변경', await childPk() === pk0 && await childFk() === fk0);

  // ── 3. 배타 게이트: 선택 해제 시 핸들 사라짐, 재선택 시 위치 유지(스토어 영속) ──
  await deselect();
  check('선택 해제 → 핸들 0개', await handleCount() === 0);
  await clickEdge(0);
  const P1b = await edgeEndpoint('source');
  check('재선택 → 핸들 복귀', await handleCount() === 2);
  check('재선택 후 부착 위치 유지(영속)', Math.abs(P1b.y - P1.y) < 8 && Math.abs(P1b.x - P1.x) < 8);

  // ── 4. 더블클릭 → 자동 위치로 복귀 ──
  await page.locator('[data-testid="edge-anchor-source"]').dblclick();
  await page.waitForTimeout(400);
  const Preset = await edgeEndpoint('source');
  check('더블클릭 → 자동 위치 복귀', Math.abs(Preset.y - P0.y) < 20 && Math.abs(Preset.x - P0.x) < 20,
    `reset=(${Preset.x.toFixed(0)},${Preset.y.toFixed(0)}) vs auto=(${P0.x.toFixed(0)},${P0.y.toFixed(0)})`);

  // ── 5. Undo/Redo ──
  await page.waitForTimeout(1000);  // relAnchor coalesce 창 만료 → 독립 스냅샷 보장
  await dragHandle('source', srcBox.x + srcBox.width / 2, srcBox.y + 5);
  const Pdrag2 = await edgeEndpoint('source');
  check('재드래그 → 다시 상단 부착', Pdrag2.y < P0.y - 10);
  await deselect();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  const Pundo = await edgeEndpoint('source');
  check('Undo → 자동 위치 복귀', Math.abs(Pundo.y - P0.y) < 20, `undo.y=${Pundo.y.toFixed(0)} vs auto.y=${P0.y.toFixed(0)}`);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(500);
  const Predo = await edgeEndpoint('source');
  check('Redo → 부착 위치 재적용', Predo.y < P0.y - 10, `redo.y=${Predo.y.toFixed(0)}`);

  // ── 6. target 끝점도 드래그 가능 ──
  await clickEdge(0);
  const T0 = await edgeEndpoint('target');
  const tgtBox = await page.locator('.react-flow__node').nth(1).boundingBox();
  await dragHandle('target', tgtBox.x + tgtBox.width / 2, tgtBox.y + tgtBox.height - 5);
  const T1 = await edgeEndpoint('target');
  check('target 끝점 하단으로 이동', T1.y > T0.y + 10, `T0.y=${T0.y.toFixed(0)} → T1.y=${T1.y.toFixed(0)}`);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_edge_anchor.png' });

  const failed = results.filter(r => !r.pass);
  console.log(`\n총 ${results.length}개 중 ${results.length - failed.length} PASS / ${failed.length} FAIL`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_edge_anchor_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
