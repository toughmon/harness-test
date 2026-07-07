// 서브타입 박스에서 직접 드래그해 관계 연결 (패널 조작 없이 즉시 스코프 지정) 검증
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

// 임의의 두 핸들(Locator) 사이를 드래그 — 소스가 서브타입 핸들이든 엔티티 핸들이든 동일하게 동작
async function dragConnect(srcHandle, tgtHandle, relButtonText) {
  const sBox = await srcHandle.boundingBox();
  const tBox = await tgtHandle.boundingBox();
  const sx = sBox.x + sBox.width / 2, sy = sBox.y + sBox.height / 2;
  const tx = tBox.x + tBox.width / 2, ty = tBox.y + tBox.height / 2;
  await page.mouse.move(sx, sy);
  await page.waitForTimeout(150);
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
  check('Entity2에 서브타입 2개(Car/Truck) 준비', await subtypeBoxes(1).count() === 2);
  check('서브타입 박스마다 연결 핸들 1개', await boxByName(1, 'Car').locator('.react-flow__handle').count() === 1);

  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);
  await page.click('button[title="자동 정렬"]');
  await page.waitForTimeout(800);
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(400);

  // ── 1. Entity1 → Car 서브타입 핸들로 직접 드래그(자식 쪽 스코프) ──
  const e1Handle = node(0).locator('.react-flow__handle[data-handlepos="right"]').first();
  const carHandle = boxByName(1, 'Car').locator('.react-flow__handle');
  const ok1 = await dragConnect(e1Handle, carHandle, '1:M 비식별 (점선 + 실선)');
  check('Entity1 → Car 핸들 직접 드래그로 관계 생성', ok1 && await page.locator('.react-flow__edge').count() === 1);

  check('패널 조작 없이 즉시 Car 박스에 FK 렌더', await boxByName(1, 'Car').locator('[title="Foreign Key"]').count() === 1);
  check('Truck 박스엔 FK 없음', await boxByName(1, 'Truck').locator('[title="Foreign Key"]').count() === 0);

  await clickEdge(0);
  await page.click('[data-testid="edge-edit-icon"]');
  await page.waitForTimeout(300);
  const childSubtypeSelected = await page.locator('[data-testid="rel-child-subtype"] option:checked').innerText();
  check('패널 열면 자식 스코프 드롭다운이 이미 Car로 선택됨', childSubtypeSelected.startsWith('Car'));
  const childLabel = await page.locator('[data-testid="rel-child-label"]').innerText();
  check('자식 라벨에 "Entity2 · Car" 즉시 표시', childLabel.includes('Entity2') && childLabel.includes('Car'));
  check('식별 관계 체크박스가 이미 비활성+해제 상태', await idBox().isDisabled() === true && await idBox().isChecked() === false);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_subtype_direct_connect.png' });

  // ── 2. Car 서브타입 핸들 → Entity3 로 직접 드래그(부모 쪽 스코프, dragStart가 서브타입 핸들) ──
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(300);
  const carHandle2 = boxByName(1, 'Car').locator('.react-flow__handle');
  const e3Handle = node(2).locator('.react-flow__handle[data-handlepos="left"]').last(); // target(-t) 핸들
  const ok2 = await dragConnect(carHandle2, e3Handle, '1:M 비식별 (점선 + 실선)');
  check('Car 핸들 → Entity3 직접 드래그로 관계 생성', ok2 && await page.locator('.react-flow__edge').count() === 2);

  // 첫 번째 관계(edge#1)가 여전히 선택된 채라 그 ✎ 아이콘이 자기 중간점에 남아있다 — 다음 루프의
  // clickEdge(0)이 그 자리를 클릭하면 (재선택이 아니라) 그 아이콘을 다시 누르는 꼴이 되어 엉뚱한
  // 패널이 열린다. 루프 시작 전 빈 캔버스를 클릭해 완전히 선택 해제한다.
  await page.mouse.click(700, 850);
  await page.waitForTimeout(300);

  // 새로 생긴 엣지 선택 — 부모 라벨에 Entity2 포함하는 쪽을 찾는다
  let found = false;
  for (let i = 0; i < 2 && !found; i++) {
    await clickEdge(i);
    const icon = page.locator('[data-testid="edge-edit-icon"]');
    if (await icon.count() === 0) continue;
    await icon.click();
    await page.waitForTimeout(300);
    const txt = await page.locator('[data-testid="rel-parent-label"]').innerText().catch(() => '');
    if (txt.includes('Entity2')) { found = true; break; }
    await page.click('[data-testid="editor-modal-close"]');
    await page.waitForTimeout(200);
  }
  check('두번째 관계 선택(부모=Entity2)', found);
  const parentLabel = await page.locator('[data-testid="rel-parent-label"]').innerText();
  check('부모 라벨에 "Entity2 · Car" 즉시 표시(드래그 시작이 서브타입 핸들)', parentLabel.includes('Entity2') && parentLabel.includes('Car'));
  check('부모 스코프는 FK 무관 — 자식(Entity3)에 FK 1개', await node(2).locator('[title="Foreign Key"]').count() === 1);

  const failed = results.filter(r => !r.pass);
  console.log(`\n총 ${results.length}개 중 ${results.length - failed.length} PASS / ${failed.length} FAIL`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_subtype_direct_connect_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
