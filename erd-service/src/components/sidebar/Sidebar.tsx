import { useState } from 'react';
import { useERDStore } from '../../store/erdStore';
import { useAuthStore } from '../../store/authStore';
import { useDiagramStore } from '../../store/diagramStore';

// 디자인 시안의 SideNavBar — Add Entity / Entity List는 실제 기능 연결,
// 로그인 시 "내 다이어그램" 섹션 표시, Help/Docs는 비활성 placeholder
// 접기 기능: 캔버스를 넓게 보기 위해 좌측 패널을 얇은 레일로 접을 수 있음
export default function Sidebar() {
  const { entities, selectedEntityId, selectEntity, addEntity } = useERDStore();
  const { status } = useAuthStore();
  const { list, currentId, open, startNew, rename, remove } = useDiagramStore();
  const [collapsed, setCollapsed] = useState(false);

  // 접힌 상태: 얇은 레일만 표시 — 펼치기 버튼 + 엔티티 추가 단축 아이콘
  if (collapsed) {
    return (
      <aside
        data-testid="sidebar"
        data-collapsed="true"
        className="w-12 shrink-0 flex flex-col items-center bg-surface-container-low border-r border-outline-variant py-3 gap-2"
      >
        <button
          className="w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          onClick={() => setCollapsed(false)}
          title="사이드바 펼치기"
          aria-label="Expand sidebar"
          aria-expanded={false}
          data-testid="sidebar-toggle"
        >
          <span className="material-symbols-outlined text-[20px]">left_panel_open</span>
        </button>
        <div className="w-6 border-t border-outline-variant my-1" />
        <button
          className="w-9 h-9 rounded-lg flex items-center justify-center text-on-primary bg-primary hover:bg-inverse-primary hover:text-white transition-colors cursor-pointer active:scale-[0.95]"
          onClick={addEntity}
          title="Add Entity"
          aria-label="Add Entity"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
        </button>
      </aside>
    );
  }

  return (
    <aside data-testid="sidebar" data-collapsed="false" className="w-[280px] shrink-0 flex flex-col bg-surface-container-low border-r border-outline-variant">
      {/* Project header */}
      <div className="p-4 border-b border-outline-variant flex items-center gap-3">
        <div className="w-10 h-10 rounded bg-primary-container flex items-center justify-center text-on-primary-container">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>schema</span>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[17px] font-semibold text-on-surface m-0 leading-tight">Project Schema</h2>
          <span className="font-mono text-[11px] text-on-surface-variant">v1.0.4-beta</span>
        </div>
        <button
          className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors cursor-pointer shrink-0"
          onClick={() => setCollapsed(true)}
          title="사이드바 접기"
          aria-label="Collapse sidebar"
          aria-expanded={true}
          data-testid="sidebar-toggle"
        >
          <span className="material-symbols-outlined text-[20px]">left_panel_close</span>
        </button>
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

      {/* 내 다이어그램 (로그인 시에만) + Entity list */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2 flex flex-col gap-1">
        {status === 'authed' && (
          <div data-testid="my-diagrams">
            <div className="mb-2 px-3 flex items-center justify-between text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant opacity-70">
              <span>내 다이어그램</span>
              <button
                className="material-symbols-outlined text-[16px] cursor-pointer hover:text-primary transition-colors"
                onClick={startNew}
                title="새 다이어그램 (빈 캔버스)"
                aria-label="New diagram"
              >
                add
              </button>
            </div>
            <div className="flex flex-col gap-1 px-1 mb-4">
              {list.map(d => {
                const isCurrent = d.id === currentId;
                return (
                  <div
                    key={d.id}
                    className={`group flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-colors text-xs ${
                      isCurrent
                        ? 'bg-surface-variant border border-primary/40 text-primary'
                        : 'border border-transparent hover:bg-surface-variant text-on-surface'
                    }`}
                    onClick={() => { if (!isCurrent) open(d.id); }}
                  >
                    <span className="material-symbols-outlined text-[15px] shrink-0">cloud</span>
                    <span className="truncate flex-1">{d.name}</span>
                    <button
                      className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:text-primary cursor-pointer shrink-0"
                      onClick={e => { e.stopPropagation(); rename(d.id); }}
                      title="이름 변경"
                      aria-label={`Rename ${d.name}`}
                    >
                      edit
                    </button>
                    <button
                      className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:text-red-400 cursor-pointer shrink-0"
                      onClick={e => { e.stopPropagation(); remove(d.id); }}
                      title="삭제"
                      aria-label={`Delete ${d.name}`}
                    >
                      delete
                    </button>
                  </div>
                );
              })}
              {list.length === 0 && (
                <div className="px-3 py-1 text-xs text-outline italic">
                  DB 저장 버튼으로 저장하면 여기에 표시됩니다
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mb-2 px-3 text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant opacity-70">
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
                {e.logicalName && (
                  <span className="font-sans text-[10px] text-on-surface-variant truncate shrink-0 max-w-20">
                    {e.logicalName}
                  </span>
                )}
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
        <NavItem icon="cable" label="MCP 연결 가이드" href="/mcp-guide.html" />
        <NavItem icon="help" label="Help" />
        <NavItem icon="description" label="Docs" href="/manual.html" />
      </div>
    </aside>
  );
}

// href가 있으면 새 탭으로 여는 링크, 없으면 비활성 placeholder
function NavItem({ icon, label, href }: { icon: string; label: string; href?: string }) {
  const className =
    'flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant hover:bg-surface-variant hover:text-on-surface';

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${className} cursor-pointer no-underline`}
        title={`${label} (새 탭)`}
      >
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
        {label}
      </a>
    );
  }

  return (
    <span className={`${className} cursor-default`} title={`${label} (준비 중)`}>
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
      {label}
    </span>
  );
}
