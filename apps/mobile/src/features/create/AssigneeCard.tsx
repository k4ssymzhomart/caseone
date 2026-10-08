// The AI suggestion card of the create screen (PHASE_0 §7.1): Avatar, name, «ИИ» tag, the reasons line,
// mascot point at 64 px. Shows the manual choice instead once the master picked someone else.
import type { AssigneeSuggestion } from '@rota/shared';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Avatar, initialsFrom } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Mascot } from '@/ui/Mascot';
import { T } from '@/ui/T';
import { Tag } from '@/ui/Tag';

import type { AssigneeSelection } from './AssigneePicker';

const MASCOT_SIZE = 64;

export interface AssigneeCardProps {
  equipmentChosen: boolean;
  loading: boolean;
  error: boolean;
  /** The AI's first candidate, if any. */
  top: AssigneeSuggestion | null;
  /** The master's own choice; wins over the AI. */
  manual: AssigneeSelection | null;
  /** The suggestion row of the manual choice, when the AI also suggested that person. */
  manualSuggestion: AssigneeSuggestion | null;
  /** Brigade name of a manual brigade choice. */
  brigadeName: string | null;
  onOther: () => void;
  onRetry: () => void;
}

export function AssigneeCard({
  equipmentChosen,
  loading,
  error,
  top,
  manual,
  manualSuggestion,
  brigadeName,
  onOther,
  onRetry,
}: AssigneeCardProps) {
  const theme = useTheme();
  const gap = { gap: theme.space[1] };

  let body: ReactNode;
  if (manual && manual.brigade_id != null) {
    const name = brigadeName ?? manual.short_name;
    body = (
      <View style={[styles.row, { gap: theme.space[3] }]}>
        <Avatar initials={`${initialsFrom(name)}${manual.brigade_id}`} backdropColor={theme.color.bgSubtle} />
        <View style={[styles.col, gap]}>
          <T variant="headline" numberOfLines={1}>
            {name}
          </T>
          <T variant="callout" tone="secondary">
            {t('create.assignee.brigadeLeader', { name: manual.short_name })}
          </T>
        </View>
      </View>
    );
  } else if (manual) {
    body = (
      <View style={[styles.row, { gap: theme.space[3] }]}>
        <Avatar
          name={manual.short_name}
          status={manualSuggestion?.status}
          backdropColor={theme.color.bgSubtle}
        />
        <View style={[styles.col, gap]}>
          <View style={[styles.row, { gap: theme.space[2] }]}>
            <T variant="headline" numberOfLines={1} style={styles.shrink}>
              {manual.short_name}
            </T>
            {manualSuggestion ? <Tag label={t('common.ai')} tone="accent" /> : null}
          </View>
          <T variant="callout" tone="secondary">
            {manualSuggestion ? manualSuggestion.reasons.join(' · ') : t('create.assignee.manual')}
          </T>
        </View>
      </View>
    );
  } else if (!equipmentChosen) {
    body = (
      <T variant="callout" tone="secondary">
        {t('create.assignee.needEquipment')}
      </T>
    );
  } else if (loading) {
    body = (
      <View style={[styles.row, { gap: theme.space[3] }]}>
        <ActivityIndicator color={theme.color.textSecondary} />
        <T variant="callout" tone="secondary" style={styles.col}>
          {t('create.assignee.loading')}
        </T>
        <Mascot name="point" size={MASCOT_SIZE} />
      </View>
    );
  } else if (top) {
    body = (
      <View style={[styles.row, { gap: theme.space[3] }]}>
        <Avatar name={top.short_name} status={top.status} backdropColor={theme.color.bgSubtle} />
        <View style={[styles.col, gap]}>
          <View style={[styles.row, { gap: theme.space[2] }]}>
            <T variant="headline" numberOfLines={1} style={styles.shrink}>
              {top.short_name}
            </T>
            <Tag label={t('common.ai')} tone="accent" />
          </View>
          {top.reasons.length > 0 ? (
            <T variant="callout" tone="secondary">
              {top.reasons.join(' · ')}
            </T>
          ) : null}
        </View>
        <Mascot name="point" size={MASCOT_SIZE} />
      </View>
    );
  } else {
    body = (
      <View style={[styles.row, { gap: theme.space[3] }]}>
        <T variant="callout" tone="secondary" style={styles.col}>
          {error ? t('create.assignee.error') : t('create.assignee.none')}
        </T>
        {error ? <Button label={t('common.retry')} variant="secondary" size="S" onPress={onRetry} /> : null}
      </View>
    );
  }

  const hasChoice = Boolean(manual || (equipmentChosen && !loading && top));
  return (
    <View style={{ gap: theme.space[3] }}>
      <Card>{body}</Card>
      <Button
        label={hasChoice ? t('create.assignee.other') : t('create.assignee.pick')}
        variant="secondary"
        full
        onPress={onOther}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  col: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
});
