import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Providers } from './Providers.tsx';

// ── MWA Embedded Modal Fix ──────────────────────────────────────────────
// The MWA library uses a CLOSED Shadow DOM with z-index:1 and no backdrop.
// We intercept attachShadow to inject our style overrides into the shadow root,
// and fix the host element's positioning so the modal sits above everything.
const origAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function(init: ShadowRootInit) {
  const shadow = origAttachShadow.call(this, init);

  // Watch for MWA styles being injected into this shadow root
  const observer = new MutationObserver(() => {
    const styleEl = shadow.querySelector('#mobile-wallet-adapter-embedded-modal-styles') as HTMLStyleElement;
    if (styleEl) {
      observer.disconnect();

      // Inject our override styles into the shadow root
      const override = document.createElement('style');
      override.textContent = `
        .mobile-wallet-adapter-embedded-modal-container {
          z-index: 300000 !important;
          background: rgba(0, 0, 0, 0.88) !important;
          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;
        }
        .mobile-wallet-adapter-embedded-modal-card {
          z-index: 300001 !important;
          position: relative !important;
        }
      `;
      shadow.appendChild(override);

      // Fix the host element's root container
      const fixRoot = () => {
        const root = document.getElementById('mobile-wallet-adapter-embedded-root-ui');
        if (!root) return;
        if (root.style.display !== 'none') {
          // Modal is visible — cover the screen
          Object.assign(root.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '300000',
          });
        } else {
          // Modal is hidden — reset so it doesn't block Chrome's
          // native Local Network Access permission dialog
          Object.assign(root.style, {
            position: '',
            inset: '',
            zIndex: '',
          });
        }
      };

      fixRoot();
      // Re-check when display changes
      const rootEl = document.getElementById('mobile-wallet-adapter-embedded-root-ui');
      if (rootEl) {
        new MutationObserver(fixRoot).observe(rootEl, { attributes: true, attributeFilter: ['style'] });
      }
    }
  });
  observer.observe(shadow, { childList: true, subtree: true });

  return shadow;
};
// ────────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>
);
