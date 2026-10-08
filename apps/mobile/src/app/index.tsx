import { Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';

export default function Index() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.bgCanvas }}>
      <Text style={[theme.type.title1, { color: theme.color.textPrimary }]}>Rota</Text>
    </View>
  );
}
