import { Entity, Column, Subtype } from '../types/erd';

// MySQL DDL 생성 — 엔티티/컬럼(FK 메타 포함)을 CREATE TABLE 스크립트로 변환
// - 타입 매핑: UUID→CHAR(36), VARCHAR/CHAR/DECIMAL/FLOAT는 size 반영, 나머지는 그대로
// - 논리명 → COMMENT, 엔티티 설명은 테이블 COMMENT에 병기
// - FK: refEntityId별로 묶어 복합 FOREIGN KEY 제약 생성 (참조 대상이 없으면 일반 컬럼으로만 출력)
// - 테이블 순서: 부모 우선 토폴로지 정렬, 순환 대비 FOREIGN_KEY_CHECKS 비활성 래핑

const q = (ident: string) => `\`${ident.replace(/`/g, '``')}\``;
const comment = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;

function mysqlType(col: Column): string {
  const size = col.size.trim();
  switch (col.type) {
    case 'UUID': return 'CHAR(36)'; // MySQL은 UUID 타입이 없음
    case 'VARCHAR': return `VARCHAR(${size || '255'})`;
    case 'CHAR': return `CHAR(${size || '1'})`;
    case 'DECIMAL': return `DECIMAL(${size || '10,2'})`;
    case 'FLOAT': return size ? `FLOAT(${size})` : 'FLOAT';
    default: return col.type;
  }
}

function columnLine(col: Column): string {
  const parts = [q(col.name), mysqlType(col)];
  if (col.isNN || col.isPK) parts.push('NOT NULL');
  else parts.push('NULL');
  if (col.isUnique && !col.isPK) parts.push('UNIQUE');
  if (col.logicalName?.trim()) parts.push(`COMMENT ${comment(col.logicalName.trim())}`);
  return parts.join(' ');
}

// 배타적 서브타입 → 단일 테이블 롤업: 구분자 컬럼 + 서브타입 고유 컬럼(전부 nullable) + 배타 CHECK
// - 구분자(판별자) 컬럼명 = SubSet 이름. 완전(complete)이면 NOT NULL.
// - 컬럼명이 슈퍼타입/다른 서브타입과 충돌하면 _서브타입명 접미사로 회피.
// - exclusive면 "구분자 값에 해당하지 않는 서브타입 컬럼은 NULL" CHECK 생성, 불완전이면 구분자 NULL(슈퍼타입만) 케이스 허용.
function buildSubtypeDDL(entity: Entity): { columnLines: string[]; checkLines: string[] } {
  const subtypes = entity.subtypes ?? [];
  if (subtypes.length === 0) return { columnLines: [], checkLines: [] };

  const discName = entity.subsetName?.trim() || 'SubSet';
  const complete = entity.subtypeComplete ?? false;
  const exclusive = entity.subtypeExclusive ?? true;

  const used = new Set(entity.columns.map(c => c.name.toLowerCase()));
  used.add(discName.toLowerCase());

  const columnLines: string[] = [];
  // 구분자(판별자) 컬럼
  columnLines.push(
    `  ${[q(discName), 'VARCHAR(30)', complete ? 'NOT NULL' : 'NULL', `COMMENT ${comment(`${discName} 구분자`)}`].join(' ')}`
  );

  // 서브타입 고유 컬럼 (충돌 회피 후 nullable로 평탄화)
  const renamed: { subtype: Subtype; cols: string[] }[] = [];
  for (const st of subtypes) {
    const cols: string[] = [];
    for (const c of st.columns) {
      let name = c.name;
      if (used.has(name.toLowerCase())) name = `${c.name}_${st.name}`;
      used.add(name.toLowerCase());
      const cmt = [st.name, c.logicalName?.trim()].filter(Boolean).join(': ');
      columnLines.push(`  ${[q(name), mysqlType(c), 'NULL', `COMMENT ${comment(cmt)}`].join(' ')}`);
      cols.push(name);
    }
    renamed.push({ subtype: st, cols });
  }

  const checkLines: string[] = [];
  // 구분자 도메인 제약
  checkLines.push(`  CHECK (${q(discName)} IN (${subtypes.map(st => comment(st.name)).join(', ')}))`);

  // 배타성 제약
  if (exclusive) {
    const allCols = renamed.flatMap(r => r.cols);
    if (allCols.length > 0) {
      const conds = renamed.map(r => {
        const others = renamed.filter(x => x.subtype.id !== r.subtype.id).flatMap(x => x.cols);
        const nulls = others.map(c => `${q(c)} IS NULL`);
        return `(${q(discName)} = ${comment(r.subtype.name)}${nulls.length ? ' AND ' + nulls.join(' AND ') : ''})`;
      });
      if (!complete) {
        conds.push(`(${q(discName)} IS NULL AND ${allCols.map(c => `${q(c)} IS NULL`).join(' AND ')})`);
      }
      checkLines.push(`  CHECK (\n    ${conds.join(' OR\n    ')}\n  )`);
    }
  }

  return { columnLines, checkLines };
}

// 부모 우선 정렬 (Kahn) — FK 참조 기준, 순환은 원래 순서대로 뒤에 붙임
function sortParentsFirst(entities: Entity[]): Entity[] {
  const ids = new Set(entities.map(e => e.id));
  const inDeg = new Map(entities.map(e => [e.id, 0]));
  const children = new Map<string, string[]>(entities.map(e => [e.id, []]));
  for (const e of entities) {
    const parents = new Set(
      e.columns.filter(c => c.isFK && c.refEntityId && ids.has(c.refEntityId) && c.refEntityId !== e.id)
        .map(c => c.refEntityId!)
    );
    for (const p of parents) {
      children.get(p)!.push(e.id);
      inDeg.set(e.id, inDeg.get(e.id)! + 1);
    }
  }
  const sorted: Entity[] = [];
  const queue = entities.filter(e => inDeg.get(e.id) === 0);
  const byId = new Map(entities.map(e => [e.id, e]));
  while (queue.length) {
    const e = queue.shift()!;
    sorted.push(e);
    for (const cid of children.get(e.id)!) {
      inDeg.set(cid, inDeg.get(cid)! - 1);
      if (inDeg.get(cid) === 0) queue.push(byId.get(cid)!);
    }
  }
  // 순환 참여 테이블 — FOREIGN_KEY_CHECKS=0 래핑으로 실행은 가능
  for (const e of entities) if (!sorted.includes(e)) sorted.push(e);
  return sorted;
}

export function generateMySQLDDL(entities: Entity[]): string {
  const byId = new Map(entities.map(e => [e.id, e]));
  const usedFkNames = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);

  const tables = sortParentsFirst(entities).map(entity => {
    const lines = entity.columns.map(c => `  ${columnLine(c)}`);

    // 배타적 서브타입 → 구분자 + 서브타입 컬럼 (컬럼 정의이므로 제약보다 먼저)
    const sub = buildSubtypeDDL(entity);
    lines.push(...sub.columnLines);

    const pkCols = entity.columns.filter(c => c.isPK);
    if (pkCols.length > 0) {
      lines.push(`  PRIMARY KEY (${pkCols.map(c => q(c.name)).join(', ')})`);
    }

    // 서브타입 배타성/도메인 CHECK 제약
    lines.push(...sub.checkLines);

    // FK 제약 — 같은 부모를 참조하는 컬럼끼리 복합 제약으로 묶음
    const fkGroups = new Map<string, Column[]>();
    for (const c of entity.columns) {
      if (!c.isFK || !c.refEntityId || !byId.has(c.refEntityId)) continue;
      const parent = byId.get(c.refEntityId)!;
      if (!parent.columns.some(pc => pc.id === c.refColumnId)) continue; // 참조 컬럼 소실 시 제약 생략
      const group = fkGroups.get(c.refEntityId) ?? [];
      group.push(c);
      fkGroups.set(c.refEntityId, group);
    }
    for (const [refId, cols] of fkGroups) {
      const parent = byId.get(refId)!;
      let name = `fk_${entity.name}_${parent.name}`;
      for (let i = 2; usedFkNames.has(name); i++) name = `fk_${entity.name}_${parent.name}_${i}`;
      usedFkNames.add(name);
      const refCols = cols.map(c => parent.columns.find(pc => pc.id === c.refColumnId)!);
      lines.push(
        `  CONSTRAINT ${q(name)} FOREIGN KEY (${cols.map(c => q(c.name)).join(', ')})` +
        ` REFERENCES ${q(parent.name)} (${refCols.map(c => q(c.name)).join(', ')})`
      );
    }

    const tableComment = [entity.logicalName?.trim(), entity.description?.trim()]
      .filter(Boolean).join(' — ');
    const options = ['ENGINE=InnoDB', 'DEFAULT CHARSET=utf8mb4'];
    if (tableComment) options.push(`COMMENT=${comment(tableComment)}`);

    return `CREATE TABLE ${q(entity.name)} (\n${lines.join(',\n')}\n) ${options.join(' ')};`;
  });

  return [
    `-- Generated by EasyERD (${today})`,
    '-- Target: MySQL 8.x',
    '',
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
    tables.join('\n\n'),
    '',
    'SET FOREIGN_KEY_CHECKS = 1;',
    '',
  ].join('\n');
}

// .sql 파일 다운로드
export function exportDiagramSql(entities: Entity[]): void {
  if (entities.length === 0) return;
  const sql = generateMySQLDDL(entities);
  const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `erd-${new Date().toISOString().slice(0, 10)}.sql`;
  a.click();
  URL.revokeObjectURL(url);
}
