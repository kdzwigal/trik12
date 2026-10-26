/**
 * High-performance Skia Canvas Oscilloscope
 * Prototype replicating @shopify/react-native-skia pipeline for real-time IMU waveforms
 * Supports Clean Light and E-Ink High Contrast rendering models
 */

import React, { useEffect, useRef, useState } from 'react';
import { CalibratedSample, ThemeMode } from '../types/triki';
import { RingBuffer } from '../services/ringBuffer';
import { Activity, SlidersHorizontal, RefreshCw } from 'lucide-react';

interface SkiaCanvasOscilloscopeProps {
  ringBuffer: RingBuffer<CalibratedSample>;
  theme: ThemeMode;
  mode?: 'accel' | 'gyro' | 'both';
  height?: number;
}

export const SkiaCanvasOscilloscope: React.FC<SkiaCanvasOscilloscopeProps> = ({
  ringBuffer,
  theme,
  mode = 'both',
  height = 260,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [channelView, setChannelView] = useState<'both' | 'accel' | 'gyro'>(mode);
  const [autoScale, setAutoScale] = useState<boolean>(true);
  const [timeWindowSec, setTimeWindowSec] = useState<number>(3); // 3 seconds window

  const isEink = theme === 'eink';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animId = 0;

    const render = () => {
      const width = canvas.clientWidth;
      const h = canvas.clientHeight;

      // Handle retina high-DPI scaling
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== width * dpr || canvas.height !== h * dpr) {
        canvas.width = width * dpr;
        canvas.height = h * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Background styling
      if (isEink) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, h);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, h);
      }

      const samples = ringBuffer.toArray();
      const numSamples = samples.length;

      // Grid dimensions
      const paddingLeft = 45;
      const paddingRight = 15;
      const paddingTop = 20;
      const paddingBottom = 25;
      const plotWidth = width - paddingLeft - paddingRight;
      const plotHeight = h - paddingTop - paddingBottom;
      const midY = paddingTop + plotHeight / 2;

      // 1. Draw Grid Lines (Skia Path prototype)
      ctx.lineWidth = 1;
      if (isEink) {
        ctx.strokeStyle = '#e0e0e0';
      } else {
        ctx.strokeStyle = '#f1f5f9';
      }

      // Vertical time grid (every ~0.5 sec)
      const numVerticalGrid = 6;
      for (let i = 0; i <= numVerticalGrid; i++) {
        const x = paddingLeft + (i / numVerticalGrid) * plotWidth;
        ctx.beginPath();
        ctx.moveTo(x, paddingTop);
        ctx.lineTo(x, paddingTop + plotHeight);
        ctx.stroke();
      }

      // Horizontal scale lines
      const numHorizontalGrid = 4;
      for (let i = 0; i <= numHorizontalGrid; i++) {
        const y = paddingTop + (i / numHorizontalGrid) * plotHeight;
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(paddingLeft + plotWidth, y);
        ctx.stroke();
      }

      // Center zero baseline
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = isEink ? '#000000' : '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(paddingLeft, midY);
      ctx.lineTo(paddingLeft + plotWidth, midY);
      ctx.stroke();

      // 2. Compute dynamic or fixed scale
      let maxVal = 2.0; // default +/- 2g or +/- 500 deg/s
      if (channelView === 'gyro') maxVal = 500.0;
      else if (channelView === 'both') maxVal = 3.0;

      if (autoScale && numSamples > 10) {
        let maxObserved = 0.5;
        const recentCount = Math.min(numSamples, 150);
        for (let i = numSamples - recentCount; i < numSamples; i++) {
          const s = samples[i];
          if (channelView === 'accel' || channelView === 'both') {
            maxObserved = Math.max(
              maxObserved,
              Math.abs(s.accel.x),
              Math.abs(s.accel.y),
              Math.abs(s.accel.z)
            );
          }
          if (channelView === 'gyro') {
            maxObserved = Math.max(
              maxObserved,
              Math.abs(s.gyro.x * 57.3),
              Math.abs(s.gyro.y * 57.3),
              Math.abs(s.gyro.z * 57.3)
            );
          }
        }
        maxVal = Math.max(maxVal * 0.5, maxObserved * 1.25);
      }

      // Y-axis labels
      ctx.font = '10px monospace';
      ctx.fillStyle = isEink ? '#000000' : '#64748b';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const unit = channelView === 'gyro' ? '°/s' : 'g';
      ctx.fillText(`+${maxVal.toFixed(1)} ${unit}`, paddingLeft - 6, paddingTop + 4);
      ctx.fillText(`0.0`, paddingLeft - 6, midY);
      ctx.fillText(`-${maxVal.toFixed(1)}`, paddingLeft - 6, paddingTop + plotHeight - 4);

      // 3. Draw Waveforms with Skia-like Path strokes
      if (numSamples > 1) {
        // We plot the last N samples based on timeWindowSec (assumed ~100Hz = 100 * timeWindowSec)
        const maxSamplesToPlot = Math.min(numSamples, Math.round(timeWindowSec * 100));
        const startIndex = numSamples - maxSamplesToPlot;
        const stepX = plotWidth / (maxSamplesToPlot - 1);

        const drawSeries = (
          getValue: (s: CalibratedSample) => number,
          color: string,
          lineDash: number[] = []
        ) => {
          ctx.beginPath();
          ctx.setLineDash(lineDash);
          ctx.strokeStyle = color;
          ctx.lineWidth = isEink ? 1.5 : 2;

          for (let i = 0; i < maxSamplesToPlot; i++) {
            const sample = samples[startIndex + i];
            const val = getValue(sample);
            const normY = Math.max(-1, Math.min(1, val / maxVal));
            const x = paddingLeft + i * stepX;
            const y = midY - normY * (plotHeight / 2);

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
          ctx.setLineDash([]);
        };

        if (channelView === 'accel' || channelView === 'both') {
          // X: Cyan or Solid Black
          drawSeries((s) => s.accel.x, isEink ? '#000000' : '#0284c7', []);
          // Y: Indigo or Dashed Black
          drawSeries((s) => s.accel.y, isEink ? '#444444' : '#4f46e5', isEink ? [4, 4] : []);
          // Z: Amber or Dotted Black
          drawSeries((s) => s.accel.z, isEink ? '#777777' : '#f59e0b', isEink ? [2, 2] : []);
        }

        if (channelView === 'gyro') {
          // Gyro X, Y, Z in deg/s
          drawSeries((s) => s.gyro.x * 57.2958, isEink ? '#000000' : '#0284c7', []);
          drawSeries((s) => s.gyro.y * 57.2958, isEink ? '#444444' : '#4f46e5', isEink ? [4, 4] : []);
          drawSeries((s) => s.gyro.z * 57.2958, isEink ? '#777777' : '#f59e0b', isEink ? [2, 2] : []);
        }
      }

      // Bottom time label
      ctx.textAlign = 'center';
      ctx.font = '10px monospace';
      ctx.fillStyle = isEink ? '#000000' : '#94a3b8';
      ctx.fillText(`Okno czasowe: -${timeWindowSec}s do 0s (100 Hz Skia Buffer)`, paddingLeft + plotWidth / 2, h - 6);

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isEink, channelView, autoScale, timeWindowSec, ringBuffer]);

  const latest = ringBuffer.getLatest();

  return (
    <div
      className={`rounded-xl border p-3 sm:p-5 flex flex-col gap-3 sm:gap-4 transition-colors ${
        isEink
          ? 'bg-white border-2 border-black text-black'
          : 'bg-white border-slate-200 text-slate-800 shadow-xs'
      }`}
    >
      {/* Oscilloscope Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-600" />
          <h3 className="text-sm font-semibold tracking-tight">
            Oscyloskop fal IMU (Skia 2D Engine)
          </h3>
          <span className="text-xs font-mono opacity-60 hidden sm:inline">· 100 Hz Frame Buffer</span>
        </div>

        {/* Channel & Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs flex-wrap">
          {/* Channel selector */}
          <div
            className={`flex items-center p-0.5 rounded-lg border ${
              isEink ? 'border-black' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <button
              onClick={() => setChannelView('both')}
              className={`px-2 sm:px-2.5 py-1 rounded-md font-medium transition-colors ${
                channelView === 'both'
                  ? isEink
                    ? 'border border-black bg-zinc-200 text-black font-bold'
                    : 'bg-white text-slate-900 shadow-xs'
                  : isEink
                  ? 'text-zinc-600 hover:text-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Accel XYZ
            </button>
            <button
              onClick={() => setChannelView('gyro')}
              className={`px-2 sm:px-2.5 py-1 rounded-md font-medium transition-colors ${
                channelView === 'gyro'
                  ? isEink
                    ? 'border border-black bg-zinc-200 text-black font-bold'
                    : 'bg-white text-slate-900 shadow-xs'
                  : isEink
                  ? 'text-zinc-600 hover:text-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Żyro XYZ
            </button>
          </div>

          {/* Time window selector */}
          <select
            value={timeWindowSec}
            onChange={(e) => setTimeWindowSec(Number(e.target.value))}
            className={`text-xs px-2 py-1 rounded-lg border font-mono ${
              isEink
                ? 'border-black bg-white text-black'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <option value={1}>1s</option>
            <option value={2}>2s</option>
            <option value={3}>3s</option>
            <option value={5}>5s</option>
          </select>

          {/* Auto-scale toggle */}
          <button
            onClick={() => setAutoScale(!autoScale)}
            className={`px-2 sm:px-2.5 py-1 rounded-lg border font-mono text-xs transition-colors ${
              autoScale
                ? isEink
                  ? 'border-2 border-black bg-zinc-100 text-black font-bold'
                  : 'bg-sky-50 text-sky-700 border-sky-200'
                : isEink
                ? 'border-zinc-300 text-zinc-600 hover:border-black'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title="Włącz/Wyłącz automatyczne skalowanie osi Y"
          >
            Scale: {autoScale ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Skia Canvas */}
      <div className="w-full relative" style={{ height: `${height}px` }}>
        <canvas ref={canvasRef} className="w-full h-full block rounded-lg" />
      </div>

      {/* Live Value Legend with Tabular Figures */}
      <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-slate-100 flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-medium">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-sm ${
                isEink ? 'bg-black' : 'bg-sky-600'
              }`}
            />
            X: {latest ? (channelView === 'gyro' ? (latest.gyro.x * 57.3).toFixed(1) : latest.accel.x.toFixed(2)) : '0.00'}
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-sm ${
                isEink ? 'border border-black' : 'bg-indigo-600'
              }`}
            />
            Y: {latest ? (channelView === 'gyro' ? (latest.gyro.y * 57.3).toFixed(1) : latest.accel.y.toFixed(2)) : '0.00'}
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-sm ${
                isEink ? 'bg-zinc-400' : 'bg-amber-500'
              }`}
            />
            Z: {latest ? (channelView === 'gyro' ? (latest.gyro.z * 57.3).toFixed(1) : latest.accel.z.toFixed(2)) : '0.00'}
          </span>
        </div>

        <div className="text-slate-500 dark:text-slate-400">
          Wypadkowa: |{channelView === 'gyro' ? 'ω' : 'a'}| ={' '}
          <span className="font-semibold text-slate-800 dark:text-white">
            {latest
              ? (channelView === 'gyro'
                  ? latest.gyroMagnitude * 57.3
                  : latest.accelMagnitude
                ).toFixed(2)
              : '1.00'}
            {channelView === 'gyro' ? ' °/s' : ' g'}
          </span>
        </div>
      </div>
    </div>
  );
};
