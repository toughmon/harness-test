// 좌측 사이드바 'MCP 연결 가이드' 메뉴 + /mcp-guide.html 서빙·렌더 검증
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 푸터 메뉴 링크들
  const footer = page.locator('aside[data-testid="sidebar"] a');
  const mcpLink = page.locator('aside[data-testid="sidebar"] a[href="/mcp-guide.html"]');
  const docsLink = page.locator('aside[data-testid="sidebar"] a[href="/manual.html"]');
  // placeholder NavItem은 title="Help (준비 중)" 속성으로 식별 (innerText엔 아이콘 리거처가 섞임)
  const helpItem = page.locator('aside[data-testid="sidebar"] [title="Help (준비 중)"]');

  check('MCP 연결 가이드 메뉴 존재', await mcpLink.count() === 1);
  check('메뉴 라벨 = "MCP 연결 가이드"', (await mcpLink.innerText()).includes('MCP 연결 가이드'));
  check('새 탭 링크(target=_blank, rel=noopener)',
    await mcpLink.getAttribute('target') === '_blank' &&
    (await mcpLink.getAttribute('rel') ?? '').includes('noopener'));
  check('href = /mcp-guide.html', await mcpLink.getAttribute('href') === '/mcp-guide.html');
  check('cable 아이콘', (await mcpLink.locator('.material-symbols-outlined').innerText()).trim() === 'cable');
  check('Help 메뉴 존재(placeholder)', await helpItem.count() === 1);
  check('Docs 메뉴 유지', await docsLink.count() === 1);

  // 순서: MCP 가이드가 Help 위 (화면 y 좌표 비교)
  const mcpBox = await mcpLink.boundingBox();
  const helpBox = await helpItem.boundingBox();
  check('순서: MCP 연결 가이드가 Help 위', !!mcpBox && !!helpBox && mcpBox.y < helpBox.y, `mcp.y=${mcpBox?.y}, help.y=${helpBox?.y}`);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_mcp_menu.png' });

  // 페이지 자체 서빙 + 핵심 내용 렌더
  const res = await page.request.get(`${BASE}/mcp-guide.html`);
  check('GET /mcp-guide.html → 200', res.status() === 200);

  await page.goto(`${BASE}/mcp-guide.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('가이드 제목 렌더', (await page.locator('h1').innerText()).includes('MCP 연결 가이드'));
  const body = await page.locator('body').innerText();
  check('4단계 안내 포함', ['의존성 설치', '서비스 계정', '.mcp.json', '재시작'].every(s => body.includes(s)));
  check('배포 주소 예시 포함', body.includes('toughdev.cafe24.com:8080'));
  check('도구 목록(add_relationship) 포함', body.includes('add_relationship'));
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_mcp_guide.png', fullPage: true });

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.log('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_mcp_guide_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
