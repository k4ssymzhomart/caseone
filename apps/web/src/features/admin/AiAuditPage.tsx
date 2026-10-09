// /admin/ai (admin): «Что видит ИИ» (CLAUDE.md §16). The latest llm_audit rows with the redacted request and
// response, exactly as the privacy gateway sent and stored them, the spend and error counters, and the pseudonym
// table the gateway uses. Mascot shield. Data: useLlmAudit(), useLlmAuditStats() (features/admin/useLlmAudit.ts),
// useDirectories() for the pseudonyms. Empty state when the journal has no rows (always in mock mode).
import { anthropicLogo } from '@rota/design';
import { formatAgo, formatDateTime, formatInt, formatNumber, type Employee, type Json } from '@rota/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { Button, Mascot } from '@/components/rota';
import {
  Card,
  EmptyState,
  Grid,
  isClaudeModel,
  Kpi,
  ModelLabel,
  Page,
  Pill,
  QueryState,
  Section,
  Segmented,
  Tag,
  WithMark,
} from '@/components/ui';
import { apiMode } from '@/lib/api';
import { t, tData } from '@/lib/i18n';
import { useDirectories } from '@/lib/queries';
import { useNow } from '@/lib/useNow';
import styles from './admin.module.css';
import { useLlmAudit, useLlmAuditStats, type LlmAuditRow, type LlmAuditStat } from './useLlmAudit';

/** Purposes of _shared/llm.ts in the order the filter lists them. */
const PURPOSES = ['verify', 'insights', 'shift_summary', 'explain_rating', 'parse_query', 'smoke'] as const;
const ALL = 'all';

const purposeLabel = (purpose: string) => tData(`admin.ai.purpose.${purpose}`);

// ---------------------------------------------------------------------------
// payload shapes (_shared/llm.ts: request_redacted, response_redacted)
// ---------------------------------------------------------------------------

type JsonObject = { [key: string]: Json | undefined };

const isObject = (v: Json | undefined | null): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: Json | undefined): string | null => (typeof v === 'string' ? v : null);
const num = (v: Json | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

interface Part {
  kind: 'text' | 'image' | 'other';
  text: string;
}

interface Message {
  role: string;
  parts: Part[];
}

interface Request {
  provider: string | null;
  system: string | null;
  messages: Message[];
  /** Anything that does not have the expected shape, shown as JSON. */
  raw: string | null;
}

interface Response {
  state: 'ok' | 'error' | 'pending';
  error: string | null;
  message: string | null;
  value: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

function imageLabel(part: JsonObject): string {
  const media = str(part.media_type) ?? 'image';
  const type = media.replace(/^image\//, '').toUpperCase();
  const bytes = num(part.bytes);
  const size = bytes == null ? '' : t('admin.ai.kb', { value: formatInt(bytes / 1024) });
  return t('admin.ai.image', { type, size }).replace(/ · $/, '');
}

function parseRequest(json: Json | null): Request {
  if (!isObject(json)) return { provider: null, system: null, messages: [], raw: json == null ? null : pretty(json) };
  const messages: Message[] = [];
  const list = Array.isArray(json.messages) ? json.messages : [];
  for (const m of list) {
    if (!isObject(m)) continue;
    const role = str(m.role) ?? 'user';
    const content = m.content;
    if (typeof content === 'string') {
      messages.push({ role, parts: [{ kind: 'text', text: content }] });
    } else if (Array.isArray(content)) {
      messages.push({
        role,
        parts: content.map((p): Part => {
          if (!isObject(p)) return { kind: 'other', text: pretty(p) };
          if (p.type === 'text') return { kind: 'text', text: str(p.text) ?? '' };
          if (p.type === 'image') return { kind: 'image', text: imageLabel(p) };
          return { kind: 'other', text: pretty(p) };
        }),
      });
    }
  }
  const known = list.length > 0 || typeof json.system === 'string';
  return {
    provider: str(json.provider),
    system: str(json.system),
    messages,
    raw: known ? null : pretty(json),
  };
}

function parseResponse(json: Json | null): Response {
  const empty: Response = {
    state: 'pending',
    error: null,
    message: null,
    value: null,
    input_tokens: null,
    output_tokens: null,
  };
  if (json == null) return empty;
  if (!isObject(json)) return { ...empty, state: 'ok', value: pretty(json) };
  const usage = isObject(json.usage) ? json.usage : null;
  const tokens = { input_tokens: num(usage?.input_tokens), output_tokens: num(usage?.output_tokens) };
  const error = str(json.error);
  if (error) return { ...empty, ...tokens, state: 'error', error, message: str(json.message) };
  const value = 'value' in json ? json.value : json;
  return { ...empty, ...tokens, state: 'ok', value: typeof value === 'string' ? value : pretty(value) };
}

function resultOf(row: Pick<LlmAuditStat, 'error' | 'answered'>): Response['state'] {
  if (row.error) return 'error';
  return row.answered ? 'ok' : 'pending';
}

function ResultPill({ state }: { state: Response['state'] }) {
  if (state === 'error') return <Pill tone="critical">{t('admin.ai.result.error')}</Pill>;
  if (state === 'pending') return <Pill tone="warning">{t('admin.ai.result.pending')}</Pill>;
  return <Pill tone="success">{t('admin.ai.result.ok')}</Pill>;
}

const seconds = (ms: number) => t('admin.ai.seconds', { value: formatNumber(ms / 1000, 1) });
const usd = (value: number) => formatNumber(value, value > 0 && value < 1 ? 4 : 2);

// ---------------------------------------------------------------------------
// pseudonym highlighting
// ---------------------------------------------------------------------------

const PHONE_PLACEHOLDER = '[телефон]';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pseudonyms of the directory (E01…E15, M01, M02, R01, A01) or the generic shape, plus the phone placeholder. */
function pseudonymPattern(pseudonyms: readonly string[]): RegExp {
  const names = pseudonyms.length > 0 ? pseudonyms.map(escape).join('|') : '[EMRA]\\d{2}';
  return new RegExp(`((?<![\\p{L}\\p{N}])(?:${names})(?![\\p{L}\\p{N}])|${escape(PHONE_PLACEHOLDER)})`, 'gu');
}

function Highlighted({ text, pattern }: { text: string; pattern: RegExp }) {
  const pieces = text.split(pattern);
  return (
    <>
      {pieces.map((piece, i) =>
        i % 2 === 1 ? (
          <mark key={i} className={styles.pseudonym} title={t('admin.ai.pseudonym')}>
            {piece}
          </mark>
        ) : (
          piece
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

export function AiAuditPage() {
  const list = useLlmAudit();
  const stats = useLlmAuditStats();
  const directories = useDirectories();
  const employees = directories.data?.employees ?? [];
  const pattern = useMemo(() => pseudonymPattern(employees.map((e) => e.pseudonym).filter(Boolean)), [employees]);
  const refreshing = list.isFetching || stats.isFetching;

  return (
    <Page
      title={t('page.admin_ai')}
      eyebrow={t('admin.ai.eyebrow')}
      actions={
        apiMode === 'supabase' ? (
          <Button
            variant="secondary"
            disabled={refreshing}
            onClick={() => {
              void list.refetch();
              void stats.refetch();
            }}
          >
            {t('admin.ai.refresh')}
          </Button>
        ) : null
      }
    >
      <QueryState
        query={list}
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            mascot="shield"
            mascotSize={140}
            title={t('admin.ai.empty_title')}
            text={apiMode === 'mock' ? t('admin.ai.empty_mock') : t('admin.ai.empty_text')}
          />
        }
      >
        {(rows) => (
          <>
            <Card pad="l">
              <div className={styles.intro}>
                <Mascot name="shield" size={112} />
                <div className={styles.introText}>
                  <h2 className={styles.introTitle}>{t('admin.ai.intro_title')}</h2>
                  <p className={styles.introBody}>{t('admin.ai.intro_text')}</p>
                  <ProviderLine rows={rows} />
                </div>
              </div>
            </Card>
            {stats.data ? <Counters stats={stats.data} /> : null}
            <Journal rows={rows} pattern={pattern} />
          </>
        )}
      </QueryState>
      <Pseudonyms employees={employees} />
    </Page>
  );
}

/** Where the journal's requests went: the Anthropic mark and the Claude models seen in the rows. */
function ProviderLine({ rows }: { rows: readonly LlmAuditRow[] }) {
  const models = [...new Set(rows.map((r) => r.model).filter(isClaudeModel))].sort();
  if (models.length === 0) return null;
  return (
    <p className={styles.provider}>
      <WithMark logo={anthropicLogo} size={16}>
        {t(models.length === 1 ? 'admin.ai.provider_one' : 'admin.ai.provider_many', { models: models.join(', ') })}
      </WithMark>
    </p>
  );
}

function Counters({ stats }: { stats: readonly LlmAuditStat[] }) {
  const cost = stats.reduce((sum, s) => sum + (s.cost_usd ?? 0), 0);
  const timed = stats.filter((s) => s.latency_ms != null && !s.error);
  const latency = timed.length ? timed.reduce((sum, s) => sum + (s.latency_ms ?? 0), 0) / timed.length : null;
  const errors = stats.filter((s) => s.error).length;
  return (
    <Grid min={180}>
      <Kpi label={t('admin.ai.kpi.calls')} value={formatInt(stats.length)} />
      <Kpi label={t('admin.ai.kpi.cost')} value={usd(cost)} hint={t('admin.ai.kpi.cost_hint')} />
      <Kpi label={t('admin.ai.kpi.latency')} value={latency == null ? t('admin.ai.no_data') : seconds(latency)} />
      <Kpi
        label={t('admin.ai.kpi.errors')}
        value={formatInt(errors)}
        tone={errors > 0 ? 'critical' : 'default'}
        hint={errors > 0 ? t('admin.ai.kpi.errors_hint') : undefined}
      />
    </Grid>
  );
}

function Journal({ rows, pattern }: { rows: readonly LlmAuditRow[]; pattern: RegExp }) {
  const now = useNow();
  const [purpose, setPurpose] = useState<string>(ALL);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const present = new Set(rows.map((r) => r.purpose));
  const extra = [...present].filter((p) => !(PURPOSES as readonly string[]).includes(p)).sort();
  const options = [
    { value: ALL, label: t('admin.ai.all') },
    ...[...PURPOSES.filter((p) => present.has(p)), ...extra].map((p) => ({ value: p, label: purposeLabel(p) })),
  ];
  const active = present.has(purpose) ? purpose : ALL;
  const shown = active === ALL ? rows : rows.filter((r) => r.purpose === active);
  const selected = shown.find((r) => r.id === selectedId) ?? shown[0] ?? null;

  return (
    <Section
      title={t('admin.ai.list')}
      aside={
        options.length > 2 ? (
          <Segmented label={t('admin.ai.filter')} value={active} onChange={setPurpose} options={options} />
        ) : null
      }
    >
      <div className={styles.split}>
        <Card pad="none">
          <ul className={styles.list} aria-label={t('admin.ai.list')}>
            {shown.map((row) => {
              const response = parseResponse(row.response_redacted);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    className={styles.listRow}
                    aria-current={row.id === selected?.id ? 'true' : undefined}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <span className={styles.listTime}>{formatAgo(row.created_at, now)}</span>
                    <span className={styles.listMain}>
                      <span className={styles.listTitle}>{purposeLabel(row.purpose)}</span>
                      <span className={styles.meta}>
                        <ModelLabel model={row.model} size={12}>
                          {[row.model, row.latency_ms != null ? seconds(row.latency_ms) : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </ModelLabel>
                      </span>
                    </span>
                    <ResultPill state={resultOf({ error: response.error, answered: response.state !== 'pending' })} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card pad="l" className={styles.detail}>
          {selected ? (
            <Detail key={selected.id} row={selected} pattern={pattern} />
          ) : (
            <p className={styles.muted}>{t('admin.ai.select')}</p>
          )}
        </Card>
      </div>
    </Section>
  );
}

function Detail({ row, pattern }: { row: LlmAuditRow; pattern: RegExp }) {
  const [showSystem, setShowSystem] = useState(false);
  const request = parseRequest(row.request_redacted);
  const response = parseResponse(row.response_redacted);
  const meta = [
    row.model,
    request.provider === 'anthropic' ? 'Anthropic' : request.provider,
    row.latency_ms != null ? seconds(row.latency_ms) : null,
    row.cost_usd != null ? `${usd(Number(row.cost_usd))} USD` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <div className={styles.detailHead}>
        <span className={styles.meta}>
          {formatDateTime(row.created_at)} · №{row.id}
        </span>
        <div className={styles.blockHead}>
          <h3 className={styles.detailTitle}>{purposeLabel(row.purpose)}</h3>
          <ResultPill state={response.state} />
        </div>
        {meta ? (
          <span className={styles.meta}>
            <ModelLabel model={row.model}>{meta}</ModelLabel>
          </span>
        ) : null}
        {response.input_tokens != null || response.output_tokens != null ? (
          <span className={styles.meta}>
            {t('admin.ai.tokens', {
              input: formatInt(response.input_tokens ?? 0),
              output: formatInt(response.output_tokens ?? 0),
            })}
          </span>
        ) : null}
      </div>

      <div className={styles.block}>
        <span className={styles.blockTitle}>{t('admin.ai.request')}</span>
        {request.system ? (
          <div className={styles.block}>
            <div className={styles.blockHead}>
              <span className={styles.role}>{t('admin.ai.system')}</span>
              <button
                type="button"
                className={styles.toggle}
                aria-expanded={showSystem}
                onClick={() => setShowSystem((v) => !v)}
              >
                {showSystem ? t('admin.ai.hide_system') : t('admin.ai.show_system')}
              </button>
            </div>
            {showSystem ? (
              <Payload>
                <Highlighted text={request.system} pattern={pattern} />
              </Payload>
            ) : null}
          </div>
        ) : null}
        {request.messages.map((m, i) => (
          <div key={i} className={styles.block}>
            <span className={styles.role}>
              {m.role === 'assistant' ? t('admin.ai.message.assistant') : t('admin.ai.message.user')}
            </span>
            {m.parts.map((p, j) =>
              p.kind === 'image' ? (
                <span key={j} className={styles.imagePart}>
                  {p.text}
                </span>
              ) : (
                <Payload key={j}>
                  <Highlighted text={p.text} pattern={pattern} />
                </Payload>
              ),
            )}
          </div>
        ))}
        {request.raw ? (
          <Payload>
            <Highlighted text={request.raw} pattern={pattern} />
          </Payload>
        ) : null}
      </div>

      <div className={styles.block}>
        <span className={styles.blockTitle}>{t('admin.ai.response')}</span>
        {response.state === 'pending' ? <p className={styles.muted}>{t('admin.ai.no_response')}</p> : null}
        {response.state === 'error' ? (
          <>
            <div>
              <Tag tone="critical">{t('admin.ai.error_code', { code: response.error })}</Tag>
            </div>
            {response.message ? <Payload>{response.message}</Payload> : null}
          </>
        ) : null}
        {response.state === 'ok' && response.value != null ? (
          <Payload>
            <Highlighted text={response.value} pattern={pattern} />
          </Payload>
        ) : null}
      </div>
    </>
  );
}

function Payload({ children }: { children: ReactNode }) {
  return <pre className={styles.payload}>{children}</pre>;
}

function Pseudonyms({ employees }: { employees: readonly Employee[] }) {
  if (employees.length === 0) return null;
  const rank = (p: string) => {
    const i = 'EMRA'.indexOf(p.charAt(0));
    return i < 0 ? 4 : i;
  };
  const rows = [...employees]
    .filter((e) => e.pseudonym)
    .sort((a, b) => rank(a.pseudonym) - rank(b.pseudonym) || a.pseudonym.localeCompare(b.pseudonym));
  return (
    <Section title={t('admin.ai.directory')}>
      <p className={styles.footnote}>{t('admin.ai.directory_note')}</p>
      <div className={styles.directory}>
        {rows.map((e) => (
          <div key={e.id} className={styles.directoryItem}>
            <Tag>{e.pseudonym}</Tag>
            <span className={styles.directoryText}>
              <span className={styles.directoryName}>{e.short_name}</span>
              <span className={styles.directoryRole}>{e.specialty ?? tData(`role.${e.role}`)}</span>
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}
