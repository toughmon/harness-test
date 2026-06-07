// SQL DDL 내보내기 (MySQL) 검증
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

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

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // ───── 준비: 엔티티 2개 + 식별 관계 ─────
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Add Entity")');
  await page.waitForTimeout(400);

  // Entity2(나중 추가)가 선택된 상태 — 컬럼 1개 추가 (기본 VARCHAR 255)
  await page.locator('button').filter({ hasText: /^add Add$/ }).click();
  await page.waitForTimeout(400);

  await page.mouse.click(700, 750);
  await page.waitForTimeout(200);
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(500);

  const relOk = await drawRelationship(0, 1, '1:M 상속+식별자');
  check('식별 관계 생성', relOk && await page.locator('.react-flow__edge').count() === 1);

  // ───── SQL 내보내기 ─────
  const sqlBtn = page.locator('button[title="SQL 내보내기 (MySQL)"]');
  check('SQL 내보내기 버튼 존재', await sqlBtn.count() === 1);

  const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
  await sqlBtn.click();
  const download = await downloadPromise;
  const fname = download.suggestedFilename();
  check('SQL 파일 다운로드 (.sql)', /^erd-\d{4}-\d{2}-\d{2}\.sql$/.test(fname), fname);

  const sqlPath = 'C:/project/harness-test/erd-service/ss_export_result.sql';
  await download.saveAs(sqlPath);
  const sql = readFileSync(sqlPath, 'utf-8');
  console.log('--- 생성된 DDL ---\n' + sql + '\n------------------');

  // ───── DDL 내용 검증 ─────
  check('헤더 + FK_CHECKS 래핑',
    sql.includes('-- Target: MySQL 8.x') &&
    sql.includes('SET FOREIGN_KEY_CHECKS = 0;') &&
    sql.includes('SET FOREIGN_KEY_CHECKS = 1;'));

  check('CREATE TABLE Entity1', sql.includes('CREATE TABLE `Entity1`'));
  check('CREATE TABLE Entity2', sql.includes('CREATE TABLE `Entity2`'));
  check('부모 테이블 우선 정렬', sql.indexOf('CREATE TABLE `Entity1`') < sql.indexOf('CREATE TABLE `Entity2`'));

  check('PK 컬럼 정의 (INT NOT NULL)', /`id` INT NOT NULL/.test(sql));
  check('Entity1 PRIMARY KEY', /CREATE TABLE `Entity1`[\s\S]*?PRIMARY KEY \(`id`\)/.test(sql));

  // 추가한 일반 컬럼 — 기본 VARCHAR(255), NULL 허용
  check('일반 컬럼 VARCHAR(255) NULL', sql.includes('`column` VARCHAR(255) NULL'));

  // 식별 관계 FK — 자식 PK에 포함 + FK 제약
  check('FK 컬럼 생성 (entity1_id)', /`entity1_id` INT NOT NULL/.test(sql));
  check('복합 PRIMARY KEY (식별 관계)', /CREATE TABLE `Entity2`[\s\S]*?PRIMARY KEY \(`id`, `entity1_id`\)/.test(sql));
  check('FOREIGN KEY 제약',
    sql.includes('CONSTRAINT `fk_Entity2_Entity1` FOREIGN KEY (`entity1_id`) REFERENCES `Entity1` (`id`)'));

  check('테이블 옵션 (InnoDB/utf8mb4)', (sql.match(/ENGINE=InnoDB DEFAULT CHARSET=utf8mb4/g) ?? []).length === 2);

  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_sql_export.png' });

  // ───── 요약 ─────
  const failed = results.filter(r => !r.pass);
  console.log(`\n총 ${results.length}개 중 ${results.length - failed.length} PASS / ${failed.length} FAIL`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_sql_export_error.png' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
