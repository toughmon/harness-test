// 서브타입에 관계선 연결(서브타입 스코프 지정) 검증
// - 자식(target) 쪽 서브타입 스코프 → FK 컬럼이 그 서브타입 columns로 이동, 식별 관계 강제 해제
// - 부모(source) 쪽 서브타입 스코프 → 라벨만 표시, FK 위치/식별 여부 무영향
// - 서브타입 삭제 시 target 스코프 관계는 캐스케이드 삭제, source 스코프 관계는 스코프만 해제
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

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

// parentName이 부모 라벨에 표시되는 엣지를 찾아 선택 (DOM 순서에 의존하지 않기 위해)
// 엣지 선택만으로는 편집 모달이 안 뜨므로 ✎ 아이콘을 클릭해 rel-panel을 열어야 라벨을 읽을 수 있다.
// 일치하면 모달을 연 채로 반환(호출자가 이어서 편집), 불일치면 닫고 다음 엣지로.
async function selectEdgeByParentLabel(parentName) {
  const count = await page.locator('.react-flow__edge').count();
  for (let i = 0; i < count; i++) {
    await clickEdge(i);
    const icon = page.locator('[data-testid="edge-edit-icon"]');
    if (await icon.count() === 0) continue;
    await icon.click();
    await page.waitForTimeout(300);
    const txt = await page.locator('[data-testid="rel-parent-label"]').innerText().catch(() => '');
    if (txt.includes(parentName)) return true;
    await page.click('[data-testid="editor-modal-close"]');
    await page.waitForTimeout(200);
  }
  return false;
}

const node = (i) => page.locator('.react-flow__node').nth(i);
const subtypeBoxes = (i) => node(i).locator('[data-testid="subtype-box"]');
const boxByName = (i, name) => subtypeBoxes(i).filter({ hasText: name });
const idBox = () => page.locator('[data-testid="rel-identifying"] input[type="checkbox"]');

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // ── 준비: Entity1(서브타입 없음) / Entity2(서브타입 Car·Truck) / Entity3(서브타입 없음) ──
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);

  await node(1).locator('[data-testid="entity-info-icon"]').click();
  await page.waitForTimeout(300);
  await page.click('[data-testid="add-subtype"]');
  await page.waitForTimeout(250);
  await page.click('[data-testid="add-subtype"]');
  await page.waitForTimeout(250);
  const setupPanel = page.locator('[data-testid="entity-editor-modal"]');
  await setupPanel.locator('[data-testid="subtype-card"]').nth(0).locator('input').first().fill('Car');
  await page.waitForTimeout(200);
  await setupPanel.locator('[data-testid="subtype-card"]').nth(1).locator('input').first().fill('Truck');
  await page.waitForTimeout(200);
  await setupPanel.getByPlaceholder('SubSet 이름 (구분자)').fill('vehicle_type');
  await page.waitForTimeout(300);
  check('Entity2에 서브타입 2개(Car/Truck) 준비', await subtypeBoxes(1).count() === 2);
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);

  // Entity1/Entity2의 PK를 각각 pid/vid로 변경 — 기본 PK명이 전부 "id"라 그대로 두면 자식
  // 엔티티의 기존 PK 컬럼이 동일 이름의 auto-FK로 덮어써지는 기존 동작(이번 작업과 무관, 이미
  // verify_rel_sidepanel.mjs가 "pid"로 우회하는 것과 같은 이유)이 발생해 PK가 사라진다.
  // R1(Entity1→Entity2)·R2(Entity2→Entity3) 모두 자식 쪽에 같은 문제가 생기므로 둘 다 분리한다.
  await node(0).locator('[data-testid="entity-info-icon"]').click();
  await page.waitForTimeout(300);
  await setupPanel.locator('.font-mono', { hasText: /^id$/ }).first().click();
  await page.waitForTimeout(300);
  await setupPanel.locator('input[placeholder="물리명"]').first().fill('pid');
  await page.waitForTimeout(300);
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);

  await node(1).locator('[data-testid="entity-info-icon"]').click();
  await page.waitForTimeout(300);
  await setupPanel.locator('.font-mono', { hasText: /^id$/ }).first().click();
  await page.waitForTimeout(300);
  await setupPanel.locator('input[placeholder="물리명"]').first().fill('vid');
  await page.waitForTimeout(300);
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);

  // Entity2가 서브타입 때문에 넓어졌으므로 정렬 후 진행(겹침 방지)
  await page.click('button[title="자동 정렬"]');
  await page.waitForTimeout(800);
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(400);

  // ── R1: Entity1(부모, 서브타입 없음) → Entity2(자식, 서브타입 있음) ──
  const r1Ok = await drawRelationship(0, 1, '1:M 비식별 (점선 + 실선)');
  check('R1 관계 생성 (Entity1 → Entity2)', r1Ok);

  // Entity2가 FK 추가로 다시 커졌을 수 있으니 R2 드래그 전에 재정렬
  await page.click('button[title="자동 정렬"]');
  await page.waitForTimeout(800);
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(400);

  // ── R2: Entity2(부모, 서브타입 있음) → Entity3(자식, 서브타입 없음) ──
  const r2Ok = await drawRelationship(1, 2, '1:M 비식별 (점선 + 실선)');
  check('R2 관계 생성 (Entity2 → Entity3)', r2Ok && await page.locator('.react-flow__edge').count() === 2);

  await page.click('button[title="자동 정렬"]');
  await page.waitForTimeout(800);

  // ── R1 선택: 자식(Entity2) 쪽 서브타입 스코프 ──
  check('R1 엣지 선택', await selectEdgeByParentLabel('Entity1'));
  check('부모(서브타입 없음) 쪽엔 스코프 드롭다운 없음', await page.locator('[data-testid="rel-parent-subtype"]').count() === 0);
  check('자식(서브타입 있음) 쪽엔 스코프 드롭다운 있음', await page.locator('[data-testid="rel-child-subtype"]').count() === 1);
  check('스코프 지정 전: 식별 체크박스 활성', await idBox().isDisabled() === false);

  await page.locator('[data-testid="rel-child-subtype"]').selectOption({ label: 'Car' });
  await page.waitForTimeout(500);

  check('Car 박스에 FK 컬럼 렌더', await boxByName(1, 'Car').locator('[title="Foreign Key"]').count() === 1);
  check('Truck 박스엔 FK 없음', await boxByName(1, 'Truck').locator('[title="Foreign Key"]').count() === 0);
  const totalFk = await node(1).locator('[title="Foreign Key"]').count();
  check('FK가 서브타입 영역에만 위치(엔티티 최상위엔 없음)', totalFk === 1);
  check('스코프 지정 후: 식별 체크박스 비활성 + 해제',
    await idBox().isDisabled() === true && await idBox().isChecked() === false);
  const childLabel = await page.locator('[data-testid="rel-child-label"]').innerText();
  check('자식 라벨에 "Entity2 · Car" 표시', childLabel.includes('Entity2') && childLabel.includes('Car'));

  // 관계 편집 모달이 화면 전체를 덮어 줌 툴바(SQL 내보내기)를 가리므로 먼저 닫는다
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);

  // ── SQL 내보내기 — nullable FK + 배타 CHECK + FK 제약 ──
  const sqlBtn = page.locator('button[title="SQL 내보내기 (MySQL)"]');
  const dl = page.waitForEvent('download', { timeout: 20000 });
  await sqlBtn.click();
  const download = await dl;
  const sqlPath = 'C:/project/harness-test/erd-service/ss_subtype_relationship_export.sql';
  await download.saveAs(sqlPath);
  const sql = readFileSync(sqlPath, 'utf-8');
  console.log('--- 생성된 DDL ---\n' + sql + '\n------------------');

  check('구분자 컬럼(vehicle_type) 생성', /`vehicle_type` VARCHAR\(30\)/.test(sql));
  check('FK 컬럼(pid)이 서브타입 컬럼으로 nullable 평탄화', sql.includes("`pid` INT NULL COMMENT 'Car'"));
  check('배타성 CHECK에 Truck 분기 포함(pid IS NULL)', /`vehicle_type` = 'Truck' AND `pid` IS NULL/.test(sql));
  check('FK 제약 생성(Entity2 → Entity1)',
    /CONSTRAINT `fk_Entity2_Entity1` FOREIGN KEY \(`pid`\) REFERENCES `Entity1` \(`pid`\)/.test(sql));

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_subtype_relationship.png' });

  // ── Undo/Redo (R1 스코프 지정) ──
  await page.mouse.click(700, 850); // select 포커스 해제(Undo 키 가드 회피) + 패널 닫힘
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  check('Undo → Car FK 제거', await boxByName(1, 'Car').locator('[title="Foreign Key"]').count() === 0);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(500);
  check('Redo → Car FK 복원', await boxByName(1, 'Car').locator('[title="Foreign Key"]').count() === 1);

  // ── R2 선택: 부모(Entity2) 쪽 서브타입 스코프 — FK 무변화, 라벨만 변경 ──
  check('R2 엣지 선택', await selectEdgeByParentLabel('Entity2'));
  check('부모(서브타입 있음) 쪽엔 스코프 드롭다운 있음', await page.locator('[data-testid="rel-parent-subtype"]').count() === 1);
  check('자식(서브타입 없음) 쪽엔 스코프 드롭다운 없음', await page.locator('[data-testid="rel-child-subtype"]').count() === 0);

  await page.locator('[data-testid="rel-parent-subtype"]').selectOption({ label: 'Car' });
  await page.waitForTimeout(500);

  const parentLabel = await page.locator('[data-testid="rel-parent-label"]').innerText();
  check('부모 라벨에 "Entity2 · Car" 표시', parentLabel.includes('Entity2') && parentLabel.includes('Car'));
  check('부모 스코프는 FK에 무영향 (Entity3에 FK 1개, 식별 체크박스 활성 유지)',
    await node(2).locator('[title="Foreign Key"]').count() === 1 && await idBox().isDisabled() === false);

  // ── 서브타입 삭제 캐스케이드 ──
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(300);
  await node(1).locator('[data-testid="entity-info-icon"]').click();
  await page.waitForTimeout(300);
  // Car는 첫 번째로 추가한 서브타입이라 카드 순서상 nth(0)
  // (hasText 필터는 <input value="Car">의 값을 텍스트 노드로 못 잡아 매칭되지 않는다)
  await setupPanel.locator('[data-testid="subtype-card"]').nth(0)
    .locator('button[title="서브타입 삭제"]').click();
  await page.waitForTimeout(500);

  check('Car 삭제 → target 스코프였던 R1은 캐스케이드 삭제(엣지 1개만 남음)',
    await page.locator('.react-flow__edge').count() === 1);
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);
  check('R2(source 스코프)는 캐스케이드로 삭제되지 않고 유지', await selectEdgeByParentLabel('Entity2'));
  const parentLabelAfter = await page.locator('[data-testid="rel-parent-label"]').innerText();
  check('R2의 source 스코프는 해제되어 라벨이 엔티티명만 표시', parentLabelAfter.trim() === 'Entity2');

  const failed = results.filter(r => !r.pass);
  console.log(`\n총 ${results.length}개 중 ${results.length - failed.length} PASS / ${failed.length} FAIL`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_subtype_relationship_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
