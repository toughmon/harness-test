// 한 엔티티에서 여러 관계가 같은 면으로 나갈 때 연결점이 분산되는지 검증
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });
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

  await page.mouse.move(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2);
  await page.waitForTimeout(200);

  const sx = hb.x + hb.width / 2, sy = hb.y + hb.height / 2;
  const tx = thb.x + thb.width / 2, ty = thb.y + thb.height / 2;

  await page.mouse.move(sx, sy);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(150);
  const steps = 30;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(sx + (tx - sx) * i / steps, sy + (ty - sy) * i / steps);
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await page.waitForTimeout(800);

  const modal = await page.locator('h3:has-text("관계 종류 선택")').count();
  if (!modal) { console.log(`FAIL: modal not shown for ${srcIdx}->${tgtIdx}`); return false; }
  await page.locator('button').filter({ hasText: relButtonText }).first().click();
  await page.waitForTimeout(500);
  return true;
}

// 각 엣지의 보이는 path에서 시작점(M x y)을 추출
async function edgeStartPoints() {
  return page.evaluate(() => {
    const edges = [...document.querySelectorAll('.react-flow__edge')];
    return edges.map(g => {
      const p = [...g.querySelectorAll('path')].find(p => p.getAttribute('stroke') !== 'transparent');
      const d = p?.getAttribute('d') ?? '';
      const m = d.match(/M\s*([\d.eE+-]+)[ ,]([\d.eE+-]+)/);
      return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
    });
  });
}

try {
  await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // 엔티티 4개: E1(80,80) E2(340,80) E3(600,80) E4(860,80) — 모두 E1의 오른쪽
  for (let i = 0; i < 4; i++) {
    await page.click('button:has-text("엔티티 추가")');
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);

  // 편집 패널 닫기(빈 캔버스 클릭) + 전체가 보이도록 fitView
  await page.mouse.click(400, 750);
  await page.waitForTimeout(300);
  await page.click('.react-flow__controls-fitview');
  await page.waitForTimeout(600);

  // E1 → E2, E3, E4 : 세 관계 모두 E1의 오른쪽 면에서 출발
  const ok1 = await drawRelationship(0, 1, '1:M 비상속+비식별');
  const ok2 = await drawRelationship(0, 2, '1:M 비상속+비식별');
  const ok3 = await drawRelationship(0, 3, '1:M 비상속+비식별');
  console.log('relationships created:', ok1, ok2, ok3);

  const edgeCount = await page.locator('.react-flow__edge').count();
  console.log('edge count:', edgeCount);

  const starts = await edgeStartPoints();
  console.log('edge start points:', JSON.stringify(starts));

  // 시작점이 서로 5px 이상 떨어져 있어야 함 (이전에는 전부 동일 좌표)
  let pass = starts.length === 3 && starts.every(Boolean);
  if (pass) {
    for (let i = 0; i < starts.length; i++) {
      for (let j = i + 1; j < starts.length; j++) {
        const d = Math.hypot(starts[i].x - starts[j].x, starts[i].y - starts[j].y);
        console.log(`dist edge${i}-edge${j}: ${d.toFixed(1)}px`);
        if (d < 5) pass = false;
      }
    }
  }
  console.log(pass ? 'PASS: 시작점이 분산됨 (겹침 없음)' : 'FAIL: 시작점이 겹침');

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_fanout.png' });
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_fanout_error.png' });
} finally {
  await browser.close();
}
