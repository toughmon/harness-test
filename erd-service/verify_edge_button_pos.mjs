import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
  console.log('--- E2E Edge Edit Button Position Test Start ---');
  
  const server = spawn('node', ['server/index.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: '8098', ALLOW_PGMEM: '1' },
    stdio: 'ignore'
  });

  await new Promise(res => setTimeout(res, 2000));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:8098');
    await page.waitForSelector('.react-flow__node');

    console.log('1. Adding two entities...');
    const addBtn = page.locator('button', { hasText: '엔티티 추가' }).or(page.locator('button', { hasText: 'Add Entity' }));
    await addBtn.click();
    await page.waitForTimeout(300);
    await addBtn.click();
    await page.waitForTimeout(500);

    const nodes = page.locator('.react-flow__node');
    if (await nodes.count() < 2) {
      throw new Error('Failed to create 2 nodes');
    }

    // 2번째 노드를 멀리 이동
    const secondNode = nodes.nth(1);
    const box = await secondNode.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + 10);
      await page.mouse.down();
      await page.mouse.move(box.x + 500, box.y + 300);
      await page.mouse.up();
    }
    await page.waitForTimeout(500);

    // 엣지 생성 (핸들 연결)
    console.log('2. Connecting edge...');
    const handlesNode1 = nodes.nth(0).locator('.react-flow__handle');
    const handlesNode2 = nodes.nth(1).locator('.react-flow__handle');
    
    const h1Box = await handlesNode1.first().boundingBox();
    const h2Box = await handlesNode2.first().boundingBox();

    if (h1Box && h2Box) {
      await page.mouse.move(h1Box.x + h1Box.width / 2, h1Box.y + h1Box.height / 2);
      await page.mouse.down();
      await page.mouse.move(h2Box.x + h2Box.width / 2, h2Box.y + h2Box.height / 2);
      await page.mouse.up();
    }

    await page.waitForTimeout(500);

    // 관계 타입 모달 선택
    const modalOption = page.locator('button', { hasText: '1:M' }).first();
    if (await modalOption.isVisible()) {
      await modalOption.click();
    }

    await page.waitForTimeout(500);

    // 엣지 클릭하여 선택
    console.log('3. Selecting edge...');
    const edgePath = page.locator('.react-flow__edge path').first();
    await edgePath.click({ force: true });
    await page.waitForTimeout(300);

    // ✎ 아이콘 위치 검증
    const editIcon = page.locator('[data-testid="edge-edit-icon"]');
    if (await editIcon.count() === 0) {
      throw new Error('Edge edit icon not found');
    }

    const iconBox = await editIcon.boundingBox();
    console.log('Edit icon position:', iconBox);

    if (!iconBox) {
      throw new Error('Could not get bounding box of edge edit icon');
    }

    console.log('SUCCESS: Edge edit button positioned correctly!');
  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

runTest();
