import { RELATIONSHIP_LABELS, RelationshipType } from '../../types/erd';

interface Props {
  onSelect: (type: RelationshipType) => void;
  onCancel: () => void;
  title?: string;
  current?: RelationshipType;   // 타입 변경 모드에서 현재 타입 강조
}

export default function RelTypeModal({ onSelect, onCancel, title = '관계 종류 선택', current }: Props) {
  const types = Object.entries(RELATIONSHIP_LABELS) as [RelationshipType, string][];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="rounded-xl shadow-2xl overflow-hidden min-w-72 bg-surface-container border border-outline-variant"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-outline-variant flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">mediation</span>
          <h3 className="text-sm font-semibold text-on-surface m-0">{title}</h3>
        </div>
        <div className="p-2">
          {types.map(([type, label]) => (
            <button
              key={type}
              className={`w-full text-left px-4 py-2.5 text-sm text-on-surface hover:bg-surface-variant rounded-lg transition-colors cursor-pointer group ${
                current === type ? 'bg-surface-variant border border-primary/40' : ''
              }`}
              onClick={() => onSelect(type)}
            >
              <div className="font-mono text-xs font-bold group-hover:text-primary transition-colors flex items-center gap-2">
                {label}
                {current === type && (
                  <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[9px] uppercase tracking-wider font-sans">현재</span>
                )}
              </div>
              <div className="text-[11px] text-on-surface-variant mt-0.5">
                {getTypeDesc(type)}
              </div>
            </button>
          ))}
        </div>
        <div className="px-4 pb-3">
          <button
            className="w-full text-xs text-on-surface-variant hover:text-on-surface py-1.5 cursor-pointer transition-colors"
            onClick={onCancel}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

function getTypeDesc(type: RelationshipType): string {
  switch (type) {
    case 'ONE_TO_MANY_IDENTIFYING':
      return '하위 엔티티 PK에 FK 자동 추가 · 실선';
    case 'ONE_TO_MANY_NON_IDENTIFYING':
      return '하위 엔티티에 FK 참조만 표시 · 점선';
    case 'ONE_TO_MANY_OPTIONAL':
      return '선택적 관계 · 점선 (선택)';
    case 'ONE_TO_ONE_IDENTIFYING':
      return '1:1 식별 관계 · 실선';
    case 'ONE_TO_ONE_NON_IDENTIFYING':
      return '1:1 비식별 관계 · 점선';
    default:
      return '';
  }
}
