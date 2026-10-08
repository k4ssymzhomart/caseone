import { t } from '@/lib/i18n';
import { setTheme, useTheme, type ThemeMode } from '@/lib/theme';
import { Segmented } from '../ui';

export function ThemeToggle() {
  const mode = useTheme();
  return (
    <Segmented<ThemeMode>
      label={t('topbar.theme')}
      value={mode}
      onChange={setTheme}
      options={[
        { value: 'dark', label: t('topbar.theme_dark') },
        { value: 'light', label: t('topbar.theme_light') },
      ]}
    />
  );
}
