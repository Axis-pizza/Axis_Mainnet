const MWA_FONT_SELECTOR =
  'link[href*="fonts.googleapis.com/css2?family=Inter+Tight"]';

function markMwaHost(node: Node) {
  if (!(node instanceof HTMLElement)) return;
  if (node.dataset.axisMwaShadowHost === 'true') return;
  if (!node.querySelector(MWA_FONT_SELECTOR)) return;

  node.dataset.axisMwaShadowHost = 'true';
}

export function setupMwaHostObserver() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const globalWindow = window as Window & {
    __axisMwaHostObserverInstalled__?: boolean;
  };

  if (globalWindow.__axisMwaHostObserverInstalled__) return;
  globalWindow.__axisMwaHostObserverInstalled__ = true;

  document.body?.childNodes.forEach(markMwaHost);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach(markMwaHost);
    });
  });

  if (document.body) {
    observer.observe(document.body, { childList: true });
  } else {
    window.addEventListener(
      'load',
      () => {
        if (!document.body) return;
        observer.observe(document.body, { childList: true });
        document.body.childNodes.forEach(markMwaHost);
      },
      { once: true }
    );
  }
}
