import { useState, useRef, useEffect } from 'react';

const FALLBACK_IMAGE =
  'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';

export const TokenImage = ({
  src,
  alt = '',
  className,
}: {
  src?: string;
  alt?: string;
  className?: string;
}) => {
  const [imgSrc, setImgSrc] = useState(src || FALLBACK_IMAGE);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // キャッシュ済み画像は onLoad が発火しないため、直接 complete を確認する
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  return (
    <img
      ref={imgRef}
      src={imgSrc}
      alt={alt}
      className={className}
      style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.2s ease' }}
      onLoad={() => setLoaded(true)}
      onError={() => { setImgSrc(FALLBACK_IMAGE); setLoaded(true); }}
      loading="lazy"
    />
  );
};
