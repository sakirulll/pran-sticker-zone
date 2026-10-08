// Code 128 barcodes, drawn as SVG.
//
// Code 128 is what ordinary shop scanners read, and it can hold letters, digits
// and punctuation, so a product code such as "BS-001" fits as it is. This uses
// code set B (every printable ASCII character), or set C for all-digit codes.

// The widths of the six bars and spaces for each of the 107 symbols, in modules.
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const START_B = 104;
const START_C = 105;
const STOP = 106;
const QUIET_ZONE = 10;

/** Whether `text` can be put in a barcode: 1 to 40 printable ASCII characters. */
export function canEncode(text: string): boolean {
  return /^[\x20-\x7e]{1,40}$/.test(text);
}

/** The bars for `text` as a run of "1" (bar) and "0" (space) modules, or null if it cannot be encoded. */
export function code128Modules(text: string): string | null {
  if (!canEncode(text)) return null;
  // A code made only of digits packs two digits into each symbol (code set C),
  // which makes the barcode about half as wide and so easier to scan on a small label.
  const symbols = /^(\d\d){2,}$/.test(text)
    ? [START_C, ...(text.match(/\d\d/g) || []).map(Number)]
    : [START_B, ...[...text].map((character) => character.charCodeAt(0) - 32)];
  const checksum = symbols.reduce((sum, value, index) => sum + value * Math.max(index, 1), 0) % 103;
  let modules = "";
  for (const symbol of [...symbols, checksum, STOP]) {
    [...PATTERNS[symbol]].forEach((width, index) => {
      modules += (index % 2 === 0 ? "1" : "0").repeat(+width);
    });
  }
  return modules;
}

/** How many modules wide the barcode for `text` is, with the blank margin a scanner needs on each side; 0 if it cannot be encoded. */
export function code128Width(text: string): number {
  const modules = code128Modules(text);
  return modules ? modules.length + QUIET_ZONE * 2 : 0;
}

/**
 * How wide to print one module so the barcode fits in `availableMm`.
 *
 * A printer can only print whole dots. A bar whose width is not a whole number
 * of dots comes out a dot too wide or too narrow, unevenly, which is what makes
 * a printed barcode fail to scan. So the width is a whole number of the
 * printer's dots, at most about half a millimetre.
 *
 * quality: "good" scans reliably, "thin" may not scan on a cheap scanner, and
 * "none" means the code is too long to print on this width at all.
 */
export function fitModule(text: string, availableMm: number, dpi: number): { moduleMm: number; dots: number; quality: "good" | "thin" | "none" } {
  const total = code128Width(text);
  const dot = 25.4 / dpi;
  if (!total || availableMm <= 0) return { moduleMm: 0, dots: 0, quality: "none" };
  const fitting = Math.floor(availableMm / total / dot + 1e-9);
  if (fitting < 1) return { moduleMm: availableMm / total, dots: 0, quality: "none" };
  const dots = Math.min(fitting, Math.max(1, Math.round(0.5 / dot)));
  const moduleMm = dots * dot;
  return { moduleMm, dots, quality: moduleMm >= 0.19 ? "good" : "thin" };
}

/** An SVG picture of the barcode at an exact printed size, or "" if `text` cannot be encoded. */
export function code128Svg(text: string, heightMm: number, moduleMm: number): string {
  const modules = code128Modules(text);
  if (!modules) return "";
  let bars = "";
  // One rectangle per run of bar modules keeps the picture small and the edges crisp.
  for (const run of modules.matchAll(/1+/g)) {
    bars += `<rect x="${QUIET_ZONE + run.index}" y="0" width="${run[0].length}" height="1"/>`;
  }
  const width = modules.length + QUIET_ZONE * 2;
  const round = (value: number) => +value.toFixed(4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width * moduleMm)}mm" height="${round(heightMm)}mm" viewBox="0 0 ${width} 1" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Barcode ${text.replace(/[<>&"]/g, "")}">${bars}</svg>`;
}
