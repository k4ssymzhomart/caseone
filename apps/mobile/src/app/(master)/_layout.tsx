import { router } from 'expo-router';
import Tabs from 'expo-router/js-tabs';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { TabBar } from '@/ui/TabBar';

export default function MasterLayout() {
  const theme = useTheme();
  return (
    <Tabs
      tabBar={(props) => (
        <TabBar {...props} centerRouteName="issue" onCenterPress={() => router.push('/create')} />
      )}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.color.bgCanvas } }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.shift') }} />
      <Tabs.Screen name="board" options={{ title: t('tabs.board') }} />
      <Tabs.Screen name="issue" options={{ title: t('tabs.issue') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
