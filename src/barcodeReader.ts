// Reading a barcode out of a picture (a camera frame).
//
// Kept apart from the camera so it can be checked without one. The reading
// itself is done by ZXing, a long-established barcode library, which is loaded
// only when a scan is first needed.

type Zxing = typeof import("@zxing/library");
let library: Promise<Zxing> | undefined;

/** Makes a function that finds a barcode in a picture and gives its text, or "" when there is none. */
export async function makeReader(): Promise<(pixels: Uint8ClampedArray, width: number, height: number) => string> {
  library ??= import("@zxing/library");
  const zxing = await library;
  const reader = new zxing.MultiFormatReader();
  // The labels this app prints are Code 128; the rest are what products carry from the factory.
  reader.setHints(new Map<unknown, unknown>([
    [zxing.DecodeHintType.POSSIBLE_FORMATS, [
      zxing.BarcodeFormat.CODE_128, zxing.BarcodeFormat.EAN_13, zxing.BarcodeFormat.EAN_8,
      zxing.BarcodeFormat.UPC_A, zxing.BarcodeFormat.UPC_E, zxing.BarcodeFormat.CODE_39,
    ]],
    [zxing.DecodeHintType.TRY_HARDER, true],
  ]) as never);

  return (pixels, width, height) => {
    // ZXing wants brightness alone, one byte a dot.
    const brightness = new Uint8ClampedArray(width * height);
    for (let i = 0; i < brightness.length; i++) {
      brightness[i] = (pixels[i * 4] * 299 + pixels[i * 4 + 1] * 587 + pixels[i * 4 + 2] * 114) / 1000;
    }
    const attempt = (dots: Uint8ClampedArray) => {
      try {
        const picture = new zxing.BinaryBitmap(new zxing.HybridBinarizer(new zxing.RGBLuminanceSource(dots, width, height)));
        return reader.decodeWithState(picture).getText();
      } catch {
        // Nothing readable, which is the usual case while the camera is being aimed.
        return "";
      } finally {
        reader.reset();
      }
    };
    const found = attempt(brightness);
    if (found) return found;
    // A grainy picture in poor light: the bars run up and down, so averaging each dot
    // with the ones just above and below it removes much of the grain and none of the bars.
    const reach = 3;
    const smooth = new Uint8ClampedArray(width * height);
    for (let x = 0; x < width; x++) {
      let total = 0;
      let count = 0;
      for (let y = 0; y < Math.min(reach, height); y++) { total += brightness[y * width + x]; count++; }
      for (let y = 0; y < height; y++) {
        if (y + reach < height) { total += brightness[(y + reach) * width + x]; count++; }
        if (y - reach - 1 >= 0) { total -= brightness[(y - reach - 1) * width + x]; count--; }
        smooth[y * width + x] = total / count;
      }
    }
    return attempt(smooth);
  };
}
