export const isAndroidChrome = (): boolean =>
  typeof navigator !== 'undefined' &&
  /Android/i.test(navigator.userAgent) &&
  /Chrome/i.test(navigator.userAgent) &&
  !/Brave/i.test(navigator.userAgent);
