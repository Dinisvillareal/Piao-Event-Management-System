// Draws the CR80-size (85.6 x 54 mm @ 300 dpi) member ID card -- front and
// back. Shared by the member QR page and the staff Residents "View QR" dialog
// so both produce the exact same card.
//
//   renderMemberIdCard()  -> one image with the FRONT above the BACK
//                            (what the preview and Download use)

const CARD_W = 1011;
const CARD_H = 638;
const SHEET_GAP = 48;

async function renderFront(
  qrCanvasEl: HTMLCanvasElement,
  fullName: string,
  userCode: string,
): Promise<HTMLCanvasElement | null> {
  // CR80 ID card (85.6 x 54 mm) at 300 dpi.
  const W = 1011;
  const H = 638;
  const NAVY = "#071B33";
  const NAVY_2 = "#0D2747";
  const GOLD = "#E8B84A";
  const TEAL = "#0E7C7B";
  const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  const c: any = ctx;

  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const spaced = (s: number) => { if ("letterSpacing" in c) c.letterSpacing = `${s}px`; };

  // Load the barangay seal (card still renders if it fails to load).
  const logo = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/logo-removebg-preview.png";
  });

  // Card body (rounded, clipped)
  ctx.save();
  rr(0, 0, W, H, 38);
  ctx.clip();
  ctx.fillStyle = "#F7FAF8";
  ctx.fillRect(0, 0, W, H);

  // Soft watermark seal in the body
  if (logo) {
    ctx.globalAlpha = 0.04;
    const wm = 420;
    ctx.drawImage(logo, W - wm + 40, 156 + (418 - wm) / 2, wm, wm);
    ctx.globalAlpha = 1;
  }

  // Header band
  const HEADER_H = 150;
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, NAVY);
  grad.addColorStop(1, NAVY_2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, HEADER_H, W, 6);

  // Seal
  const sealCx = 90;
  const sealCy = HEADER_H / 2;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(sealCx, sealCy, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.stroke();
  if (logo) {
    const s = 98;
    ctx.drawImage(logo, sealCx - s / 2, sealCy - s / 2, s, s);
  }

  // Header text
  const hx = 170;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = `600 16px ${FONT}`;
  spaced(1.5);
  ctx.fillText("REPUBLIC OF THE PHILIPPINES", hx, 36);
  spaced(0.3);
  ctx.font = `500 17px ${FONT}`;
  ctx.fillText("Province of Zamboanga del Norte", hx, 60);
  ctx.fillText("Municipality of President Manuel A. Roxas", hx, 84);
  ctx.fillStyle = GOLD;
  ctx.font = `800 34px ${FONT}`;
  spaced(2);
  ctx.fillText("BARANGAY PIAO", hx, 128);
  spaced(0);

  // Footer band
  const FOOT_H = 64;
  const footY = H - FOOT_H;
  ctx.fillStyle = grad;
  ctx.fillRect(0, footY, W, FOOT_H);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, footY - 4, W, 4);
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#7DD8CB";
  ctx.font = `800 24px ${FONT}`;
  spaced(3);
  ctx.fillText("PIAO CONNECT", 44, footY + FOOT_H / 2 + 2);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `500 17px ${FONT}`;
  spaced(0.5);
  ctx.textAlign = "right";
  ctx.fillText("Barangay Event e-Membership", W - 44, footY + FOOT_H / 2 + 2);
  ctx.textAlign = "left";
  spaced(0);

  // QR frame
  const bodyTop = HEADER_H + 6;
  const bodyBottom = footY - 4;
  const QR_BOX = 300;
  const qrX = 44;
  const qrY = bodyTop + (bodyBottom - bodyTop - QR_BOX) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(15,42,74,0.18)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = "#FFFFFF";
  rr(qrX, qrY, QR_BOX, QR_BOX, 22);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#CFE0DA";
  ctx.lineWidth = 2;
  rr(qrX, qrY, QR_BOX, QR_BOX, 22);
  ctx.stroke();
  const pad = 14;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvasEl, qrX + pad, qrY + pad, QR_BOX - pad * 2, QR_BOX - pad * 2);
  ctx.imageSmoothingEnabled = true;

  // Text column
  const tx = qrX + QR_BOX + 48;
  const tMaxW = W - tx - 44;
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = TEAL;
  ctx.font = `700 16px ${FONT}`;
  spaced(2.5);
  ctx.fillText("MEMBER IDENTIFICATION CARD", tx, bodyTop + 52);
  spaced(0);

  const label = (txt: string, y: number) => {
    ctx.fillStyle = "#6B7C86";
    ctx.font = `700 13px ${FONT}`;
    spaced(2);
    ctx.fillText(txt, tx, y);
    spaced(0);
  };

  label("FULL NAME", bodyTop + 100);
  let nameSize = 54;
  let displayName = (fullName || "—").toString().toUpperCase();
  ctx.fillStyle = NAVY;
  ctx.font = `800 ${nameSize}px ${FONT}`;
  while (ctx.measureText(displayName).width > tMaxW && nameSize > 30) {
    nameSize -= 2;
    ctx.font = `800 ${nameSize}px ${FONT}`;
  }
  while (ctx.measureText(displayName).width > tMaxW && displayName.length > 3) {
    displayName = displayName.slice(0, -2).trimEnd() + "…";
  }
  ctx.fillText(displayName, tx, bodyTop + 100 + 14 + nameSize);

  // gold rule
  const ruleY = bodyTop + 100 + 14 + nameSize + 18;
  ctx.fillStyle = GOLD;
  ctx.fillRect(tx, ruleY, 70, 4);

  label("ID NUMBER", ruleY + 40);
  ctx.fillStyle = NAVY_2;
  ctx.font = `800 40px ${FONT}`;
  spaced(2);
  ctx.fillText((userCode || "—").toString(), tx, ruleY + 40 + 46);
  spaced(0);

  // Role pill
  const pillY = ruleY + 40 + 46 + 24;
  ctx.fillStyle = NAVY_2;
  rr(tx, pillY, 150, 38, 19);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 15px ${FONT}`;
  spaced(2.5);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("MEMBER", tx + 75 + 1, pillY + 20);
  ctx.textAlign = "left";
  spaced(0);

  // Caption
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#5B6B75";
  ctx.font = `500 16px ${FONT}`;
  ctx.fillText("Scan this QR code at barangay events to check in.", tx, bodyBottom - 18);

  ctx.restore();

  // Thin outer border for a clean cut edge
  ctx.strokeStyle = "rgba(15,42,74,0.35)";
  ctx.lineWidth = 2;
  rr(1, 1, W - 2, H - 2, 38);
  ctx.stroke();

  return out;
}

// "09171234567" -> "0917-123-4567" (anything else is shown as typed).
const formatPhone = (raw: string): string => {
  const d = (raw || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}` : (raw || "").trim();
};

const ADDRESS_TEXT = "Piao, Roxas, Zamboanga del Norte";

// BACK of the card: contact number, address, short description and the
// Barangay Captain -- no seal and no republic/province header lines.
async function renderBack(contactNumber: string, captainName: string): Promise<HTMLCanvasElement | null> {
  const W = CARD_W;
  const H = CARD_H;
  const NAVY = "#071B33";
  const NAVY_2 = "#0D2747";
  const GOLD = "#E8B84A";
  const TEAL = "#0E7C7B";
  const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  const c: any = ctx;
  const spaced = (v: number) => { if ("letterSpacing" in c) c.letterSpacing = `${v}px`; };
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  ctx.save();
  rr(0, 0, W, H, 38);
  ctx.clip();
  ctx.fillStyle = "#F7FAF8";
  ctx.fillRect(0, 0, W, H);

  // Soft watermark seal on the right, same as the front.
  const logo = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/logo-removebg-preview.png";
  });
  if (logo) {
    ctx.globalAlpha = 0.04;
    const wm = 420;
    ctx.drawImage(logo, W - wm + 40, 98 + (472 - wm) / 2, wm, wm);
    ctx.globalAlpha = 1;
  }

  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, NAVY);
  grad.addColorStop(1, NAVY_2);

  // Slim header: just the barangay name
  const HEADER_H = 92;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, HEADER_H, W, 6);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = GOLD;
  ctx.font = `800 34px ${FONT}`;
  spaced(2);
  ctx.fillText("BARANGAY PIAO", 44, 60);
  spaced(0);

  // Footer band (same as the front)
  const FOOT_H = 64;
  const footY = H - FOOT_H;
  ctx.fillStyle = grad;
  ctx.fillRect(0, footY, W, FOOT_H);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, footY - 4, W, 4);
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#7DD8CB";
  ctx.font = `800 24px ${FONT}`;
  spaced(3);
  ctx.fillText("PIAO CONNECT", 44, footY + FOOT_H / 2 + 2);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `500 17px ${FONT}`;
  spaced(0.5);
  ctx.textAlign = "right";
  ctx.fillText("Barangay Event e-Membership", W - 44, footY + FOOT_H / 2 + 2);
  ctx.textAlign = "left";
  spaced(0);
  ctx.textBaseline = "alphabetic";

  const bodyTop = HEADER_H + 6;
  const bodyBottom = footY - 4;
  const X = 44;

  const label = (txt: string, y: number) => {
    ctx.fillStyle = "#6B7C86";
    ctx.font = `700 13px ${FONT}`;
    spaced(2);
    ctx.fillText(txt, X, y);
    spaced(0);
  };

  // Contact number
  label("CONTACT NUMBER", bodyTop + 52);
  ctx.fillStyle = NAVY_2;
  ctx.font = `800 40px ${FONT}`;
  spaced(2);
  ctx.fillText(formatPhone(contactNumber) || "—", X, bodyTop + 52 + 48);
  spaced(0);

  // Address
  label("ADDRESS", bodyTop + 52 + 48 + 52);
  ctx.fillStyle = NAVY;
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText(ADDRESS_TEXT, X, bodyTop + 52 + 48 + 52 + 40);

  // gold rule
  ctx.fillStyle = GOLD;
  ctx.fillRect(X, bodyTop + 52 + 48 + 52 + 40 + 24, 70, 4);

  // Description (word-wrapped)
  const desc =
    "This card identifies the holder as a registered member of Barangay Piao and is non-transferable. " +
    "Present it, or scan the QR code on the front, to check in at barangay events. " +
    "If found, please return it to the Barangay Hall.";
  ctx.fillStyle = "#4F6069";
  ctx.font = `500 17px ${FONT}`;
  const maxW = 520;
  const words = desc.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  const descY = bodyTop + 52 + 48 + 52 + 40 + 24 + 4 + 34;
  lines.forEach((l, i) => ctx.fillText(l, X, descY + i * 26));

  // Barangay Captain (bottom right)
  const sigW = 380;
  const sigX = W - 44 - sigW;
  const sigY = bodyBottom - 52;
  ctx.strokeStyle = "#8FA4AE";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sigX, sigY);
  ctx.lineTo(sigX + sigW, sigY);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = NAVY;
  ctx.font = `800 19px ${FONT}`;
  if (captainName) ctx.fillText(captainName, sigX + sigW / 2, sigY - 12);
  ctx.fillStyle = TEAL;
  ctx.font = `700 12px ${FONT}`;
  spaced(2.5);
  ctx.fillText("BARANGAY CAPTAIN", sigX + sigW / 2, sigY + 28);
  spaced(0);
  ctx.textAlign = "left";

  ctx.restore();
  ctx.strokeStyle = "rgba(15,42,74,0.35)";
  ctx.lineWidth = 2;
  rr(1, 1, W - 2, H - 2, 38);
  ctx.stroke();
  return out;
}

// Front and back as two separate card images (each one CR80 card).
export async function renderMemberIdCardSides(
  qrCanvasEl: HTMLCanvasElement,
  fullName: string,
  userCode: string,
  contactNumber: string = "",
  captainName: string = "",
): Promise<{ front: HTMLCanvasElement; back: HTMLCanvasElement } | null> {
  const front = await renderFront(qrCanvasEl, fullName, userCode);
  const back = await renderBack(contactNumber, captainName);
  if (!front || !back) return null;
  return { front, back };
}

// Front above back on one image (transparent gap between) -- used for the
// downloaded file. Each side is still a true CR80 card at 300 dpi.
export async function renderMemberIdCard(
  qrCanvasEl: HTMLCanvasElement,
  fullName: string,
  userCode: string,
  contactNumber: string = "",
  captainName: string = "",
): Promise<HTMLCanvasElement | null> {
  const sides = await renderMemberIdCardSides(qrCanvasEl, fullName, userCode, contactNumber, captainName);
  if (!sides) return null;
  const sheet = document.createElement("canvas");
  sheet.width = CARD_W;
  sheet.height = CARD_H * 2 + SHEET_GAP;
  const sctx = sheet.getContext("2d");
  if (!sctx) return null;
  sctx.drawImage(sides.front, 0, 0);
  sctx.drawImage(sides.back, 0, CARD_H + SHEET_GAP);
  return sheet;
}
