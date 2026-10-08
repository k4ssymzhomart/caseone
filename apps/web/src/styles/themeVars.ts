// CSS variables that tokens.css does not carry: the industrial status colors (@rota/design statusColors, with their
// soft fills) and the chart palette (lib/chart.ts). Generated from those sources at start, one <style> element,
// light and dark like tokens.css. Use them as var(--status-free), var(--status-free-soft), var(--chart-1).
import { softAlpha, statusColors, withAlpha, type ThemeMode } from '@rota/design';
import { CHART_PALETTE } from '../lib/chart';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function block(mode: ThemeMode): string {
  const lines: string[] = [];
  for (const [tone, hex] of Object.entries(statusColors[mode])) {
    lines.push(`--status-${kebab(tone)}: ${hex};`);
    lines.push(`--status-${kebab(tone)}-soft: ${withAlpha(hex, softAlpha[mode])};`);
  }
  CHART_PALETTE[mode].forEach((hex, i) => lines.push(`--chart-${i + 1}: ${hex};`));
  return lines.join(' ');
}

export function installThemeVars(): void {
  const id = 'rota-theme-vars';
  if (document.getElementById(id)) return;
  const css = [
    `:root, [data-theme="light"] { ${block('light')} }`,
    `[data-theme="dark"] { ${block('dark')} }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${block('dark')} } }`,
  ].join('\n');
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}
