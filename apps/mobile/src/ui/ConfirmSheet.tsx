import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { primitives, withAlpha } from '@rota/design';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

import { Button } from './Button';
import { T } from './T';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions (glove mode: they always go through this sheet). */
  destructive?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Bottom confirm sheet with 64 px buttons in the thumb zone. `await confirm({...})` → true or false. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((options) => {
    resolver.current?.(false);
    setCurrent(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setCurrent(null);
  };

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal visible={current !== null} transparent animationType="slide" onRequestClose={() => finish(false)}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: withAlpha(primitives.black, theme.mode === 'dark' ? 0.62 : 0.35) }]}
          onPress={() => finish(false)}
          accessibilityRole="button"
          accessibilityLabel={current?.cancelLabel ?? t('common.cancel')}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.color.bgElevated,
              borderTopLeftRadius: theme.radius.lg,
              borderTopRightRadius: theme.radius.lg,
              paddingHorizontal: theme.space[4],
              paddingTop: theme.space[6],
              paddingBottom: insets.bottom + theme.space[4],
              gap: theme.space[2],
            },
          ]}
        >
          {current ? (
            <>
              <T variant="title2">{current.title}</T>
              {current.message ? (
                <T variant="body" tone="secondary">
                  {current.message}
                </T>
              ) : null}
              <View style={{ height: theme.space[4] }} />
              <Button
                label={current.confirmLabel}
                variant={current.destructive ? 'danger' : 'primary'}
                size="L"
                full
                onPress={() => finish(true)}
              />
              <Button
                label={current.cancelLabel ?? t('common.cancel')}
                variant="secondary"
                size="L"
                full
                onPress={() => finish(false)}
              />
            </>
          ) : null}
        </View>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm outside ConfirmProvider');
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
