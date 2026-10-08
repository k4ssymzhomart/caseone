// «Добавить материал»: a search list over the materials directory, the typical materials of the selected
// fault code first (work_norms.typical).
import type { Material } from '@rota/shared';
import { useState } from 'react';
import { Modal, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { ListGroup } from '@/ui/ListGroup';
import { ListRow } from '@/ui/ListRow';
import { SheetHeader } from '@/ui/SheetHeader';
import { T } from '@/ui/T';
import { TextField } from '@/ui/TextField';

export interface MaterialSearchSheetProps {
  visible: boolean;
  onClose: () => void;
  materials: readonly Material[];
  /** Typical material ids of the selected code, in norm order. */
  typicalIds: readonly number[];
  faultCode: string | null;
  /** Ids already on the form: marked «Уже в списке». */
  addedIds: ReadonlySet<number>;
  onPick: (materialId: number) => void;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').trim();
}

export function MaterialSearchSheet({
  visible,
  onClose,
  materials,
  typicalIds,
  faultCode,
  addedIds,
  onPick,
}: MaterialSearchSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const q = norm(query);

  const close = () => {
    setQuery('');
    onClose();
  };
  const pick = (id: number) => {
    setQuery('');
    onPick(id);
  };

  const byId = new Map(materials.map((m) => [m.id, m]));
  const typical = q ? [] : typicalIds.map((id) => byId.get(id)).filter((m): m is Material => !!m);
  const typicalSet = new Set(typical.map((m) => m.id));
  const rest = materials.filter(
    (m) => !typicalSet.has(m.id) && (!q || norm(m.name).includes(q) || norm(m.sku).includes(q)),
  );

  const row = (m: Material) => {
    const added = addedIds.has(m.id);
    return (
      <ListRow
        key={m.id}
        density="worker"
        title={m.name}
        subtitle={added ? `${m.unit} · ${t('close.search.added')}` : m.unit}
        right={
          added ? (
            <T variant="headline" color={theme.color.bgAccent} importantForAccessibility="no">
              ✓
            </T>
          ) : undefined
        }
        onPress={() => pick(m.id)}
      />
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={close}
    >
      <View style={{ flex: 1, backgroundColor: theme.color.bgElevated }}>
        <SheetHeader
          title={t('close.addMaterial')}
          closeLabel={t('common.close')}
          onClose={close}
          showHandle={Platform.OS === 'ios'}
        />
        <View style={{ paddingHorizontal: theme.size.gutter, paddingBottom: theme.space[3] }}>
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder={t('close.search.placeholder')}
            accessibilityLabel={t('close.search.placeholder')}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            paddingHorizontal: theme.size.gutter,
            paddingBottom: insets.bottom + theme.space[6],
            gap: theme.space[6],
          }}
        >
          {typical.length ? (
            <ListGroup header={t('close.search.typical', { code: faultCode ?? '' })}>{typical.map(row)}</ListGroup>
          ) : null}
          {rest.length ? (
            <ListGroup header={q ? undefined : t('close.search.all')}>{rest.map(row)}</ListGroup>
          ) : typical.length === 0 ? (
            <T variant="body" tone="secondary" align="center" style={{ marginTop: theme.space[8] }}>
              {t('close.search.empty')}
            </T>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
