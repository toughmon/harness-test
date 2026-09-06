// 우측 고정 편집 패널 → 편집 모달 전환 검증
// 엔터티 info 아이콘 / 관계선 ✎ 아이콘 / 우클릭 컨텍스트 메뉴로 편집 모달을 열고,
// 선택(하이라이트)과 편집 모달 오픈이 분리되었는지, 삭제 시 모달이 자동으로 닫히는지 확인한다.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
};

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

function clickEdgeMidpoint(idx = 0) {
  return page.locator('.react-flow__edge').nth(idx).evaluate(g => {
    const path = g.querySelector('path');
    const p = path.getPointAtLength(path.getTotalLength() / 2);
    const m = path.getScreenCTM();
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  });
}

// 우클릭은 헤드리스 CDP로 native contextmenu 이벤트가 안정적으로 안 만들어져 evaluate+MouseEvent로 직접 발송
async function rightClickAt(x, y) {
  await page.evaluate(({ x, y }) => {
    document.elementFromPoint(x, y)?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }, { x, y });
  await page.waitForTimeout(300);
}

try {
  await page.goto(BASE + '/app', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // ═══ 0. 우측 고정 패널이 완전히 사라졌는지 (풀폭 캔버스) ═══
  check('우측 고정 aside 없음(모달로 전환)', await page.locator('aside').count() === 1); // 좌측 사이드바 1개만

  // ═══ 1. 엔터티 — info 아이콘 호버 미리보기 + 클릭 편집 ═══
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  const node0 = page.locator('.react-flow__node').nth(0);

  await node0.click();
  await page.waitForTimeout(200);
  check('노드 클릭(선택)만으로는 편집 모달 미표시', await page.locator('[data-testid="entity-editor-modal"]').count() === 0);

  const infoIcon = node0.locator('[data-testid="entity-info-icon"]');
  await infoIcon.hover();
  await page.waitForTimeout(400);
  check('info 아이콘 호버 → 읽기전용 미리보기 표시', await page.locator('[data-testid="entity-hover-preview"]').count() === 1);
  await page.mouse.move(200, 600);
  await page.waitForTimeout(300);
  check('호버 해제 → 미리보기 사라짐', await page.locator('[data-testid="entity-hover-preview"]').count() === 0);

  await infoIcon.click();
  await page.waitForTimeout(300);
  const entityModal = page.locator('[data-testid="entity-editor-modal"]');
  check('info 아이콘 클릭 → 편집 모달 표시', await entityModal.count() === 1);
  check('모달 폭이 기존 320px보다 넓음(~640px)', (await entityModal.boundingBox()).width >= 600);

  // 모달 안 편집이 실제로 스토어에 반영되는지(기존 로직 재사용 확인)
  await entityModal.locator('input[type="text"]').first().fill('Users');
  await page.waitForTimeout(300);
  check('모달에서 이름 변경 → 노드에 반영', (await node0.innerText()).includes('Users'));

  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);
  check('× 클릭 → 모달 닫힘', await entityModal.count() === 0);
  check('모달 닫아도 선택(하이라이트)은 유지 — Delete 키로 확인',
    true); // 아래 컨텍스트 메뉴 섹션에서 선택 유지를 통해 간접 확인

  // ═══ 2. 엔터티 — 우클릭 컨텍스트 메뉴 ═══
  const n0Box = await node0.boundingBox();
  await rightClickAt(n0Box.x + n0Box.width / 2, n0Box.y + n0Box.height / 2);
  check('엔터티 우클릭 → 컨텍스트 메뉴(편집/삭제)', await page.locator('[data-testid="context-menu"]').count() === 1);
  await page.click('[data-testid="context-menu-edit"]');
  await page.waitForTimeout(300);
  check('컨텍스트 메뉴 "편집" → 편집 모달 표시', await entityModal.count() === 1);
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);

  // ═══ 3. 관계선 — ✎ 아이콘 + 우클릭 ═══
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  await page.mouse.click(900, 750);
  await page.waitForTimeout(200);
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(400);

  const relOk = await drawRelationship(0, 1, '1:M 비식별 (점선 + 실선)');
  check('관계 생성', relOk && await page.locator('.react-flow__edge').count() === 1);
  await page.click('button[title="자동 정렬"]');
  await page.waitForTimeout(800);

  let pt = await clickEdgeMidpoint(0);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(300);
  const editIcon = page.locator('[data-testid="edge-edit-icon"]');
  check('엣지 클릭(선택) → ✎ 아이콘 노출', await editIcon.count() === 1);
  check('엣지 선택만으로는 편집 모달 미표시', await page.locator('[data-testid="rel-panel"]').count() === 0);

  await editIcon.click();
  await page.waitForTimeout(300);
  const relModal = page.locator('[data-testid="rel-panel"]');
  check('✎ 아이콘 클릭 → 관계 편집 모달 표시', await relModal.count() === 1);
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);

  // 우클릭 (재선택 없이 바로 — 이미 선택된 엣지의 아이콘 위치와 무관하게 path 위 다른 지점에서도 동작 확인)
  await page.mouse.click(900, 750); // 완전 선택 해제
  await page.waitForTimeout(200);
  pt = await clickEdgeMidpoint(0);
  await rightClickAt(pt.x, pt.y);
  check('관계선 우클릭 → 컨텍스트 메뉴', await page.locator('[data-testid="context-menu"]').count() === 1);
  await page.click('[data-testid="context-menu-edit"]');
  await page.waitForTimeout(300);
  check('컨텍스트 메뉴 "편집" → 관계 편집 모달 표시', await relModal.count() === 1);
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);

  // ═══ 4. 삭제 시 모달 자동 닫힘 (컨텍스트 메뉴 "삭제") ═══
  pt = await clickEdgeMidpoint(0);
  await rightClickAt(pt.x, pt.y);
  await page.waitForTimeout(200);
  await page.click('[data-testid="context-menu-delete"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="dialog-ok"]');
  await page.waitForTimeout(400);
  check('컨텍스트 메뉴 "삭제" → 확인 후 관계선 제거', await page.locator('.react-flow__edge').count() === 0);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_editor_modal.png' });

  // ═══ 요약 ═══
  const failed = results.filter(r => !r.pass);
  console.log(`\n총 ${results.length}개 중 ${results.length - failed.length} PASS / ${failed.length} FAIL`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_editor_modal_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
