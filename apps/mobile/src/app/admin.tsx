// The admin works in the web panel (CLAUDE.md §18). On the phone: where to go, links to the demo controls and
// the kit, «Выйти».
import { appleLogo, chromeLogo, windowsLogo } from '@rota/design';
import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { SignOutGroup } from '@/features/profile/ProfileSections';
import { useSession } from '@/lib/api';
import { t } from '@/lib/i18n';
import { RoleGate } from '@/lib/roleGate';
import { useTheme } from '@/lib/theme';
import { EmptyState } from '@/ui/EmptyState';
import { ListGroup } from '@/ui/ListGroup';
import { ListRow } from '@/ui/ListRow';
import { LOGO_SIZE, PlatformLogo } from '@/ui/PlatformLogo';
import { Screen } from '@/ui/Screen';

/** Public address of the web panel, set at build time once it is deployed (a public value, never a secret). */
const WEB_PANEL_URL = process.env.EXPO_PUBLIC_WEB_URL;

/** Where the panel opens: a computer with Windows or a Mac, in a browser such as Chrome. */
const PANEL_PLATFORMS = [windowsLogo, appleLogo, chromeLogo] as const;

export default function AdminRoute() {
  return (
    <RoleGate allow={['admin']}>
      <Admin />
    </RoleGate>
  );
}

function Admin() {
  const theme = useTheme();
  const session = useSession();
  if (!session) return null;

  return (
    <Screen
      title={t('admin.title')}
      eyebrow={t('admin.eyebrow', { name: session.short_name, tab: session.tab_no })}
    >
      <View style={{ gap: theme.space[6] }}>
        <EmptyState mascot="wrench" title={t('admin.headline')} body={t('admin.body')} />
        <ListGroup>
          <ListRow
            title={t('admin.address')}
            value={WEB_PANEL_URL ?? t('admin.addressPending')}
            mono={!!WEB_PANEL_URL}
          />
          <ListRow
            title={t('admin.platforms')}
            subtitle={t('admin.platformsHint')}
            right={
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}
                accessible
                accessibilityLabel={PANEL_PLATFORMS.map((l) => l.title).join(', ')}
              >
                {PANEL_PLATFORMS.map((logo) => (
                  <PlatformLogo key={logo.title} logo={logo} size={LOGO_SIZE.compact} />
                ))}
              </View>
            }
            testID="admin-platforms"
          />
        </ListGroup>
        <ListGroup header={t('profile.tools')}>
          <ListRow
            title={t('profile.demo')}
            subtitle={t('profile.demoHint')}
            onPress={() => router.push('/demo' as Href)}
          />
          <ListRow title={t('profile.kit')} onPress={() => router.push('/kit' as Href)} />
        </ListGroup>
        <SignOutGroup density="master" />
      </View>
    </Screen>
  );
}
