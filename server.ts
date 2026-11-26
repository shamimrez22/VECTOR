import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const vtracer = require('@visioncortex/vtracer');
const { PNG } = require('pngjs');

export interface TraceConfig {
  colorMode: 'auto' | 'bw' | 'color' | 'single';
  singleColor?: string;
  curveMode?: 'spline' | 'polygon' | 'pixel';
  hierarchical?: 'cutout' | 'stacked';
  filterSpeckle?: number;
  colorPrecision?: number;
  layerDifference?: number;
  cornerThreshold?: number;
  lengthThreshold?: number;
  spliceThreshold?: number;
  simplify?: number;
  pathPrecision?: number;
  binaryThreshold?: number;
  maxColors?: number;
  removeBackground?: boolean;
  upscaleSmallIcons?: boolean;
}

export interface SvgValidationReport {
  isValid: boolean;
  hasXmlStructure: boolean;
  hasValidViewBox: boolean;
  hasVectorPaths: boolean;
  hasNoEmbeddedRaster: boolean;
  hasNoBrokenRefs: boolean;
  hasTransparentBackground: boolean;
  pathCount: number;
  anchorPointCount: number;
  compoundHoleCount: number;
  detectedColors: string[];
  viewBox: string;
  width: number;
  height: number;
  warnings: string[];
  error?: string;
}

function toHexColor(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Detects perimeter background color from RGBA8 buffer and handles transparent PNGs
 * (including white icons on transparent backgrounds).
 */
function detectBackground(rgba: Uint8Array, width: number, height: number): {
  isTransparent: boolean;
  r: number;
  g: number;
  b: number;
  isDarkBg: boolean;
} {
  let transparentCount = 0;
  let totalPerimeter = 0;
  const colorBuckets = new Map<string, { count: number; rSum: number; gSum: number; bSum: number }>();

  const samplePixel = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const a = rgba[idx + 3];
    totalPerimeter++;
    if (a < 64) {
      transparentCount++;
      return;
    }
    const key = `${r >> 3}_${g >> 3}_${b >> 3}`;
    const existing = colorBuckets.get(key);
    if (existing) {
      existing.count++;
      existing.rSum += r;
      existing.gSum += g;
      existing.bSum += b;
    } else {
      colorBuckets.set(key, { count: 1, rSum: r, gSum: g, bSum: b });
    }
  };

  for (let x = 0; x < width; x++) {
    samplePixel(x, 0);
    if (height > 1) samplePixel(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    samplePixel(0, y);
    if (width > 1) samplePixel(width - 1, y);
  }

  if (transparentCount > totalPerimeter * 0.45) {
    // Check average luminance of opaque pixels to handle white-on-transparent icons properly
    let opaqueLumSum = 0;
    let opaqueCount = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] >= 128) {
        opaqueLumSum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
        opaqueCount++;
      }
    }
    const avgOpaqueLum = opaqueCount > 0 ? opaqueLumSum / opaqueCount : 0;
    if (avgOpaqueLum > 225) {
      // White / very light icon on a transparent background -> treat virtual background as black
      return { isTransparent: true, r: 0, g: 0, b: 0, isDarkBg: true };
    }
    return { isTransparent: true, r: 255, g: 255, b: 255, isDarkBg: false };
  }

  let bestBucket: { count: number; rSum: number; gSum: number; bSum: number } | null = null;
  for (const bucket of colorBuckets.values()) {
    if (!bestBucket || bucket.count > bestBucket.count) {
      bestBucket = bucket;
    }
  }

  if (!bestBucket || bestBucket.count === 0) {
    return { isTransparent: false, r: 255, g: 255, b: 255, isDarkBg: false };
  }

  const r = Math.round(bestBucket.rSum / bestBucket.count);
  const g = Math.round(bestBucket.gSum / bestBucket.count);
  const b = Math.round(bestBucket.bSum / bestBucket.count);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  return {
    isTransparent: false,
    r,
    g,
    b,
    isDarkBg: lum < 95,
  };
}

/**
 * Analyzes foreground pixels to determine if the icon is monochrome line-art/silhouette
 * or a multi-color illustration, and finds the maximum foreground-to-background contrast.
 */
function analyzeForegroundProfile(
  rgba: Uint8Array,
  bg: { isTransparent: boolean; r: number; g: number; b: number; isDarkBg: boolean }
): {
  isMultiColor: boolean;
  maxDistBg: number;
  dominantFgHex: string;
} {
  let maxDistBg = 0;
  const fgColorClusters = new Map<string, { count: number; r: number; g: number; b: number }>();

  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a < 80) continue;

    const alpha = a / 255;
    const cr = rgba[i] * alpha + bg.r * (1 - alpha);
    const cg = rgba[i + 1] * alpha + bg.g * (1 - alpha);
    const cb = rgba[i + 2] * alpha + bg.b * (1 - alpha);

    const dist = Math.hypot(cr - bg.r, cg - bg.g, cb - bg.b);
    if (dist > maxDistBg) {
      maxDistBg = dist;
    }

    // Only consider solid interior foreground pixels (well away from anti-aliased edge transition)
    if (a > 215 && dist > 85) {
      // Quantize by 32 to group anti-aliased variations of the same color
      const key = `${Math.round(cr / 36)}_${Math.round(cg / 36)}_${Math.round(cb / 36)}`;
      const prev = fgColorClusters.get(key);
      if (prev) {
        prev.count++;
        prev.r += cr;
        prev.g += cg;
        prev.b += cb;
      } else {
        fgColorClusters.set(key, { count: 1, r: cr, g: cg, b: cb });
      }
    }
  }

  // Filter clusters that represent at least 2.5% of solid foreground pixels
  const totalFg = Array.from(fgColorClusters.values()).reduce((acc, c) => acc + c.count, 0);
  const significantClusters = Array.from(fgColorClusters.values())
    .filter((c) => c.count >= Math.max(8, totalFg * 0.025))
    .sort((a, b) => b.count - a.count);

  // Check if any two significant clusters are genuinely different colors (distance > 65)
  let distinctColorCount = significantClusters.length > 0 ? 1 : 0;
  if (significantClusters.length > 1) {
    const primary = {
      r: significantClusters[0].r / significantClusters[0].count,
      g: significantClusters[0].g / significantClusters[0].count,
      b: significantClusters[0].b / significantClusters[0].count,
    };
    for (let k = 1; k < significantClusters.length; k++) {
      const ck = {
        r: significantClusters[k].r / significantClusters[k].count,
        g: significantClusters[k].g / significantClusters[k].count,
        b: significantClusters[k].b / significantClusters[k].count,
      };
      // Check if ck is not just an anti-aliased blend between primary and background
      const distPrimary = Math.hypot(ck.r - primary.r, ck.g - primary.g, ck.b - primary.b);
      if (distPrimary > 68) {
        distinctColorCount++;
      }
    }
  }

  let dominantFgHex = '#000000';
  if (significantClusters.length > 0) {
    const top = significantClusters[0];
    dominantFgHex = toHexColor(top.r / top.count, top.g / top.count, top.b / top.count);
  }

  return {
    isMultiColor: distinctColorCount >= 2,
    maxDistBg: Math.max(80, maxDistBg),
    dominantFgHex,
  };
}

/**
 * 2x Bilinear Upscaling used strictly for very small monochrome icons (< 96px)
 * followed by exact 50% midpoint contour extraction so lines never bloat.
 */
function upscaleRgba2x(src: Uint8Array, w: number, h: number): { rgba: Uint8Array; width: number; height: number } {
  const nw = w * 2;
  const nh = h * 2;
  const dst = new Uint8Array(nw * nh * 4);

  for (let ny = 0; ny < nh; ny++) {
    const sy = Math.max(0, Math.min(h - 1, (ny - 0.5) / 2));
    const y0 = Math.floor(sy);
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = sy - y0;

    for (let nx = 0; nx < nw; nx++) {
      const sx = Math.max(0, Math.min(w - 1, (nx - 0.5) / 2));
      const x0 = Math.floor(sx);
      const x1 = Math.min(w - 1, x0 + 1);
      const fx = sx - x0;

      const i00 = (y0 * w + x0) * 4;
      const i10 = (y0 * w + x1) * 4;
      const i01 = (y1 * w + x0) * 4;
      const i11 = (y1 * w + x1) * 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const outIdx = (ny * nw + nx) * 4;
      for (let c = 0; c < 4; c++) {
        dst[outIdx + c] = Math.round(
          src[i00 + c] * w00 +
          src[i10 + c] * w10 +
          src[i01 + c] * w01 +
          src[i11 + c] * w11
        );
      }
    }
  }

  return { rgba: dst, width: nw, height: nh };
}

/**
 * Prepares RGBA pixels for VTracer:
 * - Never bloats anti-aliased strokes (thresholds strictly at the 50% sub-pixel contrast midpoint).
 * - Decontaminates anti-aliased background halos in Full Color mode so no white/gray crust appears.
 * - Preserves all interior negative spaces (windows, doors, lenses, holes).
 */
function preparePixelsForTracing(
  rawRgba: Uint8Array,
  origWidth: number,
  origHeight: number,
  config: TraceConfig
): {
  rgba: Uint8Array;
  workWidth: number;
  workHeight: number;
  bgHex: string;
  effectiveMode: 'bw' | 'color' | 'single';
  autoFgColor: string;
} {
  const bg = detectBackground(rawRgba, origWidth, origHeight);
  const profile = analyzeForegroundProfile(rawRgba, bg);

  let effectiveMode: 'bw' | 'color' | 'single';
  if (config.colorMode === 'auto') {
    effectiveMode = profile.isMultiColor ? 'color' : 'bw';
  } else {
    effectiveMode = config.colorMode;
  }

  // Composite semi-transparent pixels over background color first
  const composited = new Uint8Array(rawRgba.length);
  for (let i = 0; i < rawRgba.length; i += 4) {
    const a = rawRgba[i + 3];
    if (a === 0) {
      composited[i] = bg.r;
      composited[i + 1] = bg.g;
      composited[i + 2] = bg.b;
      composited[i + 3] = 0;
    } else if (a < 255) {
      const alphaNorm = a / 255;
      composited[i] = Math.round(rawRgba[i] * alphaNorm + bg.r * (1 - alphaNorm));
      composited[i + 1] = Math.round(rawRgba[i + 1] * alphaNorm + bg.g * (1 - alphaNorm));
      composited[i + 2] = Math.round(rawRgba[i + 2] * alphaNorm + bg.b * (1 - alphaNorm));
      composited[i + 3] = a;
    } else {
      composited[i] = rawRgba[i];
      composited[i + 1] = rawRgba[i + 1];
      composited[i + 2] = rawRgba[i + 2];
      composited[i + 3] = 255;
    }
  }

  // Only upscale very small monochrome icons (< 96px) to avoid blurring normal/high-res icons
  const shouldUpscale =
    effectiveMode !== 'color' &&
    config.upscaleSmallIcons !== false &&
    config.curveMode !== 'pixel' &&
    origWidth < 96 &&
    origHeight < 96;

  const { rgba: workInput, width: workWidth, height: workHeight } = shouldUpscale
    ? upscaleRgba2x(composited, origWidth, origHeight)
    : { rgba: composited, width: origWidth, height: origHeight };

  const out = new Uint8Array(workWidth * workHeight * 4);
  const removeBg = config.removeBackground !== false;

  // Map user binaryThreshold (default 150 or 128) to exact contrast ratio around 0.50
  const userThresh = config.binaryThreshold ?? 128;
  // Ratio in [0.25, 0.75], where 128..150 maps cleanly to ~0.48..0.52 (exact 50% anti-aliased edge midpoint)
  const contrastRatio = Math.max(0.25, Math.min(0.75, 1 - userThresh / 275));
  const distCutoff = profile.maxDistBg * contrastRatio;

  if (effectiveMode === 'bw' || effectiveMode === 'single') {
    for (let i = 0; i < workInput.length; i += 4) {
      const r = workInput[i];
      const g = workInput[i + 1];
      const b = workInput[i + 2];
      const distBg = Math.hypot(r - bg.r, g - bg.g, b - bg.b);

      if (distBg >= distCutoff) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 255;
      } else {
        out[i] = 255;
        out[i + 1] = 255;
        out[i + 2] = 255;
        out[i + 3] = 0;
      }
    }
  } else {
    // Full Color Mode with Edge Halo Decontamination
    // Pass 1: Identify solid background vs foreground pixels
    const bgDistCutoff = Math.min(48, profile.maxDistBg * 0.22);
    for (let i = 0; i < workInput.length; i += 4) {
      const r = workInput[i];
      const g = workInput[i + 1];
      const b = workInput[i + 2];
      const a = workInput[i + 3];
      const distBg = Math.hypot(r - bg.r, g - bg.g, b - bg.b);

      if (a < 115 || (removeBg && distBg <= bgDistCutoff)) {
        out[i] = 255;
        out[i + 1] = 255;
        out[i + 2] = 255;
        out[i + 3] = 0;
      } else {
        // Un-blend any remaining semi-transparent edge pixel from background color
        if (a < 245 && a >= 115) {
          const rawIdx = i;
          out[i] = rawRgba[rawIdx] ?? r;
          out[i + 1] = rawRgba[rawIdx + 1] ?? g;
          out[i + 2] = rawRgba[rawIdx + 2] ?? b;
          out[i + 3] = 255;
        } else {
          out[i] = r;
          out[i + 1] = g;
          out[i + 2] = b;
          out[i + 3] = 255;
        }
      }
    }

    // Pass 2: Snap 1px anti-aliased boundary halo pixels (adjacent to transparent background)
    // to the nearest interior opaque neighbor color so VTracer doesn't trace white/gray crust rings
    if (removeBg) {
      const snapped = new Uint8Array(out);
      for (let y = 1; y < workHeight - 1; y++) {
        for (let x = 1; x < workWidth - 1; x++) {
          const idx = (y * workWidth + x) * 4;
          if (out[idx + 3] === 0) continue;

          // Check if adjacent to background
          const hasBgNeighbor =
            out[((y - 1) * workWidth + x) * 4 + 3] === 0 ||
            out[((y + 1) * workWidth + x) * 4 + 3] === 0 ||
            out[(y * workWidth + (x - 1)) * 4 + 3] === 0 ||
            out[(y * workWidth + (x + 1)) * 4 + 3] === 0;

          if (!hasBgNeighbor) continue;

          const distToBg = Math.hypot(out[idx] - bg.r, out[idx + 1] - bg.g, out[idx + 2] - bg.b);
          // Find strongest interior neighbor color in 3x3 neighborhood
          let bestDistBg = distToBg;
          let bestR = out[idx];
          let bestG = out[idx + 1];
          let bestB = out[idx + 2];

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nIdx = ((y + dy) * workWidth + (x + dx)) * 4;
              if (out[nIdx + 3] === 255) {
                const nDistBg = Math.hypot(
                  out[nIdx] - bg.r,
                  out[nIdx + 1] - bg.g,
                  out[nIdx + 2] - bg.b
                );
                if (nDistBg > bestDistBg) {
                  bestDistBg = nDistBg;
                  bestR = out[nIdx];
                  bestG = out[nIdx + 1];
                  bestB = out[nIdx + 2];
                }
              }
            }
          }

          if (distToBg < bestDistBg * 0.45) {
            // Closer to background than interior foreground -> remove outer anti-aliased fringe pixel
            snapped[idx] = 255;
            snapped[idx + 1] = 255;
            snapped[idx + 2] = 255;
            snapped[idx + 3] = 0;
          } else {
            // Snap anti-aliased border pixel to pure interior foreground color
            snapped[idx] = bestR;
            snapped[idx + 1] = bestG;
            snapped[idx + 2] = bestB;
            snapped[idx + 3] = 255;
          }
        }
      }
      out.set(snapped);
    }
  }

  const bgHex = toHexColor(bg.r, bg.g, bg.b);

  return {
    rgba: out,
    workWidth,
    workHeight,
    bgHex,
    effectiveMode,
    autoFgColor: profile.dominantFgHex,
  };
}

/**
 * Post-processes VTracer SVG output to ensure proper viewBox, dimensions,
 * single-color recoloring, background cleanup, and Adobe Illustrator compatibility.
 */
function normalizeAndCleanSvg(
  rawSvg: string,
  origWidth: number,
  origHeight: number,
  workWidth: number,
  workHeight: number,
  config: TraceConfig,
  effectiveMode: 'bw' | 'color' | 'single',
  autoFgColor: string,
  bgHex: string
): string {
  let svg = rawSvg.trim();

  // Ensure viewBox="0 0 workWidth workHeight" and width/height match origWidth/origHeight
  svg = svg.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const cleanAttrs = attrs
      .replace(/\bwidth="[^"]*"/gi, '')
      .replace(/\bheight="[^"]*"/gi, '')
      .replace(/\bviewBox="[^"]*"/gi, '')
      .trim();
    return `<svg ${cleanAttrs} width="${origWidth}" height="${origHeight}" viewBox="0 0 ${workWidth} ${workHeight}">`;
  });

  // If removeBackground is enabled, strip any full-canvas background rectangle path at (0,0) matching white/bgHex
  if (config.removeBackground !== false) {
    svg = svg.replace(/<path\b[^>]*d="M0,0[^"]*"[^>]*fill="(#FFFFFF|#ffffff|#FEFEFE|#fefefe)"[^>]*\/>/g, '');
    if (bgHex && bgHex !== '#000000') {
      const escapedBg = bgHex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const bgRegex = new RegExp(`<path\\b[^>]*d="M0,0[^"]*"[^>]*fill="${escapedBg}"[^>]*\\/>`, 'gi');
      svg = svg.replace(bgRegex, '');
    }
  }

  // Apply chosen color for Single Color mode, or preserve original monochrome color in Auto mode
  if (effectiveMode === 'single' && config.singleColor) {
    const targetColor = /^#[0-9A-Fa-f]{3,8}$/.test(config.singleColor.trim())
      ? config.singleColor.trim()
      : '#4F46E5';
    svg = svg.replace(/fill="#[0-9A-Fa-f]{3,8}"/g, `fill="${targetColor}"`);
  } else if (config.colorMode === 'auto' && effectiveMode === 'bw' && autoFgColor) {
    svg = svg.replace(/fill="#[0-9A-Fa-f]{3,8}"/g, `fill="${autoFgColor}"`);
  }

  return svg;
}

/**
 * Validates the generated SVG string against all strict Section 10 requirements.
 */
export function validateSvgDocument(
  svg: string,
  expectedWidth: number,
  expectedHeight: number
): SvgValidationReport {
  const warnings: string[] = [];

  const hasXmlStructure = /<svg\b[^>]*>[\s\S]*<\/svg>/i.test(svg);
  const viewBoxMatch = svg.match(/\bviewBox="([^"]+)"/i);
  const viewBox = viewBoxMatch ? viewBoxMatch[1].trim() : '';
  const viewBoxParts = viewBox.split(/[\s,]+/).map(Number);
  const hasValidViewBox =
    viewBoxParts.length === 4 &&
    viewBoxParts.every((n) => !Number.isNaN(n)) &&
    viewBoxParts[2] > 0 &&
    viewBoxParts[3] > 0;

  const hasEmbeddedRasterTag = /<image\b/i.test(svg);
  const hasDataImageUri = /data:image\//i.test(svg);
  const hasNoEmbeddedRaster = !hasEmbeddedRasterTag && !hasDataImageUri;

  const hasBrokenRefs = /xlink:href="http|href="http/i.test(svg);
  const hasNoBrokenRefs = !hasBrokenRefs;

  const pathMatches = [...svg.matchAll(/<path\b([^>]*)\/?>/gi)];
  let validPathCount = 0;
  let anchorPointCount = 0;
  let compoundHoleCount = 0;
  const colorSet = new Set<string>();

  for (const match of pathMatches) {
    const attrs = match[1];
    const dMatch = attrs.match(/\bd="([^"]+)"/i);
    if (dMatch && dMatch[1].trim().length > 4) {
      const d = dMatch[1].trim();
      const commands = d.match(/[MLHVCSQTAZmlhvcsqtaz]/g);
      if (commands && commands.length >= 2) {
        validPathCount++;
        anchorPointCount += commands.length;
        const moveCommands = d.match(/[Mm]/g);
        if (moveCommands && moveCommands.length > 1) {
          compoundHoleCount += moveCommands.length - 1;
        }
      }
    }
    const fillMatch = attrs.match(/\bfill="([^"]+)"/i);
    if (fillMatch && fillMatch[1] !== 'none') {
      colorSet.add(fillMatch[1].toUpperCase());
    }
  }

  const hasVectorPaths = validPathCount > 0 && anchorPointCount >= 3;
  const hasTransparentBackground = !/<rect\b[^>]*width="100%"[^>]*fill="#FFF/i.test(svg);

  if (expectedWidth < 32 || expectedHeight < 32) {
    warnings.push(`ইনপুট আইকনের রেজোলিউশন কম (${expectedWidth}×${expectedHeight}px) — ২x সুপার-স্যাম্পলিং প্রয়োগ করা হয়েছে।`);
  }

  const isValid =
    hasXmlStructure &&
    hasValidViewBox &&
    hasVectorPaths &&
    hasNoEmbeddedRaster &&
    hasNoBrokenRefs &&
    hasTransparentBackground;

  let error: string | undefined;
  if (!isValid) {
    if (!hasNoEmbeddedRaster) error = 'ত্রুটি: SVG-তে এমবেডেড র‍্যাস্টার ইমেজ পাওয়া গেছে (বাতিল)।';
    else if (!hasVectorPaths) error = 'ত্রুটি: কোনো বৈধ ভেক্টর পাথ (Vector Path) তৈরি হয়নি। আইকনটি খালি বা অত্যন্ত অস্পষ্ট।';
    else if (!hasValidViewBox) error = 'ত্রুটি: বৈধ SVG viewBox পাওয়া যায়নি।';
    else if (!hasXmlStructure) error = 'ত্রুটি: SVG XML গঠন সঠিক নয়।';
    else error = 'ত্রুটি: SVG ভ্যালিডেশন ব্যর্থ হয়েছে।';
  }

  return {
    isValid,
    hasXmlStructure,
    hasValidViewBox,
    hasVectorPaths,
    hasNoEmbeddedRaster,
    hasNoBrokenRefs,
    hasTransparentBackground,
    pathCount: validPathCount,
    anchorPointCount,
    compoundHoleCount,
    detectedColors: Array.from(colorSet),
    viewBox,
    width: expectedWidth,
    height: expectedHeight,
    warnings,
    error,
  };
}

/**
 * Core VTracer execution function using @visioncortex/vtracer WebAssembly.
 */
export function vectorizeIconRgba(
  rawRgba: Uint8Array,
  width: number,
  height: number,
  config: TraceConfig
): { svg: string; validation: SvgValidationReport } {
  const { rgba, workWidth, workHeight, bgHex, effectiveMode, autoFgColor } =
    preparePixelsForTracing(rawRgba, width, height, config);

  const isBwOrSingle = effectiveMode === 'bw' || effectiveMode === 'single';

  const vtracerOptions: Record<string, unknown> = {
    clustering: isBwOrSingle ? 'bw' : 'color-cluster',
    hierarchical: config.hierarchical || 'cutout',
    mode: config.curveMode || 'spline',
    filterSpeckle: config.filterSpeckle ?? 2,
    cornerThreshold: config.cornerThreshold ?? 60,
    lengthThreshold: config.lengthThreshold ?? 4.0,
    maxIterations: 10,
    spliceThreshold: config.spliceThreshold ?? 45,
    pathPrecision: config.pathPrecision ?? 2,
  };

  // Only enable VTracer's global curve simplifier if user explicitly sets simplify > 0.
  // Keeping it off (0) by default preserves 90-degree corners, straight walls, doors, and windows!
  if (typeof config.simplify === 'number' && config.simplify > 0) {
    vtracerOptions.simplify = config.simplify;
  }

  if (isBwOrSingle) {
    vtracerOptions.binaryThreshold = 128;
  } else {
    vtracerOptions.colorPrecision = config.colorPrecision ?? 8;
    vtracerOptions.layerDifference = config.layerDifference ?? 10;
    if (config.maxColors && config.maxColors > 0) {
      vtracerOptions.maxColors = config.maxColors;
    }
  }

  const rawSvg: string = vtracer.convertPixels(rgba, workWidth, workHeight, vtracerOptions);
  const cleanSvg = normalizeAndCleanSvg(
    rawSvg,
    width,
    height,
    workWidth,
    workHeight,
    config,
    effectiveMode,
    autoFgColor,
    bgHex
  );
  const validation = validateSvgDocument(cleanSvg, width, height);

  return { svg: cleanSvg, validation };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      engine: '@visioncortex/vtracer (WebAssembly)',
      version: '1.0.0-alpha.4',
    });
  });

  app.post('/api/vectorize', (req, res) => {
    try {
      const {
        rgbaBase64,
        pngBase64,
        width,
        height,
        config = {},
      }: {
        rgbaBase64?: string;
        pngBase64?: string;
        width?: number;
        height?: number;
        config?: Partial<TraceConfig>;
      } = req.body;

      let rawRgba: Uint8Array;
      let imgWidth: number;
      let imgHeight: number;

      if (rgbaBase64 && width && height) {
        const buf = Buffer.from(rgbaBase64, 'base64');
        rawRgba = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        imgWidth = Number(width);
        imgHeight = Number(height);
      } else if (pngBase64) {
        const cleanB64 = pngBase64.replace(/^data:image\/\w+;base64,/, '');
        const pngBuf = Buffer.from(cleanB64, 'base64');
        const decoded = PNG.sync.read(pngBuf);
        rawRgba = new Uint8Array(decoded.data);
        imgWidth = decoded.width;
        imgHeight = decoded.height;
      } else {
        res.status(400).json({ error: 'rgbaBase64 (with width, height) অথবা pngBase64 প্রদান করা আবশ্যক।' });
        return;
      }

      if (imgWidth <= 0 || imgHeight <= 0 || rawRgba.length !== imgWidth * imgHeight * 4) {
        res.status(400).json({
          error: `অবৈধ ইমেজ ডাইমেনশন (${imgWidth}×${imgHeight}) বা RGBA বাফার সাইজ (${rawRgba.length})।`,
        });
        return;
      }

      const traceConfig: TraceConfig = {
        colorMode: config.colorMode || 'auto',
        singleColor: config.singleColor || '#000000',
        curveMode: config.curveMode || 'spline',
        hierarchical: config.hierarchical || 'cutout',
        filterSpeckle: config.filterSpeckle ?? 2,
        colorPrecision: config.colorPrecision ?? 8,
        layerDifference: config.layerDifference ?? 10,
        cornerThreshold: config.cornerThreshold ?? 60,
        lengthThreshold: config.lengthThreshold ?? 4.0,
        spliceThreshold: config.spliceThreshold ?? 45,
        simplify: config.simplify ?? 0,
        pathPrecision: config.pathPrecision ?? 2,
        binaryThreshold: config.binaryThreshold ?? 128,
        maxColors: config.maxColors,
        removeBackground: config.removeBackground !== false,
        upscaleSmallIcons: config.upscaleSmallIcons !== false,
      };

      const { svg, validation } = vectorizeIconRgba(rawRgba, imgWidth, imgHeight, traceConfig);

      if (!validation.isValid) {
        res.status(422).json({
          success: false,
          error: validation.error || 'SVG ভ্যালিডেশন ব্যর্থ হয়েছে।',
          validation,
        });
        return;
      }

      res.json({
        success: true,
        svg,
        validation,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ভেক্টরাইজেশন প্রসেসিং ত্রুটি';
      res.status(500).json({
        success: false,
        error: `VTracer ত্রুটি: ${msg}`,
      });
    }
  });

  app.post('/api/vectorize-batch', (req, res) => {
    try {
      const {
        items,
        config = {},
      }: {
        items: Array<{ id: string; rgbaBase64?: string; pngBase64?: string; width?: number; height?: number }>;
        config?: Partial<TraceConfig>;
      } = req.body;

      if (!Array.isArray(items)) {
        res.status(400).json({ error: 'items অ্যারে প্রদান করা আবশ্যক।' });
        return;
      }

      const traceConfig: TraceConfig = {
        colorMode: config.colorMode || 'auto',
        singleColor: config.singleColor || '#000000',
        curveMode: config.curveMode || 'spline',
        hierarchical: config.hierarchical || 'cutout',
        filterSpeckle: config.filterSpeckle ?? 2,
        colorPrecision: config.colorPrecision ?? 8,
        layerDifference: config.layerDifference ?? 10,
        cornerThreshold: config.cornerThreshold ?? 60,
        lengthThreshold: config.lengthThreshold ?? 4.0,
        spliceThreshold: config.spliceThreshold ?? 45,
        simplify: config.simplify ?? 0,
        pathPrecision: config.pathPrecision ?? 2,
        binaryThreshold: config.binaryThreshold ?? 128,
        maxColors: config.maxColors,
        removeBackground: config.removeBackground !== false,
        upscaleSmallIcons: config.upscaleSmallIcons !== false,
      };

      const results = items.map((item) => {
        try {
          let rawRgba: Uint8Array;
          let imgWidth: number;
          let imgHeight: number;

          if (item.rgbaBase64 && item.width && item.height) {
            const buf = Buffer.from(item.rgbaBase64, 'base64');
            rawRgba = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
            imgWidth = Number(item.width);
            imgHeight = Number(item.height);
          } else if (item.pngBase64) {
            const cleanB64 = item.pngBase64.replace(/^data:image\/\w+;base64,/, '');
            const pngBuf = Buffer.from(cleanB64, 'base64');
            const decoded = PNG.sync.read(pngBuf);
            rawRgba = new Uint8Array(decoded.data);
            imgWidth = decoded.width;
            imgHeight = decoded.height;
          } else {
            return {
              id: item.id,
              success: false,
              error: 'ইমেজ ডেটা পাওয়া যায়নি।',
            };
          }

          const { svg, validation } = vectorizeIconRgba(rawRgba, imgWidth, imgHeight, traceConfig);
          return {
            id: item.id,
            success: validation.isValid,
            svg: validation.isValid ? svg : undefined,
            validation,
            error: validation.error,
          };
        } catch (e: unknown) {
          return {
            id: item.id,
            success: false,
            error: e instanceof Error ? e.message : 'ভেক্টরাইজেশন ব্যর্থ',
          };
        }
      });

      res.json({ results });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ব্যাচ ভেক্টরাইজেশন ত্রুটি';
      res.status(500).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ICON VECTOR MASTER server running on http://localhost:${PORT}`);
  });
}

startServer();
