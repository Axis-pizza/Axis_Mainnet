import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

interface TutorialOverlayProps {
  onComplete: () => void;
  onConnectWallet: () => void;
}

const SLIDES = [
  {
    number: '01',
    badge: 'Welcome',
    headline: 'The First\nOn-Chain\nIndex Fund.',
    sub: 'Built on Solana.',
    accentHex: '#E8883A',
    videoSrc: '/1.mp4',
    bgColor: '#3d1a00',
  },
  {
    number: '02',
    badge: 'Discover',
    headline: 'Swipe to\nInvest.',
    sub: 'Browse community strategies like Tinder.',
    accentHex: '#3ABDE8',
    videoSrc: '/2.mp4',
    bgColor: '#00303d',
  },
  {
    number: '03',
    badge: 'Create',
    headline: 'Launch\nAny\nNarrative.',
    sub: 'Go live in seconds.',
    accentHex: '#A83AE8',
    videoSrc: '/3.mp4',
    bgColor: '#1f003d',
  },
  {
    number: '04',
    badge: 'The Axis Edge',
    headline: 'MEV\nLosses →\nYour Yield.',
    sub: '350 users. 1,700 ETFs live.',
    accentHex: '#3AE88A',
    videoSrc: '/4.mp4',
    bgColor: '#003d1a',
  },
] as const;

const SWIPE_THRESHOLD = 50;

export const TutorialOverlay = ({ onComplete, onConnectWallet }: TutorialOverlayProps) => {
  const [current, setCurrent] = useState(0);
  const [videoReady, setVideoReady] = useState<boolean[]>(SLIDES.map(() => false));
  const touchStartX = useRef<number | null>(null);

  const slide = SLIDES[current];
  const isLast = current === SLIDES.length - 1;

  const goNext = useCallback(() => {
    setCurrent((prev) => (prev < SLIDES.length - 1 ? prev + 1 : prev));
  }, []);

  const goPrev = useCallback(() => {
    setCurrent((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') onComplete();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, onComplete]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > SWIPE_THRESHOLD) {
      diff > 0 ? goNext() : goPrev();
    }
    touchStartX.current = null;
  };

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.clientX < window.innerWidth * 0.3) goPrev();
    else goNext();
  };

  return createPortal(
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000000,
        overflow: 'hidden',
        backgroundColor: slide.bgColor,
        transition: 'background-color 0.4s ease',
        fontFamily: "'DM Serif Display', Georgia, serif",
      }}
    >
      {/* Videos — all in DOM, opacity switch only */}
      {SLIDES.map((s, i) => (
        <video
          key={i}
          src={s.videoSrc}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          onPlaying={() =>
            setVideoReady((prev) => {
              const next = [...prev];
              next[i] = true;
              return next;
            })
          }
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: i === current && videoReady[i] ? 1 : 0,
            transition: 'opacity 0.6s ease',
          }}
        />
      ))}

      {/* Gradient overlay — テキスト可読性のため下部のみ暗く */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, transparent 0%, transparent 40%, rgba(0,0,0,0.7) 75%, rgba(0,0,0,0.92) 100%)',
        }}
      />

      {/* Progress bars */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          gap: 4,
          padding: '16px 16px 0',
          zIndex: 10,
        }}
      >
        {SLIDES.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 2,
              borderRadius: 100,
              backgroundColor: 'rgba(255,255,255,0.25)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 100,
                backgroundColor: 'rgba(255,255,255,0.9)',
                width: i < current ? '100%' : i === current ? '100%' : '0%',
                transition: i === current ? 'width 6s linear' : 'none',
              }}
            />
          </div>
        ))}
      </div>

      {/* Skip button */}
      <button
        onClick={onComplete}
        style={{
          position: 'absolute',
          top: 40,
          right: 16,
          zIndex: 20,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.6)',
          padding: '6px 12px',
          border: '0.5px solid rgba(255,255,255,0.2)',
          borderRadius: 100,
          background: 'rgba(0,0,0,0.3)',
          cursor: 'pointer',
        }}
      >
        Skip
      </button>

      {/* Tap zone */}
      <div
        onClick={handleTap}
        style={{ position: 'absolute', inset: 0, zIndex: 5 }}
      />

      {/* Main content — bottom left, NO Framer Motion */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '0 24px 112px',
          zIndex: 15,
          pointerEvents: 'none',
        }}
      >
        {/* Accent line */}
        <div
          style={{
            width: 40,
            height: 2,
            backgroundColor: slide.accentHex,
            marginBottom: 20,
            transition: 'background-color 0.4s ease',
          }}
        />

        {/* Badge */}
        <span
          style={{
            display: 'block',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: slide.accentHex,
            marginBottom: 12,
            transition: 'color 0.4s ease',
          }}
        >
          {slide.number} — {slide.badge}
        </span>

        {/* Headline */}
        <h1
          style={{
            fontSize: 'clamp(52px, 14vw, 88px)',
            fontWeight: 400,
            lineHeight: 0.92,
            letterSpacing: '-0.02em',
            color: '#FFFFFF',
            marginBottom: 20,
            whiteSpace: 'pre-line',
          }}
        >
          {slide.headline}
        </h1>

        {/* Sub */}
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 15,
            fontWeight: 300,
            color: 'rgba(255,255,255,0.6)',
            marginBottom: isLast ? 32 : 0,
          }}
        >
          {slide.sub}
        </p>

        {/* CTA (last slide) */}
        {isLast && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, pointerEvents: 'auto' }}>
            <button
              onClick={onComplete}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: 500,
                color: '#000',
                background: '#fff',
                border: 'none',
                borderRadius: 100,
                padding: '16px 32px',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Enter Axis →
            </button>
            <button
              onClick={() => { onConnectWallet(); onComplete(); }}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                color: 'rgba(255,255,255,0.45)',
                background: 'transparent',
                border: 'none',
                padding: 10,
                cursor: 'pointer',
              }}
            >
              Connect Wallet
            </button>
          </div>
        )}
      </div>

      {/* Dot nav */}
      <div
        style={{
          position: 'absolute',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 12,
          zIndex: 20,
        }}
      >
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
            style={{
              width: i === current ? 20 : 5,
              height: 5,
              borderRadius: 100,
              backgroundColor: i === current ? '#fff' : 'rgba(255,255,255,0.25)',
              transition: 'all 0.4s ease',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
    </div>,
    document.body
  );
};
