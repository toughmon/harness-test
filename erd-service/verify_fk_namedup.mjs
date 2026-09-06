// FK 이름 충돌 처리 검증: 상위 PK와 하위 PK 이름이 같을 때 관계 생성
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });

let fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail++;
}

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

const nodeCount = () => page.locator('.react-flow__node').count();
const edgeCount = () => page.locator('.react-flow__edge').count();
const childPkIcons = () => page.locator('.react-flow__node').last().locator('[title="Primary Key"]').count();
const childFkIcons = () => page.locator('.react-flow__node').last().locator('[title="Foreign Key"]').count();
// 노드 텍스트 전체 (컬럼명 포함)
const childText = () => page.locator('.react-flow__node').last().innerText();

try {
  // ── 시나리오 1: 식별 상속 — 하위 id(PK)가 상위 id(PK)와 이름 충돌 ──
  await page.goto(BASE + '/app', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  await page.click('button:has-text("Add Entity")'); // Entity1 (상위)
  await page.waitForTimeout(300);
  await page.click('button:has-text("Add Entity")'); // Entity2 (하위) — 선택됨
  await page.waitForTimeout(300);
  await page.mouse.click(700, 750);
  await page.waitForTimeout(200);
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(600);

  // 초기: Entity1·Entity2 모두 PK=id 1개
  check('초기 Entity2 PK 1개', (await childPkIcons()) === 1);
  check('초기 Entity2 FK 없음', (await childFkIcons()) === 0);

  const ok1 = await drawRelationship(0, 1, '1:M 식별자 상속 (점선 + 실선)');
  check('식별 관계 생성', ok1 && (await edgeCount()) === 1);

  // 식별 상속: 기존 id PK 제거 → FK+PK로 교체 → PK 아이콘 1개(FK겸PK), FK 아이콘 1개
  const pkAfterIdent = await childPkIcons();
  const fkAfterIdent = await childFkIcons();
  check('식별 상속 후 PK 아이콘 1개 (FK겸PK)', pkAfterIdent === 1, `pkIcons=${pkAfterIdent}`);
  check('식별 상속 후 FK 아이콘 1개', fkAfterIdent === 1, `fkIcons=${fkAfterIdent}`);

  // id 컬럼이 중복되지 않아야 함 (id 텍스트가 딱 1번만 등장)
  const txt1 = await childText();
  const idCount = txt1.split('\n').filter(l => l.trim() === 'id').length;
  check('id 컬럼 중복 없음 (1개)', idCount === 1, `idCount=${idCount}`);

  // ── Undo ──
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  check('Undo → 관계선 제거', (await edgeCount()) === 0);
  check('Undo → Entity2 원래 PK 복원', (await childPkIcons()) === 1);
  check('Undo → Entity2 FK 제거', (await childFkIcons()) === 0);

  // ── 시나리오 2: 비식별 관계 — 하위 id(PK)가 상위 id(PK)와 이름 충돌 ──
  const ok2 = await drawRelationship(0, 1, '1:M 비식별 (점선 + 실선)');
  check('비식별 관계 생성', ok2 && (await edgeCount()) === 1);

  // 비식별: 기존 id PK 제거 → FK(non-PK)로 교체 → PK 아이콘 0개, FK 아이콘 1개
  const pkAfterNonIdent = await childPkIcons();
  const fkAfterNonIdent = await childFkIcons();
  check('비식별 후 PK 아이콘 0개 (PK 제거)', pkAfterNonIdent === 0, `pkIcons=${pkAfterNonIdent}`);
  check('비식별 후 FK 아이콘 1개', fkAfterNonIdent === 1, `fkIcons=${fkAfterNonIdent}`);

  const txt2 = await childText();
  const idCount2 = txt2.split('\n').filter(l => l.trim() === 'id').length;
  check('비식별 후 id 컬럼 중복 없음 (1개)', idCount2 === 1, `idCount=${idCount2}`);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_fk_namedup.png' });

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_fk_namedup_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
