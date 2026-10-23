/**
 * FilterSettingsModal
 * Dedicated configuration panel for IMU sensor fusion, LPF filtering, deadband, and axis mapping
 */

import React from 'react';
import { FilterConfig, ThemeMode, CalibratedSample } from '../types/triki';
import { sensorPipeline } from '../services/sensorPipeline';
import { Sliders, X, RotateCcw, Check, Sparkles, Activity, ShieldCheck, Zap } from 'lucide-react';

interface FilterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: FilterConfig;
  onConfigChange: (cfg: Partial<FilterConfig>) => void;
  latestSample: CalibratedSample | null;
  theme: ThemeMode;
}

export const FilterSettingsModal: React.FC<FilterSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onConfigChange,
  latestSample,
  theme,
}) => {
  if (!isOpen) return null;

  const isEink = theme === 'eink';

  const handleApplyPreset = (preset: 'balanced' | 'dynamic' | 'stable' | 'madgwick') => {
    switch (preset) {
      case 'balanced':
        onConfigChange({
          mode: 'complementary',
          compAlpha: 0.95,
          madgwickBeta: 0.08,
          rawAccelLpfFactor: 0.15,
          rawGyroDeadband: 0.025,
          swapPitchRoll: true,
          invertPitch: true,
          invertRoll: false,
          invertYaw: true,
          yawScaleMultiplier: 1.0,
          accelScaleMultiplier: 1.0,
        });
        break;
      case 'dynamic':
        onConfigChange({
          mode: 'complementary',
          compAlpha: 0.88,
          madgwickBeta: 0.16,
          rawAccelLpfFactor: 0.05,
          rawGyroDeadband: 0.015,
          swapPitchRoll: true,
          invertPitch: true,
          invertRoll: false,
          invertYaw: true,
          yawScaleMultiplier: 1.0,
          accelScaleMultiplier: 1.0,
        });
        break;
      case 'stable':
        onConfigChange({
          mode: 'complementary',
          compAlpha: 0.98,
          madgwickBeta: 0.04,
          rawAccelLpfFactor: 0.40,
          rawGyroDeadband: 0.035,
          swapPitchRoll: true,
          invertPitch: true,
          invertRoll: false,
          invertYaw: true,
          yawScaleMultiplier: 1.0,
          accelScaleMultiplier: 1.0,
        });
        break;
      case 'madgwick':
        onConfigChange({
          mode: 'madgwick',
          madgwickBeta: 0.08,
          rawAccelLpfFactor: 0.15,
          rawGyroDeadband: 0.025,
          swapPitchRoll: true,
          invertPitch: true,
          invertRoll: false,
          invertYaw: true,
          yawScaleMultiplier: 1.0,
          accelScaleMultiplier: 1.0,
        });
        break;
    }
  };

  const handleResetDefaults = () => {
    handleApplyPreset('balanced');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div
        className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border transition-all ${
          isEink ? 'bg-white border-2 border-black text-black' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isEink ? 'border-black bg-zinc-100' : 'border-slate-100 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg ${
                isEink ? 'bg-black text-white' : 'bg-sky-100 text-sky-700'
              }`}
            >
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Konfiguracja filtracji i sensorów IMU</h2>
              <p className="text-xs text-slate-500">
                Dostosuj algorytmy fuzji, tłumienie szumów LPF oraz mapowanie osi krążka Triki
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg border transition-colors ${
              isEink
                ? 'border-black hover:bg-black hover:text-white'
                : 'border-slate-200 hover:bg-slate-100 text-slate-500'
            }`}
            title="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm">
          {/* Live Telemetry Mini HUD */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 flex-wrap font-mono text-xs ${
              isEink ? 'bg-zinc-50 border-black' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-4">
              <span className="font-sans font-semibold text-slate-700">Podgląd na żywo:</span>
              <span className="tabular-nums">
                Roll: <strong className="text-sky-600">{latestSample ? latestSample.euler.roll.toFixed(1) : '0.0'}°</strong>
              </span>
              <span className="tabular-nums">
                Pitch: <strong className="text-indigo-600">{latestSample ? latestSample.euler.pitch.toFixed(1) : '0.0'}°</strong>
              </span>
              <span className="tabular-nums">
                Yaw: <strong className="text-amber-600">{latestSample ? latestSample.euler.yaw.toFixed(1) : '0.0'}°</strong>
              </span>
            </div>
            <button
              onClick={() => {
                sensorPipeline.tare();
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
                isEink
                  ? 'border-black bg-white text-black hover:bg-black hover:text-white'
                  : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shadow-xs'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Zeruj (Tare 0°)</span>
            </button>
          </div>

          {/* Presets Bar */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Szybkie profile filtracji (Presety)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => handleApplyPreset('balanced')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  config.mode === 'complementary' && config.compAlpha === 0.95
                    ? isEink ? 'bg-black text-white border-black font-bold' : 'bg-sky-50 border-sky-400 text-sky-900 shadow-xs ring-1 ring-sky-300'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                  <span>Zrównoważony</span>
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  Optymalny dla gestów Triki (Alpha 0.95)
                </div>
              </button>

              <button
                onClick={() => handleApplyPreset('dynamic')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  config.mode === 'complementary' && config.compAlpha === 0.88
                    ? isEink ? 'bg-black text-white border-black font-bold' : 'bg-sky-50 border-sky-400 text-sky-900 shadow-xs ring-1 ring-sky-300'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-0.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Dynamiczny</span>
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  Błyskawiczna reakcja w grach (Alpha 0.88)
                </div>
              </button>

              <button
                onClick={() => handleApplyPreset('stable')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  config.mode === 'complementary' && config.compAlpha === 0.98
                    ? isEink ? 'bg-black text-white border-black font-bold' : 'bg-sky-50 border-sky-400 text-sky-900 shadow-xs ring-1 ring-sky-300'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-0.5">
                  <Activity className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Laboratoryjny</span>
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  Maksymalne wygładzenie (LPF 40%)
                </div>
              </button>

              <button
                onClick={() => handleApplyPreset('madgwick')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  config.mode === 'madgwick'
                    ? isEink ? 'bg-black text-white border-black font-bold' : 'bg-sky-50 border-sky-400 text-sky-900 shadow-xs ring-1 ring-sky-300'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  <span>Madgwick AHRS</span>
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  Gradient Descent (Beta 0.08)
                </div>
              </button>
            </div>
          </div>

          {/* Section: Fusion Algorithm */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Algorytm fuzji orientacji
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  config.mode === 'complementary'
                    ? isEink ? 'bg-zinc-100 border-black' : 'bg-sky-50/60 border-sky-500 shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="filterMode"
                  checked={config.mode === 'complementary'}
                  onChange={() => onConfigChange({ mode: 'complementary' })}
                  className="mt-1 accent-sky-600"
                />
                <div>
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <span>Filtr komplementarny (Polecany)</span>
                    <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.2 rounded font-mono font-normal">
                      360° bez blokad
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Klasyczny filtr znany z aplikacji Żappka. Błyskawiczny, zerowy dryf, pełny zakres obrotu.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  config.mode === 'madgwick'
                    ? isEink ? 'bg-zinc-100 border-black' : 'bg-sky-50/60 border-sky-500 shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="filterMode"
                  checked={config.mode === 'madgwick'}
                  onChange={() => onConfigChange({ mode: 'madgwick' })}
                  className="mt-1 accent-sky-600"
                />
                <div>
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <span>Madgwick AHRS</span>
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded font-mono font-normal">
                      Kwaterniony
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Estymacja kwaternionów metodą największego spadku (Gradient Descent).
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Section: Sliders */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            {/* Slider 1: Alpha (for Complementary) */}
            {config.mode === 'complementary' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <span>Waga żyroskopu Alpha:</span>
                    <span className="font-mono text-sky-600 font-bold">{config.compAlpha.toFixed(3)}</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">Domyślnie: 0.950</span>
                </div>
                <input
                  type="range"
                  min="0.50"
                  max="0.999"
                  step="0.005"
                  value={config.compAlpha}
                  onChange={(e) => onConfigChange({ compAlpha: parseFloat(e.target.value) })}
                  className="w-full accent-sky-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>0.50 (Szybkie wyrównanie do grawitacji)</span>
                  <span>0.95 (Zbalansowane)</span>
                  <span>0.999 (Płynny żyroskop, odporny na wstrząsy)</span>
                </div>
              </div>
            )}

            {/* Slider 2: Beta (for Madgwick) */}
            {config.mode === 'madgwick' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <span>Współczynnik Beta (Gradient Step):</span>
                    <span className="font-mono text-purple-600 font-bold">{config.madgwickBeta.toFixed(3)}</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">Domyślnie: 0.080</span>
                </div>
                <input
                  type="range"
                  min="0.01"
                  max="0.40"
                  step="0.005"
                  value={config.madgwickBeta}
                  onChange={(e) => onConfigChange({ madgwickBeta: parseFloat(e.target.value) })}
                  className="w-full accent-purple-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>0.01 (Maksymalna stabilność)</span>
                  <span>0.08 (Zbalansowany krok)</span>
                  <span>0.40 (Agresywna korekcja poziomu)</span>
                </div>
              </div>
            )}

            {/* Slider 3: Accelerometer Low-Pass Filter (LPF) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <span>Filtr dolnoprzepustowy akcelerometru (LPF):</span>
                  <span className="font-mono text-indigo-600 font-bold">
                    {(config.rawAccelLpfFactor * 100).toFixed(0)}%
                  </span>
                </label>
                <span className="text-[11px] text-slate-400 font-mono">Domyślnie: 15%</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.80"
                step="0.05"
                value={config.rawAccelLpfFactor}
                onChange={(e) => onConfigChange({ rawAccelLpfFactor: parseFloat(e.target.value) })}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>0% (Surowe dane bez tłumienia)</span>
                <span>15% (Lekkie odszumianie)</span>
                <span>80% (Głębokie tłumienie wstrząsów)</span>
              </div>
            </div>

            {/* Slider 4: Gyroscope Deadband */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <span>Strefa martwa żyroskopu (Deadband):</span>
                  <span className="font-mono text-emerald-600 font-bold">{config.rawGyroDeadband.toFixed(3)} rad/s</span>
                </label>
                <span className="text-[11px] text-slate-400 font-mono">Ucina szum w bezruchu</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.08"
                step="0.002"
                value={config.rawGyroDeadband}
                onChange={(e) => onConfigChange({ rawGyroDeadband: parseFloat(e.target.value) })}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>0.000 rad/s (Brak)</span>
                <span>0.005 rad/s (Domyślna strefa)</span>
                <span>0.080 rad/s (Mocne wycinanie mikro-ruchów)</span>
              </div>
            </div>

            {/* Slider 5: Yaw 360-Degree Scale Multiplier */}
            <div className="space-y-1.5 p-3 rounded-xl border bg-amber-50/50 border-amber-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>Skalowanie obrotu Yaw (360° wokół osi Z):</span>
                  <span className="font-mono text-amber-700 font-bold">
                    {(config.yawScaleMultiplier ?? 1.0).toFixed(2)}x
                  </span>
                </label>
                <span className="text-[11px] text-amber-800/80 font-mono">Czułość IMU: ±2000 dps</span>
              </div>
              <input
                type="range"
                min="0.80"
                max="1.30"
                step="0.01"
                value={config.yawScaleMultiplier ?? 1.0}
                onChange={(e) => onConfigChange({ yawScaleMultiplier: parseFloat(e.target.value) })}
                className="w-full accent-amber-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>0.80x (Mniejszy kąt)</span>
                <span className="font-semibold text-emerald-700">1.00x (Dokładne 360° = 360°)</span>
                <span>1.30x (Większy kąt)</span>
              </div>
              <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                Naprawiono błąd zaniżania kąta (gdzie pełny obrót 360° dawał tylko 44-46°). Sprzętowy przetwornik żyroskopu Triki działa z czułością 16.384 LSB/°/s (zakres ±2000 dps).
              </p>
            </div>

            {/* Slider 6: Accelerometer G-Force Multiplier */}
            <div className="space-y-1.5 p-3 rounded-xl border bg-sky-50/50 border-sky-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                  <span>Kalibracja siły ciążenia G-Force (w spoczynku = 1.00g):</span>
                  <span className="font-mono text-sky-700 font-bold">
                    {(config.accelScaleMultiplier ?? 1.0).toFixed(2)}x
                  </span>
                </label>
                <span className="text-[11px] text-sky-800/80 font-mono">1.00g w spoczynku</span>
              </div>
              <input
                type="range"
                min="0.80"
                max="1.30"
                step="0.01"
                value={config.accelScaleMultiplier ?? 1.0}
                onChange={(e) => onConfigChange({ accelScaleMultiplier: parseFloat(e.target.value) })}
                className="w-full accent-sky-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>0.80x</span>
                <span className="font-semibold text-sky-700">1.00x (Skalibrowane do 1.00 g na biurku)</span>
                <span>1.30x</span>
              </div>
              <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                Naprawiono odczyt spoczynkowy krążka (0.89 g na biurku zostało przeskalowane do rzeczywistego ziemskiego 1.00 g).
              </p>
            </div>
          </div>

          {/* Section: Axis Mapping & Swap Pitch/Roll */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Mapowanie i odwracanie osi
            </label>

            {/* Highlighted Swap Pitch/Roll card */}
            <div
              className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                config.swapPitchRoll
                  ? isEink ? 'bg-zinc-100 border-black' : 'bg-emerald-50/60 border-emerald-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div>
                <div className="font-semibold text-slate-900 flex items-center gap-2">
                  <span>Zamiana osi Pitch ⇄ Roll</span>
                  {config.swapPitchRoll && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                      AKTYWNA NA STAŁE
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Zamiana osi przechyłu na stałe włączona. Roll operuje na osi bocznej, a Pitch na podłużnej.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.swapPitchRoll}
                  onChange={(e) => onConfigChange({ swapPitchRoll: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Inversion toggles */}
            <div className="space-y-2 pt-1">
              <span className="block text-xs font-semibold text-slate-600">Odwracanie zwrotu osi:</span>
              <div className="flex items-center gap-4 flex-wrap text-xs">
                <label className={`flex items-center gap-1.5 cursor-pointer select-none px-2 py-1 rounded border transition-colors ${
                  config.invertPitch ? 'bg-indigo-50 border-indigo-200 font-semibold text-indigo-950' : 'border-transparent text-slate-700'
                }`}>
                  <input
                    type="checkbox"
                    checked={config.invertPitch}
                    onChange={(e) => onConfigChange({ invertPitch: e.target.checked })}
                    className="accent-indigo-600 cursor-pointer"
                  />
                  <span>Odwróć Pitch (Pochylenie) {config.invertPitch ? '✓' : ''}</span>
                </label>

                <label className={`flex items-center gap-1.5 cursor-pointer select-none px-2 py-1 rounded border transition-colors ${
                  config.invertRoll ? 'bg-sky-50 border-sky-200 font-semibold text-sky-950' : 'border-transparent text-slate-700'
                }`}>
                  <input
                    type="checkbox"
                    checked={config.invertRoll}
                    onChange={(e) => onConfigChange({ invertRoll: e.target.checked })}
                    className="accent-sky-600 cursor-pointer"
                  />
                  <span>Odwróć Roll (Przechył) {config.invertRoll ? '✓' : ''}</span>
                </label>

                <label className={`flex items-center gap-1.5 cursor-pointer select-none px-2 py-1 rounded border transition-colors ${
                  config.invertYaw ? 'bg-amber-50 border-amber-200 font-semibold text-amber-950' : 'border-transparent text-slate-700'
                }`}>
                  <input
                    type="checkbox"
                    checked={config.invertYaw}
                    onChange={(e) => onConfigChange({ invertYaw: e.target.checked })}
                    className="accent-amber-600 cursor-pointer"
                  />
                  <span>Odwróć Yaw (Obrót Z) {config.invertYaw ? '✓' : ''}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-between px-6 py-3.5 border-t ${
            isEink ? 'border-black bg-zinc-100' : 'border-slate-100 bg-slate-50'
          }`}
        >
          <button
            onClick={handleResetDefaults}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              isEink
                ? 'border-black text-black hover:bg-zinc-200'
                : 'border-slate-300 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Przywróć domyślne</span>
          </button>

          <button
            onClick={onClose}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              isEink
                ? 'bg-black text-white hover:bg-zinc-800'
                : 'bg-slate-900 text-white hover:bg-slate-800 shadow-xs'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>Zastosuj i zamknij</span>
          </button>
        </div>
      </div>
    </div>
  );
};
