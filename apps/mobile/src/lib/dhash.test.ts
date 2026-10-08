import { describe, expect, it } from 'vitest';

import { dhashFromRgba, hamming } from './dhash';

/** A 9 × 8 RGBA image from a gray value per pixel. */
function image(gray: (x: number, y: number) => number): Uint8Array {
  const out = new Uint8Array(9 * 8 * 4);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 9; x++) {
      const i = (y * 9 + x) * 4;
      const g = gray(x, y);
      out[i] = g;
      out[i + 1] = g;
      out[i + 2] = g;
      out[i + 3] = 255;
    }
  }
  return out;
}

describe('dhash', () => {
  it('is 16 lowercase hex chars', () => {
    expect(dhashFromRgba(image((x) => x * 20))).toMatch(/^[0-9a-f]{16}$/);
  });

  it('a left to right gradient getting darker sets every bit', () => {
    expect(dhashFromRgba(image((x) => 255 - x * 25))).toBe('ffffffffffffffff');
  });

  it('a left to right gradient getting lighter sets no bit', () => {
    expect(dhashFromRgba(image((x) => x * 25))).toBe('0000000000000000');
  });

  it('a slightly brighter copy of a photo keeps the same hash (duplicate detection)', () => {
    const base = (x: number, y: number) => ((x * 37 + y * 91) % 200) + 20;
    const a = dhashFromRgba(image(base));
    const b = dhashFromRgba(image((x, y) => Math.min(255, base(x, y) + 10)));
    expect(hamming(a, b)).toBe(0);
  });

  it('two different images are far apart', () => {
    const a = dhashFromRgba(image((x) => 255 - x * 25));
    const b = dhashFromRgba(image((x) => x * 25));
    expect(hamming(a, b)).toBe(64);
  });
});
