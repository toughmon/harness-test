import { useRef } from 'react';
import { useERDStore } from '../../store/erdStore';
import { saveERD, loadERD } from '../../utils/fileIO';

export default function Toolbar() {
  const { entities, relationships, nodePositions, addEntity, loadData } = useERDStore();
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
    <div
      className="flex items-center gap-3 px-4 py-2 shrink-0"
      style={{ background: '#0f172a', borderBottom: '1px solid #1e293b', height: 48 }}
    >
      {/* Logo */}
      <span className="text-blue-400 font-bold text-base mr-2">ERD Editor</span>

      <div className="w-px h-5 bg-slate-700" />

      {/* Add Entity */}
      <button
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white transition-colors"
        onClick={addEntity}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="7" y1="4" x2="7" y2="10" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        엔티티 추가
      </button>

      <div className="flex-1" />

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <LegendItem label="식별" solid uid />
        <LegendItem label="비식별" dashed />
        <LegendItem label="선택" dotted />
      </div>

      <div className="w-px h-5 bg-slate-700" />

      {/* Save */}
      <button
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
        onClick={handleSave}
        disabled={entities.length === 0}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 2h8l2 2v8H2V2z" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="4" y="8" width="6" height="4" stroke="currentColor" strokeWidth="1"/>
          <rect x="4" y="2" width="5" height="3" stroke="currentColor" strokeWidth="1"/>
        </svg>
        저장
      </button>

      {/* Load */}
      <button
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 3h4l1 2h7v6H1V3z" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        불러오기
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleLoad}
      />
    </div>
  );
}

function LegendItem({ label, solid, dashed, dotted, uid }: {
  label: string; solid?: boolean; dashed?: boolean; dotted?: boolean; uid?: boolean
}) {
  // 바커: 식별/비식별 = 왼쪽(부모) 절반 점선 + 오른쪽(자식) 절반 실선, 선택 = 전체 점선
  const halfDashed = solid || dashed;
  return (
    <div className="flex items-center gap-1.5">
      <svg width="28" height="10" viewBox="0 0 28 10">
        {halfDashed ? (
          <>
            <line x1="2" y1="5" x2="14" y2="5" stroke="#64748b" strokeWidth="1.5"
              strokeDasharray="3 2" />
            <line x1="14" y1="5" x2="26" y2="5" stroke="#64748b" strokeWidth="1.5" />
          </>
        ) : (
          <line x1="2" y1="5" x2="26" y2="5" stroke="#64748b" strokeWidth="1.5"
            strokeDasharray="3 2" />
        )}
        {uid && <line x1="22" y1="1" x2="22" y2="9" stroke="#64748b" strokeWidth="1.5" />}
      </svg>
      <span>{label}</span>
    </div>
  );
}
