/**
 * make-icons.js — Generates PNG icons for the PWA from the SVG.
 * 
 * Pure-JS PNG encoder (no native dependencies).
 * Usage: node make-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ===== Minimal PNG encoder (RGBA, no filters) =====
function crc32(buf) {
    let table = crc32.table;
    if (!table) {
        table = crc32.table = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c;
        }
    }
    let crc = -1;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type RGBA
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    // Raw image data with filter byte 0 per scanline
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    const idat = zlib.deflateSync(raw);

    return Buffer.concat([
        sig,
        chunk('IHDR', ihdr),
        chunk('IDAT', idat),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

// ===== Draw the icon at a given size (raster approximation of the SVG) =====
function drawIcon(size) {
    const rgba = Buffer.alloc(size * size * 4);
    const s = size / 512;

    // Background: rounded rect with gradient
    const radius = 96 * s;

    function inRoundedRect(x, y) {
        if (x < radius) {
            if (y < radius) return (x - radius) ** 2 + (y - radius) ** 2 <= radius ** 2;
            if (y > size - radius) return (x - radius) ** 2 + (y - (size - radius)) ** 2 <= radius ** 2;
            return x >= 0;
        }
        if (x > size - radius) {
            if (y < radius) return (x - (size - radius)) ** 2 + (y - radius) ** 2 <= radius ** 2;
            if (y > size - radius) return (x - (size - radius)) ** 2 + (y - (size - radius)) ** 2 <= radius ** 2;
            return x <= size;
        }
        return true;
    }

    // Book polygon (approx)
    const bookPoints = [
        [130, 150], [256, 170], [382, 150],
        [382, 340], [256, 360], [130, 340]
    ].map(([x, y]) => [x * s, y * s]);

    function inBook(x, y) {
        // Simple: within book bounding region, using polygon test
        let inside = false;
        for (let i = 0, j = bookPoints.length - 1; i < bookPoints.length; j = i++) {
            const [xi, yi] = bookPoints[i];
            const [xj, yj] = bookPoints[j];
            if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            let r, g, b, a = 255;

            if (!inRoundedRect(x + 0.5, y + 0.5)) {
                a = 0; r = 0; g = 0; b = 0;
            } else {
                // Background gradient
                const t = (x + y) / (2 * size);
                r = Math.round(26 + (74 - 26) * t);
                g = Math.round(42 + (111 - 42) * t);
                b = Math.round(108 + (165 - 108) * t);

                if (inBook(x + 0.5, y + 0.5)) {
                    r = 255; g = 255; b = 255;
                    // Center spine shadow
                    const cx = size / 2;
                    if (Math.abs(x - cx) < 5 * s) {
                        r = 180; g = 190; b = 210;
                    }
                    // Gold highlight line
                    const gy = (210 + 4) * s;
                    if (Math.abs(y - gy) < 3 * s && x > 185 * s && x < 235 * s) {
                        r = 241; g = 196; b = 15;
                    }
                }
            }
            rgba[idx] = r; rgba[idx + 1] = g; rgba[idx + 2] = b; rgba[idx + 3] = a;
        }
    }
    return rgba;
}

// ===== Generate =====
const outDir = path.join(__dirname, 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

[192, 512].forEach(size => {
    const rgba = drawIcon(size);
    const png = encodePNG(size, size, rgba);
    const file = path.join(outDir, `icon-${size}.png`);
    fs.writeFileSync(file, png);
    console.log(`✅ Generated ${file} (${png.length} bytes)`);
});

