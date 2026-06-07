import { useRef } from 'react';
import { useERDStore } from '../../store/erdStore';
import { saveERD, loadERD } from '../../utils/fileIO';

// 디자인 시안의 TopNavBar — File/Edit/View/Export 메뉴와 알림/설정/아바타는
// 현재 기능이 없는 비활성 placeholder, Save/불러오기는 기존 기능 연결
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
        <nav className="hidden md:flex items-center gap-4 ml-8 h-full text-sm">
          <span className="text-on-surface-variant hover:bg-surface-variant transition-colors cursor-default px-3 py-1 rounded">File</span>
          <span className="text-on-surface-variant hover:bg-surface-variant transition-colors cursor-default px-3 py-1 rounded">Edit</span>
          <span className="text-primary border-b-2 border-primary pb-1 font-semibold">View</span>
          <span className="text-on-surface-variant hover:bg-surface-variant transition-colors cursor-default px-3 py-1 rounded">Export</span>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        {/* Barker 표기법 범례 */}
        <div className="hidden lg:flex items-center gap-4 text-[11px] text-on-surface-variant mr-3">
          <LegendItem label="식별" solid uid />
          <LegendItem label="비식별" dashed />
          <LegendItem label="선택" dotted />
        </div>

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

function LegendItem({ label, solid, dashed, dotted, uid }: {
  label: string; solid?: boolean; dashed?: boolean; dotted?: boolean; uid?: boolean
}) {
  // 바커: 식별/비식별 = 왼쪽(부모) 절반 점선 + 오른쪽(자식) 절반 실선, 선택 = 전체 점선
  void dotted;
  const halfDashed = solid || dashed;
  const c = '#908fa0';
  return (
    <div className="flex items-center gap-1.5">
      <svg width="28" height="10" viewBox="0 0 28 10">
        {halfDashed ? (
          <>
            <line x1="2" y1="5" x2="14" y2="5" stroke={c} strokeWidth="1.5" strokeDasharray="3 2" />
            <line x1="14" y1="5" x2="26" y2="5" stroke={c} strokeWidth="1.5" />
          </>
        ) : (
          <line x1="2" y1="5" x2="26" y2="5" stroke={c} strokeWidth="1.5" strokeDasharray="3 2" />
        )}
        {uid && <line x1="22" y1="1" x2="22" y2="9" stroke={c} strokeWidth="1.5" />}
      </svg>
      <span>{label}</span>
    </div>
  );
}
