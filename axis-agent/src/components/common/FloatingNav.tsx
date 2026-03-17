import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Plus, User, MessageSquareText, Layers, LayoutGrid, LogOut } from 'lucide-react';
import { BugDrawer } from './BugDrawer';
import { useWallet } from '../../hooks/useWallet';

export type ViewState = 'DISCOVER' | 'CREATE' | 'PROFILE';

const NAV_ITEMS = [
  { id: 'DISCOVER' as const, icon: Compass, label: 'Discover' },
  { id: 'CREATE' as const, icon: Plus, label: 'Create' },
  { id: 'PROFILE' as const, icon: User, label: 'Profile' },
];

interface FloatingNavProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  onOpenLogin: () => void;
  discoverViewMode?: 'swipe' | 'list';
  onDiscoverViewModeChange?: (mode: 'swipe' | 'list') => void;
}

export const FloatingNav = memo(({ currentView, onNavigate, onOpenLogin, discoverViewMode, onDiscoverViewModeChange }: FloatingNavProps) => {
  const [isBugDrawerOpen, setIsBugDrawerOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const [hiddenByScroll, setHiddenByScroll] = useState(false);
  const [showLogoutPopover, setShowLogoutPopover] = useState(false);

  const { connected, publicKey, disconnect } = useWallet();

  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 768);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastScrollY.current;
      if (y < 80) {
        setHiddenByScroll(false);
      } else if (dy > 6) {
        setHiddenByScroll(true);
      } else if (dy < -6) {
        setHiddenByScroll(false);
      }
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
    if (isDesktop) {
      setIsVisible(true);
      return;
    }
    setIsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (!isHoveringRef.current && !isBugDrawerOpen) {
      hideTimerRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 3000);
    }
  }, [isBugDrawerOpen, isDesktop]);

  useEffect(() => {
    if (isDesktop) return;
    const events = ['touchstart', 'click', 'keydown', 'mousemove'];
    events.forEach((event) => window.addEventListener(event, handleActivity));
    handleActivity();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      events.forEach((event) => window.removeEventListener(event, handleActivity));
    };
  }, [handleActivity, isDesktop]);

  const handleMouseEnter = () => {
    isHoveringRef.current = true;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    isHoveringRef.current = false;
    if (!isDesktop) handleActivity();
  };

  // Close popover when clicking outside
  useEffect(() => {
    if (!showLogoutPopover) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-auth-menu]')) {
        setShowLogoutPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler as any);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler as any);
    };
  }, [showLogoutPopover]);

  const handleAvatarClick = () => {
    setShowLogoutPopover((v) => !v);
  };

  const handleLogout = async () => {
    setShowLogoutPopover(false);
    await disconnect();
  };

  // Short address label
  const shortAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-3)}`
    : '';

  return (
    <>
      <motion.div
        initial={false}
        animate={{
          y: hiddenByScroll
            ? (isDesktop ? -80 : 120)
            : (isDesktop ? 0 : isVisible ? 0 : 120),
          opacity: hiddenByScroll ? 0 : (isDesktop ? 1 : isVisible ? 1 : 0.5),
        }}
        transition={{ type: 'spring', damping: 20, stiffness: 300, mass: 0.8 }}
        className="fixed z-50 flex justify-center pointer-events-none px-4
        bottom-8 left-0 right-0
        md:top-0 md:bottom-auto md:px-0 md:w-full
        md:bg-[#0A0A0A]/90 md:backdrop-blur-xl md:border-b md:border-amber-900/20"
      >
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleMouseEnter}
          className={`
            pointer-events-auto relative flex items-center justify-between gap-6
            transition-all duration-300
            bg-black/60 backdrop-blur-2xl border border-white/10 rounded-full pl-10 pr-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(201,168,76,0.10)] min-w-[320px]
            md:w-full md:max-w-7xl md:mx-auto md:rounded-none md:border-none md:bg-transparent md:shadow-none md:py-4 md:px-8
          `}
        >
          <div className="hidden md:flex items-center gap-2 font-normal text-xl text-white tracking-tight" />

          <div className="flex items-center gap-4 md:gap-8">
            {/* Nav items */}
            <div className="flex items-center gap-2 md:gap-8">
              {NAV_ITEMS.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id as ViewState)}
                    className="relative px-4 h-12 flex items-center justify-center rounded-full transition-all duration-300 group"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="nav-active-bg"
                        className="absolute inset-0 rounded-full shadow-[0_0_20px_rgba(201,168,76,0.5),inset_0_1px_0_rgba(254,248,210,0.35),inset_0_-1px_0_rgba(10,6,0,0.3)] [background:var(--gold-button)]"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <div className="relative z-10 flex items-center gap-2">
                      <item.icon
                        className={`w-6 h-6 transition-colors duration-300 ${
                          isActive
                            ? 'text-zinc-950 fill-black/10'
                            : 'text-amber-300/55 group-hover:text-amber-200'
                        }`}
                        strokeWidth={isActive ? 2.5 : 2}
                      />
                      <span
                        className={`hidden md:block text-sm font-normal ${
                          isActive ? 'text-zinc-950' : 'text-amber-300/55 group-hover:text-amber-200'
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="w-px h-8 bg-amber-900/20" />

            {/* Discover view toggle */}
            <AnimatePresence>
              {currentView === 'DISCOVER' && discoverViewMode && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  className="hidden md:flex items-center bg-white/5 border border-amber-800/20 rounded-full p-1 gap-0.5"
                >
                  <button
                    onClick={() => onDiscoverViewModeChange?.('swipe')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-normal transition-all active:scale-95 ${
                      discoverViewMode === 'swipe'
                        ? 'bg-white/15 text-white'
                        : 'text-amber-700/50 hover:text-amber-400'
                    }`}
                  >
                    <Layers size={13} />
                    Swipe
                  </button>
                  <button
                    onClick={() => onDiscoverViewModeChange?.('list')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-normal transition-all active:scale-95 ${
                      discoverViewMode === 'list'
                        ? 'bg-white/15 text-white'
                        : 'text-amber-700/50 hover:text-amber-400'
                    }`}
                  >
                    <LayoutGrid size={13} />
                    List
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bug report */}
            <button
              onClick={() => setIsBugDrawerOpen(true)}
              className="btn-glass relative w-10 h-10 flex items-center justify-center rounded-full transition-all group"
            >
              <MessageSquareText className="w-4 h-4 text-amber-300/60 group-hover:text-amber-200 group-hover:scale-110 transition-all duration-500" />
            </button>

            {/* Auth button */}
            {connected ? (
              <div className="relative" data-auth-menu>
                {/* Avatar button */}
                <button
                  onClick={handleAvatarClick}
                  className="flex items-center gap-2 pl-1 pr-3 h-10 rounded-full border border-[#B8863F]/30 bg-[#140E08] hover:border-[#B8863F]/60 transition-all active:scale-95"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#B8863F] to-[#6B4420] flex items-center justify-center text-[10px] font-normal text-black shrink-0">
                    {shortAddress.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="hidden md:block text-xs text-[#B8863F] font-normal">{shortAddress}</span>
                </button>

                {/* Logout popover */}
                <AnimatePresence>
                  {showLogoutPopover && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-14 right-0 bg-[#0D0A07] border border-[#B8863F]/20 rounded-2xl shadow-2xl overflow-hidden min-w-[160px]"
                    >
                      <button
                        onClick={() => { setShowLogoutPopover(false); onNavigate('PROFILE'); }}
                        className="flex items-center gap-3 w-full px-4 py-3 text-sm text-[#F2E0C8]/80 hover:bg-white/5 hover:text-[#F2E0C8] transition-colors"
                      >
                        <User className="w-4 h-4 text-[#B8863F]" />
                        Profile
                      </button>
                      <div className="h-px bg-[#B8863F]/10 mx-3" />
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-400/80 hover:bg-red-500/5 hover:text-red-400 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Log Out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                onClick={onOpenLogin}
                className="flex items-center gap-2 px-4 h-10 rounded-full bg-gradient-to-r from-[#6B4420] via-[#B8863F] to-[#E8C890] text-black text-sm font-normal active:scale-95 hover:brightness-110 transition-all shadow-[0_0_20px_rgba(184,134,63,0.25)]"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </motion.div>

      <BugDrawer isOpen={isBugDrawerOpen} onClose={() => setIsBugDrawerOpen(false)} />
    </>
  );
});
