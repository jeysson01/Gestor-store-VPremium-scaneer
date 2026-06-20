export type KioskCodeDisplay = {
  id: number;
  code: string;
  qrToken: string;
  expiresAt: Date;
  secondsLeft: number;
};

export function getKioskAppBaseUrl(originOverride?: string): string {
  if (originOverride) {
    return originOverride.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
    const isLocalHost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (
      isLocalHost &&
      envUrl &&
      !envUrl.includes('localhost') &&
      !envUrl.includes('127.0.0.1')
    ) {
      return envUrl;
    }

    return origin;
  }

  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3002';
}

export function getKioskLoginUrl(qrToken: string, baseUrl?: string): string {
  const base = getKioskAppBaseUrl(baseUrl);
  return `${base}/kiosk/ingreso?qr=${encodeURIComponent(`kiosk:${qrToken}`)}`;
}

export function getKioskQrImageUrl(qrToken: string, baseUrl?: string): string {
  const loginUrl = getKioskLoginUrl(qrToken, baseUrl);
  const data = encodeURIComponent(loginUrl);
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${data}`;
}

export function isLocalhostKioskUrl(url?: string): boolean {
  const value =
    url ||
    (typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL);

  if (!value) return true;

  try {
    const host = new URL(value).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return true;
  }
}
