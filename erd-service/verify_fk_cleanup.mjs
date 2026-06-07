// 상위 엔티티/식별 관계 삭제 시 하위 FK 컬럼 자동 제거 검증
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });

let fail = 0;
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) fail++;
}

async function drawRelationship(srcIdx, tgtIdx, relButtonText) {
  const nodes = page.locator('.react-flow__node');
  const src = nodes.nth(srcIdx);
  const tgt = nodes.nth(tgtIdx);
  const sBox = await src.boundingBox();

  await page.mouse.move(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2);
  await page.waitForTimeout(300);
  const srcHandle = src.locator('.react-flow__handle[data-handlepos="right"]').first();
  const hb = await srcHandle.boundingBox();

  const tBox = await tgt.boundingBox();
  await page.mouse.move(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);
  await page.waitForTimeout(200);
  const tgtHandle = tgt.locator('.react-flow__handle[data-handlepos="left"]').first();
  const thb = await tgtHandle.boundingBox();

  const sx = hb.x + hb.width / 2, sy = hb.y + hb.height / 2;
  const tx = thb.x + thb.width / 2, ty = thb.y + thb.height / 2;
  await page.mouse.move(sx, sy);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(150);
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(sx + (tx - sx) * i / 30, sy + (ty - sy) * i / 30);
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await page.waitForTimeout(800);

  const modal = await page.locator('h3:has-text("관계 종류 선택")').count();
  if (!modal) { console.log(`FAIL: modal not shown`); return false; }
  await page.locator('button').filter({ hasText: relButtonText }).first().click();
  await page.waitForTimeout(500);
  return true;
}

const childText = () => page.locator('.react-flow__node').last().innerText();
const nodeCount = () => page.locator('.react-flow__node').count();
const edgeCount = () => page.locator('.react-flow__edge').count();

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 준비: 엔티티 2개 + 식별 관계 (FK 자동 생성)
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.mouse.click(700, 750); // 선택 해제
  await page.waitForTimeout(300);
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(600);

  const ok = await drawRelationship(0, 1, '1:M 상속+식별자');
  check('식별 관계 생성', ok && (await edgeCount()) === 1);
  check('하위 엔티티에 FK 생성', (await childText()).includes('entity1_id'));

  // ── 시나리오 1: 상위 엔티티 삭제 → 하위 FK 제거 ──
  const parent = page.locator('.react-flow__node').first();
  const pb = await parent.boundingBox();
  await page.mouse.click(pb.x + pb.width / 2, pb.y + 20); // 헤더 클릭 → 선택
  await page.waitForTimeout(400);
  await page.click('button[title="엔티티 삭제"]');
  await page.waitForTimeout(400);
  await page.click('[data-testid="dialog-ok"]'); // 확인 모달 → 삭제
  await page.waitForTimeout(500);

  check('상위 삭제 → 노드 1개', (await nodeCount()) === 1);
  check('상위 삭제 → 관계선 제거', (await edgeCount()) === 0);
  check('상위 삭제 → 하위 FK 컬럼 제거', !(await childText()).includes('entity1_id'));

  // ── 시나리오 2: Undo → 전부 복원 ──
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  check('Undo → 노드 2개 복원', (await nodeCount()) === 2);
  check('Undo → 관계선 복원', (await edgeCount()) === 1);
  check('Undo → FK 복원', (await childText()).includes('entity1_id'));

  // ── 시나리오 3: 식별 관계선 삭제 → 하위 FK 제거 (엔티티는 유지) ──
  await page.locator('.react-flow__edge').first().click({ force: true });
  await page.waitForTimeout(400);
  await page.click('button[title="관계 삭제"]');
  await page.waitForTimeout(500);
  check('관계 삭제 → 관계선 제거', (await edgeCount()) === 0);
  check('관계 삭제 → 노드 2개 유지', (await nodeCount()) === 2);
  check('관계 삭제 → 하위 FK 컬럼 제거', !(await childText()).includes('entity1_id'));

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_fk_cleanup.png' });

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_fk_cleanup_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
