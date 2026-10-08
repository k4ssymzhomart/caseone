// InsightsDb over supabase-js with the project secret key (service role): the Edge Function (index.ts) and the live
// check (tools/ai-insights-check.ts) share it. The npm: import is type only, so Node and vitest never load it.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import type { DirectoryEmployee } from '../_shared/privacy.ts';
import type { AnalyticsBundle } from './cards.ts';
import type { DigestNotification } from './digest.ts';
import type { InsightsDb, NewInsight, StoredInsight } from './handler.ts';
import type { Area } from './scope.ts';

export class DbError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'DbError';
    this.code = code;
  }
}

function fail(e: { message?: string; code?: string } | null): never {
  throw new DbError(e?.message || 'database error', e?.code ?? null);
}

const COLUMNS = 'id, created_at, scope, kind, severity, title, body, recommendation, evidence';

export function createInsightsDb(admin: SupabaseClient): InsightsDb {
  return {
    async getUser(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      const role = (data.user.app_metadata as Record<string, unknown> | undefined)?.app_role;
      return { id: data.user.id, role: typeof role === 'string' ? role : null };
    },
    async areas() {
      const { data, error } = await admin
        .from('areas')
        .select('id, name')
        .order('sort')
        .order('id');
      if (error) fail(error);
      return (data ?? []) as Area[];
    },
    async bundle(from, to, filters) {
      const { data, error } = await admin.rpc('analytics_bundle', {
        p_from: from,
        p_to: to,
        p_filters: filters,
      });
      if (error) fail(error);
      return (data ?? {}) as AnalyticsBundle;
    },
    async ruleCards(from, to, filters) {
      const { data, error } = await admin.rpc('insight_cards', {
        p_from: from,
        p_to: to,
        p_filters: filters,
      });
      if (error) fail(error);
      return Array.isArray(data) ? (data as unknown[]) : [];
    },
    async employees() {
      const { data, error } = await admin
        .from('employees')
        .select('full_name, short_name, tab_no, pseudonym');
      if (error) fail(error);
      return (data ?? []) as DirectoryEmployee[];
    },
    async cached(key, since) {
      const { data, error } = await admin
        .from('ai_insights')
        .select(COLUMNS)
        .eq('scope->>key', key)
        .gte('created_at', since)
        .order('id', { ascending: true })
        .limit(64);
      if (error) fail(error);
      return (data ?? []) as StoredInsight[];
    },
    async store(rows: NewInsight[]) {
      const { data, error } = await admin.from('ai_insights').insert(rows).select(COLUMNS);
      if (error) fail(error);
      return ((data ?? []) as StoredInsight[]).sort((a, b) => a.id - b.id);
    },
    async digestRecipients() {
      const { data, error } = await admin
        .from('employees')
        .select('id')
        .in('role', ['master', 'manager']);
      if (error) fail(error);
      return ((data ?? []) as { id: string }[]).map((r) => r.id);
    },
    async notify(rows: DigestNotification[]) {
      const { data, error } = await admin
        .from('notifications')
        .upsert(rows, { onConflict: 'recipient_id,dedupe_key', ignoreDuplicates: true })
        .select('id');
      if (error) fail(error);
      return (data ?? []).length;
    },
  };
}
