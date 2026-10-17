const LOOKUP = (() => {
  const t = new Uint8Array(256);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i++) t[chars.charCodeAt(i)] = i;
  return t;
})();

/** Decode standard base64 into a fresh (4-byte aligned) ArrayBuffer. */
export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  let len = b64.length;
  while (len > 0 && b64.charCodeAt(len - 1) === 61 /* = */) len--;
  const outLen = Math.floor((len * 3) / 4);
  const bytes = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const a = LOOKUP[b64.charCodeAt(i)];
    const b = LOOKUP[b64.charCodeAt(i + 1)];
    const c = i + 2 < len ? LOOKUP[b64.charCodeAt(i + 2)] : 0;
    const d = i + 3 < len ? LOOKUP[b64.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < outLen) bytes[o++] = (n >> 16) & 255;
    if (o < outLen) bytes[o++] = (n >> 8) & 255;
    if (o < outLen) bytes[o++] = n & 255;
  }
  return bytes.buffer;
}
