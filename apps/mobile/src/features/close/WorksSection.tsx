// «Что сделано»: a text area plus quick phrase chips that append a sentence (PHASE_0 §7.1 close).
import { View } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Chip } from '@/ui/Chip';
import { T } from '@/ui/T';
import { TextArea } from '@/ui/TextArea';

import { FormSection } from './FormSection';
import { WORK_PHRASE_KEYS, hasPhrase, togglePhrase } from './phrases';

/** R1 completeness wants at least 15 characters (CLAUDE.md §11). */
const MIN_WORKS_CHARS = 15;

export interface WorksSectionProps {
  value: string;
  onChange: (next: string) => void;
}

export function WorksSection({ value, onChange }: WorksSectionProps) {
  const theme = useTheme();
  const short = value.trim().length > 0 && value.trim().length < MIN_WORKS_CHARS;
  return (
    <FormSection title={t('close.works')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        {WORK_PHRASE_KEYS.map((key) => {
          const phrase = t(key);
          return (
            <Chip
              key={key}
              label={phrase}
              selected={hasPhrase(value, phrase)}
              onPress={() => onChange(togglePhrase(value, phrase))}
            />
          );
        })}
      </View>
      <TextArea
        value={value}
        onChangeText={onChange}
        placeholder={t('close.worksPlaceholder')}
        accessibilityLabel={t('close.works')}
        inputStyle={{ fontSize: theme.type.bodyL.fontSize, lineHeight: theme.type.bodyL.lineHeight }}
      />
      {short ? (
        <T variant="footnote" tone="secondary">
          {t('close.worksShort')}
        </T>
      ) : null}
    </FormSection>
  );
}
