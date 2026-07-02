/**
 * 쇼핑몰 ERD 자동 생성 스크립트
 * 실행: node create_ecommerce_erd.mjs  (erd-service 디렉토리에서)
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const BASE_URL   = process.env.ERD_BASE_URL ?? 'https://yourerd.com';
const USERNAME   = 'mcp-bot';
const PASSWORD   = 'QDf0iiusN-BpcYWk';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', 'src/index.ts'],
  env: {
    ...process.env,
    ERD_BASE_URL: BASE_URL,
    ERD_USERNAME: USERNAME,
    ERD_PASSWORD: PASSWORD,
  },
});

const client = new Client({ name: 'ecommerce-erd-creator', version: '1.0.0' });
await client.connect(transport);

async function call(name, args) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? '';
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  console.log(`✓ ${name}:`, JSON.stringify(parsed, null, 2).slice(0, 300));
  return parsed;
}

// ─── 1. 새 다이어그램 생성 ────────────────────────────────────────
await call('create_diagram', { name: '쇼핑몰 ERD' });

// ─── 2. 엔티티 추가 ──────────────────────────────────────────────
await call('add_entity', { name: 'user',          logicalName: '사용자',   withDefaultId: false });
await call('add_entity', { name: 'product',       logicalName: '상품',     withDefaultId: false });
await call('add_entity', { name: 'order',         logicalName: '주문',     withDefaultId: false });
await call('add_entity', { name: 'order_product', logicalName: '주문상품', withDefaultId: false });
await call('add_entity', { name: 'payment',       logicalName: '결제',     withDefaultId: false });

// ─── 3. 컬럼 추가 ────────────────────────────────────────────────

// user
await call('add_column', { entity: 'user', name: 'user_id',   logicalName: '사용자아이디',       type: 'INT',     size: '',    isPK: true,  isNN: true  });
await call('add_column', { entity: 'user', name: 'email',     logicalName: '이메일(로그인아이디)', type: 'VARCHAR', size: '255', isPK: false, isNN: true,  isUnique: true });
await call('add_column', { entity: 'user', name: '사용자명',   logicalName: 'name',               type: 'VARCHAR', size: '255', isPK: false, isNN: true  });

// product
await call('add_column', { entity: 'product', name: 'product_id', logicalName: '상품아이디', type: 'INT',     size: '',    isPK: true,  isNN: true });
await call('add_column', { entity: 'product', name: 'name',       logicalName: '상품명',     type: 'VARCHAR', size: '500', isPK: false, isNN: true });
await call('add_column', { entity: 'product', name: 'price',      logicalName: '상품가격',   type: 'INT',     size: '',    isPK: false, isNN: true });
await call('add_column', { entity: 'product', name: 'stock',      logicalName: '재고수량',   type: 'INT',     size: '',    isPK: false, isNN: true });

// order  (user_id FK는 관계에서 자동 생성)
await call('add_column', { entity: 'order', name: 'order_id',    logicalName: '주문아이디',  type: 'INT',      size: '',   isPK: true,  isNN: true });
await call('add_column', { entity: 'order', name: 'total_price', logicalName: '총주문금액',  type: 'BIGINT',   size: '',   isPK: false, isNN: true });
await call('add_column', { entity: 'order', name: 'ordered_at',  logicalName: '주문일시',    type: 'DATETIME', size: '',   isPK: false, isNN: true });

// order_product  (order_id, product_id는 IDENTIFYING 관계에서 FK+PK 자동 생성)
await call('add_column', { entity: 'order_product', name: 'quantity', logicalName: '수량', type: 'INT', size: '', isPK: false, isNN: true });

// payment  (order_id FK+PK는 IDENTIFYING 관계에서 자동 생성)
await call('add_column', { entity: 'payment', name: 'payment_id',  logicalName: '결제아이디', type: 'BIGINT',   size: '',  isPK: true,  isNN: true });
await call('add_column', { entity: 'payment', name: 'paid_price',  logicalName: '결제금액',   type: 'BIGINT',   size: '',  isPK: false, isNN: true });
await call('add_column', { entity: 'payment', name: 'paid_at',     logicalName: '결제일시',   type: 'DATETIME', size: '',  isPK: false, isNN: true });

// ─── 4. 관계 추가 (FK 자동 생성) ────────────────────────────────
// user 1:M order  (비식별 — user_id가 order PK 아님)
await call('add_relationship', { source: 'user', target: 'order', type: 'ONE_TO_MANY_NON_IDENTIFYING' });

// order 1:M order_product  (식별 — order_id가 order_product PK)
await call('add_relationship', { source: 'order', target: 'order_product', type: 'ONE_TO_MANY_IDENTIFYING' });

// product 1:M order_product  (식별 — product_id가 order_product PK)
await call('add_relationship', { source: 'product', target: 'order_product', type: 'ONE_TO_MANY_IDENTIFYING' });

// order 1:M payment  (식별 — order_id가 payment PK에 포함)
await call('add_relationship', { source: 'order', target: 'payment', type: 'ONE_TO_MANY_IDENTIFYING' });

// ─── 5. 결과 확인 ────────────────────────────────────────────────
await call('get_diagram', {});

await client.close();
console.log('\n쇼핑몰 ERD 생성 완료!');
