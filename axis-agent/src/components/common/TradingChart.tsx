import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, BarChart3, LineChart, CandlestickChart, Loader2 } from 'lucide-react';

// ---------- Types ----------
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

type Timeframe  = '1D' | '5D' | '1M' | '1Y' | 'ALL';
type ChartType  = 'line' | 'candle';
type PriceMode  = 'PRICE' | 'MCAP';

interface TradingChartProps {
  label?: string;
  ticker?: string;
  seed?: number;
  height?: number;
  endpoint?: string;
  totalSupply?: number;
  ath?: number;
}

const TIMEFRAME_PARAMS: Record<Timeframe, { period: string; interval: string }> = {
  '1D':  { period: '1d',   interval: '30m' },
  '5D':  { period: '5d',   interval: '1h'  },
  '1M':  { period: '30d',  interval: '4h'  },
  '1Y':  { period: '365d', interval: '1d'  },
  'ALL': { period: '730d', interval: '1d'  },
};

// ---------- Component ----------
export function TradingChart({
  label = 'CHART',
  ticker,
  seed = 42,
  height = 420,
  endpoint,
  totalSupply,
  ath,
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | null>(null);
  const volumeRef    = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [timeframe,  setTimeframe]  = useState<Timeframe>('1M');
  const [chartType,  setChartType]  = useState<ChartType>('candle');
  const [priceMode,  setPriceMode]  = useState<PriceMode>('PRICE');
  const [candles,    setCandles]    = useState<Candle[]>([]);
  const [hovered,    setHovered]    = useState<Candle | null>(null);
  const [isLoading,  setIsLoading]  = useState(true);
  // Why: when an endpoint is provided (real strategy view) but the backend has
  // no NAV snapshots yet, falling back to a seeded random walk silently
  // misled users into thinking the candles were real. Track empty separately
  // and render a "Building history" empty state instead.
  const [isEmpty,    setIsEmpty]    = useState(false);

  // --- Data load ---
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        if (endpoint) {
          const { period, interval } = TIMEFRAME_PARAMS[timeframe];
          const res  = await fetch(`${endpoint}?period=${period}&interval=${interval}`);
          const json = (await res.json()) as { success?: boolean; data?: Candle[] };
          if (!cancelled) {
            if (json.success && Array.isArray(json.data) && json.data.length > 0) {
              setCandles(json.data);
              setIsEmpty(false);
            } else {
              setCandles([]);
              setIsEmpty(true);
            }
          }
        } else if (!cancelled) {
          // Demo / preview surfaces (no endpoint provided) keep the synthetic
          // candles so design tooling and SwipeDiscoverView still render a chart.
          setCandles(generateSyntheticCandles(seed, timeframe));
          setIsEmpty(false);
        }
      } catch {
        if (!cancelled) {
          setCandles([]);
          setIsEmpty(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [endpoint, timeframe, seed]);

  // --- Chart init (rebuilds on chartType change) ---
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#78716C',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)', style: LineStyle.Solid },
        horzLines: { color: 'rgba(255,255,255,0.04)', style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.35)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1C1C1E' },
        horzLine: { color: 'rgba(255,255,255,0.35)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1C1C1E' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        textColor: '#9CA3AF',
        scaleMargins: { top: 0.08, bottom: chartType === 'candle' ? 0.2 : 0.06 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      width: containerRef.current.clientWidth,
      height,
    });

    chartRef.current = chart;

    if (chartType === 'candle') {
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#26A69A', downColor: '#EF5350',
        borderUpColor: '#26A69A', borderDownColor: '#EF5350',
        wickUpColor: '#26A69A', wickDownColor: '#EF5350',
        priceLineStyle: LineStyle.Dashed, priceLineWidth: 1,
      });
      seriesRef.current = candleSeries as any;

      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        color: 'rgba(255,255,255,0.15)',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      volumeRef.current = volumeSeries;

      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData.size) { setHovered(null); return; }
        const data = param.seriesData.get(candleSeries);
        if (data && 'open' in data) {
          setHovered({
            time:  Number(param.time),
            open:  (data as any).open,
            high:  (data as any).high,
            low:   (data as any).low,
            close: (data as any).close,
          });
        }
      });
    } else {
      const accentColor = '#26A69A';
      const areaSeries = chart.addAreaSeries({
        lineColor: accentColor,
        topColor:  accentColor + '30',
        bottomColor: 'rgba(0,0,0,0)',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: accentColor,
        crosshairMarkerBackgroundColor: '#0e0e0e',
        priceLineVisible: false,
        lastValueVisible: true,
      });
      seriesRef.current = areaSeries as any;
      volumeRef.current = null;

      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData.size) { setHovered(null); return; }
        const data = param.seriesData.get(areaSeries);
        if (data && 'value' in data) {
          const v = (data as any).value as number;
          setHovered({ time: Number(param.time), open: v, high: v, low: v, close: v });
        }
      });
    }

    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      if (chartRef.current && el) chartRef.current.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
    };
  }, [height, chartType]);

  // --- Apply data ---
  const multiplier = useMemo(() => {
    if (priceMode === 'MCAP' && totalSupply) return totalSupply;
    return 1;
  }, [priceMode, totalSupply]);

  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    if (chartType === 'candle') {
      const candleData = candles.map((c) => ({
        time:  c.time as UTCTimestamp,
        open:  c.open  * multiplier,
        high:  c.high  * multiplier,
        low:   c.low   * multiplier,
        close: c.close * multiplier,
      }));
      (seriesRef.current as ISeriesApi<'Candlestick'>).setData(candleData);

      if (volumeRef.current) {
        volumeRef.current.setData(candles.map((c) => ({
          time:  c.time as UTCTimestamp,
          value: c.volume ?? 0,
          color: c.close >= c.open ? 'rgba(38,166,154,0.4)' : 'rgba(239,83,80,0.4)',
        })));
      }
    } else {
      const lineData = candles.map((c) => ({
        time:  c.time as UTCTimestamp,
        value: c.close * multiplier,
      }));
      (seriesRef.current as ISeriesApi<'Area'>).setData(lineData);
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, multiplier, chartType]);

  // --- Derived stats ---
  const latest    = candles[candles.length - 1];
  const first     = candles[0];
  const changePct = latest && first && first.close !== 0
    ? ((latest.close - first.close) / first.close) * 100 : 0;
  const isUp      = changePct >= 0;
  const athProgress = ath && latest ? Math.min(100, (latest.close / ath) * 100) : 0;

  const headerValue = useMemo(() => {
    if (!latest) return '—';
    const v = latest.close * multiplier;
    if (priceMode === 'MCAP') return formatCompact(v);
    if (v >= 1000) return formatCompact(v);
    return v < 0.01 ? v.toFixed(6) : v < 1 ? v.toFixed(4) : v.toFixed(2);
  }, [latest, multiplier, priceMode]);

  const displayRow = hovered ?? latest ?? null;

  return (
    <div className="bg-black border border-white/5 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3 gap-4">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#57534E]">
            {priceMode === 'PRICE' ? 'Price' : 'Market Cap'}
          </span>
          <span className="text-3xl sm:text-4xl font-serif tracking-tight text-white">
            ${headerValue}
          </span>
          {latest ? (
            <div className={`flex items-center gap-1 text-xs ${isUp ? 'text-[#26A69A]' : 'text-[#EF5350]'}`}>
              {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isUp ? '+' : ''}{changePct.toFixed(2)}%
              <span className="text-[#57534E] ml-1 uppercase tracking-wider text-[10px]">{timeframe}</span>
            </div>
          ) : (
            <div className="text-[10px] uppercase tracking-wider text-[#57534E]">
              {timeframe} · awaiting first snapshot
            </div>
          )}
        </div>

        {ath && latest && (
          <div className="flex flex-col items-end gap-1.5 pt-1 shrink-0">
            <div className="w-24 sm:w-36 h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${athProgress}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-[#8A6630] via-[#B8863F] to-[#D4A261] rounded-full"
              />
            </div>
            <div className="text-[10px] text-[#57534E]">
              ATH <span className="text-white/80 font-mono">${formatCompact(ath * multiplier)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-2 border-y border-[rgba(184,134,63,0.06)] text-[11px]">
        <div className="flex items-center gap-2 text-[#78716C]">
          <span className="text-white font-normal">{timeframe}</span>
          <BarChart3 className="w-3.5 h-3.5" />
        </div>
        <div className="w-px h-3 bg-[rgba(184,134,63,0.1)]" />

        {/* Line / Candle toggle */}
        <div className="flex items-center rounded-md overflow-hidden border border-white/8" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <button
            onClick={() => setChartType('line')}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] transition-all ${chartType === 'line' ? 'bg-[rgba(184,134,63,0.2)] text-[#B8863F]' : 'text-[#57534E] hover:text-white/60'}`}
          >
            <LineChart className="w-3 h-3" />
            Line
          </button>
          <button
            onClick={() => setChartType('candle')}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] border-l border-white/8 transition-all ${chartType === 'candle' ? 'bg-[rgba(184,134,63,0.2)] text-[#B8863F]' : 'text-[#57534E] hover:text-white/60'}`}
          >
            <CandlestickChart className="w-3 h-3" />
            Candle
          </button>
        </div>

        {totalSupply && (
          <>
            <div className="w-px h-3 bg-[rgba(184,134,63,0.1)]" />
            <button
              onClick={() => setPriceMode((m) => (m === 'PRICE' ? 'MCAP' : 'PRICE'))}
              className="uppercase tracking-wider transition-colors"
            >
              <span className={priceMode === 'PRICE' ? 'text-[#B8863F]' : 'text-[#78716C]'}>Price</span>
              <span className="mx-1 text-[#57534E]">/</span>
              <span className={priceMode === 'MCAP' ? 'text-[#B8863F]' : 'text-[#78716C]'}>MCap</span>
            </button>
          </>
        )}
      </div>

      {/* Chart + OHLC overlay */}
      <div className="relative">
        <AnimatePresence>
          {displayRow && !isLoading && chartType === 'candle' && (
            <motion.div
              key="ohlc"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-3 left-5 z-10 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-mono pointer-events-none"
            >
              <span className="text-white/60 font-normal">{(ticker ?? label)?.toUpperCase()}</span>
              <span className="text-[#57534E]">·</span>
              <div className="flex items-center gap-1.5">
                <OHLCLabel label="O" value={displayRow.open  * multiplier} priceMode={priceMode} />
                <OHLCLabel label="H" value={displayRow.high  * multiplier} priceMode={priceMode} />
                <OHLCLabel label="L" value={displayRow.low   * multiplier} priceMode={priceMode} />
                <OHLCLabel label="C" value={displayRow.close * multiplier} priceMode={priceMode} up={displayRow.close >= displayRow.open} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={containerRef} style={{ height }} className="w-full" />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#B8863F]" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#78716C]">Loading chart</span>
            </div>
          </div>
        )}
        {!isLoading && isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-[1px] text-center px-6">
            <BarChart3 className="w-5 h-5 text-[#57534E]" />
            <span className="text-[11px] uppercase tracking-[0.2em] text-[#78716C]">
              Building chart history
            </span>
            <span className="text-[10px] text-[#57534E] max-w-xs">
              No NAV snapshots recorded yet. The cron logs the first candle on the next 5-minute tick.
            </span>
          </div>
        )}
      </div>

      {/* Footer: timeframe tabs */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-[rgba(184,134,63,0.06)]">
        <div className="flex gap-1">
          {(['1D', '5D', '1M', '1Y', 'ALL'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider transition-all ${
                timeframe === tf
                  ? 'bg-[rgba(184,134,63,0.15)] text-[#B8863F]'
                  : 'text-[#57534E] hover:text-white/80'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-[#57534E] font-mono">
          <span>{new Date().toISOString().slice(11, 19)} UTC</span>
          <span className="text-[#B8863F]">auto</span>
        </div>
      </div>
    </div>
  );
}

// ---------- Sub-components ----------
function OHLCLabel({ label, value, up, priceMode }: { label: string; value: number; up?: boolean; priceMode: PriceMode }) {
  const color = up === undefined ? 'text-[#A8A29E]' : up ? 'text-[#26A69A]' : 'text-[#EF5350]';
  const display = priceMode === 'MCAP' || value >= 1000
    ? formatCompact(value)
    : value < 0.01 ? value.toFixed(6) : value < 1 ? value.toFixed(4) : value.toFixed(2);
  return (
    <span className="flex items-baseline gap-0.5">
      <span className="text-[#57534E]">{label}</span>
      <span className={color}>{display}</span>
    </span>
  );
}

// ---------- Helpers ----------
function formatCompact(v: number): string {
  if (!isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000)     return `${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)         return `${(v / 1_000).toFixed(1)}K`;
  if (abs >= 1)             return v.toFixed(2);
  return v.toFixed(4);
}

function generateSyntheticCandles(seed: number, timeframe: Timeframe): Candle[] {
  const config: Record<Timeframe, { points: number; interval: number }> = {
    '1D':  { points: 96,  interval: 900   },
    '5D':  { points: 120, interval: 3600  },
    '1M':  { points: 90,  interval: 86400 },
    '1Y':  { points: 365, interval: 86400 },
    'ALL': { points: 500, interval: 86400 },
  };
  const { points, interval } = config[timeframe];
  let price = 80 + (seed % 120);
  const now = Math.floor(Date.now() / 1000);
  const candles: Candle[] = [];
  let random = Math.max(1, seed);
  const rnd = () => { random = (random * 9301 + 49297) % 233280; return random / 233280; };
  for (let i = points; i > 0; i--) {
    const time = now - i * interval;
    const drift = (rnd() - 0.48) * price * (0.015 + rnd() * 0.035);
    const open  = price;
    const close = Math.max(0.5, price + drift);
    const high  = Math.max(open, close) + rnd() * price * 0.01;
    const low   = Math.min(open, close) - rnd() * price * 0.01;
    candles.push({ time, open, high, low: Math.max(0.1, low), close, volume: 500 + rnd() * 5000 });
    price = close;
  }
  return candles;
}
