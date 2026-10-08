// The worker's own rating for the last 30 days (CLAUDE.md §13, PHASE_2 §2.3): score, five component bars and
// the AI explanation «Из чего сложился рейтинг».
import type { RatingRow } from '@rota/shared';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useApi } from '@/lib/api';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { useTheme } from '@/lib/theme';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Eyebrow } from '@/ui/Eyebrow';
import { T } from '@/ui/T';

import { periodFrom } from './period';

const COMPONENTS = [
  { key: 'q', label: 'profile.rating.q' },
  { key: 't', label: 'profile.rating.t' },
  { key: 'f', label: 'profile.rating.f' },
  { key: 'v', label: 'profile.rating.v' },
  { key: 'd', label: 'profile.rating.d' },
] as const satisfies readonly { key: keyof RatingRow; label: string }[];

/** The query every rating screen of one person shares: all rows of rating(), filtered to that assignee. */
export function useOwnRating(employeeId: string, from: string) {
  const api = useApi();
  return useQuery({
    queryKey: qk.rating(from, employeeId),
    queryFn: () => api.reports.rating(periodFrom(from), { assignee_id: employeeId }),
    select: (rows: RatingRow[]) => rows.find((r) => r.kind === 'worker' && r.id === employeeId) ?? null,
  });
}

export function ratingExplainKey(employeeId: string, from: string) {
  return [...qk.rating(from, employeeId), 'explain'] as const;
}

export function RatingSection({ employeeId, from }: { employeeId: string; from: string }) {
  const theme = useTheme();
  const api = useApi();
  const rating = useOwnRating(employeeId, from);
  const row = rating.data ?? null;
  const scored = !!row && row.score !== null;

  // One LLM call per window: cached for the session, never retried on its own (the budget is small).
  const explain = useQuery({
    queryKey: ratingExplainKey(employeeId, from),
    queryFn: () => api.ai.explainRating(employeeId, periodFrom(from)),
    enabled: scored,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  let body: ReactNode;
  if (rating.isPending) {
    body = (
      <T variant="bodyL" tone="secondary">
        {t('common.loading')}
      </T>
    );
  } else if (rating.isError) {
    body = (
      <Banner
        tone="critical"
        text={t('profile.rating.error')}
        actionLabel={t('common.retry')}
        onAction={() => void rating.refetch()}
      />
    );
  } else if (!row || row.score === null) {
    body = (
      <View style={{ gap: theme.space[1] }}>
        <T variant="headline">{t('profile.rating.none')}</T>
        <T variant="callout" tone="secondary">
          {t('profile.rating.noneBody')}
        </T>
      </View>
    );
  } else {
    body = (
      <View style={{ gap: theme.space[5] }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space[2] }}>
          <T variant="monoDisplay">{String(Math.round(row.score))}</T>
          <T variant="callout" tone="secondary" style={{ paddingBottom: theme.space[2] }}>
            {t('profile.rating.of')}
          </T>
          <View style={{ flex: 1 }} />
          <T variant="callout" tone="secondary" style={{ paddingBottom: theme.space[2] }}>
            {t('profile.rating.closed', { n: row.closed })}
          </T>
        </View>
        <View style={{ gap: theme.space[4] }}>
          {COMPONENTS.map((c) => (
            <ComponentBar key={c.key} label={t(c.label)} value={row[c.key]} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.space[4] }}>
      <Card>
        <View style={{ gap: theme.space[4] }}>
          <Eyebrow>{t('profile.rating.eyebrow')}</Eyebrow>
          {body}
        </View>
      </Card>
      {scored ? (
        <Card>
          <View style={{ gap: theme.space[3] }}>
            <T variant="headline" accessibilityRole="header">
              {t('profile.explain.title')}
            </T>
            {explain.isPending ? (
              <T variant="bodyL" tone="secondary">
                {t('profile.explain.loading')}
              </T>
            ) : explain.isError ? (
              <View style={{ gap: theme.space[3], alignItems: 'flex-start' }}>
                <T variant="bodyL" tone="secondary">
                  {t('profile.explain.error')}
                </T>
                <Button
                  label={t('common.retry')}
                  variant="secondary"
                  size="M"
                  onPress={() => void explain.refetch()}
                />
              </View>
            ) : (
              <T variant="bodyL">{explain.data}</T>
            )}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

/** One component as a horizontal bar 0..100% with its value in mono (status is never color alone). */
function ComponentBar({ label, value }: { label: string; value: number | null }) {
  const theme = useTheme();
  const share = value === null ? 0 : Math.max(0, Math.min(1, value));
  const pct = Math.round(share * 100);
  const text = value === null ? t('profile.rating.noValue') : `${pct}%`;
  return (
    <View accessible accessibilityLabel={`${label}: ${text}`} style={{ gap: theme.space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space[3] }}>
        <T variant="bodyL" style={{ flex: 1 }} numberOfLines={1}>
          {label}
        </T>
        <T variant="monoM" tone="secondary">
          {text}
        </T>
      </View>
      <View
        style={{
          height: theme.space[2],
          borderRadius: theme.radius.full,
          backgroundColor: theme.color.borderDefault,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: theme.radius.full,
            backgroundColor: theme.color.textPrimary,
          }}
        />
      </View>
    </View>
  );
}
