/**
 * Web: a picked photo's blob: URL dies on reload, so store a downscaled JPEG data URL instead.
 * It persists in browser storage and travels inside the Drive sync file (~60–150 kB each).
 */
export async function persistPhoto(uri: string, maxSide = 900): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = uri;
  });
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}
