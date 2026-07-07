// 논리명(한글)/물리명 동시 표시 + Description 필드 검증
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

async function drawRelationship(srcIdx, tgtIdx, relButtonText) {
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
  if (!await page.locator('h3:has-text("관계 종류 선택")').count()) return false;
  await page.locator('button').filter({ hasText: relButtonText }).first().click();
  await page.waitForTimeout(500);
  return true;
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // 엔티티 2개 추가
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);

  // Entity1 선택(사이드바) → 편집 모달은 캔버스 노드의 info 아이콘으로 오픈 → 물리명/논리명/설명 입력
  await page.locator('aside').first().locator('button', { hasText: 'Entity1' }).click();
  await page.waitForTimeout(400);
  await page.locator('.react-flow__node').nth(0).locator('[data-testid="entity-info-icon"]').click();
  await page.waitForTimeout(300);
  const panel = page.locator('[data-testid="entity-editor-modal"]');
  const inputs = panel.locator('input[type="text"]');
  await inputs.nth(0).fill('users');            // 물리명
  await inputs.nth(1).fill('사용자');            // 논리명
  await panel.locator('textarea').fill('서비스 가입 사용자 정보');
  await page.waitForTimeout(400);

  // 컬럼(id) 논리명 입력: 컬럼 행 클릭해 확장
  await panel.locator('.font-mono', { hasText: /^id$/ }).first().click();
  await page.waitForTimeout(300);
  await panel.locator('input[placeholder="논리명 (한글 명칭)"]').fill('아이디');
  await page.waitForTimeout(400);

  // 노드에 물리/논리 동시 표시 확인
  const n1Text = await page.locator('.react-flow__node').nth(0).innerText();
  console.log('node shows physical+logical:',
    n1Text.includes('users'), n1Text.includes('사용자'), n1Text.includes('아이디'));

  // 사이드바에도 표시 확인
  const sbText = await page.locator('aside').first().innerText();
  console.log('sidebar shows logical:', sbText.includes('사용자'));

  // 모달 닫기 + 빈 곳 클릭 + fit (모달이 열려 있으면 툴바가 가려져 클릭 불가)
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);
  await page.mouse.click(700, 750);
  await page.waitForTimeout(300);
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(500);

  // 식별 관계 → FK 자동 생성. 컬럼명/논리명은 상위 PK명 그대로(엔티티명 접두사 없음)
  const ok = await drawRelationship(0, 1, '1:M 식별자 상속 (점선 + 실선)');
  console.log('relationship created:', ok);
  const n2Text = await page.locator('.react-flow__node').nth(1).innerText();
  console.log(
    'FK physical 접두사 제거(users_id 아님):', !n2Text.includes('users_id'),
    '| FK logical 접두사 제거(아이디 표시 & "사용자 아이디" 아님):',
    n2Text.includes('아이디') && !n2Text.includes('사용자 아이디'),
  );

  // 재선택 시 입력값 유지 확인 (Description 포함)
  await page.locator('.react-flow__node').nth(0).locator('[data-testid="entity-info-icon"]').click();
  await page.waitForTimeout(400);
  const descVal = await panel.locator('textarea').inputValue();
  const logicalVal = await panel.locator('input[type="text"]').nth(1).inputValue();
  console.log('persisted — logical:', logicalVal, '| description:', descVal);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_logical.png' });
  console.log('DONE');
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_logical_error.png' });
} finally {
  await browser.close();
}
