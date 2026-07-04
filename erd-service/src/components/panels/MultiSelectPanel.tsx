import { useERDStore } from '../../store/erdStore';
import { confirmDialog } from '../../store/dialogStore';

// 러버밴드(드래그 박스)로 엔티티/메모를 2개 이상 선택했을 때 뜨는 패널.
// 개별 편집(EntityEditPanel/MemoEditPanel)은 항목이 하나로 좁혀지기 전까지 대신 이 패널이 뜬다.
export default function MultiSelectPanel() {
  const { selectedEntityIds, selectedMemoIds, deleteMany, setSelection } = useERDStore();
  const count = selectedEntityIds.length + selectedMemoIds.length;

  const handleDeleteAll = async () => {
    const ok = await confirmDialog({
      title: '일괄 삭제',
      message: `선택한 ${count}개 항목을 삭제할까요?\n엔티티에 연결된 관계선과 자동 생성 FK 컬럼도 함께 제거됩니다.`,
      confirmText: '삭제',
      danger: true,
    });
    if (ok) deleteMany(selectedEntityIds, selectedMemoIds);
  };

  return (
    <aside
      className="w-[320px] shrink-0 bg-surface-container-low border-l border-outline-variant flex flex-col overflow-hidden"
      data-testid="multi-select-panel"
    >
      {/* Header */}
      <div className="h-12 px-4 border-b border-outline-variant flex items-center justify-between bg-surface-container shrink-0">
        <h3 className="text-[15px] font-semibold text-on-surface m-0 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">select_all</span>
          <span data-testid="multi-select-count">{count}개 선택됨</span>
        </h3>
        <button
          className="text-on-surface-variant hover:text-on-surface transition-colors flex items-center cursor-pointer"
          onClick={() => setSelection([], [])}
          title="선택 해제"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
        <p className="text-sm text-on-surface-variant m-0">
          엔티티 {selectedEntityIds.length}개, 메모 {selectedMemoIds.length}개가 선택되어 있습니다.
        </p>
        <p className="text-xs text-outline m-0">
          그중 하나를 드래그하면 상대 위치를 유지한 채 함께 이동합니다. <kbd className="px-1 py-0.5 rounded bg-surface-container border border-outline-variant text-[10px]">Delete</kbd> 키로 한 번에 삭제할 수 있습니다.
        </p>
        <button
          className="flex items-center justify-center gap-1.5 rounded px-3 py-2 text-[12px] font-mono text-error border border-error/40 hover:bg-error-container/30 transition-colors cursor-pointer"
          onClick={handleDeleteAll}
          data-testid="multi-select-delete-btn"
        >
          <span className="material-symbols-outlined text-[16px]">delete</span>
          선택 항목 삭제
        </button>
      </div>
    </aside>
  );
}
