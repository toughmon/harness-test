// 관계선 좌/우 절반 독립 편집 (우측 패널) 검증
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

// 엣지 선택(하이라이트) + ✎ 아이콘 클릭으로 편집 모달까지 연다.
// 이미 선택되어 ✎ 아이콘이 중간점을 덮고 있으면 clickEdge()가 그 아이콘을 다시 클릭해버려
// (아이콘 자체가 openRelationshipEditor를 호출) 모달이 먼저 열리고 뒤이은 아이콘 클릭이
// 가려진 아이콘을 기다리다 타임아웃난다 — 이미 떠 있으면 clickEdge를 건너뛴다.
async function openRelPanel(idx = 0) {
  const icon = page.locator('[data-testid="edge-edit-icon"]');
  if (await icon.count() === 0) {
    await clickEdge(idx);
  }
  await page.click('[data-testid="edge-edit-icon"]');
  await page.waitForTimeout(300);
}

// 엣지 group 내 보이는 path(투명 hit-area 제외)의 stroke-dasharray 목록
const edgeDashes = (idx = 0) => page.locator('.react-flow__edge').nth(idx).evaluate(g =>
  [...g.querySelectorAll('path')]
    .filter(p => (p.getAttribute('stroke') || '') !== 'transparent')
    .map(p => p.getAttribute('stroke-dasharray'))
);
// 엣지 group 내 <line> 개수 (까마귀발 3 + 식별막대 1 등)
const edgeLines = (idx = 0) => page.locator('.react-flow__edge').nth(idx).evaluate(g => g.querySelectorAll('line').length);

const relPanelCount = () => page.locator('[data-testid="rel-panel"]').count();
// 구버전엔 "Properties" 고정 라벨이었으나, 모달 전환 후 타이틀이 엔티티명으로 바뀌어 testid로 판별
const propsPanelCount = () => page.locator('[data-testid="entity-editor-modal"]').count();
const childPk = () => page.locator('.react-flow__node').nth(1).locator('[title="Primary Key"]').count();
const childFk = () => page.locator('.react-flow__node').nth(1).locator('[title="Foreign Key"]').count();

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // ── 준비: 엔티티 2개 + 부모 PK명 충돌 회피(id→pid) + 관계 생성 ──
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.mouse.click(700, 780);
  await page.waitForTimeout(200);
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
  await page.mouse.click(700, 780);
  await page.waitForTimeout(300);

  const relOk = await drawRelationship(0, 1, '1:M 비식별 (점선 + 실선)');
  check('관계 생성 (비식별)', relOk && await page.locator('.react-flow__edge').count() === 1);

  // 엣지 중간점이 핸들에 가려지지 않게 자동 정렬
  await page.click('button[title="자동 정렬"]');
  await page.waitForTimeout(800);

  // ── 1. 엣지 선택(하이라이트)만으로는 패널이 안 열리고, ✎ 아이콘을 눌러야 열린다 ──
  await clickEdge(0);
  check('엣지 클릭 → ✎ 편집 아이콘 노출(패널은 아직 안 열림)',
    await page.locator('[data-testid="edge-edit-icon"]').count() === 1 && await relPanelCount() === 0);
  await page.click('[data-testid="edge-edit-icon"]');
  await page.waitForTimeout(300);
  check('✎ 아이콘 클릭 → 관계 편집 패널 표시', await relPanelCount() === 1);
  check('엣지 편집 패널 표시 중엔 엔티티 Properties 패널 숨김', await propsPanelCount() === 0);

  // ── 2. 모달은 화면 전체를 덮어 열린 동안 캔버스 클릭 자체가 막힌다 — 먼저 닫아야 다른 요소를 선택할 수 있음.
  //      닫은 뒤 노드를 클릭하면 선택만 되고 Properties가 자동으로 열리지는 않음(각자 아이콘으로 명시 오픈) ──
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);
  check('모달 닫기 → 관계 패널 사라짐', await relPanelCount() === 0);
  await page.locator('.react-flow__node').nth(0).click();
  await page.waitForTimeout(300);
  check('노드 클릭(선택) → Properties 자동 오픈 아님', await propsPanelCount() === 0);
  await page.locator('.react-flow__node').nth(0).locator('[data-testid="entity-info-icon"]').click();
  await page.waitForTimeout(300);
  check('엔티티 info 아이콘 → Properties 모달 표시', await propsPanelCount() === 1);
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);

  await openRelPanel(0);
  check('다시 엣지 편집 → 관계 패널 복귀', await relPanelCount() === 1 && await propsPanelCount() === 0);

  // ── 4. 4조합 렌더 (선택 상태 유지하며 토글) ──
  // 시작: parentOptional=true(점선), childOptional=false(실선) = half → 베이스'6 4' + 자식 오버레이'0 50 50 0'
  let dashes = await edgeDashes(0);
  check('기본(부모점선+자식실선) → 자식 절반 실선 오버레이', dashes.length === 2 && dashes.includes('0 50 50 0'));

  // 양쪽 점선: 자식도 선택으로
  await page.click('[data-testid="rel-child-optional"]');
  await page.waitForTimeout(400);
  dashes = await edgeDashes(0);
  check('양쪽 선택 → 단일 점선(4 4)', dashes.length === 1 && dashes[0] === '4 4');

  // 부모 실선 + 자식 점선 (신규 조합): 부모를 필수로
  await page.click('[data-testid="rel-parent-mandatory"]');
  await page.waitForTimeout(400);
  dashes = await edgeDashes(0);
  check('부모실선+자식점선 → 부모 절반 실선 오버레이(50 50)', dashes.length === 2 && dashes.includes('50 50'));

  // 양쪽 실선: 자식도 필수로 → 단일 실선(dasharray 없음)
  await page.click('[data-testid="rel-child-mandatory"]');
  await page.waitForTimeout(400);
  dashes = await edgeDashes(0);
  check('양쪽 필수 → 단일 실선(dasharray 없음)', dashes.length === 1 && dashes[0] === null);

  // 부모 점선으로 복귀 (half) — 이후 카디널리티/식별 테스트 기준 상태
  await page.click('[data-testid="rel-parent-optional"]');
  await page.waitForTimeout(400);

  // ── 5. 카디널리티 토글 → 까마귀발 유무 ──
  // 현재 many(비식별) → 까마귀발 line 3개
  let lines = await edgeLines(0);
  check('카디널리티 다(M) → 까마귀발 3선', lines === 3);
  await page.click('[data-testid="rel-card-one"]');
  await page.waitForTimeout(400);
  lines = await edgeLines(0);
  check('카디널리티 1 → 마커 선 없음(비식별)', lines === 0);
  await page.click('[data-testid="rel-card-many"]');
  await page.waitForTimeout(400);

  // ── 6. 식별 토글 → 자식 FK가 PK로 승격 + 식별 막대 ──
  const idBox = page.locator('[data-testid="rel-identifying"] input[type="checkbox"]');
  check('식별 전 자식 PK 1 / FK 1', await childPk() === 1 && await childFk() === 1);
  await idBox.check();
  await page.waitForTimeout(500);
  check('식별 ON → 자식 FK가 PK로 승격(PK 2)', await childPk() === 2 && await childFk() === 1);
  lines = await edgeLines(0);
  check('식별 ON → 까마귀발 3 + 식별막대 1 = 4선', lines === 4);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_rel_sidepanel.png' });

  // ── 6b. 자식 점선 → 식별 자동 해제 (식별 FK는 PK·NOT NULL이라 선택참여와 양립 불가) ──
  await page.click('[data-testid="rel-child-optional"]');
  await page.waitForTimeout(500);
  check('자식 점선 → 식별 자동 해제(PK 1)', await childPk() === 1);
  check('자식 점선 → 식별 체크 해제 + 비활성', (await idBox.isChecked()) === false && (await idBox.isDisabled()) === true);
  // 자식을 다시 실선(필수)으로 복귀 → 식별 체크박스 재활성
  await page.click('[data-testid="rel-child-mandatory"]');
  await page.waitForTimeout(400);
  check('자식 실선 복귀 → 식별 체크박스 재활성', (await idBox.isDisabled()) === false);

  // ── 8. undo/redo (식별 토글) ──
  await page.waitForTimeout(900);   // relSides coalesce 창 만료 → 독립 스냅샷 보장
  await idBox.check();              // 식별 ON (자식 실선이라 가능)
  await page.waitForTimeout(500);
  check('식별 재적용 → PK 2', await childPk() === 2);
  // 입력 포커스 해제(Ctrl+Z 동작 위해) — 모달을 명시적으로 닫는다.
  // (모달이 화면 중앙 640px 폭이라 700,780 같은 임의 좌표는 배경이 아니라 패널 내부를 클릭할 수 있음 — 실제로 "관계 삭제" 버튼을 오클릭한 회귀가 있었음)
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  check('Undo → 식별 취소(PK 1)', await childPk() === 1);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(500);
  check('Redo → 식별 재적용(PK 2)', await childPk() === 2);

  // ── 3 & 7. 빈 캔버스(모달 배경) 클릭 → 패널 닫힘 / 패널에서 관계 삭제 ──
  // 모달 카드가 화면 중앙 640px 폭이라, 배경임을 보장하려면 카드 바깥의 좌상단 모서리를 클릭한다.
  await openRelPanel(0);
  check('엣지 재선택 → 패널 표시', await relPanelCount() === 1);
  await page.mouse.click(50, 50);
  await page.waitForTimeout(300);
  check('빈 캔버스(모달 배경) 클릭 → 관계 패널 닫힘', await relPanelCount() === 0);

  await openRelPanel(0);
  await page.click('[data-testid="rel-delete"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="dialog-ok"]');
  await page.waitForTimeout(500);
  check('패널 삭제 → 관계선 제거', await page.locator('.react-flow__edge').count() === 0);
  check('패널 삭제 → 자식 FK 컬럼 제거', await childFk() === 0);
  check('패널 삭제 후 관계 패널 닫힘', await relPanelCount() === 0);

  const failed = results.filter(r => !r.pass);
  console.log(`\n총 ${results.length}개 중 ${results.length - failed.length} PASS / ${failed.length} FAIL`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_rel_sidepanel_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
