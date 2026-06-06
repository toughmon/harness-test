import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ConnectionMode,
  useNodesState,
  useEdgesState,
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
import RelationshipEdge from '../edges/RelationshipEdge';
import RelTypeModal from '../panels/RelTypeModal';

const nodeTypes = { entity: EntityNode };
const edgeTypes = { relationship: RelationshipEdge };

export default function ERDCanvas() {
  const {
    entities, relationships, nodePositions,
    selectEntity, addRelationship, updateNodePosition,
  } = useERDStore();

  const [pendingConn, setPendingConn] = useState<Connection | null>(null);

  const rfNodes: Node[] = useMemo(() =>
    entities.map(e => ({
      id: e.id,
      type: 'entity',
      position: nodePositions[e.id] ?? { x: 100, y: 100 },
      data: { ...e },
    })),
    [entities, nodePositions]
  );

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
        updateNodePosition(change.id, change.position);
      }
    });
  }, [onNodesChange, updateNodePosition]);

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
    if (!source || !target || source === target) return;
    setPendingConn({ ...connection, source, target });
  }, []);

  // 엔티티 클릭 → 우측 패널 오픈
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    selectEntity(node.id);
  }, [selectEntity]);

  const handleRelTypeSelect = (type: RelationshipType) => {
    if (!pendingConn?.source || !pendingConn?.target) return;
    addRelationship(pendingConn.source, pendingConn.target, type);
    setPendingConn(null);
  };

  return (
    <div style={{ flex: 1, position: 'relative', background: '#0f172a', overflow: 'hidden' }}>
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
        onPaneClick={() => selectEntity(null)}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={3}
        style={{ width: '100%', height: '100%', background: '#0f172a' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#1e293b"
        />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const e = entities.find(e => e.id === node.id);
            return e?.color ?? '#3b82f6';
          }}
          style={{ background: '#0f172a', border: '1px solid #1e293b' }}
          maskColor="rgba(15,23,42,0.7)"
        />
      </ReactFlow>

      {entities.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 48, color: '#334155', marginBottom: 16 }}>⊞</div>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
            상단의 <strong style={{ color: '#94a3b8' }}>엔티티 추가</strong> 버튼으로 시작하세요
          </p>
          <p style={{ color: '#475569', fontSize: 12, marginTop: 6 }}>
            엔티티에 마우스를 올리면 나타나는 파란 핸들을 드래그해 관계선을 연결할 수 있습니다
          </p>
        </div>
      )}

      {pendingConn && (
        <RelTypeModal
          onSelect={handleRelTypeSelect}
          onCancel={() => setPendingConn(null)}
        />
      )}
    </div>
  );
}
