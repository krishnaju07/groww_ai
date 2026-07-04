import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { Card } from '../common/Card.jsx';

/**
 * Live candlestick chart for one symbol. `candles` is the server's OHLCV shape
 * ({time, open, high, low, close, volume}) — converted to lightweight-charts'
 * {time: unix-seconds, open, high, low, close}.
 * @param {{symbol:string, candles:object[]}} props
 */
export function LivePriceChart({ symbol, candles = [] }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: 'transparent' }, textColor: '#8B97A7', fontFamily: 'Inter' },
      grid: { vertLines: { color: '#1a2129' }, horzLines: { color: '#1a2129' } },
      rightPriceScale: { borderColor: '#222A33' },
      timeScale: { borderColor: '#222A33', timeVisible: true },
      crosshair: { mode: 0 },
      height: 320,
      width: containerRef.current.clientWidth,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#00C853',
      downColor: '#FF5252',
      borderVisible: false,
      wickUpColor: '#00C853',
      wickDownColor: '#FF5252',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = () => chart.applyOptions({ width: containerRef.current.clientWidth });
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !candles.length) return;
    const data = candles.map((c) => ({
      time: Math.floor(new Date(c.time).getTime() / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display font-semibold">{symbol}</span>
        <span className="text-xs text-muted">5m candles</span>
      </div>
      <div ref={containerRef} className="h-80 w-full" />
    </Card>
  );
}
