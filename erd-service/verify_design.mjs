// YourERD 디자인 적용 후 기능 동작 + 시각 검증
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });

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
  if (!modal) { console.log(`FAIL: modal not shown for ${srcIdx}->${tgtIdx}`); return false; }
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_design_modal.png' });
  await page.locator('button').filter({ hasText: relButtonText }).first().click();
  await page.waitForTimeout(500);
  return true;
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // 초기 화면 (빈 캔버스 + 레이아웃)
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_design_empty.png' });

  // 레이아웃 요소 확인
  const checks = {
    topbarBrand: await page.locator('text=YourERD').count(),
    sidebarAddEntity: await page.locator('button:has-text("Add Entity")').count(),
    propertiesHeader: await page.locator('h3:has-text("Properties")').count(),
    saveButton: await page.locator('button:has-text("Save")').count(),
  };
  console.log('layout checks:', JSON.stringify(checks));

  // 사이드바 Add Entity로 엔티티 3개 추가
  for (let i = 0; i < 3; i++) {
    await page.click('button:has-text("Add Entity")');
    await page.waitForTimeout(300);
  }

  // 사이드바 Entity List에 표시되는지
  const listCount = await page.locator('aside').first().locator('button:has-text("Entity")').count();
  console.log('sidebar entity list items:', listCount);

  // 빈 곳 클릭으로 선택 해제 + fit view
  await page.mouse.click(700, 750);
  await page.waitForTimeout(300);
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(600);

  // 관계 2개: E1→E2 식별(FK 자동 추가), E1→E3 비식별
  const ok1 = await drawRelationship(0, 1, '1:M 상속+식별자');
  const ok2 = await drawRelationship(0, 2, '1:M 비상속+비식별');
  console.log('relationships:', ok1, ok2);

  // 엔티티 클릭 → Properties 패널 동작 확인
  await page.locator('.react-flow__node').nth(1).click();
  await page.waitForTimeout(500);
  const tableNameVal = await page.locator('aside input[type="text"]').first().inputValue();
  console.log('properties shows table name:', tableNameVal);

  // FK 자동 추가 확인 (식별 관계 → Entity2에 FK)
  const n2Text = await page.locator('.react-flow__node').nth(1).innerText();
  console.log('Entity2 has FK column:', n2Text.includes('_id'));

  // 줌 툴바 동작 확인
  const zoomBefore = await page.locator('.glass-toolbar span.font-mono').innerText();
  await page.click('button[title="Zoom In"]');
  await page.waitForTimeout(400);
  const zoomAfter = await page.locator('.glass-toolbar span.font-mono').innerText();
  console.log('zoom toolbar:', zoomBefore, '->', zoomAfter);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_design_final.png' });
  console.log('DONE');
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_design_error.png' });
} finally {
  await browser.close();
}
