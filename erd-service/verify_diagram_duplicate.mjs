// 내 다이어그램 목록 — 복제(Duplicate) 기능 검증
// 전제: npm run build && ALLOW_PGMEM=1 npm start (8080, DATABASE_URL 미설정 → pg-mem)
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

let fail = 0;
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) fail++;
}

const username = `dup${Math.floor(Date.now() % 1000000)}`;
const myDiagrams = () => page.locator('[data-testid="my-diagrams"]');
const nodeCount = () => page.locator('.react-flow__node').count();

try {
  // ── 0. 가입 + 로그인 ──
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('button[aria-label="User"]');
  await page.waitForTimeout(300);
  await page.click('button:text-is("회원가입")');
  await page.fill('input[placeholder="영문/숫자 3자 이상"]', username);
  await page.fill('input[placeholder="8자 이상"]', 'password123');
  await page.click('button:has-text("가입하기")');
  await page.waitForTimeout(800);
  check('가입 후 내 다이어그램 섹션 노출', await myDiagrams().count() === 1);

  // ── 1. 엔티티 2개(관계 없이도 무관) 만들고 DB에 저장 ──
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  check('엔티티 2개 생성됨', await nodeCount() === 2);

  await page.click('button[aria-label="DB Save"]');
  await page.waitForTimeout(400);
  await page.fill('[data-testid="dialog-input"]', 'Original ERD');
  await page.click('[data-testid="dialog-ok"]');
  await page.waitForTimeout(800);
  check('저장 후 목록에 원본 표시', await myDiagrams().locator('text=Original ERD').count() === 1);
  check('목록 항목 1개', await myDiagrams().locator('.group').count() === 1);

  // ── 2. 호버 시 복제 아이콘 노출 ──
  await page.hover('[data-testid="my-diagrams"] >> text=Original ERD');
  const dupBtn = page.locator('button[aria-label="Duplicate Original ERD"]');
  check('호버 시 복제 아이콘 노출', await dupBtn.count() === 1);

  // ── 3. 클릭 → 이름 입력 프롬프트(기본값 "{원본} 사본") ──
  await dupBtn.click();
  await page.waitForTimeout(400);
  check('복제 클릭 → 다이얼로그 표시', await page.locator('[data-testid="app-dialog"]').count() === 1);
  const dialogText = await page.locator('[data-testid="app-dialog"]').innerText();
  check('다이얼로그 타이틀 "다이어그램 복제"', dialogText.includes('다이어그램 복제'));
  const prefill = await page.locator('[data-testid="dialog-input"]').inputValue();
  check('입력창 기본값이 "원본 사본"', prefill === 'Original ERD 사본', prefill);

  // ── 4. 취소 → 목록 변화 없음 ──
  await page.click('[data-testid="dialog-cancel"]');
  await page.waitForTimeout(400);
  check('취소 → 목록 항목 그대로 1개', await myDiagrams().locator('.group').count() === 1);

  // ── 5. 확인 → 새 항목 추가 ──
  await page.hover('[data-testid="my-diagrams"] >> text=Original ERD');
  await page.click('button[aria-label="Duplicate Original ERD"]');
  await page.waitForTimeout(400);
  await page.click('[data-testid="dialog-ok"]'); // 기본값 그대로 확인
  await page.waitForTimeout(800);
  check('확인 → 목록 항목 2개로 증가', await myDiagrams().locator('.group').count() === 2);
  check('원본 이름 그대로 존재', await myDiagrams().locator('text=Original ERD').count() >= 1);
  check('복제본 이름("Original ERD 사본") 목록에 존재', await myDiagrams().locator('text=Original ERD 사본').count() === 1);

  await page.screenshot({ path: 'ss_diagram_duplicate.png' });

  // ── 6. 복제 중 현재 열려 있던(currentId) 다이어그램은 안 바뀜 ──
  check('복제 후에도 캔버스 그대로(엔티티 2개, 전환 안 됨)', await nodeCount() === 2);
  check('복제 후에도 현재 다이어그램 표시가 원본 그대로', (await page.locator('[data-testid="current-diagram"]').innerText()).includes('Original ERD') && !(await page.locator('[data-testid="current-diagram"]').innerText()).includes('사본'));

  // ── 7. 복제본을 열면 원본과 동일한 데이터(엔티티 2개)를 가짐 ──
  await page.click('[data-testid="my-diagrams"] >> text=Original ERD 사본');
  await page.waitForTimeout(800);
  check('복제본 열기 → 엔티티 2개(원본 데이터 그대로)', await nodeCount() === 2);
  check('복제본 열기 → 현재 다이어그램 표시가 복제본 이름', (await page.locator('[data-testid="current-diagram"]').innerText()).includes('Original ERD 사본'));

  // ── 8. 정리: 복제본 삭제해도 원본은 유지 ──
  await page.hover('[data-testid="my-diagrams"] >> text=Original ERD 사본');
  await page.click('button[aria-label="Delete Original ERD 사본"]');
  await page.waitForTimeout(400);
  await page.click('[data-testid="dialog-ok"]');
  await page.waitForTimeout(600);
  check('복제본 삭제 후 원본은 유지', await myDiagrams().locator('text=Original ERD').count() === 1 && await myDiagrams().locator('.group').count() === 1);

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  await page.screenshot({ path: 'ss_diagram_duplicate_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
