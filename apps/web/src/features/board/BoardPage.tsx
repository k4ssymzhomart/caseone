// /board (master, manager): kanban of the six columns of the CLAUDE.md §6 map, glass cards, filter chips, live.
// Data: useBoard(filters) grouped by row.board_column (BOARD_COLUMNS, BOARD_COLUMN_LABEL from @rota/shared).
import { Page, Placeholder } from '@/components/ui';
import { t } from '@/lib/i18n';

export function BoardPage() {
  return (
    <Page title={t('page.board')}>
      <Placeholder />
    </Page>
  );
}
