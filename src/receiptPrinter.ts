// Sale receipts as a picture, for sending straight to a receipt printer or
// sharing with a printer's own app.
//
// The receipt is drawn at the printer's resolution and sent as a picture, so
// it prints the same on any printer and in any language, Bangla included,
// whatever fonts the printer has built in. Two printer languages are covered:
// ESC/POS, which ordinary receipt printers take, and TSPL, which label printers
// take (see labelPrinter.ts).

import { packDots, type DotPicture } from "./labelPrinter.ts";

export type Receipt = {
  shop: string;
  /** Lines under the shop name: phone, address, the receipt's title. */
  header: string[];
  /** Label and value pairs: invoice number, date, customer... */
  details: [label: string, value: string][];
  items: { name: string; qty: number; price: string; total: string; note?: string }[];
  totals: { label: string; value: string; strong?: boolean }[];
  footer: string;
};

/** Printable dots across the paper: 58 mm paper prints 48 mm, 80 mm paper prints 72 mm, at 8 dots per mm. */
export const PAPER_DOTS: Record<number, number> = { 58: 384, 80: 576 };

type Step = { height: number; draw: (context: CanvasRenderingContext2D, y: number) => void };

/** Draws a receipt `width` dots wide and as tall as it needs. Needs a browser (it draws on a canvas). */
export function drawReceipt(receipt: Receipt, width: number): DotPicture {
  const edge = Math.round(width * 0.02);
  const room = width - edge * 2;
  // Sized so about 32 characters fit across 58 mm paper, as on a usual receipt.
  const base = Math.round(width / 16);
  const font = (size: number, bold = false) => `${bold ? "bold " : ""}${size}px Arial, Helvetica, sans-serif`;
  const measure = document.createElement("canvas").getContext("2d")!;

  // Breaks text into lines that fit, at spaces where it can and inside a long word where it must.
  const wrap = (text: string, style: string, limit: number): string[] => {
    measure.font = style;
    const lines: string[] = [];
    let line = "";
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
      const joined = line ? `${line} ${word}` : word;
      if (measure.measureText(joined).width <= limit) { line = joined; continue; }
      if (line) lines.push(line);
      line = word;
      while (measure.measureText(line).width > limit && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && measure.measureText(line.slice(0, cut)).width > limit) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };

  const steps: Step[] = [];
  const gap = (height: number) => steps.push({ height, draw: () => undefined });
  const centred = (text: string, size: number, bold = false) => {
    if (!text) return;
    for (const line of wrap(text, font(size, bold), room)) {
      steps.push({ height: Math.round(size * 1.25), draw: (context, y) => { context.font = font(size, bold); context.textAlign = "center"; context.fillText(line, width / 2, y); } });
    }
  };
  // A label on the left and a value on the right; a long label wraps and the value stays on its first line.
  const pair = (label: string, value: string, size: number, bold = false) => {
    measure.font = font(size, bold);
    const valueWidth = measure.measureText(value).width;
    wrap(label, font(size, bold), Math.max(room * 0.35, room - valueWidth - base)).forEach((line, index) => {
      steps.push({ height: Math.round(size * 1.3), draw: (context, y) => {
        context.font = font(size, bold);
        context.textAlign = "left";
        context.fillText(line, edge, y);
        if (index === 0) { context.textAlign = "right"; context.fillText(value, width - edge, y); }
      } });
    });
  };
  const rule = () => steps.push({ height: Math.round(base * 0.7), draw: (context, y) => {
    for (let x = edge; x < width - edge; x += 8) context.fillRect(x, y + Math.round(base * 0.3), 5, 2);
  } });

  gap(edge);
  centred(receipt.shop, Math.round(base * 1.5), true);
  receipt.header.forEach((line) => centred(line, base));
  rule();
  receipt.details.forEach(([label, value]) => pair(label, value, base));
  rule();
  for (const item of receipt.items) {
    // The name gets the full width, then quantity and price under it with the line total at the right.
    wrap(item.name, font(base, true), room).forEach((line) => steps.push({ height: Math.round(base * 1.3), draw: (context, y) => { context.font = font(base, true); context.textAlign = "left"; context.fillText(line, edge, y); } }));
    pair(`  ${item.qty} x ${item.price}`, item.total, base);
    if (item.note) wrap(item.note, font(Math.round(base * 0.85)), room - base).forEach((line) => steps.push({ height: Math.round(base * 1.1), draw: (context, y) => { context.font = font(Math.round(base * 0.85)); context.textAlign = "left"; context.fillText(line, edge + base, y); } }));
  }
  if (!receipt.items.length) centred("-", base);
  rule();
  receipt.totals.forEach((total) => pair(total.label, total.value, total.strong ? Math.round(base * 1.25) : base, total.strong));
  rule();
  centred(receipt.footer, base, true);
  // Blank paper at the end, so the last line clears the tear bar.
  gap(base * 3);

  const height = steps.reduce((sum, step) => sum + step.height, 0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#000";
  context.textBaseline = "top";
  let y = 0;
  for (const step of steps) {
    step.draw(context, y);
    y += step.height;
  }
  const image = context.getImageData(0, 0, width, height).data;
  const black = new Uint8Array(width * height);
  for (let i = 0; i < black.length; i++) {
    black[i] = image[i * 4] * 0.299 + image[i * 4 + 1] * 0.587 + image[i * 4 + 2] * 0.114 < 140 ? 1 : 0;
  }
  return packDots(black, width, height);
}

/** The picture on a canvas, black on white, for showing on screen or saving as an image. Needs a browser. */
export function pictureCanvas(picture: DotPicture): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = picture.widthBytes * 8;
  canvas.height = picture.height;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < picture.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const white = picture.data[y * picture.widthBytes + (x >> 3)] & (0x80 >> (x & 7));
      const at = (y * canvas.width + x) * 4;
      image.data[at] = image.data[at + 1] = image.data[at + 2] = white ? 255 : 0;
      image.data[at + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/**
 * The bytes that print a picture on an ESC/POS receipt printer, then feed and cut.
 * The picture goes in bands, because a small printer cannot hold a long one at once.
 */
export function escposJob(picture: DotPicture, bandRows = 96): Uint8Array {
  const parts: number[] = [0x1b, 0x40]; // start afresh
  for (let top = 0; top < picture.height; top += bandRows) {
    const rows = Math.min(bandRows, picture.height - top);
    // GS v 0: a raster picture, its width in bytes and height in dots, low byte first.
    parts.push(0x1d, 0x76, 0x30, 0x00, picture.widthBytes & 0xff, picture.widthBytes >> 8, rows & 0xff, rows >> 8);
    const band = picture.data.subarray(top * picture.widthBytes, (top + rows) * picture.widthBytes);
    // ESC/POS prints a set bit; the picture keeps a set bit for white.
    for (const byte of band) parts.push(~byte & 0xff);
  }
  parts.push(0x1b, 0x64, 0x02); // feed two lines
  parts.push(0x1d, 0x56, 0x42, 0x00); // cut, on printers that have a cutter
  return Uint8Array.from(parts);
}

/** The bytes that print a picture on a TSPL printer loaded with plain (gapless) paper. */
export function tsplReceiptJob(picture: DotPicture, dotsPerMm = 8): Uint8Array {
  const text = new TextEncoder();
  const mm = (dots: number) => +(dots / dotsPerMm).toFixed(1);
  const head = text.encode(
    `SIZE ${mm(picture.widthBytes * 8)} mm,${mm(picture.height)} mm\r\nGAP 0 mm,0 mm\r\nDIRECTION 1\r\nREFERENCE 0,0\r\nCLS\r\n`
    + `BITMAP 0,0,${picture.widthBytes},${picture.height},0,`,
  );
  const tail = text.encode("\r\nPRINT 1,1\r\n");
  const job = new Uint8Array(head.length + picture.data.length + tail.length);
  job.set(head, 0);
  job.set(picture.data, head.length);
  job.set(tail, head.length + picture.data.length);
  return job;
}
