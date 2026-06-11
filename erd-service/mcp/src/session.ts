// 현재 선택된 다이어그램 컨텍스트 — 변형 도구는 명시 diagram_id가 없으면 이 값을 사용.

let currentId: number | null = null;

export function getCurrentId(): number | null {
  return currentId;
}

export function setCurrentId(id: number | null): void {
  currentId = id;
}

export function requireCurrentId(): number {
  if (currentId == null) {
    throw new Error('선택된 다이어그램이 없습니다. 먼저 create_diagram 또는 select_diagram을 호출하세요.');
  }
  return currentId;
}
