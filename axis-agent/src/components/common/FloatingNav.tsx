import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
// コンパスとプラスはカスタムSVG化したためインポートから外し、ログインボタン用のUserなどは残しています
import { User, MessageSquareText, LogOut } from 'lucide-react';
import { BugDrawer } from './BugDrawer';
import { useWallet } from '../../hooks/useWallet';
import { usePrivy } from '@privy-io/react-auth';

export type ViewState = 'DISCOVER' | 'CREATE' | 'PROFILE';

// ── ゆったりとした緩急のイージング設定 ────────────────────────────────────
// 動き出しはゆっくり、途中で少し加速し、最後はスッと収まるエレガントなイージング
const SLOW_EASE = [0.76, 0, 0.24, 1];
const DURATION = 0.8;

// (a) Compass: 外枠は固定、中の針だけが緩急をつけてゆっくり回る
const AnimatedCompassIcon = ({ isActive, className, strokeWidth }: { isActive: boolean, className: string, strokeWidth: number }) => (
  <motion.svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <motion.polygon
      points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"
      initial={false}
      // 非アクティブ時は-140度、アクティブ時に0度へ
      animate={{ 
        rotate: isActive ? 0 : -140, 
        scale: isActive ? 1 : 0.85 
      }}
      // 回転の軸をSVGの中心(12,12)に設定
      style={{ originX: '12px', originY: '12px' }}
      transition={{ duration: DURATION, ease: SLOW_EASE }}
    />
  </motion.svg>
);

// (b) Plus: アイコン全体がゆっくりと回転しながらスッと収まる
const AnimatedPlusIcon = ({ isActive, className, strokeWidth }: { isActive: boolean, className: string, strokeWidth: number }) => (
  <motion.svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}
    initial={false}
    animate={{ rotate: isActive ? 0 : -180 }}
    transition={{ duration: DURATION, ease: SLOW_EASE }}
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </motion.svg>
);

// (c) User: わずかな「深呼吸」（胸を張ってゆっくり息を吐く動き）
const AnimatedUserIcon = ({ isActive, className, strokeWidth }: { isActive: boolean, className: string, strokeWidth: number }) => (
  <motion.svg 
    width="22" height="22" viewBox="0 0 24 24" fill="none" 
    stroke="currentColor" strokeWidth={strokeWidth} 
    strokeLinecap="round" strokeLinejoin="round" className={className}
  >
    {/* 頭の部分（どっしり固定） */}
    <circle cx="12" cy="8" r="5" />
    
    {/* 体の部分（アクティブになった瞬間に1度だけ深呼吸） */}
    <motion.path 
      d="M20 21a8 8 0 0 0-16 0"
      initial={false}
      animate={{ 
        // 横幅をほんの少し（8%）広げ、高さもわずか（3%）に上げる
        scaleX: isActive ? [1, 1.08, 1] : 1,
        scaleY: isActive ? [1, 1.03, 1] : 1,
      }}
      // アニメーションの起点を「下部の中央」に設定（ここがズレると不自然になるため）
      style={{ originX: '12px', originY: '21px' }}
      transition={{ 
        duration: 1.2, // 深呼吸なので他のアイコン(0.8s)より少し長めに時間をかける
        ease: "easeInOut",
        times: [0, 0.4, 1] // 40%の時間で息を吸い、残り60%でゆっくり吐くリアルなテンポ
      }}
    />
  </motion.svg>
);

// ── Animated icon wrapper ─────────────────────────────────────────────────────

const AnimatedNavIcon = memo(({ id, isActive }: { id: ViewState; isActive: boolean }) => {
  const cls = `shrink-0 transition-colors duration-200 ${
    isActive ? 'text-amber-300' : 'text-white/60 group-hover:text-white/85'
  }`;
  const strokeWidth = isActive ? 2.5 : 2;

  if (id === 'DISCOVER') return <AnimatedCompassIcon isActive={isActive} className={cls} strokeWidth={strokeWidth} />;
  if (id === 'CREATE')   return <AnimatedPlusIcon    isActive={isActive} className={cls} strokeWidth={strokeWidth} />;
  if (id === 'PROFILE')  return <AnimatedUserIcon    isActive={isActive} className={cls} strokeWidth={strokeWidth} />;

  return null;
});

// ── Nav item config ───────────────────────────────────────────────────────────

const NAV_ITEMS: { id: ViewState; label: string }[] = [
  { id: 'DISCOVER', label: 'Discover' },
  { id: 'CREATE',   label: 'Create'   },
  { id: 'PROFILE',  label: 'Profile'  },
];

// ── Spring presets ────────────────────────────────────────────────────────────
const BUTTON_SPRING = { type: 'spring' as const, stiffness: 560, damping: 22, mass: 0.4 };
const PILL_SPRING   = { type: 'spring' as const, stiffness: 300, damping: 20, mass: 0.8 };

// ── Component ─────────────────────────────────────────────────────────────────

interface FloatingNavProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  onOpenLogin: () => void;
  discoverViewMode?: 'swipe' | 'list';
  onDiscoverViewModeChange?: (mode: 'swipe' | 'list') => void;
}

export const FloatingNav = memo(({
  currentView, onNavigate, onOpenLogin,
}: FloatingNavProps) => {
  const [isBugDrawerOpen, setIsBugDrawerOpen] = useState(false);
  const [isVisible,       setIsVisible]       = useState(true);
  const [isDesktop,       setIsDesktop]       = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 768,
  );
  const [hiddenByScroll, setHiddenByScroll] = useState(false);

  const prefersReduced = useReducedMotion();
  const { publicKey, disconnect } = useWallet();
  const { authenticated, ready } = usePrivy();
  const isLoggedIn = authenticated || !!publicKey;

  const hideTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = useRef(false);
  const lastScrollY   = useRef(0);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const y  = window.scrollY;
      const dy = y - lastScrollY.current;
      if      (y < 80)  setHiddenByScroll(false);
      else if (dy >  6) setHiddenByScroll(true);
      else if (dy < -6) setHiddenByScroll(false);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setHiddenByScroll(false);
    lastScrollY.current = 0;
  }, [currentView]);

  const handleActivity = useCallback(() => {
    if (isDesktop) { setIsVisible(true); return; }
    setIsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (!isHoveringRef.current && !isBugDrawerOpen) {
      hideTimerRef.current = setTimeout(() => setIsVisible(false), 3000);
    }
  }, [isBugDrawerOpen, isDesktop]);

  useEffect(() => {
    if (isDesktop) return;
    const events = ['touchstart', 'click', 'keydown', 'mousemove'] as const;
    events.forEach(e => window.addEventListener(e, handleActivity));
    handleActivity();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      events.forEach(e => window.removeEventListener(e, handleActivity));
    };
  }, [handleActivity, isDesktop]);

  return (
    <>
      <motion.div
        initial={false}
        animate={{
          y: hiddenByScroll
            ? (isDesktop ? -80 : 120)
            : (isDesktop ? 0 : isVisible ? 0 : 120),
          opacity: hiddenByScroll ? 0 : (isDesktop ? 1 : isVisible ? 1 : 0.4),
        }}
        transition={PILL_SPRING}
        className="fixed z-50 flex justify-center pointer-events-none px-4
          bottom-8 left-0 right-0
          md:top-0 md:bottom-auto md:px-0 md:w-full
          md:bg-[#0A0A0A]/90 md:backdrop-blur-xl md:border-b md:border-white/[0.06]"
      >
        {/* ── Pill ─────────────────────────────────────────────────────── */}
        <div
          onMouseEnter={() => {
            isHoveringRef.current = true;
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            setIsVisible(true);
          }}
          onMouseLeave={() => {
            isHoveringRef.current = false;
            if (!isDesktop) handleActivity();
          }}
          onTouchStart={() => {
            isHoveringRef.current = true;
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            setIsVisible(true);
          }}
          className="pointer-events-auto relative flex items-center justify-between gap-5
            overflow-hidden rounded-full
            bg-[#111]/70 backdrop-blur-2xl
            border border-white/[0.10]
            pl-8 pr-4 py-2.5 min-w-[300px]
            shadow-[0_8px_40px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.10)]
            md:overflow-visible md:w-full md:max-w-7xl md:mx-auto
            md:rounded-none md:border-none md:bg-transparent md:shadow-none md:py-4 md:px-8"
          style={{ transform: 'translateZ(0)' }}
        >
          {/* Sweeping shimmer — mobile only */}
          {!prefersReduced && (
            <motion.div
              aria-hidden
              className="absolute inset-0 rounded-full pointer-events-none md:hidden"
              style={{
                background:
                  'linear-gradient(110deg, transparent 15%, rgba(255,255,255,0.06) 50%, transparent 85%)',
              }}
              animate={{ x: ['-160%', '160%'] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: 'linear', repeatDelay: 4 }}
            />
          )}

          {/* Breathing amber border — mobile only */}
          {!prefersReduced && (
            <motion.div
              aria-hidden
              className="absolute inset-0 rounded-full pointer-events-none md:hidden"
              style={{ boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.28)' }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}

          <div className="hidden md:flex items-center gap-2 font-normal text-xl text-white tracking-tight" />

          <div className="flex items-center gap-3 md:gap-8">
            {/* ── Nav buttons ──────────────────────────────────────────── */}
            <div className="flex items-center gap-0.5 md:gap-6">
              {NAV_ITEMS.map(({ id, label }) => {
                const isActive = currentView === id;
                return (
                  <motion.button
                    key={id}
                    onClick={() => onNavigate(id)}
                    className="relative px-3.5 h-10 flex items-center justify-center rounded-full group
                      focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/40"
                    whileHover={prefersReduced ? {} : { scale: 1.10 }}
                    whileTap={prefersReduced ? {} : { scale: 0.83 }}
                    transition={BUTTON_SPRING}
                    style={{ willChange: 'transform' }}
                  >
                    {/* Glass active bg — amber-tinted, visible on dark */}
                    {isActive && (
                      <motion.div
                        layoutId="nav-glass-active"
                        className="absolute inset-0 rounded-full"
                        style={{
                          background:
                            'linear-gradient(160deg, rgba(201,168,76,0.18) 0%, rgba(201,168,76,0.06) 100%)',
                          boxShadow:
                            'inset 0 1px 0 rgba(255,220,130,0.22), inset 0 0 0 1px rgba(201,168,76,0.28), 0 0 18px rgba(201,168,76,0.14)',
                        }}
                        transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
                      />
                    )}

                    <div className="relative z-10 flex items-center gap-2">
                      <AnimatedNavIcon id={id} isActive={isActive} />
                      <span
                        className={`hidden md:block text-sm font-normal transition-colors duration-200 ${
                          isActive ? 'text-amber-300/90' : 'text-white/55 group-hover:text-white/80'
                        }`}
                      >
                        {label}
                      </span>
                    </div>

                    {/* Amber dot indicator — mobile only */}
                    <AnimatePresence>
                      {isActive && (
                        <motion.span
                          className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1
                            rounded-full bg-amber-400/70 md:hidden"
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0 }}
                          transition={BUTTON_SPRING}
                        />
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>

            <div className="w-px h-6 bg-white/[0.08]" />

            {/* Bug report */}
            <motion.button
              onClick={() => setIsBugDrawerOpen(true)}
              className="btn-glass w-9 h-9 flex items-center justify-center rounded-full group"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.87 }}
              transition={BUTTON_SPRING}
            >
              <MessageSquareText className="w-4 h-4 text-white/40 group-hover:text-white/65 transition-colors duration-300" />
            </motion.button>

            {/* Auth button */}
            {!ready ? (
              <div className="w-9 h-9 md:w-20 rounded-full bg-white/[0.06] animate-pulse" />
            ) : isLoggedIn ? (
              <motion.button
                onClick={() => disconnect()}
                className="flex items-center gap-2 w-9 h-9 md:w-auto md:px-4 justify-center
                  rounded-full border border-red-500/20 bg-red-950/25 text-red-400/65 text-sm
                  hover:border-red-500/45 hover:text-red-400 transition-colors"
                whileTap={{ scale: 0.92 }}
                transition={BUTTON_SPRING}
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span className="hidden md:block">Log Out</span>
              </motion.button>
            ) : (
              <motion.button
                onClick={onOpenLogin}
                className="flex items-center gap-2 w-9 h-9 md:w-auto md:px-4 justify-center
                  rounded-full text-sm font-normal
                  bg-amber-400/[0.10] border border-amber-400/30 text-amber-300/80
                  hover:bg-amber-400/[0.16] hover:border-amber-400/50 hover:text-amber-200
                  transition-colors shadow-[0_0_14px_rgba(201,168,76,0.10)]"
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.90 }}
                transition={BUTTON_SPRING}
              >
                <User className="w-4 h-4 shrink-0 md:hidden" />
                <span className="hidden md:block">Log In</span>
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>

      <BugDrawer isOpen={isBugDrawerOpen} onClose={() => setIsBugDrawerOpen(false)} />
    </>
  );
});