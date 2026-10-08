// Starts live sync for the signed in user (lib/live.ts) and turns new own notifications into HUD toasts with
// «Открыть» (the database's mobile URLs mapped to panel routes). Rendered once inside the router.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useApi, useSession } from '@/lib/api';
import { t } from '@/lib/i18n';
import { startLive } from '@/lib/live';
import { webUrlFromNotification } from '@/lib/routes';
import { useHud } from './HudHost';

export function LiveBridge() {
  const api = useApi();
  const qc = useQueryClient();
  const hud = useHud();
  const navigate = useNavigate();
  const session = useSession();
  const uid = session && session.role !== 'worker' ? session.user_id : null;

  // keep the latest callbacks without restarting the channel
  const latest = useRef({ hud, navigate });
  latest.current = { hud, navigate };
  const lastStatus = useRef<string>('connecting');

  useEffect(() => {
    if (!uid) return;
    return startLive({
      api,
      queryClient: qc,
      uid,
      onNotification: (row) => {
        const to = webUrlFromNotification(row.url);
        latest.current.hud.show({
          message: row.title,
          tone: row.severity === 'critical' ? 'critical' : 'default',
          duration: 4000,
          ...(to ? { actionLabel: t('hud.open'), onAction: () => latest.current.navigate(to) } : {}),
        });
      },
      onStatus: (s) => {
        if (s === 'offline' && lastStatus.current !== 'offline') {
          latest.current.hud.show({ message: t('hud.offline'), tone: 'critical', duration: 3000 });
        } else if (s === 'live' && lastStatus.current === 'offline') {
          latest.current.hud.show({ message: t('hud.online') });
        }
        lastStatus.current = s;
      },
    });
  }, [api, qc, uid]);

  return null;
}
