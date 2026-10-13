// Tajima DST: 512-byte header, followed by three-byte, 0.1mm movements.
// Format reference: https://github.com/EmbroidePy/pyembroidery/blob/main/pyembroidery/DstReader.py
export function parseDst(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 515 || bytes[0] !== 76 || bytes[1] !== 65 || bytes[2] !== 58) {
    throw Error('This is not a valid Tajima DST file.');
  }
  if (bytes.length > 512 + 3 * 500001) throw Error('DST preview is limited to 500,000 commands.');
  const segments = [];
  let x = 0, y = 0, colour = 0, stitches = 0, ended = false;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const include = (px, py) => {
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  };
  for (let offset = 512; offset + 2 < bytes.length; offset += 3) {
    const a = bytes[offset], b = bytes[offset + 1], c = bytes[offset + 2];
    if ((c & 3) !== 3) throw Error('DST contains an invalid stitch command.');
    if ((c & 0xf3) === 0xf3) { ended = true; break; }
    if ((c & 0xc3) === 0x43) throw Error('Sequin DST designs are not supported by this preview.');
    const bit = (v, n) => (v >> n) & 1;
    const dx = (bit(a, 0)-bit(a, 1)) + 3*(bit(b, 0)-bit(b, 1)) +
      9*(bit(a, 2)-bit(a, 3)) + 27*(bit(b, 2)-bit(b, 3)) + 81*(bit(c, 2)-bit(c, 3));
    const dy = -((bit(a, 7)-bit(a, 6)) + 3*(bit(b, 7)-bit(b, 6)) +
      9*(bit(a, 5)-bit(a, 4)) + 27*(bit(b, 5)-bit(b, 4)) + 81*(bit(c, 5)-bit(c, 4)));
    const nextX = x + dx, nextY = y + dy;
    if ((c & 0xc3) === 0xc3) colour++;
    else if (!(c & 0x80)) {
      segments.push([x, y, nextX, nextY, colour]);
      include(x, y); include(nextX, nextY); stitches++;
    }
    x = nextX; y = nextY;
  }
  if (!ended) throw Error('DST is incomplete: no end command was found.');
  if (!segments.length) throw Error('DST contains no stitches to preview.');
  return { segments, stitches, colourChanges: colour, minX, minY,
    widthMm: (maxX-minX)/10, heightMm: (maxY-minY)/10 };
}

export function renderDst(design, createCanvas = () => document.createElement('canvas')) {
  const canvas = createCanvas();
  const padding = 24;
  const width = design.widthMm * 10, height = design.heightMm * 10;
  const scale = Math.min(8, 2000 / Math.max(width, height, 1));
  canvas.width = Math.max(1, Math.ceil(width * scale)) + padding * 2;
  canvas.height = Math.max(1, Math.ceil(height * scale)) + padding * 2;
  const ctx = canvas.getContext('2d');
  const colours = ['#253858', '#b52e38', '#256b45', '#305eb8', '#a55c14', '#7c4199', '#167a85'];
  ctx.lineWidth = Math.max(1, Math.min(3, scale * 1.5));
  ctx.lineCap = 'round';
  let activeColour = -1, count = 0;
  for (const [x, y, endX, endY, colour] of design.segments) {
    if (colour !== activeColour || count >= 2000) {
      if (activeColour !== -1) ctx.stroke();
      ctx.beginPath(); ctx.strokeStyle = colours[colour % colours.length];
      activeColour = colour; count = 0;
    }
    ctx.moveTo(padding + (x-design.minX)*scale, padding + (y-design.minY)*scale);
    ctx.lineTo(padding + (endX-design.minX)*scale, padding + (endY-design.minY)*scale);
    count++;
  }
  ctx.stroke();
  return canvas;
}

// Pulse PXF versions with an embedded PNG can be previewed without a stitch engine.
// This is the saved design thumbnail, not a reconstruction of editable PXF objects.
export function extractPxfPreview(buffer) {
  const bytes = new Uint8Array(buffer);
  const unsupported = 'This PXF has no supported embedded preview. Export a PDF or DST from Pulse Ambassador and open it here.';
  if (bytes.length > 25 * 1024 * 1024) throw Error('Maximum file size is 25 MB.');
  if (new TextDecoder().decode(bytes.subarray(0, 6)) !== 'PMLPXF') throw Error('This is not a supported Pulse PXF file.');
  const signature = [137,80,78,71,13,10,26,10];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let start = 8; start <= bytes.length - 33; start++) {
    if (!signature.every((value, index) => bytes[start + index] === value)) continue;
    let offset = start + 8, hasData = false, first = true;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      if (length > bytes.length - offset - 12) break;
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (first) {
        if (type !== 'IHDR' || length !== 13) break;
        const width = view.getUint32(offset + 8), height = view.getUint32(offset + 12);
        if (!width || !height || width > 4096 || height > 4096) break;
        first = false;
      } else if (type === 'IHDR') break;
      if (type === 'IDAT') hasData = true;
      offset += length + 12;
      if (type === 'IEND') {
        if (length === 0 && hasData) return bytes.slice(start, offset);
        break;
      }
    }
  }
  throw Error(unsupported);
}
