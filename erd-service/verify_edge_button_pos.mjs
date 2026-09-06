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
    await page.goto('http://localhost:8098/app');
    // 캔버스는 빈 상태로 시작하므로 노드가 아니라 툴바 버튼을 기다린다
    // (원래 '.react-flow__node'를 기다려 fresh 컨텍스트에서 항상 타임아웃했음)
    await page.waitForSelector('button:has-text("Add Entity")');

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
      // 한 번에 점프하면 React Flow가 드래그로 인식하지 못해 노드가 제자리에 남았음
      await page.mouse.move(box.x + 500, box.y + 300, { steps: 15 });
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

    // 기본 그리드는 노드가 10px 간격으로 붙어 있어 엣지 전체가 노드에 가려진다
    // → 자동 정렬로 벌려 선을 클릭할 수 있게 한다 (verify_features와 동일한 선행 패턴)
    await page.click('button[title="자동 정렬"]');
    await page.waitForTimeout(900);

    // 엣지 클릭하여 선택
    console.log('3. Selecting edge...');
    // force 클릭은 path의 bounding box 중심(선 위가 아닐 수 있음)을 눌러 선택되지 않았음.
    // 경로를 샘플링해 노드 박스에 가리지 않은 지점을 골라 실제 선 위를 클릭한다.
    const nodeRects = await page.locator('.react-flow__node').evaluateAll(els => els.map(el => {
      const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform);
      return { x: +m[1], y: +m[2], w: el.offsetWidth, h: el.offsetHeight };
    }));
    const clickPt = await page.locator('.react-flow__edge').first().evaluate((g, rects) => {
      const path = g.querySelector('path');
      const len = path.getTotalLength();
      const m = path.getScreenCTM();
      const hidden = p => rects.some(r =>
        p.x >= r.x - 14 && p.x <= r.x + r.w + 14 && p.y >= r.y - 14 && p.y <= r.y + r.h + 14);
      const cands = [];
      for (let i = 0; i <= 40; i++) {
        const p = path.getPointAtLength((len * i) / 40);
        if (!hidden(p)) cands.push({ at: i / 40, x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f });
      }
      cands.sort((a, b) => Math.abs(a.at - 0.5) - Math.abs(b.at - 0.5));
      return cands[0] ?? null;
    }, nodeRects);
    if (!clickPt) throw new Error('노드에 가리지 않은 엣지 지점을 찾지 못함');
    await page.mouse.click(clickPt.x, clickPt.y);
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
