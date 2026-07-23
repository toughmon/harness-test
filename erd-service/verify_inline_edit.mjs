import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
  console.log('--- E2E Inline Edit Test Start ---');
  
  // Dev server 또는 미리 만들어진 서버 사용
  const server = spawn('node', ['server/index.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: '8099', ALLOW_PGMEM: '1' },
    stdio: 'ignore'
  });

  // 서버 준비 대기
  await new Promise(res => setTimeout(res, 2000));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:8099');
    await page.waitForSelector('.react-flow__node');

    console.log('1. Adding Entity...');
    // Add Entity
    const addBtn = page.locator('button', { hasText: '엔티티 추가' }).or(page.locator('button', { hasText: 'Add Entity' }));
    if (await addBtn.count() > 0) {
      await addBtn.click();
    } else {
      // 사이드바 또는 toolbar 버튼
      await page.click('button:has-text("Entity")');
    }

    await page.waitForTimeout(500);

    // 2. 컬럼 물리명 더블클릭 수정
    console.log('2. Double-clicking column name...');
    const colName = page.locator('[data-testid="col-name"]').first();
    await colName.dblclick();
    
    await page.waitForSelector('input');
    await page.keyboard.fill('edited_col_name');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(300);
    const updatedName = await page.locator('[data-testid="col-name"]').first().textContent();
    console.log('Updated column name:', updatedName);
    if (updatedName !== 'edited_col_name') {
      throw new Error(`Expected 'edited_col_name', got '${updatedName}'`);
    }

    // 3. 컬럼 타입 더블클릭 수정
    console.log('3. Double-clicking column type...');
    const colType = page.locator('[data-testid="col-type"]').first();
    await colType.dblclick();
    
    await page.waitForSelector('input');
    await page.keyboard.fill('DECIMAL(12,2)');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(300);
    const updatedType = await page.locator('[data-testid="col-type"]').first().textContent();
    console.log('Updated column type:', updatedType);
    if (updatedType !== 'DECIMAL(12,2)') {
      throw new Error(`Expected 'DECIMAL(12,2)', got '${updatedType}'`);
    }

    // 4. 컬럼 한글명 더블클릭 수정
    console.log('4. Double-clicking column logical name...');
    const colLogical = page.locator('[data-testid="col-logical-name"]').first();
    await colLogical.dblclick();
    
    await page.waitForSelector('input');
    await page.keyboard.fill('수정된한글명');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(300);
    const updatedLogical = await page.locator('[data-testid="col-logical-name"]').first().textContent();
    console.log('Updated column logical name:', updatedLogical);
    if (updatedLogical !== '수정된한글명') {
      throw new Error(`Expected '수정된한글명', got '${updatedLogical}'`);
    }

    console.log('SUCCESS: All inline edit tests passed!');
  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

runTest();
