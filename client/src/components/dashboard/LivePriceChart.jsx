import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { Card } from '../common/Card.jsx';
import { stocksService } from '../../services/stocks.service.js';
import { aiService } from '../../services/ai.service.js';
import { supertrendSeries, psarSeries } from '../../lib/chartIndicators.js';

const TIMEFRAMES = [
  { key: '1m', label: '1m' },
  { key: '5m', label: '5m' },
  { key: '15m', label: '15m' },
  { key: '30m', label: '30m' },
  { key: '1d', label: '1D' },
];
const CANDLE_LIMIT = 150; // enough trailing history for ATR/Supertrend/PSAR to warm up
const POLL_MS = 15000;

const ACCENT = '#00C853';
const DANGER = '#FF5252';
const PSAR_COLOR = '#FFB020';

/**
 * Live candlestick chart — self-contained (fetches its own candles + AI decision history;
 * the parent only says WHAT to show). Overlays what the AI's own decision pipeline
 * actually sees: Supertrend (green/red trailing band), Parabolic SAR (dots), a volume
 * histogram, and arrows marking past BUY/SELL decisions — so "why did the AI do that" is
 * visible on the chart itself, not just in a text readout.
 *
 * For options, `symbol` should be the UNDERLYING's spot symbol (e.g. NIFTY) since that's
 * what actually drives the AI's directional read — `displayLabel` carries the human label
 * (e.g. the option's own trading symbol) shown in the header instead.
 * @param {{symbol:string, displayLabel?:string, markerFilter?:{symbol?:string, underlying?:string}}} props
 */
export function LivePriceChart({ symbol, displayLabel, markerFilter }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const supertrendUpRef = useRef(null);
  const supertrendDownRef = useRef(null);
  const psarSeriesRef = useRef(null);
  const markersRef = useRef(null);

  const [interval, setInterval_] = useState('5m');
  const [showOverlays, setShowOverlays] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: 'transparent' }, textColor: '#8B97A7', fontFamily: 'Inter', attributionLogo: false },
      grid: { vertLines: { color: '#1a2129' }, horzLines: { color: '#1a2129' } },
      rightPriceScale: { borderColor: '#222A33' },
      timeScale: { borderColor: '#222A33', timeVisible: true },
      crosshair: { mode: 0 },
      height: 380,
      width: containerRef.current.clientWidth,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: ACCENT,
      downColor: DANGER,
      borderVisible: false,
      wickUpColor: ACCENT,
      wickDownColor: DANGER,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    // visible:false — otherwise this scale draws its own right-axis tick labels (0, etc.)
    // in the same corner as the main price scale's, overlapping/cutting each other off.
    // The volume bars themselves still render via scaleMargins; only its own axis is hidden.
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });

    const supertrendUp = chart.addSeries(LineSeries, { color: ACCENT, lineWidth: 2, lastValueVisible: false, priceLineVisible: false });
    const supertrendDown = chart.addSeries(LineSeries, { color: DANGER, lineWidth: 2, lastValueVisible: false, priceLineVisible: false });
    const psarLine = chart.addSeries(LineSeries, {
      color: PSAR_COLOR,
      lineVisible: false,
      pointMarkersVisible: true,
      pointMarkersRadius: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const markers = createSeriesMarkers(candleSeries, []);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    supertrendUpRef.current = supertrendUp;
    supertrendDownRef.current = supertrendDown;
    psarSeriesRef.current = psarLine;
    markersRef.current = markers;

    const onResize = () => chart.applyOptions({ width: containerRef.current.clientWidth });
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
    };
  }, []);

  // Fetch candles for this symbol/interval, then poll while the selection is unchanged.
  useEffect(() => {
    if (!symbol) {
      // No selection yet (e.g. Options mode before a contract is picked) — clear the chart
      // rather than leaving the previous symbol's stale candles on screen under a blank header.
      candleSeriesRef.current?.setData([]);
      volumeSeriesRef.current?.setData([]);
      supertrendUpRef.current?.setData([]);
      supertrendDownRef.current?.setData([]);
      psarSeriesRef.current?.setData([]);
      markersRef.current?.setMarkers([]);
      return undefined;
    }
    let cancelled = false;

    async function load() {
      try {
        const candles = await stocksService.candles(symbol, interval, CANDLE_LIMIT);
        if (cancelled || !candleSeriesRef.current) return;

        const candleData = candles.map((c) => ({
          time: Math.floor(new Date(c.time).getTime() / 1000),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        candleSeriesRef.current.setData(candleData);

        const volumeData = candles.map((c) => ({
          time: Math.floor(new Date(c.time).getTime() / 1000),
          value: c.volume ?? 0,
          color: c.close >= c.open ? 'rgba(0,200,83,0.5)' : 'rgba(255,82,82,0.5)',
        }));
        volumeSeriesRef.current?.setData(volumeData);

        if (showOverlays) {
          const { up, down } = supertrendSeries(candles);
          supertrendUpRef.current?.setData(up);
          supertrendDownRef.current?.setData(down);
          psarSeriesRef.current?.setData(psarSeries(candles));
        } else {
          supertrendUpRef.current?.setData([]);
          supertrendDownRef.current?.setData([]);
          psarSeriesRef.current?.setData([]);
        }

        chartRef.current?.timeScale().fitContent();
      } catch (err) {
        console.error('[LivePriceChart] candle fetch failed:', err.message);
      }
    }

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, interval, showOverlays]);

  // AI decision markers (BUY/SELL only — WAIT is the common case and would flood the chart).
  useEffect(() => {
    if (!markerFilter?.symbol && !markerFilter?.underlying) {
      markersRef.current?.setMarkers([]);
      return;
    }
    aiService
      .decisions({ ...markerFilter, limit: 30 })
      .then((decisions) => {
        const marks = decisions
          .filter((d) => d.action === 'BUY' || d.action === 'SELL')
          .map((d) => ({
            time: Math.floor(new Date(d.createdAt).getTime() / 1000),
            position: d.action === 'BUY' ? 'belowBar' : 'aboveBar',
            color: d.action === 'BUY' ? ACCENT : DANGER,
            shape: d.action === 'BUY' ? 'arrowUp' : 'arrowDown',
            text: `${d.action} ${d.confidence}%`,
          }))
          .sort((a, b) => a.time - b.time);
        markersRef.current?.setMarkers(marks);
      })
      .catch((err) => console.error('[LivePriceChart] decision markers failed:', err.message));
  }, [markerFilter?.symbol, markerFilter?.underlying]);

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-display font-semibold">{displayLabel ?? symbol ?? '—'}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOverlays((v) => !v)}
            title="Toggle Supertrend/PSAR overlay"
            className={`rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
              showOverlays ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border/70 text-muted hover:border-border'
            }`}
          >
            Indicators
          </button>
          <div className="flex gap-0.5 rounded-lg border border-border/70 bg-surface/50 p-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.key}
                onClick={() => setInterval_(tf.key)}
                className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                  interval === tf.key ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div ref={containerRef} className="h-[380px] w-full" />
      {showOverlays && (
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} /> Supertrend up</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: DANGER }} /> Supertrend down</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: PSAR_COLOR }} /> Parabolic SAR</span>
        </div>
      )}
    </Card>
  );
}
