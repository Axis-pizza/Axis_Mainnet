/**
 * Home - Kagemusha AI Strategy Factory
 * Main entry with floating navigation and tactical interface
 */
import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useWallet, useConnection, useLoginModal } from './hooks/useWallet';
import { FloatingNav, type ViewState } from './components/common/FloatingNav';
import { TutorialOverlay } from './components/common/TutorialOverlay';
import { KagemushaFlow } from './components/create';
import { DiscoverView } from './components/discover/DiscoverView';
import { ProfileView } from './components/profile/ProfileView';
import { StrategyDetailView } from './components/discover/StrategyDetailView';
import type { Strategy } from './types';
import { getUsdcBalance } from './services/usdc';

type View = 'DISCOVER' | 'CREATE' | 'PROFILE' | 'STRATEGY_DETAIL';
const TUTORIAL_KEY = 'kagemusha-onboarding-v2';
const DISCOVER_VIEW_KEY = 'axis-discover-view-mode';
const pageVariants = {
  enter: { opacity: 0, scale: 0.98 },
  center: { opacity: 1, scale: 1 },
  exit:   { opacity: 0, scale: 1.01 },
};
const pageTransition = { duration: 0.35, ease: [0.4, 0, 0.2, 1] };

export default function Home() {
  const [view, setView] = useState<View>('CREATE');
  const [previousView, setPreviousView] = useState<View>('DISCOVER');
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [newStrategyId, setNewStrategyId] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isOverlayActive, setIsOverlayActive] = useState(false);
  const [hideNavInCreate, setHideNavInCreate] = useState(false);
  const [discoverViewMode, setDiscoverViewMode] = useState<'swipe' | 'list'>(() => {
    const saved = localStorage.getItem(DISCOVER_VIEW_KEY);
    return saved === 'list' ? 'list' : 'swipe';
  });

  const handleDiscoverViewModeChange = (mode: 'swipe' | 'list') => {
    setDiscoverViewMode(mode);
    localStorage.setItem(DISCOVER_VIEW_KEY, mode);
  };

  const { setVisible: openLogin } = useLoginModal();
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);

  // Fetch wallet balance (USDC)
  const getBalance = useCallback(async () => {
    if (!publicKey || !connection) return 0;
    try {
      return await getUsdcBalance(connection, publicKey);
    } catch {
      return 0;
    }
  }, [publicKey, connection]);

  useEffect(() => {
    if (connected) {
      getBalance().then(setBalance);
    }
  }, [connected, getBalance]);

  // Show onboarding on first visit (no wallet connection required)
  useEffect(() => {
    const isCompleted = localStorage.getItem(TUTORIAL_KEY);
    if (!isCompleted) {
      const timer = setTimeout(() => setShowTutorial(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleTutorialComplete = () => {
    localStorage.setItem(TUTORIAL_KEY, 'true');
    setShowTutorial(false);
  };

  const handleConnectWallet = () => { openLogin(true); };

  const handleStrategySelect = (strategy: Strategy) => {
    setPreviousView(view);
    setSelectedStrategy(strategy);
    setView('STRATEGY_DETAIL');
  };

  const handleBackFromDetail = () => {
    setView(previousView);
    setSelectedStrategy(null);
  };

  const navigateTo = useCallback((newView: View) => {
    setView(newView);
  }, []);

  const handleNavigate = (newView: ViewState) => navigateTo(newView as View);

  return (
    <div className="bg-[#030303] min-h-screen text-white font-sans selection:bg-orange-500/30 relative overflow-x-hidden">
      {/* Background Glows — use will-change + translateZ to prevent mobile repaint flicker */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none overflow-hidden z-0"
        style={{ willChange: 'transform', transform: 'translateZ(0)' }}>
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-900/10 blur-[80px] rounded-full"
          style={{ willChange: 'transform', backfaceVisibility: 'hidden' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-900/10 blur-[80px] rounded-full"
          style={{ willChange: 'transform', backfaceVisibility: 'hidden' }} />
      </div>

      {/* Main views — blur morph transition */}
      <AnimatePresence>
        {view === 'DISCOVER' && (
          <motion.div
            key="DISCOVER"
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="relative z-20 pb-32"
            style={{ willChange: 'opacity, transform' }}
          >
            <DiscoverView
              onStrategySelect={handleStrategySelect}
              onOverlayChange={setIsOverlayActive}
              viewMode={discoverViewMode}
              onViewModeChange={handleDiscoverViewModeChange}
              focusedStrategyId={newStrategyId}
            />
          </motion.div>
        )}

        {view === 'CREATE' && (
          <motion.div
            key="CREATE"
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="relative z-20 pb-32"
            style={{ willChange: 'opacity, transform' }}
          >
            <KagemushaFlow
              onStepChange={(step, strategyId) => {
                setHideNavInCreate(step !== 'LANDING' && step !== 'DASHBOARD');

                if (step === 'DASHBOARD') {
                  // strategyId が取れた場合はそれを、なければ publicKey を
                  // シグナルとして使い「このユーザーの最新策略を先頭に」を伝える
                  setNewStrategyId(strategyId || publicKey?.toBase58() || 'my-newest');
                  navigateTo('DISCOVER');
                  setHideNavInCreate(false);
                }
              }}
            />
          </motion.div>
        )}

        {view === 'PROFILE' && (
          <motion.div
            key="PROFILE"
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="relative z-20 pb-32"
            style={{ willChange: 'opacity, transform' }}
          >
            <ProfileView onStrategySelect={handleStrategySelect} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* STRATEGY DETAIL — slide up with spring bounce */}
      <AnimatePresence>
        {view === 'STRATEGY_DETAIL' && selectedStrategy && (
          <motion.div
            className="fixed inset-0 z-[200] bg-[#030303]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: { type: 'spring', stiffness: 380, damping: 38 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 24, mass: 0.85 }}
          >
            <StrategyDetailView initialData={selectedStrategy} onBack={handleBackFromDetail} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Navigation (Tutorial targets this) */}
      {view !== 'STRATEGY_DETAIL' && !hideNavInCreate && !isOverlayActive && (
        <FloatingNav
          currentView={view as ViewState}
          onNavigate={handleNavigate}
          onOpenLogin={() => openLogin(true)}
          discoverViewMode={discoverViewMode}
          onDiscoverViewModeChange={handleDiscoverViewModeChange}
        />
      )}

{/* Luxury Tutorial Overlay */}
      <AnimatePresence>
        {showTutorial && (
          <TutorialOverlay
            onComplete={handleTutorialComplete}
            onConnectWallet={handleConnectWallet}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
