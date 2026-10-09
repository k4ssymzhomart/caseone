// «Скачать PDF» and «Скачать Excel» on the report pages and the order report: a secondary pill led by the file badge
// of its format (the red PDF sheet, the green Excel sheet), which stays while the button says «Готовим файл».
import { pdfLogo, xlsxLogo } from '@rota/design';
import type { ButtonHTMLAttributes } from 'react';
import { Button } from '@/components/rota';
import { BrandMark } from '@/components/ui';
import { t } from '@/lib/i18n';
import s from '../reports.module.css';
import type { ExportKind } from './useExport';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> {
  kind: ExportKind;
  /** This button's file is being prepared. */
  busy: boolean;
}

export function ExportButton({ kind, busy, ...rest }: Props) {
  return (
    <Button variant="secondary" className={s.exportButton} aria-busy={busy || undefined} {...rest}>
      <BrandMark logo={kind === 'pdf' ? pdfLogo : xlsxLogo} size={18} />
      {busy ? t('export.busy') : kind === 'pdf' ? t('report.export_pdf') : t('report.export_excel')}
    </Button>
  );
}
