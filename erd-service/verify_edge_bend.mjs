// 관계선 중간 우회(꺾기) 검증
// A—B 사이에 제3의 엔티티가 놓여 관계선을 가릴 때, 선을 위/아래로 드래그하면
// 좌/우 구간이 늘어나며 우회 경로가 만들어진다. 끝점 부착 위치는 그대로,
// 축(좌우 배치=상/하 드래그) 제약, 클릭 선택 보존, 더블클릭·모달 버튼으로 복귀, Undo/Redo.
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

// verify_edge_anchor.mjs의 헬퍼 패턴 재사용 — 핸들 hover → 드래그로 관계 생성
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

// 엣지 경로를 플로우 좌표로 샘플링 (getBBox/getPointAtLength는 조상 transform 미포함 = 플로우 좌표)
const pathGeo = () => page.locator('.react-flow__edge').nth(0).evaluate(g => {
  const path = g.querySelector('path');
  const len = path.getTotalLength();
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const p = path.getPointAtLength((len * i) / 40);
    pts.push({ x: p.x, y: p.y, at: i / 40 });
  }
  const b = path.getBBox();
  return {
    d: path.getAttribute('d'),
    len, pts,
    top: b.y, bottom: b.y + b.height, left: b.x, right: b.x + b.width,
    s: pts[0], t: pts[40],
    zoom: path.getScreenCTM().a,
  };
});

const nodeRect = idx => page.locator('.react-flow__node').nth(idx).evaluate(el => {
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform);
  return { x: +m[1], y: +m[2], w: el.offsetWidth, h: el.offsetHeight };
});

const zoomNow = () => page.locator('.react-flow__viewport').evaluate(el => {
  const m = /scale\(([\d.]+)\)/.exec(el.style.transform);
  return m ? +m[1] : 1;
});

const inside = (p, r, pad = 0) =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

// 선을 잡을 수 있는 화면 좌표 — 노드 박스(엣지보다 위 레이어)와 ✎ 아이콘을 피한 경로상의 점.
// 아이콘도 드래그를 받지만, 여기서는 '선 자체'를 끄는 동작을 검증하므로 제외한다.
async function pickLinePoint() {
  const geo = await pathGeo();
  const rects = [await nodeRect(0), await nodeRect(1), await nodeRect(2)];
  const free = geo.pts.filter(p => !rects.some(r => inside(p, r, 16)));
  if (!free.length) throw new Error('경로 위에 노드와 겹치지 않는 점이 없음');
  const screens = await page.locator('.react-flow__edge').nth(0).evaluate((g, pts) => {
    const m = g.querySelector('path').getScreenCTM();
    return pts.map(p => ({ x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f, at: p.at }));
  }, free);
  const iconBox = await page.locator('[data-testid="edge-edit-icon"]').count()
    ? await page.locator('[data-testid="edge-edit-icon"]').boundingBox()
    : null;
  const ic = iconBox ? { x: iconBox.x + iconBox.width / 2, y: iconBox.y + iconBox.height / 2 } : null;
  const ok = screens.filter(p => !ic || Math.hypot(p.x - ic.x, p.y - ic.y) > 26);
  if (!ok.length) throw new Error('✎ 아이콘을 피한 드래그 지점이 없음');
  ok.sort((a, b) => Math.abs(a.at - 0.5) - Math.abs(b.at - 0.5));
  return ok[0];
}

async function dragFrom(s, dx, dy) {
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.waitForTimeout(60);
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(s.x + (dx * i) / 20, s.y + (dy * i) / 20);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
}

const dragLine = async (dx, dy) => dragFrom(await pickLinePoint(), dx, dy);

async function clickEdge() {
  const s = await pickLinePoint();
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(400);
}

async function deselect() {
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(300);
}

// 노드를 헤더(이름 영역)에서 잡아 이동 — 기본 그리드 간격(260px, 노드 폭 250px)이 너무 촘촘해
// 선을 잡을 빈 구간이 없으므로 대상 엔티티를 오른쪽으로 벌려 놓는다.
async function dragNode(idx, dx, dy) {
  const b = await page.locator('.react-flow__node').nth(idx).boundingBox();
  const fx = b.x + 40, fy = b.y + 12;
  await page.mouse.move(fx, fy);
  await page.mouse.down();
  await page.waitForTimeout(60);
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(fx + (dx * i) / 20, fy + (dy * i) / 20);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
}

// 아래로 우회한 상태에서 양쪽 '다리'(우회선까지 이어지는 수직 구간)의 x.
// 최하단 y에 놓인 샘플점들의 최좌측=부모 쪽 다리, 최우측=자식 쪽 다리.
const legXs = async () => {
  const geo = await pathGeo();
  const onRun = geo.pts.filter(p => Math.abs(p.y - geo.bottom) < 2);
  return { s: Math.min(...onRun.map(p => p.x)), t: Math.max(...onRun.map(p => p.x)) };
};

const toScreenPt = pt => page.locator('.react-flow__edge').nth(0).evaluate((g, p) => {
  const m = g.querySelector('path').getScreenCTM();
  return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
}, pt);

// 지정한 구간(부모 다리 / 우회선 / 자식 다리) 위의 화면 좌표 — 구간별 독립 드래그 검증용
async function grabPointOn(which) {
  const geo = await pathGeo();
  const onRun = geo.pts.filter(p => Math.abs(p.y - geo.bottom) < 2);
  const lx = Math.min(...onRun.map(p => p.x)), rx = Math.max(...onRun.map(p => p.x));
  // 다리 = 우회선 높이에서 벗어난 구간. 경로 진행률(at)로 부모/자식 쪽을 가른다
  // (라운드 코너 때문에 x를 legX와 정확히 비교하면 어긋난다)
  const cands = which === 'channel'
    ? onRun
    : geo.pts.filter(p =>
        Math.abs(p.y - geo.bottom) > 12 && (which === 'sourceLeg' ? p.at < 0.5 : p.at > 0.5));
  if (!cands.length) {
    throw new Error(`구간 ${which} 위에서 잡을 점을 찾지 못함 — bottom=${geo.bottom.toFixed(1)} ` +
      `onRun=${onRun.length} lx=${lx.toFixed(1)} rx=${rx.toFixed(1)} ` +
      `ys=${geo.pts.map(p => p.y.toFixed(0)).join(',')}`);
  }
  return toScreenPt(cands[Math.floor(cands.length / 2)]);
}

const crosses = async idx => {
  const geo = await pathGeo();
  const r = await nodeRect(idx);
  return geo.pts.some(p => inside(p, r));
};

const childPk = () => page.locator('.react-flow__node').nth(2).locator('[title="Primary Key"]').count();
const childFk = () => page.locator('.react-flow__node').nth(2).locator('[title="Foreign Key"]').count();

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // ── 준비: 엔티티 3개(가로 한 줄) + 0번→2번 관계 → 1번 엔티티가 선을 가로막는 배치 ──
  for (let i = 0; i < 3; i++) {
    await page.click('button:has-text("Add Entity")');
    await page.waitForTimeout(300);
  }
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(500);
  await dragNode(2, 450, 0);      // 2번을 오른쪽으로 벌려 선 중간에 빈 구간 확보
  await page.click('button[title="Fit View"]');
  await page.waitForTimeout(500);
  // 1번(장애물)을 0번·2번 정중앙으로 — 기본 그리드는 노드가 10px 간격으로 붙어 있어
  // "사이에 떠 있는 엔티티가 선을 가린다"는 실제 상황이 되지 않는다
  {
    const [r0, r1, r2] = [await nodeRect(0), await nodeRect(1), await nodeRect(2)];
    const desiredX = (r0.x + r0.w + r2.x) / 2 - r1.w / 2;
    await dragNode(1, (desiredX - r1.x) * (await zoomNow()), 0);
  }
  await deselect();

  const relOk = await drawRelationship(0, 2, '1:M 비식별 (점선 + 실선)');
  check('준비: 엔티티 3개 + 관계 1개', relOk && await page.locator('.react-flow__edge').count() === 1);

  const pk0 = await childPk(), fk0 = await childFk();
  const auto = await pathGeo();
  check('자동 경로가 중간 엔티티를 통과(우회 필요 상황 재현)', await crosses(1),
    `path y=${auto.s.y.toFixed(0)}~${auto.t.y.toFixed(0)}`);

  // ── 1. 선을 아래로 드래그 → 우회 경로 ──
  const DRAG = 220;
  await dragLine(0, DRAG);
  const bent = await pathGeo();
  const expected = (DRAG / auto.zoom) * 0.7;
  check('선을 아래로 드래그 → 경로가 아래로 늘어남',
    bent.bottom > auto.bottom + expected,
    `bottom ${auto.bottom.toFixed(0)} → ${bent.bottom.toFixed(0)} (zoom ${auto.zoom.toFixed(2)})`);
  check('우회 후 중간 엔티티를 통과하지 않음', !(await crosses(1)));
  check('끝점 부착 위치는 그대로 (끝점 이동 기능과 독립)',
    Math.abs(bent.s.x - auto.s.x) < 3 && Math.abs(bent.s.y - auto.s.y) < 3 &&
    Math.abs(bent.t.x - auto.t.x) < 3 && Math.abs(bent.t.y - auto.t.y) < 3,
    `s=(${bent.s.x.toFixed(0)},${bent.s.y.toFixed(0)}) t=(${bent.t.x.toFixed(0)},${bent.t.y.toFixed(0)})`);
  check('좌/우 구간이 늘어나 총 경로 길이 증가', bent.len > auto.len + expected);
  check('직각 꺾임 경로 — Q(라운드 코너) 4개 이상',
    (bent.d.match(/Q/g) ?? []).length >= 4, `Q×${(bent.d.match(/Q/g) ?? []).length}`);
  check('우회는 순수 기하 — 자식 PK/FK 무변경', await childPk() === pk0 && await childFk() === fk0);

  // ── 2. 좌/우 드래그 — 잡은 쪽 '다리'(우회선까지 이어지는 수직 구간)만 옆으로 이동한다.
  //      반대쪽 다리와 우회선 높이는 그대로여야 한다(구간별 독립 편집) ──
  await page.waitForTimeout(900);   // relMid coalesce 창 만료
  const leg0 = await legXs();
  await dragFrom(await grabPointOn('sourceLeg'), 200, 0);
  const legS1 = await legXs();
  const afterH = await pathGeo();
  check('부모 쪽 다리를 좌/우로 끌면 그 다리만 이동',
    legS1.s > leg0.s + expected && Math.abs(legS1.t - leg0.t) < 3,
    `부모 ${leg0.s.toFixed(0)}→${legS1.s.toFixed(0)} · 자식 ${leg0.t.toFixed(0)}→${legS1.t.toFixed(0)}`);
  check('다리 이동은 우회선 높이를 바꾸지 않음',
    Math.abs(afterH.bottom - bent.bottom) < 2 && Math.abs(afterH.top - bent.top) < 2,
    `bottom ${bent.bottom.toFixed(0)} → ${afterH.bottom.toFixed(0)}`);
  check('다리 이동 후에도 끝점 부착 위치 불변',
    Math.abs(afterH.s.x - auto.s.x) < 3 && Math.abs(afterH.t.x - auto.t.x) < 3);

  await page.waitForTimeout(900);
  await dragFrom(await grabPointOn('targetLeg'), -150, 0);
  const legT1 = await legXs();
  check('자식 쪽 다리도 독립으로 이동 (부모 쪽 그대로)',
    legT1.t < legS1.t - expected * 0.6 && Math.abs(legT1.s - legS1.s) < 3,
    `자식 ${legS1.t.toFixed(0)}→${legT1.t.toFixed(0)} · 부모 ${legS1.s.toFixed(0)}→${legT1.s.toFixed(0)}`);
  // 양쪽 다리를 서로 다르게 옮긴 상태 — 구간별 독립 편집 결과 기록
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_edge_bend_legs.png' });

  await page.waitForTimeout(900);
  await dragFrom(await grabPointOn('channel'), 200, 0);
  const legC = await legXs();
  check('우회선을 좌/우로 끌어도 다리는 움직이지 않음',
    Math.abs(legC.s - legT1.s) < 3 && Math.abs(legC.t - legT1.t) < 3 &&
    Math.abs((await pathGeo()).bottom - bent.bottom) < 2);

  // 이후 단계의 기준(bent)과 맞추기 위해 다리 이동 2건을 Undo로 되돌린다
  // (우회선 좌/우 드래그는 값 변화가 없어 히스토리에 남지 않음)
  for (let i = 0; i < 2; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(450); }
  const legUndo = await legXs();
  check('다리 이동도 각각 Undo 1회로 복원',
    Math.abs(legUndo.s - leg0.s) < 4 && Math.abs(legUndo.t - leg0.t) < 4,
    `부모 ${legUndo.s.toFixed(0)} (기준 ${leg0.s.toFixed(0)}) · 자식 ${legUndo.t.toFixed(0)} (기준 ${leg0.t.toFixed(0)})`);

  // ── 3. 클릭(이동 없음)은 여전히 선택 — 우회가 생기지 않는다 ──
  await deselect();
  await clickEdge();
  const afterClick = await pathGeo();
  check('선 클릭 → 엣지 선택(✎ 아이콘 노출)',
    await page.locator('[data-testid="edge-edit-icon"]').count() === 1);
  check('클릭만으로는 우회가 생기지 않음(3px 임계값)',
    Math.abs(afterClick.bottom - bent.bottom) < 2);

  // ── 4. ✎ 아이콘이 우회된 선 위에 있다 (꺾인 경로의 중간 구간 중앙) ──
  const icon = await page.locator('[data-testid="edge-edit-icon"]').boundingBox();
  const iconOnPath = await page.locator('.react-flow__edge').nth(0).evaluate((g, c) => {
    const path = g.querySelector('path');
    const m = path.getScreenCTM();
    const len = path.getTotalLength();
    let best = Infinity;
    for (let i = 0; i <= 200; i++) {
      const p = path.getPointAtLength((len * i) / 200);
      const sx = p.x * m.a + p.y * m.c + m.e;
      const sy = p.x * m.b + p.y * m.d + m.f;
      best = Math.min(best, Math.hypot(sx - c.x, sy - c.y));
    }
    return best;
  }, { x: icon.x + icon.width / 2, y: icon.y + icon.height / 2 });
  check('✎ 아이콘이 우회된 선 위에 위치', iconOnPath < 12, `거리 ${iconOnPath.toFixed(1)}px`);

  // ── 4-b. 선 중앙을 덮는 ✎ 아이콘에서 드래그해도 우회가 조절된다 (클릭=편집, 드래그=우회) ──
  await page.waitForTimeout(900);
  await dragFrom({ x: icon.x + icon.width / 2, y: icon.y + icon.height / 2 }, 0, 90);
  const iconDrag = await pathGeo();
  check('✎ 아이콘에서 드래그해도 우회 조절됨', iconDrag.bottom > bent.bottom + 30,
    `bottom ${bent.bottom.toFixed(0)} → ${iconDrag.bottom.toFixed(0)}`);
  check('아이콘 드래그는 편집 모달을 열지 않음',
    await page.locator('[data-testid="rel-panel"]').count() === 0);
  await page.waitForTimeout(900);
  await page.keyboard.press('Control+z');   // 이후 단계 기준값(bent)으로 되돌림
  await page.waitForTimeout(500);
  check('아이콘 드래그도 Undo 1회로 복원',
    Math.abs((await pathGeo()).bottom - bent.bottom) < 3);

  // ── 5. 선택 해제 → 재선택해도 우회 유지 (스토어 영속) ──
  await deselect();
  const afterDeselect = await pathGeo();
  check('선택 해제 후에도 우회 유지', Math.abs(afterDeselect.bottom - bent.bottom) < 2);

  // ── 6. Undo/Redo ──
  await page.waitForTimeout(900);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  const undo1 = await pathGeo();
  check('Undo → 자동 경로로 복귀', Math.abs(undo1.bottom - auto.bottom) < 12,
    `bottom ${undo1.bottom.toFixed(0)} vs auto ${auto.bottom.toFixed(0)}`);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(500);
  const redo1 = await pathGeo();
  check('Redo → 우회 재적용', redo1.bottom > auto.bottom + expected);

  // ── 7. 선 더블클릭 → 자동 경로 복귀 ──
  const dpt = await pickLinePoint();
  await page.mouse.dblclick(dpt.x, dpt.y);
  await page.waitForTimeout(500);
  const afterDbl = await pathGeo();
  check('선 더블클릭 → 자동 경로 복귀', Math.abs(afterDbl.bottom - auto.bottom) < 12,
    `bottom ${afterDbl.bottom.toFixed(0)}`);
  check('더블클릭이 메모를 만들지 않음', await page.locator('.react-flow__node').count() === 3);

  // ── 8. 편집 모달 '우회 해제' 버튼 — 우회가 없으면 숨김, 있으면 노출 후 복귀 ──
  await deselect();
  await clickEdge();
  await page.locator('[data-testid="edge-edit-icon"]').click();
  await page.waitForTimeout(400);
  check('우회 없을 때 모달에 "우회 해제" 버튼 없음',
    await page.locator('[data-testid="rel-reset-bend"]').count() === 0);
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(300);
  await deselect();
  await page.waitForTimeout(900);

  await dragLine(0, -DRAG);   // 위로도 우회 가능
  const up = await pathGeo();
  check('선을 위로 드래그 → 위로 우회', up.top < auto.top - expected,
    `top ${auto.top.toFixed(0)} → ${up.top.toFixed(0)}`);
  check('위로 우회해도 중간 엔티티 통과하지 않음', !(await crosses(1)));

  await clickEdge();
  await page.locator('[data-testid="edge-edit-icon"]').click();
  await page.waitForTimeout(400);
  check('우회 있을 때 모달에 "우회 해제" 버튼 노출',
    await page.locator('[data-testid="rel-reset-bend"]').count() === 1);
  await page.click('[data-testid="rel-reset-bend"]');
  await page.waitForTimeout(400);
  const afterBtn = await pathGeo();
  check('"우회 해제" 클릭 → 자동 경로 복귀', Math.abs(afterBtn.bottom - auto.bottom) < 12,
    `bottom ${afterBtn.bottom.toFixed(0)}`);
  await page.click('[data-testid="editor-modal-close"]');
  await page.waitForTimeout(300);

  // ── 9. 양 끝점을 하단 면에 붙인 좌우 배치 — 선이 가로로 달리므로 상/하 드래그가 먹어야 한다.
  //      (축을 '부모 연결 면'으로 판정하던 버그: 하단 면이면 x축으로 잡혀 상/하가 무반응이었음) ──
  await deselect();
  await clickEdge();
  const srcBox = await page.locator('.react-flow__node').nth(0).boundingBox();
  const tgtBox = await page.locator('.react-flow__node').nth(2).boundingBox();
  for (const [end, box] of [['source', srcBox], ['target', tgtBox]]) {
    const h = await page.locator(`[data-testid="edge-anchor-${end}"]`).boundingBox();
    const fx = h.x + h.width / 2, fy = h.y + h.height / 2;
    const toX = box.x + box.width / 2, toY = box.y + box.height - 3;
    await page.mouse.move(fx, fy);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(fx + (toX - fx) * i / 20, fy + (toY - fy) * i / 20);
      await page.waitForTimeout(12);
    }
    await page.mouse.up();
    await page.waitForTimeout(350);
  }
  const bottomAuto = await pathGeo();
  const [fr0, fr2] = [await nodeRect(0), await nodeRect(2)];   // 플로우 좌표로 비교
  check('양 끝점을 하단 면으로 이동 (좌우 배치 유지)',
    Math.abs(bottomAuto.s.y - (fr0.y + fr0.h)) < 12 &&
    Math.abs(bottomAuto.t.y - (fr2.y + fr2.h)) < 12 &&
    Math.abs(bottomAuto.t.x - bottomAuto.s.x) > Math.abs(bottomAuto.t.y - bottomAuto.s.y),
    `s=(${bottomAuto.s.x.toFixed(0)},${bottomAuto.s.y.toFixed(0)}) 하단=${(fr0.y + fr0.h).toFixed(0)} · ` +
    `t=(${bottomAuto.t.x.toFixed(0)},${bottomAuto.t.y.toFixed(0)}) 하단=${(fr2.y + fr2.h).toFixed(0)}`);

  await deselect();
  await page.waitForTimeout(900);
  await dragLine(0, DRAG);
  const bottomBent = await pathGeo();
  check('하단 면 부착 상태에서도 상/하 드래그로 우회됨',
    bottomBent.bottom > bottomAuto.bottom + expected,
    `bottom ${bottomAuto.bottom.toFixed(0)} → ${bottomBent.bottom.toFixed(0)}`);
  check('하단 면 우회 후에도 끝점은 하단 면 유지',
    Math.abs(bottomBent.s.x - bottomAuto.s.x) < 3 && Math.abs(bottomBent.s.y - bottomAuto.s.y) < 3 &&
    Math.abs(bottomBent.t.x - bottomAuto.t.x) < 3 && Math.abs(bottomBent.t.y - bottomAuto.t.y) < 3);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_edge_bend_bottom.png' });

  // 스크린샷용으로 끝점 앵커를 자동으로 복귀시킨 뒤 다시 우회 상태 만들기
  await clickEdge();
  for (const end of ['source', 'target']) {
    await page.locator(`[data-testid="edge-anchor-${end}"]`).dblclick();
    await page.waitForTimeout(400);
  }
  await deselect();
  await page.waitForTimeout(900);
  await dragLine(0, DRAG);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_edge_bend.png' });

  const failed = results.filter(r => !r.pass);
  console.log(`\n총 ${results.length}개 중 ${results.length - failed.length} PASS / ${failed.length} FAIL`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: 'C:/project/harness-test/erd-service/ss_edge_bend_error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
