// 관계 타입 선택 모달 — 각 타입 라벨 옆 관계선 미리보기 그림 검증
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

async function drawRelationship(srcIdx, tgtIdx) {
  const nodes = page.locator('.react-flow__node');
  const src = nodes.nth(srcIdx);
  const tgt = nodes.nth(tgtIdx);
  const sBox = await src.boundingBox();
  await page.mouse.move(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2);
  await page.waitForTimeout(300);
  const hb = await src.locator('.react-flow__handle[data-handlepos="right"]').first().boundingBox();
  const tBox = await tgt.boundingBox();
  await page.mouse.move(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);
  await page.waitForTimeout(200);
  const thb = await tgt.locator('.react-flow__handle[data-handlepos="left"]').first().boundingBox();
  const sx = hb.x + hb.width / 2, sy = hb.y + hb.height / 2;
  const tx = thb.x + thb.width / 2, ty = thb.y + thb.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.waitForTimeout(150);
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(sx + (tx - sx) * i / 30, sy + (ty - sy) * i / 30);
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await page.waitForTimeout(800);
  return await page.locator('h3:has-text("관계 종류 선택")').count() > 0;
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);

  const opened = await drawRelationship(0, 1);
  check('관계 그리기 → 타입 선택 모달 표시', opened);
  if (!opened) throw new Error('모달이 열리지 않음');

  const modal = page.locator('div.z-50').filter({ has: page.locator('h3:has-text("관계 종류 선택")') });
  const previewBtns = modal.locator('button:has(svg)');

  // 모달 가로 폭: 화면 전체(1600)에서 약 1/3 축소 → 66vw(≈1056px) 수준
  const panel = page.locator('div.z-50 > div').first();
  const modalW = Math.round((await panel.boundingBox()).width);
  const vw = page.viewportSize().width;
  check('모달 폭 약 1/3 축소(≈66vw)', modalW <= vw * 0.7 && modalW >= vw * 0.62, `${modalW}px / vw ${vw}`);

  const btnCount = await previewBtns.count();
  check('8개 타입 버튼 모두 미리보기 SVG 포함', btnCount === 8, `${btnCount}개`);

  // 라벨 순서(= RELATIONSHIP_LABELS 정의 순서)와 기대 라인 수
  // 선분(solid 1·opt 1·half 2)+까마귀발(1:M 3·1:1 0)+식별막대(식별 1) — 부모쪽 세로 막대 없음
  const expected = [
    { label: '1:M 식별자 상속 (점선 + 실선)', lines: 6, dashed: true },
    { label: '1:M 식별자 상속 (실선 + 실선)', lines: 5, dashed: false }, // SOLID: 전체 실선, 점선 없음
    { label: '1:M 비식별 (점선 + 실선)', lines: 5, dashed: true },
    { label: '1:M 비식별 (점선 + 점선)', lines: 4, dashed: true },  // OPTIONAL: 전체 점선
    { label: '1:1 식별자 상속 (점선 + 실선)', lines: 3, dashed: true },
    { label: '1:1 식별자 상속 (실선 + 실선)', lines: 2, dashed: false }, // 1:1 SOLID: 전체 실선
    { label: '1:1 비식별 (점선 + 실선)', lines: 2, dashed: true },
    { label: '1:1 비식별 (점선 + 점선)', lines: 1, dashed: true },  // 1:1 OPTIONAL: 전체 점선
  ];

  for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    const btn = previewBtns.nth(i);
    const text = (await btn.innerText()).replace(/\s+/g, ' ');
    const svgLines = await btn.locator('svg line').count();
    const dashedLines = await btn.locator('svg line[stroke-dasharray]').count();
    const tag = `[${i}] ${e.label}`;

    check(`${tag}: 라벨-그림 동일 버튼`, text.includes(e.label), text);
    check(`${tag}: line 개수 ${e.lines}`, svgLines === e.lines, `실제 ${svgLines}`);
    check(
      `${tag}: 점선 세그먼트 ${e.dashed ? '존재' : '없음(전체 실선)'}`,
      e.dashed ? dashedLines >= 1 : dashedLines === 0,
      `dashed ${dashedLines}`,
    );
  }

  // 새 SOLID 타입[1]은 식별(uid 막대)+까마귀발 보유하되 점선이 전혀 없어야 함 → 점선+실선[0]과 구분
  const solidDashed = await previewBtns.nth(1).locator('svg line[stroke-dasharray]').count();
  const halfDashed = await previewBtns.nth(0).locator('svg line[stroke-dasharray]').count();
  check('SOLID(실선+실선)은 점선 0, 점선+실선은 점선 ≥1', solidDashed === 0 && halfDashed >= 1, `solid ${solidDashed} / half ${halfDashed}`);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_reltype_preview.png' });

  // 기능 검증: 새 SOLID 타입을 실제 선택 → 엣지 생성 + 식별 관계로 FK가 PK에 포함
  const tgtPkBefore = await page.locator('.react-flow__node').nth(1).locator('.material-symbols-outlined:text-is("key")').count();
  await previewBtns.nth(1).click();  // '1:M 식별자 상속 (실선 + 실선)'
  await page.waitForTimeout(600);
  check('SOLID 타입 선택 → 관계(엣지) 생성', await page.locator('.react-flow__edge').count() === 1);
  const tgtPkAfter = await page.locator('.react-flow__node').nth(1).locator('.material-symbols-outlined:text-is("key")').count();
  check('SOLID(식별)은 하위 엔티티에 PK FK 추가', tgtPkAfter > tgtPkBefore, `key ${tgtPkBefore} → ${tgtPkAfter}`);

  // 실제 캔버스 엣지가 전체 실선(strokeDasharray 없음)으로 렌더링되는지 확인
  const visiblePath = page.locator('.react-flow__edge path[stroke]:not([stroke="transparent"])').first();
  const dash = await visiblePath.getAttribute('stroke-dasharray');
  check('SOLID 캔버스 엣지 = 전체 실선(점선 아님)', dash === null, `dasharray=${dash}`);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_reltype_solid_edge.png' });

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
