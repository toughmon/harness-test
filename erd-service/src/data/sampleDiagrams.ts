import * as erdOps from '../core/erdOps';
import type { ErdDoc, NodePosition } from '../core/erdOps';
import type { RelationshipType } from '../types/erd';

// ──────────────────────────────────────────────────────────────────────────
// 온보딩용 샘플 다이어그램 — 신규 방문자가 /app을 처음 열었을 때 빈 캔버스 대신
// 보여주는 예제 3종. core/erdOps의 순수 함수(addEntity/addColumn/addRelationship)를
// 그대로 호출해서 빌드하므로, 실제 앱에서 사용자가 손으로 그렸을 때와 정확히 같은
// FK 자동생성 규칙(식별/비식별/선택 → PK·NN 플래그, 자기참조 시 parent_ 접두어 등)이
// 적용된다. 엔티티/컬럼 구성은 mcp/create_ecommerce_erd.mjs·create_blog_erd.mjs의
// 정의와 맞춰 두 데모 경로(웹 UI 예제, MCP 스크립트 예제)가 서로 다른 소리를 내지
// 않도록 했다.
// ──────────────────────────────────────────────────────────────────────────

export type SampleKey = 'ecommerce' | 'blog' | 'hr';

export const SAMPLE_KEYS: SampleKey[] = ['ecommerce', 'blog', 'hr'];

// 작은 빌더 DSL — 지역 스코프 안에서만 doc을 순차 갱신한다(erdOps 자체는 순수 유지).
function builder() {
  let doc: ErdDoc = { entities: [], relationships: [], nodePositions: {}, memos: [] };
  return {
    entity(name: string, logicalName: string, position: NodePosition): string {
      const r = erdOps.addEntity(doc, { name, logicalName, withDefaultId: false, position });
      doc = r.doc;
      return r.entityId;
    },
    column(entityId: string, col: Parameters<typeof erdOps.addColumn>[2]) {
      doc = erdOps.addColumn(doc, entityId, col).doc;
    },
    relate(sourceId: string, targetId: string, type: RelationshipType) {
      doc = erdOps.addRelationship(doc, sourceId, targetId, type).doc;
    },
    build(): ErdDoc {
      return doc;
    },
  };
}

function buildEcommerce(): ErdDoc {
  const b = builder();

  const user = b.entity('user', '사용자', { x: 40, y: 40 });
  b.column(user, { name: 'user_id', logicalName: '사용자아이디', type: 'INT', isPK: true, isNN: true });
  b.column(user, { name: 'email', logicalName: '이메일(로그인아이디)', type: 'VARCHAR', size: '255', isNN: true, isUnique: true });
  b.column(user, { name: 'name', logicalName: '사용자명', type: 'VARCHAR', size: '255', isNN: true });

  const order = b.entity('order', '주문', { x: 380, y: 40 });
  b.column(order, { name: 'order_id', logicalName: '주문아이디', type: 'INT', isPK: true, isNN: true });
  b.column(order, { name: 'total_price', logicalName: '총주문금액', type: 'BIGINT', isNN: true });
  b.column(order, { name: 'ordered_at', logicalName: '주문일시', type: 'DATETIME', isNN: true });

  const payment = b.entity('payment', '결제', { x: 720, y: 40 });
  b.column(payment, { name: 'payment_id', logicalName: '결제아이디', type: 'BIGINT', isPK: true, isNN: true });
  b.column(payment, { name: 'paid_price', logicalName: '결제금액', type: 'BIGINT', isNN: true });
  b.column(payment, { name: 'paid_at', logicalName: '결제일시', type: 'DATETIME', isNN: true });

  const product = b.entity('product', '상품', { x: 40, y: 300 });
  b.column(product, { name: 'product_id', logicalName: '상품아이디', type: 'INT', isPK: true, isNN: true });
  b.column(product, { name: 'name', logicalName: '상품명', type: 'VARCHAR', size: '500', isNN: true });
  b.column(product, { name: 'price', logicalName: '상품가격', type: 'INT', isNN: true });
  b.column(product, { name: 'stock', logicalName: '재고수량', type: 'INT', isNN: true });

  const orderProduct = b.entity('order_product', '주문상품', { x: 380, y: 300 });
  b.column(orderProduct, { name: 'quantity', logicalName: '수량', type: 'INT', isNN: true });

  // user 1:M order (비식별 — user_id가 order PK 아님)
  b.relate(user, order, 'ONE_TO_MANY_NON_IDENTIFYING');
  // order 1:M order_product (식별 — order_id가 order_product PK)
  b.relate(order, orderProduct, 'ONE_TO_MANY_IDENTIFYING');
  // product 1:M order_product (식별 — product_id가 order_product PK)
  b.relate(product, orderProduct, 'ONE_TO_MANY_IDENTIFYING');
  // order 1:M payment (식별 — order_id가 payment PK에 포함)
  b.relate(order, payment, 'ONE_TO_MANY_IDENTIFYING');

  return b.build();
}

function buildBlog(): ErdDoc {
  const b = builder();

  const user = b.entity('User', '사용자', { x: 40, y: 40 });
  b.column(user, { name: 'user_id', logicalName: '사용자아이디', type: 'INT', isPK: true, isNN: true });
  b.column(user, { name: 'nickname', logicalName: '닉네임', type: 'VARCHAR', size: '100', isNN: true });
  b.column(user, { name: 'email', logicalName: '이메일', type: 'VARCHAR', size: '200', isNN: true, isUnique: true });
  b.column(user, { name: 'created_at', logicalName: '가입일', type: 'DATETIME', isNN: true });

  const post = b.entity('Post', '게시글', { x: 380, y: 40 });
  b.column(post, { name: 'post_id', logicalName: '게시글아이디', type: 'INT', isPK: true, isNN: true });
  b.column(post, { name: 'title', logicalName: '제목', type: 'VARCHAR', size: '500', isNN: true });
  b.column(post, { name: 'content', logicalName: '본문', type: 'TEXT' });
  b.column(post, { name: 'published_at', logicalName: '게시일', type: 'DATETIME' });

  const comment = b.entity('Comment', '댓글', { x: 720, y: 40 });
  b.column(comment, { name: 'comment_id', logicalName: '댓글아이디', type: 'INT', isPK: true, isNN: true });
  b.column(comment, { name: 'content', logicalName: '내용', type: 'TEXT', isNN: true });
  b.column(comment, { name: 'created_at', logicalName: '작성일', type: 'DATETIME', isNN: true });

  const postTag = b.entity('PostTag', '게시글-태그', { x: 380, y: 300 });

  const tag = b.entity('Tag', '태그', { x: 720, y: 300 });
  b.column(tag, { name: 'tag_id', logicalName: '태그아이디', type: 'INT', isPK: true, isNN: true });
  b.column(tag, { name: 'name', logicalName: '태그명', type: 'VARCHAR', size: '100', isNN: true, isUnique: true });

  // User 1:M Post (비식별)
  b.relate(user, post, 'ONE_TO_MANY_NON_IDENTIFYING');
  // Post 1:M Comment (식별 — post_id가 Comment PK에 포함)
  b.relate(post, comment, 'ONE_TO_MANY_IDENTIFYING');
  // User 1:M Comment (비식별)
  b.relate(user, comment, 'ONE_TO_MANY_NON_IDENTIFYING');
  // Post 1:M PostTag (식별 — post_id가 PostTag 복합 PK)
  b.relate(post, postTag, 'ONE_TO_MANY_IDENTIFYING');
  // Tag 1:M PostTag (비식별 — tag_id는 PostTag PK에 비포함)
  b.relate(tag, postTag, 'ONE_TO_MANY_NON_IDENTIFYING');

  return b.build();
}

// 재귀(자기참조) 관계 데모 — 조직도(부서-직원, 직원의 상급자). 서비스의 자기참조
// 관계 지원(2026-06-18)을 자연스럽게 보여주는 세 번째 샘플.
function buildHr(): ErdDoc {
  const b = builder();

  const dept = b.entity('department', '부서', { x: 40, y: 40 });
  b.column(dept, { name: 'dept_id', logicalName: '부서아이디', type: 'INT', isPK: true, isNN: true });
  b.column(dept, { name: 'name', logicalName: '부서명', type: 'VARCHAR', size: '100', isNN: true });
  b.column(dept, { name: 'location', logicalName: '위치', type: 'VARCHAR', size: '100' });

  const emp = b.entity('employee', '직원', { x: 380, y: 40 });
  b.column(emp, { name: 'emp_id', logicalName: '직원아이디', type: 'INT', isPK: true, isNN: true });
  b.column(emp, { name: 'name', logicalName: '이름', type: 'VARCHAR', size: '100', isNN: true });
  b.column(emp, { name: 'position', logicalName: '직급', type: 'VARCHAR', size: '100' });
  b.column(emp, { name: 'hired_at', logicalName: '입사일', type: 'DATE', isNN: true });

  // department 1:M employee (비식별 — 모든 직원은 소속 부서 필수)
  b.relate(dept, emp, 'ONE_TO_MANY_NON_IDENTIFYING');
  // employee 1:M employee (자기참조·비식별·선택 — 최상위 임원은 상급자가 없음.
  // FK 컬럼명은 addRelationship이 자기참조에 자동으로 붙이는 'parent_' 접두어로 parent_emp_id가 된다)
  b.relate(emp, emp, 'ONE_TO_MANY_OPTIONAL');

  return b.build();
}

const BUILDERS: Record<SampleKey, () => ErdDoc> = {
  ecommerce: buildEcommerce,
  blog: buildBlog,
  hr: buildHr,
};

// 호출할 때마다 새로 빌드한다 — genId()가 시각+난수 기반이라 같은 샘플을 여러 번
// 불러와도 이전에 불러온 사본과 id가 겹치지 않는다.
export function buildSample(key: SampleKey): ErdDoc {
  return BUILDERS[key]();
}
