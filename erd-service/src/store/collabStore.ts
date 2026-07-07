import { create } from 'zustand';
import { WsClient } from '../collab/wsClient';
import { canEdit, type Participant, type CollabRole, type ServerFrame, type CollabDoc } from '../collab/protocol';
import { useERDStore, setOpEmitter } from './erdStore';
import type { OpName } from '../core/opDispatch';

// 실시간 협업 연결 상태 + 프레임 ↔ erdStore 중개.
// Phase 1: 편집자(소유자)는 op를 즉시 발신 + 주기 스냅샷 백스톱(op 어휘 밖 변경·드리프트 보정),
// 뷰어는 수신 op/스냅샷을 읽기 전용으로 적용. 소유자는 자기 5초 autosave로 영속(서버 영속은 Phase 2).

interface CollabState {
  status: 'idle' | 'connecting' | 'live' | 'error';
  diagramId: number | null;
  role: CollabRole | null;
  you: Participant | null;
  participants: Participant[];
  connect: (diagramId: number, shareToken?: string) => void;
  disconnect: () => void;
  emitOp: (op: OpName, args: unknown[]) => void;
  isLive: () => boolean;
}

// 모듈 단위 상태 — 스토어 값이 아닌 전송/적용 제어용
let client: WsClient | null = null;
let ready = false;
let applyingRemote = false;   // 원격 적용 중 — 스냅샷 백스톱이 되돌려보내지 않게 skip
let snapshotUnsub: (() => void) | null = null;
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;

const currentDoc = (): CollabDoc => {
  const s = useERDStore.getState();
  return { entities: s.entities, relationships: s.relationships, nodePositions: s.nodePositions, memos: s.memos };
};

function wsUrl(diagramId: number, shareToken?: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const q = shareToken ? `?share=${encodeURIComponent(shareToken)}` : '';
  return `${proto}//${window.location.host}/ws/diagram/${diagramId}${q}`;
}

export const useCollabStore = create<CollabState>((set, get) => {
  const applyRemoteDoc = (doc: CollabDoc) => {
    applyingRemote = true;
    useERDStore.getState().loadData(doc.entities, doc.relationships, doc.nodePositions, doc.memos ?? [], { silent: true });
    applyingRemote = false;
  };
  const applyRemoteOp = (op: OpName, args: unknown[]) => {
    applyingRemote = true;
    useERDStore.getState().applyRemote(op, args);
    applyingRemote = false;
  };

  const scheduleSnapshot = () => {
    if (snapshotTimer) clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      if (ready && client) client.send({ type: 'snapshot', doc: currentDoc() });
    }, 1500);
  };

  const teardownEditorHooks = () => {
    setOpEmitter(null);
    if (snapshotUnsub) { snapshotUnsub(); snapshotUnsub = null; }
    if (snapshotTimer) { clearTimeout(snapshotTimer); snapshotTimer = null; }
  };

  const setupEditorHooks = () => {
    teardownEditorHooks();
    // 로컬 변형 → op 즉시 발신
    setOpEmitter((op, args) => get().emitOp(op, args));
    // 스냅샷 백스톱 — op 어휘 밖 변경(서브타입·자동정렬)과 드리프트를 보정. 원격 적용 중엔 skip.
    snapshotUnsub = useERDStore.subscribe((state, prev) => {
      if (applyingRemote) return;
      if (
        state.entities !== prev.entities ||
        state.relationships !== prev.relationships ||
        state.nodePositions !== prev.nodePositions ||
        state.memos !== prev.memos
      ) {
        scheduleSnapshot();
      }
    });
  };

  const onFrame = (frame: ServerFrame) => {
    switch (frame.type) {
      case 'init': {
        ready = true;
        const editor = canEdit(frame.you.role);
        useERDStore.getState().setReadOnly(!editor);
        set({ status: 'live', role: frame.you.role, you: frame.you, participants: frame.participants });
        if (editor) {
          // 편집자(소유자): 룸 doc을 받지 않고 내 현재 상태를 룸에 시드(내가 authoritative)
          setupEditorHooks();
          if (client) client.send({ type: 'snapshot', doc: currentDoc() });
        } else {
          // 뷰어: 룸 현재 상태를 읽기 전용으로 적용
          applyRemoteDoc(frame.doc);
        }
        break;
      }
      case 'op':
        applyRemoteOp(frame.op, frame.args);
        break;
      case 'snapshot':
        applyRemoteDoc(frame.doc);
        break;
      case 'presence':
        set({ participants: frame.participants });
        break;
      case 'error':
        if (frame.code === 'forbidden') set({ status: 'error' });
        // eslint-disable-next-line no-console
        console.warn('[collab]', frame.code, frame.message);
        break;
      default:
        break;
    }
  };

  return {
    status: 'idle',
    diagramId: null,
    role: null,
    you: null,
    participants: [],

    connect: (diagramId, shareToken) => {
      const st = get();
      // 같은 다이어그램에 이미 연결(시도) 중이면 무시
      if (client && st.diagramId === diagramId && (st.status === 'live' || st.status === 'connecting')) return;
      get().disconnect();
      ready = false;
      set({ status: 'connecting', diagramId, participants: [], role: null, you: null });
      client = new WsClient(wsUrl(diagramId, shareToken), {
        onOpen: () => { /* 서버 init 프레임을 기다린다 */ },
        onFrame,
        onClose: (intentional) => {
          ready = false;
          teardownEditorHooks();
          if (intentional) {
            useERDStore.getState().setReadOnly(false);
            set({ status: 'idle', participants: [] });
          } else {
            // WsClient가 자동 재연결 진행 — 재연결 시 서버가 다시 init을 보냄
            set({ status: 'connecting' });
          }
        },
      });
      client.connect();
    },

    disconnect: () => {
      teardownEditorHooks();
      ready = false;
      if (client) { client.close(); client = null; }
      useERDStore.getState().setReadOnly(false);
      set({ status: 'idle', diagramId: null, role: null, you: null, participants: [] });
    },

    emitOp: (op, args) => {
      if (!get().isLive()) return;               // init 전이거나 미연결 — 스냅샷 백스톱이 보정
      if (!canEdit(get().role ?? 'viewer')) return;
      client?.send({ type: 'op', op, args });
    },

    isLive: () => get().status === 'live' && ready,
  };
});
