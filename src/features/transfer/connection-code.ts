import { compressSync, Decompress, strFromU8, strToU8 } from 'fflate';
const LIMIT = 128 * 1024;
export const encode = (description: RTCSessionDescriptionInit) =>
  'IJ1.' + btoa(String.fromCharCode(...compressSync(strToU8(JSON.stringify(description)))));
export function decode(code: string): RTCSessionDescriptionInit {
  if (!code.startsWith('IJ1.') || code.length > 50000) throw new Error('连接码无效');
  const compressed = Uint8Array.from(atob(code.slice(4).trim()), (c) => c.charCodeAt(0));
  const pieces: Uint8Array[] = [];
  let length = 0;
  const inflate = new Decompress((chunk) => {
    length += chunk.length;
    if (length > LIMIT) throw new Error('连接码内容过大');
    pieces.push(chunk);
  });
  // Feed small compressed pieces so a compression bomb cannot allocate a giant
  // output before the callback checks the cumulative expansion limit.
  for (let i = 0; i < compressed.length; i += 32)
    inflate.push(compressed.subarray(i, i + 32), i + 32 >= compressed.length);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const piece of pieces) {
    bytes.set(piece, offset);
    offset += piece.length;
  }
  const data = JSON.parse(strFromU8(bytes));
  if (
    !data ||
    !['offer', 'answer'].includes(data.type) ||
    typeof data.sdp !== 'string' ||
    data.sdp.length > 100000
  )
    throw new Error('连接码无效');
  return data;
}
