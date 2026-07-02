import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  Panel,
  ConnectionMode,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useViewport,
  Connection,
  Node,
  Edge,
  NodeChange,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useERDStore } from '../../store/erdStore';
import { RelationshipType } from '../../types/erd';
import EntityNode from '../nodes/EntityNode';
import MemoNode from '../nodes/MemoNode';
import RelationshipEdge from '../edges/RelationshipEdge';
import RelTypeModal from '../panels/RelTypeModal';
import { computeAutoLayout } from '../../utils/autoLayout';
import { exportDiagramPng } from '../../utils/exportImage';
import { exportDiagramSql } from '../../utils/exportSql';
import { alertDialog } from '../../store/dialogStore';

const nodeTypes = { entity: EntityNode, memo: MemoNode };
const edgeTypes = { relationship: RelationshipEdge };

// 디자인 시안의 플로팅 글래스 줌 툴바 — 줌/핏 + 자동 정렬 + PNG/SQL 내보내기 + 전체화면
function ZoomToolbar({ isFullscreen, onToggleFullscreen }: { isFullscreen: boolean; onToggleFullscreen: () => void }) {
  const { zoomIn, zoomOut, fitView, getNodes } = useReactFlow();
  const { zoom } = useViewport();
  const { entities, relationships, setAllPositions } = useERDStore();

  const handleAutoLayout = () => {
    const nodes = getNodes();
    if (nodes.length === 0) return;
    setAllPositions(computeAutoLayout(nodes, relationships));
    window.setTimeout(() => fitView({ padding: 0.3 }), 60);
  };

  const handleExportPng = async () => {
    try {
      await exportDiagramPng(getNodes());
    } catch (err) {
      alertDialog((err as Error).message, 'PNG 내보내기 실패');
    }
  };

  const handleExportSql = () => {
    try {
      exportDiagramSql(entities);
    } catch (err) {
      alertDialog((err as Error).message, 'SQL 내보내기 실패');
    }
  };

  const btn = 'w-8 h-8 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-variant hover:text-primary transition-colors cursor-pointer';

  return (
    <Panel position="bottom-center">
      <div className="glass-toolbar rounded-full border border-outline-variant p-1.5 flex items-center gap-1 shadow-lg mb-2">
        <button className={btn} title="Zoom Out" onClick={() => zoomOut()}>
          <span className="material-symbols-outlined text-[18px]">zoom_out</span>
        </button>
        <span className="font-mono text-[11px] text-on-surface-variant px-2 min-w-12 text-center select-none">
          {Math.round(zoom * 100)}%
        </span>
        <button className={btn} title="Zoom In" onClick={() => zoomIn()}>
          <span className="material-symbols-outlined text-[18px]">zoom_in</span>
        </button>
        <div className="w-px h-5 bg-outline-variant mx-1" />
        <button className={btn} title="Fit View" onClick={() => fitView({ padding: 0.3 })}>
          <span className="material-symbols-outlined text-[18px]">fit_screen</span>
        </button>
        <div className="w-px h-5 bg-outline-variant mx-1" />
        <button className={btn} title="자동 정렬" onClick={handleAutoLayout}>
          <span className="material-symbols-outlined text-[18px]">account_tree</span>
        </button>
        <button className={btn} title="PNG 내보내기" onClick={handleExportPng}>
          <span className="material-symbols-outlined text-[18px]">photo_camera</span>
        </button>
        <button className={btn} title="SQL 내보내기 (MySQL)" onClick={handleExportSql}>
          <span className="material-symbols-outlined text-[18px]">database</span>
        </button>
        <div className="w-px h-5 bg-outline-variant mx-1" />
        <button className={btn} title={isFullscreen ? '전체화면 종료 (Esc)' : '전체화면'} onClick={onToggleFullscreen}>
          <span className="material-symbols-outlined text-[18px]">
            {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
          </span>
        </button>
      </div>
    </Panel>
  );
}

// ReactFlow 트리 안에서 실행되어야 screenToFlowPosition을 쓸 수 있는 핸들러
function PaneDoubleClickHandler() {
  const rf = useReactFlow();
  const addMemo = useERDStore(s => s.addMemo);

  useEffect(() => {
    const pane = document.querySelector('.react-flow__pane');
    if (!pane) return;
    const handler = (ev: Event) => {
      const e = ev as MouseEvent;
      const target = e.target as HTMLElement;
      if (target.closest('.react-flow__node') || target.closest('.react-flow__edge')) return;
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addMemo({ x: pos.x - 110, y: pos.y - 70 });
    };
    pane.addEventListener('dblclick', handler);
    return () => pane.removeEventListener('dblclick', handler);
  }, [rf, addMemo]);

  return null;
}

export default function ERDCanvas() {
  const {
    entities, relationships, nodePositions, memos,
    selectEntity, selectEdge, selectMemo, addRelationship, updateNodePosition,
    addMemo, updateMemoPosition,
  } = useERDStore();
  const readOnly = useERDStore(s => s.readOnly);

  const [pendingConn, setPendingConn] = useState<Connection | null>(null);

  // 전체화면 상태
  const canvasRef = useRef<HTMLElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await canvasRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }, []);

  const rfNodes: Node[] = useMemo(() => [
    ...entities.map(e => ({
      id: e.id,
      type: 'entity',
      position: nodePositions[e.id] ?? { x: 100, y: 100 },
      data: { ...e },
    })),
    ...memos.map(m => ({
      id: m.id,
      type: 'memo',
      position: { x: m.x, y: m.y },
      data: { ...m },
      style: { width: m.width, height: m.height },
    })),
  ], [entities, nodePositions, memos]);

  const rfEdges: Edge[] = useMemo(() =>
    relationships.map(r => ({
      id: r.id,
      source: r.sourceId,
      target: r.targetId,
      type: 'relationship',
      data: { ...r },
    })),
    [relationships]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  // Sync store → React Flow
  useEffect(() => { setNodes(rfNodes); }, [rfNodes, setNodes]);
  useEffect(() => { setEdges(rfEdges); }, [rfEdges, setEdges]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    changes.forEach((change) => {
      if (change.type === 'position' && change.position && !change.dragging) {
        if (memos.some(m => m.id === change.id)) {
          updateMemoPosition(change.id, change.position.x, change.position.y);
        } else {
          updateNodePosition(change.id, change.position);
        }
      }
      // NOTE: dimensions 변화는 onNodesChange로만 처리 — 스토어 업데이트 금지.
      // MemoNode.tsx의 NodeResizer.onResizeEnd에서 크기를 저장한다.
      // dimensions → updateMemoSize → setNodes 루프가 모든 노드를 visibility:hidden으로 리셋함.
    });
  }, [onNodesChange, updateNodePosition, updateMemoPosition, memos]);

  // 드래그 시작 노드 추적 — 상위(부모)에서 하위(자식)로 드래그하는 순서를 보장
  // (Loose 모드에서 target 핸들로 드래그를 시작하면 RF가 source/target을 뒤집어 전달함)
  const dragStartNodeId = useRef<string | null>(null);

  const onConnectStart = useCallback((_: unknown, params: { nodeId: string | null }) => {
    dragStartNodeId.current = params.nodeId;
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    let { source, target } = connection;
    // 드래그 시작 노드 = 상위(부모) = source가 되도록 정규화
    if (dragStartNodeId.current && source !== dragStartNodeId.current) {
      [source, target] = [target, source];
    }
    if (!source || !target) return;
    setPendingConn({ ...connection, source, target });
  }, []);

  // 노드 클릭 → 메모/엔티티 구분해 우측 패널에 표시
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'memo') selectMemo(node.id);
    else selectEntity(node.id);
  }, [selectEntity, selectMemo]);


  // 관계선 클릭 → 우측 패널에서 좌/우 절반 편집
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    selectEdge(edge.id);
  }, [selectEdge]);

  const handleRelTypeSelect = (type: RelationshipType) => {
    if (!pendingConn?.source || !pendingConn?.target) return;
    addRelationship(pendingConn.source, pendingConn.target, type);
    setPendingConn(null);
  };

  return (
    <main ref={canvasRef} className="flex-1 relative overflow-hidden" style={{ background: '#121212' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={() => { selectEntity(null); selectEdge(null); selectMemo(null); }}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        deleteKeyCode={null}   // 기본 Backspace 삭제는 스토어를 거치지 않고 로컬 노드만 지워 데이터와 어긋남 — App.tsx의 Delete 키 핸들러가 대신 처리
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={3}
        style={{ width: '100%', height: '100%', background: '#121212' }}
        proOptions={{ hideAttribution: true }}
      >
        <PaneDoubleClickHandler />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#334155"
        />
        <ZoomToolbar isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen} />
        <MiniMap
          nodeColor={(node) => {
            const e = entities.find(e => e.id === node.id);
            return e?.color ?? '#8083ff';
          }}
          style={{ background: '#0e0e0e', border: '1px solid #464554' }}
          maskColor="rgba(14,14,14,0.7)"
        />
      </ReactFlow>

      {entities.length === 0 && memos.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="material-symbols-outlined text-[48px] text-outline-variant mb-4">schema</span>
          <p className="text-sm text-on-surface-variant m-0">
            좌측의 <strong className="text-primary font-semibold">Add Entity</strong> 버튼으로 시작하세요
          </p>
          <p className="text-xs text-outline mt-1.5">
            엔티티에 마우스를 올리면 나타나는 핸들을 드래그해 관계선을 연결할 수 있습니다
          </p>
        </div>
      )}

      {pendingConn && (
        <RelTypeModal
          onSelect={handleRelTypeSelect}
          onCancel={() => setPendingConn(null)}
        />
      )}
    </main>
  );
}
