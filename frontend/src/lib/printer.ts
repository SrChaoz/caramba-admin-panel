// Define minimal interfaces for Web Bluetooth to clear TypeScript 'red lines'
// since @types/web-bluetooth is not installed.
interface BluetoothDevice {
  name?: string;
  id: string;
  gatt?: BluetoothRemoteGATTServer;
  addEventListener(type: string, listener: () => void): void;
}
interface BluetoothRemoteGATTServer {
  connect(): Promise<BluetoothRemoteGATTServer>;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
  disconnect(): void;
}
interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
}
interface BluetoothRemoteGATTCharacteristic {
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
}

declare global {
  interface Navigator {
    bluetooth: {
      requestDevice(options: { filters?: any[]; optionalServices?: any[]; acceptAllDevices?: boolean }): Promise<BluetoothDevice>;
    };
  }
}

const SERVICE_UUID = '0000ae30-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '0000ae01-0000-1000-8000-00805f9b34fb';

export class FunPrintDevice {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  public onStatusChange?: (status: 'connected' | 'disconnected' | 'connecting') => void;

  isConnected() {
    return !!(this.device && this.characteristic);
  }

  async connect() {
    if (typeof window === 'undefined') return false;
    
    // Check if Bluetooth is available (requires HTTPS or localhost in Chrome/Edge)
    if (!navigator.bluetooth) {
      const msg = 'Bluetooth no disponible. Razones posibles: \n1. Estás usando un navegador que no lo soporta (usa Chrome o Edge).\n2. El sitio no es seguro (usa localhost o HTTPS).\n3. El Bluetooth está desactivado en tu sistema.';
      console.warn('Navigator.bluetooth is undefined. Context:', {
        secureContext: window.isSecureContext,
        origin: window.location.origin,
        userAgent: navigator.userAgent
      });
      alert(msg);
      this.onStatusChange?.('disconnected');
      return false;
    }
    try {
      this.onStatusChange?.('connecting');
      
      // We switch to acceptAllDevices so the user can see all nearby devices
      // and manually pick the printer (often named MX05, X5, FunPrint, etc.)
      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID]
      });

      console.log('Selected device:', this.device?.name, this.device?.id);

      this.device?.addEventListener('gattserverdisconnected', () => {
        console.warn('Printer disconnected');
        alert('⚠️ La conexión con la impresora se ha perdido (posiblemente se apagó, se alejó o hubo un error interno). Por favor, presiona el botón "Conectar Impresora" de nuevo.');
        this.onStatusChange?.('disconnected');
        this.characteristic = null;
      });

      console.log('Connecting to GATT server...');
      const server = await this.device?.gatt?.connect();
      console.log('Fetching service:', SERVICE_UUID);
      const service = await server?.getPrimaryService(SERVICE_UUID);
      console.log('Fetching characteristic:', CHARACTERISTIC_UUID);
      this.characteristic = (await service?.getCharacteristic(CHARACTERISTIC_UUID)) || null;

      if (this.characteristic) {
        console.log('Printer ready to print!');
        this.onStatusChange?.('connected');
        return true;
      } else {
        throw new Error('Could not find print characteristic');
      }
    } catch (error) {
      console.error('Error connecting to printer:', error);
      alert('Error intentando conectar con la impresora. Verifica que esté encendida. Detalles: ' + (error as Error).message);
      this.onStatusChange?.('disconnected');
      return false;
    }
  }

  async autoConnect() {
    if (typeof window === 'undefined' || !navigator.bluetooth) return false;
    // La API getDevices es experimental y permite reconectar a dispositivos emparejados previamente sin abrir el selector
    if (typeof (navigator.bluetooth as any).getDevices === 'function') {
      try {
        const devices = await (navigator.bluetooth as any).getDevices();
        for (const device of devices) {
          // Asumimos que si tiene servicio o nombre, podemos intentar
          this.device = device;
          
          this.device?.addEventListener('gattserverdisconnected', () => {
            console.warn('Printer disconnected (autoConnect)');
            alert('⚠️ La conexión con la impresora se ha perdido. Por favor, re-conéctala.');
            this.onStatusChange?.('disconnected');
            this.characteristic = null;
          });

          this.onStatusChange?.('connecting');
          const server = await this.device?.gatt?.connect();
          const service = await server?.getPrimaryService(SERVICE_UUID);
          this.characteristic = (await service?.getCharacteristic(CHARACTERISTIC_UUID)) || null;

          if (this.characteristic) {
            console.log('Auto-connected successfully to printer!');
            this.onStatusChange?.('connected');
            return true;
          }
        }
      } catch (err) {
        console.warn('Silent auto-connect failed:', err);
        this.onStatusChange?.('disconnected');
        this.device = null;
        this.characteristic = null;
      }
    }
    return false;
  }

  disconnect() {
    this.device?.gatt?.disconnect();
  }

  private async writeChunked(data: Uint8Array) {
    if (!this.characteristic) return;
    const CHUNK_SIZE = 100;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      if (this.characteristic.writeValueWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.characteristic.writeValue(chunk);
      }
      await new Promise(r => setTimeout(r, 20)); // Gentle 20ms delay
    }
  }

  private createPacket(cmd: number, data: Uint8Array): Uint8Array {
    const crc8_table = [
      0x00, 0x07, 0x0e, 0x09, 0x1c, 0x1b, 0x12, 0x15, 0x38, 0x3f, 0x36, 0x31,
      0x24, 0x23, 0x2a, 0x2d, 0x70, 0x77, 0x7e, 0x79, 0x6c, 0x6b, 0x62, 0x65,
      0x48, 0x4f, 0x46, 0x41, 0x54, 0x53, 0x5a, 0x5d, 0xe0, 0xe7, 0xee, 0xe9,
      0xfc, 0xfb, 0xf2, 0xf5, 0xd8, 0xdf, 0xd6, 0xd1, 0xc4, 0xc3, 0xca, 0xcd,
      0x90, 0x97, 0x9e, 0x99, 0x8c, 0x8b, 0x82, 0x85, 0xa8, 0xaf, 0xa6, 0xa1,
      0xb4, 0xb3, 0xba, 0xbd, 0xc7, 0xc0, 0xc9, 0xce, 0xdb, 0xdc, 0xd5, 0xd2,
      0xff, 0xf8, 0xf1, 0xf6, 0xe3, 0xe4, 0xed, 0xea, 0xb7, 0xb0, 0xb9, 0xbe,
      0xab, 0xac, 0xa5, 0xa2, 0x8f, 0x88, 0x81, 0x86, 0x93, 0x94, 0x9d, 0x9a,
      0x27, 0x20, 0x29, 0x2e, 0x3b, 0x3c, 0x35, 0x32, 0x1f, 0x18, 0x11, 0x16,
      0x03, 0x04, 0x0d, 0x0a, 0x57, 0x50, 0x59, 0x5e, 0x4b, 0x4c, 0x45, 0x42,
      0x6f, 0x68, 0x61, 0x66, 0x73, 0x74, 0x7d, 0x7a, 0x89, 0x8e, 0x87, 0x80,
      0x95, 0x92, 0x9b, 0x9c, 0xb1, 0xb6, 0xbf, 0xb8, 0xad, 0xaa, 0xa3, 0xa4,
      0xf9, 0xfe, 0xf7, 0xf0, 0xe5, 0xe2, 0xeb, 0xec, 0xc1, 0xc6, 0xcf, 0xc8,
      0xdd, 0xda, 0xd3, 0xd4, 0x69, 0x6e, 0x67, 0x60, 0x75, 0x72, 0x7b, 0x7c,
      0x51, 0x56, 0x5f, 0x58, 0x4d, 0x4a, 0x43, 0x44, 0x19, 0x1e, 0x17, 0x10,
      0x05, 0x02, 0x0b, 0x0c, 0x21, 0x26, 0x2f, 0x28, 0x3d, 0x3a, 0x33, 0x34,
      0x4e, 0x49, 0x40, 0x47, 0x52, 0x55, 0x5c, 0x5b, 0x76, 0x71, 0x78, 0x7f,
      0x6a, 0x6d, 0x64, 0x63, 0x3e, 0x39, 0x30, 0x37, 0x22, 0x25, 0x2c, 0x2b,
      0x06, 0x01, 0x08, 0x0f, 0x1a, 0x1d, 0x14, 0x13, 0xae, 0xa9, 0xa0, 0xa7,
      0xb2, 0xb5, 0xbc, 0xbb, 0x96, 0x91, 0x98, 0x9f, 0x8a, 0x8d, 0x84, 0x83,
      0xde, 0xd9, 0xd0, 0xd7, 0xc2, 0xc5, 0xcc, 0xcb, 0xe6, 0xe1, 0xe8, 0xef,
      0xfa, 0xfd, 0xf4, 0xf3
    ];
    let crc = 0;
    for (let i = 0; i < data.length; i++) {
        crc = crc8_table[(crc ^ data[i]) & 0xff];
    }
    crc = crc & 0xff;

    const packet = new Uint8Array(2 + 4 + data.length + 2);
    packet[0] = 0x51; 
    packet[1] = 0x78;
    packet[2] = cmd;
    packet[3] = 0x00;
    packet[4] = data.length & 0xFF; // Payload length (must be < 255)
    packet[5] = 0x00; 
    packet.set(data, 6);
    packet[packet.length - 2] = crc;
    packet[packet.length - 1] = 0xFF;
    return packet;
  }

  async printCanvas(canvas: HTMLCanvasElement) {
    if (!this.characteristic) throw new Error('Printer not connected');
    console.log('--- STARTING ROBUST PRINT JOB ---');

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const width = 384; 
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Convert to monochrome bitmap (1 bit per pixel)
    // Important: Bits must be reversed (LSB first) for this printer class!
    const pixels = new Uint8Array((width * height) / 8);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const avg = (data[i] + data[i+1] + data[i+2]) / 3;
        // Increase threshold to 200 so gray/anti-aliased edges are printed as black
        const isBlack = avg < 200 ? 1 : 0;
        
        if (isBlack) {
          const byteIdx = Math.floor((y * width + x) / 8);
          // Bit reversal happens here. Instead of 7 - (x%8), we use x%8
          const bitIdx = x % 8; 
          pixels[byteIdx] |= (1 << bitIdx);
        }
      }
    }

    // 1. Send Init/Start command
    console.log('Sending Init Command...');
    await this.writeChunked(this.createPacket(0xA3, new Uint8Array([0x00]))); // Wake up / Init

    // 2. Medium Energy (so it's not invisible, but still fast)
    await this.writeChunked(this.createPacket(0xAF, new Uint8Array([0x00, 0x80]))); // 0x8000 Energy
    await this.writeChunked(this.createPacket(0xBE, new Uint8Array([0x01]))); // Apply Energy

    // 3. Send image in VERY SMALL bands (max payload size is 255 bytes limit)
    // Width is 384 pixels = 48 bytes.
    // 5 lines = 240 bytes (safe limit under 255)
    const BAND_HEIGHT = 5; 
    for (let y = 0; y < height; y += BAND_HEIGHT) {
      const currentHeight = Math.min(BAND_HEIGHT, height - y);
      const bandPixels = pixels.slice((y * width) / 8, ((y + currentHeight) * width) / 8);
      
      const packet = this.createPacket(0xA2, bandPixels); // 0xA2 = Draw Bitmap
      console.log(`Sending band ${y} to ${y+currentHeight}: ${packet.length} bytes`);
      await this.writeChunked(packet);
      
      // Crucial: Wait for the mechanical printhead to catch up! 
      // Si enviamos las bandas más rápido de lo que el rodillo puede escupir el papel, 
      // la memoria RAM microscópica de la impresora se llena, entra en pánico y apaga el Bluetooth.
      await new Promise(r => setTimeout(r, 50)); 
    }

    // 3. Send feed paper command (feed 100 dots = 0x64 0x00)
    console.log('Sending Feed Command...');
    await this.writeChunked(this.createPacket(0xA1, new Uint8Array([0x64, 0x00]))); 
    
    console.log('--- END PRINT JOB ---');
  }
}

export const printerInstance = new FunPrintDevice();
