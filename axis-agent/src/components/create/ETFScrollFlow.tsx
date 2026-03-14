import { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Loader2,
  ChevronDown,
  Fingerprint,
  Type,
  FileText,
  RefreshCw,
  Sparkles,
  Check,
} from 'lucide-react';
import { useWallet } from '../../hooks/useWallet';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useManualDashboard } from '../../hooks/useManualDashboard';
import { useTokenPreferences } from '../../hooks/useTokenPreferences';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ProfileEditModal } from '../common/ProfileEditModal';
import { api } from '../../services/api';
import { MobileBuilder, DesktopBuilder } from './manual/Builder';
import { DeploymentBlueprint } from './DeploymentBlueprint';
import type { ManualData } from './manual/types';

// ─────────────────────────────────────────────────────────────────────────────
// 3D Background (reused from CreateLanding)
// ─────────────────────────────────────────────────────────────────────────────
const TOKENS = ['SOL', 'BTC', 'ETH', 'USDC', 'JUP', 'AXIS'];
const COINS_PER_TOKEN = 50;
const FIELD_SIZE = 10;
const FIELD_DEPTH = 5;
const GOLD_CORE = '#C77D36';
const GOLD_DARK = '#3D1A08';

function createCoinTexture(symbol: string) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = GOLD_CORE;
  ctx.fillRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.fillStyle = GOLD_DARK;
  ctx.font = `bold ${symbol.length >= 4 ? '56' : '72'}px "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, size / 2, size / 2 + 5);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 16;
  return texture;
}

function TokenSwarm({ symbol }: { symbol: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useRef(new THREE.Object3D()).current;
  const { geometry, materials, motionData } = useRef((() => {
    const geo = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 32);
    geo.rotateX(Math.PI / 2);
    const faceTex = createCoinTexture(symbol);
    const sideMat = new THREE.MeshStandardMaterial({ color: GOLD_CORE, metalness: 1.0, roughness: 0.3 });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, metalness: 0.8, roughness: 0.4 });
    const data = Array.from({ length: COINS_PER_TOKEN }, () => ({
      pos: new THREE.Vector3(
        (Math.random() - 0.5) * FIELD_SIZE,
        (Math.random() - 0.5) * FIELD_SIZE,
        (Math.random() - 0.5) * FIELD_DEPTH - 2
      ),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.005,
        (Math.random() - 0.5) * 0.005 + 0.002,
        (Math.random() - 0.5) * 0.005
      ),
      rotSpeed: new THREE.Vector3(
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02
      ),
      rotation: new THREE.Vector3(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      ),
    }));
    return { geometry: geo, materials: [sideMat, faceMat, faceMat], motionData: data };
  })()).current;

  useFrame(() => {
    if (!meshRef.current) return;
    motionData.forEach((data, i) => {
      data.pos.add(data.velocity);
      if (data.pos.y > FIELD_SIZE / 2) data.pos.y = -FIELD_SIZE / 2;
      if (data.pos.y < -FIELD_SIZE / 2) data.pos.y = FIELD_SIZE / 2;
      if (data.pos.x > FIELD_SIZE / 2) data.pos.x = -FIELD_SIZE / 2;
      if (data.pos.x < -FIELD_SIZE / 2) data.pos.x = FIELD_SIZE / 2;
      data.rotation.add(data.rotSpeed);
      dummy.position.copy(data.pos);
      dummy.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[geometry, materials, COINS_PER_TOKEN]} castShadow receiveShadow />;
}

function SweepLight() {
  const lightRef = useRef<THREE.PointLight>(null!);
  useFrame(({ clock }) => {
    if (!lightRef.current) return;
    const t = clock.getElapsedTime();
    lightRef.current.position.x = Math.sin(t * 0.4) * 5;
    lightRef.current.position.y = Math.cos(t * 0.6) * 1.5 + 1.0;
    lightRef.current.intensity = 3.0 + Math.sin(t * 2) * 1.5;
  });
  return <pointLight ref={lightRef} position={[0, 0, 2]} color="#FFE4B8" distance={10} decay={1.5} />;
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.15} color="#C8D4E0" />
      <directionalLight position={[4, 5, 4]} intensity={1.5} color="#C77D36" castShadow />
      <SweepLight />
      {TOKENS.map((token) => (
        <TokenSwarm key={token} symbol={token} />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper with glassmorphism
// ─────────────────────────────────────────────────────────────────────────────
function GlassSection({
  children,
  className = '',
  innerClassName = '',
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <section className={`relative z-10 ${className}`}>
      <div
        className={`backdrop-blur-md border-t border-white/10 ${innerClassName}`}
        style={{ background: 'rgba(3, 3, 3, 0.55)' }}
      >
        {children}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline Identity Form (replaces the fixed-overlay IdentityStep)
// ─────────────────────────────────────────────────────────────────────────────
function InlineIdentityStep({
  config,
  setConfig,
  focusedField,
  setFocusedField,
  portfolioCount,
  connected,
  onDeploy,
  onGenerateRandomTicker,
}: {
  config: { name: string; ticker: string; description: string };
  setConfig: React.Dispatch<React.SetStateAction<{ name: string; ticker: string; description: string }>>;
  focusedField: 'ticker' | 'name' | 'desc' | null;
  setFocusedField: (f: 'ticker' | 'name' | 'desc' | null) => void;
  portfolioCount: number;
  connected: boolean;
  onDeploy: () => void;
  onGenerateRandomTicker: () => void;
}) {
  return (
    <div className="max-w-md mx-auto px-5 py-10 space-y-6">
      {/* Section header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-900/20 border border-amber-800/20 text-amber-600 text-sm font-medium uppercase tracking-wider mb-3">
          <Fingerprint size={14} /> Identity
        </div>
        <h2
          className="text-2xl text-white"
          style={{ fontFamily: '"Times New Roman", serif' }}
        >
          Name Your Strategy
        </h2>
      </div>

      {/* Ticker */}
      <div
        onClick={() => setFocusedField('ticker')}
        className={`rounded-3xl border p-5 transition-all cursor-text ${
          focusedField === 'ticker'
            ? 'border-amber-700/50 bg-white/5'
            : 'border-white/5 bg-white/[0.02]'
        }`}
      >
        <div
          className={`flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider ${focusedField === 'ticker' ? 'text-amber-600' : 'text-white/30'}`}
        >
          <Sparkles size={14} /> Ticker
        </div>
        <div className="flex items-center gap-4">
          <span
            className={`text-4xl ${focusedField === 'ticker' ? 'text-amber-600' : 'text-white/20'}`}
            style={{ fontFamily: '"Times New Roman", serif' }}
          >
            $
          </span>
          <input
            type="text"
            maxLength={5}
            value={config.ticker}
            onFocus={() => setFocusedField('ticker')}
            onChange={(e) => setConfig((prev) => ({ ...prev, ticker: e.target.value.toUpperCase() }))}
            placeholder="MEME"
            className="flex-1 bg-transparent text-4xl tracking-widest placeholder:text-white/10 focus:outline-none uppercase text-white"
            style={{ fontFamily: '"Times New Roman", serif' }}
          />
          <button
            onClick={(e) => { e.stopPropagation(); onGenerateRandomTicker(); }}
            className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-white/30 active:text-white active:bg-white/10"
          >
            <RefreshCw size={22} />
          </button>
        </div>
      </div>

      {/* Name */}
      <div
        onClick={() => setFocusedField('name')}
        className={`rounded-3xl border p-5 transition-all cursor-text ${
          focusedField === 'name'
            ? 'border-amber-700/50 bg-white/5'
            : 'border-white/5 bg-white/[0.02]'
        }`}
      >
        <div
          className={`flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider ${focusedField === 'name' ? 'text-amber-600' : 'text-white/30'}`}
        >
          <Type size={14} /> Name
        </div>
        <input
          type="text"
          maxLength={30}
          value={config.name}
          onFocus={() => setFocusedField('name')}
          onChange={(e) => setConfig((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="My Alpha Fund"
          className="w-full bg-transparent text-xl placeholder:text-white/10 focus:outline-none text-white py-2"
        />
      </div>

      {/* Description */}
      <div
        onClick={() => setFocusedField('desc')}
        className={`rounded-3xl border p-5 transition-all cursor-text ${
          focusedField === 'desc'
            ? 'border-amber-700/50 bg-white/5'
            : 'border-white/5 bg-white/[0.02]'
        }`}
      >
        <div
          className={`flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider ${focusedField === 'desc' ? 'text-amber-600' : 'text-white/30'}`}
        >
          <FileText size={14} /> Description
        </div>
        <textarea
          rows={4}
          value={config.description}
          onFocus={() => setFocusedField('desc')}
          onChange={(e) => setConfig((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Investment thesis..."
          className="w-full bg-transparent text-base text-white/90 placeholder:text-white/10 focus:outline-none resize-none leading-relaxed"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 pt-2">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0a0a0a] to-amber-950/20 p-5 rounded-2xl border border-amber-900/20">
          <div className="text-xs text-amber-700/50 uppercase font-medium">Fee</div>
          <div className="text-2xl text-amber-500 mt-1" style={{ fontFamily: '"Times New Roman", serif' }}>
            0.5%
          </div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0a0a0a] to-amber-950/20 p-5 rounded-2xl border border-amber-900/20">
          <div className="text-xs text-amber-700/50 uppercase font-medium">Assets</div>
          <div className="text-2xl text-white mt-1" style={{ fontFamily: '"Times New Roman", serif' }}>
            {portfolioCount}
          </div>
        </div>
      </div>

      {/* Deploy Button */}
      <div className="pt-2 pb-4">
        <button
          onClick={onDeploy}
          disabled={!config.ticker || !config.name}
          className={`w-full py-5 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 shadow-2xl transition-all active:scale-[0.98] ${
            !config.ticker || !config.name
              ? 'bg-[#222] text-white/20 cursor-not-allowed'
              : 'bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700 text-black'
          }`}
        >
          {connected ? (
            <>
              Review ETF <Check size={22} />
            </>
          ) : (
            'Connect Wallet'
          )}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ETFScrollFlow — Main component
// ─────────────────────────────────────────────────────────────────────────────

type FlowPhase = 'hero' | 'building' | 'identity' | 'review';

export interface ETFScrollFlowProps {
  onDeployComplete?: () => void;
}

export const ETFScrollFlow = ({ onDeployComplete }: ETFScrollFlowProps) => {
  const { publicKey, connected } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const isMobile = useIsMobile();
  const preferences = useTokenPreferences();

  const [phase, setPhase] = useState<FlowPhase>('hero');
  const [showRegistration, setShowRegistration] = useState(false);
  const [checkingRegistration, setCheckingRegistration] = useState(false);
  const [draftStrategy, setDraftStrategy] = useState<ManualData | null>(null);

  // Section refs for auto-scroll
  const builderRef = useRef<HTMLDivElement>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  // Builder state (shared hook)
  const dashboard = useManualDashboard({
    onDeploySuccess: () => {}, // overridden below
    initialConfig: draftStrategy?.config,
    initialTokens: draftStrategy?.tokens,
    verifiedOnly: preferences.verifiedOnly,
  });

  const scrollTo = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStartCreate = async () => {
    if (!connected || !publicKey) {
      setWalletModalVisible(true);
      return;
    }
    setCheckingRegistration(true);
    try {
      const res = await api.getUser(publicKey.toBase58());
      if (!res.is_registered) {
        setShowRegistration(true);
        return;
      }
    } catch {
      // allow through on error
    } finally {
      setCheckingRegistration(false);
    }
    setPhase('building');
    scrollTo(builderRef);
  };

  const handleRegistrationComplete = () => {
    setShowRegistration(false);
    setPhase('building');
    scrollTo(builderRef);
  };

  // Called when user finishes builder and moves to identity
  const handleBuilderNext = useCallback(() => {
    setPhase('identity');
    scrollTo(identityRef);
  }, [scrollTo]);

  // Called from identity "Review ETF" button
  const handleIdentityNext = useCallback(() => {
    const { config } = dashboard;
    if (!config.ticker || !config.name) return;
    if (!connected || !publicKey) {
      setWalletModalVisible(true);
      return;
    }
    const mappedTokens = dashboard.portfolio.map((p) => ({
      symbol: p.token.symbol,
      weight: p.weight,
      mint: p.token.address,
      logoURI: p.token.logoURI,
    }));
    setDraftStrategy({ tokens: mappedTokens, config });
    setPhase('review');
    scrollTo(reviewRef);
  }, [dashboard, connected, publicKey, setWalletModalVisible, scrollTo]);

  const handleDeployComplete = () => {
    onDeployComplete?.();
  };

  // When builder step changes to 'identity' (hook-internal nav), reset and use our scroll-based nav instead
  useEffect(() => {
    if (dashboard.step === 'identity' && phase === 'building') {
      dashboard.setStep('builder');
      handleBuilderNext();
    }
  }, [dashboard.step, phase, handleBuilderNext, dashboard.setStep]);

  const isBuilderVisible = phase === 'building' || phase === 'identity' || phase === 'review';
  const isIdentityVisible = phase === 'identity' || phase === 'review';
  const isReviewVisible = phase === 'review';

  return (
    <div className="relative bg-[#050301] overflow-x-hidden">
      {/* ── Fixed 3D Background ───────────────────────────────────────────── */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Canvas
          camera={{ position: [0, 0, 5.0], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
        >
          <Scene />
        </Canvas>
        {/* Subtle vignette at bottom so text is readable */}
        <div
          className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(5,3,1,0.7), transparent)' }}
        />
      </div>

      {/* ── Registration Modal ────────────────────────────────────────────── */}
      <ProfileEditModal
        isOpen={showRegistration}
        onClose={() => setShowRegistration(false)}
        currentProfile={{ pubkey: publicKey?.toBase58() || '', username: undefined }}
        onUpdate={handleRegistrationComplete}
      />

      {/* ── Section 1: Hero ───────────────────────────────────────────────── */}
      <section className="relative z-10 min-h-[100dvh] flex flex-col items-center justify-between px-6 py-12 md:py-20">
        <div className="flex-1" />

        {/* Hero text */}
        <div className="text-center space-y-5 max-w-2xl mx-auto backdrop-blur-sm p-8 rounded-3xl">
          <motion.h1
            initial={{ opacity: 0, scale: 0.93 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="font-black leading-[0.95] tracking-tighter text-white"
            style={{ fontSize: 'clamp(3.5rem, 9vw, 7rem)' }}
          >
            Your Idea.
            <br />
            <span className="gradient-text">Your ETF.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.5 }}
            className="font-medium leading-relaxed max-w-sm mx-auto pt-2"
            style={{ fontSize: 'clamp(0.92rem, 2.2vw, 1.1rem)', color: 'rgba(232,194,138,0.6)' }}
          >
            Build, manage, and scale your on-chain index fund in seconds.
          </motion.p>
        </div>

        <div className="flex-1 min-h-[6vh]" />

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.72, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-xs mx-auto"
        >
          <button
            onClick={handleStartCreate}
            disabled={checkingRegistration}
            className="group relative w-full transition-all duration-200 active:scale-[0.97] disabled:opacity-55"
          >
            <div
              className="absolute -inset-2 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse, rgba(199,125,54,0.30) 0%, transparent 70%)' }}
            />
            <div
              className="absolute inset-0 rounded-2xl transition-transform duration-200 group-active:translate-y-[2px]"
              style={{ transform: 'translateY(6px)', background: '#4A230F', boxShadow: '0 16px 36px rgba(0,0,0,0.75)' }}
            />
            <div
              className="relative flex items-center justify-center gap-3 overflow-hidden rounded-2xl px-8 py-5 border transition-transform duration-200 group-hover:-translate-y-[3px] group-active:translate-y-[2px]"
              style={{
                background: 'var(--gold-button, #c9a84c)',
                borderColor: 'rgba(244,223,190,0.22)',
                boxShadow: 'inset 0 1.5px 0 rgba(244,223,190,0.45), inset 0 -1px 0 rgba(20,8,2,0.45)',
              }}
            >
              <span
                className="relative z-10 flex items-center gap-3 font-black text-xl tracking-tight select-none"
                style={{ color: '#1A0A04' }}
              >
                {checkingRegistration ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    Create Your ETF
                    <span
                      className="flex items-center justify-center w-7 h-7 rounded-full shrink-0"
                      style={{ background: 'rgba(26,10,4,0.80)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.55)' }}
                    >
                      <Plus strokeWidth={4} size={18} style={{ color: '#E8C28A' }} />
                    </span>
                  </>
                )}
              </span>
            </div>
          </button>
        </motion.div>

        {/* Scroll hint — visible when builder is active */}
        <AnimatePresence>
          {isBuilderVisible && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-8 flex flex-col items-center gap-1 text-amber-600/50 cursor-pointer"
              onClick={() => scrollTo(builderRef)}
            >
              <span className="text-xs font-medium uppercase tracking-widest">Build below</span>
              <ChevronDown size={18} className="animate-bounce" />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="h-10 safe-area-bottom" />
      </section>

      {/* ── Section 2: Token Builder ──────────────────────────────────────── */}
      <AnimatePresence>
        {isBuilderVisible && (
          <motion.div
            ref={builderRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <GlassSection className="h-[100dvh]" innerClassName="h-full flex flex-col">
              {/* Section label */}
              <div className="flex-none px-4 pt-4 pb-2 border-b border-white/5">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-900/20 border border-amber-800/20 text-amber-600 text-xs font-medium uppercase tracking-wider">
                    Step 1 · Select Tokens
                  </div>
                  <div className="text-xs text-white/30">
                    {dashboard.portfolio.length} asset{dashboard.portfolio.length !== 1 ? 's' : ''} · {dashboard.totalWeight}%
                  </div>
                </div>
              </div>

              {/* Builder content */}
              <div className="flex-1 min-h-0 flex flex-col">
                {isMobile ? (
                  <MobileBuilder
                    dashboard={{
                      ...dashboard,
                      // Override handleToIdentity to use our scroll-based nav
                      handleToIdentity: handleBuilderNext,
                    }}
                    preferences={preferences}
                    onBack={() => {
                      setPhase('hero');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    inline
                  />
                ) : (
                  <DesktopBuilder
                    dashboard={{
                      ...dashboard,
                      handleToIdentity: handleBuilderNext,
                    }}
                    preferences={preferences}
                    onBack={() => {
                      setPhase('hero');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                )}
              </div>

              {/* Scroll hint */}
              <AnimatePresence>
                {isIdentityVisible && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex-none flex justify-center py-3 border-t border-white/5 cursor-pointer"
                    onClick={() => scrollTo(identityRef)}
                  >
                    <span className="text-xs text-amber-600/60 flex items-center gap-1.5">
                      <ChevronDown size={14} className="animate-bounce" /> Continue to Identity
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassSection>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Section 3: Identity ───────────────────────────────────────────── */}
      <AnimatePresence>
        {isIdentityVisible && (
          <motion.div
            ref={identityRef}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <GlassSection>
              {/* Section label */}
              <div className="px-4 pt-4 pb-0">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-900/20 border border-amber-800/20 text-amber-600 text-xs font-medium uppercase tracking-wider">
                  Step 2 · Name Your ETF
                </div>
              </div>
              <InlineIdentityStep
                config={dashboard.config}
                setConfig={dashboard.setConfig}
                focusedField={dashboard.focusedField}
                setFocusedField={dashboard.setFocusedField}
                portfolioCount={dashboard.portfolio.length}
                connected={connected}
                onDeploy={handleIdentityNext}
                onGenerateRandomTicker={dashboard.generateRandomTicker}
              />

              {/* Scroll hint */}
              <AnimatePresence>
                {isReviewVisible && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex justify-center pb-6 cursor-pointer"
                    onClick={() => scrollTo(reviewRef)}
                  >
                    <span className="text-xs text-amber-600/60 flex items-center gap-1.5">
                      <ChevronDown size={14} className="animate-bounce" /> Continue to Review
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassSection>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Section 4: Review & Deploy ────────────────────────────────────── */}
      <AnimatePresence>
        {isReviewVisible && draftStrategy && (
          <motion.div
            ref={reviewRef}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <GlassSection innerClassName="px-4 pt-6 pb-28">
              {/* Section label */}
              <div className="mb-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-900/20 border border-amber-800/20 text-amber-600 text-xs font-medium uppercase tracking-wider">
                  Step 3 · Review & Deploy
                </div>
              </div>
              <DeploymentBlueprint
                strategyName={draftStrategy.config.name || 'Untitled'}
                strategyType="BALANCED"
                tokens={draftStrategy.tokens || []}
                description={draftStrategy.config.description || ''}
                info={{ symbol: draftStrategy.config.ticker || 'ETF' }}
                initialTvl={1.0}
                onBack={() => {
                  setPhase('identity');
                  scrollTo(identityRef);
                }}
                onComplete={handleDeployComplete}
              />
            </GlassSection>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom spacer */}
      <div className="relative z-10 h-16 safe-area-bottom" />
    </div>
  );
};
