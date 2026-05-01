import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Toast } from '../components/common/Toast';

type ToastType = 'success' | 'error' | 'info';

interface ToastContextType {
  /// `duration` overrides the default. `0` keeps the toast open until the
  /// user dismisses it. Errors default to 12s (long enough to read + copy a
  /// stack trace); success/info stay at 3s.
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3000,
  info: 3000,
  error: 12000,
};

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toast, setToast] = useState<{ message: string; type: ToastType; id: number } | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  };

  const dismiss = useCallback((id?: number) => {
    clearTimer();
    setToast((current) => (id === undefined || current?.id === id ? null : current));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration?: number) => {
      const id = Date.now();
      const ms = duration ?? DEFAULT_DURATION[type];
      clearTimer();
      setToast({ message, type, id });

      if (ms > 0) {
        dismissTimer.current = setTimeout(() => {
          setToast((current) => (current?.id === id ? null : current));
          dismissTimer.current = null;
        }, ms);
      }
    },
    [],
  );

  // Pause auto-dismiss while the user is interacting (reading, selecting,
  // hovering the copy button). Resume the remaining time on leave isn't worth
  // tracking for an MVP — a fresh full window is fine.
  const pauseDismiss = useCallback(() => {
    clearTimer();
  }, []);
  const resumeDismiss = useCallback(() => {
    if (!toast) return;
    const ms = DEFAULT_DURATION[toast.type];
    if (ms <= 0) return;
    clearTimer();
    const id = toast.id;
    dismissTimer.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
      dismissTimer.current = null;
    }, ms);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      <div className="fixed top-0 left-0 right-0 z-[10000] flex justify-center pt-6 px-4 pointer-events-none">
        <AnimatePresence mode="wait">
          {toast && (
            <Toast
              key={toast.id}
              message={toast.message}
              type={toast.type}
              onClose={() => dismiss(toast.id)}
              onMouseEnter={pauseDismiss}
              onMouseLeave={resumeDismiss}
            />
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};
