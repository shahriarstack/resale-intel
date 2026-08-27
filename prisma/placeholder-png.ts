// A tiny, dependency-free PNG writer used only by the demo seed.
//
// Real captures come from the field camera; demo rows need *something* on the
// marketplace card so the layout can be judged. These are deliberately plain
// gradients — obviously synthetic, never mistakable for a real vehicle photo.

import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

type RGB = [number, number, number];

/** A diagonal two-colour gradient with a soft vignette, encoded as PNG. */
export function gradientPng(width: number, height: number, from: RGB, to: RGB): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let o = 0;

  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const t = (x / width) * 0.45 + (y / height) * 0.55;

      // Darken towards the edges so the card image has some depth.
      const dx = (x / width - 0.5) * 2;
      const dy = (y / height - 0.5) * 2;
      const vignette = 1 - Math.min(1, (dx * dx + dy * dy) * 0.28);

      for (let c = 0; c < 3; c++) {
        const v = (from[c] + (to[c] - from[c]) * t) * vignette;
        raw[o++] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Evenly spaced, muted hues so each demo vehicle looks distinct in a grid. */
export function huePair(index: number): [RGB, RGB] {
  const hue = (index * 47) % 360;
  return [hsl(hue, 26, 42), hsl((hue + 26) % 360, 30, 68)];
}

function hsl(h: number, s: number, l: number): RGB {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = lig - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
