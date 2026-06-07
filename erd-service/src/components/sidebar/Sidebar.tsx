import { useERDStore } from '../../store/erdStore';

// 디자인 시안의 SideNavBar — Add Entity / Entity List는 실제 기능 연결,
// Relations/Layers/History/Help/Docs는 현재 기능이 없는 비활성 placeholder
export default function Sidebar() {
  const { entities, selectedEntityId, selectEntity, addEntity } = useERDStore();

  return (
    <aside className="w-[280px] shrink-0 flex flex-col bg-surface-container-low border-r border-outline-variant">
      {/* Project header */}
      <div className="p-4 border-b border-outline-variant flex items-center gap-3">
        <div className="w-10 h-10 rounded bg-primary-container flex items-center justify-center text-on-primary-container">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>schema</span>
        </div>
        <div>
          <h2 className="text-[17px] font-semibold text-on-surface m-0 leading-tight">Project Schema</h2>
          <span className="font-mono text-[11px] text-on-surface-variant">v1.0.4-beta</span>
        </div>
      </div>

      {/* Add Entity */}
      <div className="p-4">
        <button
          className="w-full bg-primary text-on-primary py-2 rounded-lg text-sm font-semibold hover:bg-inverse-primary hover:text-white transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          onClick={addEntity}
        >
          <span className="material-symbols-outlined text-[18px]">add</span> Add Entity
        </button>
      </div>

      {/* Nav + Entity list */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2 flex flex-col gap-1">
        <NavItem icon="table_chart" label="Entities" active filled />
        <NavItem icon="mediation" label="Relations" />
        <NavItem icon="layers" label="Layers" />
        <NavItem icon="history" label="History" />

        <div className="mt-6 mb-2 px-3 text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant opacity-70">
          Entity List
        </div>
        <div className="flex flex-col gap-1 px-1">
          {entities.map(e => {
            const selected = e.id === selectedEntityId;
            return (
              <button
                key={e.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer text-left transition-colors font-mono text-xs ${
                  selected
                    ? 'bg-surface-variant border border-outline-variant text-primary'
                    : 'border border-transparent hover:bg-surface-variant text-on-surface'
                }`}
                onClick={() => selectEntity(e.id)}
              >
                <span
                  className="material-symbols-outlined text-[16px] shrink-0"
                  style={{ color: selected ? undefined : e.color }}
                >
                  table_rows
                </span>
                <span className="truncate">{e.name}</span>
              </button>
            );
          })}
          {entities.length === 0 && (
            <div className="px-3 py-2 text-xs text-outline italic">
              아직 엔티티가 없습니다
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-outline-variant p-2 flex flex-col gap-1">
        <NavItem icon="help" label="Help" />
        <NavItem icon="description" label="Docs" />
      </div>
    </aside>
  );
}

function NavItem({ icon, label, active, filled }: {
  icon: string; label: string; active?: boolean; filled?: boolean
}) {
  return (
    <span
      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-default transition-all text-[11px] font-bold tracking-[0.05em] uppercase ${
        active
          ? 'bg-secondary-container text-on-secondary-container'
          : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
      }`}
      title={active ? undefined : `${label} (준비 중)`}
    >
      <span
        className="material-symbols-outlined text-[18px]"
        style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {icon}
      </span>
      {label}
    </span>
  );
}
