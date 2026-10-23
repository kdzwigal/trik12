/**
 * Triki BLE Manager service for Web Bluetooth API
 * Reverse-engineered for Żabka Triki (CAP001) puck
 * Protocol: Nordic UART Service (NUS) & binary IMU stream
 * Based on Maku-hub/TrikiScope specifications
 */

import { RawSensorSample, BLEConnectionState, LedCommand } from '../types/triki';

// Nordic UART Service UUIDs
export const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NUS_RX_CHARACTERISTIC = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Write commands to Triki
export const NUS_TX_CHARACTERISTIC = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Notify IMU stream from Triki
export const NUS_LED_CHARACTERISTIC = '6e400004-b5a3-f393-e0a9-e50e24dcca9e'; // Read/Write LED control

// Triki official initialization start command from TrikiScope (starts IMU streaming at ~98 Hz)
// Hex: 20 10 00 D0 07 68 00 03
export const TRIKI_START_COMMAND_BYTES = new Uint8Array([
  0x20, 0x10, 0x00, 0xd0, 0x07, 0x68, 0x00, 0x03,
]);

export type PacketCallback = (sample: RawSensorSample) => void;
export type StateCallback = (state: BLEConnectionState) => void;

interface BluetoothDeviceWithGatt extends EventTarget {
  id: string;
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
  };
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
  disconnect(): void;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithResponse?(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

export class TrikiBleManager {
  private device: BluetoothDeviceWithGatt | null = null;
  private gattServer: BluetoothRemoteGATTServer | null = null;
  private txCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private rxCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private ledCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

  private onPacketCallback: PacketCallback | null = null;
  private onStateCallback: StateCallback | null = null;

  private packetsCount: number = 0;
  private lastRateCalcTime: number = performance.now();
  private lastPacketsCount: number = 0;
  private currentRateHz: number = 0;
  private rateIntervalId: number | null = null;
  private packetSequence: number = 0;

  // Triki hardware scale factors from TrikiScope:
  // Gyro: 131.0 LSB per deg/s
  // Accel: 2048.0 LSB per g
  private gyroScaleTriki: number = (1.0 / 131.0) * (Math.PI / 180.0); // in rad/s
  private accelScaleTriki: number = 1.0 / 2048.0; // in g

  private state: BLEConnectionState = {
    status: 'disconnected',
    packetsReceived: 0,
    packetRateHz: 0,
    latencyMs: 0,
    isWebBluetoothSupported: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
    debugLogs: [],
  };

  constructor() {
    this.startRateMonitor();
  }

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  public getState(): BLEConnectionState {
    return { ...this.state };
  }

  public onPacket(callback: PacketCallback): void {
    this.onPacketCallback = callback;
  }

  public onStateChange(callback: StateCallback): void {
    this.onStateCallback = callback;
  }

  public addLog(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${message}`;
    const newLogs = [entry, ...this.state.debugLogs].slice(0, 30);
    this.updateState({ debugLogs: newLogs });
    console.log(`[TrikiBLE] ${message}`);
  }

  private updateState(partial: Partial<BLEConnectionState>): void {
    this.state = { ...this.state, ...partial };
    if (this.onStateCallback) {
      this.onStateCallback(this.state);
    }
  }

  private startRateMonitor(): void {
    if (this.rateIntervalId !== null) return;
    this.rateIntervalId = window.setInterval(() => {
      const now = performance.now();
      const elapsedSec = (now - this.lastRateCalcTime) / 1000.0;
      if (elapsedSec > 0.5) {
        const packetsDelta = this.packetsCount - this.lastPacketsCount;
        this.currentRateHz = Math.round((packetsDelta / elapsedSec) * 10) / 10;
        this.lastPacketsCount = this.packetsCount;
        this.lastRateCalcTime = now;

        if (this.state.status === 'connected') {
          this.updateState({
            packetRateHz: this.currentRateHz,
            packetsReceived: this.packetsCount,
          });
        }
      }
    }, 500);
  }

  /**
   * Helper to write buffer with response or without response depending on browser support
   */
  private async writeCharacteristic(
    char: BluetoothRemoteGATTCharacteristic,
    buffer: BufferSource
  ): Promise<void> {
    if (char.writeValueWithoutResponse) {
      try {
        await char.writeValueWithoutResponse(buffer);
        return;
      } catch {
        // Fallback to writeValueWithResponse
      }
    }
    if (char.writeValueWithResponse) {
      try {
        await char.writeValueWithResponse(buffer);
        return;
      } catch {
        // Fallback to writeValue
      }
    }
    await char.writeValue(buffer);
  }

  /**
   * Send the official Triki start command (20 10 00 D0 07 68 00 03) to NUS RX
   */
  public async sendStartCommand(): Promise<boolean> {
    if (!this.rxCharacteristic) {
      this.addLog('Błąd: Charakterystyka NUS RX (0x6E400002) nie jest dostępna');
      return false;
    }

    try {
      this.addLog('Wysyłanie komendy startowej: 20 10 00 D0 07 68 00 03...');
      await this.writeCharacteristic(this.rxCharacteristic, TRIKI_START_COMMAND_BYTES);
      this.addLog('Komenda startowa wysłana pomyślnie. Triki powinien rozpocząć nadawanie IMU.');
      this.updateState({ lastCommandStatus: 'Wysłano komendę START (201000D007680003)' });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.addLog(`Błąd zapisu do NUS RX: ${msg}`);
      this.updateState({ lastCommandStatus: `Błąd zapisu START: ${msg}` });
      return false;
    }
  }

  /**
   * Request Bluetooth device and establish connection
   */
  public async connect(): Promise<void> {
    if (!this.isSupported()) {
      const err = 'Web Bluetooth API nie jest obsługiwane w tej przeglądarce. Użyj Chrome, Edge lub Opera.';
      this.updateState({ status: 'error', errorMessage: err });
      throw new Error(err);
    }

    try {
      this.updateState({ status: 'searching', errorMessage: undefined });
      this.addLog('Rozpoczęto skanowanie urządzeń BLE (NUS Service 0x6E400001)...');

      const nav = navigator as unknown as {
        bluetooth: {
          requestDevice(options: unknown): Promise<BluetoothDeviceWithGatt>;
        };
      };

      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          NUS_SERVICE_UUID,
          '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
          '0000180a-0000-1000-8000-00805f9b34fb', // Device Info
        ],
      });

      this.device = device;
      this.device.addEventListener('gattserverdisconnected', this.handleDisconnect);

      const deviceName = device.name || 'Triki Puck (CAP001)';
      this.addLog(`Wybrano urządzenie: ${deviceName} (ID: ${device.id})`);

      this.updateState({
        status: 'connecting',
        deviceName,
        deviceId: device.id,
      });

      if (!device.gatt) {
        throw new Error('GATT server niedostępny na urządzeniu');
      }

      this.addLog('Łączenie z serwerem GATT...');
      const gattServer = await device.gatt.connect();
      this.gattServer = gattServer;
      this.addLog('Serwer GATT połączony.');

      // Discover NUS service
      this.addLog(`Wyszukiwanie serwisu Nordic UART: ${NUS_SERVICE_UUID}...`);
      let nusService: BluetoothRemoteGATTService | null = null;
      try {
        nusService = await gattServer.getPrimaryService(NUS_SERVICE_UUID);
        this.addLog('Znaleziono serwis Nordic UART (NUS).');
      } catch {
        throw new Error('Nie znaleziono serwisu Nordic UART (NUS 0x6E400001) w wybranym urządzeniu.');
      }

      // Discover TX Characteristic (Notifications from Triki)
      this.addLog(`Wyszukiwanie TX Characteristic (Notify): ${NUS_TX_CHARACTERISTIC}...`);
      this.txCharacteristic = await nusService.getCharacteristic(NUS_TX_CHARACTERISTIC);
      this.txCharacteristic.addEventListener(
        'characteristicvaluechanged',
        this.handleCharacteristicValueChanged
      );

      this.addLog('Włączanie powiadomień TX (startNotifications)...');
      await this.txCharacteristic.startNotifications();
      this.addLog('Powiadomienia TX włączone pomyślnie!');

      // Discover RX Characteristic (Commands to Triki)
      try {
        this.addLog(`Wyszukiwanie RX Characteristic (Write): ${NUS_RX_CHARACTERISTIC}...`);
        this.rxCharacteristic = await nusService.getCharacteristic(NUS_RX_CHARACTERISTIC);
        this.addLog('Znaleziono RX Characteristic.');
      } catch (e) {
        console.warn('Triki RX characteristic niedostępna:', e);
        this.addLog('Ostrzeżenie: RX characteristic niedostępna');
      }

      // Discover LED Characteristic 6e400004
      try {
        this.ledCharacteristic = await nusService.getCharacteristic(NUS_LED_CHARACTERISTIC);
        this.addLog('Znaleziono LED Characteristic (0x6E400004).');
      } catch {
        // Optional
      }

      this.packetsCount = 0;
      this.lastPacketsCount = 0;
      this.lastRateCalcTime = performance.now();

      this.updateState({
        status: 'connected',
        serviceUuid: NUS_SERVICE_UUID,
        errorMessage: undefined,
      });

      // Send the Triki start command immediately
      this.addLog('Wysyłanie inicjalizacyjnej komendy START do Triki...');
      await this.sendStartCommand();

      // Send once again after 300ms to guarantee puck awakens
      setTimeout(async () => {
        if (this.gattServer?.connected && this.rxCharacteristic && this.packetsCount === 0) {
          this.addLog('Ponawianie komendy START po 300ms...');
          await this.sendStartCommand();
        }
      }, 300);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.addLog(`Błąd połączenia: ${message}`);
      this.updateState({
        status: 'error',
        errorMessage: message.includes('User cancelled')
          ? 'Anulowano wybór urządzenia BLE w oknie przeglądarki.'
          : message,
      });
      throw err;
    }
  }

  /**
   * Disconnect current device
   */
  public disconnect(): void {
    if (this.txCharacteristic) {
      try {
        this.txCharacteristic.removeEventListener(
          'characteristicvaluechanged',
          this.handleCharacteristicValueChanged
        );
        this.txCharacteristic.stopNotifications().catch(() => {});
      } catch (e) {
        console.warn('Error stopping notifications:', e);
      }
      this.txCharacteristic = null;
    }

    if (this.gattServer && this.gattServer.connected) {
      this.gattServer.disconnect();
    }
    this.gattServer = null;

    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect);
      this.device = null;
    }

    this.addLog('Rozłączono urządzenie BLE.');
    this.updateState({
      status: 'disconnected',
      packetRateHz: 0,
    });
  }

  private handleDisconnect = (): void => {
    this.addLog('Urządzenie Triki rozłączyło się.');
    this.updateState({
      status: 'disconnected',
      packetRateHz: 0,
      errorMessage: 'Urządzenie Triki zostało odłączone.',
    });
  };

  /**
   * Handle incoming BLE characteristic data notification
   */
  private handleCharacteristicValueChanged = (event: Event): void => {
    const target = event.target as unknown as { value?: DataView };
    if (!target || !target.value) return;

    const dataView = target.value;
    const now = performance.now();
    this.packetsCount++;

    const sample = this.parsePacket(dataView, now);
    if (sample && this.onPacketCallback) {
      this.onPacketCallback(sample);
    }
  };

  /**
   * Parse binary byte packet received from Triki puck
   *
   * Official Triki / TrikiScope 14-byte format:
   * Header: [0x22, btn_byte]
   * Gyroscope: gx (int16_le), gy (int16_le), gz (int16_le) [bytes 2..7] (131.0 LSB/deg/s)
   * Accelerometer: ax (int16_le), ay (int16_le), az (int16_le) [bytes 8..13] (2048.0 LSB/g)
   */
  public parsePacket(dataView: DataView, timestamp: number): RawSensorSample | null {
    const len = dataView.byteLength;
    if (len < 6) return null;

    const rawBytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);

    // Format hex string for debug
    const hex = Array.from(rawBytes)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');

    if (this.packetsCount === 1 || this.packetsCount % 50 === 0) {
      this.updateState({ rawBytesHex: hex });
    }

    let ax = 0;
    let ay = 0;
    let az = 0;
    let gx = 0;
    let gy = 0;
    let gz = 0;
    let button = false;
    let batteryLevel: number | undefined = undefined;

    // Check if packet matches official TrikiScope format (Header starts with 0x22)
    if (len >= 14 && dataView.getUint8(0) === 0x22) {
      // Byte 1: Button state flag (0 = released, non-zero = pressed)
      const btnByte = dataView.getUint8(1);
      button = (btnByte & 0x01) !== 0 || btnByte !== 0;

      // Bytes 2-7: Gyroscope X, Y, Z (int16_le)
      const rawGx = dataView.getInt16(2, true);
      const rawGy = dataView.getInt16(4, true);
      const rawGz = dataView.getInt16(6, true);
      gx = rawGx * this.gyroScaleTriki;
      gy = rawGy * this.gyroScaleTriki;
      gz = rawGz * this.gyroScaleTriki;

      // Bytes 8-13: Accelerometer X, Y, Z (int16_le)
      const rawAx = dataView.getInt16(8, true);
      const rawAy = dataView.getInt16(10, true);
      const rawAz = dataView.getInt16(12, true);
      ax = rawAx * this.accelScaleTriki;
      ay = rawAy * this.accelScaleTriki;
      az = rawAz * this.accelScaleTriki;
    } else {
      // General 14-byte or 12-byte fallback (in case custom emulator or alternative orientation)
      if (len >= 6) {
        const rawAx = dataView.getInt16(0, true);
        const rawAy = dataView.getInt16(2, true);
        const rawAz = dataView.getInt16(4, true);
        ax = rawAx / 2048.0;
        ay = rawAy / 2048.0;
        az = rawAz / 2048.0;
      }
      if (len >= 12) {
        const rawGx = dataView.getInt16(6, true);
        const rawGy = dataView.getInt16(8, true);
        const rawGz = dataView.getInt16(10, true);
        gx = (rawGx / 131.0) * (Math.PI / 180.0);
        gy = (rawGy / 131.0) * (Math.PI / 180.0);
        gz = (rawGz / 131.0) * (Math.PI / 180.0);
      }
      if (len >= 13) {
        button = (dataView.getUint8(12) & 0x01) !== 0;
      }
      if (len >= 14) {
        const bat = dataView.getUint8(13);
        if (bat <= 100) batteryLevel = bat;
      }
    }

    this.packetSequence++;

    return {
      timestamp,
      packetIndex: this.packetSequence,
      accel: { x: ax, y: ay, z: az },
      gyro: { x: gx, y: gy, z: gz },
      button,
      batteryLevel,
      rawBytes,
    };
  }

  /**
   * Toggle LED on characteristic 6e400004 or via command
   */
  public async toggleLed(enable: boolean): Promise<void> {
    const val = new Uint8Array([enable ? 0x01 : 0x00]);
    if (this.ledCharacteristic) {
      try {
        await this.writeCharacteristic(this.ledCharacteristic, val);
        this.addLog(`Ustawiono diodę LED na: ${enable ? 'WŁĄCZONA' : 'WYŁĄCZONA'}`);
        return;
      } catch (err) {
        console.warn('Błąd zapisu do charakterystyki LED:', err);
      }
    }

    if (this.rxCharacteristic) {
      try {
        await this.writeCharacteristic(this.rxCharacteristic, val);
      } catch (err) {
        console.warn('Błąd zapisu do RX dla LED:', err);
      }
    }
  }

  /**
   * Send RGB LED command to Triki puck
   */
  public async sendLedCommand(cmd: LedCommand): Promise<void> {
    if (this.ledCharacteristic) {
      const isBright = cmd.brightness > 50 && (cmd.r > 50 || cmd.g > 50 || cmd.b > 50);
      await this.toggleLed(isBright);
      return;
    }

    if (this.rxCharacteristic) {
      try {
        const buffer = new Uint8Array([0x02, cmd.r, cmd.g, cmd.b, cmd.brightness]);
        await this.writeCharacteristic(this.rxCharacteristic, buffer);
      } catch (err) {
        console.warn('Błąd wysyłania komendy LED:', err);
      }
    }
  }
}

// Global singleton instance
export const trikiBle = new TrikiBleManager();
