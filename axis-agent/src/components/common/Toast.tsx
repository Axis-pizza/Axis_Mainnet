import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle, Info, Copy, Check, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const Toast = ({ message, type, onClose, onMouseEnter, onMouseLeave }: ToastProps) => {
  const [copied, setCopied] = useState(false);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-amber-400" />,
  };

  const bgColors = {
    success: 'bg-[#111110] border-emerald-500/30',
    error: 'bg-[#111110] border-red-500/30',
    info: 'bg-[#111110] border-[rgba(201,168,76,0.3)]',
  };

  const shakeIntensity = type === 'error' ? 15 : 4;
  const rotateIntensity = type === 'error' ? 6 : 2;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in non-secure contexts; fall back to a
      // hidden textarea + execCommand. Browsers all support that fallback.
      const ta = document.createElement('textarea');
      ta.value = message;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // give up silently
      }
      document.body.removeChild(ta);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{
          x: [
            0,
            -shakeIntensity,
            shakeIntensity,
            -shakeIntensity,
            shakeIntensity,
            -shakeIntensity,
            0,
          ],
          rotate: [0, -rotateIntensity, rotateIntensity, -rotateIntensity, rotateIntensity, 0],
          y: 0,
          opacity: 1,
        }}
        transition={{
          x: { duration: 0.4, times: [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1] },
          rotate: { duration: 0.4, times: [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1] },
          y: { duration: 0.2 },
          opacity: { duration: 0.2 },
        }}
        exit={{ y: -20, opacity: 0 }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border ${bgColors[type]} shadow-2xl backdrop-blur-md max-w-[min(90vw,720px)] w-fit`}
      >
        <div className="flex-shrink-0 pt-0.5">{icons[type]}</div>
        <span className="font-normal text-zinc-200 text-sm select-text break-words whitespace-pre-wrap leading-relaxed flex-1">
          {message}
        </span>
        <div className="flex-shrink-0 flex items-center gap-1 pt-0.5">
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy message'}
            className="p-1 rounded hover:bg-white/5 text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Dismiss"
              className="p-1 rounded hover:bg-white/5 text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
