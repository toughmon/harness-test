import { useEffect } from 'react';
import Toolbar from './components/toolbar/Toolbar';
import Sidebar from './components/sidebar/Sidebar';
import ERDCanvas from './components/canvas/ERDCanvas';
import EntityEditPanel from './components/panels/EntityEditPanel';
import RelationshipEditPanel from './components/panels/RelationshipEditPanel';
import MemoEditPanel from './components/panels/MemoEditPanel';
import AuthModal from './components/auth/AuthModal';
import DialogModal from './components/common/DialogModal';
import McpConnectModal from './components/mcp/McpConnectModal';
import { useERDStore } from './store/erdStore';
import { useAuthStore } from './store/authStore';
import { useDiagramStore } from './store/diagramStore';
import { useMcpStore } from './store/mcpStore';
import { useThemeStore } from './store/themeStore';
import { confirmDialog } from './store/dialogStore';

function App() {
  const { undo, redo, deleteEntity } = useERDStore();
  const entities = useERDStore(s => s.entities);
  const selectedEntityId = useERDStore(s => s.selectedEntityId);
  const selectedEdgeId = useERDStore(s => s.selectedEdgeId);
  const selectedMemoId = useERDStore(s => s.selectedMemoId);
  const { modalOpen, init, status } = useAuthStore();
  const autoSave = useDiagramStore(s => s.autoSave);
  const mcpModalOpen = useMcpStore(s => s.modalOpen);
  const { theme } = useThemeStore();

  // 앱 시작 시 세션 복원 (쿠키의 JWT로 GET /me)
  useEffect(() => {
    init();
  }, [init]);

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
      if (e.key === 'Delete' && selectedEntityId) {
        e.preventDefault();
        const entity = entities.find(en => en.id === selectedEntityId);
        if (!entity) return;
        confirmDialog({
          title: '엔티티 삭제',
          message: `"${entity.name}" 엔티티를 삭제할까요?\n연결된 관계선도 함께 삭제됩니다.`,
          confirmText: '삭제',
          danger: true,
        }).then(ok => { if (ok) deleteEntity(entity.id); });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, selectedEntityId, entities, deleteEntity]);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-background text-on-surface font-sans">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar />
        <ERDCanvas />
        {selectedEdgeId ? <RelationshipEditPanel /> : selectedMemoId ? <MemoEditPanel /> : <EntityEditPanel />}
      </div>
      {modalOpen && <AuthModal />}
      {mcpModalOpen && <McpConnectModal />}
      <DialogModal />
    </div>
  );
}

export default App;
