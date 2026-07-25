"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type CandlestickData,
  type HistogramData,
  type Time,
  type MouseEventParams,
} from "lightweight-charts";
import type { OhlcvPoint } from "@/lib/types";
import { formatPrice, formatUsd } from "@/lib/format";

const GREEN = "#16c784";
const RED = "#ea3943";
const GREEN_DIM = GREEN + "40";
const RED_DIM = RED + "40";

function toTime(ms: number): Time {
  return (ms / 1000) as Time;
}

interface TooltipState {
  x: number;
  y: number;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function PriceChart({ data }: { data: OhlcvPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current || !data.length) return;

    // Cleanup previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const candles: CandlestickData[] = [];
    const volumes: HistogramData[] = [];
    for (const p of data) {
      if (p.o == null || p.h == null || p.l == null || p.c == null) continue;
      const up = p.c >= p.o;
      candles.push({
        time: toTime(p.t),
        open: p.o,
        high: p.h,
        low: p.l,
        close: p.c,
      });
      volumes.push({
        time: toTime(p.t),
        value: p.v ?? 0,
        color: up ? GREEN_DIM : RED_DIM,
      });
    }

    if (candles.length < 2) return;

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#6b7280",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        vertLine: { color: "#6b7280", style: 3, width: 1, labelVisible: false },
        horzLine: { color: "#6b7280", style: 3, width: 1, labelVisible: false },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        scaleMargins: { top: 0.05, bottom: 0.25 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: false,
      handleScale: false,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: GREEN,
      downColor: RED,
      borderUpColor: GREEN,
      borderDownColor: RED,
      wickUpColor: GREEN,
      wickDownColor: RED,
      priceFormat: {
        type: "price",
        precision: 8,
        minMove: 0.00000001,
      },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    candleSeries.setData(candles);
    volumeSeries.setData(volumes);

    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (!param.time || param.point == null) {
        setTooltip(null);
        return;
      }
      const cd = param.seriesData.get(candleSeries) as CandlestickData | undefined;
      const vd = param.seriesData.get(volumeSeries) as HistogramData | undefined;
      if (!cd) {
        setTooltip(null);
        return;
      }
      setTooltip({
        x: param.point.x,
        y: param.point.y,
        time: (param.time as number) * 1000,
        open: cd.open,
        high: cd.high,
        low: cd.low,
        close: cd.close,
        volume: vd?.value ?? 0,
      });
    });

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (container && chart) {
        chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    });
    ro.observe(container);

    chartRef.current = chart;

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, mounted]);

  if (!mounted) {
    return (
      <div className="chart-wrap">
        <div ref={containerRef} className="chart-svg" />
      </div>
    );
  }

  return (
    <div className="chart-wrap">
      <div ref={containerRef} className="chart-svg" />
      {tooltip && (
        <div className="chart-tip">
          <span className="mono">
            O {formatPrice(tooltip.open)} H {formatPrice(tooltip.high)} L{" "}
            {formatPrice(tooltip.low)} C {formatPrice(tooltip.close)}
          </span>
          {tooltip.volume > 0 && (
            <span className="muted">Vol {formatUsd(tooltip.volume)}</span>
          )}
        </div>
      )}
    </div>
  );
}
