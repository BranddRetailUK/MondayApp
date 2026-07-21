(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DtfLayout = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function physicalArtworkSize(input, fallbackDpi = 300) {
    const explicitWidthMm = Number(input?.widthMm);
    const explicitHeightMm = Number(input?.heightMm);
    if (explicitWidthMm > 0 && explicitHeightMm > 0) {
      return { widthMm: explicitWidthMm, heightMm: explicitHeightMm };
    }
    const widthPx = Math.max(1, Number(input?.widthPx) || 1);
    const heightPx = Math.max(1, Number(input?.heightPx) || 1);
    const dpiX = Number(input?.dpiX) > 0 ? Number(input.dpiX) : fallbackDpi;
    const dpiY = Number(input?.dpiY) > 0 ? Number(input.dpiY) : fallbackDpi;
    return {
      widthMm: (widthPx / dpiX) * 25.4,
      heightMm: (heightPx / dpiY) * 25.4,
    };
  }

  function pngResolution(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (data.length < 8 || signature.some((value, index) => data[index] !== value)) return null;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 8;
    while (offset + 12 <= data.length) {
      const length = view.getUint32(offset);
      const dataStart = offset + 8;
      const next = dataStart + length + 4;
      if (next > data.length) return null;
      const type = String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);
      if (type === 'pHYs' && length >= 9 && data[dataStart + 8] === 1) {
        const pixelsPerMeterX = view.getUint32(dataStart);
        const pixelsPerMeterY = view.getUint32(dataStart + 4);
        if (pixelsPerMeterX > 0 && pixelsPerMeterY > 0) {
          return {
            dpiX: pixelsPerMeterX * 0.0254,
            dpiY: pixelsPerMeterY * 0.0254,
          };
        }
      }
      if (type === 'IEND') break;
      offset = next;
    }
    return null;
  }

  function epsBoundingBox(text) {
    const source = String(text || '');
    const number = '([-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))';
    for (const label of ['HiResBoundingBox', 'BoundingBox']) {
      const expression = new RegExp(`^%%${label}:\\s*${number}\\s+${number}\\s+${number}\\s+${number}`, 'gmi');
      let match;
      let lastValid = null;
      while ((match = expression.exec(source))) {
        const [left, bottom, right, top] = match.slice(1, 5).map(Number);
        if (right > left && top > bottom) lastValid = { widthPoints: right - left, heightPoints: top - bottom };
      }
      if (lastValid) return lastValid;
    }
    return null;
  }

  function proportionalArtworkSize(widthPx, heightPx, rotationDeg, dimension, value) {
    const sourceRatio = Math.max(1, Number(widthPx) || 1) / Math.max(1, Number(heightPx) || 1);
    const ratio = Number(rotationDeg) % 180 ? 1 / sourceRatio : sourceRatio;
    const requested = Math.max(0, Number(value) || 0);
    return dimension === 'height'
      ? { widthMm: requested * ratio, heightMm: requested }
      : { widthMm: requested, heightMm: requested / ratio };
  }

  function uploadRanges(totalBytes, chunkBytes) {
    const total = Math.max(0, Math.floor(Number(totalBytes) || 0));
    const chunk = Math.max(1, Math.floor(Number(chunkBytes) || 0));
    const ranges = [];
    for (let start = 0; start < total; start += chunk) {
      const endExclusive = Math.min(total, start + chunk);
      ranges.push({ start, endExclusive, end: endExclusive - 1 });
    }
    return ranges;
  }

  function intersects(a, b, gap = 0) {
    return !(
      a.xMm + a.widthMm + gap <= b.xMm
      || b.xMm + b.widthMm + gap <= a.xMm
      || a.yMm + a.heightMm + gap <= b.yMm
      || b.yMm + b.heightMm + gap <= a.yMm
    );
  }

  function findOpenPosition(placed, width, height, gap, canvasWidth = 550, canvasHeight = 1000) {
    if (width <= 0 || height <= 0 || width > canvasWidth || height > canvasHeight) return null;
    const xs = uniqueSorted([0, ...placed.map((item) => item.xMm + item.widthMm + gap)])
      .filter((x) => x + width <= canvasWidth + .001);
    const ys = uniqueSorted([0, ...placed.map((item) => item.yMm + item.heightMm + gap)])
      .filter((y) => y + height <= canvasHeight + .001);
    for (const yMm of ys) {
      for (const xMm of xs) {
        const candidate = { xMm, yMm, widthMm: width, heightMm: height };
        if (placed.every((item) => !intersects(candidate, item, gap))) return { xMm, yMm };
      }
    }
    return null;
  }

  function repack(items, gap = 10, canvasWidth = 550, canvasHeight = 1000) {
    const placed = [];
    const groups = Array.from(new Set(items.map((item) => item.groupId)));
    for (const groupId of groups) {
      const group = items.filter((item) => item.groupId === groupId);
      const parent = group.find((item) => item.id === groupId) || group[0];
      const ordered = [parent, ...group.filter((item) => item !== parent)];
      for (const original of ordered) {
        const position = findOpenPosition(placed, original.widthMm, original.heightMm, gap, canvasWidth, canvasHeight);
        if (!position) return null;
        placed.push({ ...original, ...position });
      }
    }
    const byId = new Map(placed.map((item) => [item.id, item]));
    return items.map((item) => byId.get(item.id));
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.map((value) => Number(value.toFixed(4))))).sort((a, b) => a - b);
  }

  return {
    epsBoundingBox,
    findOpenPosition,
    intersects,
    physicalArtworkSize,
    pngResolution,
    proportionalArtworkSize,
    repack,
    uploadRanges,
  };
});
