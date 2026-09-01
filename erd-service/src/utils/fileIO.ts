import { Entity, Memo, Relationship, ERDData } from '../types/erd';
import { toERDData } from './erdData';
import { getT } from '../i18n';

export function saveERD(
  entities: Entity[],
  relationships: Relationship[],
  positions: Record<string, { x: number; y: number }>,
  memos: Memo[] = []
) {
  const data = toERDData(entities, relationships, positions, memos);

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `erd-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function loadERD(file: File): Promise<ERDData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as ERDData;
        if (!data.version || !data.entities || !data.relationships) {
          reject(new Error(getT()('file.invalidErd')));
          return;
        }
        resolve(data);
      } catch {
        reject(new Error(getT()('file.jsonParseError')));
      }
    };
    reader.onerror = () => reject(new Error(getT()('file.readError')));
    reader.readAsText(file);
  });
}
