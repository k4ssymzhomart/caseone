// MockApi: the whole RotaApi on one device, no network (PHASE_0 §8).
// Contract stage: auth, directories and demo settings work from the fixtures; everything else rejects with
// RotaError UNKNOWN until the MockApi step lands (store, transitions, events, ai, watchdog in this folder).

import { fixtureDirectories, PINS } from '../../fixtures';
import type { Directories, Session, Settings, Unsubscribe } from '../../domain/types';
import { RotaError } from '../errors';
import type { CreateApiOptions, KeyValueStorage, RotaApi } from '../RotaApi';

const SESSION_KEY = 'rota.mock.session';

function notBuilt(name: string): () => Promise<never> {
  return () =>
    Promise.reject(new RotaError('UNKNOWN', { message: `MockApi.${name} not built yet` }));
}

export class MockApi implements RotaApi {
  private readonly storage: KeyValueStorage;
  private readonly dirs: Directories;
  private readonly listeners = new Set<(s: Session | null) => void>();
  private current: Session | null | undefined;

  constructor(options: CreateApiOptions) {
    this.storage = options.storage;
    this.dirs = fixtureDirectories();
  }

  private emit(s: Session | null): void {
    this.current = s;
    for (const cb of this.listeners) cb(s);
  }

  auth: RotaApi['auth'] = {
    signIn: async (tabNo, pin) => {
      const e = this.dirs.employees.find((x) => x.tab_no === tabNo.trim());
      if (!e || PINS[e.tab_no] !== pin) throw new RotaError('WRONG_PIN');
      const s: Session = {
        user_id: e.id,
        role: e.role,
        short_name: e.short_name,
        full_name: e.full_name,
        tab_no: e.tab_no,
        pseudonym: e.pseudonym,
      };
      await this.storage.setItem(SESSION_KEY, JSON.stringify(s));
      this.emit(s);
      return s;
    },
    signOut: async () => {
      await this.storage.removeItem(SESSION_KEY);
      this.emit(null);
    },
    session: async () => {
      if (this.current !== undefined) return this.current;
      const raw = await this.storage.getItem(SESSION_KEY);
      this.current = raw ? (JSON.parse(raw) as Session) : null;
      return this.current;
    },
    onChange: (cb): Unsubscribe => {
      this.listeners.add(cb);
      return () => {
        this.listeners.delete(cb);
      };
    },
  };

  directories: RotaApi['directories'] = {
    get: async () => JSON.parse(JSON.stringify(this.dirs)) as Directories,
  };

  orders: RotaApi['orders'] = {
    list: notBuilt('orders.list'),
    forBoard: notBuilt('orders.forBoard'),
    get: notBuilt('orders.get'),
    create: notBuilt('orders.create'),
    action: notBuilt('orders.action'),
    suggestAssignees: notBuilt('orders.suggestAssignees'),
  };

  workers: RotaApi['workers'] = {
    statuses: notBuilt('workers.statuses'),
    brigades: notBuilt('workers.brigades'),
    setOnShift: notBuilt('workers.setOnShift'),
  };

  shift: RotaApi['shift'] = { counters: notBuilt('shift.counters') };

  equipment: RotaApi['equipment'] = { history: notBuilt('equipment.history') };

  photos: RotaApi['photos'] = {
    upload: notBuilt('photos.upload'),
    url: notBuilt('photos.url'),
    urls: notBuilt('photos.urls'),
  };

  ai: RotaApi['ai'] = {
    verify: notBuilt('ai.verify'),
    review: notBuilt('ai.review'),
    insights: notBuilt('ai.insights'),
    shiftSummary: notBuilt('ai.shiftSummary'),
    explainRating: notBuilt('ai.explainRating'),
  };

  reports: RotaApi['reports'] = {
    shift: notBuilt('reports.shift'),
    rating: notBuilt('reports.rating'),
    dashboard: notBuilt('reports.dashboard'),
  };

  notifications: RotaApi['notifications'] = {
    list: async () => [],
    unreadCount: async () => 0,
    markRead: notBuilt('notifications.markRead'),
    registerPushToken: async () => {},
    unregisterPushToken: async () => {},
  };

  realtime: RotaApi['realtime'] = {
    subscribe: () => () => {},
    resync: () => {},
  };

  demo: RotaApi['demo'] = {
    reset: notBuilt('demo.reset'),
    settings: async () => ({ ...this.dirs.settings }),
    updateSettings: async (patch: Partial<Settings>) => {
      this.dirs.settings = { ...this.dirs.settings, ...patch };
      return { ...this.dirs.settings };
    },
  };
}
