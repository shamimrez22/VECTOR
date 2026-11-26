import React, { useState, useRef, useMemo } from 'react';
import {
  Upload,
  Grid,
  Eye,
  FolderKanban,
  Download,
  Play,
  Pause,
  Square,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Trash2,
  FileArchive,
  CheckSquare,
  Search,
  RefreshCw,
  Layers,
  Scissors,
  Sparkles,
} from 'lucide-react';
import {
  ActiveSection,
  IconSetGroup,
  SeparatedIconItem,
  SheetSegmentationResult,
  TraceConfig,
  UploadedSourceFile,
} from './types/icon';
import {
  autoSegmentIconSheet,
  extractSeparatedIconsFromSource,
  loadImageElement,
} from './utils/iconSeparator';
import {
  downloadAllSetsAsZip,
  downloadIndividualSvg,
  downloadSelectedIconsAsZip,
  downloadSingleSetAsZip,
  extractImageFilesFromZip,
} from './utils/exportUtils';
import {
  generateSample100IconsBatch,
  generateSample18IconSheetFile,
  generateSampleCameraIconFile,
  generateSampleHouseIconFile,
} from './utils/sampleGenerator';
import { SegmentationModal } from './components/SegmentationModal';
import { VectorPreviewPanel } from './components/VectorPreviewPanel';

const DEFAULT_TRACE_CONFIG: TraceConfig = {
  colorMode: 'auto',
  singleColor: '#4F46E5',
  curveMode: 'spline',
  hierarchical: 'cutout',
  filterSpeckle: 2,
  colorPrecision: 8,
  layerDifference: 10,
  cornerThreshold: 60,
  lengthThreshold: 4.0,
  spliceThreshold: 45,
  simplify: 0,
  pathPrecision: 2,
  binaryThreshold: 128,
  removeBackground: true,
  upscaleSmallIcons: true,
};

export default function App() {
  // Navigation & Workflow State
  const [activeSection, setActiveSection] = useState<ActiveSection>('upload');

  // Upload & Separation State
  const [uploadMode, setUploadMode] = useState<'auto' | 'sheet' | 'individual'>('auto');
  const [sourceFiles, setSourceFiles] = useState<UploadedSourceFile[]>([]);
  const [icons, setIcons] = useState<SeparatedIconItem[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>('');
  const [inspectingSourceId, setInspectingSourceId] = useState<string | null>(null);

  // VTracer Configuration State
  const [traceConfig, setTraceConfig] = useState<TraceConfig>(DEFAULT_TRACE_CONFIG);

  // Batch Queue Processing State
  const [isVectorizing, setIsVectorizing] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [totalToProcess, setTotalToProcess] = useState<number>(0);
  const pauseRef = useRef<boolean>(false);
  const cancelRef = useRef<boolean>(false);

  // Gallery & Inspector State
  const [activePreviewIconId, setActivePreviewIconId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');

  // Set Management & Download State
  const [iconsPerSet, setIconsPerSet] = useState<number>(20);
  const [exportNamingMode, setExportNamingMode] = useState<'original' | 'sequential'>('original');
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Statistics
  const totalUploadedFiles = sourceFiles.length;
  const totalSeparatedIcons = icons.length;
  const completedIcons = useMemo(
    () => icons.filter((i) => i.status === 'completed' && i.svgContent),
    [icons]
  );
  const failedIcons = useMemo(
    () => icons.filter((i) => i.status === 'failed'),
    [icons]
  );
  const selectedIcons = useMemo(
    () => icons.filter((i) => i.selected),
    [icons]
  );

  // Dynamic Set Calculation (Works on all separated icons or completed icons without re-vectorizing)
  const iconSets: IconSetGroup[] = useMemo(() => {
    const safePerSet = Math.max(1, Math.round(iconsPerSet) || 20);
    const targetList = icons;
    const groups: IconSetGroup[] = [];
    for (let i = 0; i < targetList.length; i += safePerSet) {
      const setNum = Math.floor(i / safePerSet) + 1;
      const paddedNum = String(setNum).padStart(2, '0');
      groups.push({
        setNumber: setNum,
        setName: `Set ${paddedNum}`,
        folderName: `SET_${paddedNum}`,
        icons: targetList.slice(i, i + safePerSet),
      });
    }
    return groups;
  }, [icons, iconsPerSet]);

  // Filtered Icons for Gallery
  const filteredIcons = useMemo(() => {
    return icons.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (
        searchQuery.trim() &&
        !item.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) &&
        !item.originalFileName.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [icons, statusFilter, searchQuery]);

  /**
   * Processes uploaded files (PNG, JPG, JPEG, WEBP, BMP, or ZIP) in non-blocking chunks
   */
  const handleFilesSelected = async (
    rawFileList: File[] | FileList,
    forcedMode?: 'auto' | 'sheet' | 'individual'
  ) => {
    const modeToUse = forcedMode || uploadMode;
    const incomingFiles = Array.from(rawFileList);
    if (incomingFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgressText('ফাইল বিশ্লেষণ করা হচ্ছে...');

    try {
      // Expand any ZIP archives
      const imageFiles: File[] = [];
      for (const file of incomingFiles) {
        if (/\.zip$/i.test(file.name)) {
          setUploadProgressText(`ZIP আর্কাইভ (${file.name}) থেকে ইমেজ এক্সট্রাক্ট করা হচ্ছে...`);
          const extracted = await extractImageFilesFromZip(file);
          imageFiles.push(...extracted);
        } else if (/\.(png|jpe?g|webp|bmp)$/i.test(file.name) || file.type.startsWith('image/')) {
          imageFiles.push(file);
        }
      }

      if (imageFiles.length === 0) {
        setUploadProgressText('');
        setIsUploading(false);
        return;
      }

      // Per Section 4: "For multiple individually uploaded files, treat each file as one separate icon by default."
      const isMultipleIndividualBatch =
        modeToUse === 'individual' || (modeToUse === 'auto' && imageFiles.length > 1);

      const usedNames = new Set<string>(icons.map((i) => i.name.toLowerCase()));
      const newSources: UploadedSourceFile[] = [];
      const newSeparatedIcons: SeparatedIconItem[] = [];

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        setUploadProgressText(
          `ইমেজ প্রসেস ও সেপারেট করা হচ্ছে (${i + 1} / ${imageFiles.length}): ${file.name}`
        );

        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('ফাইল রিড করতে ব্যর্থ।'));
          reader.readAsDataURL(file);
        });

        const img = await loadImageElement(dataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const baseName =
          file.name
            .replace(/\.[^.]+$/, '')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '') || `icon_${i + 1}`;

        const segmentation = autoSegmentIconSheet(
          imgData.data,
          canvas.width,
          canvas.height,
          8,
          isMultipleIndividualBatch
        );

        const sourceRecord: UploadedSourceFile = {
          id: `src_${Date.now()}_${i}`,
          fileName: file.name,
          baseName,
          width: canvas.width,
          height: canvas.height,
          dataUrl,
          treatAsSheet: segmentation.isSheet,
          segmentation,
        };

        const extractedIcons = await extractSeparatedIconsFromSource(sourceRecord, usedNames);
        newSources.push(sourceRecord);
        newSeparatedIcons.push(...extractedIcons);

        // Yield back to browser event loop every 8 files so large 100-500 icon batches never freeze the UI
        if (i % 8 === 7) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      setSourceFiles((prev) => [...prev, ...newSources]);
      setIcons((prev) => {
        const combined = [...prev, ...newSeparatedIcons];
        if (!activePreviewIconId && combined.length > 0) {
          setActivePreviewIconId(combined[0].id);
        }
        return combined;
      });
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  /**
   * Re-extracts icons from a source file after user adjusts segmentation preview or manual grid fallback
   */
  const handleApplySegmentationUpdate = async (
    sourceId: string,
    newSegmentation: SheetSegmentationResult,
    treatAsSheet: boolean
  ) => {
    const targetSource = sourceFiles.find((s) => s.id === sourceId);
    if (!targetSource) return;

    const updatedSource: UploadedSourceFile = {
      ...targetSource,
      treatAsSheet,
      segmentation: newSegmentation,
    };

    // Keep names from other source files
    const otherIcons = icons.filter((ic) => ic.sourceId !== sourceId);
    const usedNames = new Set<string>(otherIcons.map((i) => i.name.toLowerCase()));
    const reExtracted = await extractSeparatedIconsFromSource(updatedSource, usedNames);

    setSourceFiles((prev) =>
      prev.map((s) => (s.id === sourceId ? updatedSource : s))
    );
    setIcons((prev) => {
      // Replace old icons from this sourceId at the same position
      const firstIdx = prev.findIndex((ic) => ic.sourceId === sourceId);
      const filtered = prev.filter((ic) => ic.sourceId !== sourceId);
      if (firstIdx === -1) return [...filtered, ...reExtracted];
      return [
        ...filtered.slice(0, firstIdx),
        ...reExtracted,
        ...filtered.slice(firstIdx),
      ];
    });
    if (reExtracted.length > 0) {
      setActivePreviewIconId(reExtracted[0].id);
    }
    setInspectingSourceId(null);
  };

  /**
   * Vectorizes a single icon via backend @visioncortex/vtracer WebAssembly engine
   */
  const vectorizeSingleIcon = async (icon: SeparatedIconItem, configOverride?: TraceConfig) => {
    const cfg = configOverride || traceConfig;
    setIcons((prev) =>
      prev.map((item) =>
        item.id === icon.id ? { ...item, status: 'processing', errorMessage: undefined } : item
      )
    );

    try {
      const response = await fetch('/api/vectorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rgbaBase64: icon.rgbaBase64,
          width: icon.width,
          height: icon.height,
          config: cfg,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setIcons((prev) =>
          prev.map((item) =>
            item.id === icon.id
              ? {
                  ...item,
                  status: 'failed',
                  svgContent: undefined,
                  validation: data.validation,
                  errorMessage: data.error || 'ভেক্টরাইজেশন ব্যর্থ হয়েছে।',
                }
              : item
          )
        );
        return false;
      }

      setIcons((prev) =>
        prev.map((item) =>
          item.id === icon.id
            ? {
                ...item,
                status: 'completed',
                svgContent: data.svg,
                validation: data.validation,
                errorMessage: undefined,
              }
            : item
        )
      );
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'নেটওয়ার্ক বা সার্ভার ত্রুটি';
      setIcons((prev) =>
        prev.map((item) =>
          item.id === icon.id
            ? { ...item, status: 'failed', svgContent: undefined, errorMessage: msg }
            : item
        )
      );
      return false;
    }
  };

  /**
   * Batch Queue Vectorization with Concurrency Control, Pause, Resume, and Cancel
   */
  const startBatchVectorization = async (onlyPending: boolean = false) => {
    const queue = icons.filter((ic) =>
      onlyPending ? ic.status !== 'completed' : true
    );
    if (queue.length === 0) return;

    setIsVectorizing(true);
    setIsPaused(false);
    pauseRef.current = false;
    cancelRef.current = false;
    setProcessedCount(0);
    setTotalToProcess(queue.length);

    const chunkSize = 6;
    let completedSoFar = 0;

    for (let i = 0; i < queue.length; i += chunkSize) {
      if (cancelRef.current) break;

      while (pauseRef.current && !cancelRef.current) {
        await new Promise((r) => setTimeout(r, 150));
      }
      if (cancelRef.current) break;

      const chunk = queue.slice(i, i + chunkSize);
      const chunkIds = new Set(chunk.map((c) => c.id));

      setIcons((prev) =>
        prev.map((item) =>
          chunkIds.has(item.id)
            ? { ...item, status: 'processing', errorMessage: undefined }
            : item
        )
      );

      try {
        const response = await fetch('/api/vectorize-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: chunk.map((c) => ({
              id: c.id,
              rgbaBase64: c.rgbaBase64,
              width: c.width,
              height: c.height,
            })),
            config: traceConfig,
          }),
        });

        const data = await response.json();
        if (response.ok && Array.isArray(data.results)) {
          const resultMap = new Map<
            string,
            {
              success: boolean;
              svg?: string;
              validation?: SeparatedIconItem['validation'];
              error?: string;
            }
          >();
          for (const r of data.results) {
            resultMap.set(r.id, r);
          }

          setIcons((prev) =>
            prev.map((item) => {
              const res = resultMap.get(item.id);
              if (!res) return item;
              if (res.success && res.svg) {
                return {
                  ...item,
                  status: 'completed',
                  svgContent: res.svg,
                  validation: res.validation,
                  errorMessage: undefined,
                };
              } else {
                return {
                  ...item,
                  status: 'failed',
                  svgContent: undefined,
                  validation: res.validation,
                  errorMessage: res.error || 'ভেক্টর পাথ তৈরি করা যায়নি।',
                };
              }
            })
          );
        } else {
          setIcons((prev) =>
            prev.map((item) =>
              chunkIds.has(item.id)
                ? {
                    ...item,
                    status: 'failed',
                    errorMessage: data.error || 'ব্যাচ প্রসেসিং ব্যর্থ',
                  }
                : item
            )
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'নেটওয়ার্ক ত্রুটি';
        setIcons((prev) =>
          prev.map((item) =>
            chunkIds.has(item.id)
              ? { ...item, status: 'failed', errorMessage: msg }
              : item
          )
        );
      }

      completedSoFar += chunk.length;
      setProcessedCount(completedSoFar);
      await new Promise((r) => setTimeout(r, 10));
    }

    setIsVectorizing(false);
    setIsPaused(false);
  };

  const togglePauseQueue = () => {
    pauseRef.current = !pauseRef.current;
    setIsPaused(pauseRef.current);
  };

  const cancelQueue = () => {
    cancelRef.current = true;
    pauseRef.current = false;
    setIsPaused(false);
    setIsVectorizing(false);
  };

  const handleClearWorkspace = () => {
    cancelQueue();
    setSourceFiles([]);
    setIcons([]);
    setActivePreviewIconId(null);
    setProcessedCount(0);
    setTotalToProcess(0);
  };

  /**
   * Built-in Sample Loaders for Quick Verification of All Required Test Cases
   */
  const runSampleTest = async (
    testType: 'house' | 'camera' | 'sheet18' | 'batch100'
  ) => {
    if (testType === 'house') {
      const f = await generateSampleHouseIconFile();
      await handleFilesSelected([f], 'individual');
    } else if (testType === 'camera') {
      const f = await generateSampleCameraIconFile();
      await handleFilesSelected([f], 'individual');
    } else if (testType === 'sheet18') {
      const f = await generateSample18IconSheetFile();
      await handleFilesSelected([f], 'sheet');
    } else if (testType === 'batch100') {
      const files = await generateSample100IconsBatch();
      await handleFilesSelected(files, 'individual');
    }
  };

  const inspectingSource = useMemo(
    () => sourceFiles.find((s) => s.id === inspectingSourceId) || null,
    [sourceFiles, inspectingSourceId]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F17] text-[#F1F5F9]">
      {/* Top Navigation Bar — Strict 3-Zone Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-[#0B0F17] sticky top-0 z-30">
        {/* Zone 1: Brand Title, One Line */}
        <a
          href="#upload"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('upload');
          }}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          ICON VECTOR MASTER
        </a>

        {/* Zone 2: 5 Workflow Navigation Links (Single-line) */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
          <button
            onClick={() => setActiveSection('upload')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'upload'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'hover:text-slate-200'
            }`}
          >
            ১. আপলোড আইকন (Upload)
          </button>
          <button
            onClick={() => setActiveSection('separated')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'separated'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'hover:text-slate-200'
            }`}
          >
            ২. সেপারেটেড গ্যালারি ({totalSeparatedIcons})
          </button>
          <button
            onClick={() => setActiveSection('preview')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'preview'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'hover:text-slate-200'
            }`}
          >
            ৩. ভেক্টর প্রিভিউ (Vector Preview)
          </button>
          <button
            onClick={() => setActiveSection('sets')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'sets'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'hover:text-slate-200'
            }`}
          >
            ৪. সেট ম্যানেজমেন্ট ({iconSets.length} সেট)
          </button>
          <button
            onClick={() => setActiveSection('download')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'download'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'hover:text-slate-200'
            }`}
          >
            ৫. ডাউনলোড সেন্টার (Export)
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => startBatchVectorization(false)}
            disabled={icons.length === 0 || isVectorizing}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {isVectorizing
              ? `ভেক্টরাইজ হচ্ছে (${processedCount}/${totalToProcess})...`
              : `সব ভেক্টরাইজ করুন (${totalSeparatedIcons})`}
          </button>
        </div>
      </header>

      {/* Main Workspace Layout: Left Sidebar (270px) + Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left Sidebar: Workflow Sections, VTracer Engine Settings, and Batch Stats */}
        <aside className="w-full lg:w-72 shrink-0 bg-[#111827] border-b lg:border-b-0 lg:border-r border-slate-800 p-5 flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            {/* Section Switcher */}
            <div>
              <div className="text-xs font-semibold text-slate-400 mb-2.5">
                প্রধান ওয়ার্কফ্লো (Workflow Steps)
              </div>
              <div className="space-y-1">
                {[
                  {
                    id: 'upload' as ActiveSection,
                    label: '১. আপলোড ও শিট সেপারেশন',
                    sub: `${totalUploadedFiles} ফাইল`,
                    icon: Upload,
                  },
                  {
                    id: 'separated' as ActiveSection,
                    label: '২. সেপারেটেড আইকন গ্যালারি',
                    sub: `${totalSeparatedIcons} আইকন`,
                    icon: Grid,
                  },
                  {
                    id: 'preview' as ActiveSection,
                    label: '৩. অরিজিনাল বনাম ভেক্টর প্রিভিউ',
                    sub: `${completedIcons.length} SVG`,
                    icon: Eye,
                  },
                  {
                    id: 'sets' as ActiveSection,
                    label: '৪. সেট ম্যানেজমেন্ট',
                    sub: `${iconSets.length} সেট`,
                    icon: FolderKanban,
                  },
                  {
                    id: 'download' as ActiveSection,
                    label: '৫. ডাউনলোড সেন্টার (ZIP/SVG)',
                    sub: `${completedIcons.length} প্রস্তুত`,
                    icon: Download,
                  },
                ].map((nav) => {
                  const IconComp = nav.icon;
                  const active = activeSection === nav.id;
                  return (
                    <button
                      key={nav.id}
                      onClick={() => setActiveSection(nav.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                        active
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-300 hover:bg-slate-800/70'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <IconComp className="w-4 h-4 shrink-0" />
                        <span className="truncate">{nav.label}</span>
                      </span>
                      <span
                        className={`font-mono tabular-nums text-[11px] ml-2 shrink-0 ${
                          active ? 'text-indigo-100' : 'text-slate-400'
                        }`}
                      >
                        {nav.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* VTracer Engine Configuration Panel */}
            <div className="pt-5 border-t border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  <span>VTracer ইঞ্জিন সেটিংস</span>
                </span>
                <button
                  onClick={() => setTraceConfig(DEFAULT_TRACE_CONFIG)}
                  className="text-[11px] text-slate-400 hover:text-indigo-400 transition-colors"
                >
                  রিসেট
                </button>
              </div>

              {/* Color Mode Selector: Auto Smart, A. Black & White, B. Full Color, C. Single Color */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  ভেক্টর ট্রেসিং মোড (Tracing Mode)
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    onClick={() =>
                      setTraceConfig((prev) => ({ ...prev, colorMode: 'auto' }))
                    }
                    className={`px-3 py-2 rounded-lg text-xs font-medium text-left border transition-colors ${
                      traceConfig.colorMode === 'auto'
                        ? 'bg-indigo-950/80 border-indigo-500 text-white'
                        : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    স্বয়ংক্রিয় স্মার্ট মোড (Auto B&W / Color)
                  </button>
                  <button
                    onClick={() =>
                      setTraceConfig((prev) => ({ ...prev, colorMode: 'bw' }))
                    }
                    className={`px-3 py-2 rounded-lg text-xs font-medium text-left border transition-colors ${
                      traceConfig.colorMode === 'bw'
                        ? 'bg-indigo-950/80 border-indigo-500 text-white'
                        : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    A. সাদা-কালো লাইন আর্ট (B&W Line Art)
                  </button>
                  <button
                    onClick={() =>
                      setTraceConfig((prev) => ({ ...prev, colorMode: 'color' }))
                    }
                    className={`px-3 py-2 rounded-lg text-xs font-medium text-left border transition-colors ${
                      traceConfig.colorMode === 'color'
                        ? 'bg-indigo-950/80 border-indigo-500 text-white'
                        : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    B. ফুল কালার ভেক্টর (Full Color Vector)
                  </button>
                  <button
                    onClick={() =>
                      setTraceConfig((prev) => ({ ...prev, colorMode: 'single' }))
                    }
                    className={`px-3 py-2 rounded-lg text-xs font-medium text-left border transition-colors ${
                      traceConfig.colorMode === 'single'
                        ? 'bg-indigo-950/80 border-indigo-500 text-white'
                        : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    C. একক রঙের ভেক্টর (Single Color Vector)
                  </button>
                </div>
              </div>

              {/* Single Color Picker when Single Color Mode is active */}
              {traceConfig.colorMode === 'single' && (
                <div className="flex items-center justify-between bg-[#0B0F17] p-2.5 rounded-lg border border-slate-800">
                  <span className="text-xs text-slate-300">ভেক্টর রঙ নির্বাচন:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={traceConfig.singleColor}
                      onChange={(e) =>
                        setTraceConfig((prev) => ({
                          ...prev,
                          singleColor: e.target.value,
                        }))
                      }
                      className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <span className="text-xs font-mono text-slate-200">
                      {traceConfig.singleColor.toUpperCase()}
                    </span>
                  </div>
                </div>
              )}

              {/* Curve Fitting Mode */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  কার্ভ ফিটিং (Curve Fitting Mode)
                </label>
                <select
                  value={traceConfig.curveMode}
                  onChange={(e) =>
                    setTraceConfig((prev) => ({
                      ...prev,
                      curveMode: e.target.value as TraceConfig['curveMode'],
                    }))
                  }
                  className="w-full px-3 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="spline">Spline (মসৃণ বেজিয়ার কার্ভ — প্রস্তাবিত)</option>
                  <option value="polygon">Polygon (শার্প জ্যামিতিক পলিগন)</option>
                  <option value="pixel">Pixel (পিক্সেল আর্ট)</option>
                </select>
              </div>

              {/* Curve Simplification Tolerance (0 = Off / Preserve Exact Corners) */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-400">কার্ভ সিম্পলিফাই (Simplify)</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {traceConfig.simplify === 0 ? '0 (অফ — নিখুঁত কর্নার)' : `${traceConfig.simplify} px`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.8}
                  step={0.1}
                  value={traceConfig.simplify}
                  onChange={(e) =>
                    setTraceConfig((prev) => ({
                      ...prev,
                      simplify: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-indigo-500"
                />
              </div>

              {/* Corner Threshold */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-400">কর্নার থ্রেশহোল্ড (Corners)</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {traceConfig.cornerThreshold}°
                  </span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={110}
                  step={5}
                  value={traceConfig.cornerThreshold}
                  onChange={(e) =>
                    setTraceConfig((prev) => ({
                      ...prev,
                      cornerThreshold: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-indigo-500"
                />
              </div>

              {/* Speckle Filter */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-400">ক্ষুদ্র নয়েজ ফিল্টার (Speckle)</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {traceConfig.filterSpeckle} px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={traceConfig.filterSpeckle}
                  onChange={(e) =>
                    setTraceConfig((prev) => ({
                      ...prev,
                      filterSpeckle: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-indigo-500"
                />
              </div>

              {/* Preserve Negative Spaces & Remove Solid Background */}
              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={traceConfig.removeBackground}
                  onChange={(e) =>
                    setTraceConfig((prev) => ({
                      ...prev,
                      removeBackground: e.target.checked,
                    }))
                  }
                  className="rounded accent-indigo-500"
                />
                <span>স্বচ্ছ ব্যাকগ্রাউন্ড ও নেগেটিভ স্পেস সংরক্ষণ</span>
              </label>

              {icons.length > 0 && (
                <button
                  onClick={() => startBatchVectorization(false)}
                  disabled={isVectorizing}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isVectorizing ? 'animate-spin' : ''}`} />
                  <span>বর্তমান সেটিংসে সব ভেক্টরাইজ করুন</span>
                </button>
              )}
            </div>
          </div>

          {/* Live Batch Summary Box in Sidebar Footer */}
          <div className="p-3.5 bg-[#0B0F17] border border-slate-800 rounded-xl space-y-2 text-xs">
            <div className="font-semibold text-slate-300 border-b border-slate-800 pb-1.5">
              ব্যাচ স্ট্যাটাস সামারি
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">আপলোডেড ফাইল:</span>
              <span className="font-mono tabular-nums text-slate-200">{totalUploadedFiles}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">সেপারেটেড আইকন:</span>
              <span className="font-mono tabular-nums text-slate-200">{totalSeparatedIcons}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">সফল ভেক্টর (SVG):</span>
              <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                {completedIcons.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">ব্যর্থ আইকন:</span>
              <span className="font-mono tabular-nums text-rose-400">{failedIcons.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">মোট সেট ({iconsPerSet}/সেট):</span>
              <span className="font-mono tabular-nums text-indigo-400 font-semibold">
                {iconSets.length}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Viewport Content */}
        <main className="flex-1 p-6 overflow-y-auto space-y-6">
          {/* Active Batch Vectorization Progress & Queue Control Bar */}
          {(isVectorizing || totalSeparatedIcons > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[#111827] border border-slate-800 rounded-xl">
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-200">
                    {isVectorizing
                      ? isPaused
                        ? 'ভেক্টরাইজেশন কিউ বিরতিতে আছে (Paused)'
                        : `VTracer WebAssembly ভেক্টরাইজেশন চলছে (${processedCount} / ${totalToProcess})`
                      : `মোট ${totalSeparatedIcons}টি আইকন প্রস্তুত · ${completedIcons.length}টি SVG সম্পন্ন`}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    মোড: {traceConfig.colorMode === 'bw' ? 'সাদা-কালো লাইন আর্ট' : traceConfig.colorMode === 'color' ? 'ফুল কালার ভেক্টর' : `সিঙ্গেল কালার (${traceConfig.singleColor})`} · কার্ভ: {traceConfig.curveMode} · নেগেটিভ স্পেস কাটআউট সক্রিয়
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {!isVectorizing ? (
                  <>
                    <button
                      onClick={() => startBatchVectorization(false)}
                      disabled={icons.length === 0}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>সব আইকন ভেক্টরাইজ করুন ({totalSeparatedIcons})</span>
                    </button>
                    {completedIcons.length > 0 && completedIcons.length < totalSeparatedIcons && (
                      <button
                        onClick={() => startBatchVectorization(true)}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-indigo-300 bg-indigo-950/70 hover:bg-indigo-900/70 border border-indigo-800/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>বাকিগুলো ভেক্টরাইজ করুন ({totalSeparatedIcons - completedIcons.length})</span>
                      </button>
                    )}
                    <button
                      onClick={handleClearWorkspace}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-rose-300 bg-[#0B0F17] hover:bg-rose-950/40 border border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>সব মুছুন</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={togglePauseQueue}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-200 bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      {isPaused ? (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>চালিয়ে যান (Resume)</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-3.5 h-3.5" />
                          <span>বিরতি (Pause)</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={cancelQueue}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-200 bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>বাতিল (Cancel)</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* SECTION 1: UPLOAD ICONS & AUTOMATIC SHEET SEPARATION */}
          {activeSection === 'upload' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-white">
                    ১. আইকন ও আইকন শিট আপলোড (Upload Icons & Icon Sheets)
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    একক আইকন, শত শত আলাদা আইকন, সম্পূর্ণ আইকন শিট (যেমন ৩×৬ = ১৮টি আইকন), অথবা ZIP আর্কাইভ আপলোড করুন।
                  </p>
                </div>

                {/* Upload Mode Selector */}
                <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-lg">
                  <button
                    onClick={() => setUploadMode('auto')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      uploadMode === 'auto'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    স্বয়ংক্রিয় ডিটেকশন (Auto)
                  </button>
                  <button
                    onClick={() => setUploadMode('sheet')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      uploadMode === 'sheet'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    আইকন শিট গ্রিড (Icon Sheet)
                  </button>
                  <button
                    onClick={() => setUploadMode('individual')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      uploadMode === 'individual'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    একক আইকন ফাইল (Individual)
                  </button>
                </div>
              </div>

              {/* Drag and Drop Upload Zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleFilesSelected(e.dataTransfer.files);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-10 bg-[#111827] hover:bg-slate-900/90 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl cursor-pointer transition-colors text-center"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".png,.jpg,.jpeg,.webp,.bmp,.zip,image/png,image/jpeg,image/webp,image/bmp,application/zip"
                  onChange={(e) => {
                    if (e.target.files) {
                      handleFilesSelected(e.target.files);
                    }
                  }}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-xl bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center text-indigo-400 mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-100">
                  আইকন, আইকন শিট অথবা ZIP ফাইল এখানে ড্র্যাগ করুন বা ক্লিক করে নির্বাচন করুন
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  সমর্থিত ফরম্যাট: PNG, JPG, JPEG, WEBP, BMP এবং ZIP (প্রতি ব্যাচে ৫০০+ আইকন সমর্থিত)
                </p>
                {isUploading && (
                  <div className="mt-4 px-4 py-2 bg-indigo-950/90 border border-indigo-700 rounded-lg text-xs text-indigo-200 font-mono">
                    {uploadProgressText}
                  </div>
                )}
              </div>

              {/* Built-in Test Suite Bar (Instant Verification of Tests 1–10) */}
              <div className="p-4 bg-[#111827] border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>তাৎক্ষণিক ভেরিফিকেশন টেস্ট স্যাম্পল (One-Click Verification Samples)</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    খাঁটি র‍্যাস্টার PNG তৈরি করে সেপারেশন ও VTracer ভেক্টরাইজেশন পরীক্ষা করুন
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <button
                    onClick={() => runSampleTest('house')}
                    disabled={isUploading}
                    className="px-3.5 py-2.5 text-xs font-medium text-left bg-[#0B0F17] hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/60 rounded-lg transition-colors"
                  >
                    <div className="font-semibold text-slate-100">টেস্ট ১: হাউস আইকন (PNG)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      ছাদ, সোজা দেয়াল, দরজা ও জানালার নেগেটিভ স্পেস
                    </div>
                  </button>
                  <button
                    onClick={() => runSampleTest('camera')}
                    disabled={isUploading}
                    className="px-3.5 py-2.5 text-xs font-medium text-left bg-[#0B0F17] hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/60 rounded-lg transition-colors"
                  >
                    <div className="font-semibold text-slate-100">টেস্ট ২: ক্যামেরা আইকন (PNG)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      বৃত্তাকার লেন্স ও মসৃণ রাউন্ডেড কর্নার
                    </div>
                  </button>
                  <button
                    onClick={() => runSampleTest('sheet18')}
                    disabled={isUploading}
                    className="px-3.5 py-2.5 text-xs font-medium text-left bg-[#0B0F17] hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/60 rounded-lg transition-colors"
                  >
                    <div className="font-semibold text-indigo-300">টেস্ট ৩: ১৮-আইকন শিট (৩×৬ গ্রিড)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      ৩ সারি × ৬ কলাম = ১৮টি আলাদা মাল্টি-পার্ট আইকন
                    </div>
                  </button>
                  <button
                    onClick={() => runSampleTest('batch100')}
                    disabled={isUploading}
                    className="px-3.5 py-2.5 text-xs font-medium text-left bg-[#0B0F17] hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/60 rounded-lg transition-colors"
                  >
                    <div className="font-semibold text-emerald-300">টেস্ট ৪: ১০০টি একক আইকন ব্যাচ</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      ১০০টি আলাদা আইকন ও সেট ম্যানেজমেন্ট পরীক্ষা
                    </div>
                  </button>
                </div>
              </div>

              {/* Uploaded Source Files & Sheet Segmentation Controls */}
              {sourceFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-200">
                      আপলোডকৃত সোর্স ফাইল ও সেপারেশন প্রিভিউ ({sourceFiles.length} ফাইল → {totalSeparatedIcons}টি আইকন)
                    </h2>
                    <button
                      onClick={() => setActiveSection('separated')}
                      className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                    >
                      সেপারেটেড গ্যালারিতে যান →
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {sourceFiles.slice(0, 24).map((src) => {
                      const enabledCells = src.segmentation.cells.filter((c) => c.enabled).length;
                      return (
                        <div
                          key={src.id}
                          className="flex items-center justify-between gap-3 p-3.5 bg-[#111827] border border-slate-800 rounded-xl"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={src.dataUrl}
                              alt={src.fileName}
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 rounded-lg object-contain preview-checkerboard-light border border-slate-700 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-100 truncate">
                                {src.fileName}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                                {src.width}×{src.height}px · {src.segmentation.rows}×{src.segmentation.cols} গ্রিড · {enabledCells}টি আইকন
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => setInspectingSourceId(src.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-800/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            <Scissors className="w-3.5 h-3.5" />
                            <span>গ্রিড প্রিভিউ</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: SEPARATED ICONS GALLERY */}
          {(activeSection === 'separated' || (activeSection === 'upload' && icons.length > 0)) && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800/80">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    ২. সেপারেটেড আইকন গ্যালারি (Separated Icons Gallery — {icons.length}টি আইকন)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    প্রতিটি আলাদা আইকন নিচে প্রদর্শিত হচ্ছে। যেকোনো আইকনে ক্লিক করে ১০০%–৪০০% জুমে অরিজিনাল বনাম ভেক্টর প্রিভিউ দেখুন।
                  </p>
                </div>

                {/* Search & Status Filters */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="আইকনের নাম খুঁজুন..."
                      className="pl-8 pr-3 py-1.5 text-xs bg-[#111827] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-lg">
                    {(
                      [
                        { id: 'all', label: `সব (${icons.length})` },
                        { id: 'completed', label: `SVG প্রস্তুত (${completedIcons.length})` },
                        {
                          id: 'pending',
                          label: `অপেক্ষমাণ (${icons.filter((i) => i.status === 'pending').length})`,
                        },
                        { id: 'failed', label: `ব্যর্থ (${failedIcons.length})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setStatusFilter(tab.id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                          statusFilter === tab.id
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Gallery Grid */}
              {filteredIcons.length === 0 ? (
                <div className="p-12 bg-[#111827] border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                  কোনো আইকন পাওয়া যায়নি।
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
                  {filteredIcons.map((icon, idx) => {
                    const isReady = icon.status === 'completed' && icon.svgContent;
                    return (
                      <div
                        key={icon.id}
                        className={`flex flex-col bg-[#111827] border rounded-xl overflow-hidden transition-colors ${
                          activePreviewIconId === icon.id
                            ? 'border-indigo-500'
                            : 'border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {/* Card Top Header */}
                        <div className="flex items-center justify-between px-3 py-2 bg-[#0B0F17] border-b border-slate-800/80 text-[11px]">
                          <label className="flex items-center gap-1.5 cursor-pointer truncate">
                            <input
                              type="checkbox"
                              checked={icon.selected}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setIcons((prev) =>
                                  prev.map((it) =>
                                    it.id === icon.id ? { ...it, selected: checked } : it
                                  )
                                );
                              }}
                              className="rounded accent-indigo-500"
                            />
                            <span className="font-mono tabular-nums text-slate-300 truncate">
                              #{String(idx + 1).padStart(3, '0')}
                            </span>
                          </label>
                          <span className="font-mono tabular-nums text-slate-500">
                            {icon.width}×{icon.height}
                          </span>
                        </div>

                        {/* Preview Thumbnail (Shows genuine SVG if vectorized, otherwise original separated raster) */}
                        <div
                          onClick={() => {
                            setActivePreviewIconId(icon.id);
                            setActiveSection('preview');
                          }}
                          className="h-32 p-4 flex items-center justify-center preview-checkerboard-light cursor-pointer relative group"
                        >
                          {isReady ? (
                            <div
                              className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto"
                              dangerouslySetInnerHTML={{ __html: icon.svgContent! }}
                            />
                          ) : (
                            <img
                              src={icon.originalDataUrl}
                              alt={icon.name}
                              referrerPolicy="no-referrer"
                              className="max-w-full max-h-full object-contain"
                            />
                          )}
                        </div>

                        {/* Card Footer with Filename, Status & Actions */}
                        <div className="p-2.5 space-y-2 bg-[#111827] border-t border-slate-800/80">
                          <div className="truncate text-xs font-medium text-slate-200" title={icon.name}>
                            {icon.name}.svg
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            {isReady ? (
                              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{icon.validation?.pathCount} পাথ</span>
                              </span>
                            ) : icon.status === 'processing' ? (
                              <span className="flex items-center gap-1 text-indigo-400">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>ট্রেস হচ্ছে...</span>
                              </span>
                            ) : icon.status === 'failed' ? (
                              <span
                                className="flex items-center gap-1 text-rose-400 truncate"
                                title={icon.errorMessage}
                              >
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">ব্যর্থ</span>
                              </span>
                            ) : (
                              <span className="text-slate-400">র‍্যাস্টার (Pending)</span>
                            )}

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setActivePreviewIconId(icon.id);
                                  setActiveSection('preview');
                                }}
                                className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
                                title="ভেক্টর প্রিভিউ ও তুলনা"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {isReady ? (
                                <button
                                  onClick={() => downloadIndividualSvg(icon)}
                                  className="p-1 text-indigo-400 hover:text-indigo-200 hover:bg-indigo-950 rounded"
                                  title="SVG ডাউনলোড করুন"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => vectorizeSingleIcon(icon)}
                                  disabled={isVectorizing}
                                  className="p-1 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded"
                                  title="এই আইকনটি ভেক্টরাইজ করুন"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: ORIGINAL VS VECTOR PREVIEW */}
          {activeSection === 'preview' && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-white">
                  ৩. অরিজিনাল বনাম ভেক্টর প্রিভিউ ও ভ্যালিডেশন (Original vs Vector SVG Preview)
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  ১০০%, ২০০% ও ৪০০% জুমে মূল র‍্যাস্টার ইমেজ এবং VTracer দ্বারা তৈরি খাঁটি ভেক্টর পাথের তুলনা ও XML ভ্যালিডেশন পরীক্ষা করুন।
                </p>
              </div>

              <VectorPreviewPanel
                icons={icons}
                activeIconId={activePreviewIconId}
                onSelectIcon={(id) => setActivePreviewIconId(id)}
                onRetraceSingleIcon={(ic) => vectorizeSingleIcon(ic)}
                isVectorizing={isVectorizing}
              />
            </div>
          )}

          {/* SECTION 4: SET MANAGEMENT SYSTEM */}
          {activeSection === 'sets' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-bold text-white">
                  ৪. সেট ম্যানেজমেন্ট সিস্টেম (Set Management System)
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  পুনরায় ভেক্টরাইজ না করেই প্রতি সেটে কতটি আইকন থাকবে তা নির্ধারণ করুন। স্বয়ংক্রিয়ভাবে সব সেট তৈরি হবে।
                </p>
              </div>

              {/* Primary Setting Card: HOW MANY ICONS PER SET? */}
              <div className="p-6 bg-[#111827] border border-slate-800 rounded-xl space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <label className="block text-sm font-bold text-white">
                      প্রতি সেটে কয়টি আইকন থাকবে? (HOW MANY ICONS PER SET?)
                    </label>
                    <p className="text-xs text-slate-400 mt-0.5">
                      সেটের আকার পরিবর্তন করলে তাৎক্ষণিকভাবে সেট পুনর্গঠিত হবে, পুনরায় ভেক্টরাইজ করার প্রয়োজন নেই।
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={iconsPerSet}
                      onChange={(e) =>
                        setIconsPerSet(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="w-28 px-3.5 py-2 text-sm font-mono tabular-nums font-semibold bg-[#0B0F17] border border-indigo-500 rounded-lg text-white focus:outline-none"
                    />
                    <div className="flex items-center gap-1.5">
                      {[10, 18, 20, 25, 50].map((preset) => (
                        <button
                          key={preset}
                          onClick={() => setIconsPerSet(preset)}
                          className={`px-3 py-2 text-xs font-mono tabular-nums rounded-lg border transition-colors ${
                            iconsPerSet === preset
                              ? 'bg-indigo-600 border-indigo-500 text-white font-semibold'
                              : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          {preset} / সেট
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Live Set Distribution Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4 border-t border-slate-800">
                  <div className="p-3 bg-[#0B0F17] border border-slate-800/80 rounded-lg">
                    <div className="text-[11px] text-slate-400">মোট আপলোডেড ফাইল</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-white mt-0.5">
                      {totalUploadedFiles}
                    </div>
                  </div>
                  <div className="p-3 bg-[#0B0F17] border border-slate-800/80 rounded-lg">
                    <div className="text-[11px] text-slate-400">মোট সেপারেটেড আইকন</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-white mt-0.5">
                      {totalSeparatedIcons}
                    </div>
                  </div>
                  <div className="p-3 bg-[#0B0F17] border border-slate-800/80 rounded-lg">
                    <div className="text-[11px] text-slate-400">সফল ভেক্টরাইজড (SVG)</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-emerald-400 mt-0.5">
                      {completedIcons.length}
                    </div>
                  </div>
                  <div className="p-3 bg-[#0B0F17] border border-slate-800/80 rounded-lg">
                    <div className="text-[11px] text-slate-400">ব্যর্থ আইকন (Failed)</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-rose-400 mt-0.5">
                      {failedIcons.length}
                    </div>
                  </div>
                  <div className="p-3 bg-[#0B0F17] border border-slate-800/80 rounded-lg">
                    <div className="text-[11px] text-slate-400">প্রতি সেটে আইকন</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-indigo-400 mt-0.5">
                      {iconsPerSet}
                    </div>
                  </div>
                  <div className="p-3 bg-[#0B0F17] border border-slate-800/80 rounded-lg">
                    <div className="text-[11px] text-slate-400">মোট তৈরি সেট (Total Sets)</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-indigo-400 mt-0.5">
                      {iconSets.length}
                    </div>
                  </div>
                </div>
              </div>

              {/* Generated Sets Breakdown List */}
              {iconSets.length === 0 ? (
                <div className="p-12 bg-[#111827] border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                  সেট তৈরি করার জন্য প্রথমে আইকন আপলোড করুন।
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {iconSets.map((setGroup) => {
                    const readyInSet = setGroup.icons.filter(
                      (i) => i.status === 'completed' && i.svgContent
                    ).length;
                    return (
                      <div
                        key={setGroup.folderName}
                        className="flex flex-col justify-between p-5 bg-[#111827] border border-slate-800 rounded-xl space-y-4"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                          <div>
                            <div className="text-sm font-bold text-white flex items-center gap-2">
                              <Layers className="w-4 h-4 text-indigo-400" />
                              <span>
                                {setGroup.setName} = {setGroup.icons.length} icons
                              </span>
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                              ফোল্ডার: {setGroup.folderName}/ · ভেক্টর প্রস্তুত: {readyInSet}/{setGroup.icons.length}
                            </div>
                          </div>

                          <button
                            onClick={() => downloadSingleSetAsZip(setGroup, exportNamingMode)}
                            disabled={readyInSet === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>ZIP ডাউনলোড</span>
                          </button>
                        </div>

                        {/* Mini thumbnail preview of up to 8 icons in this set */}
                        <div className="grid grid-cols-6 gap-1.5">
                          {setGroup.icons.slice(0, 12).map((ic) => (
                            <div
                              key={ic.id}
                              onClick={() => {
                                setActivePreviewIconId(ic.id);
                                setActiveSection('preview');
                              }}
                              className="h-11 p-1.5 rounded preview-checkerboard-light flex items-center justify-center cursor-pointer border border-slate-700/60"
                              title={ic.name}
                            >
                              {ic.status === 'completed' && ic.svgContent ? (
                                <div
                                  className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto"
                                  dangerouslySetInnerHTML={{ __html: ic.svgContent }}
                                />
                              ) : (
                                <img
                                  src={ic.originalDataUrl}
                                  alt={ic.name}
                                  referrerPolicy="no-referrer"
                                  className="max-w-full max-h-full object-contain opacity-70"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SECTION 5: DOWNLOAD CENTER */}
          {activeSection === 'download' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-white">
                    ৫. ডাউনলোড সেন্টার (SVG & Complete ZIP Set Export Center)
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    একক SVG ফাইল, নির্দিষ্ট কোনো সেট (ZIP), অথবা সব সেট একসাথে Adobe Illustrator-উপযোগী ভেক্টর ফরম্যাটে ডাউনলোড করুন।
                  </p>
                </div>

                {/* File Naming Mode in ZIP */}
                <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-lg">
                  <button
                    onClick={() => setExportNamingMode('original')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      exportNamingMode === 'original'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    মূল নাম বজায় রাখুন (house_icon.svg)
                  </button>
                  <button
                    onClick={() => setExportNamingMode('sequential')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      exportNamingMode === 'sequential'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ক্রমিক নাম (icon_001.svg)
                  </button>
                </div>
              </div>

              {/* Primary Export Cards: C. Download All Sets & Selected Icons */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* C. Download All Sets in One Master ZIP */}
                <div className="p-6 bg-[#111827] border border-slate-800 rounded-xl flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="text-base font-bold text-white flex items-center gap-2">
                      <FileArchive className="w-5 h-5 text-indigo-400" />
                      <span>C. সব সেট একসাথে ডাউনলোড করুন (Download All Sets as ZIP)</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      মোট {iconSets.length}টি সেট ফোল্ডারে ({completedIcons.length}টি ভ্যালিডেটেড SVG ফাইল) একক ZIP আর্কাইভে এক্সপোর্ট হবে।
                    </p>
                    <pre className="p-3 text-[11px] font-mono text-slate-300 bg-[#0B0F17] border border-slate-800 rounded-lg">
{`ICON_VECTOR_MASTER_EXPORT/
${iconSets
  .slice(0, 3)
  .map(
    (s) =>
      `  ${s.folderName}/\n    icon_001.svg ... (${s.icons.length}টি আইকন)`
  )
  .join('\n')}${iconSets.length > 3 ? `\n  ... (${iconSets.length}টি সেট)` : ''}`}
                    </pre>
                  </div>

                  <button
                    onClick={async () => {
                      setIsExportingZip(true);
                      try {
                        await downloadAllSetsAsZip(iconSets, exportNamingMode);
                      } finally {
                        setIsExportingZip(false);
                      }
                    }}
                    disabled={completedIcons.length === 0 || isExportingZip}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {isExportingZip
                        ? 'ZIP আর্কাইভ তৈরি হচ্ছে...'
                        : `সব সেট ডাউনলোড করুন — ICON_VECTOR_MASTER_EXPORT.zip (${completedIcons.length} SVG)`}
                    </span>
                  </button>
                </div>

                {/* Download Selected Icons Only */}
                <div className="p-6 bg-[#111827] border border-slate-800 rounded-xl flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="text-base font-bold text-white flex items-center gap-2">
                      <CheckSquare className="w-5 h-5 text-emerald-400" />
                      <span>নির্বাচিত আইকন এক্সপোর্ট করুন (Export Selected Icons)</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      গ্যালারি থেকে আপনার নির্বাচিত {selectedIcons.filter((i) => i.status === 'completed').length}টি ভেক্টরাইজড আইকন আলাদা ZIP আর্কাইভ হিসেবে ডাউনলোড করুন।
                    </p>
                    <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-400">মোট নির্বাচিত আইকন:</span>
                        <span className="font-mono tabular-nums text-slate-200">{selectedIcons.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">ভেক্টর SVG প্রস্তুত:</span>
                        <span className="font-mono tabular-nums text-emerald-400">
                          {selectedIcons.filter((i) => i.status === 'completed').length}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => downloadSelectedIconsAsZip(icons, exportNamingMode)}
                    disabled={selectedIcons.filter((i) => i.status === 'completed').length === 0}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      নির্বাচিত আইকন ডাউনলোড (ZIP — {selectedIcons.filter((i) => i.status === 'completed').length} SVG)
                    </span>
                  </button>
                </div>
              </div>

              {/* B. Download Individual Complete Sets */}
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-slate-200">
                  B. আলাদা সেট ডাউনলোড করুন (Download Individual Sets as ZIP)
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {iconSets.map((setGroup) => {
                    const readyCount = setGroup.icons.filter(
                      (i) => i.status === 'completed' && i.svgContent
                    ).length;
                    return (
                      <div
                        key={setGroup.folderName}
                        className="p-4 bg-[#111827] border border-slate-800 rounded-xl flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs font-bold text-white">
                            {setGroup.folderName}.zip
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                            {readyCount} / {setGroup.icons.length} SVG প্রস্তুত
                          </div>
                        </div>
                        <button
                          onClick={() => downloadSingleSetAsZip(setGroup, exportNamingMode)}
                          disabled={readyCount === 0}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg transition-colors"
                        >
                          ডাউনলোড
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* A. Download Individual SVG Files Table */}
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-slate-200">
                  A. একক SVG ফাইল ডাউনলোড করুন (Download Individual SVG Files)
                </h2>
                <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
                  <div className="max-h-96 overflow-y-auto divide-y divide-slate-800">
                    {icons.map((ic, idx) => {
                      const ready = ic.status === 'completed' && ic.svgContent;
                      return (
                        <div
                          key={ic.id}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-900/60 text-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono tabular-nums text-slate-500 w-8">
                              #{String(idx + 1).padStart(3, '0')}
                            </span>
                            <span className="font-medium text-slate-200 truncate">
                              {ic.name}.svg
                            </span>
                            <span className="font-mono tabular-nums text-slate-400 text-[11px]">
                              ({ic.width}×{ic.height}px)
                            </span>
                            {ready && ic.validation && (
                              <span className="font-mono tabular-nums text-emerald-400 text-[11px]">
                                · {ic.validation.pathCount} paths · viewBox {ic.validation.viewBox}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => {
                                setActivePreviewIconId(ic.id);
                                setActiveSection('preview');
                              }}
                              className="px-2.5 py-1 text-xs text-slate-300 bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 rounded-md"
                            >
                              প্রিভিউ
                            </button>
                            <button
                              onClick={() => downloadIndividualSvg(ic)}
                              disabled={!ready}
                              className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-md"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>.SVG</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Interactive Segmentation Preview & Manual Grid Fallback Modal */}
      {inspectingSource && (
        <SegmentationModal
          sourceFile={inspectingSource}
          onClose={() => setInspectingSourceId(null)}
          onApplySegmentation={handleApplySegmentationUpdate}
        />
      )}
    </div>
  );
}
