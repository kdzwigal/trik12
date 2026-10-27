/**
 * High-Density Signal Analysis & Raw BLE Packet Inspector Component
 * Displays multi-channel telemetry breakdown, HEX frame debugger, and gesture classifier
 */

import React from 'react';
import { CalibratedSample, ThemeMode } from '../types/triki';
import { Terminal, Cpu, Radio, Zap } from 'lucide-react';

interface SignalInspectorProps {
  sample: CalibratedSample | null;
  theme: ThemeMode;
  packetRateHz: number;
  packetsReceived: number;
}

export const SignalInspector: React.FC<SignalInspectorProps> = ({
  sample,
  theme,
  packetRateHz,
  packetsReceived,
}) => {
  const isEink = theme === 'eink';

  // Format raw bytes as hex string
  const hexDump = sample?.rawBytes
    ? Array.from(sample.rawBytes)
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ')
    : 'Brak danych surowych pakietu BLE';

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
          <Terminal className="w-4 h-4 text-sky-600" />
          <h3 className="text-sm font-semibold tracking-tight">
            Laboratorium Sygnałów IMU & Inspektor Ramek BLE
          </h3>
          <span className="text-xs font-mono opacity-60">· TrikiScope Protocol Core</span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span>Odebrano: {packetsReceived} pkt</span>
          <span>·</span>
          <span>Częstotliwość: {packetRateHz.toFixed(1)} Hz</span>
        </div>
      </div>

      {/* 7-Channel IMU & Button Telemetry Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-xs font-mono">
        <div className="p-3 rounded-lg border bg-slate-50 border-slate-200 flex flex-col justify-between">
          <span className="text-[11px] text-slate-500">ACCEL X</span>
          <span className="text-xl font-bold text-sky-600">
            {sample ? sample.accel.x.toFixed(3) : '0.000'} g
          </span>
          <span className="text-[10px] text-slate-400">Oś wzdłużna</span>
        </div>

        <div className="p-3 rounded-lg border bg-slate-50 border-slate-200 flex flex-col justify-between">
          <span className="text-[11px] text-slate-500">ACCEL Y</span>
          <span className="text-xl font-bold text-indigo-600">
            {sample ? sample.accel.y.toFixed(3) : '0.000'} g
          </span>
          <span className="text-[10px] text-slate-400">Oś poprzeczna</span>
        </div>

        <div className="p-3 rounded-lg border bg-slate-50 border-slate-200 flex flex-col justify-between">
          <span className="text-[11px] text-slate-500">ACCEL Z</span>
          <span className="text-xl font-bold text-amber-600">
            {sample ? sample.accel.z.toFixed(3) : '1.000'} g
          </span>
          <span className="text-[10px] text-slate-400">Oś pionowa</span>
        </div>

        <div className="p-3 rounded-lg border bg-slate-50 border-slate-200 flex flex-col justify-between">
          <span className="text-[11px] text-slate-500">GYRO X</span>
          <span className="text-xl font-bold text-slate-900">
            {sample ? (sample.gyro.x * 57.3).toFixed(1) : '0.0'} °/s
          </span>
          <span className="text-[10px] text-slate-400">Prędkość Roll</span>
        </div>

        <div className="p-3 rounded-lg border bg-slate-50 border-slate-200 flex flex-col justify-between">
          <span className="text-[11px] text-slate-500">GYRO Y</span>
          <span className="text-xl font-bold text-slate-900">
            {sample ? (sample.gyro.y * 57.3).toFixed(1) : '0.0'} °/s
          </span>
          <span className="text-[10px] text-slate-400">Prędkość Pitch</span>
        </div>

        <div className="p-3 rounded-lg border bg-slate-50 border-slate-200 flex flex-col justify-between">
          <span className="text-[11px] text-slate-500">GYRO Z</span>
          <span className="text-xl font-bold text-slate-900">
            {sample ? (sample.gyro.z * 57.3).toFixed(1) : '0.0'} °/s
          </span>
          <span className="text-[10px] text-slate-400">Prędkość Yaw</span>
        </div>

        {/* Dedicated Button Status Tile */}
        <div className={`p-3 rounded-lg border flex flex-col justify-between transition-colors ${
          sample?.button
            ? isEink
              ? 'bg-zinc-200 text-black border-2 border-black font-bold'
              : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : isEink
            ? 'bg-white border-zinc-300 text-zinc-600'
            : 'bg-slate-50 border-slate-200'
        }`}>
          <span className="text-[11px] font-semibold text-slate-500">PRZYCISK</span>
          <span className={`text-base font-bold ${sample?.button ? (isEink ? 'text-black' : 'text-emerald-700') : 'text-slate-500'}`}>
            {sample?.button ? '● WCIŚNIĘTY' : '○ Puszczony'}
          </span>
          <span className="text-[10px] opacity-75">
            Bajt[1]: 0x{sample?.buttonRawByte !== undefined ? sample.buttonRawByte.toString(16).padStart(2, '0').toUpperCase() : '00'} · Klik: {sample?.buttonPressCount ?? 0}
          </span>
        </div>
      </div>

      {/* Raw Hex Packet Inspector */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-sky-600" />
            Surowy strumień pakietu GATT (NUS TX 0x6E400003):
          </span>
          <span className="text-slate-400">
            Długość ramki: {sample?.rawBytes ? sample.rawBytes.length : 0} bajtów
          </span>
        </div>

        <div
          className={`p-3 rounded-lg font-mono text-xs overflow-x-auto select-all ${
            isEink
              ? 'bg-zinc-100 text-black border border-black'
              : 'bg-slate-900 text-cyan-400 border border-slate-800'
          }`}
        >
          {hexDump}
        </div>

        {/* Byte Layout Annotations matching TrikiScope protocol */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px] font-mono text-slate-500">
          <div className="p-2 rounded bg-slate-50 border border-slate-200">
            <span className="font-semibold block text-slate-700">Bajty [0..1]: Header 0x22 &amp; Btn</span>
            Bajt 0: 0x22, Bajt 1: 0=Puszczony, 1=Wciśnięty
          </div>
          <div className="p-2 rounded bg-slate-50 border border-slate-200">
            <span className="font-semibold block text-slate-700">Bajty [2..7]: Accelerometer XYZ</span>
            3x int16_le (1823 LSB / g, skalowane do 1.00g)
          </div>
          <div className="p-2 rounded bg-slate-50 border border-slate-200">
            <span className="font-semibold block text-slate-700">Bajty [8..13]: Gyroscope XYZ</span>
            3x int16_le (16.384 LSB / °/s, ±2000 dps)
          </div>
          <div className="p-2 rounded bg-slate-50 border border-slate-200">
            <span className="font-semibold block text-slate-700">NUS RX Start Cmd</span>
            20 10 00 D0 07 68 00 03
          </div>
        </div>
      </div>

      {/* Gesture Engine Real-time status */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-semibold text-slate-800">Silnik klasyfikacji gestów:</span>
          <span
            className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md ${
              sample?.gesture === 'shake'
                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                : sample?.gesture === 'tap' || sample?.gesture === 'double_tap'
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : sample?.gesture === 'freefall'
                ? 'bg-purple-100 text-purple-800 border border-purple-300'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {sample?.gesture ? sample.gesture.toUpperCase() : 'IDLE'}
          </span>
        </div>

        <div className="text-xs text-slate-500">
          Kwaternion fuzji: [
          <span className="font-mono tabular-nums">
            {sample ? `${sample.quaternion.w.toFixed(2)}, ${sample.quaternion.x.toFixed(2)}, ${sample.quaternion.y.toFixed(2)}, ${sample.quaternion.z.toFixed(2)}` : '1.00, 0.00, 0.00, 0.00'}
          </span>
          ]
        </div>
      </div>
    </div>
  );
};
