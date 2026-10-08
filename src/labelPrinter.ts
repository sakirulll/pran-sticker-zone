// Printing labels straight to a label printer, without the operating system's
// printer driver.
//
// Small thermal label printers take TSPL commands: the label size, then a
// picture of the label one dot per bit, then "print". Phone label apps talk to
// them this way over Bluetooth, which is why they print correctly on printers
// whose Windows driver puts the print in the wrong place. This does the same
// from the browser: over Bluetooth (Web Bluetooth) or a serial port (Web Serial).

import { code128Modules } from "./barcode.ts";

export type LabelLine = { text: string; points: number; bold?: boolean };
export type LabelSpec = {
  /** Text above the barcode, top to bottom. */
  above: LabelLine[];
  /** What the barcode holds; "" for a label with no barcode. */
  code: string;
  /** Text below the barcode. */
  below: LabelLine[];
};
export type LabelLayout = {
  widthMm: number;
  heightMm: number;
  /** Height of the bars. */
  barsMm: number;
  /** Width of one barcode module, a whole number of printer dots. */
  moduleDots: number;
  /** Printer dots per millimetre: 8 for 203 dpi, 12 for 300 dpi. */
  dotsPerMm: number;
  /** Quarter turns clockwise. */
  turn: 0 | 90 | 180 | 270;
  offsetXMm: number;
  offsetYMm: number;
  /** Draws a line round the edge, for the test label. */
  border?: boolean;
};

/** A picture in printer dots, packed eight to a byte, most significant bit first. A set bit is a white dot. */
export type DotPicture = { widthBytes: number; height: number; data: Uint8Array };

/** Packs black-or-white pixels (true = black) into the bit layout TSPL's BITMAP command takes. */
export function packDots(black: boolean[] | Uint8Array, width: number, height: number): DotPicture {
  const widthBytes = Math.ceil(width / 8);
  // Start all white (every bit set), then clear the bit of each black dot.
  const data = new Uint8Array(widthBytes * height).fill(0xff);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (black[y * width + x]) data[y * widthBytes + (x >> 3)] &= ~(0x80 >> (x & 7));
    }
  }
  return { widthBytes, height, data };
}

/** The bytes that print `copies` of one picture on a label of the given size. */
export function tsplJob(picture: DotPicture, label: { widthMm: number; heightMm: number; gapMm: number; copies: number }): Uint8Array {
  const text = new TextEncoder();
  const head = text.encode(
    `SIZE ${label.widthMm} mm,${label.heightMm} mm\r\nGAP ${label.gapMm} mm,0 mm\r\nDIRECTION 1\r\nREFERENCE 0,0\r\nCLS\r\n`
    + `BITMAP 0,0,${picture.widthBytes},${picture.height},0,`,
  );
  const tail = text.encode(`\r\nPRINT ${Math.max(1, Math.floor(label.copies))},1\r\n`);
  const job = new Uint8Array(head.length + picture.data.length + tail.length);
  job.set(head, 0);
  job.set(picture.data, head.length);
  job.set(tail, head.length + picture.data.length);
  return job;
}

/**
 * Draws one label at the printer's own resolution, so every barcode bar is a
 * whole number of dots. Needs a browser (it draws on a canvas).
 */
export function drawLabel(spec: LabelSpec, layout: LabelLayout): DotPicture {
  const dots = (mm: number) => Math.round(mm * layout.dotsPerMm);
  const width = dots(layout.widthMm);
  const height = dots(layout.heightMm);
  const canvas = document.createElement("canvas");
  // The page printed is the label as the printer feeds it; a quarter turn swaps its sides.
  const sideways = layout.turn === 90 || layout.turn === 270;
  canvas.width = sideways ? height : width;
  canvas.height = sideways ? width : height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(dots(layout.offsetXMm), dots(layout.offsetYMm));
  if (layout.turn === 90) context.transform(0, 1, -1, 0, height, 0);
  if (layout.turn === 180) context.transform(-1, 0, 0, -1, width, height);
  if (layout.turn === 270) context.transform(0, -1, 1, 0, 0, width);

  context.fillStyle = "#000";
  context.textAlign = "center";
  context.textBaseline = "top";
  const side = dots(1.5);
  const room = width - side * 2;
  const pixels = (points: number) => Math.round(points / 72 * 25.4 * layout.dotsPerMm);
  const modules = spec.code ? code128Modules(spec.code) : null;
  const barsHeight = modules ? dots(layout.barsMm) : 0;
  const lineHeight = (line: LabelLine) => Math.round(pixels(line.points) * 1.15);
  const gap = modules ? dots(0.6) : 0;
  const total = [...spec.above, ...spec.below].reduce((sum, line) => sum + lineHeight(line), 0) + barsHeight + gap * 2;
  let y = Math.max(0, Math.round((height - total) / 2));

  const write = (line: LabelLine) => {
    let size = pixels(line.points);
    const font = () => `${line.bold ? "bold " : ""}${size}px Arial, Helvetica, sans-serif`;
    context.font = font();
    // A line too long for the label is drawn smaller rather than cut off.
    while (size > 8 && context.measureText(line.text).width > room) {
      size -= 1;
      context.font = font();
    }
    context.fillText(line.text, width / 2, y, room);
    y += lineHeight(line);
  };
  spec.above.forEach(write);
  if (modules) {
    y += gap;
    const barcodeWidth = modules.length * layout.moduleDots;
    const left = Math.max(0, Math.round((width - barcodeWidth) / 2));
    for (const run of modules.matchAll(/1+/g)) {
      context.fillRect(left + run.index * layout.moduleDots, y, run[0].length * layout.moduleDots, barsHeight);
    }
    y += barsHeight + gap;
  }
  spec.below.forEach(write);
  if (layout.border) {
    const line = Math.max(2, dots(0.4));
    context.fillRect(0, 0, width, line);
    context.fillRect(0, height - line, width, line);
    context.fillRect(0, 0, line, height);
    context.fillRect(width - line, 0, line, height);
  }

  const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const black = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < black.length; i++) {
    // Text edges are grey on a canvas; a printer dot is either on or off.
    black[i] = image[i * 4] * 0.299 + image[i * 4 + 1] * 0.587 + image[i * 4 + 2] * 0.114 < 140 ? 1 : 0;
  }
  return packDots(black, canvas.width, canvas.height);
}

// ---- Getting the bytes to the printer.

export type PrinterLink = { name: string; send: (bytes: Uint8Array) => Promise<void>; close: () => Promise<void> };

// The services cheap thermal printers offer for writing data over Bluetooth
// Low Energy. A page has to name the ones it wants before connecting.
const BLUETOOTH_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

export const canUseBluetooth = () => typeof navigator !== "undefined" && "bluetooth" in navigator;
export const canUseSerial = () => typeof navigator !== "undefined" && "serial" in navigator;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Asks the person to pick the printer among nearby Bluetooth devices and connects to it. */
export async function connectBluetooth(): Promise<PrinterLink> {
  const device = await (navigator as any).bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLUETOOTH_SERVICES });
  const server = await device.gatt.connect();
  // Browsers differ in how much of Web Bluetooth they have. Chrome can list every
  // service at once; the Bluetooth browsers for iPhone (Bluefy and the like) can
  // only be asked for one service by name, so fall back to trying each in turn.
  let services: any[] = [];
  try {
    services = await server.getPrimaryServices();
  } catch {
    services = [];
  }
  if (!services.length) {
    for (const uuid of BLUETOOTH_SERVICES) {
      try {
        services.push(await server.getPrimaryService(uuid));
      } catch {
        // The printer does not have this one; try the next.
      }
    }
  }
  let writer: any = null;
  for (const service of services) {
    let characteristics: any[] = [];
    try {
      characteristics = await service.getCharacteristics();
    } catch {
      characteristics = [];
    }
    for (const characteristic of characteristics) {
      if (!writer && (characteristic.properties.writeWithoutResponse || characteristic.properties.write)) writer = characteristic;
    }
  }
  if (!writer) {
    device.gatt.disconnect();
    throw new Error("This device does not accept print data over Bluetooth. Choose the label printer.");
  }
  const acknowledged = !writer.properties.writeWithoutResponse;
  // The older single "writeValue" is all some browsers offer.
  const put = async (part: Uint8Array) => {
    if (acknowledged && writer.writeValueWithResponse) return writer.writeValueWithResponse(part);
    if (!acknowledged && writer.writeValueWithoutResponse) await writer.writeValueWithoutResponse(part);
    else await writer.writeValue(part);
    await pause(12);
  };
  return {
    name: device.name || "Bluetooth printer",
    // Bluetooth carries little at a time, and a printer that is sent data faster than it can take drops it.
    send: async (bytes) => {
      const size = 120;
      for (let start = 0; start < bytes.length; start += size) await put(bytes.slice(start, start + size));
    },
    close: async () => { device.gatt.disconnect(); },
  };
}

/** Asks the person to pick the printer's serial (COM) port and opens it. */
export async function connectSerial(): Promise<PrinterLink> {
  const port = await (navigator as any).serial.requestPort();
  await port.open({ baudRate: 115200 });
  return {
    name: "Serial printer",
    send: async (bytes) => {
      const writer = port.writable.getWriter();
      try {
        await writer.write(bytes);
      } finally {
        writer.releaseLock();
      }
    },
    close: async () => { await port.close(); },
  };
}
