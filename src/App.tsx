/**
 * TrikiScope: Stacja telemetryczna BLE, fuzja sensorów IMU i dashboard Skia
 * Obsługuje krążek sensoryczny Żabka Triki (CAP001) przez Web Bluetooth API
 */

import React, { useEffect, useState } from 'react';
import {
  CalibratedSample,
  BLEConnectionState,
  LayoutMode,
  ThemeMode,
  SensorCalibration,
  FusionFilterMode,
  FilterConfig,
} from './types/triki';
import { trikiBle } from './services/bleManager';
import { sensorPipeline } from './services/sensorPipeline';
import { Triki3DViewer } from './components/Triki3DViewer';
import { SkiaCanvasOscilloscope } from './components/SkiaCanvasOscilloscope';
import { AviationHorizon } from './components/AviationHorizon';
import { SignalInspector } from './components/SignalInspector';
import { ReactNativeArchitectureModal } from './components/ReactNativeArchitectureModal';
import { FilterSettingsModal } from './components/FilterSettingsModal';
import {
  Bluetooth,
  BluetoothOff,
  RotateCcw,
  Sliders,
  Sun,
  Moon,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Lightbulb,
} from 'lucide-react';

export default function App() {
  const [bleState, setBleState] = useState<BLEConnectionState>(trikiBle.getState());
  const [latestSample, setLatestSample] = useState<CalibratedSample | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('split');
  const [themeMode, setThemeMode] = useState<ThemeMode>('clean-light');
  const [calibration, setCalibration] = useState<SensorCalibration>(sensorPipeline.getCalibration());
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [showWebBleHelp, setShowWebBleHelp] = useState<boolean>(false);
  const [showDebugLogs, setShowDebugLogs] = useState<boolean>(false);
  const [showFilterSettings, setShowFilterSettings] = useState<boolean>(false);
  const [filterConfig, setFilterConfig] = useState<FilterConfig>(sensorPipeline.getFilterConfig());
  const [ledOn, setLedOn] = useState<boolean>(trikiBle.getIsLedOn());
  const [filterMode, setFilterMode] = useState<FusionFilterMode>('complementary');

  // Subscribe to BLE events & sensor processing pipeline
  useEffect(() => {
    trikiBle.onStateChange((state) => {
      setBleState(state);
      if (state.ledEnabled !== undefined) {
        setLedOn(state.ledEnabled);
      }
    });

    trikiBle.onPacket((rawSample) => {
      const calibrated = sensorPipeline.processRawSample(rawSample);
      setLatestSample(calibrated);
    });

    const unsubscribeCal = sensorPipeline.onCalibrationChange((cal) => {
      setCalibration(cal);
      if (cal.isCalibrated) {
        setIsCalibrating(false);
      }
    });

    const unsubscribeFilter = sensorPipeline.onFilterConfigChange((cfg) => {
      setFilterConfig(cfg);
      setFilterMode(cfg.mode);
    });

    return () => {
      unsubscribeCal();
      unsubscribeFilter();
    };
  }, []);

  const handleConnect = async () => {
    try {
      if (bleState.status === 'connected') {
        trikiBle.disconnect();
      } else {
        await trikiBle.connect();
      }
    } catch (err) {
      console.warn('BLE Connection action error:', err);
    }
  };

  const handleStartCalibration = () => {
    setIsCalibrating(true);
    sensorPipeline.startCalibration(150); // ~1.5s stationary calibration
  };

  const handleResetOrientation = () => {
    sensorPipeline.resetOrientation();
    sensorPipeline.tare();
  };

  const handleSendStartCommand = async () => {
    await trikiBle.sendStartCommand();
  };

  const handleToggleLed = async () => {
    const nextState = !ledOn;
    setLedOn(nextState);
    await trikiBle.toggleLed(nextState);
  };

  const handleTestBlink = async () => {
    await trikiBle.testBlink(3);
    setLedOn(trikiBle.getIsLedOn());
  };

  const isEink = themeMode === 'eink';

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors ${
        isEink ? 'bg-[#f4f4f0] text-black font-sans' : 'bg-[#f8fafc] text-slate-800 font-sans'
      }`}
    >
      {/* 
        Top Bar Contract (Skill Requirement):
        [Brand title, one line] — [4-5 nav links, 1-2 word labels, single-line] — [1 primary action]
      */}
      <header
        className={`w-full border-b transition-colors ${
          isEink
            ? 'bg-white border-b-2 border-black'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-6">
          {/* Zone 1: Single text element wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-base sm:text-lg font-bold tracking-tight whitespace-nowrap ${
                isEink ? 'text-black font-mono' : 'text-slate-900'
              }`}
            >
              TrikiScope
            </span>
            <span className="text-xs text-slate-400 font-mono hidden md:inline">
              CAP001 · Nordic UART BLE
            </span>
          </div>

          {/* Zone 2: 4 single-line navigation links / layout switchers */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600">
            <button
              onClick={() => setLayoutMode('split')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                layoutMode === 'split' ? 'text-sky-600 font-semibold' : ''
              }`}
            >
              Laboratorium 3D
            </button>
            <button
              onClick={() => setLayoutMode('aviation')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                layoutMode === 'aviation' ? 'text-sky-600 font-semibold' : ''
              }`}
            >
              Sztuczny Horyzont
            </button>
            <button
              onClick={() => setLayoutMode('signal')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                layoutMode === 'signal' ? 'text-sky-600 font-semibold' : ''
              }`}
            >
              Inspekcja Sygnałów
            </button>
            <button
              onClick={() => setLayoutMode('rn-architecture')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                layoutMode === 'rn-architecture' ? 'text-sky-600 font-semibold' : ''
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Architektura React Native</span>
            </button>
          </nav>

          {/* Zone 3: Primary Actions (Theme Toggle & BLE Connect) */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Theme Toggle (Clean Light vs E-Ink High Contrast) */}
            <button
              onClick={() => setThemeMode(isEink ? 'clean-light' : 'eink')}
              className={`flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 min-h-[38px] ${
                isEink
                  ? 'border-black bg-white text-black hover:bg-zinc-100 font-medium'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
              title="Przełącz styl Clean Light / E-Ink"
              aria-label="Przełącz styl Clean Light / E-Ink"
            >
              {isEink ? <Sun className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> : <Moon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />}
              <span className="hidden sm:inline">{isEink ? 'Tryb E-Ink' : 'Clean Light'}</span>
            </button>

            {/* Primary Action Button: Connect / Disconnect Web BLE */}
            <button
              onClick={handleConnect}
              disabled={bleState.status === 'connecting' || bleState.status === 'searching'}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[38px] ${
                bleState.status === 'connected'
                  ? isEink
                    ? 'border-2 border-black bg-zinc-200 text-black hover:bg-zinc-300 font-bold'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : isEink
                  ? 'border-2 border-black bg-white text-black hover:bg-zinc-100 font-bold'
                  : 'bg-slate-900 text-white hover:bg-slate-800 shadow-xs'
              }`}
            >
              {bleState.status === 'connected' ? (
                <>
                  <BluetoothOff className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Rozłącz krążek</span>
                  <span className="sm:hidden">Rozłącz</span>
                </>
              ) : (
                <>
                  <Bluetooth className="w-3.5 h-3.5" />
                  <span>
                    {bleState.status === 'searching'
                      ? 'Szukanie...'
                      : bleState.status === 'connecting'
                      ? 'Łączenie...'
                      : (
                        <>
                          <span className="hidden sm:inline">Połącz z Triki BLE</span>
                          <span className="sm:hidden">Połącz</span>
                        </>
                      )}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Nav Switcher (Shown only on small viewports) */}
      <div
        className={`md:hidden w-full border-b px-2 py-1.5 flex items-center gap-1 overflow-x-auto text-xs no-scrollbar transition-colors ${
          isEink ? 'bg-white border-black text-black' : 'bg-white border-slate-200 text-slate-600'
        }`}
      >
        <button
          onClick={() => setLayoutMode('split')}
          className={`px-3 py-1.5 rounded-lg whitespace-nowrap min-h-[36px] font-medium transition-colors ${
            layoutMode === 'split'
              ? isEink
                ? 'border-2 border-black bg-zinc-200 text-black font-bold'
                : 'bg-slate-900 text-white shadow-xs'
              : isEink
              ? 'text-zinc-700 hover:text-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Laboratorium 3D
        </button>
        <button
          onClick={() => setLayoutMode('aviation')}
          className={`px-3 py-1.5 rounded-lg whitespace-nowrap min-h-[36px] font-medium transition-colors ${
            layoutMode === 'aviation'
              ? isEink
                ? 'border-2 border-black bg-zinc-200 text-black font-bold'
                : 'bg-slate-900 text-white shadow-xs'
              : isEink
              ? 'text-zinc-700 hover:text-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Sztuczny Horyzont
        </button>
        <button
          onClick={() => setLayoutMode('signal')}
          className={`px-3 py-1.5 rounded-lg whitespace-nowrap min-h-[36px] font-medium transition-colors ${
            layoutMode === 'signal'
              ? isEink
                ? 'border-2 border-black bg-zinc-200 text-black font-bold'
                : 'bg-slate-900 text-white shadow-xs'
              : isEink
              ? 'text-zinc-700 hover:text-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Sygnały IMU
        </button>
        <button
          onClick={() => setLayoutMode('rn-architecture')}
          className={`px-3 py-1.5 rounded-lg whitespace-nowrap min-h-[36px] font-medium transition-colors flex items-center gap-1 ${
            layoutMode === 'rn-architecture'
              ? isEink
                ? 'border-2 border-black bg-zinc-200 text-black font-bold'
                : 'bg-slate-900 text-white shadow-xs'
              : isEink
              ? 'text-zinc-700 hover:text-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Smartphone className="w-3 h-3" />
          <span>React Native</span>
        </button>
      </div>

      {/* Telemetry Status Strip */}
      <div
        className={`w-full border-b text-xs py-2 px-3 sm:px-6 transition-colors ${
          isEink ? 'bg-white border-black text-black' : 'bg-slate-100/70 border-slate-200 text-slate-600'
        }`}
      >
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 font-mono">
          {/* Status info bar */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-[11px] sm:text-xs">
            <span className="flex items-center gap-1.5 font-semibold">
              Status:{' '}
              <span
                className={
                  bleState.status === 'connected'
                    ? 'text-emerald-600'
                    : bleState.status === 'error'
                    ? 'text-rose-600'
                    : 'text-slate-500'
                }
              >
                {bleState.status === 'connected'
                  ? `POŁĄCZONO (${bleState.deviceName || 'CAP001'})`
                  : bleState.status === 'searching'
                  ? 'SZUKANIE...'
                  : bleState.status === 'connecting'
                  ? 'ŁĄCZENIE...'
                  : bleState.status === 'error'
                  ? 'BŁĄD'
                  : 'ROZŁĄCZONO'}
              </span>
            </span>
            <span aria-hidden="true" className="opacity-50">·</span>
            <span>{bleState.packetRateHz.toFixed(1)} Hz</span>
            <span aria-hidden="true" className="opacity-50">·</span>
            <span>{bleState.packetsReceived} pkt</span>
            {latestSample && (
              <>
                <span aria-hidden="true" className="opacity-50">·</span>
                <span
                  className={`px-1.5 py-0.2 rounded font-bold transition-colors ${
                    latestSample.button
                      ? isEink
                        ? 'border border-black bg-zinc-200 text-black'
                        : 'bg-emerald-600 text-white shadow-xs'
                      : isEink
                      ? 'border border-zinc-300 bg-white text-zinc-600'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {latestSample.button ? '● WCIŚNIĘTY' : '○ PUSZCZONY'} ({latestSample.buttonPressCount})
                </span>
              </>
            )}
            {latestSample?.batteryLevel !== undefined && (
              <>
                <span aria-hidden="true" className="opacity-50">·</span>
                <span>Bat: {latestSample.batteryLevel}%</span>
              </>
            )}
          </div>

          {/* Action Pills Strip (Scrollable horizontally on mobile) */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 whitespace-nowrap text-[11px] sm:text-xs">
            {/* Direct Start Stream Command Button */}
            {bleState.status === 'connected' && (
              <>
                <button
                  onClick={handleSendStartCommand}
                  className={`flex items-center gap-1 font-semibold px-2 py-1 rounded transition-colors ${
                    isEink
                      ? 'border border-black bg-white text-black hover:bg-zinc-100'
                      : 'bg-sky-600 text-white hover:bg-sky-700'
                  }`}
                  title="Wyślij komendę inicjalizacyjną 201000D007680003 do NUS RX"
                >
                  ▶ START
                </button>
                <button
                  onClick={handleToggleLed}
                  className={`flex items-center gap-1 px-2 py-1 rounded font-bold border transition-colors shadow-xs ${
                    ledOn
                      ? 'bg-amber-500 text-white border-amber-600 ring-1 ring-amber-300'
                      : isEink
                      ? 'border-black text-black bg-white hover:bg-zinc-100'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-200 bg-white'
                  }`}
                  title="Włącz lub wyłącz fizyczną diodę LED na krążku"
                >
                  <Lightbulb className={`w-3 h-3 ${ledOn ? 'fill-white text-white' : 'text-slate-400'}`} />
                  <span>LED: {ledOn ? 'ON' : 'OFF'}</span>
                </button>
                <button
                  onClick={handleTestBlink}
                  className={`text-[10px] px-1.5 py-1 rounded border transition-colors ${
                    isEink
                      ? 'border-black bg-white text-black hover:bg-zinc-100'
                      : 'border-amber-300 hover:bg-amber-100 text-amber-800'
                  }`}
                  title="Mignij 3 razy fizyczną diodą LED"
                >
                  Blink 3x
                </button>
              </>
            )}

            {/* Filter Settings Trigger Button */}
            <button
              onClick={() => setShowFilterSettings(true)}
              className={`flex items-center gap-1 px-2 py-1 rounded font-semibold border transition-colors ${
                isEink
                  ? 'border border-black bg-white text-black hover:bg-zinc-100'
                  : 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 shadow-xs'
              }`}
              title="Otwórz panel edycji parametrów filtracji sensorów IMU"
            >
              <Sliders className="w-3 h-3 text-indigo-600" />
              <span>Filtry</span>
            </button>

            {/* Tare Button */}
            <button
              onClick={handleResetOrientation}
              className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                isEink
                  ? 'border border-black bg-white text-black hover:bg-zinc-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              <span>Tare</span>
            </button>

            {/* Quick Calibration Trigger */}
            <button
              onClick={handleStartCalibration}
              disabled={isCalibrating}
              className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                isCalibrating ? 'opacity-60 cursor-not-allowed' : ''
              } ${
                isEink
                  ? 'border border-black bg-white text-black hover:bg-zinc-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>
                {isCalibrating
                  ? `Kalibracja (${calibration.samplesCollected}/150)...`
                  : calibration.isCalibrated
                  ? 'Skalibrowano'
                  : 'Kalibruj'}
              </span>
            </button>

            <button
              onClick={() => setShowDebugLogs(!showDebugLogs)}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-800 px-1.5 py-1"
            >
              <span>{showDebugLogs ? 'Ukryj Logi' : 'Logi'}</span>
            </button>
            <button
              onClick={() => setShowWebBleHelp(!showWebBleHelp)}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-800 px-1.5 py-1"
            >
              <HelpCircle className="w-3 h-3" />
              <span>Pomoc</span>
            </button>
          </div>
        </div>
      </div>

      {/* Connected but waiting for packets banner */}
      {bleState.status === 'connected' && bleState.packetsReceived === 0 && (
        <div className="max-w-[1440px] mx-auto w-full px-2.5 sm:px-6 pt-2.5 sm:pt-4">
          <div className="p-3 sm:p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs flex items-center justify-between flex-wrap gap-2.5">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Połączono z serwerem GATT Triki!</strong> Jeśli pakiety jeszcze nie spływają, krążek może być w stanie uśpienia. Kliknij przycisk obok, aby wysłać komendę startową (<code>20 10 00 D0 07 68 00 03</code>) lub wciśnij fizyczny przycisk na kapslu.
              </span>
            </div>
            <button
              onClick={handleSendStartCommand}
              className="px-3 py-1.5 rounded-lg bg-amber-700 text-white font-semibold hover:bg-amber-800 transition-colors whitespace-nowrap min-h-[36px]"
            >
              ▶ Wyślij komendę START do NUS RX
            </button>
          </div>
        </div>
      )}

      {/* Debug Logs Drawer */}
      {showDebugLogs && (
        <div className="max-w-[1440px] mx-auto w-full px-2.5 sm:px-6 pt-2.5 sm:pt-4">
          <div
            className={`p-3 rounded-xl border text-xs font-mono transition-colors ${
              isEink
                ? 'bg-white border-2 border-black text-black'
                : 'bg-slate-900 text-slate-300 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between font-bold text-slate-100 mb-2 pb-1 border-b border-slate-800">
              <span className="flex items-center gap-2 text-sky-400">
                Konsola diagnostyczna Web Bluetooth Triki:
              </span>
              <button
                onClick={() => setShowDebugLogs(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕ Zamknij
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1 text-[11px] leading-tight">
              {bleState.debugLogs.length === 0 ? (
                <div className="text-slate-500">Brak zdarzeń połączenia w buforze.</div>
              ) : (
                bleState.debugLogs.map((log, idx) => (
                  <div key={idx} className="font-mono">
                    {log}
                  </div>
                ))
              )}
            </div>
            {bleState.rawBytesHex && (
              <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-cyan-400">
                Ostatnia odebrana ramka HEX: <code>{bleState.rawBytesHex}</code>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Web Bluetooth Info / Error Banner */}
      {bleState.errorMessage && (
        <div className="max-w-[1440px] mx-auto w-full px-2.5 sm:px-6 pt-2.5 sm:pt-4">
          <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{bleState.errorMessage}</span>
            </div>
            <button
              onClick={() => setShowWebBleHelp(true)}
              className="underline font-semibold hover:text-rose-950 whitespace-nowrap"
            >
              Jak sparować Triki?
            </button>
          </div>
        </div>
      )}

      {/* Guide Banner for BLE Pairing */}
      {showWebBleHelp && (
        <div className="max-w-[1440px] mx-auto w-full px-2.5 sm:px-6 pt-2.5 sm:pt-4">
          <div
            className={`p-3.5 sm:p-4 rounded-xl border text-xs leading-relaxed transition-colors ${
              isEink
                ? 'bg-white border-2 border-black text-black'
                : 'bg-white border-slate-200 text-slate-700 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between font-bold text-slate-900 mb-2">
              <span className="flex items-center gap-2">
                <Bluetooth className="w-4 h-4 text-sky-600" />
                Jak podłączyć fizyczny krążek Żabka Triki (CAP001) przez Bluetooth:
              </span>
              <button
                onClick={() => setShowWebBleHelp(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕ Zamknij
              </button>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
              <li>
                <strong>Włącz Bluetooth</strong> w telefonie lub komputerze oraz upewnij się, że korzystasz z przeglądarki z obsługą Web Bluetooth (Google Chrome, Microsoft Edge, Opera lub Bluefy na iOS).
              </li>
              <li>
                <strong>Wybudź krążek Triki</strong> naciskając jego środkowy przycisk — dioda LED powinna zacząć mrugać lub świecić.
              </li>
              <li>
                Kliknij przycisk <strong>"Połącz"</strong> u góry ekranu. W oknie dialogowym wybierz urządzenie o nazwie <code>Triki</code>, <code>CAP001</code> lub kontroler Nordic UART.
              </li>
              <li>
                Po połączeniu strumień 98-100 Hz automatycznie zasili filtr Madgwicka, wykresy Skia oraz model 3D!
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Main Workspace Stage */}
      <main className="max-w-[1440px] mx-auto w-full px-2.5 sm:px-6 py-3 sm:py-6 flex-1 flex flex-col gap-3 sm:gap-6">
        {/* Layout 1: Split-Screen Lab (3D Viewport on Left + Skia Oscilloscope on Right) */}
        {layoutMode === 'split' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-6 items-stretch">
            {/* Left Column: 3D Viewport (7 cols) */}
            <div
              className={`lg:col-span-7 rounded-xl border min-h-[340px] sm:min-h-[460px] lg:min-h-[500px] p-1.5 sm:p-2 flex flex-col ${
                isEink ? 'bg-white border-2 border-black' : 'bg-white border-slate-200 shadow-xs'
              }`}
            >
              <Triki3DViewer
                latestSample={latestSample}
                theme={themeMode}
                onResetOrientation={handleResetOrientation}
                filterMode={filterMode}
                onFilterModeChange={setFilterMode}
                onOpenFilterSettings={() => setShowFilterSettings(true)}
              />
            </div>

            {/* Right Column: Skia Oscilloscope & Live Gauges (5 cols) */}
            <div className="lg:col-span-5 flex flex-col gap-3 sm:gap-6">
              <SkiaCanvasOscilloscope
                ringBuffer={sensorPipeline.getRingBuffer()}
                theme={themeMode}
                mode="both"
                height={200}
              />

              {/* Compact Quick Attitude & G-Meter */}
              <AviationHorizon sample={latestSample} theme={themeMode} />
            </div>
          </div>
        )}

        {/* Layout 2: Aviation Horizon & Telemetry */}
        {layoutMode === 'aviation' && (
          <div className="flex flex-col gap-3 sm:gap-6">
            <AviationHorizon sample={latestSample} theme={themeMode} />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-6 items-stretch">
              <div
                className={`lg:col-span-6 rounded-xl border p-1.5 sm:p-2 min-h-[320px] sm:min-h-[380px] flex flex-col ${
                  isEink ? 'bg-white border-2 border-black' : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <Triki3DViewer
                  latestSample={latestSample}
                  theme={themeMode}
                  onResetOrientation={handleResetOrientation}
                  filterMode={filterMode}
                  onFilterModeChange={setFilterMode}
                  onOpenFilterSettings={() => setShowFilterSettings(true)}
                />
              </div>
              <div className="lg:col-span-6">
                <SkiaCanvasOscilloscope
                  ringBuffer={sensorPipeline.getRingBuffer()}
                  theme={themeMode}
                  mode="accel"
                  height={240}
                />
              </div>
            </div>
          </div>
        )}

        {/* Layout 3: High-Density Signal Analysis */}
        {layoutMode === 'signal' && (
          <div className="flex flex-col gap-3 sm:gap-6">
            <SignalInspector
              sample={latestSample}
              theme={themeMode}
              packetRateHz={bleState.packetRateHz}
              packetsReceived={bleState.packetsReceived}
            />
            <SkiaCanvasOscilloscope
              ringBuffer={sensorPipeline.getRingBuffer()}
              theme={themeMode}
              mode="both"
              height={260}
            />
          </div>
        )}

        {/* Layout 4: Mobile Architecture & Blueprint (React Native + BLE Manager + Skia) */}
        {layoutMode === 'rn-architecture' && (
          <ReactNativeArchitectureModal
            theme={themeMode}
            onClose={() => setLayoutMode('split')}
          />
        )}
      </main>

      {/* Sensor Fusion & LPF Filter Configuration Modal */}
      <FilterSettingsModal
        isOpen={showFilterSettings}
        onClose={() => setShowFilterSettings(false)}
        config={filterConfig}
        onConfigChange={(partial) => sensorPipeline.updateFilterConfig(partial)}
        latestSample={latestSample}
        theme={themeMode}
      />

      {/* Clean Engineering Footer */}
      <footer
        className={`w-full border-t py-3 sm:py-4 px-3 sm:px-6 text-[11px] sm:text-xs transition-colors mt-auto ${
          isEink
            ? 'bg-white border-t-2 border-black text-black'
            : 'bg-white border-slate-200 text-slate-500'
        }`}
      >
        <div className="max-w-[1440px] mx-auto flex items-center justify-between flex-wrap gap-2 sm:gap-4 font-mono">
          <div>
            TrikiScope BLE Telemetry Station · Reverse-engineered protocol for Żabka Triki (CAP001)
          </div>
          <div className="flex items-center gap-3 sm:gap-4 text-slate-400">
            <span>Fuzja Madgwick AHRS</span>
            <span aria-hidden="true">·</span>
            <span>React Native Skia 2D</span>
            <span aria-hidden="true">·</span>
            <span>Three.js PBR</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
