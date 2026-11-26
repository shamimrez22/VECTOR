import {
  CropCellBox,
  SeparatedIconItem,
  SheetSegmentationResult,
  UploadedSourceFile,
} from '../types/icon';

interface Interval1D {
  start: number;
  end: number;
}

/**
 * Converts a Uint8ClampedArray or Uint8Array to a base64 string without stack overflow on large buffers.
 */
export function uint8ToBase64(bytes: Uint8Array | Uint8ClampedArray): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  return btoa(chunks.join(''));
}

/**
 * Decodes an image dataUrl or File into an HTMLImageElement.
 */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('ইমেজ লোড করতে ব্যর্থ হয়েছে।'));
    img.src = src;
  });
}

/**
 * Detects background type & dominant perimeter color from ImageData.
 */
export function analyzeImageBackground(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): {
  isTransparent: boolean;
  r: number;
  g: number;
  b: number;
  backgroundType: 'transparent' | 'solid-light' | 'solid-dark' | 'solid-color';
  hex: string;
} {
  let transparentCount = 0;
  let totalSampled = 0;
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

  const sample = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const a = rgba[idx + 3];
    totalSampled++;
    if (a < 64) {
      transparentCount++;
      return;
    }
    const key = `${r >> 3}_${g >> 3}_${b >> 3}`;
    const prev = buckets.get(key);
    if (prev) {
      prev.count++;
      prev.r += r;
      prev.g += g;
      prev.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  };

  for (let x = 0; x < width; x++) {
    sample(x, 0);
    if (height > 1) sample(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    sample(0, y);
    if (width > 1) sample(width - 1, y);
  }

  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();

  if (transparentCount > totalSampled * 0.45) {
    return {
      isTransparent: true,
      r: 255,
      g: 255,
      b: 255,
      backgroundType: 'transparent',
      hex: 'TRANSPARENT',
    };
  }

  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const b of buckets.values()) {
    if (!best || b.count > best.count) best = b;
  }

  if (!best) {
    return {
      isTransparent: false,
      r: 255,
      g: 255,
      b: 255,
      backgroundType: 'solid-light',
      hex: '#FFFFFF',
    };
  }

  const r = Math.round(best.r / best.count);
  const g = Math.round(best.g / best.count);
  const b = Math.round(best.b / best.count);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));

  let backgroundType: 'solid-light' | 'solid-dark' | 'solid-color' = 'solid-light';
  if (maxDiff > 35) {
    backgroundType = 'solid-color';
  } else if (lum < 100) {
    backgroundType = 'solid-dark';
  } else {
    backgroundType = 'solid-light';
  }

  return {
    isTransparent: false,
    r,
    g,
    b,
    backgroundType,
    hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
  };
}

/**
 * Builds a binary foreground mask (1 = icon content, 0 = background whitespace).
 */
export function buildForegroundMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  bg: { isTransparent: boolean; r: number; g: number; b: number }
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const a = rgba[idx + 3];
      if (bg.isTransparent) {
        if (a >= 45) {
          mask[y * width + x] = 1;
        }
      } else {
        if (a >= 45) {
          const dr = rgba[idx] - bg.r;
          const dg = rgba[idx + 1] - bg.g;
          const db = rgba[idx + 2] - bg.b;
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          if (dist > 28) {
            mask[y * width + x] = 1;
          }
        }
      }
    }
  }
  return mask;
}

/**
 * Extracts active 1D intervals from a projection histogram and merges intra-icon gaps
 * (such as detached chimney on a house, tassel on a graduation cap, trash lid, or head/body gap)
 * while preserving genuine inter-icon whitespace gutters.
 */
function findGridIntervalsFromProjection(counts: Int32Array, totalSpan: number): Interval1D[] {
  const raw: Interval1D[] = [];
  let inSegment = false;
  let segStart = 0;

  const minPixelsInLine = 1;

  for (let i = 0; i < totalSpan; i++) {
    if (counts[i] >= minPixelsInLine) {
      if (!inSegment) {
        inSegment = true;
        segStart = i;
      }
    } else if (inSegment) {
      inSegment = false;
      raw.push({ start: segStart, end: i - 1 });
    }
  }
  if (inSegment) {
    raw.push({ start: segStart, end: totalSpan - 1 });
  }

  if (raw.length <= 1) return raw;

  // Step 1: Merge tiny micro-gaps (<= 1.4% of total span or <= 5px)
  const minGutterPx = Math.max(5, Math.round(totalSpan * 0.014));
  let merged: Interval1D[] = [{ ...raw[0] }];
  for (let i = 1; i < raw.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = raw[i];
    if (curr.start - prev.end - 1 <= minGutterPx) {
      prev.end = curr.end;
    } else {
      merged.push({ ...curr });
    }
  }

  // Filter out 1-2px border artifact lines at extreme edges
  merged = merged.filter((iv) => iv.end - iv.start + 1 >= 4);
  if (merged.length <= 1) return merged;

  // Step 2: Adaptive gutter clustering — distinguish intra-icon sub-components from inter-cell grid gutters
  let changed = true;
  while (changed && merged.length > 1) {
    changed = false;
    const gaps: number[] = [];
    for (let i = 0; i < merged.length - 1; i++) {
      gaps.push(merged[i + 1].start - merged[i].end - 1);
    }
    const maxGap = Math.max(...gaps);
    const spans = merged.map((iv) => iv.end - iv.start + 1).sort((a, b) => a - b);
    const medianSpan = spans[Math.floor(spans.length / 2)];
    const maxSpan = spans[spans.length - 1];

    const nextMerged: Interval1D[] = [{ ...merged[0] }];
    for (let i = 1; i < merged.length; i++) {
      const prev = nextMerged[nextMerged.length - 1];
      const curr = merged[i];
      const gap = curr.start - prev.end - 1;
      const prevSpan = prev.end - prev.start + 1;
      const currSpan = curr.end - curr.start + 1;
      const combinedSpan = curr.end - prev.start + 1;
      const smallerPart = Math.min(prevSpan, currSpan);
      const largerPart = Math.max(prevSpan, currSpan);

      // Case A: Gap is much smaller than the primary inter-cell gutter (< 42% of maxGap)
      // Case B: One fragment is a detached sub-part (e.g. lid, chimney, tassel, bell clapper, dot: < 40% of largerPart)
      //         and the gap between it and its main body is small (< 32% of largerPart)
      const isIntraIconGap =
        (gap < maxGap * 0.42 && combinedSpan <= medianSpan * 1.65) ||
        (smallerPart < largerPart * 0.4 && gap < largerPart * 0.32 && combinedSpan <= maxSpan * 1.35);

      if (isIntraIconGap) {
        prev.end = curr.end;
        changed = true;
      } else {
        nextMerged.push({ ...curr });
      }
    }
    merged = nextMerged;
  }

  return merged;
}

/**
 * Computes tight content bounding box inside a cell territory with consistent padding
 * and strict protection against cutting off icon edges.
 */
function extractCellBoundingBoxes(
  mask: Uint8Array,
  imgWidth: number,
  imgHeight: number,
  rowCorridors: Array<{ top: number; bottom: number }>,
  colCorridors: Array<{ left: number; right: number }>,
  padding: number,
  fallbackToCorridor: boolean = false
): CropCellBox[] {
  const cells: CropCellBox[] = [];
  let iconCounter = 1;

  for (let r = 0; r < rowCorridors.length; r++) {
    const { top, bottom } = rowCorridors[r];
    for (let c = 0; c < colCorridors.length; c++) {
      const { left, right } = colCorridors[c];

      let minX = right;
      let maxX = left;
      let minY = bottom;
      let maxY = top;
      let fgPixelCount = 0;

      for (let y = top; y <= bottom; y++) {
        const rowOffset = y * imgWidth;
        for (let x = left; x <= right; x++) {
          if (mask[rowOffset + x] === 1) {
            fgPixelCount++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (fgPixelCount < 6 && !fallbackToCorridor) {
        continue;
      }

      let cropX: number;
      let cropY: number;
      let cropW: number;
      let cropH: number;

      if (fgPixelCount >= 6) {
        const x0 = Math.max(left, Math.max(0, minX - padding));
        const y0 = Math.max(top, Math.max(0, minY - padding));
        const x1 = Math.min(right, Math.min(imgWidth - 1, maxX + padding));
        const y1 = Math.min(bottom, Math.min(imgHeight - 1, maxY + padding));

        cropX = x0;
        cropY = y0;
        cropW = Math.max(1, x1 - x0 + 1);
        cropH = Math.max(1, y1 - y0 + 1);
      } else {
        cropX = left;
        cropY = top;
        cropW = Math.max(1, right - left + 1);
        cropH = Math.max(1, bottom - top + 1);
      }

      const labelNum = String(iconCounter).padStart(2, '0');
      cells.push({
        id: `cell_${r}_${c}`,
        row: r,
        col: c,
        cellX: left,
        cellY: top,
        cellW: right - left + 1,
        cellH: bottom - top + 1,
        x: cropX,
        y: cropY,
        width: cropW,
        height: cropH,
        enabled: true,
        label: `#${labelNum}`,
      });
      iconCounter++;
    }
  }

  return cells;
}

/**
 * Automatic Icon Sheet Segmentation using Horizontal & Vertical Whitespace Projection,
 * Spatial Grid Analysis, Content Bounding-Box Detection, and Single Multi-Part Icon Protection.
 */
export function autoSegmentIconSheet(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  defaultPadding: number = 8,
  forceSingleIcon: boolean = false
): SheetSegmentationResult {
  const bg = analyzeImageBackground(rgba, width, height);
  const mask = buildForegroundMask(rgba, width, height, bg);

  const makeSingleIconResult = (): SheetSegmentationResult => ({
    isSheet: false,
    rows: 1,
    cols: 1,
    confidence: 'high',
    backgroundType: bg.backgroundType,
    backgroundColorHex: bg.hex,
    padding: defaultPadding,
    cells: [
      {
        id: 'cell_0_0',
        row: 0,
        col: 0,
        cellX: 0,
        cellY: 0,
        cellW: width,
        cellH: height,
        x: 0,
        y: 0,
        width,
        height,
        enabled: true,
        label: '#01',
      },
    ],
  });

  if (forceSingleIcon) {
    return makeSingleIconResult();
  }

  const rowCounts = new Int32Array(height);
  const colCounts = new Int32Array(width);
  let globalMinX = width;
  let globalMaxX = 0;
  let globalMinY = height;
  let globalMaxY = 0;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[rowOffset + x] === 1) {
        rowCounts[y]++;
        colCounts[x]++;
        if (x < globalMinX) globalMinX = x;
        if (x > globalMaxX) globalMaxX = x;
        if (y < globalMinY) globalMinY = y;
        if (y > globalMaxY) globalMaxY = y;
      }
    }
  }

  const rowIntervals = findGridIntervalsFromProjection(rowCounts, height);
  const colIntervals = findGridIntervalsFromProjection(colCounts, width);

  const numRows = Math.max(1, rowIntervals.length);
  const numCols = Math.max(1, colIntervals.length);

  if (numRows * numCols <= 1) {
    return makeSingleIconResult();
  }

  // Single Multi-Part Icon Protection:
  // If an image has only 1 column (or only 1 row) of 2-4 parts inside a roughly square canvas/footprint
  // (e.g., User head + shoulders, Wi-Fi arcs + dot, Trash lid + bin, Hamburger menu bars, Pause bars),
  // it is ONE multi-part icon, NOT a 1xN icon sheet!
  const imgAspect = width / Math.max(1, height);
  const fgW = Math.max(1, globalMaxX - globalMinX + 1);
  const fgH = Math.max(1, globalMaxY - globalMinY + 1);
  const fgAspect = fgW / fgH;

  if (
    numCols === 1 &&
    numRows <= 4 &&
    imgAspect >= 0.65 &&
    imgAspect <= 1.55 &&
    fgAspect >= 0.45 &&
    fgAspect <= 2.2
  ) {
    return makeSingleIconResult();
  }

  if (
    numRows === 1 &&
    numCols <= 3 &&
    imgAspect >= 0.65 &&
    imgAspect <= 1.55 &&
    fgAspect >= 0.45 &&
    fgAspect <= 1.65
  ) {
    return makeSingleIconResult();
  }

  const rowCorridors: Array<{ top: number; bottom: number }> = [];
  for (let r = 0; r < rowIntervals.length; r++) {
    const top =
      r === 0
        ? 0
        : Math.floor((rowIntervals[r - 1].end + rowIntervals[r].start) / 2);
    const bottom =
      r === rowIntervals.length - 1
        ? height - 1
        : Math.ceil((rowIntervals[r].end + rowIntervals[r + 1].start) / 2);
    rowCorridors.push({ top, bottom });
  }

  const colCorridors: Array<{ left: number; right: number }> = [];
  for (let c = 0; c < colIntervals.length; c++) {
    const left =
      c === 0
        ? 0
        : Math.floor((colIntervals[c - 1].end + colIntervals[c].start) / 2);
    const right =
      c === colIntervals.length - 1
        ? width - 1
        : Math.ceil((colIntervals[c].end + colIntervals[c + 1].start) / 2);
    colCorridors.push({ left, right });
  }

  const cells = extractCellBoundingBoxes(mask, width, height, rowCorridors, colCorridors, defaultPadding, false);

  if (cells.length <= 1) {
    return makeSingleIconResult();
  }

  const expectedCount = numRows * numCols;
  const confidence: 'high' | 'medium' | 'low' =
    cells.length === expectedCount
      ? 'high'
      : cells.length >= expectedCount * 0.75
      ? 'medium'
      : 'low';

  return {
    isSheet: true,
    rows: numRows,
    cols: numCols,
    confidence,
    backgroundType: bg.backgroundType,
    backgroundColorHex: bg.hex,
    padding: defaultPadding,
    cells,
  };
}

/**
 * Manual Fallback Grid Segmentation when user adjusts Rows, Columns, Padding, or Crop Inset.
 */
export function manualGridSegmentIconSheet(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  rows: number,
  cols: number,
  padding: number = 8,
  inset: number = 0
): SheetSegmentationResult {
  const safeRows = Math.max(1, Math.min(40, Math.round(rows)));
  const safeCols = Math.max(1, Math.min(40, Math.round(cols)));
  const bg = analyzeImageBackground(rgba, width, height);
  const mask = buildForegroundMask(rgba, width, height, bg);

  const usableW = Math.max(safeCols * 4, width - inset * 2);
  const usableH = Math.max(safeRows * 4, height - inset * 2);

  const rowCorridors: Array<{ top: number; bottom: number }> = [];
  for (let r = 0; r < safeRows; r++) {
    const top = Math.max(0, Math.round(inset + (r * usableH) / safeRows));
    const bottom = Math.min(height - 1, Math.round(inset + ((r + 1) * usableH) / safeRows) - 1);
    rowCorridors.push({ top, bottom });
  }

  const colCorridors: Array<{ left: number; right: number }> = [];
  for (let c = 0; c < safeCols; c++) {
    const left = Math.max(0, Math.round(inset + (c * usableW) / safeCols));
    const right = Math.min(width - 1, Math.round(inset + ((c + 1) * usableW) / safeCols) - 1);
    colCorridors.push({ left, right });
  }

  const cells = extractCellBoundingBoxes(mask, width, height, rowCorridors, colCorridors, padding, true);

  return {
    isSheet: safeRows * safeCols > 1,
    rows: safeRows,
    cols: safeCols,
    confidence: 'high',
    backgroundType: bg.backgroundType,
    backgroundColorHex: bg.hex,
    padding,
    cells,
  };
}

/**
 * Crops enabled cells from an UploadedSourceFile into individual SeparatedIconItem objects,
 * adding a safe margin so edges are never clipped during vector tracing.
 */
export async function extractSeparatedIconsFromSource(
  source: UploadedSourceFile,
  existingNames: Set<string>
): Promise<SeparatedIconItem[]> {
  const img = await loadImageElement(source.dataUrl);
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = source.width;
  fullCanvas.height = source.height;
  const fullCtx = fullCanvas.getContext('2d');
  if (!fullCtx) throw new Error('Canvas 2D context পাওয়া যায়নি।');
  fullCtx.drawImage(img, 0, 0);

  const enabledCells = source.segmentation.cells.filter((c) => c.enabled);
  const items: SeparatedIconItem[] = [];

  for (let idx = 0; idx < enabledCells.length; idx++) {
    const cell = enabledCells[idx];

    // Add an 8px clean outer margin so VTracer spline fitting never touches or clips outer edges
    const safeMargin = source.segmentation.isSheet ? 8 : 4;
    const outW = cell.width + safeMargin * 2;
    const outH = cell.height + safeMargin * 2;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = outW;
    cropCanvas.height = outH;
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) continue;

    if (
      source.segmentation.backgroundType !== 'transparent' &&
      source.segmentation.backgroundColorHex.startsWith('#')
    ) {
      cropCtx.fillStyle = source.segmentation.backgroundColorHex;
      cropCtx.fillRect(0, 0, outW, outH);
    } else {
      cropCtx.clearRect(0, 0, outW, outH);
    }

    cropCtx.drawImage(
      fullCanvas,
      cell.x,
      cell.y,
      cell.width,
      cell.height,
      safeMargin,
      safeMargin,
      cell.width,
      cell.height
    );

    const imgData = cropCtx.getImageData(0, 0, outW, outH);
    const rgbaBase64 = uint8ToBase64(imgData.data);
    const originalDataUrl = cropCanvas.toDataURL('image/png');

    let candidateName =
      enabledCells.length === 1 && !source.segmentation.isSheet
        ? source.baseName
        : `${source.baseName}_${String(idx + 1).padStart(3, '0')}`;

    if (existingNames.has(candidateName.toLowerCase())) {
      let dupCounter = 2;
      while (existingNames.has(`${candidateName}_${dupCounter}`.toLowerCase())) {
        dupCounter++;
      }
      candidateName = `${candidateName}_${dupCounter}`;
    }
    existingNames.add(candidateName.toLowerCase());

    items.push({
      id: `${source.id}_icon_${idx + 1}_${Date.now()}`,
      name: candidateName,
      originalFileName: source.fileName,
      sourceId: source.id,
      width: outW,
      height: outH,
      originalDataUrl,
      rgbaBase64,
      status: 'pending',
      selected: true,
      gridPosition: {
        row: cell.row + 1,
        col: cell.col + 1,
        indexInSheet: idx + 1,
      },
    });
  }

  return items;
}
