// 자기 참조(재귀) 관계 검증
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

try {
  await page.goto(BASE + '/app', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // ── 준비: 엔티티 1개 ──
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(500);

  // ── 1. 같은 엔티티에 자기 참조 드래그 ──
  const node = page.locator('.react-flow__node').nth(0);
  const nBox = await node.boundingBox();
  await page.mouse.move(nBox.x + nBox.width / 2, nBox.y + nBox.height / 2);
  await page.waitForTimeout(300);

  // 우측 핸들에서 드래그 시작 → 같은 노드의 하단 핸들로
  const rightHandle = await node.locator('.react-flow__handle[data-handlepos="right"]').first().boundingBox();
  const bottomHandle = await node.locator('.react-flow__handle[data-handlepos="bottom"]').first().boundingBox();

  const sx = rightHandle.x + rightHandle.width / 2;
  const sy = rightHandle.y + rightHandle.height / 2;
  const tx = bottomHandle.x + bottomHandle.width / 2;
  const ty = bottomHandle.y + bottomHandle.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.waitForTimeout(150);
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(sx + (tx - sx) * i / 20, sy + (ty - sy) * i / 20);
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await page.waitForTimeout(800);

  // 관계 종류 선택 모달 표시 확인
  check('자기 참조 드래그 → 관계 종류 선택 모달 표시', await page.locator('h3:has-text("관계 종류 선택")').count() === 1);

  // 비식별 관계로 생성
  await page.locator('button').filter({ hasText: '1:M 비식별 (점선 + 실선)' }).first().click();
  await page.waitForTimeout(600);

  // ── 2. 관계선 생성 확인 ──
  const edgeCount = await page.locator('.react-flow__edge').count();
  check('자기 참조 관계선 생성', edgeCount === 1, `edge count: ${edgeCount}`);

  // ── 3. 루프 path 형태 확인 (직선이 아닌 꺾인 path — M...L...Q 포함) ──
  const pathD = await page.locator('.react-flow__edge').first().evaluate(g => {
    const paths = [...g.querySelectorAll('path')].filter(p => p.getAttribute('stroke') !== 'transparent');
    return paths[0]?.getAttribute('d') ?? '';
  });
  check('자기 참조 path가 사각 루프 형태(Q bezier 포함)', pathD.includes('Q') && pathD.includes('L'));

  // ── 4. FK 컬럼 자동 생성 (자기 엔티티에 parent_ 접두사 FK) ──
  const fkCount = await node.locator('[title="Foreign Key"]').count();
  check('자기 참조 FK 컬럼 생성', fkCount >= 1, `FK count: ${fkCount}`);

  // FK 컬럼명 확인 — parent_ 접두사
  const colNames = await node.locator('.font-mono').allTextContents();
  const hasFkWithPrefix = colNames.some(n => n.trim().startsWith('parent_'));
  check('FK 컬럼명이 parent_ 접두사로 시작', hasFkWithPrefix, `columns: ${colNames.join(', ')}`);

  // ── 5. PK 컬럼이 제거되지 않았는지 확인 ──
  const pkCount = await node.locator('[title="Primary Key"]').count();
  check('자기 참조 후 PK 컬럼 유지', pkCount >= 1, `PK count: ${pkCount}`);

  // ── 6. 스크린샷 ──
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_self_ref.png' });

  // ── 7. 관계선 클릭 → 우측 패널 표시 ──
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(600);
  // self-loop는 path 시작 부분(0.1) 클릭 — 루프 상단 수평 선분
  const pt = await page.locator('.react-flow__edge').first().evaluate(g => {
    const path = g.querySelector('path');
    const len = path.getTotalLength();
    // 0.1 지점 = 루프 시작 직후 수평 선분
    const p = path.getPointAtLength(len * 0.1);
    const m = path.getScreenCTM();
    if (!m) return null;
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  });
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_self_ref_before_click.png' });
  if (pt) {
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(400);
    // 선택만으로는 패널이 안 열리고 ✎ 편집 아이콘을 눌러야 열린다(자기참조도 끝점 드래그 핸들만 제외, 아이콘은 노출됨)
    check('자기 참조 선택 → ✎ 편집 아이콘 노출', await page.locator('[data-testid="edge-edit-icon"]').count() === 1);
    await page.click('[data-testid="edge-edit-icon"]');
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_self_ref_after_click.png' });
  const panelVisible = await page.locator('[data-testid="rel-panel"]').count() === 1;
  check('✎ 아이콘 클릭 → 우측 관계 속성 패널', panelVisible);

  // 패널에 부모=자식이 동일 엔티티 표시
  if (panelVisible) {
    const panelText = await page.locator('[data-testid="rel-panel"]').textContent();
    check('관계 패널에 같은 엔티티명(부모=자식) 표시', panelText?.includes('Entity1') ?? false);
  }

  // ── 8. 관계 삭제 → FK 제거 ──
  await page.click('[data-testid="rel-delete"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="dialog-ok"]');
  await page.waitForTimeout(500);
  check('자기 참조 삭제 → 관계선 제거', await page.locator('.react-flow__edge').count() === 0);
  check('자기 참조 삭제 → FK 컬럼 제거', await node.locator('[title="Foreign Key"]').count() === 0);

  // ── 9. SQL 내보내기 — parent_id FK 제약 포함 확인 ──
  // 새 자기 참조 관계 재생성
  await page.mouse.move(nBox.x + nBox.width / 2, nBox.y + nBox.height / 2);
  await page.waitForTimeout(300);
  const rh2 = await node.locator('.react-flow__handle[data-handlepos="right"]').first().boundingBox();
  const bh2 = await node.locator('.react-flow__handle[data-handlepos="bottom"]').first().boundingBox();
  await page.mouse.move(rh2.x + rh2.width / 2, rh2.y + rh2.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(
      (rh2.x + rh2.width / 2) + ((bh2.x + bh2.width / 2) - (rh2.x + rh2.width / 2)) * i / 20,
      (rh2.y + rh2.height / 2) + ((bh2.y + bh2.height / 2) - (rh2.y + rh2.height / 2)) * i / 20,
    );
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await page.waitForTimeout(800);
  if (await page.locator('h3:has-text("관계 종류 선택")').count()) {
    await page.locator('button').filter({ hasText: '1:M 비식별' }).first().click();
    await page.waitForTimeout(500);
  }

  // SQL 내보내기
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    page.click('button[title="SQL 내보내기 (MySQL)"]'),
  ]);
  const sqlPath = await download.path();
  const { readFileSync } = await import('fs');
  const sql = sqlPath ? readFileSync(sqlPath, 'utf8') : '';
  check('SQL에 parent_id FK 컬럼 포함', sql.includes('parent_id'));
  check('SQL에 자기 참조 FOREIGN KEY 제약 포함', sql.includes('REFERENCES') && sql.includes('Entity1'));

  const failed = results.filter(r => !r.pass);
  console.log(`\n총 ${results.length}개 중 ${results.length - failed.length} PASS / ${failed.length} FAIL`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_self_ref_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
