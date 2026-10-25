// Draws the printable "Scan to join" poster for the barangay system QR code:
// A4 portrait at 300 dpi (2480 x 3508 px), so it prints sharp on A4 and can
// be scaled up to A3. Everything is drawn with canvas vector calls (no
// external artwork), the barangay seal is the only image besides the QR.

const W = 2480;
const H = 3508;
const NAVY = "#071B33";
const NAVY_2 = "#0D2747";
const GOLD = "#E8B84A";
const TEAL = "#0E7C7B";
const MINT = "#4FBEB0";
const INK = "#0F2A4A";
const SKIN = "#F1C9A5";
const SKIN_SHADE = "#DDA97F";
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

type Ctx = CanvasRenderingContext2D;

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const spaced = (ctx: Ctx, px: number) => {
  const c = ctx as unknown as { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${px}px`;
};

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Four gold corner brackets around a box: the "scan target" look.
function brackets(ctx: Ctx, x: number, y: number, w: number, h: number, len: number, lw: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pts: [number, number, number, number][] = [
    [x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of pts) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * len);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * len, cy);
    ctx.stroke();
  }
  ctx.restore();
}

function capsule(ctx: Ctx, x: number, y: number, w: number, h: number) {
  rr(ctx, x, y, w, h, Math.min(w, h) / 2);
}

// A phone held in a hand (flat illustration), drawn around its own origin
// (0,0 = centre of the phone) and then rotated/placed by the caller.
function drawHandAndPhone(ctx: Ctx) {
  const PW = 620;
  const PH = 1240;
  const px = -PW / 2;
  const py = -PH / 2;

  // forearm / sleeve (behind everything), running off the bottom
  ctx.save();
  const sleeve = ctx.createLinearGradient(0, py + PH - 120, 0, py + PH + 270);
  sleeve.addColorStop(0, TEAL);
  sleeve.addColorStop(0.6, "rgba(14,124,123,0.9)");
  sleeve.addColorStop(1, "rgba(14,124,123,0)");
  ctx.fillStyle = sleeve;
  ctx.beginPath();
  ctx.moveTo(px + 90, py + PH - 120);
  ctx.lineTo(px + PW - 60, py + PH - 120);
  ctx.lineTo(px + PW + 50, py + PH + 270);
  ctx.lineTo(px + 10, py + PH + 270);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.moveTo(px + 60, py + PH + 40);
  ctx.lineTo(px + PW - 10, py + PH + 40);
  ctx.lineTo(px + PW - 2, py + PH + 78);
  ctx.lineTo(px + 72, py + PH + 78);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // wrist + palm (behind the phone)
  ctx.fillStyle = SKIN;
  rr(ctx, px + 70, py + PH - 520, PW - 120, 470, 140);
  ctx.fill();
  ctx.fillStyle = SKIN_SHADE;
  rr(ctx, px + 120, py + PH - 130, PW - 220, 90, 40);
  ctx.fill();

  // phone body
  ctx.save();
  ctx.shadowColor = "rgba(7,27,51,0.35)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 30;
  ctx.fillStyle = NAVY;
  rr(ctx, px, py, PW, PH, 96);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#1B3B63";
  ctx.lineWidth = 6;
  rr(ctx, px + 3, py + 3, PW - 6, PH - 6, 94);
  ctx.stroke();

  // screen
  const sx = px + 30;
  const sy = py + 30;
  const sw = PW - 60;
  const sh = PH - 60;
  ctx.save();
  rr(ctx, sx, sy, sw, sh, 70);
  ctx.clip();
  const sg = ctx.createLinearGradient(0, sy, 0, sy + sh);
  sg.addColorStop(0, "#EAF6F3");
  sg.addColorStop(1, "#FFFFFF");
  ctx.fillStyle = sg;
  ctx.fillRect(sx, sy, sw, sh);

  // top app bar
  ctx.fillStyle = NAVY_2;
  ctx.fillRect(sx, sy, sw, 190);
  ctx.fillStyle = GOLD;
  ctx.fillRect(sx, sy + 190, sw, 8);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  capsule(ctx, sx + sw / 2 - 70, sy + 26, 140, 30); // speaker slot
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.font = `800 44px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  spaced(ctx, 3);
  ctx.fillText("PIAO CONNECT", sx + sw / 2, sy + 120);
  spaced(ctx, 0);

  // mini viewfinder with a QR-like pattern and a scan line
  const vx = sx + 80;
  const vy = sy + 320;
  const vs = sw - 160;
  ctx.fillStyle = "#FFFFFF";
  rr(ctx, vx, vy, vs, vs, 30);
  ctx.fill();
  ctx.fillStyle = INK;
  const cell = vs / 15;
  const rnd = (i: number) => { const v = Math.sin(i * 12.9898) * 43758.5453; return v - Math.floor(v); };
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const inFinder = (r < 5 && c < 5) || (r < 5 && c > 9) || (r > 9 && c < 5);
      if (inFinder) continue;
      if (rnd(r * 15 + c + 3) > 0.52) ctx.fillRect(vx + c * cell + 2, vy + r * cell + 2, cell - 4, cell - 4);
    }
  }
  const finder = (fx: number, fy: number) => {
    ctx.fillStyle = INK;
    ctx.fillRect(fx, fy, cell * 4.6, cell * 4.6);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(fx + cell * 0.7, fy + cell * 0.7, cell * 3.2, cell * 3.2);
    ctx.fillStyle = INK;
    ctx.fillRect(fx + cell * 1.4, fy + cell * 1.4, cell * 1.8, cell * 1.8);
  };
  finder(vx + cell * 0.2, vy + cell * 0.2);
  finder(vx + cell * 10.2, vy + cell * 0.2);
  finder(vx + cell * 0.2, vy + cell * 10.2);
  // scan line
  const lg = ctx.createLinearGradient(vx, 0, vx + vs, 0);
  lg.addColorStop(0, "rgba(79,190,176,0)");
  lg.addColorStop(0.5, "rgba(14,124,123,0.95)");
  lg.addColorStop(1, "rgba(79,190,176,0)");
  ctx.fillStyle = lg;
  ctx.fillRect(vx - 10, vy + vs * 0.52, vs + 20, 14);
  brackets(ctx, vx - 24, vy - 24, vs + 48, vs + 48, 90, 16, GOLD);

  // status line above the viewfinder
  ctx.fillStyle = TEAL;
  ctx.font = `800 50px ${FONT}`;
  ctx.fillText("Scanning…", sx + sw / 2, sy + 268);
  ctx.restore();

  // fingers wrapping around the right edge (in front of the phone)
  const fingerH = 128;
  for (let i = 0; i < 4; i++) {
    const fy = py + PH - 700 + i * (fingerH + 14);
    const len = 190 - i * 14;
    ctx.fillStyle = SKIN;
    capsule(ctx, px + PW - 90, fy, len, fingerH);
    ctx.fill();
    ctx.strokeStyle = SKIN_SHADE;
    ctx.lineWidth = 7;
    capsule(ctx, px + PW - 90, fy, len, fingerH);
    ctx.stroke();
  }

  // thumb on the left, resting over the lower screen edge
  ctx.save();
  ctx.translate(px + 40, py + PH - 330);
  ctx.rotate(-0.55);
  ctx.fillStyle = SKIN;
  capsule(ctx, -80, -70, 360, 150);
  ctx.fill();
  ctx.strokeStyle = SKIN_SHADE;
  ctx.lineWidth = 7;
  capsule(ctx, -80, -70, 360, 150);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  capsule(ctx, 190, -42, 72, 92); // thumbnail
  ctx.fill();
  ctx.restore();
}

function wrapText(ctx: Ctx, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else { line = test; }
  }
  if (line) lines.push(line);
  return lines;
}

export interface PosterOptions {
  /** The QR code, as an image/canvas already drawn at a large size. */
  qr: CanvasImageSource;
  /** Shown small under the QR, e.g. the portal address. */
  url?: string;
  /** Overridable copy (kept in English on the printed poster). */
  logoSrc?: string;
}

export async function renderSystemQrPoster({ qr, url, logoSrc = "/logo-removebg-preview.png" }: PosterOptions): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  const logo = await loadImage(logoSrc);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // ---- paper ----
  ctx.fillStyle = "#F6FAF8";
  ctx.fillRect(0, 0, W, H);
  // soft decorative circles
  ctx.save();
  ctx.fillStyle = "rgba(79,190,176,0.10)";
  ctx.beginPath(); ctx.arc(W - 120, 1500, 520, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(232,184,74,0.12)";
  ctx.beginPath(); ctx.arc(160, 2750, 460, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (logo) {
    ctx.globalAlpha = 0.045;
    ctx.drawImage(logo, W / 2 - 800, 1500, 1600, 1600);
    ctx.globalAlpha = 1;
  }

  // ---- header band ----
  const hg = ctx.createLinearGradient(0, 0, W, 0);
  hg.addColorStop(0, NAVY);
  hg.addColorStop(1, NAVY_2);
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, W, 540);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 540, W, 20);

  const sealX = 330;
  const sealY = 270;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath(); ctx.arc(sealX, sealY, 190, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 12; ctx.stroke();
  if (logo) ctx.drawImage(logo, sealX - 160, sealY - 160, 320, 320);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const tx = 600;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `600 50px ${FONT}`;
  spaced(ctx, 6);
  ctx.fillText("REPUBLIC OF THE PHILIPPINES", tx, 150);
  spaced(ctx, 1);
  ctx.font = `500 54px ${FONT}`;
  ctx.fillText("Province of Zamboanga del Norte", tx, 225);
  ctx.fillText("Municipality of President Manuel A. Roxas", tx, 300);
  ctx.fillStyle = GOLD;
  ctx.font = `900 170px ${FONT}`;
  spaced(ctx, 8);
  ctx.fillText("BARANGAY PIAO", tx, 470);
  spaced(ctx, 0);

  // ---- headline ----
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `900 290px ${FONT}`;
  spaced(ctx, 6);
  ctx.fillText("SCAN TO JOIN", W / 2, 900);
  spaced(ctx, 4);
  ctx.fillStyle = TEAL;
  ctx.font = `800 120px ${FONT}`;
  ctx.fillText("BARANGAY e-MEMBERSHIP", W / 2, 1060);
  spaced(ctx, 0);
  ctx.fillStyle = "#4B5B70";
  ctx.font = `500 66px ${FONT}`;
  ctx.fillText("Open your phone camera, point it at the code, and get started.", W / 2, 1170);

  // ---- QR card (left) ----
  const cardX = 230;
  const cardY = 1330;
  const cardS = 1150;
  ctx.save();
  ctx.shadowColor = "rgba(15,42,74,0.28)";
  ctx.shadowBlur = 90;
  ctx.shadowOffsetY = 34;
  ctx.fillStyle = "#FFFFFF";
  rr(ctx, cardX, cardY, cardS, cardS, 90);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 14;
  rr(ctx, cardX, cardY, cardS, cardS, 90);
  ctx.stroke();

  const qrS = 940;
  const qrX = cardX + (cardS - qrS) / 2;
  const qrY = cardY + (cardS - qrS) / 2;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(qrX - 10, qrY - 10, qrS + 20, qrS + 20);
  ctx.imageSmoothingEnabled = false; // keep the QR modules razor sharp
  ctx.drawImage(qr, qrX, qrY, qrS, qrS);
  ctx.imageSmoothingEnabled = true;
  brackets(ctx, cardX - 55, cardY - 55, cardS + 110, cardS + 110, 190, 30, GOLD);

  // caption under the QR card
  ctx.fillStyle = INK;
  ctx.font = `800 78px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("Aim your camera here", cardX + cardS / 2, cardY + cardS + 190);
  if (url) {
    ctx.fillStyle = "#5B6778";
    ctx.font = `500 52px ${FONT}`;
    let shown = url.replace(/^https?:\/\//, "");
    while (ctx.measureText(shown).width > cardS + 40 && shown.length > 8) shown = shown.slice(0, -2);
    ctx.fillText(shown, cardX + cardS / 2, cardY + cardS + 275);
  }

  // ---- hand + phone (right) ----
  ctx.save();
  ctx.translate(1830, 1900);
  ctx.rotate(0.12);
  drawHandAndPhone(ctx);
  ctx.restore();
  // dotted beam from the phone towards the QR card
  ctx.save();
  ctx.strokeStyle = MINT;
  ctx.lineWidth = 16;
  ctx.setLineDash([2, 34]);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(1500, 1700);
  ctx.quadraticCurveTo(1440, 1560, 1395, 1500);
  ctx.stroke();
  ctx.restore();

  // ---- how it works ----
  const stepsY = 2910;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.font = `800 70px ${FONT}`;
  spaced(ctx, 8);
  ctx.fillText("HOW IT WORKS", W / 2, stepsY);
  spaced(ctx, 0);
  const steps = [
    ["1", "Scan the code", "Use your phone camera. No app to install."],
    ["2", "Sign in", "Use the user code from the Barangay Hall."],
    ["3", "Join events", "See events, show your member QR, give feedback."],
  ];
  const colW = (W - 460) / 3;
  steps.forEach(([n, title, text], i) => {
    const cx = 230 + colW * i + colW / 2;
    const cy = stepsY + 130;
    ctx.fillStyle = i === 1 ? GOLD : TEAL;
    ctx.beginPath(); ctx.arc(cx - colW / 2 + 90, cy, 62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = i === 1 ? NAVY : "#FFFFFF";
    ctx.font = `900 74px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n, cx - colW / 2 + 90, cy + 4);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.font = `800 62px ${FONT}`;
    ctx.fillText(title, cx - colW / 2 + 190, cy - 6);
    ctx.fillStyle = "#4B5B70";
    ctx.font = `500 44px ${FONT}`;
    wrapText(ctx, text, colW - 220).forEach((l, k) => ctx.fillText(l, cx - colW / 2 + 190, cy + 56 + k * 56));
  });

  // ---- footer ----
  const fy = H - 190;
  ctx.fillStyle = hg;
  ctx.fillRect(0, fy, W, 190);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, fy - 14, W, 14);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#7DD8CB";
  ctx.font = `900 64px ${FONT}`;
  spaced(ctx, 8);
  ctx.fillText("PIAO CONNECT", 230, fy + 95);
  spaced(ctx, 0);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `500 50px ${FONT}`;
  ctx.fillText("Need help? Visit the Barangay Hall", W - 230, fy + 95);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  return canvas;
}
