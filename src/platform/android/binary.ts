export function encodeBytes(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function decodeBytes(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
