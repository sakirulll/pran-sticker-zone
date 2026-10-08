// Scanning barcodes with the device's camera.
//
// Shows the back camera in a panel on the page and reports each barcode it sees,
// staying on so several products can be scanned one after another. Where the browser
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

// A short beep, as a shop's scanner gives, so a scan is noticed without looking.
let sound: AudioContext | undefined;
function beep() {
  try {
    sound ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const tone = sound.createOscillator();
    const volume = sound.createGain();
    tone.frequency.value = 1500;
    volume.gain.value = 0.15;
    tone.connect(volume).connect(sound.destination);
    tone.start();
    tone.stop(sound.currentTime + 0.09);
  } catch {
    // No sound on this device; the message and the buzz still tell.
  }
}

/**
 * Shows the camera inside `holder` and calls `onCode` for each barcode scanned.
 * What `onCode` returns is shown under the camera in place of "Scanned: ...",
 * for naming the product or saying that a code was not recognised. Returns a
 * function that switches the camera off; `onClosed` is called when the person
 * closes it themselves. The camera also goes off when `holder` leaves the page.
 */
export function startScanner(holder: HTMLElement, onCode: (code: string) => string | void, onClosed?: () => void): () => void {
  const panel = document.createElement("div");
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "Scan a barcode");
  panel.style.cssText = "margin-top:8px;border-radius:10px;overflow:hidden;background:#000;color:#fff;font:14px/1.4 system-ui,sans-serif";
  panel.innerHTML = `
    <div style="position:relative;height:190px">
      <video playsinline muted autoplay style="display:block;width:100%;height:100%;object-fit:cover"></video>
      <div style="position:absolute;left:8%;right:8%;top:50%;height:2px;background:#ef4444;box-shadow:0 0 8px #ef4444"></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#111">
      <p data-scan-status aria-live="polite" style="flex:1;min-width:0;margin:0">Starting the camera…</p>
      <button type="button" data-scan-light hidden style="flex:0 0 auto;padding:7px 12px;border:1px solid #555;border-radius:8px;background:#222;color:#fff;font:inherit">Light</button>
      <button type="button" data-scan-done style="flex:0 0 auto;padding:7px 14px;border:0;border-radius:8px;background:#dc3f17;color:#fff;font:inherit;font-weight:700">Close</button>
    </div>`;
  holder.replaceChildren(panel);
  const video = panel.querySelector("video")!;
  const status = panel.querySelector<HTMLElement>("[data-scan-status]")!;
  const light = panel.querySelector<HTMLButtonElement>("[data-scan-light]")!;

  let stream: MediaStream | undefined;
  let open = true;
  const close = () => {
    open = false;
    stream?.getTracks().forEach((track) => track.stop());
    panel.remove();
  };
  panel.querySelector("[data-scan-done]")!.addEventListener("click", () => { close(); onClosed?.(); });

  const run = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    } catch (error) {
      const name = (error as Error)?.name;
      status.textContent = name === "NotAllowedError" || name === "SecurityError"
        ? "The camera is blocked. Allow the camera for this site in the browser's settings, then try again."
        : "No camera could be opened on this device.";
      return;
    }
    // It may have been closed, or the screen left, while the browser was still asking for permission.
    if (!open || !panel.isConnected) { close(); return; }
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
      // The screen it was on has been replaced by another.
      if (!panel.isConnected) { close(); return; }
      if (video.readyState >= 2 && video.videoWidth) {
        const code = (await find(video).catch(() => "")).trim();
        if (code && open) {
          const now = Date.now();
          if (code !== lastCode || now - lastSeen > REPEAT_AFTER) {
            navigator.vibrate?.(60);
            beep();
            status.textContent = onCode(code) || `Scanned: ${code}`;
          }
          lastCode = code;
          lastSeen = now;
        }
      }
      setTimeout(() => void look(), 140);
    };
    void look();
  };
  void run();
  return close;
}
