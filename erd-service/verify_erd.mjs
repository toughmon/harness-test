import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

try {
  await page.goto('http://localhost:5173/app');
  await page.waitForTimeout(2000);

  // Add two entities
  await page.click('button:has-text("엔티티 추가")');
  await page.waitForTimeout(400);
  await page.click('button:has-text("엔티티 추가")');
  await page.waitForTimeout(800);

  const nodes = page.locator('.react-flow__node');
  const node1 = nodes.nth(0);
  const node2 = nodes.nth(1);
  const box1 = await node1.boundingBox();
  const box2 = await node2.boundingBox();
  console.log('Node1:', JSON.stringify(box1));
  console.log('Node2:', JSON.stringify(box2));

  // Find right handle of node1 (without type filter)
  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
  await page.waitForTimeout(300);

  const rightHandle = node1.locator('.react-flow__handle[data-handlepos="right"]').first();
  const rCount = await rightHandle.count();
  console.log('Right handle count:', rCount);

  if (rCount > 0) {
    const hb = await rightHandle.boundingBox();
    console.log('Right handle bbox:', JSON.stringify(hb));

    // Also find left handle of node2
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.waitForTimeout(200);
    const leftHandle2 = node2.locator('.react-flow__handle[data-handlepos="left"]').first();
    const lhb = await leftHandle2.boundingBox();
    console.log('Node2 left handle bbox:', JSON.stringify(lhb));

    // Hover back over node1 to show its handles
    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
    await page.waitForTimeout(300);

    // Start drag from right handle center
    const sx = hb.x + hb.width / 2;
    const sy = hb.y + hb.height / 2;
    const tx = lhb ? lhb.x + lhb.width / 2 : box2.x;
    const ty = lhb ? lhb.y + lhb.height / 2 : box2.y + box2.height / 2;
    console.log(`Dragging: (${sx.toFixed(0)}, ${sy.toFixed(0)}) → (${tx.toFixed(0)}, ${ty.toFixed(0)})`);

    await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_before_drag.png' });

    // Use Playwright dragAndDrop for more reliable simulation
    await page.mouse.move(sx, sy);
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.waitForTimeout(150);
    // Slow drag
    const steps = 30;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(
        sx + (tx - sx) * i / steps,
        sy + (ty - sy) * i / steps
      );
      await page.waitForTimeout(20);
    }
    await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_mid_drag.png' });
    await page.mouse.up();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_after_drag.png' });

    const modal = await page.locator('h3:has-text("관계 종류 선택")').count();
    console.log('Modal visible:', modal > 0);

    if (modal > 0) {
      await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_modal.png' });
      console.log('SUCCESS: modal appeared!');
      const btn = page.locator('button').filter({ hasText: '1:M' }).first();
      await btn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_rel_created.png' });
      const edgeCount = await page.locator('.react-flow__edge').count();
      console.log('Edges after creation:', edgeCount);
    } else {
      // Debug: check DOM events
      console.log('Modal did NOT appear — checking console errors');
      const edges = await page.locator('.react-flow__edge').count();
      console.log('Edge count:', edges);

      // Dump handle attributes for debug
      const allHandles = node1.locator('.react-flow__handle');
      for (let i = 0; i < await allHandles.count(); i++) {
        const h = allHandles.nth(i);
        const attrs = await h.evaluate(el => ({
          class: el.className,
          style: el.getAttribute('style'),
          pos: el.getAttribute('data-handlepos'),
          id: el.getAttribute('data-handleid'),
          type: el.getAttribute('data-handletype'),
          nodeid: el.getAttribute('data-nodeid'),
        }));
        console.log(`Handle[${i}]:`, JSON.stringify(attrs));
      }
    }
  }
} catch (e) {
  console.error('ERROR:', e.message, e.stack?.split('\n')[1]);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_error.png' });
} finally {
  await browser.close();
}
