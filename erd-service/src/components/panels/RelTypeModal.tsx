import { RELATIONSHIP_LABELS, RelationshipType } from '../../types/erd';

interface Props {
  onSelect: (type: RelationshipType) => void;
  onCancel: () => void;
}

export default function RelTypeModal({ onSelect, onCancel }: Props) {
  const types = Object.entries(RELATIONSHIP_LABELS) as [RelationshipType, string][];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="rounded-xl shadow-2xl overflow-hidden min-w-64"
        style={{ background: '#1e293b', border: '1px solid #334155' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-700">
          <h3 className="text-sm font-semibold text-slate-200">관계 종류 선택</h3>
        </div>
        <div className="p-2">
          {types.map(([type, label]) => (
            <button
              key={type}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
              onClick={() => onSelect(type)}
            >
              <div className="font-medium">{label}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {getTypeDesc(type)}
              </div>
            </button>
          ))}
        </div>
        <div className="px-4 pb-3">
          <button
            className="w-full text-xs text-slate-500 hover:text-slate-300 py-1"
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
