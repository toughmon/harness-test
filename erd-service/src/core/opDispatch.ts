import * as erdOps from './erdOps';
import type { ErdDoc, NodePosition } from './erdOps';

// ──────────────────────────────────────────────────────────────────────────
// 공유 오퍼레이션 어휘 — 실시간 협업의 단일 진실 원천.
// op-name → erdOps 순수 함수 매핑을 client(뷰어 원격 적용)·server(릴레이 룸 doc 적용)가
// 공유해 op 집합이 어긋나지 않게 한다. erdOps가 {doc,result}를 반환하면 doc으로 언랩한다.
// erdOps는 없는 id 대상에 안전 no-op이라, 서버가 수신 순서대로 적용하면 결정적으로 수렴한다.
// setNodePosition만 erdOps 백킹이 없는 직접 병합(순수 모델링 코어 보존).
// ──────────────────────────────────────────────────────────────────────────

export type OpName =
  | 'addEntity'
  | 'updateEntity'
  | 'deleteEntity'
  | 'addColumn'
  | 'updateColumn'
  | 'deleteColumn'
  | 'moveColumn'
  | 'addRelationship'
  | 'updateRelationshipType'
  | 'updateRelationshipSides'
  | 'updateRelationshipAnchor'
  | 'updateRelationshipMidOffset'
  | 'updateRelationshipSubtypeScope'
  | 'deleteRelationship'
  | 'addMemo'
  | 'updateMemo'
  | 'deleteMemo'
  | 'setNodePosition';

// args는 각 erdOps 함수의 위치 인자를 그대로 실어보낸다(JSON 직렬화 가능한 값만).
// create op은 호출부가 미리 만든 명시 id를 args에 포함시켜 피어 간 동일 id를 재현한다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Op { op: OpName; args: any[] }

export function applyOp(doc: ErdDoc, { op, args }: Op): ErdDoc {
  switch (op) {
    case 'addEntity': return erdOps.addEntity(doc, args[0]).doc;
    case 'updateEntity': return erdOps.updateEntity(doc, args[0], args[1]);
    case 'deleteEntity': return erdOps.deleteEntity(doc, args[0]);
    case 'addColumn': return erdOps.addColumn(doc, args[0], args[1]).doc;
    case 'updateColumn': return erdOps.updateColumn(doc, args[0], args[1], args[2]);
    case 'deleteColumn': return erdOps.deleteColumn(doc, args[0], args[1]);
    case 'moveColumn': return erdOps.moveColumn(doc, args[0], args[1], args[2]);
    case 'addRelationship': return erdOps.addRelationship(doc, args[0], args[1], args[2], args[3], args[4], args[5]).doc;
    case 'updateRelationshipType': return erdOps.updateRelationshipType(doc, args[0], args[1]).doc;
    case 'updateRelationshipSides': return erdOps.updateRelationshipSides(doc, args[0], args[1]).doc;
    case 'updateRelationshipAnchor': return erdOps.updateRelationshipAnchor(doc, args[0], args[1], args[2]);
    case 'updateRelationshipMidOffset': return erdOps.updateRelationshipMidOffset(doc, args[0], args[1]);
    case 'updateRelationshipSubtypeScope': return erdOps.updateRelationshipSubtypeScope(doc, args[0], args[1], args[2]).doc;
    case 'deleteRelationship': return erdOps.deleteRelationship(doc, args[0]).doc;
    case 'addMemo': return erdOps.addMemo(doc, args[0]).doc;
    case 'updateMemo': return erdOps.updateMemo(doc, args[0], args[1]);
    case 'deleteMemo': return erdOps.deleteMemo(doc, args[0]);
    case 'setNodePosition':
      return { ...doc, nodePositions: { ...doc.nodePositions, [args[0]]: args[1] as NodePosition } };
    default:
      return doc;
  }
}
