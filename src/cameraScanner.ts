// Scanning barcodes with the device's camera.
//
// Opens the back camera over the page and reports each barcode it sees, staying
// open so several products can be scanned one after another. Where the browser
// can read barcodes itself (Chrome on Android) that is used; elsewhere, an
// iPhone included, frames are read by barcodeReader.ts.

import { makeReader } from "./barcodeReader";

export const canScanWithCamera = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

const FORMATS = ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39"];
// The same code is not reported again until this long after it was last seen, so
// holding the camera on a label adds one product, not one per frame.
const REPEAT_AFTER = 1800;

type Finder = (video: HTMLVideoElement) => Promise<string>;

async function makeFinder(): Promise<Finder> {
  const Native = (window as any).BarcodeDetector;
  if (Native) {
    try {
      const supported: string[] = await Native.getSupportedFormats();
      if (supported.includes("code_128")) {
        const detector = new Native({ formats: FORMATS.filter((format) => supported.includes(format)) });
        return async (video) => (await detector.detect(video))[0]?.rawValue || "";
      }
    } catch {
      // Present but unusable here; read the frames ourselves instead.
    }
  }
  const read = await makeReader();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  return async (video) => {
    // A frame about 900 dots wide is plenty for a barcode and quick to read.
    const scale = Math.min(1, 900 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return read(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  };
}

/**
 * Shows the camera over the page and calls `onCode` for each barcode scanned.
 * What `onCode` returns is shown under the camera in place of "Scanned: ...",
 * for saying that a code was not recognised. Resolves when the camera is
 * showing; the person closes it with Done.
 */
export async function openScanner(parent: HTMLElement, onCode: (code: string) => string | void): Promise<void> {
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Scan a barcode");
  overlay.style.cssText = "position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;background:#000;color:#fff;font:15px/1.4 system-ui,sans-serif";
  overlay.innerHTML = `
    <div style="position:relative;flex:1;min-height:0;overflow:hidden">
      <video playsinline muted autoplay style="width:100%;height:100%;object-fit:cover"></video>
      <div style="position:absolute;left:8%;right:8%;top:50%;height:2px;background:#ef4444;box-shadow:0 0 8px #ef4444"></div>
    </div>
    <div style="padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));background:#111;text-align:center">
      <p data-scan-status style="margin:0 0 10px;min-height:1.4em">Starting the camera…</p>
      <div style="display:flex;gap:10px;justify-content:center">
        <button type="button" data-scan-light hidden style="padding:11px 20px;border:1px solid #555;border-radius:8px;background:#222;color:#fff;font:inherit">Light</button>
        <button type="button" data-scan-done style="padding:11px 34px;border:0;border-radius:8px;background:#dc3f17;color:#fff;font:inherit;font-weight:700">Done</button>
      </div>
    </div>`;
  parent.append(overlay);
  const video = overlay.querySelector("video")!;
  const status = overlay.querySelector<HTMLElement>("[data-scan-status]")!;
  const light = overlay.querySelector<HTMLButtonElement>("[data-scan-light]")!;

  let stream: MediaStream | undefined;
  let open = true;
  const close = () => {
    open = false;
    stream?.getTracks().forEach((track) => track.stop());
    overlay.remove();
  };
  overlay.querySelector("[data-scan-done]")!.addEventListener("click", close);

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  } catch (error) {
    const name = (error as Error)?.name;
    status.textContent = name === "NotAllowedError" || name === "SecurityError"
      ? "The camera is blocked. Allow the camera for this site in the browser's settings, then try again."
      : "No camera could be opened on this device.";
    return;
  }
  // Done may have been pressed while the browser was still asking for permission.
  if (!open) { stream.getTracks().forEach((track) => track.stop()); return; }
  video.srcObject = stream;
  await video.play().catch(() => undefined);

  // A lamp, on phones whose camera has one that the browser may switch.
  const track = stream.getVideoTracks()[0];
  if ((track.getCapabilities?.() as any)?.torch) {
    let lit = false;
    light.hidden = false;
    light.addEventListener("click", () => {
      lit = !lit;
      void track.applyConstraints({ advanced: [{ torch: lit } as any] }).catch(() => undefined);
    });
  }

  let find: Finder;
  try {
    find = await makeFinder();
  } catch {
    status.textContent = "The barcode reader could not be loaded. Check the internet connection and try again.";
    return;
  }
  status.textContent = "Hold the red line across the barcode.";
  let lastCode = "";
  let lastSeen = 0;
  const look = async () => {
    if (!open) return;
    if (video.readyState >= 2 && video.videoWidth) {
      const code = (await find(video).catch(() => "")).trim();
      if (code && open) {
        const now = Date.now();
        if (code !== lastCode || now - lastSeen > REPEAT_AFTER) {
          navigator.vibrate?.(60);
          status.textContent = onCode(code) || `Scanned: ${code}`;
        }
        lastCode = code;
        lastSeen = now;
      }
    }
    setTimeout(() => void look(), 140);
  };
  void look();
}
