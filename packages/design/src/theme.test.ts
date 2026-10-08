import { describe, expect, it } from 'vitest';
import { color } from './generated/tokens';
import { getTheme, mascotColors, mascotNames, mascots, statusColors, typography, withAlpha } from './index';

describe('theme', () => {
  const dark = getTheme('dark');
  const light = getTheme('light');

  it('exposes every semantic token in both modes', () => {
    const keys = Object.keys(color.light);
    expect(Object.keys(color.dark).sort()).toEqual([...keys].sort());
    for (const t of [dark, light]) {
      expect(Object.keys(t.color)).toHaveLength(keys.length);
      for (const value of Object.values(t.color)) expect(value).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
    }
    expect(dark.color.bgCanvas).toBe('#000000');
    expect(light.color.bgCanvas).toBe('#ffffff');
    expect(dark.color.bgAccentHover).toBe('#ff6555');
    expect(dark.color.glassFillStrong).toBe('#1f1f219e');
  });

  it('has no undefined anywhere', () => {
    const walk = (v: unknown, path: string): void => {
      expect(v, path).not.toBeUndefined();
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(dark, 'dark');
    walk(light, 'light');
  });

  it('keeps the industrial status colors exact', () => {
    expect(dark.status).toEqual(statusColors.dark);
    expect(light.status.free).toBe('#34C759');
    expect(dark.statusSoft.critical).toBe(withAlpha('#FF3B30', 0.22));
    expect(withAlpha('#FF3B30', 0.16)).toBe('#FF3B3029');
  });

  it('has shadows only in light mode', () => {
    expect(light.shadow.soft.boxShadow).toContain('rgba');
    expect(dark.shadow.soft.boxShadow).toBeUndefined();
  });

  it('names a font family for every variant', () => {
    for (const v of Object.values(typography)) expect(v.fontFamily).toMatch(/^(Inter|GeistMono)_\d00/);
  });
});

describe('brand', () => {
  it('has 24 mascots with known layer roles', () => {
    expect(mascotNames).toHaveLength(24);
    for (const name of mascotNames) {
      for (const [role] of mascots[name].layers) {
        expect(mascotColors.dark[role]).toBeDefined();
        expect(mascotColors.light[role]).toBeDefined();
      }
    }
  });
});
