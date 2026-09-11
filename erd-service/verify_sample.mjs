// 온보딩 샘플 다이어그램 검증 — 최초 방문자 자동 로드, 사이드바 샘플 전환,
// dirty/DB저장 미유발, 실제 편집 시 자연 전환, 재방문 시 미개입, 로그인 사용자 미개입.
// 사전 조건: npm run build && npm start (기본 포트 8080, ALLOW_PGMEM=1)
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });

let fail = 0;
function check(name, ok, extra) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${ok || extra === undefined ? '' : ` — ${extra}`}`);
  if (!ok) fail++;
}

try {
  // ── 1. 진짜 최초 방문자 — 빈 캔버스 대신 쇼핑몰 샘플이 자동으로 뜬다 ──────────
  // App.tsx는 navigator.webdriver(자동화 브라우저 표지)가 true면 자동 로드를 건너뛴다
  // (그렇지 않으면 다른 모든 verify_*.mjs가 새 컨텍스트를 열 때마다 "최초 방문자"로
  // 오인되어 기존 "빈 캔버스" 전제가 깨진다 — 실제로 재현해 확인한 회귀). 이 스크립트는
  // 그 자동 로드 자체를 검증하는 게 목적이므로 실사용자 브라우저처럼 위장한다.
  const ctx1 = await browser.newContext();
  await ctx1.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const p1 = await ctx1.newPage();
  await p1.setViewportSize({ width: 1600, height: 900 });
  p1.on('pageerror', e => console.log('PAGE ERROR:', e.message));

  await p1.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await p1.waitForTimeout(2000);

  check('최초 방문 시 노드 5개 자동 로드(쇼핑몰)', await p1.locator('.react-flow__node').count() === 5);
  check('예제 배너 노출', await p1.locator('[data-testid="sample-banner"]').count() === 1);
  const bannerText = await p1.locator('[data-testid="sample-banner"]').innerText();
  check('배너에 "예제: 쇼핑몰 주문" 표시', bannerText.includes('예제:') && bannerText.includes('쇼핑몰 주문'), bannerText);
  check('배너에 "새로 시작하기" 버튼', await p1.locator('[data-testid="sample-start-fresh"]').count() === 1);

  // FK 자동 생성 확인 — order_product 엔티티에 order_id/product_id FK가 있어야 함
  const orderProductNode = p1.locator('.react-flow__node', { hasText: 'order_product' });
  const opText = await orderProductNode.innerText();
  check('샘플 FK 자동 생성 (order_product에 order_id)', opText.includes('order_id'));
  check('샘플 FK 자동 생성 (order_product에 product_id)', opText.includes('product_id'));

  // ── 2. 샘플 로드는 dirty/DB저장을 유발하지 않는다 ────────────────────────────
  check('저장 안 됨 — Save(JSON) 버튼만 존재, DB 저장 버튼은 비로그인이라 없음',
    await p1.locator('button[aria-label="DB Save"]').count() === 0);
  check('unsaved-changes 표시 없음(dirty=false)',
    await p1.locator('[title*="Unsaved"], [title*="저장되지 않은"]').count() === 0);

  await p1.screenshot({ path: 'C:/project/harness-test/erd-service/ss_sample_banner.png' });

  // ── 3. "새로 시작하기" → 빈 캔버스 + 배너 소멸 + 사이드바 샘플 목록 노출 ──────
  await p1.click('[data-testid="sample-start-fresh"]');
  await p1.waitForTimeout(500);
  check('새로 시작 → 노드 0개', await p1.locator('.react-flow__node').count() === 0);
  check('새로 시작 → 배너 사라짐', await p1.locator('[data-testid="sample-banner"]').count() === 0);
  check('새로 시작 → 사이드바 샘플 섹션 노출', await p1.locator('[data-testid="sample-diagrams"]').count() === 1);
  check('샘플 3종 버튼 노출', await p1.locator('[data-testid^="sample-"][data-testid$="ecommerce"], [data-testid^="sample-"][data-testid$="blog"], [data-testid^="sample-"][data-testid$="hr"]').count() >= 3);

  // ── 4. 사이드바에서 블로그 샘플 선택 ─────────────────────────────────────────
  await p1.click('[data-testid="sample-blog"]');
  await p1.waitForTimeout(700);
  check('블로그 샘플 노드 5개', await p1.locator('.react-flow__node').count() === 5);
  const commentText = await p1.locator('.react-flow__node', { hasText: 'Comment' }).innerText();
  check('블로그 FK 자동 생성 (Comment에 post_id)', commentText.includes('post_id'));
  check('블로그 FK 자동 생성 (Comment에 user_id)', commentText.includes('user_id'));
  const bannerBlog = await p1.locator('[data-testid="sample-banner"]').innerText();
  check('배너가 블로그로 갱신됨', bannerBlog.includes('블로그'), bannerBlog);

  // ── 5. 사이드바에서 인사관리(HR) 샘플 선택 — 자기참조 FK 확인 ────────────────
  await p1.click('[data-testid="sample-start-fresh"]');
  await p1.waitForTimeout(400);
  await p1.click('[data-testid="sample-hr"]');
  await p1.waitForTimeout(700);
  check('HR 샘플 노드 2개', await p1.locator('.react-flow__node').count() === 2);
  const empText = await p1.locator('.react-flow__node', { hasText: 'employee' }).innerText();
  check('HR 자기참조 FK 자동 생성 (parent_emp_id)', empText.includes('parent_emp_id'));
  check('HR 부서 FK 자동 생성 (dept_id)', empText.includes('dept_id'));
  await p1.screenshot({ path: 'C:/project/harness-test/erd-service/ss_sample_hr_e2e.png' });

  // ── 6. 실제 편집을 시작하면 예제 배너가 자연스럽게 사라진다(dirty 전환) ──────
  await p1.locator('.react-flow__node', { hasText: 'department' }).locator('[data-testid="entity-info-icon"]').click();
  await p1.waitForTimeout(300);
  const nameInput = p1.locator('[data-testid="entity-editor-modal"] input').first();
  await nameInput.fill('dept_renamed');
  await nameInput.blur();
  await p1.waitForTimeout(300);
  await p1.click('[data-testid="editor-modal-close"]');
  await p1.waitForTimeout(300);
  check('편집 시작 → 배너 사라짐(일반 작업물로 전환)', await p1.locator('[data-testid="sample-banner"]').count() === 0);

  // ── 7. 재방문(같은 브라우저) — 자동 샘플이 더 이상 끼어들지 않음(플래그 소진) ─
  await p1.reload({ waitUntil: 'networkidle' });
  await p1.waitForTimeout(1500);
  check('재방문(reload) 시 자동 샘플 재로드 안 됨 — 빈 캔버스', await p1.locator('.react-flow__node').count() === 0);
  check('재방문 시 배너도 없음', await p1.locator('[data-testid="sample-banner"]').count() === 0);
  check('재방문 시에도 사이드바에서 수동으로는 여전히 선택 가능', await p1.locator('[data-testid="sample-diagrams"]').count() === 1);

  await ctx1.close();

  // ── 8. 로그인 상태로 /app을 여는 경우는 샘플이 끼어들지 않는다(기존 복원 흐름 유지) ─
  // 가입 "직후"는 검증 대상이 아니다 — 가입 전에 비로그인으로 열면서 이미 샘플이 로드돼
  // 있었을 수 있고, 가입은 그 캔버스를 지우지 않는 게 오히려 맞는 동작이다(사용자가 막
  // 그리던 걸 가입했다고 날리면 안 됨). 검증해야 하는 건 "로그인된 상태에서 /app 접속"이므로
  // 가입 후 reload해서 authStore.init()의 restoreLastOpened 경로를 다시 태운다.
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.setViewportSize({ width: 1600, height: 900 });
  const username = `sampleuser${Math.floor(Date.now() % 1000000)}`;
  await p2.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(1500);
  await p2.click('button[aria-label="User"]');
  await p2.waitForTimeout(300);
  await p2.click('button:text-is("회원가입")');
  await p2.fill('input[placeholder="영문/숫자 3자 이상"]', username);
  await p2.fill('input[placeholder="8자 이상"]', 'password123');
  await p2.click('button:has-text("가입하기")');
  await p2.waitForTimeout(800);

  await p2.reload({ waitUntil: 'networkidle' });
  await p2.waitForTimeout(1500);
  check('로그인 상태로 재접속 — 저장된 다이어그램 없으면 빈 캔버스(샘플 아님)',
    await p2.locator('.react-flow__node').count() === 0);
  check('로그인 상태 — 예제 배너 없음(로그인 사용자는 자동 로드 대상 아님)',
    await p2.locator('[data-testid="sample-banner"]').count() === 0);
  check('로그인 상태 — 사이드바 샘플 섹션은 여전히 노출(수동 선택 가능)',
    await p2.locator('[data-testid="sample-diagrams"]').count() === 1);
  await ctx2.close();

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
