export interface OfferedFile {
  id: string;
  name: string;
  size: number;
  sha256: string;
}

export function readOffer(value: unknown): OfferedFile[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('文件清单无效');
  const ids = new Set<string>();
  return value.map((item) => {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id ||
      item.id.length > 100 ||
      ids.has(item.id) ||
      typeof item.name !== 'string' ||
      !item.name ||
      item.name.length > 1100 ||
      !Number.isSafeInteger(item.size) ||
      item.size < 1 ||
      item.size > 8 * 1024 ** 3 ||
      typeof item.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      throw new Error('文件清单无效');
    ids.add(item.id);
    return { id: item.id, name: item.name, size: item.size, sha256: item.sha256 };
  });
}

export function takeAcceptedFile(accepted: Map<string, OfferedFile>, item: OfferedFile) {
  const file = accepted.get(item?.id);
  if (!file || file.size !== item.size || file.sha256 !== item.sha256 || file.name !== item.name)
    throw new Error('接收文件与已确认的清单不符');
  accepted.delete(file.id);
  return file;
}
