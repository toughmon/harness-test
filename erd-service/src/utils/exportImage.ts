import { getNodesBounds, getViewportForBounds, Node } from '@xyflow/react';
import { toPng } from 'html-to-image';
import { getT } from '../i18n';

// 현재 다이어그램 전체를 PNG로 내보내기 — React Flow viewport를 노드 영역에 맞게 변환 후 캡처
export async function exportDiagramPng(nodes: Node[]): Promise<void> {
  if (nodes.length === 0) return;

  const viewportEl = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewportEl) throw new Error(getT()('export.canvasNotFound'));

  const bounds = getNodesBounds(nodes);
  const scale = 1.5;
  const padding = 60;
  const width = Math.min(4096, Math.max(480, Math.ceil(bounds.width * scale) + padding * 2));
  const height = Math.min(4096, Math.max(360, Math.ceil(bounds.height * scale) + padding * 2));
  const viewport = getViewportForBounds(bounds, width, height, 0.2, 3, 0.05);

  const dataUrl = await toPng(viewportEl, {
    backgroundColor: '#121212',
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  });

  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `erd-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
}
