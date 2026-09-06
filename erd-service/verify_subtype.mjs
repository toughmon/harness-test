// 배타적 서브타입(SubSet) — 슈퍼타입 안에 중첩 서브타입 박스 + 편집 + SQL 매핑 검증
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
};

const node = () => page.locator('.react-flow__node').first();
const subsetRegion = () => node().locator('[data-testid="subset-region"]');
const subtypeBoxes = () => node().locator('[data-testid="subtype-box"]');

try {
  await page.goto(BASE + '/app', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // ───── 준비: 엔티티 1개 (자동 선택, 편집 모달은 info 아이콘으로 오픈) ─────
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(500);
  check('엔티티 추가 + 자동 선택', await page.locator('.react-flow__node').count() === 1);

  // 서브타입 없을 때는 노드에 SubSet 영역이 없어야 함
  check('서브타입 0개 → SubSet 영역 미표시', await subsetRegion().count() === 0);

  await node().locator('[data-testid="entity-info-icon"]').click();
  await page.waitForTimeout(300);
  check('패널에 Add Subtype 버튼 존재', await page.locator('[data-testid="add-subtype"]').count() === 1);

  // ───── 서브타입 2개 추가 ─────
  await page.click('[data-testid="add-subtype"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="add-subtype"]');
  await page.waitForTimeout(300);
  check('패널에 서브타입 카드 2개', await page.locator('[data-testid="subtype-card"]').count() === 2);

  // 노드 안에 SubSet 영역 + 중첩 서브타입 박스 2개
  check('노드에 SubSet 영역 표시', await subsetRegion().count() === 1);
  check('노드에 중첩 서브타입 박스 2개', await subtypeBoxes().count() === 2);

  // ───── SubSet 이름(구분자) 설정 ─────
  const subsetNameInput = page.getByPlaceholder('SubSet 이름 (구분자)');
  await subsetNameInput.fill('emp_type');
  await page.waitForTimeout(300);
  check('SubSet 이름이 노드 헤더에 반영', (await subsetRegion().innerText()).includes('emp_type'));

  // 기본 배지: 배타·불완전
  check('기본 배지 = 배타·불완전', (await subsetRegion().innerText()).replace(/\s/g, '').includes('배타·불완전'));

  // ───── 서브타입 이름 변경 (FULL_TIME / PART_TIME) ─────
  const card = (i) => page.locator('[data-testid="subtype-card"]').nth(i);
  await card(0).locator('input').first().fill('FULL_TIME');
  await page.waitForTimeout(200);
  await card(1).locator('input').first().fill('PART_TIME');
  await page.waitForTimeout(300);
  const boxText = await subsetRegion().innerText();
  check('서브타입 박스에 FULL_TIME / PART_TIME 표시', boxText.includes('FULL_TIME') && boxText.includes('PART_TIME'));

  // ───── 각 서브타입에 고유 속성(컬럼) 추가 ─────
  await page.locator('[data-testid="add-subtype-column"]').nth(0).click();
  await page.waitForTimeout(250);
  await page.locator('[data-testid="add-subtype-column"]').nth(1).click();
  await page.waitForTimeout(300);
  // 노드 서브타입 박스에 컬럼(기본명 column) 표시
  check('서브타입 박스에 고유 속성 렌더', (await subsetRegion().innerText()).includes('column'));

  // ───── 완전(Complete) 토글 → 배지 변경 ─────
  await page.locator('label').filter({ hasText: '완전 (Complete)' }).locator('input[type=checkbox]').check();
  await page.waitForTimeout(300);
  check('완전 토글 → 배지 = 배타·완전', (await subsetRegion().innerText()).replace(/\s/g, '').includes('배타·완전'));

  // ───── SQL 내보내기 → 구분자 컬럼 + 배타 CHECK ─────
  // 내보내기 버튼은 캔버스 툴바에 있어 모달을 먼저 닫아야 클릭 가능(모달이 전체 화면을 덮으므로).
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(200);
  const sqlBtn = page.locator('button[title="SQL 내보내기 (MySQL)"]');
  check('SQL 내보내기 버튼 존재', await sqlBtn.count() === 1);
  const dl = page.waitForEvent('download', { timeout: 20000 });
  await sqlBtn.click();
  const download = await dl;
  const sqlPath = 'C:/project/harness-test/erd-service/ss_subtype_export.sql';
  await download.saveAs(sqlPath);
  const sql = readFileSync(sqlPath, 'utf-8');
  console.log('--- 생성된 DDL ---\n' + sql + '\n------------------');

  check('구분자 컬럼 생성 (emp_type VARCHAR(30) NOT NULL)', /`emp_type` VARCHAR\(30\) NOT NULL/.test(sql));
  check('구분자 도메인 CHECK (IN FULL_TIME/PART_TIME)',
    /CHECK \(`emp_type` IN \('FULL_TIME', 'PART_TIME'\)\)/.test(sql));
  check('서브타입 컬럼 nullable 평탄화 (column NULL)', sql.includes('`column` VARCHAR(255) NULL'));
  check('컬럼명 충돌 회피 (column_PART_TIME)', sql.includes('`column_PART_TIME`'));
  check('배타성 CHECK 생성 (구분자별 타 서브타입 컬럼 IS NULL)',
    /CHECK \(\s*\(`emp_type` = 'FULL_TIME' AND `column_PART_TIME` IS NULL\)/.test(sql));
  // 완전이므로 구분자 NULL(슈퍼타입만) 케이스는 없어야 함
  check('완전 → 구분자 IS NULL 케이스 없음', !sql.includes('`emp_type` IS NULL'));

  // ───── 긴 속성명도 말줄임 없이 전체 노출 (rename은 SQL 충돌검증 이후) ─────
  // 내보내기 전에 모달을 닫았으므로 편집을 계속하려면 다시 연다.
  await node().locator('[data-testid="entity-info-icon"]').click();
  await page.waitForTimeout(300);
  await card(0).getByText('column', { exact: true }).click(); // 컬럼 행 펼치기
  await page.waitForTimeout(200);
  const LONG = 'very_long_subtype_attribute_name_no_truncation';
  await card(0).getByPlaceholder('물리명').nth(1).fill(LONG); // [0]=서브타입명, [1]=컬럼 물리명
  await page.waitForTimeout(300);
  check('긴 속성명 전체 노출 (innerText)', (await subsetRegion().innerText()).includes(LONG));
  const nameSpan = subsetRegion().locator('[data-testid="subtype-col-name"]').filter({ hasText: LONG }).first();
  const trunc = await nameSpan.evaluate(el => {
    const s = getComputedStyle(el);
    return { overflow: s.overflow, textOverflow: s.textOverflow, clipped: el.scrollWidth > el.clientWidth + 1 };
  });
  check('속성명 말줄임 안 함 (ellipsis/overflow-hidden/clip 없음)',
    trunc.textOverflow !== 'ellipsis' && trunc.overflow !== 'hidden' && !trunc.clipped,
    JSON.stringify(trunc));

  // 데이터 타입/크기 영역이 박스 밖으로 잘리지 않는지 (overflow-hidden 제거 검증)
  const longBox = subtypeBoxes().filter({ hasText: LONG }).first();
  const typeClip = await longBox.evaluate(box => {
    const t = box.querySelector('[data-testid="subtype-col-type"]');
    const br = box.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    return { typeText: t.textContent, clipped: tr.right > br.right + 1 };
  });
  check('데이터 타입/크기 잘리지 않음 (박스 내 노출)',
    !typeClip.clipped && typeClip.typeText.includes('VARCHAR'),
    JSON.stringify(typeClip));

  // 스크린샷은 실제 노드를 보여줘야 하므로 모달을 닫고 캔버스를 촬영
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_subtype_node.png' });

  // 전체 노드가 보이도록 Fit View 후 스크린샷 (타입/크기 열까지 시각 확인)
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_subtype_fit.png' });

  // ───── Undo → 서브타입 1개 제거 ─────
  await page.mouse.click(700, 800);
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+z'); // 완전 토글 undo
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+z'); // 두번째 컬럼 추가 undo
  await page.waitForTimeout(300);
  check('Undo 후에도 노드 유지', await page.locator('.react-flow__node').count() === 1);

  // ───── 요약 ─────
  const failed = results.filter(r => !r.pass);
  console.log(`\n총 ${results.length}개 중 ${results.length - failed.length} PASS / ${failed.length} FAIL`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_subtype_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
