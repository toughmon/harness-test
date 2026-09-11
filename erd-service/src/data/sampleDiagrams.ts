import type { ErdDoc } from '../core/erdOps';
import type { ERDData } from '../types/erd';
import { fromERDData } from '../utils/erdData';
import ecommerceData from './samples/ecommerce.json';
import blogData from './samples/blog.json';
import hrData from './samples/hr.json';

// ──────────────────────────────────────────────────────────────────────────
// 온보딩용 샘플 다이어그램 — 신규 방문자가 /app을 처음 열었을 때 빈 캔버스 대신
// 보여주는 예제 3종. 각 JSON은 편집기에서 직접 그려서(관계선 끝점 부착 위치·중간
// 우회 등을 손으로 다듬은 뒤) "Save(JSON)"으로 내보낸 실제 저장 포맷(ERDData)
// 그대로다 — erdOps 빌더로 매번 새로 조립하는 대신 이 정본을 그대로 쓴다.
// id가 세 샘플 사이에서도 고정돼 있지만, loadSample은 스토어를 통째로 교체
// (loadData)하는 방식이라 다른 캔버스 상태와 병합될 일이 없어 충돌 걱정이 없다.
// ──────────────────────────────────────────────────────────────────────────

export type SampleKey = 'ecommerce' | 'blog' | 'hr';

export const SAMPLE_KEYS: SampleKey[] = ['ecommerce', 'blog', 'hr'];

const SAMPLE_DATA: Record<SampleKey, ERDData> = {
  ecommerce: ecommerceData as ERDData,
  blog: blogData as ERDData,
  hr: hrData as ERDData,
};

export function buildSample(key: SampleKey): ErdDoc {
  const { entities, relationships, positions, memos } = fromERDData(SAMPLE_DATA[key]);
  return { entities, relationships, nodePositions: positions, memos };
}
