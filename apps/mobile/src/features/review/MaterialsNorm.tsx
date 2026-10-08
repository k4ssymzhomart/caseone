// Closing materials against the work norm of the fault code (CLAUDE.md §12 master view, §11 R3).
import { formatNumber, type OrderMaterialView, type WorkNorm } from '@rota/shared';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { ListGroup } from '@/ui/ListGroup';
import { ListRow } from '@/ui/ListRow';
import { T } from '@/ui/T';

export interface MaterialsNormProps {
  materials: readonly OrderMaterialView[];
  norm: WorkNorm | undefined;
  faultCode: string | null;
}

export function MaterialsNorm({ materials, norm, faultCode }: MaterialsNormProps) {
  const theme = useTheme();

  if (materials.length === 0) {
    return (
      <ListGroup header={t('review.materials')}>
        <ListRow title={t('common.no_materials')} />
      </ListGroup>
    );
  }

  return (
    <ListGroup header={t('review.materials')}>
      {materials.map((m) => {
        const typical = norm?.typical.find((x) => x.material_id === m.material_id);
        const over = typical ? m.qty > typical.qty_max : false;
        let subtitle: string;
        let tone: string = theme.color.textPrimary;
        if (!norm) {
          subtitle = t('review.noNorm');
        } else if (!typical) {
          subtitle = t('review.notTypical', { code: faultCode ?? '' });
          tone = theme.status.warning;
        } else if (over) {
          subtitle = t('review.overNorm', { max: formatNumber(typical.qty_max, 2), unit: m.unit });
          tone = theme.status.critical;
        } else {
          subtitle = t('review.normUpTo', { max: formatNumber(typical.qty_max, 2), unit: m.unit });
        }
        return (
          <ListRow
            key={m.id}
            title={m.material_name}
            subtitle={subtitle}
            right={
              <T variant="monoM" color={tone} weight={over ? 'medium' : undefined}>
                {t('review.qty', { qty: formatNumber(m.qty, 2), unit: m.unit })}
              </T>
            }
          />
        );
      })}
    </ListGroup>
  );
}
