import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './supabase';

type Listener = (online: boolean) => void;

const HEARTBEAT_ONLINE_MS = 30_000;
const HEARTBEAT_OFFLINE_MS = 5_000;
const PING_TIMEOUT_MS = 4_000;

/**
 * Listener de conexión a internet.
 * `navigator.onLine` solo indica si hay interfaz de red; por eso además se hace un ping
 * ligero a Supabase (`/auth/v1/health`) para confirmar que el backend es alcanzable.
 */
export class Connectivity {
  private online = typeof navigator === 'undefined' ? true : navigator.onLine;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  constructor(private readonly pingUrl = `${SUPABASE_URL}/auth/v1/health`) {}

  get isOnline() {
    return this.online;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    window.addEventListener('online', this.handleOnlineEvent);
    window.addEventListener('offline', this.handleOfflineEvent);
    document.addEventListener('visibilitychange', this.handleVisibility);
    void this.check();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('online', this.handleOnlineEvent);
    window.removeEventListener('offline', this.handleOfflineEvent);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    if (this.timer) clearTimeout(this.timer);
  }

  /** Fuerza una verificación inmediata (p. ej. tras un error de red al sincronizar). */
  async check(): Promise<boolean> {
    if (this.timer) clearTimeout(this.timer);
    const reachable = await this.ping();
    this.set(reachable);
    if (this.started) {
      this.timer = setTimeout(
        () => void this.check(),
        reachable ? HEARTBEAT_ONLINE_MS : HEARTBEAT_OFFLINE_MS
      );
    }
    return reachable;
  }

  private async ping(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    if (!isSupabaseConfigured()) return typeof navigator === 'undefined' || navigator.onLine;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    try {
      const res = await fetch(this.pingUrl, {
        method: 'GET',
        headers: { apikey: SUPABASE_ANON_KEY },
        cache: 'no-store',
        signal: controller.signal,
      });
      return res.status < 500;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private set(value: boolean) {
    if (value === this.online) return;
    this.online = value;
    for (const fn of this.listeners) fn(value);
  }

  private handleOnlineEvent = () => void this.check();
  private handleOfflineEvent = () => {
    this.set(false);
    void this.check();
  };
  private handleVisibility = () => {
    if (document.visibilityState === 'visible') void this.check();
  };
}
