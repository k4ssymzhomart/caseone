// The master report of one order as a PDF (CLAUDE.md §12), pure: the card, the AI verdict with every check, works
// and fault code, materials against the norm, before and after photos side by side, the timeline and the downtime.
// Photos arrive as data URLs (JPEG or PNG) fetched by the page; a missing one prints «Фото до нет».
import {
  formatDateTime,
  formatDuration,
  formatNorm,
  formatPercent,
  formatQty,
  formatScore,
  ORDER_TYPE_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  VERDICT_LABEL,
  type AiReview,
  type CheckStatus,
  type Directories,
  type OrderDetail,
  type OrderPhoto,
} from '@rota/shared';
import type { Content, TableCell } from 'pdfmake/interfaces';
import { tData } from '@/lib/i18n';
import { orderEyebrow } from '@/lib/present';
import { dataTable, paragraph, pdfDocument, PDF_COLOR, section } from '../reports/export/pdfKit';
import { eventActor, eventLines } from './eventText';
import {
  checkMessage,
  materialRows,
  normFor,
  normHours,
  orderDowntimeMinutes,
  reviewChecks,
  shownReview,
  workMinutes,
  type MaterialRow,
} from './review';
import { t } from './strings';

export interface OrderPhotosForPdf {
  /** Data URLs of the first «до» and the last «после» photo. */
  before: string | null;
  after: string | null;
}

const shotAt = (p: OrderPhoto): number => Date.parse(p.captured_at ?? p.uploaded_at);

/** The photos the PDF shows: the first «до» and the last «после», as on the review screens. */
export function pdfPhotos(photos: readonly OrderPhoto[]): { before: OrderPhoto | null; after: OrderPhoto | null } {
  const of = (kind: OrderPhoto['kind']) =>
    photos.filter((p) => p.kind === kind).sort((a, b) => shotAt(a) - shotAt(b));
  const before = of('before');
  const after = of('after');
  return { before: before[0] ?? null, after: after[after.length - 1] ?? null };
}

export interface OrderExportInput {
  detail: OrderDetail;
  dirs: Directories | undefined;
  photos: OrderPhotosForPdf;
  generatedAt: Date;
}

const CHECK_COLOR: Readonly<Record<CheckStatus, string>> = {
  pass: PDF_COLOR.success,
  warn: PDF_COLOR.warning,
  fail: PDF_COLOR.critical,
  skipped: PDF_COLOR.muted,
};

/** A two column label and value table. */
function facts(rows: readonly [string, Content | string | null | undefined][]): Content {
  const body = rows
    .filter(([, v]) => v != null && v !== '')
    .map(([label, value]): TableCell[] => [
      { text: label, style: 'muted' },
      typeof value === 'string' ? { text: value } : (value as TableCell),
    ]);
  return {
    table: { widths: [130, '*'], body },
    layout: 'noBorders',
  };
}

function reviewBlock(review: AiReview | null, o: OrderDetail['order']): Content[] {
  if (!review) return [{ text: t('order.review.not_yet'), style: 'muted' }];
  const out: Content[] = [];
  out.push({
    columns: [
      {
        width: 'auto',
        text: [
          { text: String(review.score), fontSize: 22, bold: true },
          { text: ` ${t('order.review.out_of')}`, style: 'muted' },
        ],
      },
      {
        width: '*',
        margin: [12, 4, 0, 0],
        stack: [
          { text: VERDICT_LABEL[review.verdict], bold: true },
          {
            text:
              review.confidence != null
                ? t('order.review.score5_conf', { score5: review.score5, conf: formatPercent(review.confidence) })
                : t('order.review.score5', { score5: review.score5 }),
            style: 'muted',
          },
          ...(review.needs_master_review && o.status === 'ai_review'
            ? [{ text: t('order.review.needs_master'), color: PDF_COLOR.warning } as Content]
            : []),
        ],
      },
    ],
    margin: [0, 0, 0, 6],
  });
  if (review.report_master?.summary) {
    out.push({ text: t('order.review.summary'), bold: true, margin: [0, 2, 0, 2] });
    out.push(paragraph(review.report_master.summary));
  }
  out.push(
    dataTable(
      [t('order.review.checks'), t('order.mat.check'), t('order.pdf.points')],
      reviewChecks(review).map((c): TableCell[] => {
        const message = checkMessage(c.message_ru);
        return [
          message ? { stack: [c.title, { text: message, style: 'muted' }] } : c.title,
          { text: tData(`check.${c.status}`), color: CHECK_COLOR[c.status] },
          {
            text: c.status === 'skipped' ? t('check.skipped') : t('order.review.points', { points: c.points, max: c.max }),
            alignment: 'right',
          },
        ];
      }),
      { widths: ['*', 'auto', 'auto'], align: ['left', 'left', 'right'], empty: t('order.review.not_yet') },
    ),
  );
  const rulesOnly = review.model === 'rules' || review.model == null;
  out.push({
    text: [
      rulesOnly ? t('order.review.meta_rules') : t('order.review.meta_model', { model: review.model ?? '' }),
      ' · ',
      t('order.review.meta_attempt', { n: review.attempt }),
    ].join(''),
    style: 'muted',
    margin: [0, 4, 0, 0],
  });
  if (review.master_verdict) {
    out.push({
      text: [
        { text: `${t('order.review.master')}: `, bold: true },
        review.master_score != null
          ? t('order.review.master_line', {
              verdict: VERDICT_LABEL[review.master_verdict],
              score: formatScore(review.master_score),
            })
          : VERDICT_LABEL[review.master_verdict],
        review.master_comment ? `. «${review.master_comment}»` : '',
      ],
      margin: [0, 4, 0, 0],
    });
  }
  return out;
}

function materialText(r: MaterialRow, code: string | null): string {
  switch (r.verdict) {
    case 'ok':
      return t('order.mat.ok');
    case 'over':
      return t('order.mat.over');
    case 'not_typical':
      return t('order.mat.not_typical', { code: code ?? '' });
    case 'no_norm':
      return t('order.mat.no_norm');
  }
}

function photoCell(url: string | null, label: string, missing: string): Content {
  return {
    stack: [
      { text: label, bold: true, margin: [0, 0, 0, 4] },
      url ? { image: url, fit: [240, 200] } : { text: missing, style: 'muted' },
    ],
  };
}

export function orderReportPdf(input: OrderExportInput) {
  const { detail, dirs } = input;
  const o = detail.order;
  const review = shownReview(detail);
  const norms = dirs?.work_norms ?? [];
  const norm = normHours(o, norms);
  const code = o.fault_code ? dirs?.fault_codes.find((f) => f.code === o.fault_code) : undefined;
  const minutes = workMinutes(o);
  const downtime = orderDowntimeMinutes(o, input.generatedAt);
  const names = new Map((dirs?.employees ?? []).map((e) => [e.id, e.short_name]));
  const brigades = new Map((dirs?.brigades ?? []).map((b) => [b.id, b.name]));
  const lateMin = o.done_at ? (Date.parse(o.done_at) - Date.parse(o.due_at)) / 60_000 : null;

  const content: Content[] = [
    section(
      t('order.section.card'),
      facts([
        [t('order.f.equipment'), o.equipment_name],
        [t('order.f.area'), o.area_name],
        [t('order.f.type'), ORDER_TYPE_LABEL[o.type]],
        [t('order.f.priority'), PRIORITY_LABEL[o.priority]],
        [t('order.pdf.status'), STATUS_LABEL[o.status]],
        [t('order.f.due'), formatDateTime(o.due_at)],
        [t('order.f.norm'), norm != null ? formatNorm(norm) : null],
        [
          t('order.f.assignee'),
          o.brigade_name ? t('order.brigade_of', { name: o.assignee_short_name, brigade: o.brigade_name }) : o.assignee_short_name,
        ],
        [t('order.f.master'), o.master_short_name],
        [t('order.f.issued'), formatDateTime(o.issued_at)],
        [t('order.f.stopped'), o.equipment_stopped ? t('order.stopped_yes') : t('order.stopped_no')],
        [t('order.pdf.downtime'), downtime != null ? formatDuration(downtime) : null],
        [
          t('order.pdf.deadline'),
          lateMin == null
            ? null
            : lateMin > 0
              ? { text: t('order.status.late', { duration: formatDuration(lateMin) }), color: PDF_COLOR.critical }
              : t('order.status.on_time'),
        ],
        [
          t('order.pdf.final'),
          o.status === 'closed' && o.final_verdict
            ? `${VERDICT_LABEL[o.final_verdict]}${o.final_score != null ? `, ${formatScore(o.final_score)}` : ''}`
            : null,
        ],
        [t('order.f.description'), o.description],
        [t('order.f.comment'), o.comment],
      ]),
    ),
    section(t('order.section.review'), reviewBlock(review, o)),
    section(
      t('order.section.works'),
      !o.done_at && !o.works_done
        ? { text: t('order.works.pending'), style: 'muted' }
        : facts([
            [t('order.works.done'), o.works_done ?? t('order.works.empty')],
            [t('order.works.code'), o.fault_code ? `${o.fault_code}${code ? ` ${code.name}` : ''}` : t('order.works.no_code')],
            [
              t('order.works.time'),
              minutes != null
                ? norm != null
                  ? t('order.works.time_norm', {
                      actual: formatDuration(Math.max(1, minutes)),
                      norm: formatDuration(norm * 60),
                    })
                  : formatDuration(Math.max(1, minutes))
                : null,
            ],
            [t('order.works.comment'), o.closing_comment ? `«${o.closing_comment}»` : null],
          ]),
    ),
    section(
      t('order.section.materials'),
      dataTable(
        [t('order.mat.material'), t('order.mat.qty'), t('order.mat.norm'), t('order.mat.check')],
        materialRows(detail.materials, normFor(o.fault_code, norms)).map((r): TableCell[] => [
          r.line.material_name,
          {
            text: formatQty(r.line.qty, r.line.unit),
            alignment: 'right',
            color: r.verdict === 'over' ? PDF_COLOR.critical : PDF_COLOR.ink,
          },
          { text: r.max != null ? formatQty(r.max, r.line.unit) : '·', alignment: 'right' },
          {
            text: materialText(r, o.fault_code),
            color: r.verdict === 'over' ? PDF_COLOR.critical : r.verdict === 'ok' ? PDF_COLOR.success : PDF_COLOR.muted,
          },
        ]),
        {
          widths: ['*', 'auto', 'auto', 'auto'],
          align: ['left', 'right', 'right', 'left'],
          empty: o.done_at ? t('order.mat.none') : t('order.mat.pending'),
        },
      ),
    ),
    section(t('order.section.photos'), {
      columns: [
        photoCell(input.photos.before, t('order.photo.before'), t('order.photo.none_before')),
        photoCell(input.photos.after, t('order.photo.after'), t('order.photo.none_after')),
      ],
      columnGap: 16,
    }),
    section(
      t('order.section.timeline'),
      dataTable(
        [t('order.pdf.time'), t('order.pdf.event'), t('order.pdf.actor')],
        detail.events.map((e): TableCell[] => {
          const lines = eventLines(e, names, brigades);
          return [
            { text: formatDateTime(e.created_at), style: 'muted' },
            {
              stack: [
                { text: tData(`event.${e.action}`), bold: true },
                ...lines.map((l): Content => ({ text: l, style: 'muted' })),
              ],
            },
            { text: eventActor(e, names), alignment: 'right' },
          ];
        }),
        { widths: ['auto', '*', 'auto'], align: ['left', 'left', 'right'], empty: t('order.ev.empty') },
      ),
    ),
  ];

  return pdfDocument({
    title: t('order.title', { number: o.number }),
    eyebrow: orderEyebrow(o),
    lines: [`${o.equipment_name} · ${o.area_name}`],
    generatedAt: input.generatedAt,
    content,
  });
}
