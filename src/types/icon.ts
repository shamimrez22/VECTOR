export interface TraceConfig {
  colorMode: 'auto' | 'bw' | 'color' | 'single';
  singleColor: string;
  curveMode: 'spline' | 'polygon' | 'pixel';
  hierarchical: 'cutout' | 'stacked';
  filterSpeckle: number;
  colorPrecision: number;
  layerDifference: number;
  cornerThreshold: number;
  lengthThreshold: number;
  spliceThreshold: number;
  simplify: number;
  pathPrecision: number;
  binaryThreshold: number;
  maxColors?: number;
  removeBackground: boolean;
  upscaleSmallIcons: boolean;
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

export interface CropCellBox {
  id: string;
  row: number;
  col: number;
  /** Cell boundary in source image coordinates */
  cellX: number;
  cellY: number;
  cellW: number;
  cellH: number;
  /** Padded tight content bounding box in source image coordinates */
  x: number;
  y: number;
  width: number;
  height: number;
  enabled: boolean;
  label: string;
}

export interface SheetSegmentationResult {
  isSheet: boolean;
  rows: number;
  cols: number;
  confidence: 'high' | 'medium' | 'low';
  backgroundType: 'transparent' | 'solid-light' | 'solid-dark' | 'solid-color';
  backgroundColorHex: string;
  padding: number;
  cells: CropCellBox[];
}

export interface UploadedSourceFile {
  id: string;
  fileName: string;
  baseName: string;
  width: number;
  height: number;
  dataUrl: string;
  treatAsSheet: boolean;
  segmentation: SheetSegmentationResult;
  manualRows?: number;
  manualCols?: number;
  manualPadding?: number;
  manualInset?: number;
}

export type IconProcessStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface SeparatedIconItem {
  id: string;
  name: string;
  originalFileName: string;
  sourceId: string;
  width: number;
  height: number;
  originalDataUrl: string;
  rgbaBase64: string;
  status: IconProcessStatus;
  svgContent?: string;
  validation?: SvgValidationReport;
  errorMessage?: string;
  selected: boolean;
  gridPosition?: {
    row: number;
    col: number;
    indexInSheet: number;
  };
}

export interface IconSetGroup {
  setNumber: number;
  setName: string;
  folderName: string;
  icons: SeparatedIconItem[];
}

export type ActiveSection = 'upload' | 'separated' | 'preview' | 'sets' | 'download';
