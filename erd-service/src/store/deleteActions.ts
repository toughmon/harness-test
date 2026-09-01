// 삭제 확인 다이얼로그 공통화 — 같은 문구가 Delete 키 핸들러(App)·캔버스 컨텍스트 메뉴(ERDCanvas)·
// 각 편집 모달에 3벌씩 복붙돼 있던 것을 한곳으로 모았다. 문구가 갈라지는 것을 막고,
// i18n 키도 대상당 1개만 유지된다.
import { useERDStore } from './erdStore';
import { confirmDialog } from './dialogStore';
import { getT } from '../i18n';

export async function confirmDeleteEntity(id: string): Promise<boolean> {
  const s = useERDStore.getState();
  const entity = s.entities.find(e => e.id === id);
  if (!entity) return false;
  const t = getT();
  const ok = await confirmDialog({
    title: t('delete.entity.title'),
    message: t('delete.entity.message', { name: entity.name }),
    confirmText: t('common.delete'),
    danger: true,
  });
  if (ok) s.deleteEntity(id);
  return ok;
}

export async function confirmDeleteRelationship(id: string): Promise<boolean> {
  const s = useERDStore.getState();
  const rel = s.relationships.find(r => r.id === id);
  if (!rel) return false;
  const t = getT();
  const ok = await confirmDialog({
    title: t('delete.relationship.title'),
    message: t('delete.relationship.message', {
      parent: s.entities.find(e => e.id === rel.sourceId)?.name ?? '?',
      child: s.entities.find(e => e.id === rel.targetId)?.name ?? '?',
    }),
    confirmText: t('common.delete'),
    danger: true,
  });
  if (ok) s.deleteRelationship(rel.id);
  return ok;
}

export async function confirmDeleteMemo(id: string): Promise<boolean> {
  const s = useERDStore.getState();
  const t = getT();
  const ok = await confirmDialog({
    title: t('delete.memo.title'),
    message: t('delete.memo.message'),
    confirmText: t('common.delete'),
    danger: true,
  });
  if (ok) { s.deleteMemo(id); s.selectMemo(null); }
  return ok;
}

export async function confirmDeleteMany(entityIds: string[], memoIds: string[]): Promise<boolean> {
  const s = useERDStore.getState();
  const t = getT();
  const ok = await confirmDialog({
    title: t('delete.many.title'),
    message: t('delete.many.message', { n: entityIds.length + memoIds.length }),
    confirmText: t('common.delete'),
    danger: true,
  });
  if (ok) s.deleteMany(entityIds, memoIds);
  return ok;
}
