import { useEffect } from 'react';
import Toolbar from './components/toolbar/Toolbar';
import Sidebar from './components/sidebar/Sidebar';
import ERDCanvas from './components/canvas/ERDCanvas';
import EntityEditPanel from './components/panels/EntityEditPanel';
import RelationshipEditPanel from './components/panels/RelationshipEditPanel';
import MemoEditPanel from './components/panels/MemoEditPanel';
import MultiSelectPanel from './components/panels/MultiSelectPanel';
import AuthModal from './components/auth/AuthModal';
import DialogModal from './components/common/DialogModal';
import McpConnectModal from './components/mcp/McpConnectModal';
import ShareModal from './components/share/ShareModal';
import { useERDStore } from './store/erdStore';
import { useAuthStore } from './store/authStore';
import { useDiagramStore } from './store/diagramStore';
import { useMcpStore } from './store/mcpStore';
import { useShareStore } from './store/shareStore';
import { useSharedSessionStore } from './store/sharedSessionStore';
import { useThemeStore } from './store/themeStore';
import { confirmDialog } from './store/dialogStore';

// 공유 링크 진입 파싱 — /d/:token 또는 ?share=<token> (라우터 미도입, SPA fallback이 index.html 서빙)
function parseShareToken(): string | null {
  const m = window.location.pathname.match(/^\/d\/([^/?#]+)/);
  if (m) return decodeURIComponent(m[1]);
  return new URLSearchParams(window.location.search).get('share');
}

function App() {
  const { undo, redo, deleteEntity, deleteRelationship, deleteMemo, deleteMany, selectMemo } = useERDStore();
  const entities = useERDStore(s => s.entities);
  const relationships = useERDStore(s => s.relationships);
  const selectedEntityId = useERDStore(s => s.selectedEntityId);
  const selectedEdgeId = useERDStore(s => s.selectedEdgeId);
  const selectedMemoId = useERDStore(s => s.selectedMemoId);
  const selectedEntityIds = useERDStore(s => s.selectedEntityIds);
  const selectedMemoIds = useERDStore(s => s.selectedMemoIds);
  const isMultiSelect = selectedEntityIds.length + selectedMemoIds.length > 1;
  const { modalOpen, init, status } = useAuthStore();
  const readOnly = useERDStore(s => s.readOnly);
  const autoSave = useDiagramStore(s => s.autoSave);
  const mcpModalOpen = useMcpStore(s => s.modalOpen);
  const shareModalOpen = useShareStore(s => s.modalOpen);
  const sharedError = useSharedSessionStore(s => s.error);
  const { theme } = useThemeStore();

  // 앱 시작 시 세션 복원 (쿠키의 JWT로 GET /me). 공유 링크 진입 시 내 마지막 다이어그램 복원은 건너뛰고 공유본을 연다.
  useEffect(() => {
    const token = parseShareToken();
    init(!!token).then(() => {
      if (token) useSharedSessionStore.getState().enter(token);
    });
  }, [init]);

  // 로그인 필요로 대기 중이던 공유 세션 — 로그인 완료되면 재시도
  useEffect(() => {
    const ss = useSharedSessionStore.getState();
    if (status === 'authed' && ss.token && ss.needsLogin) {
      ss.enter(ss.token);
    }
  }, [status]);

  // 로그인 상태일 때 5초마다 자동 저장 (currentId 없는 새 다이어그램은 skip)
  useEffect(() => {
    if (status !== 'authed') return;
    const id = setInterval(autoSave, 5000);
    return () => clearInterval(id);
  }, [status, autoSave]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 전역 Undo/Redo + 엔티티 삭제 단축키 — 입력 필드 포커스 중에는 브라우저 기본 동작 유지
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        return;
      }
      if (readOnly) return;   // 공유 뷰어: undo/redo·Delete 등 모든 편집 단축키 비활성
      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
          e.preventDefault();
          redo();
        }
        return;
      }
      if (e.key === 'Delete' && isMultiSelect) {
        e.preventDefault();
        const n = selectedEntityIds.length + selectedMemoIds.length;
        confirmDialog({
          title: '일괄 삭제',
          message: `선택한 ${n}개 항목을 삭제할까요?\n엔티티에 연결된 관계선과 자동 생성 FK 컬럼도 함께 제거됩니다.`,
          confirmText: '삭제',
          danger: true,
        }).then(ok => { if (ok) deleteMany(selectedEntityIds, selectedMemoIds); });
      } else if (e.key === 'Delete' && selectedEntityId) {
        e.preventDefault();
        const entity = entities.find(en => en.id === selectedEntityId);
        if (!entity) return;
        confirmDialog({
          title: '엔티티 삭제',
          message: `"${entity.name}" 엔티티를 삭제할까요?\n연결된 관계선도 함께 삭제됩니다.`,
          confirmText: '삭제',
          danger: true,
        }).then(ok => { if (ok) deleteEntity(entity.id); });
      } else if (e.key === 'Delete' && selectedEdgeId) {
        e.preventDefault();
        const rel = relationships.find(r => r.id === selectedEdgeId);
        if (!rel) return;
        const parent = entities.find(en => en.id === rel.sourceId);
        const child = entities.find(en => en.id === rel.targetId);
        confirmDialog({
          title: '관계 삭제',
          message: `"${parent?.name ?? '?'} → ${child?.name ?? '?'}" 관계를 삭제할까요?\n자동 생성된 FK 컬럼도 함께 제거됩니다.`,
          confirmText: '삭제',
          danger: true,
        }).then(ok => { if (ok) deleteRelationship(rel.id); });
      } else if (e.key === 'Delete' && selectedMemoId) {
        e.preventDefault();
        const id = selectedMemoId;
        confirmDialog({
          title: '메모 삭제',
          message: '이 메모를 삭제할까요?',
          confirmText: '삭제',
          danger: true,
        }).then(ok => { if (ok) { deleteMemo(id); selectMemo(null); } });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, selectedEntityId, entities, deleteEntity, selectedEdgeId, relationships, deleteRelationship, selectedMemoId, deleteMemo, selectMemo, readOnly, isMultiSelect, selectedEntityIds, selectedMemoIds, deleteMany]);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-background text-on-surface font-sans">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar />
        <ERDCanvas />
        {isMultiSelect && <MultiSelectPanel />}
      </div>
      {/* 편집 모달 — 우측 고정 패널 대신 info/✎ 아이콘·우클릭 편집으로 열림. 각자 editorOpen을 보고 자체 게이팅 */}
      <EntityEditPanel />
      <RelationshipEditPanel />
      <MemoEditPanel />
      {modalOpen && <AuthModal />}
      {mcpModalOpen && <McpConnectModal />}
      {shareModalOpen && <ShareModal />}
      {sharedError && (
        <div
          data-testid="shared-error"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white text-sm px-4 py-2 rounded-lg shadow-lg"
        >
          {sharedError}
        </div>
      )}
      <DialogModal />
    </div>
  );
}

export default App;
