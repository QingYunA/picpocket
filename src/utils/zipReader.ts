const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
/** EOCD 固定 22 字节，末尾注释最长 65535 字节 */
const MAX_EOCD_SEARCH = 22 + 0xffff;

function findEndOfCentralDirectory(view: DataView): number {
  const lowest = Math.max(0, view.byteLength - MAX_EOCD_SEARCH);
  for (let i = view.byteLength - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  throw new Error('Not a ZIP archive');
}

async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * 读取 ZIP 全部文件条目（支持 Store 与 Deflate，不支持 ZIP64 与加密）。
 * 返回「路径 → 文件字节」，目录条目会被忽略。
 */
export async function readZipArchive(buffer: ArrayBuffer): Promise<Map<string, Uint8Array<ArrayBuffer>>> {
  try {
    return await readEntries(buffer);
  } catch (err) {
    // 截断或损坏的文件会让偏移越界，统一转成可读错误
    if (err instanceof RangeError) throw new Error('Corrupted ZIP archive');
    throw err;
  }
}

async function readEntries(buffer: ArrayBuffer): Promise<Map<string, Uint8Array<ArrayBuffer>>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const eocd = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralDirOffset = view.getUint32(eocd + 16, true);
  if (centralDirOffset === 0xffffffff || entryCount === 0xffff) throw new Error('ZIP64 archives are not supported');

  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  let cursor = centralDirOffset;

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(cursor, true) !== CENTRAL_DIR_SIGNATURE) throw new Error('Corrupted ZIP central directory');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) continue;
    if (flags & 0x1) throw new Error('Encrypted ZIP entries are not supported');
    if (view.getUint32(localOffset, true) !== LOCAL_HEADER_SIGNATURE) throw new Error('Corrupted ZIP local header');

    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    if (dataStart + compressedSize > bytes.length) throw new RangeError('Entry exceeds archive');
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);

    if (method === METHOD_STORE) files.set(name, raw);
    else if (method === METHOD_DEFLATE) files.set(name, await inflateRaw(raw));
    else throw new Error(`Unsupported ZIP compression method: ${method}`);
  }

  return files;
}
