import { useRef, useState } from 'react';
import { useERDStore } from '../../store/erdStore';
import { useAuthStore } from '../../store/authStore';
import { useDiagramStore } from '../../store/diagramStore';
import { useThemeStore } from '../../store/themeStore';
import { saveERD, loadERD } from '../../utils/fileIO';
import { fromERDData } from '../../utils/erdData';
import { alertDialog } from '../../store/dialogStore';

// 디자인 시안의 TopNavBar — 알림/설정은 현재 기능이 없는 비활성 placeholder,
// Save(JSON)/불러오기는 파일 저장, 로그인 시 DB 저장(cloud) 버튼 추가
export default function Toolbar() {
  const {
    entities, relationships, nodePositions, memos, loadData,
    undo, redo, past, future,
  } = useERDStore();
  const { user, status, openModal, logout } = useAuthStore();
  const { currentId, dirty, saving, list, saveCurrent } = useDiagramStore();
  const { theme, toggleTheme } = useThemeStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const currentName = currentId !== null ? list.find(d => d.id === currentId)?.name : null;

  const handleSave = () => {
    saveERD(entities, relationships, nodePositions, memos);
  };

  const handleLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await loadERD(file);
      const { entities: loaded, relationships: rels, positions, memos: loadedMemos } = fromERDData(data);
      loadData(loaded, rels, positions, loadedMemos);
    } catch (err) {
      alertDialog((err as Error).message, '불러오기 실패');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <header className="flex justify-between items-center h-12 px-8 w-full z-50 shrink-0 bg-surface border-b border-outline-variant">
      <div className="flex items-center gap-4">
        <div className="text-[22px] leading-8 tracking-tight font-black text-primary">YourERD</div>
        {currentName && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-on-surface-variant font-mono" data-testid="current-diagram">
            <span className="material-symbols-outlined text-[16px]">cloud</span>
            {currentName}
            {dirty && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" title="저장되지 않은 변경" />}
          </div>
        )}
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

        {/* DB 저장 (로그인 시에만) */}
        {status === 'authed' && (
          <button
            className="bg-primary text-on-primary hover:bg-inverse-primary hover:text-white px-3 py-1.5 rounded transition-colors text-xs font-mono font-semibold cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-default flex items-center gap-1.5"
            onClick={saveCurrent}
            disabled={saving || entities.length === 0}
            title={currentId !== null ? 'DB에 저장 (덮어쓰기)' : 'DB에 새 다이어그램으로 저장'}
            aria-label="DB Save"
          >
            <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
            {saving ? '저장 중...' : 'DB 저장'}
          </button>
        )}

        {/* Save (JSON 파일 다운로드) */}
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
          <button
            aria-label="Toggle theme"
            data-testid="theme-toggle"
            className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-pointer"
            title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            onClick={toggleTheme}
          >
            <span className="material-symbols-outlined text-[20px]">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
          <button aria-label="Notifications" className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-default" title="알림 (준비 중)">
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </button>
          <button aria-label="Settings" className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-default" title="설정 (준비 중)">
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>
          {/* 사용자 아바타 — anon: 로그인 모달, authed: 드롭다운(로그아웃) */}
          <div className="relative ml-2">
            <button
              className={`w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${
                status === 'authed'
                  ? 'border-primary bg-primary text-on-primary font-bold text-sm'
                  : 'border-outline-variant bg-secondary-container text-on-secondary-container hover:border-primary'
              }`}
              title={status === 'authed' ? user?.username : '로그인'}
              aria-label="User"
              onClick={() => {
                if (status === 'authed') setUserMenuOpen(o => !o);
                else openModal();
              }}
            >
              {status === 'authed' && user ? (
                user.username.charAt(0).toUpperCase()
              ) : (
                <span className="material-symbols-outlined text-[18px]">person</span>
              )}
            </button>
            {userMenuOpen && status === 'authed' && (
              <div className="absolute right-0 top-10 z-50 min-w-40 rounded-lg shadow-2xl bg-surface-container border border-outline-variant py-1">
                <div className="px-4 py-2 text-xs text-on-surface-variant border-b border-outline-variant font-mono" data-testid="user-name">
                  {user?.username}
                </div>
                <button
                  className="w-full text-left px-4 py-2 text-xs text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                >
                  로그아웃
                </button>
              </div>
            )}
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
