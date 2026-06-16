import { useEffect } from 'react';
import Toolbar from './components/toolbar/Toolbar';
import Sidebar from './components/sidebar/Sidebar';
import ERDCanvas from './components/canvas/ERDCanvas';
import EntityEditPanel from './components/panels/EntityEditPanel';
import AuthModal from './components/auth/AuthModal';
import DialogModal from './components/common/DialogModal';
import McpConnectModal from './components/mcp/McpConnectModal';
import { useERDStore } from './store/erdStore';
import { useAuthStore } from './store/authStore';
import { useMcpStore } from './store/mcpStore';
import { useThemeStore } from './store/themeStore';

function App() {
  const { undo, redo } = useERDStore();
  const { modalOpen, init } = useAuthStore();
  const mcpModalOpen = useMcpStore(s => s.modalOpen);
  const { theme } = useThemeStore();

  // 앱 시작 시 세션 복원 (쿠키의 JWT로 GET /me)
  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 전역 Undo/Redo 단축키 — 입력 필드 포커스 중에는 브라우저 기본 동작 유지
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-background text-on-surface font-sans">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar />
        <ERDCanvas />
        <EntityEditPanel />
      </div>
      {modalOpen && <AuthModal />}
      {mcpModalOpen && <McpConnectModal />}
      <DialogModal />
    </div>
  );
}

export default App;
