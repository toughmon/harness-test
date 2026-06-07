import { useEffect } from 'react';
import Toolbar from './components/toolbar/Toolbar';
import Sidebar from './components/sidebar/Sidebar';
import ERDCanvas from './components/canvas/ERDCanvas';
import EntityEditPanel from './components/panels/EntityEditPanel';
import { useERDStore } from './store/erdStore';

function App() {
  const { undo, redo } = useERDStore();

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
    </div>
  );
}

export default App;
