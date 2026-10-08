// File exports of the report pages (CLAUDE.md §12, §14): PDF through pdfmake (Cyrillic through the default Roboto
// vfs) and Excel through exceljs. Both libraries are large, so they load on the first click only (dynamic import,
// their own chunks); the main bundle never carries them.
//
//   await downloadPdf(shiftReportPdf(input), 'rota-shift-2026-10-09-0800.pdf');
//   await downloadXlsx(shiftReportSheets(input), 'rota-shift-2026-10-09-0800.xlsx');
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { SheetSpec } from './sheets';

interface PdfMake {
  addVirtualFileSystem(vfs: Record<string, string>): void;
  createPdf(doc: TDocumentDefinitions): { getBlob(): Promise<Blob> };
}

/** The default export of a CommonJS module loaded through import(), or the namespace itself. */
function cjs<T>(mod: unknown): T {
  const m = mod as { default?: unknown };
  return (m.default ?? m) as T;
}

let pdfMakeLoad: Promise<PdfMake> | null = null;

/** pdfmake with the Roboto fonts of its vfs (they carry Cyrillic). Loaded once. */
export function loadPdfMake(): Promise<PdfMake> {
  pdfMakeLoad ??= Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
    .then(([lib, fonts]) => {
      const pdfMake = cjs<PdfMake>(lib);
      pdfMake.addVirtualFileSystem(cjs<Record<string, string>>(fonts));
      return pdfMake;
    })
    .catch((e: unknown) => {
      pdfMakeLoad = null;
      throw e;
    });
  return pdfMakeLoad;
}

/** Saves a blob under a file name through a temporary link. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadPdf(doc: TDocumentDefinitions, filename: string): Promise<void> {
  const pdfMake = await loadPdfMake();
  saveBlob(await pdfMake.createPdf(doc).getBlob(), filename);
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** Characters Excel does not allow in a sheet name; names are cut at 31 characters. */
const BAD_SHEET_CHARS = /[\\/?*[\]:]/g;

/** A workbook from sheet specs: a title row, a bold header row with a filter, frozen panes, number formats. */
export async function downloadXlsx(sheets: readonly SheetSpec[], filename: string): Promise<void> {
  const ExcelJS = cjs<typeof import('exceljs')>(await import('exceljs'));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Rota';
  wb.created = new Date();
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name.replace(BAD_SHEET_CHARS, ' ').slice(0, 31));
    let headerRow = 1;
    for (const line of spec.title ?? []) {
      const row = ws.addRow([line]);
      if (headerRow === 1) row.font = { bold: true, size: 13 };
      headerRow += 1;
    }
    if ((spec.title ?? []).length > 0) {
      ws.addRow([]);
      headerRow += 1;
    }
    const header = ws.addRow(spec.columns.map((c) => c.header));
    header.font = { bold: true };
    header.alignment = { vertical: 'middle', wrapText: true };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F7' } };
    for (const r of spec.rows) ws.addRow(spec.columns.map((c) => r[c.key] ?? null));
    spec.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width ?? 16;
      if (c.numFmt) col.numFmt = c.numFmt;
      if (c.wrap) col.alignment = { wrapText: true, vertical: 'top' };
    });
    if (spec.rows.length > 0) {
      ws.views = [{ state: 'frozen', ySplit: headerRow }];
      ws.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: { row: headerRow, column: spec.columns.length },
      };
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buffer], { type: XLSX_TYPE }), filename);
}

/**
 * An image as a data URL for pdfmake (JPEG and PNG only), or null when it cannot be read: the signed URL expired,
 * the network failed or the storage refused the cross origin read.
 */
export async function imageDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.type !== 'image/jpeg' && blob.type !== 'image/png') return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** «2026-10-09-0800» in Asia/Qostanay (fixed UTC+5) for file names. */
export function fileStamp(iso: string | Date): string {
  const ms = typeof iso === 'string' ? Date.parse(iso) : iso.getTime();
  const d = new Date(ms + 5 * 3600_000).toISOString();
  return `${d.slice(0, 10)}-${d.slice(11, 13)}${d.slice(14, 16)}`;
}
