import dagre from '@dagrejs/dagre';
import { Node } from '@xyflow/react';
import { Relationship } from '../types/erd';

// 관계 구조 기반 자동 정렬 — dagre 계층 레이아웃 (부모 왼쪽 → 자식 오른쪽)
export function computeAutoLayout(
  nodes: Node[],
  relationships: Relationship[],
): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 140, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, {
      width: n.measured?.width ?? 250,
      height: n.measured?.height ?? 100,
    });
  }
  for (const r of relationships) {
    if (g.hasNode(r.sourceId) && g.hasNode(r.targetId)) {
      g.setEdge(r.sourceId, r.targetId);
    }
  }

  dagre.layout(g);

  // dagre는 중심 좌표를 반환 → React Flow의 좌상단 좌표로 변환
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const pos = g.node(n.id);
    if (!pos) continue;
    positions[n.id] = {
      x: Math.round(pos.x - pos.width / 2),
      y: Math.round(pos.y - pos.height / 2),
    };
  }
  return positions;
}
