import JSZip from 'jszip';
import { IconSetGroup, SeparatedIconItem } from '../types/icon';

const SUPPORTED_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|bmp)$/i;

/**
 * Extracts all supported raster image files (PNG, JPG, JPEG, WEBP, BMP) from an uploaded ZIP archive.
 */
export async function extractImageFilesFromZip(zipFile: File): Promise<File[]> {
  const zip = await JSZip.loadAsync(zipFile);
  const extractedFiles: File[] = [];
  const entries = Object.values(zip.files);

  for (const entry of entries) {
    if (entry.dir) continue;
    // Ignore macOS hidden resource fork files
    if (entry.name.includes('__MACOSX') || entry.name.split('/').pop()?.startsWith('.')) {
      continue;
    }
    if (!SUPPORTED_IMAGE_EXTENSIONS.test(entry.name)) {
      continue;
    }

    const baseFileName = entry.name.split('/').pop() || entry.name;
    const ext = baseFileName.split('.').pop()?.toLowerCase() || 'png';
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      bmp: 'image/bmp',
    };
    const blob = await entry.async('blob');
    const imgFile = new File([blob], baseFileName, {
      type: mimeMap[ext] || 'image/png',
    });
    extractedFiles.push(imgFile);
  }

  return extractedFiles;
}

/**
 * Triggers a clean browser file download and revokes the temporary Object URL to avoid memory leaks.
 */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}

/**
 * A. Download Individual SVG
 */
export function downloadIndividualSvg(icon: SeparatedIconItem): void {
  if (!icon.svgContent) return;
  const cleanName = icon.name.replace(/\.svg$/i, '');
  const blob = new Blob([icon.svgContent], { type: 'image/svg+xml;charset=utf-8' });
  triggerBlobDownload(blob, `${cleanName}.svg`);
}

/**
 * Formats filename inside a set folder, keeping original sensible name or sequential icon_001.svg.
 */
function formatExportSvgFileName(
  icon: SeparatedIconItem,
  indexInSet: number,
  namingMode: 'original' | 'sequential',
  usedInFolder: Set<string>
): string {
  const seqNum = String(indexInSet + 1).padStart(3, '0');
  let base =
    namingMode === 'sequential'
      ? `icon_${seqNum}`
      : icon.name.replace(/[^a-zA-Z0-9_-]/g, '_') || `icon_${seqNum}`;

  if (usedInFolder.has(base.toLowerCase())) {
    base = `${base}_${seqNum}`;
  }
  usedInFolder.add(base.toLowerCase());
  return `${base}.svg`;
}

/**
 * B. Download Complete Single Set as a ZIP Archive
 */
export async function downloadSingleSetAsZip(
  setGroup: IconSetGroup,
  namingMode: 'original' | 'sequential' = 'original'
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder(setGroup.folderName);
  if (!folder) return;

  const usedInFolder = new Set<string>();
  let idx = 0;
  for (const icon of setGroup.icons) {
    if (icon.status === 'completed' && icon.svgContent) {
      const fileName = formatExportSvgFileName(icon, idx, namingMode, usedInFolder);
      folder.file(fileName, icon.svgContent);
      idx++;
    }
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  triggerBlobDownload(blob, `${setGroup.folderName}.zip`);
}

/**
 * C. Download All Sets in One Complete ZIP Archive with exact structure:
 * ICON_VECTOR_MASTER_EXPORT/
 *   SET_01/
 *     icon_001.svg
 *   SET_02/
 *     icon_001.svg
 */
export async function downloadAllSetsAsZip(
  sets: IconSetGroup[],
  namingMode: 'original' | 'sequential' = 'original'
): Promise<void> {
  const zip = new JSZip();
  const rootFolder = zip.folder('ICON_VECTOR_MASTER_EXPORT');
  if (!rootFolder) return;

  for (const setGroup of sets) {
    const setFolder = rootFolder.folder(setGroup.folderName);
    if (!setFolder) continue;

    const usedInFolder = new Set<string>();
    let idx = 0;
    for (const icon of setGroup.icons) {
      if (icon.status === 'completed' && icon.svgContent) {
        const fileName = formatExportSvgFileName(icon, idx, namingMode, usedInFolder);
        setFolder.file(fileName, icon.svgContent);
        idx++;
      }
    }
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  triggerBlobDownload(blob, 'ICON_VECTOR_MASTER_EXPORT.zip');
}

/**
 * D. Download User-Selected Icons as a ZIP Archive
 */
export async function downloadSelectedIconsAsZip(
  icons: SeparatedIconItem[],
  namingMode: 'original' | 'sequential' = 'original'
): Promise<void> {
  const validIcons = icons.filter((i) => i.selected && i.status === 'completed' && i.svgContent);
  if (validIcons.length === 0) return;

  const zip = new JSZip();
  const folder = zip.folder('ICON_VECTOR_MASTER_SELECTED');
  if (!folder) return;

  const usedInFolder = new Set<string>();
  validIcons.forEach((icon, idx) => {
    const fileName = formatExportSvgFileName(icon, idx, namingMode, usedInFolder);
    folder.file(fileName, icon.svgContent!);
  });

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  triggerBlobDownload(blob, 'ICON_VECTOR_MASTER_SELECTED.zip');
}
