// 엔티티 추가 위치 검증 — 기존 엔티티를 캔버스 멀리로 옮긴 뒤 새 엔티티를 추가해도
// 새 엔티티가 그 근처에 생성되는지 확인 (고정 원점이 아니라 기존 엔티티 바운딩박스 기준 배치).
// 화면 픽셀은 React Flow 줌 레벨에 따라 달라지므로, viewport의 transform(scale)을 읽어
// 화면좌표를 flow 좌표로 환산해 비교한다.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5180';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
};

await page.goto(BASE + '/app', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

const addEntityBtn = page.locator('button').filter({ hasText: 'Add Entity' }).first();
const nodes = page.locator('.react-flow__node');
const center = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
async function currentZoom() {
  const style = await page.locator('.react-flow__viewport').getAttribute('style');
  const m = style.match(/scale\(([\d.]+)\)/);
  return m ? parseFloat(m[1]) : 1;
}

// 1. 첫 엔티티 생성
await addEntityBtn.click();
await page.waitForTimeout(300);
check('첫 엔티티 생성됨', await nodes.count() === 1);
const originalBox = await nodes.first().boundingBox();

// 2. 헤더를 드래그해 화면 멀리(오른쪽 아래)로 크게 이동 — 이름 편집(더블클릭)이 아닌 단일 드래그.
//    grid 한 칸(260px flow) 보다 훨씬 큰 거리를 옮겨서, "새 엔티티가 원래 고정 그리드로
//    돌아가는 버그"와 "이동한 위치 근처에 붙는 정상 동작"이 뚜렷이 구분되게 한다.
const header = nodes.first().locator('.bg-node-header').first();
const hBox = await header.boundingBox();
const sx = hBox.x + hBox.width - 10;
const sy = hBox.y + hBox.height / 2;
const dx = 2500, dy = 1500;
await page.mouse.move(sx, sy);
await page.mouse.down();
await page.waitForTimeout(100);
const steps = 30;
for (let i = 1; i <= steps; i++) {
  await page.mouse.move(sx + dx * i / steps, sy + dy * i / steps);
  await page.waitForTimeout(10);
}
await page.mouse.up();
await page.waitForTimeout(400);

const zoom1 = await currentZoom();
const draggedBox = await nodes.first().boundingBox();
const movedFlow = dist(center(originalBox), center(draggedBox)) / zoom1;
check('드래그로 엔티티가 멀리 이동함(전제조건)', movedFlow > 500, `moved=${movedFlow.toFixed(0)}flow (zoom=${zoom1})`);

// 3. 두 번째 엔티티 추가 → 이동한 첫 엔티티 근처에 생성되는지 확인
await addEntityBtn.click();
await page.waitForTimeout(300);
check('엔티티 2개로 증가함', await nodes.count() === 2);

const zoom2 = await currentZoom();
const box0 = await nodes.nth(0).boundingBox();
const box1 = await nodes.nth(1).boundingBox();
const gapFlow = dist(center(box0), center(box1)) / zoom2;
// 그리드 한 칸(260px flow)보다는 크지만, 드래그 거리(~2900flow)에는 한참 못 미치는 값.
// 고정 원점 버그였다면 새 엔티티가 원래 자리 근처에 남아 gap이 드래그 거리에 근접했을 것.
const margin = 600;
check(
  '새 엔티티가 이동한 엔티티 근처에 생성됨(고정 원점으로 돌아가지 않음)',
  gapFlow < margin,
  `gap=${gapFlow.toFixed(0)}flow (margin=${margin}, dragged=${movedFlow.toFixed(0)}flow)`
);

// 시각 확인용 — Fit View로 두 엔티티가 근처에 있는 모습을 한 화면에 캡처
await page.locator('button[title="Fit View"]').click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'ss_entity_position.png' });

// 4. Undo로 두 번째 엔티티 제거 확인(회귀 방지용 최소 확인)
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
check('Undo로 두 번째 엔티티 제거됨', await nodes.count() === 1);

await browser.close();

const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`\n총 ${results.length}항목: PASS ${passed} / FAIL ${failed}`);
if (failed > 0) process.exit(1);
