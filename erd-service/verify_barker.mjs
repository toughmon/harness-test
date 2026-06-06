import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

async function drawRelationship(relButtonText) {
  const nodes = page.locator('.react-flow__node');
  const node1 = nodes.nth(0);
  const node2 = nodes.nth(1);
  const box1 = await node1.boundingBox();
  const box2 = await node2.boundingBox();

  // same pattern as verify_erd.mjs: node1 right handle → node2 left handle
  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
  await page.waitForTimeout(300);
  const srcHandle = node1.locator('.react-flow__handle[data-handlepos="right"]').first();
  const hb = await srcHandle.boundingBox();

  await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await page.waitForTimeout(200);
  const tgtHandle = node2.locator('.react-flow__handle[data-handlepos="left"]').first();
  const thb = await tgtHandle.boundingBox();

  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
  await page.waitForTimeout(300);

  const sx = hb.x + hb.width / 2, sy = hb.y + hb.height / 2;
  const tx = thb.x + thb.width / 2, ty = thb.y + thb.height / 2;
  await page.mouse.move(sx, sy);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(150);
  const steps = 30;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(sx + (tx - sx) * i / steps, sy + (ty - sy) * i / steps);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(1000);

  const modal = await page.locator('h3:has-text("관계 종류 선택")').count();
  if (!modal) { console.log('FAIL: modal not shown'); return false; }
  await page.locator('button').filter({ hasText: relButtonText }).first().click();
  await page.waitForTimeout(600);
  return true;
}

async function inspectEdge(idx) {
  return page.locator('.react-flow__edge').nth(idx).evaluate(g => {
    const paths = [...g.querySelectorAll('path')].filter(p => p.getAttribute('stroke') !== 'transparent');
    return paths.map(p => ({
      dasharray: p.getAttribute('stroke-dasharray'),
      pathLength: p.getAttribute('pathLength'),
      stroke: p.getAttribute('stroke'),
    }));
  });
}

try {
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1500);

  await page.click('button:has-text("엔티티 추가")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("엔티티 추가")');
  await page.waitForTimeout(600);

  // Test 1: 1:M 상속+식별자 (half-dashed + uid bar)
  const ok1 = await drawRelationship('1:M 상속+식별자');
  console.log('Rel 1 created:', ok1);
  console.log('Edge[0] visible paths:', JSON.stringify(await inspectEdge(0), null, 1));
  // 드래그 시작 = Entity1 = 부모 → FK는 Entity2(자식)에 생겨야 함
  const n1Text = await page.locator('.react-flow__node').nth(0).innerText();
  const n2Text = await page.locator('.react-flow__node').nth(1).innerText();
  console.log('Entity1 has FK:', n1Text.includes('_id'), '| Entity2 has FK:', n2Text.includes('_id'));
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_barker_identifying.png' });

  // delete edge 1 to test optional cleanly: click edge then delete button
  // (instead, just add another relationship between same nodes)
  const ok2 = await drawRelationship('1:M 비상속+비식별');
  console.log('Rel 2 created:', ok2);
  const edgeCount = await page.locator('.react-flow__edge').count();
  console.log('Total edges:', edgeCount);
  if (edgeCount >= 2) {
    console.log('Edge[1] visible paths:', JSON.stringify(await inspectEdge(1), null, 1));
  }
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_barker_both.png' });
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_barker_error.png' });
} finally {
  await browser.close();
}
