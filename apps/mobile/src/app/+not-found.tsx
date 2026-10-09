// Unknown route (a mistyped address in the web build, an old deep link): a Russian screen with one way home,
// in place of Expo Router's default English page. The index route then sends the person to their own home.
import { router, type Href } from 'expo-router';

import { t } from '@/lib/i18n';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';

export default function NotFound() {
  return (
    <Screen
      scroll={false}
      footer={
        <Button
          label={t('notFound.home')}
          variant="primary"
          size="L"
          full
          onPress={() => router.replace('/' as Href)}
        />
      }
    >
      <EmptyState mascot="dizzy" title={t('notFound.title')} body={t('notFound.body')} style={{ flex: 1 }} />
    </Screen>
  );
}
