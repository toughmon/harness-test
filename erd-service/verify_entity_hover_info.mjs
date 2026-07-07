// 엔터티 info 아이콘 호버 미리보기 — 캔버스 노드에도 이미 보이는 정보(컬럼/서브타입) 재탕이 아니라
// FK가 실제로 가리키는 대상(→ entity.column)과 이 엔티티에 연결된 관계 요약(부모/자식·카디널리티/식별
// 여부)이 추가로 노출되는지 확인한다.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
};

async function dragRelationship(srcIdx, tgtIdx, relButtonText) {
  const nodes = page.locator('.react-flow__node');
  const src = nodes.nth(srcIdx);
  const tgt = nodes.nth(tgtIdx);
  const sBox = await src.boundingBox();
  await page.mouse.move(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2);
  await page.waitForTimeout(200);
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
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(sx + (tx - sx) * i / 20, sy + (ty - sy) * i / 20);
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
  if (!await page.locator('h3:has-text("관계 종류 선택")').count()) return false;
  await page.locator('button').filter({ hasText: relButtonText }).first().click();
  await page.waitForTimeout(500);
  return true;
}

async function hoverInfoIcon(nodeIdx) {
  await page.mouse.move(50, 50);
  await page.waitForTimeout(200);
  const icon = page.locator('.react-flow__node').nth(nodeIdx).locator('[data-testid="entity-info-icon"]');
  const box = await icon.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);

  const created = await dragRelationship(0, 1, '1:M 식별자 상속 (점선 + 실선)');
  check('부모(Entity1) → 자식(Entity2) 식별 관계 생성', created);

  await page.click('[title="Fit View"]');
  await page.waitForTimeout(500);

  // 자식(FK 보유) 쪽 미리보기
  await hoverInfoIcon(1);
  const childPreview = page.locator('[data-testid="entity-hover-preview"]');
  check('자식 엔터티 호버 → 미리보기 표시', await childPreview.count() === 1);
  const childText = await childPreview.innerText();
  check('FK 컬럼에 참조 대상(→ Entity1.id) 노출', /→\s*Entity1\.id/.test(childText), childText);
  check('관계 요약에 "부모" 배지 + 상대 엔터티명 노출', childText.includes('부모') && childText.includes('Entity1'));
  check('관계 요약에 카디널리티/식별 라벨 노출', childText.includes('1:M 식별'));
  check('data-testid="fk-target" 요소 존재', await childPreview.locator('[data-testid="fk-target"]').count() === 1);

  // 부모(FK 없음) 쪽 미리보기
  await hoverInfoIcon(0);
  const parentPreview = page.locator('[data-testid="entity-hover-preview"]');
  const parentText = await parentPreview.innerText();
  check('부모 엔터티는 FK 컬럼이 없어 참조 대상 라인 미노출', await parentPreview.locator('[data-testid="fk-target"]').count() === 0, parentText);
  check('관계 요약에 "자식" 배지 + 상대 엔터티명 노출', parentText.includes('자식') && parentText.includes('Entity2'));

  // 관계 없는 엔터티는 "연결된 관계 없음" 표기
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('[title="Fit View"]');
  await page.waitForTimeout(400);
  await hoverInfoIcon(2);
  const soloText = await page.locator('[data-testid="entity-hover-preview"]').innerText();
  check('관계 없는 엔터티는 "연결된 관계 없음" 표기', soloText.includes('연결된 관계 없음'), soloText);

} catch (e) {
  check('스크립트 실행 중 예외 없음', false, e.message);
} finally {
  const fails = results.filter(r => !r.pass).length;
  console.log(`\n총 ${results.length}개 중 ${results.length - fails} PASS / ${fails} FAIL`);
  await browser.close();
  process.exit(fails > 0 ? 1 : 0);
}
