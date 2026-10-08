import Tabs from 'expo-router/js-tabs';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { TabBar } from '@/ui/TabBar';

export default function ManagerLayout() {
  const theme = useTheme();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.color.bgCanvas } }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.summary') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
