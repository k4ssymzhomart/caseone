// Difference hash (CLAUDE.md §17): a 9 × 8 grayscale image, each pixel compared with its right neighbour,
// 64 bits as 16 lowercase hex characters. Pure, so it is testable without a device.

/** `rgba` is 9 × 8 pixels, 4 bytes each (UPNG.toRGBA8 output). */
export function dhashFromRgba(rgba: Uint8Array, width = 9, height = 8): string {
  const gray = (x: number, y: number): number => {
    const i = (y * width + x) * 4;
    // ITU-R BT.601 luma, the usual dHash choice.
    return 0.299 * (rgba[i] ?? 0) + 0.587 * (rgba[i + 1] ?? 0) + 0.114 * (rgba[i + 2] ?? 0);
  };
  let hex = '';
  for (let y = 0; y < height; y++) {
    let byte = 0;
    for (let x = 0; x < width - 1; x++) {
      byte = (byte << 1) | (gray(x, y) > gray(x + 1, y) ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Number of differing bits between two 16 hex char hashes. */
export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i += 4) {
    let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16);
    while (x) {
      d += x & 1;
      x >>>= 1;
    }
  }
  return d;
}
