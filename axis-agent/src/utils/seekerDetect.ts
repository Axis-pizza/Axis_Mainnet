export const isAndroidChrome = (): boolean =>
  typeof navigator !== 'undefined' &&
  /Android/i.test(navigator.userAgent) &&
  /Chrome/i.test(navigator.userAgent) &&
  !/Brave/i.test(navigator.userAgent);

/** True when running inside a TWA (standalone display mode on Android) */
export const isTWA = (): boolean =>
  isAndroidChrome() &&
  window.matchMedia('(display-mode: standalone)').matches;

/** True when the Seed Vault wallet standard provider is available */
export const hasSeedVault = (): boolean => {
  try {
    const wallets = (window as any).navigator?.wallets?.get?.() ?? [];
    return wallets.some((w: any) => w.name?.toLowerCase().includes('seed vault'));
  } catch {
    return false;
  }
};
