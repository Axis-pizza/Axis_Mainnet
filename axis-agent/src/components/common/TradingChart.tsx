/**
 * TradingChart — pump.fun-style embedded chart
 *
 * - Line mode  : lightweight-charts AreaSeries  (NAV / price index)
 * - Candle mode: lightweight-charts CandlestickSeries + volume histogram
 * - Mock data by default; wire up `endpoint` prop to fetch real OHLCV data
 *
 * Endpoint contract (when provided):
 *   GET  {endpoint}?interval={1h|4h|1d|1w}&limit=200
 *   Response: { success: true, data: OhlcvBar[] }
 *   OhlcvBar: { time: number, open: number, high: number, low: number, close: number, volume?: number }
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  LineStyle,
} from 'lightweight-charts';
import { TrendingUp, TrendingDown, BarChart2, LineChart } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OhlcvBar {
  time: number;   // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

type ChartType = 'line' | 'candle';
type Interval  = '1h' | '4h' | '1d' | '1w';

const INTERVALS: Interval[] = ['1h', '4h', '1d', '1w'];
const INTERVAL_LABELS: Record<Interval, string> = { '1h': '1H', '4h': '4H', '1d': '1D', '1w': '1W' };

interface TradingChartProps {
  /** Strategy / token identifier shown as title fallback */
  label?: string;
  /** Optional real-data endpoint. If omitted, mock data is shown */
  endpoint?: string;
  /** Override seed for deterministic mock curves */
  seed?: number;
  /** Chart height in px */
  height?: number;
  /** Whether the chart is in a compact context (less padding) */
  compact?: boolean;
}

// ─── Mock data generator ─────────────────────────────────────────────────────

function generateMockBars(interval: Interval, n: number, seed: number): OhlcvBar[] {
  const now    = Math.floor(Date.now() / 1000);
  const stride: Record<Interval, number> = { '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 };
  const step   = stride[interval];
  const bars: OhlcvBar[] = [];

  let price = 80 + seed * 0.7;
  for (let i = n - 1; i >= 0; i--) {
    const o = price;
    const move = (Math.random() - 0.47) * price * 0.028;
    price = Math.max(price + move, 1);
    const hi  = Math.max(o, price) * (1 + Math.random() * 0.012);
    const lo  = Math.min(o, price) * (1 - Math.random() * 0.012);
    bars.push({
      time:   now - i * step,
      open:   o,
      high:   hi,
      low:    lo,
      close:  price,
      volume: 10000 + Math.random() * 90000,
    });
  }
  return bars;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const TradingChart = ({
  label,
  endpoint,
  seed = 42,
  height = 320,
  compact = false,
}: TradingChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<'Area'> | ISeriesApi<'Candlestick'> | null>(null);

  const [chartType, setChartType] = useState<ChartType>('line');
  const [interval,  setInterval]  = useState<Interval>('1d');
  const [bars,      setBars]      = useState<OhlcvBar[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMock,    setIsMock]    = useState(true);

  // ── Fetch or generate data ───────────────────────────────────────────────
  const loadData = useCallback(async (iv: Interval) => {
    setIsLoading(true);
    try {
      if (endpoint) {
        const url = `${endpoint}?interval=${iv}&limit=200`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          const data: OhlcvBar[] = json?.data ?? json;
          if (Array.isArray(data) && data.length > 0) {
            setBars(data.sort((a, b) => a.time - b.time));
            setIsMock(false);
            return;
          }
        }
      }
    } catch { /* fall through to mock */ }

    // Fallback: mock
    const counts: Record<Interval, number> = { '1h': 168, '4h': 180, '1d': 180, '1w': 104 };
    setBars(generateMockBars(iv, counts[iv], seed));
    setIsMock(true);
  }, [endpoint, seed]);

  useEffect(() => { loadData(interval); }, [interval, loadData]);

  // ── Derived stats ────────────────────────────────────────────────────────
  const firstClose = bars[0]?.close ?? 0;
  const lastClose  = bars[bars.length - 1]?.close ?? 0;
  const changePct  = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;
  const isUp       = changePct >= 0;
  const accentColor = isUp ? '#34D399' : '#F87171';

  // ── Build / rebuild chart ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

    // Destroy previous instance
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    }

    const chart: IChartApi = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.35)',
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      width:  containerRef.current.clientWidth,
      height: height,
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          if (interval === '1h' || interval === '4h') {
            return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
          }
          return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        scaleMargins: { top: 0.08, bottom: 0.06 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.2)', labelBackgroundColor: '#1a1a1a' },
        horzLine: { color: 'rgba(255,255,255,0.2)', labelBackgroundColor: '#1a1a1a' },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale:  { mouseWheel: true, pinch: true },
    });

    chartRef.current = chart;

    // ── Price series ──────────────────────────────────────────────────────
    if (chartType === 'line') {
      const area = chart.addAreaSeries({
        lineColor:   accentColor,
        topColor:    accentColor + '30',
        bottomColor: 'rgba(0,0,0,0)',
        lineWidth:   2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius:  4,
        crosshairMarkerBorderColor: accentColor,
        crosshairMarkerBackgroundColor: '#0e0e0e',
        lastValueVisible: true,
        priceLineVisible: false,
      });
      const lineData = bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.close }));
      area.setData(lineData);
      seriesRef.current = area as any;
    } else {
      const candle = chart.addCandlestickSeries({
        upColor:          '#34D399',
        downColor:        '#F87171',
        borderUpColor:    '#34D399',
        borderDownColor:  '#F87171',
        wickUpColor:      'rgba(52,211,153,0.6)',
        wickDownColor:    'rgba(248,113,113,0.6)',
        priceLineVisible: false,
        lastValueVisible: true,
      });
      const candleData = bars.map((b) => ({
        time:  b.time as UTCTimestamp,
        open:  b.open,
        high:  b.high,
        low:   b.low,
        close: b.close,
      }));
      candle.setData(candleData);
      seriesRef.current = candle as any;
    }

    chart.timeScale().fitContent();

    // ResizeObserver
    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, [bars, chartType, height, compact, accentColor, interval]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full flex flex-col select-none">
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between ${compact ? 'mb-1.5' : 'mb-3'}`}>
        {/* Left: timeframe tabs */}
        <div className="flex items-center gap-0.5">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className={`rounded-md font-mono transition-all duration-150 ${
                compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2.5 py-1'
              } ${
                interval === iv
                  ? 'bg-white/12 text-white'
                  : 'text-white/30 hover:text-white/60 hover:bg-white/5'
              }`}
            >
              {INTERVAL_LABELS[iv]}
            </button>
          ))}
        </div>

        {/* Right: chart-type toggle + change badge */}
        <div className="flex items-center gap-2">
          {/* Line / Candle toggle */}
          <div
            className="flex items-center rounded-lg overflow-hidden border border-white/8"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <button
              onClick={() => setChartType('line')}
              className={`flex items-center gap-1 px-2 py-1 transition-all ${
                compact ? 'text-[9px]' : 'text-[10px]'
              } ${chartType === 'line' ? 'bg-white/12 text-white' : 'text-white/30 hover:text-white/60'}`}
            >
              <LineChart className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
              Line
            </button>
            <button
              onClick={() => setChartType('candle')}
              className={`flex items-center gap-1 px-2 py-1 transition-all border-l border-white/8 ${
                compact ? 'text-[9px]' : 'text-[10px]'
              } ${chartType === 'candle' ? 'bg-white/12 text-white' : 'text-white/30 hover:text-white/60'}`}
            >
              <BarChart2 className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
              Candle
            </button>
          </div>

          {/* Change badge */}
          <div
            className={`flex items-center gap-1 font-mono rounded-full px-2 py-0.5 border ${
              compact ? 'text-[9px]' : 'text-[10px]'
            }`}
            style={{
              color:       accentColor,
              borderColor: accentColor + '35',
              background:  accentColor + '10',
            }}
          >
            {isUp
              ? <TrendingUp  className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
              : <TrendingDown className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
            }
            {Math.abs(changePct).toFixed(2)}%
          </div>
        </div>
      </div>

      {/* ── Chart canvas ─────────────────────────────────────────────────── */}
      <div
        className="w-full relative rounded-xl overflow-hidden"
        style={{ height, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-5 h-5 border-2 border-t-white/50 border-white/10 rounded-full animate-spin" />
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* ── Footer: mock indicator + price range ─────────────────────────── */}
      {!compact && (
        <div className="flex items-center justify-between mt-2 px-1">
          <div className="flex items-center gap-1.5">
            {isMock && (
              <span className="text-[9px] font-mono text-white/20 border border-white/10 px-1.5 py-0.5 rounded">
                MOCK DATA
              </span>
            )}
            {label && (
              <span className="text-[9px] font-mono text-white/20 truncate max-w-[120px]">{label}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-mono text-white/20">
              L {Math.min(...bars.map((b) => b.low)).toFixed(2)}
            </span>
            <span className="text-[9px] font-mono text-white/20">
              H {Math.max(...bars.map((b) => b.high)).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
