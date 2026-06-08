// 좌측 사이드바 접기/펼치기(토글) 기능 검증
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
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

const sidebar = () => page.locator('[data-testid="sidebar"]');
const width = async () => (await sidebar().boundingBox()).width;

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 1. 초기 상태: 펼쳐진 사이드바 (280px), 토글 버튼 존재
  check('초기 사이드바 펼침(collapsed=false)', await sidebar().getAttribute('data-collapsed') === 'false');
  const expandedWidth = await width();
  check('펼친 폭 ≈ 280px', expandedWidth >= 270 && expandedWidth <= 290);
  check('토글 버튼 존재', await page.locator('[data-testid="sidebar-toggle"]').count() === 1);
  check('펼친 상태에 Project Schema 헤더 표시', await sidebar().locator('text=Project Schema').count() === 1);
  check('펼친 상태에 Entity List 표시', await sidebar().locator('text=Entity List').count() === 1);

  // 2. 캔버스 폭 기록 (접기 전)
  const canvasBefore = (await page.locator('.react-flow').boundingBox()).width;

  // 3. 접기
  await page.click('[data-testid="sidebar-toggle"]');
  await page.waitForTimeout(400);
  check('접은 후 collapsed=true', await sidebar().getAttribute('data-collapsed') === 'true');
  const collapsedWidth = await width();
  check('접은 폭이 펼친 폭보다 작음', collapsedWidth < expandedWidth);
  check('접은 폭 ≤ 60px(레일)', collapsedWidth <= 60);
  check('접은 상태엔 Project Schema 헤더 숨김', await sidebar().locator('text=Project Schema').count() === 0);
  check('접은 상태에도 토글(펼치기) 버튼 존재', await page.locator('[data-testid="sidebar-toggle"]').count() === 1);

  // 4. 캔버스가 넓어졌는지 확인 (핵심 요구사항)
  const canvasAfter = (await page.locator('.react-flow').boundingBox()).width;
  check('접으면 캔버스 영역이 넓어짐', canvasAfter > canvasBefore);

  // 5. 접은 레일에서 Add Entity 단축 동작
  const beforeAdd = await page.locator('[data-testid="sidebar"] button').count();
  await page.locator('[data-testid="sidebar"] button[aria-label="Add Entity"]').click();
  await page.waitForTimeout(300);
  check('접은 레일의 Add Entity 동작(엔티티 추가됨)', await page.locator('.react-flow__node').count() >= 1);

  // 6. 다시 펼치기 → 원래 폭 복귀 + 방금 추가한 엔티티가 목록에 보임
  await page.click('[data-testid="sidebar-toggle"]');
  await page.waitForTimeout(400);
  check('다시 펼침(collapsed=false)', await sidebar().getAttribute('data-collapsed') === 'false');
  check('펼친 폭 복귀 ≈ 280px', Math.abs((await width()) - expandedWidth) < 5);
  check('Entity List 다시 표시', await sidebar().locator('text=Entity List').count() === 1);
  void beforeAdd;

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_sidebar_toggle_expanded.png' });
  await page.click('[data-testid="sidebar-toggle"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_sidebar_toggle_collapsed.png' });

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
