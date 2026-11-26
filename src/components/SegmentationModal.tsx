import React, { useState } from 'react';
import {
  Check,
  Grid,
  RefreshCw,
  Sliders,
  X,
  CheckSquare,
  Square,
  AlertTriangle,
} from 'lucide-react';
import {
  CropCellBox,
  SheetSegmentationResult,
  UploadedSourceFile,
} from '../types/icon';
import {
  autoSegmentIconSheet,
  loadImageElement,
  manualGridSegmentIconSheet,
} from '../utils/iconSeparator';

interface SegmentationModalProps {
  sourceFile: UploadedSourceFile;
  onClose: () => void;
  onApplySegmentation: (
    sourceId: string,
    newSegmentation: SheetSegmentationResult,
    treatAsSheet: boolean
  ) => void;
}

export const SegmentationModal: React.FC<SegmentationModalProps> = ({
  sourceFile,
  onClose,
  onApplySegmentation,
}) => {
  const [segmentation, setSegmentation] = useState<SheetSegmentationResult>(
    sourceFile.segmentation
  );
  const [rows, setRows] = useState<number>(sourceFile.segmentation.rows);
  const [cols, setCols] = useState<number>(sourceFile.segmentation.cols);
  const [padding, setPadding] = useState<number>(sourceFile.segmentation.padding ?? 8);
  const [inset, setInset] = useState<number>(sourceFile.manualInset ?? 0);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(
    sourceFile.segmentation.cells[0]?.id || null
  );
  const [isRecalculating, setIsRecalculating] = useState(false);

  const selectedCell = segmentation.cells.find((c) => c.id === selectedCellId) || null;
  const enabledCount = segmentation.cells.filter((c) => c.enabled).length;

  const extractImageData = async () => {
    const img = await loadImageElement(sourceFile.dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = sourceFile.width;
    canvas.height = sourceFile.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, sourceFile.width, sourceFile.height);
  };

  const handleAutoDetect = async () => {
    setIsRecalculating(true);
    try {
      const imgData = await extractImageData();
      const autoRes = autoSegmentIconSheet(
        imgData.data,
        sourceFile.width,
        sourceFile.height,
        padding,
        false
      );
      setSegmentation(autoRes);
      setRows(autoRes.rows);
      setCols(autoRes.cols);
      setSelectedCellId(autoRes.cells[0]?.id || null);
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleManualGridApply = async (
    targetRows: number,
    targetCols: number,
    targetPadding: number,
    targetInset: number
  ) => {
    setIsRecalculating(true);
    try {
      const imgData = await extractImageData();
      const manualRes = manualGridSegmentIconSheet(
        imgData.data,
        sourceFile.width,
        sourceFile.height,
        targetRows,
        targetCols,
        targetPadding,
        targetInset
      );
      setSegmentation(manualRes);
      setSelectedCellId(manualRes.cells[0]?.id || null);
    } finally {
      setIsRecalculating(false);
    }
  };

  const toggleCellEnabled = (cellId: string) => {
    setSegmentation((prev) => ({
      ...prev,
      cells: prev.cells.map((c) =>
        c.id === cellId ? { ...c, enabled: !c.enabled } : c
      ),
    }));
  };

  const toggleAllCells = (enable: boolean) => {
    setSegmentation((prev) => ({
      ...prev,
      cells: prev.cells.map((c) => ({ ...c, enabled: enable })),
    }));
  };

  const updateSelectedCellBound = (
    field: 'x' | 'y' | 'width' | 'height',
    value: number
  ) => {
    if (!selectedCellId) return;
    setSegmentation((prev) => ({
      ...prev,
      cells: prev.cells.map((c) => {
        if (c.id !== selectedCellId) return c;
        const updated: CropCellBox = { ...c, [field]: Math.max(0, Math.round(value)) };
        updated.x = Math.min(sourceFile.width - 4, updated.x);
        updated.y = Math.min(sourceFile.height - 4, updated.y);
        updated.width = Math.max(4, Math.min(sourceFile.width - updated.x, updated.width));
        updated.height = Math.max(4, Math.min(sourceFile.height - updated.y, updated.height));
        return updated;
      }),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex flex-col w-full max-w-6xl max-h-[92vh] bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0B0F17]">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              আইকন শিট সেপারেশন প্রিভিউ ও গ্রিড কন্ট্রোল (Segmentation Preview & Manual Fallback)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
              ফাইল: {sourceFile.fileName} · {sourceFile.width}×{sourceFile.height}px · শনাক্তকৃত গ্রিড: {segmentation.rows} সারি × {segmentation.cols} কলাম ({enabledCount}টি আইকন নির্বাচিত)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="বন্ধ করুন"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Body: Left Visual Sheet Canvas + Right Manual Controls */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Visual Segmentation Preview Canvas */}
          <div className="lg:col-span-8 flex flex-col bg-[#0B0F17] p-6 overflow-auto border-b lg:border-b-0 lg:border-r border-slate-800">
            <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
              <div className="flex items-center gap-3">
                <span>ব্যাকগ্রাউন্ড: <strong className="text-slate-200 font-mono">{segmentation.backgroundColorHex}</strong></span>
                <span>·</span>
                <span>
                  কনফিডেন্স:{' '}
                  <strong
                    className={
                      segmentation.confidence === 'high'
                        ? 'text-emerald-400'
                        : segmentation.confidence === 'medium'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }
                  >
                    {segmentation.confidence === 'high'
                      ? 'উচ্চ (High)'
                      : segmentation.confidence === 'medium'
                      ? 'মাঝারি (Medium)'
                      : 'কম (Low - ম্যানুয়াল গ্রিড যাচাই করুন)'}
                  </strong>
                </span>
              </div>
              <span>যেকোনো বক্সে ক্লিক করে নির্বাচন বা সীমানা পরিবর্তন করুন</span>
            </div>

            {segmentation.confidence === 'low' && (
              <div className="flex items-center gap-2 p-3 mb-3 text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-lg">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  স্বয়ংক্রিয় সেপারেশন কনফিডেন্স কম। ডানদিকের সারি (Rows) এবং কলাম (Columns) নিয়ন্ত্রণ ব্যবহার করে গ্রিড সামঞ্জস্য করুন।
                </span>
              </div>
            )}

            <div className="flex-1 flex items-center justify-center preview-checkerboard rounded-lg border border-slate-800 p-4 overflow-auto min-h-[360px]">
              <div
                className="relative inline-block select-none shadow-lg"
                style={{
                  maxWidth: '100%',
                }}
              >
                <img
                  src={sourceFile.dataUrl}
                  alt={sourceFile.fileName}
                  referrerPolicy="no-referrer"
                  className="block max-h-[56vh] w-auto object-contain"
                />

                {/* SVG Overlay rendering detected cell corridors and tight content crop boxes */}
                <svg
                  viewBox={`0 0 ${sourceFile.width} ${sourceFile.height}`}
                  className="absolute inset-0 w-full h-full"
                >
                  {segmentation.cells.map((cell) => {
                    const isSelected = cell.id === selectedCellId;
                    return (
                      <g
                        key={cell.id}
                        onClick={() => setSelectedCellId(cell.id)}
                        className="cursor-pointer"
                      >
                        {/* Outer cell corridor boundary (dashed faint line) */}
                        <rect
                          x={cell.cellX}
                          y={cell.cellY}
                          width={cell.cellW}
                          height={cell.cellH}
                          fill="none"
                          stroke="rgba(148, 163, 184, 0.25)"
                          strokeWidth={Math.max(1, sourceFile.width * 0.0012)}
                          strokeDasharray="4 4"
                        />

                        {/* Tight Content Bounding Box with Safe Padding */}
                        <rect
                          x={cell.x}
                          y={cell.y}
                          width={cell.width}
                          height={cell.height}
                          fill={
                            !cell.enabled
                              ? 'rgba(239, 68, 68, 0.18)'
                              : isSelected
                              ? 'rgba(99, 102, 241, 0.22)'
                              : 'rgba(16, 185, 129, 0.10)'
                          }
                          stroke={
                            !cell.enabled
                              ? '#EF4444'
                              : isSelected
                              ? '#6366F1'
                              : '#10B981'
                          }
                          strokeWidth={Math.max(
                            1.5,
                            sourceFile.width * (isSelected ? 0.003 : 0.002)
                          )}
                        />

                        {/* Label tag in top-left of crop box */}
                        <rect
                          x={cell.x}
                          y={cell.y}
                          width={Math.max(26, sourceFile.width * 0.035)}
                          height={Math.max(16, sourceFile.height * 0.032)}
                          fill={
                            !cell.enabled
                              ? '#EF4444'
                              : isSelected
                              ? '#4F46E5'
                              : '#059669'
                          }
                        />
                        <text
                          x={cell.x + Math.max(4, sourceFile.width * 0.005)}
                          y={cell.y + Math.max(12, sourceFile.height * 0.023)}
                          fill="#FFFFFF"
                          fontSize={Math.max(10, sourceFile.width * 0.013)}
                          fontFamily="JetBrains Mono, monospace"
                          fontWeight="600"
                        >
                          {cell.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>

          {/* Right Panel: Manual Grid Fallback & Individual Crop Bounds */}
          <div className="lg:col-span-4 flex flex-col bg-[#111827] p-5 overflow-y-auto space-y-5">
            {/* 1. Automatic vs Manual Grid Fallback */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Grid className="w-4 h-4 text-indigo-400" />
                  <span>গ্রিড ও সারি/কলাম নিয়ন্ত্রণ</span>
                </h3>
                <button
                  onClick={handleAutoDetect}
                  disabled={isRecalculating}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/70 border border-indigo-800/60 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
                  <span>অটো ডিটেক্ট (Auto)</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    সারি সংখ্যা (Rows)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={rows}
                    onChange={(e) => {
                      const val = Math.max(1, Number(e.target.value) || 1);
                      setRows(val);
                    }}
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    কলাম সংখ্যা (Columns)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={cols}
                    onChange={(e) => {
                      const val = Math.max(1, Number(e.target.value) || 1);
                      setCols(val);
                    }}
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    নিরাপদ প্যাডিং (Padding px)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={40}
                    value={padding}
                    onChange={(e) => setPadding(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    শিট মার্জিন (Outer Inset px)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={inset}
                    onChange={(e) => setInset(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                onClick={() => handleManualGridApply(rows, cols, padding, inset)}
                disabled={isRecalculating}
                className="w-full mt-3 px-4 py-2 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
              >
                ম্যানুয়াল গ্রিড প্রয়োগ করুন ({rows} × {cols} = {rows * cols} সেল)
              </button>
            </div>

            {/* 2. Selected Individual Crop Box Fine-Tuning */}
            {selectedCell && (
              <div className="pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    <span>নির্বাচিত আইকন সীমানা ({selectedCell.label} · সারি {selectedCell.row + 1}, কলাম {selectedCell.col + 1})</span>
                  </h4>
                  <button
                    onClick={() => toggleCellEnabled(selectedCell.id)}
                    className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                      selectedCell.enabled
                        ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/60'
                        : 'bg-rose-950/70 text-rose-300 border border-rose-800/60'
                    }`}
                  >
                    {selectedCell.enabled ? 'সক্রিয় (Included)' : 'বাদ দেওয়া (Excluded)'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-400">বাম X (px)</label>
                    <input
                      type="number"
                      value={selectedCell.x}
                      onChange={(e) => updateSelectedCellBound('x', Number(e.target.value))}
                      className="w-full px-2.5 py-1 text-xs font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400">উপর Y (px)</label>
                    <input
                      type="number"
                      value={selectedCell.y}
                      onChange={(e) => updateSelectedCellBound('y', Number(e.target.value))}
                      className="w-full px-2.5 py-1 text-xs font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400">প্রস্থ Width (px)</label>
                    <input
                      type="number"
                      value={selectedCell.width}
                      onChange={(e) => updateSelectedCellBound('width', Number(e.target.value))}
                      className="w-full px-2.5 py-1 text-xs font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400">উচ্চতা Height (px)</label>
                    <input
                      type="number"
                      value={selectedCell.height}
                      onChange={(e) => updateSelectedCellBound('height', Number(e.target.value))}
                      className="w-full px-2.5 py-1 text-xs font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded text-slate-200"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. Individual Crop Selection List */}
            <div className="pt-4 border-t border-slate-800 flex-1 flex flex-col min-h-[140px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300">
                  সব আইকন সেল ({enabledCount}/{segmentation.cells.length})
                </span>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => toggleAllCells(true)}
                    className="text-indigo-400 hover:text-indigo-300"
                  >
                    সব নির্বাচন
                  </button>
                  <span className="text-slate-600">·</span>
                  <button
                    onClick={() => toggleAllCells(false)}
                    className="text-slate-400 hover:text-slate-300"
                  >
                    সব বাতিল
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 overflow-y-auto max-h-44 pr-1">
                {segmentation.cells.map((cell) => (
                  <button
                    key={cell.id}
                    onClick={() => {
                      setSelectedCellId(cell.id);
                      toggleCellEnabled(cell.id);
                    }}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-mono tabular-nums border transition-colors ${
                      cell.id === selectedCellId
                        ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200'
                        : cell.enabled
                        ? 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700'
                        : 'bg-[#0B0F17]/40 border-slate-900 text-slate-600'
                    }`}
                  >
                    <span>{cell.label}</span>
                    {cell.enabled ? (
                      <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-[#0B0F17]">
          <div className="text-xs text-slate-400">
            নিশ্চিত করলে এই শিট থেকে <strong className="text-slate-100 font-mono tabular-nums">{enabledCount}</strong>টি সম্পূর্ণ আলাদা আইকন তৈরি হবে।
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              বাতিল (Cancel)
            </button>
            <button
              onClick={() =>
                onApplySegmentation(sourceFile.id, segmentation, segmentation.cells.length > 1)
              }
              disabled={enabledCount === 0}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>নিশ্চিত করুন ও {enabledCount}টি আইকন আলাদা করুন</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
