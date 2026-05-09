import { RouterProvider } from '@tanstack/react-router';
import router from './router';
import { useEffect, useState } from 'react';
import { ToastProvider } from './context/ToastContext';
import ReactGA from 'react-ga4';
import { InviteGate, INVITE_GRANTED_KEY } from './components/common/InviteGate';

const GA_MEASUREMENT_ID = 'G-523HYF8JTN';
const CLARITY_PROJECT_ID = 't0od4wxooa';

function InviteGateWrapper() {
  const [granted, setGranted] = useState(() =>
    !!localStorage.getItem(INVITE_GRANTED_KEY)
  );

  if (granted) return null;

  return (
    <InviteGate
      onGranted={() => {
        localStorage.setItem(INVITE_GRANTED_KEY, '1');
        setGranted(true);
      }}
    />
  );
}

function App() {
  useEffect(() => {
    // Initialize GA4
    if (GA_MEASUREMENT_ID) {
      ReactGA.initialize(GA_MEASUREMENT_ID);
    }

    // Set up Microsoft Clarity
    if (CLARITY_PROJECT_ID) {
      (function (c: any, l: any, a: any, r: any, i: any) {
        c[a] =
          c[a] ||
          function () {
            (c[a].q = c[a].q || []).push(arguments);
          };
        const t = l.createElement(r);
        t.async = 1;
        t.src = 'https://www.clarity.ms/tag/' + i;
        const y = l.getElementsByTagName(r)[0];
        y.parentNode.insertBefore(t, y);
      })(window, document, 'clarity', 'script', CLARITY_PROJECT_ID);
    }

    // Handle referrer parameter
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('axis_referrer', ref);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-orange-500/30">
      <ToastProvider>
        <InviteGateWrapper />
        <RouterProvider router={router} />
      </ToastProvider>
    </div>
  );
}

export default App;
