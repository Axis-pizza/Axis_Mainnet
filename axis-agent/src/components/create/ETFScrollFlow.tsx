import { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  Fingerprint,
  Type,
  FileText,
  RefreshCw,
  Sparkles,
  Check,
} from 'lucide-react';
import { useWallet, useLoginModal } from '../../hooks/useWallet';
import { useManualDashboard } from '../../hooks/useManualDashboard';
import { useTokenPreferences } from '../../hooks/useTokenPreferences';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MobileBuilder, DesktopBuilder } from './manual/Builder';
import { DeploymentBlueprint } from './DeploymentBlueprint';

// ─────────────────────────────────────────────────────────────────────────────
// 3D Background (reused from CreateLanding)
// ─────────────────────────────────────────────────────────────────────────────
const TOKENS = ['SOL', 'BTC', 'ETH', 'USDC', 'JUP', 'AXIS'];
const TOKENS_MOBILE = ['SOL', 'BTC', 'ETH'];
const COINS_PER_TOKEN = 50;
const COINS_PER_TOKEN_MOBILE = 15;
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

function TokenSwarm({ symbol, count = COINS_PER_TOKEN }: { symbol: string; count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useRef(new THREE.Object3D()).current;
  const { geometry, materials, motionData } = useRef((() => {
    const geo = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 32);
    geo.rotateX(Math.PI / 2);
    const faceTex = createCoinTexture(symbol);
    const sideMat = new THREE.MeshStandardMaterial({ color: GOLD_CORE, metalness: 1.0, roughness: 0.3 });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, metalness: 0.8, roughness: 0.4 });
    const data = Array.from({ length: count }, () => ({
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

  return <instancedMesh ref={meshRef} args={[geometry, materials, count]} castShadow receiveShadow />;
}

function SweepLight() {
  const lightRef = useRef<THREE.PointLight>(null!);
  useFrame(({ clock }) => {
    if (!lightRef.current) return;
    const t = clock.getElapsedTime();
    lightRef.current.position.x = Math.sin(t * 0.4) * 5;
    lightRef.current.position.y = Math.cos(t * 0.6) * 1.5 + 1.0;
    lightRef.current.intensity = 3.0;
  });
  return <pointLight ref={lightRef} position={[0, 0, 2]} color="#FFE4B8" distance={10} decay={1.5} />;
}

function Scene({ mobile }: { mobile: boolean }) {
  const tokens = mobile ? TOKENS_MOBILE : TOKENS;
  const coinCount = mobile ? COINS_PER_TOKEN_MOBILE : COINS_PER_TOKEN;
  return (
    <>
      <ambientLight intensity={0.15} color="#C8D4E0" />
      <directionalLight position={[4, 5, 4]} intensity={1.5} color="#C77D36" castShadow />
      <SweepLight />
      {tokens.map((token) => (
        <TokenSwarm key={token} symbol={token} count={coinCount} />
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
        className={`mx-4 md:mx-8 border border-white/[0.08] rounded-2xl overflow-hidden ${innerClassName}`}
        style={{ background: 'rgba(6, 4, 2, 0.88)' }}
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
  onConnectDirect,
  isDirectAvailable,
  isDirectConnecting,
}: {
  config: { name: string; ticker: string; description: string };
  setConfig: React.Dispatch<React.SetStateAction<{ name: string; ticker: string; description: string }>>;
  focusedField: 'ticker' | 'name' | 'desc' | null;
  setFocusedField: (f: 'ticker' | 'name' | 'desc' | null) => void;
  portfolioCount: number;
  connected: boolean;
  onDeploy: () => void;
  onGenerateRandomTicker: () => void;
  onConnectDirect?: () => void;
  isDirectAvailable?: boolean;
  isDirectConnecting?: boolean;
}) {
  return (
    <div className="max-w-md mx-auto px-5 py-10 space-y-6">
      {/* Section header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-900/20 border border-amber-800/20 text-amber-600 text-sm font-normal uppercase tracking-wider mb-3">
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
          className={`flex items-center gap-2 mb-3 text-xs font-normal uppercase tracking-wider ${focusedField === 'ticker' ? 'text-amber-600' : 'text-white/30'}`}
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
          <motion.button
            whileHover={{ scale: 1.1, backgroundColor: 'rgba(180,120,40,0.2)' }}
            whileTap={{ scale: 0.9, rotate: 180 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            onClick={(e) => { e.stopPropagation(); onGenerateRandomTicker(); }}
            className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-white/30 hover:text-amber-500 transition-colors"
          >
            <RefreshCw size={22} />
          </motion.button>
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
          className={`flex items-center gap-2 mb-3 text-xs font-normal uppercase tracking-wider ${focusedField === 'name' ? 'text-amber-600' : 'text-white/30'}`}
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
          className={`flex items-center gap-2 mb-3 text-xs font-normal uppercase tracking-wider ${focusedField === 'desc' ? 'text-amber-600' : 'text-white/30'}`}
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
          <div className="text-xs text-amber-700/50 uppercase font-normal">Fee</div>
          <div className="text-2xl text-amber-500 mt-1" style={{ fontFamily: '"Times New Roman", serif' }}>
            0.3%
          </div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0a0a0a] to-amber-950/20 p-5 rounded-2xl border border-amber-900/20">
          <div className="text-xs text-amber-700/50 uppercase font-normal">Assets</div>
          <div className="text-2xl text-white mt-1" style={{ fontFamily: '"Times New Roman", serif' }}>
            {portfolioCount}
          </div>
        </div>
      </div>

      {/* Deploy Button */}
      <div className="pt-2 pb-4">
        <motion.button
          whileHover={!config.ticker || !config.name ? {} : { scale: 1.01, boxShadow: '0 0 24px rgba(201,168,76,0.35)' }}
          whileTap={!config.ticker || !config.name ? {} : { scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          onClick={onDeploy}
          disabled={!config.ticker || !config.name}
          className={`w-full py-5 rounded-2xl font-normal text-xl flex items-center justify-center gap-3 shadow-2xl ${
            !config.ticker || !config.name
              ? 'bg-[#222] text-white/20 cursor-not-allowed'
              : 'bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700 text-black'
          }`}
        >
          {connected ? (
            <>
              Review Basket <Check size={22} />
            </>
          ) : (
            'Connect Wallet'
          )}
        </motion.button>
        {!connected && isDirectAvailable && onConnectDirect && (
          <button
            type="button"
            onClick={onConnectDirect}
            disabled={isDirectConnecting}
            className="mt-3 w-full text-center text-[11px] tracking-wider text-amber-600/60 hover:text-amber-500 transition-colors py-2 disabled:opacity-50"
          >
            {isDirectConnecting ? 'connecting Phantom…' : 'Privy not loading? → Connect Phantom directly'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ETFScrollFlow — Main component
// ─────────────────────────────────────────────────────────────────────────────

export interface ETFScrollFlowProps {
  onDeployComplete?: (strategyId?: string) => void;
}

export const ETFScrollFlow = ({ onDeployComplete }: ETFScrollFlowProps) => {
  const { publicKey, connected } = useWallet();
  const {
    setVisible: setWalletModalVisible,
    connectDirect,
    isDirectAvailable,
    isDirectConnecting,
  } = useLoginModal();
  const isMobile = useIsMobile();
  const preferences = useTokenPreferences();

  // Section refs for smooth-scroll navigation
  const builderRef = useRef<HTMLDivElement>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  // Builder state (shared hook)
  const dashboard = useManualDashboard({
    onDeploySuccess: () => {},
    verifiedOnly: preferences.verifiedOnly,
  });

  const scrollTo = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Builder "Next Step" → scroll to identity
  const handleBuilderNext = useCallback(() => {
    scrollTo(identityRef);
  }, [scrollTo]);

  // Identity "Review ETF" → scroll to review
  const handleIdentityNext = useCallback(() => {
    const { config } = dashboard;
    if (!config.ticker || !config.name) return;
    if (!connected || !publicKey) {
      setWalletModalVisible(true);
      return;
    }
    scrollTo(reviewRef);
  }, [dashboard, connected, publicKey, setWalletModalVisible, scrollTo]);

  const handleDeployComplete = (strategyId?: string) => {
    onDeployComplete?.(strategyId);
  };

  // When builder hook internally tries to go to 'identity', redirect to our scroll nav
  useEffect(() => {
    if (dashboard.step === 'identity') {
      dashboard.setStep('builder');
      handleBuilderNext();
    }
  }, [dashboard.step, handleBuilderNext, dashboard.setStep]);

  // Derive live review data from current dashboard state
  const reviewTokens = dashboard.portfolio.map((p) => ({
    symbol: p.token.symbol,
    weight: p.weight,
    mint: p.token.address,
    logoURI: p.token.logoURI,
  }));

  return (
    <div className="relative bg-[#050301] overflow-x-hidden">
      {/* ── Fixed 3D Background ───────────────────────────────────────────── */}
      <div className="fixed inset-0 z-0 pointer-events-none" style={{ background: '#050301' }}>
        <Canvas
          camera={{ position: [0, 0, 5.0], fov: 45 }}
          gl={{ antialias: !isMobile, alpha: false }}
          dpr={isMobile ? 1 : [1, 1.5]}
          resize={{ debounce: 300 }}
        >
          <Scene mobile={isMobile} />
        </Canvas>
        {/* Subtle vignette at bottom so text is readable */}
        <div
          className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(5,3,1,0.7), transparent)' }}
        />
      </div>

      {/* ── Section 1: Hero ───────────────────────────────────────────────── */}
      <section className="relative z-10 min-h-[100dvh] flex flex-col items-center justify-center px-6">
        {/* Hero text */}
        <div className="text-center max-w-2xl mx-auto">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="font-normal leading-[0.9] tracking-tighter text-white"
            style={{ fontSize: 'clamp(4rem, 10vw, 8rem)' }}
          >
            Your narrative.
            <br />
            <span className="gradient-text">Your Basket.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="font-normal leading-relaxed max-w-sm mx-auto mt-5"
            style={{ fontSize: 'clamp(0.95rem, 2.2vw, 1.1rem)', color: 'rgba(232,194,138,0.55)' }}
          >
            Build, manage, and scale your on-chain index fund in seconds.
          </motion.p>

          {/* Animated scroll invitation */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0, duration: 0.8 }}
            className="flex flex-col items-center gap-2 mt-12 cursor-pointer select-none"
            onClick={() => scrollTo(builderRef)}
          >
            <span className="text-[11px] font-normal uppercase tracking-[0.2em] text-amber-600/50">
              Scroll to build
            </span>
            <div className="flex flex-col items-center -space-y-2">
              {[0, 0.18, 0.36].map((delay, i) => (
                <motion.div
                  key={i}
                  animate={{ y: [0, 5, 0], opacity: [0.25, 0.7, 0.25] }}
                  transition={{ duration: 1.4, delay, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <ChevronDown size={18} className="text-amber-600/60" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Section 2: Token Builder ──────────────────────────────────────── */}
      <div ref={builderRef}>
        <GlassSection className="py-4" innerClassName="h-[calc(100dvh-2rem)] flex flex-col">
          {/* Section label */}
          <div className="flex-none px-4 pt-4 pb-2">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-900/20 border border-amber-800/20 text-amber-600 text-xs font-normal uppercase tracking-wider">
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
                dashboard={{ ...dashboard, handleToIdentity: handleBuilderNext }}
                preferences={preferences}
                onBack={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                inline
              />
            ) : (
              <DesktopBuilder
                dashboard={{ ...dashboard, handleToIdentity: handleBuilderNext }}
                preferences={preferences}
                onBack={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              />
            )}
          </div>
        </GlassSection>
      </div>

      {/* ── Section 3: Identity ───────────────────────────────────────────── */}
      <div ref={identityRef}>
        <GlassSection className="py-4">
          <InlineIdentityStep
            config={dashboard.config}
            setConfig={dashboard.setConfig}
            focusedField={dashboard.focusedField}
            setFocusedField={dashboard.setFocusedField}
            portfolioCount={dashboard.portfolio.length}
            connected={connected}
            onDeploy={handleIdentityNext}
            onGenerateRandomTicker={dashboard.generateRandomTicker}
            onConnectDirect={() => {
              void connectDirect().catch((e) => {
                console.warn('[axis] direct phantom connect failed', e);
              });
            }}
            isDirectAvailable={isDirectAvailable}
            isDirectConnecting={isDirectConnecting}
          />
        </GlassSection>
      </div>

      {/* ── Section 4: Review & Deploy ────────────────────────────────────── */}
      <div ref={reviewRef}>
        <GlassSection className="py-4" innerClassName="px-4 pt-6 pb-20">
          <DeploymentBlueprint
            strategyName={dashboard.config.name || 'Untitled'}
            strategyType="BALANCED"
            tokens={reviewTokens}
            description={dashboard.config.description || ''}
            info={{ symbol: dashboard.config.ticker || 'ETF' }}
            initialTvl={1.0}
            onBack={() => scrollTo(identityRef)}
            onComplete={handleDeployComplete}
            onDeploySuccess={(address) => handleDeployComplete(address)}
          />
        </GlassSection>
      </div>

      {/* Bottom spacer */}
      <div className="relative z-10 h-16 safe-area-bottom" />
    </div>
  );
};
