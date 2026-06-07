import { useRef } from 'react';
import { useERDStore } from '../../store/erdStore';
import { saveERD, loadERD } from '../../utils/fileIO';

// 디자인 시안의 TopNavBar — 알림/설정/아바타는 현재 기능이 없는
// 비활성 placeholder, Save/불러오기는 기존 기능 연결
export default function Toolbar() {
  const {
    entities, relationships, nodePositions, loadData,
    undo, redo, past, future,
  } = useERDStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    saveERD(entities, relationships, nodePositions);
  };

  const handleLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await loadERD(file);
      const positions: Record<string, { x: number; y: number }> = {};
      data.entities.forEach(({ entity, position }) => {
        positions[entity.id] = position;
      });
      loadData(
        data.entities.map(e => e.entity),
        data.relationships,
        positions
      );
    } catch (err) {
      alert((err as Error).message);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <header className="flex justify-between items-center h-12 px-8 w-full z-50 shrink-0 bg-surface border-b border-outline-variant">
      <div className="flex items-center gap-4">
        <div className="text-[22px] leading-8 tracking-tight font-black text-primary">DataModeler Pro</div>
      </div>

      <div className="flex items-center gap-2">
        {/* Undo / Redo */}
        <button
          className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-pointer disabled:opacity-30 disabled:cursor-default disabled:hover:text-on-surface-variant"
          onClick={undo}
          disabled={past.length === 0}
          title="실행 취소 (Ctrl+Z)"
          aria-label="Undo"
        >
          <span className="material-symbols-outlined text-[20px]">undo</span>
        </button>
        <button
          className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-pointer disabled:opacity-30 disabled:cursor-default disabled:hover:text-on-surface-variant"
          onClick={redo}
          disabled={future.length === 0}
          title="다시 실행 (Ctrl+Y)"
          aria-label="Redo"
        >
          <span className="material-symbols-outlined text-[20px]">redo</span>
        </button>
        <div className="w-px h-5 bg-outline-variant mx-1" />

        {/* Save */}
        <button
          className="bg-primary-container text-on-primary-container hover:bg-primary hover:text-on-primary px-4 py-1.5 rounded transition-colors text-xs font-mono font-semibold cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-default"
          onClick={handleSave}
          disabled={entities.length === 0}
        >
          Save
        </button>

        {/* 불러오기 */}
        <button
          className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          title="불러오기 (JSON)"
          aria-label="Open file"
        >
          <span className="material-symbols-outlined text-[20px]">folder_open</span>
        </button>

        <div className="flex items-center gap-2 border-l border-outline-variant pl-4 ml-2">
          <button aria-label="Notifications" className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-default" title="알림 (준비 중)">
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </button>
          <button aria-label="Settings" className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-default" title="설정 (준비 중)">
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>
          <div
            className="w-8 h-8 rounded-full border border-outline-variant ml-2 bg-secondary-container text-on-secondary-container flex items-center justify-center"
            title="User"
          >
            <span className="material-symbols-outlined text-[18px]">person</span>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleLoad}
      />
    </header>
  );
}
