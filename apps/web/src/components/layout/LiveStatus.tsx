import { t } from '@/lib/i18n';
import { useLiveStatus } from '@/lib/live';
import { Pill } from '../ui';

/** «В сети», «Подключение», «Нет связи» (and «Демо данные» in mock mode): a dot plus a word. */
export function LiveStatus({ mock }: { mock: boolean }) {
  const status = useLiveStatus();
  if (mock) return <Pill tone="info">{t('topbar.mode_mock')}</Pill>;
  if (status === 'offline') return <Pill tone="critical">{t('topbar.offline')}</Pill>;
  if (status === 'connecting') return <Pill tone="off">{t('topbar.connecting')}</Pill>;
  return <Pill tone="free">{t('topbar.live')}</Pill>;
}
