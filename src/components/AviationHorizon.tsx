/**
 * Aviation Horizon (Attitude Indicator) & Inclinometer Component
 * Rendered using precision canvas math matching React Native Skia primitives
 */

import React, { useEffect, useRef } from 'react';
import { CalibratedSample, ThemeMode } from '../types/triki';
import { Compass, Gauge, Navigation } from 'lucide-react';

interface AviationHorizonProps {
  sample: CalibratedSample | null;
  theme: ThemeMode;
}

export const AviationHorizon: React.FC<AviationHorizonProps> = ({ sample, theme }) => {
  const horizonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gmeterCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const isEink = theme === 'eink';

  const roll = sample ? sample.euler.roll : 0;
  const pitch = sample ? sample.euler.pitch : 0;
  const yaw = sample ? sample.euler.yaw : 0;
  const accelX = sample ? sample.accel.x : 0;
  const accelY = sample ? sample.accel.y : 0;
  const gLoad = sample ? sample.accelMagnitude : 1.0;

  // Render Primary Flight Display (Attitude Indicator)
  useEffect(() => {
    const canvas = horizonCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = Math.min(canvas.clientWidth, canvas.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.46;

    // Clip to circular instrument dial
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // 1. Transform for Roll & Pitch
    ctx.save();
    ctx.translate(cx, cy);
    // Rotate for bank angle (Roll in radians)
    ctx.rotate((-roll * Math.PI) / 180);

    // Vertical shift for Pitch (pixels per degree)
    const pitchPixelsPerDegree = radius / 45;
    const pitchOffset = pitch * pitchPixelsPerDegree;

    // Sky & Earth
    if (isEink) {
      // Sky: Crisp Paper White
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-radius * 2, -radius * 2 + pitchOffset, radius * 4, radius * 2);
      // Earth: Soft Paper Grey (reduced black density per user request)
      ctx.fillStyle = '#e5e5e0';
      ctx.fillRect(-radius * 2, pitchOffset, radius * 4, radius * 2);
    } else {
      // Sky: Aeronautical Cyan
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(-radius * 2, -radius * 2 + pitchOffset, radius * 4, radius * 2);
      // Earth: Earthy Sepia Slate
      ctx.fillStyle = '#334155';
      ctx.fillRect(-radius * 2, pitchOffset, radius * 4, radius * 2);
    }

    // Horizon dividing line
    ctx.strokeStyle = isEink ? '#000000' : '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-radius * 1.5, pitchOffset);
    ctx.lineTo(radius * 1.5, pitchOffset);
    ctx.stroke();

    // 2. Pitch Ladder (Graduation ticks at +/- 10, 20, 30, 45, 60 deg)
    const pitchSteps = [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60];
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const deg of pitchSteps) {
      const y = pitchOffset - deg * pitchPixelsPerDegree;
      if (Math.abs(y) > radius * 0.95) continue;

      const barWidth = Math.abs(deg) % 20 === 0 ? 44 : 26;
      ctx.strokeStyle = isEink ? '#000000' : '#ffffff';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(-barWidth / 2, y);
      ctx.lineTo(barWidth / 2, y);
      ctx.stroke();

      ctx.fillStyle = isEink ? '#000000' : '#ffffff';
      ctx.fillText(`${Math.abs(deg)}`, -barWidth / 2 - 14, y);
      ctx.fillText(`${Math.abs(deg)}`, barWidth / 2 + 14, y);
    }

    ctx.restore(); // Restore roll/pitch translation

    // 3. Roll Scale Ring & Pointers (Static dial background)
    ctx.strokeStyle = isEink ? '#000000' : '#ffffff';
    ctx.lineWidth = 2;
    const bankAngles = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];
    for (const b of bankAngles) {
      const rad = ((b - 90) * Math.PI) / 180;
      const isMajor = Math.abs(b) === 0 || Math.abs(b) === 30 || Math.abs(b) === 60;
      const len = isMajor ? 12 : 7;
      const x1 = cx + (radius - 2) * Math.cos(rad);
      const y1 = cy + (radius - 2) * Math.sin(rad);
      const x2 = cx + (radius - 2 - len) * Math.cos(rad);
      const y2 = cy + (radius - 2 - len) * Math.sin(rad);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Roll Pointer Triangle
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-roll * Math.PI) / 180);
    ctx.fillStyle = isEink ? '#000000' : '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(0, -radius + 4);
    ctx.lineTo(-7, -radius + 16);
    ctx.lineTo(7, -radius + 16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore(); // Restore clip

    // 4. Outer Dial Bezel
    ctx.strokeStyle = isEink ? '#000000' : '#0f172a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
    ctx.stroke();

    // 5. Fixed Center Aircraft Reticle (Yellow wings or Black crosshair)
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = isEink ? '#000000' : '#f59e0b';
    ctx.fillStyle = isEink ? '#000000' : '#f59e0b';

    // Left wing
    ctx.beginPath();
    ctx.moveTo(cx - 50, cy);
    ctx.lineTo(cx - 18, cy);
    ctx.lineTo(cx - 18, cy + 8);
    ctx.stroke();

    // Right wing
    ctx.beginPath();
    ctx.moveTo(cx + 50, cy);
    ctx.lineTo(cx + 18, cy);
    ctx.lineTo(cx + 18, cy + 8);
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [roll, pitch, isEink]);

  // Render 2D Vector G-Force / Bubble Inclinometer
  useEffect(() => {
    const canvas = gmeterCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = Math.min(canvas.clientWidth, canvas.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.42;

    // Outer circle
    ctx.strokeStyle = isEink ? '#000000' : '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Concentric G-force rings: 0.5g, 1.0g, 1.5g
    [0.33, 0.66, 1.0].forEach((ratio, idx) => {
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = isEink ? '#666666' : '#94a3b8';
      ctx.beginPath();
      ctx.arc(cx, cy, radius * ratio, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '9px monospace';
      ctx.fillStyle = isEink ? '#000000' : '#64748b';
      ctx.fillText(`${(idx + 1) * 0.5}g`, cx + 4, cy - radius * ratio + 10);
    });

    // Crosshair axes
    ctx.strokeStyle = isEink ? '#000000' : '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    // Vector bubble position (mapped from accelX, accelY)
    const pxPerG = radius / 1.5;
    const bubbleX = Math.max(cx - radius, Math.min(cx + radius, cx + accelX * pxPerG));
    const bubbleY = Math.max(cy - radius, Math.min(cy + radius, cy - accelY * pxPerG));

    // Vector line from origin to bubble
    ctx.strokeStyle = isEink ? '#000000' : '#0284c7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(bubbleX, bubbleY);
    ctx.stroke();

    // Bubble dot
    ctx.fillStyle = isEink ? '#000000' : '#0284c7';
    ctx.beginPath();
    ctx.arc(bubbleX, bubbleY, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [accelX, accelY, isEink]);

  return (
    <div
      className={`rounded-xl border p-5 flex flex-col gap-6 transition-colors ${
        isEink
          ? 'bg-white border-2 border-black text-black'
          : 'bg-white border-slate-200 text-slate-800 shadow-xs'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-sky-600" />
          <h3 className="text-sm font-semibold tracking-tight">
            Sztuczny Horyzont Lotniczy & Przeciążenia G
          </h3>
          <span className="text-xs font-mono opacity-60">· Madgwick AHRS Fusion</span>
        </div>
        <div className="text-xs font-mono tabular-nums">
          Yaw (Kurs): <span className="font-bold">{yaw.toFixed(1)}°</span>
        </div>
      </div>

      {/* Main Gauges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-center">
        {/* Gauge 1: Primary Flight Attitude Indicator */}
        <div className="flex flex-col items-center">
          <div className="w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 relative">
            <canvas ref={horizonCanvasRef} className="w-full h-full block" />
          </div>
          <div className="mt-2.5 sm:mt-3 flex items-center gap-3 sm:gap-4 text-xs font-mono">
            <div>
              Roll: <span className="font-bold">{roll.toFixed(1)}°</span>
            </div>
            <span>·</span>
            <div>
              Pitch: <span className="font-bold">{pitch.toFixed(1)}°</span>
            </div>
          </div>
        </div>

        {/* Gauge 2: Circular G-Meter / Vector Level */}
        <div className="flex flex-col items-center">
          <div className="w-44 h-44 sm:w-52 sm:h-52 md:w-56 md:h-56 relative">
            <canvas ref={gmeterCanvasRef} className="w-full h-full block" />
          </div>
          <div className="mt-2.5 sm:mt-3 flex items-center gap-4 text-xs font-mono">
            <div>
              Przeciążenie wypadkowe:{' '}
              <span className={`font-bold ${isEink ? 'text-black' : 'text-sky-600'}`}>{gLoad.toFixed(2)} g</span>
            </div>
          </div>
        </div>
      </div>

      {/* Numerical Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 pt-3 sm:pt-4 border-t border-slate-100 text-xs font-mono">
        <div className={`p-2.5 rounded-lg border ${isEink ? 'bg-white border-zinc-300' : 'bg-slate-50 border-slate-200'}`}>
          <span className="text-slate-400 block mb-1 text-[10px] sm:text-[11px]">KĄT PRZECHYŁU (ROLL)</span>
          <span className="text-base sm:text-lg font-bold text-slate-900">{roll.toFixed(1)}°</span>
        </div>
        <div className={`p-2.5 rounded-lg border ${isEink ? 'bg-white border-zinc-300' : 'bg-slate-50 border-slate-200'}`}>
          <span className="text-slate-400 block mb-1 text-[10px] sm:text-[11px]">KĄT POCHYLENIA (PITCH)</span>
          <span className="text-base sm:text-lg font-bold text-slate-900">{pitch.toFixed(1)}°</span>
        </div>
        <div className={`p-2.5 rounded-lg border ${isEink ? 'bg-white border-zinc-300' : 'bg-slate-50 border-slate-200'}`}>
          <span className="text-slate-400 block mb-1 text-[10px] sm:text-[11px]">ODCHYLENIE (YAW)</span>
          <span className="text-base sm:text-lg font-bold text-slate-900">{yaw.toFixed(1)}°</span>
        </div>
        <div className={`p-2.5 rounded-lg border ${isEink ? 'bg-white border-zinc-300' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
            <span>OBECNY G-FORCE</span>
            <span className={`font-bold px-1 rounded ${isEink ? 'border border-black bg-zinc-100 text-black' : 'text-emerald-700 bg-emerald-50'}`}>1.00g Baza</span>
          </div>
          <span className={`text-base sm:text-lg font-bold ${isEink ? 'text-black' : 'text-sky-600'}`}>{gLoad.toFixed(2)} g</span>
        </div>
      </div>
    </div>
  );
};
