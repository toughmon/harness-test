// 관계선 연결용 핸들(상하좌우 연결점) 크기 확대 검증 — 16×16px
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail++;
};

try {
  await page.goto(BASE + '/app', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(500);

  const node = page.locator('.react-flow__node').first();
  // 핸들은 hover 시 표시됨
  const nb = await node.boundingBox();
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await page.waitForTimeout(400);

  const handles = node.locator('.react-flow__handle');
  const count = await handles.count();
  check('핸들 8개(source/target × 상하좌우) 존재', count === 8, `${count}개`);

  // 4방향 핸들 CSS 크기 측정 — getComputedStyle은 캔버스 줌(transform scale) 영향 없음, 16px 기대
  const cssSize = (el) => {
    const s = getComputedStyle(el);
    return { w: parseFloat(s.width), h: parseFloat(s.height) };
  };
  for (const pos of ['top', 'right', 'bottom', 'left']) {
    const h = node.locator(`.react-flow__handle[data-handlepos="${pos}"]`).first();
    const sz = await h.evaluate(cssSize);
    const ok = Math.abs(sz.w - 16) <= 0.5 && Math.abs(sz.h - 16) <= 0.5;
    check(`${pos} 핸들 16×16 (CSS)`, ok, `${sz.w}×${sz.h}`);
  }

  // 이전(10px) 대비 확대 — 14px 이상이면 확대 성공
  const sample = await node.locator('.react-flow__handle[data-handlepos="right"]').first().evaluate(cssSize);
  check('이전(10px) 대비 확대됨(≥14px)', sample.w >= 14, `${sample.w}px`);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_handle_size.png' });

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
