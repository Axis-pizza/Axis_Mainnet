export const isAndroidChrome = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Seeker runs Android with Chrome (including Chrome WebView in APK).
  // Accept both standard Chrome and Chrome-based WebView (wv flag).
  return (
    /Android/i.test(ua) &&
    /Chrome/i.test(ua) &&
    !/Brave/i.test(ua) &&
    !/Firefox/i.test(ua) &&
    !/SamsungBrowser/i.test(ua)
  );
};

export const isIOSBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent;
  const isIOSDevice = /iPhone|iPad|iPod/i.test(ua);
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  return isIOSDevice || isIPadOS;
};

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
