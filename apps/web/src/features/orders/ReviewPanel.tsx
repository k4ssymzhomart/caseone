// The AI verdict block of the master report (CLAUDE.md §11, §12): score «85 из 100», «4 из 5 · уверенность 86%»,
// the verdict, «Нужна проверка мастером» when the AI is unsure, the summary, every check with ✓ ! ✕ and its points,
// the model and latency, the master's decision, earlier attempts. While the AI works: mascot `search`.
import {
  formatPercent,
  formatScore,
  VERDICT_LABEL,
  verdictTone,
  type AiReview,
  type OrderDetail,
} from '@rota/shared';
import { Card, EmptyState, ModelLabel, Pill } from '@/components/ui';
import {
  CHECK_GLYPH,
  CHECK_TONE,
  checkMessage,
  isWaiting,
  reviewChecks,
  seconds,
  shownReview,
} from './review';
import { t } from './strings';
import styles from './order.module.css';

export function ReviewPanel({ detail }: { detail: OrderDetail }) {
  const o = detail.order;
  if (isWaiting(detail)) {
    return (
      <Card>
        <EmptyState
          mascot="search"
          mascotSize={112}
          title={t('order.review.waiting_title')}
          text={t('order.review.waiting_text')}
        />
      </Card>
    );
  }
  const review = shownReview(detail);
  if (!review) {
    return (
      <Card>
        <p className={styles.muted}>{t('order.review.not_yet')}</p>
      </Card>
    );
  }
  const previous = detail.reviews.filter((r) => r.id !== review.id).sort((a, b) => b.attempt - a.attempt);
  const rulesOnly = review.model === 'rules' || review.model == null;

  return (
    <Card pad="none">
      <div className={styles.reviewHead}>
        <div className={styles.score}>
          <span className={styles.scoreValue}>{review.score}</span>
          <span className={styles.scoreOf}>{t('order.review.out_of')}</span>
        </div>
        <div className={styles.reviewVerdict}>
          <div className={styles.pills}>
            <Pill tone={verdictTone(review.verdict)}>{VERDICT_LABEL[review.verdict]}</Pill>
            {review.needs_master_review && o.status === 'ai_review' ? (
              <Pill tone="info">{t('order.review.needs_master')}</Pill>
            ) : null}
          </div>
          <span className={styles.muted}>
            {review.confidence != null
              ? t('order.review.score5_conf', { score5: review.score5, conf: formatPercent(review.confidence) })
              : t('order.review.score5', { score5: review.score5 })}
          </span>
        </div>
      </div>

      {review.report_master?.summary ? (
        <div className={styles.reviewBlock}>
          <span className={styles.label}>{t('order.review.summary')}</span>
          <p className={styles.text}>{review.report_master.summary}</p>
        </div>
      ) : null}

      <ul className={styles.checks} aria-label={t('order.review.checks')}>
        {reviewChecks(review).map((c) => {
          const message = checkMessage(c.message_ru);
          return (
            <li key={c.id} className={styles.check}>
              <span className={styles.glyph} data-tone={CHECK_TONE[c.status]} aria-hidden="true">
                {CHECK_GLYPH[c.status]}
              </span>
              <span className={styles.checkText}>
                <span className={styles.checkTitle}>
                  {c.title}
                  <span className="visually-hidden">: {t(`check.${c.status}`)}</span>
                </span>
                {message ? <span className={styles.checkMessage}>{message}</span> : null}
              </span>
              <span className={styles.checkPoints}>
                {c.status === 'skipped' ? t('check.skipped') : t('order.review.points', { points: c.points, max: c.max })}
              </span>
            </li>
          );
        })}
      </ul>

      <div className={styles.reviewMeta}>
        <span>
          {rulesOnly ? (
            t('order.review.meta_rules')
          ) : (
            <ModelLabel model={review.model}>{t('order.review.meta_model', { model: review.model ?? '' })}</ModelLabel>
          )}
        </span>
        {review.latency_ms != null ? <span>{t('order.review.meta_latency', { sec: seconds(review.latency_ms) })}</span> : null}
        <span>{t('order.review.meta_attempt', { n: review.attempt })}</span>
      </div>

      {review.master_verdict ? <MasterDecision review={review} /> : null}

      {previous.length > 0 ? (
        <div className={styles.reviewBlock}>
          <span className={styles.label}>{t('order.review.previous')}</span>
          <ul className={styles.plainList}>
            {previous.map((r) => (
              <li key={r.id}>
                {t('order.review.prev_line', { n: r.attempt, verdict: VERDICT_LABEL[r.verdict], score: formatScore(r.score) })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function MasterDecision({ review }: { review: AiReview }) {
  if (!review.master_verdict) return null;
  return (
    <div className={styles.reviewBlock}>
      <span className={styles.label}>{t('order.review.master')}</span>
      <div className={styles.pills}>
        <Pill tone={verdictTone(review.master_verdict)}>
          {review.master_score != null
            ? t('order.review.master_line', {
                verdict: VERDICT_LABEL[review.master_verdict],
                score: formatScore(review.master_score),
              })
            : VERDICT_LABEL[review.master_verdict]}
        </Pill>
      </div>
      {review.master_comment ? <p className={styles.text}>{review.master_comment}</p> : null}
    </div>
  );
}
