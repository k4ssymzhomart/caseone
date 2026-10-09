// /login: wallpaper backdrop, a glass card with the Lockup, табельный номер and ПИН, demo account chips.
// Workers are signed out at once: «Исполнители работают в мобильном приложении». Under the form a quiet line links the
// phone app: Android to the APK, iPhone to the browser app at /app/.
import { androidLogo, appleLogo } from '@rota/design';
import { isRotaError, PINS } from '@rota/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import wallpaper from '@rota/design/assets/wallpaper.jpg';
import { WORKER_BLOCKED } from '@/components/layout';
import { Button, Lockup, Mascot } from '@/components/rota';
import { BrandMark, Field, FormError, Input, Loading } from '@/components/ui';
import { apiMode, demoAccounts, signIn, signOut, useSession, useSessionReady } from '@/lib/api';
import { t, type Key } from '@/lib/i18n';
import { homeFor, paths } from '@/lib/routes';
import { links } from '@/landing/links';
import styles from './LoginPage.module.css';

const DEMO: readonly { tabNo: string; label: Key }[] = [
  { tabNo: '1001', label: 'login.demo_master' },
  { tabNo: '3001', label: 'login.demo_manager' },
  { tabNo: '9001', label: 'login.demo_admin' },
];

/** `next` only when it is a path of this panel. */
function safeNext(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith(paths.login) ? value : null;
}

export function LoginPage() {
  const ready = useSessionReady();
  const session = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tabNo, setTabNo] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get('blocked') === WORKER_BLOCKED ? t('login.worker_blocked') : null,
  );
  const next = safeNext(params.get('next'));
  const workerSession = session?.role === 'worker';

  // A worker session restored in this browser (or one that just signed in) is ended here.
  useEffect(() => {
    if (!workerSession) return;
    setError(t('login.worker_blocked'));
    void signOut();
  }, [workerSession]);

  async function submit(tab: string, code: string) {
    if (!tab.trim() || !code.trim()) {
      setError(t('login.need_both'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const s = await signIn(tab.trim(), code.trim());
      if (s.role === 'worker') {
        setPin(''); // the effect above signs the worker out
        return;
      }
      navigate(next ?? homeFor(s.role), { replace: true });
    } catch (e) {
      setError(isRotaError(e) ? e.message : t('error.UNKNOWN'));
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  if (ready && session && session.role !== 'worker' && !busy) {
    return <Navigate to={next ?? homeFor(session.role)} replace />;
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(tabNo, pin);
  };

  return (
    <div className={styles.screen} style={{ backgroundImage: `url(${wallpaper})` }}>
      <div className={styles.scrim} aria-hidden="true" />
      <main className={styles.card}>
        <Lockup height={28} color="var(--color-text-primary)" />
        <Mascot name="wave" size={96} className={styles.mascot} />
        <div className={styles.titles}>
          <h1 className={styles.title}>{t('login.title')}</h1>
          <p className={styles.subtitle}>{t('login.subtitle')}</p>
        </div>
        {!ready ? (
          <Loading />
        ) : (
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <Field label={t('auth.tab_no')}>
              {(id) => (
                <Input
                  id={id}
                  size="l"
                  inputMode="numeric"
                  autoComplete="username"
                  placeholder={t('login.tab_placeholder')}
                  value={tabNo}
                  maxLength={6}
                  onChange={(e) => setTabNo(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              )}
            </Field>
            <Field label={t('auth.pin')}>
              {(id) => (
                <Input
                  id={id}
                  size="l"
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  placeholder={t('login.pin_placeholder')}
                  value={pin}
                  maxLength={4}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                />
              )}
            </Field>
            {error ? <FormError>{error}</FormError> : null}
            <Button type="submit" size="l" className={styles.submit} disabled={busy}>
              {busy ? t('login.submitting') : t('login.submit')}
            </Button>
          </form>
        )}
        {demoAccounts ? (
          <div className={styles.demo}>
            <span className={styles.demoLabel}>{t('login.demo')}</span>
            <div className={styles.chips}>
              {DEMO.map((d) => (
                <button
                  key={d.tabNo}
                  type="button"
                  className={styles.chip}
                  disabled={busy || !ready}
                  onClick={() => {
                    const code = PINS[d.tabNo] ?? '';
                    setTabNo(d.tabNo);
                    setPin(code);
                    void submit(d.tabNo, code);
                  }}
                >
                  {t(d.label)}
                </button>
              ))}
            </div>
            {apiMode === 'mock' ? <span className={styles.note}>{t('login.mock_note')}</span> : null}
          </div>
        ) : null}
        <nav className={styles.apps} aria-label={t('login.apps')}>
          <span className={styles.appsLabel}>{t('login.apps')}</span>
          <div className={styles.appLinks}>
            <a className={styles.appLink} href={links.apk} rel="noopener" title={t('login.app_android_hint')}>
              <BrandMark logo={androidLogo} size={16} />
              {t('login.app_android')}
            </a>
            <a className={styles.appLink} href={links.app} title={t('login.app_iphone_hint')}>
              <BrandMark logo={appleLogo} size={16} />
              {t('login.app_iphone')}
            </a>
          </div>
        </nav>
        <p className={styles.slogan}>{t('app.slogan')}</p>
      </main>
    </div>
  );
}
