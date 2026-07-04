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
  OnSelectionChangeParams,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useERDStore } from '../../store/erdStore';
import { RelationshipType } from '../../types/erd';
import type { NodePosition } from '../../core/erdOps';
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
    selectEntity, selectEdge, selectMemo, addRelationship, moveNodes,
    addMemo, setSelection,
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

  // Sync store → React Flow. 러버밴드 박스 선택은 React Flow 내부 selected 플래그만 바꾸고
  // 스토어(entities/nodePositions/memos)는 건드리지 않지만, 위치 이동 등으로 rfNodes가
  // 재계산될 때 이 selected를 이어받지 않으면(순수 재생성이라) 방금 선택한 것이 사라져 보인다 —
  // 기존 selected 값을 유지해 병합한다.
  useEffect(() => {
    setNodes(current => rfNodes.map(n => {
      const prev = current.find(c => c.id === n.id);
      return prev?.selected ? { ...n, selected: true } : n;
    }));
  }, [rfNodes, setNodes]);
  useEffect(() => { setEdges(rfEdges); }, [rfEdges, setEdges]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    // 드래그 종료 시점의 position 변경을 전부 모아 한 번에 커밋 — 여러 개(러버밴드로 묶인 그룹)를
    // 동시에 옮겨도 Undo 한 번으로 전체가 복원되도록 스토어에도 그룹 그대로 전달한다.
    const entityMoves: { id: string; pos: NodePosition }[] = [];
    const memoMoves: { id: string; x: number; y: number }[] = [];
    changes.forEach((change) => {
      if (change.type === 'position' && change.position && !change.dragging) {
        if (memos.some(m => m.id === change.id)) {
          memoMoves.push({ id: change.id, x: change.position.x, y: change.position.y });
        } else {
          entityMoves.push({ id: change.id, pos: change.position });
        }
      }
      // NOTE: dimensions 변화는 onNodesChange로만 처리 — 스토어 업데이트 금지.
      // MemoNode.tsx의 NodeResizer.onResizeEnd에서 크기를 저장한다.
      // dimensions → updateMemoSize → setNodes 루프가 모든 노드를 visibility:hidden으로 리셋함.
    });
    if (entityMoves.length > 0 || memoMoves.length > 0) {
      moveNodes(entityMoves, memoMoves);
    }
  }, [onNodesChange, moveNodes, memos]);

  // 러버밴드 박스 선택/Ctrl·Shift 클릭 등 React Flow의 선택 변경을 스토어에 반영
  // (우측 패널의 다중 선택 표시·Delete 키 일괄 삭제·그룹 이동 후 선택 유지에 사용)
  const handleSelectionChange = useCallback(({ nodes: selNodes }: OnSelectionChangeParams) => {
    setSelection(
      selNodes.filter(n => n.type === 'entity').map(n => n.id),
      selNodes.filter(n => n.type === 'memo').map(n => n.id),
    );
  }, [setSelection]);

  // 드래그 시작 노드 추적 — 상위(부모)에서 하위(자식)로 드래그하는 순서를 보장
  // (Loose 모드에서 target 핸들로 드래그를 시작하면 RF가 source/target을 뒤집어 전달함)
  const dragStartNodeId = useRef<string | null>(null);

  const onConnectStart = useCallback((_: unknown, params: { nodeId: string | null }) => {
    dragStartNodeId.current = params.nodeId;
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    let { source, target, sourceHandle, targetHandle } = connection;
    // 드래그 시작 노드 = 상위(부모) = source가 되도록 정규화 (handle도 함께 뒤집어야
    // 서브타입 핸들 id가 어느 side 것인지 어긋나지 않는다)
    if (dragStartNodeId.current && source !== dragStartNodeId.current) {
      [source, target] = [target, source];
      [sourceHandle, targetHandle] = [targetHandle, sourceHandle];
    }
    if (!source || !target) return;
    setPendingConn({ ...connection, source, target, sourceHandle, targetHandle });
  }, []);

  // "sub:{subtypeId}" 형식의 handle id에서 서브타입 id 추출 (일반 엔티티 핸들이면 undefined)
  const subtypeIdFromHandle = (handleId?: string | null): string | undefined =>
    handleId?.startsWith('sub:') ? handleId.slice('sub:'.length) : undefined;

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
    const sourceSubtypeId = subtypeIdFromHandle(pendingConn.sourceHandle);
    const targetSubtypeId = subtypeIdFromHandle(pendingConn.targetHandle);
    const scope = sourceSubtypeId || targetSubtypeId ? { sourceSubtypeId, targetSubtypeId } : undefined;
    addRelationship(pendingConn.source, pendingConn.target, type, scope);
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
        onSelectionChange={handleSelectionChange}
        onPaneClick={() => { selectEntity(null); selectEdge(null); selectMemo(null); setSelection([], []); }}
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
