import Tabs from 'expo-router/js-tabs';

import { t } from '@/lib/i18n';
import { RoleGate } from '@/lib/roleGate';
import { useTheme } from '@/lib/theme';
import { TabBar } from '@/ui/TabBar';

export default function WorkerLayout() {
  const theme = useTheme();
  return (
    <RoleGate allow={['worker']}>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.color.bgCanvas } }}
      >
        <Tabs.Screen name="index" options={{ title: t('tabs.orders') }} />
        <Tabs.Screen name="closed" options={{ title: t('tabs.closed') }} />
        <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
      </Tabs>
    </RoleGate>
  );
}
