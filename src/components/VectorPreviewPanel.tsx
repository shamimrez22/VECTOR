import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  Columns,
  Download,
  RefreshCw,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  XCircle,
  Sun,
  Moon,
} from 'lucide-react';
import { SeparatedIconItem } from '../types/icon';
import { downloadIndividualSvg } from '../utils/exportUtils';

interface VectorPreviewPanelProps {
  icons: SeparatedIconItem[];
  activeIconId: string | null;
  onSelectIcon: (id: string) => void;
  onRetraceSingleIcon: (icon: SeparatedIconItem) => void;
  isVectorizing: boolean;
}

export const VectorPreviewPanel: React.FC<VectorPreviewPanelProps> = ({
  icons,
  activeIconId,
  onSelectIcon,
  onRetraceSingleIcon,
  isVectorizing,
}) => {
  const [zoom, setZoom] = useState<number>(200);
  const [compareMode, setCompareMode] = useState<'side-by-side' | 'slider' | 'code'>('side-by-side');
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [lightCheckerboard, setLightCheckerboard] = useState<boolean>(true);

  if (icons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 bg-[#111827] border border-slate-800 rounded-xl text-center">
        <Columns className="w-10 h-10 text-slate-600 mb-3" />
        <h3 className="text-base font-semibold text-slate-200">
          প্রিভিউ করার জন্য কোনো আইকন নেই
        </h3>
        <p className="text-xs text-slate-400 mt-1 max-w-md">
          প্রথমে আইকন বা আইকন শিট আপলোড করুন এবং ভেক্টরাইজ করুন। এরপর এখানে ১০০%, ২০০% এবং ৪০০% জুমে অরিজিনাল বনাম ভেক্টর (SVG) তুলনা দেখতে পাবেন।
        </p>
      </div>
    );
  }

  const currentIndex = Math.max(
    0,
    icons.findIndex((i) => i.id === activeIconId)
  );
  const activeIcon = icons[currentIndex] || icons[0];

  const handlePrev = () => {
    const prevIdx = (currentIndex - 1 + icons.length) % icons.length;
    onSelectIcon(icons[prevIdx].id);
  };

  const handleNext = () => {
    const nextIdx = (currentIndex + 1) % icons.length;
    onSelectIcon(icons[nextIdx].id);
  };

  const zoomLevels = [100, 200, 400];
  const displayWidth = Math.round((activeIcon.width * zoom) / 100);
  const displayHeight = Math.round((activeIcon.height * zoom) / 100);
  const checkerClass = lightCheckerboard
    ? 'preview-checkerboard-light'
    : 'preview-checkerboard';

  const val = activeIcon.validation;
  const isLowRes = activeIcon.width < 48 || activeIcon.height < 48;

  return (
    <div className="space-y-5">
      {/* Top Inspector Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[#111827] border border-slate-800 rounded-xl">
        {/* Icon Selector & Prev/Next */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handlePrev}
            className="p-2 text-slate-300 bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
            title="পূর্ববর্তী আইকন"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <select
            value={activeIcon.id}
            onChange={(e) => onSelectIcon(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 min-w-[210px]"
          >
            {icons.map((ic, idx) => (
              <option key={ic.id} value={ic.id}>
                #{String(idx + 1).padStart(3, '0')} — {ic.name} ({ic.width}×{ic.height}px) [{ic.status === 'completed' ? 'SVG প্রস্তুত' : ic.status}]
              </option>
            ))}
          </select>

          <button
            onClick={handleNext}
            className="p-2 text-slate-300 bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
            title="পরবর্তী আইকন"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <span className="text-xs text-slate-400 font-mono tabular-nums ml-1">
            {currentIndex + 1} / {icons.length}
          </span>
        </div>

        {/* Comparison Mode Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
          <button
            onClick={() => setCompareMode('side-by-side')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              compareMode === 'side-by-side'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            <span>পাশাপাশি তুলনা (Side-by-Side)</span>
          </button>
          <button
            onClick={() => setCompareMode('slider')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              compareMode === 'slider'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>বিফোর/আফটার স্লাইডার</span>
          </button>
          <button
            onClick={() => setCompareMode('code')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              compareMode === 'code'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>SVG XML কোড ও ভ্যালিডেশন</span>
          </button>
        </div>

        {/* Zoom Controls & Checkerboard Contrast Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
            <button
              onClick={() => setZoom((z) => Math.max(50, z - 50))}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded"
              title="জুম আউট"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            {zoomLevels.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setZoom(lvl)}
                className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded transition-colors whitespace-nowrap shrink-0 ${
                  zoom === lvl
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lvl}%
              </button>
            ))}
            <button
              onClick={() => setZoom((z) => Math.min(800, z + 50))}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded"
              title="জুম ইন"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => setLightCheckerboard((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            title="চেকারবোর্ড ব্যাকগ্রাউন্ড থিম পরিবর্তন (শুধুমাত্র প্রিভিউর জন্য)"
          >
            {lightCheckerboard ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>হালকা গ্রিড</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span>ডার্ক গ্রিড</span>
              </>
            )}
          </button>

          <button
            onClick={() => onRetraceSingleIcon(activeIcon)}
            disabled={isVectorizing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${activeIcon.status === 'processing' ? 'animate-spin' : ''}`} />
            <span>পুনরায় ট্রেস করুন</span>
          </button>

          {activeIcon.status === 'completed' && activeIcon.svgContent && (
            <button
              onClick={() => downloadIndividualSvg(activeIcon)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>SVG ডাউনলোড</span>
            </button>
          )}
        </div>
      </div>

      {/* Resolution / Quality Warning Banner if applicable */}
      {(isLowRes || (val && val.warnings.length > 0)) && (
        <div className="flex items-center gap-2.5 px-4 py-3 text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            {isLowRes && (
              <span>
                সতর্কতা: মূল ইমেজটির রেজোলিউশন তুলনামূলক কম ({activeIcon.width}×{activeIcon.height}px)। নিখুঁত কার্ভ তৈরির জন্য ২x সাব-পিক্সেল সুপার-স্যাম্পলিং প্রয়োগ করা হয়েছে।{' '}
              </span>
            )}
            {val?.warnings.map((w, i) => (
              <span key={i}>{w} </span>
            ))}
          </div>
        </div>
      )}

      {/* Comparison Viewport */}
      {compareMode === 'side-by-side' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left Panel: Original Raster Image */}
          <div className="flex flex-col bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B0F17]">
              <span className="text-xs font-semibold text-slate-200">
                মূল র‍্যাস্টার ইমেজ (Original Raster PNG/JPG)
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {activeIcon.width} × {activeIcon.height} px · জুম {zoom}%
              </span>
            </div>
            <div
              className={`flex-1 flex items-center justify-center p-8 min-h-[380px] overflow-auto ${checkerClass}`}
            >
              <img
                src={activeIcon.originalDataUrl}
                alt={activeIcon.name}
                referrerPolicy="no-referrer"
                style={{
                  width: `${displayWidth}px`,
                  height: `${displayHeight}px`,
                }}
                className="object-contain select-none shadow-sm"
              />
            </div>
          </div>

          {/* Right Panel: Genuine Vector SVG Preview */}
          <div className="flex flex-col bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B0F17]">
              <span className="text-xs font-semibold text-slate-200">
                ভেক্টর আউটপুট প্রিভিউ (Genuine VTracer SVG Paths)
              </span>
              <span className="text-xs font-mono tabular-nums text-indigo-400">
                {val
                  ? `${val.pathCount} পাথ · ${val.anchorPointCount} কমান্ড · viewBox ${val.viewBox}`
                  : activeIcon.status}
              </span>
            </div>
            <div
              className={`flex-1 flex items-center justify-center p-8 min-h-[380px] overflow-auto ${checkerClass}`}
            >
              {activeIcon.status === 'completed' && activeIcon.svgContent ? (
                <div
                  style={{
                    width: `${displayWidth}px`,
                    height: `${displayHeight}px`,
                  }}
                  className="flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: activeIcon.svgContent }}
                />
              ) : activeIcon.status === 'failed' ? (
                <div className="flex flex-col items-center justify-center text-center p-6 bg-[#0B0F17]/90 border border-rose-800/60 rounded-xl max-w-sm">
                  <XCircle className="w-8 h-8 text-rose-400 mb-2" />
                  <p className="text-xs font-semibold text-rose-300">
                    ভেক্টরাইজেশন ব্যর্থ হয়েছে
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {activeIcon.errorMessage || 'বৈধ ভেক্টর পাথ তৈরি করা যায়নি। ব্যর্থ ভেক্টরের স্থানে মূল র‍্যাস্টার ইমেজ বসানো হয়নি।'}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6 bg-[#0B0F17]/85 border border-slate-800 rounded-xl">
                  <p className="text-xs text-slate-300 mb-3">
                    এই আইকনটি এখনো ভেক্টরাইজ করা হয়নি।
                  </p>
                  <button
                    onClick={() => onRetraceSingleIcon(activeIcon)}
                    disabled={isVectorizing}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
                  >
                    এখনই ভেক্টরাইজ করুন (Vectorize Now)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {compareMode === 'slider' && (
        <div className="flex flex-col bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B0F17]">
            <span className="text-xs font-semibold text-slate-200">
              বিফোর / আফটার তুলনা (বামে: অরিজিনাল র‍্যাস্টার · ডানে: ভেক্টর SVG)
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                স্লাইডার পজিশন: {sliderPos}%
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={sliderPos}
                onChange={(e) => setSliderPos(Number(e.target.value))}
                className="w-36 accent-indigo-500"
              />
            </div>
          </div>

          <div
            className={`relative flex items-center justify-center p-10 min-h-[420px] overflow-auto ${checkerClass}`}
          >
            {activeIcon.status === 'completed' && activeIcon.svgContent ? (
              <div
                className="relative select-none"
                style={{
                  width: `${displayWidth}px`,
                  height: `${displayHeight}px`,
                }}
              >
                {/* Full Vector Layer Underneath */}
                <div
                  className="absolute inset-0 w-full h-full [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: activeIcon.svgContent }}
                />

                {/* Clipped Original Raster Layer on Top */}
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                >
                  <img
                    src={activeIcon.originalDataUrl}
                    alt={activeIcon.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Vertical Divider Handle */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-indigo-500 pointer-events-none"
                  style={{ left: `${sliderPos}%` }}
                />
              </div>
            ) : (
              <div className="text-xs text-slate-400">
                বিফোর/আফটার স্লাইডার ব্যবহারের জন্য আইকনটি ভেক্টরাইজ করুন।
              </div>
            )}
          </div>
        </div>
      )}

      {compareMode === 'code' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* SVG XML Source Code Inspector */}
          <div className="lg:col-span-7 flex flex-col bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B0F17]">
              <span className="text-xs font-semibold text-slate-200">
                খাঁটি SVG ভেক্টর পাথ কোড (Raw SVG Path XML)
              </span>
              <span className="text-xs font-mono text-slate-400">
                Adobe Illustrator Ready
              </span>
            </div>
            <pre className="p-4 text-xs font-mono text-indigo-200 bg-[#0B0F17] overflow-auto max-h-[380px] whitespace-pre-wrap break-all">
              {activeIcon.svgContent || '<!-- এখনো কোনো ভেক্টর কোড তৈরি হয়নি -->'}
            </pre>
          </div>

          {/* Section 10 SVG Validation Report */}
          <div className="lg:col-span-5 flex flex-col bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-3">
            <h4 className="text-sm font-semibold text-slate-100 border-b border-slate-800 pb-2">
              SVG ভ্যালিডেশন রিপোর্ট (Section 10 Verification)
            </h4>
            {val ? (
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">SVG XML গঠন (Valid XML Structure)</span>
                  <span className="flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> যাচাইকৃত
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">বৈধ SVG viewBox</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {val.viewBox}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">খাঁটি ভেক্টর পাথ সংখ্যা (&lt;path&gt;)</span>
                  <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                    {val.pathCount} টি
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">ভেক্টর কার্ভ ও অ্যাঙ্কর কমান্ড</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {val.anchorPointCount} টি
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">নেগেটিভ স্পেস / ইন্টেরিয়র হোল</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {val.compoundHoleCount} টি সাব-পাথ
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">এমবেডেড র‍্যাস্টার ইমেজ মুক্ত (No PNG/JPG Tag)</span>
                  <span className="flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> ১০০% ভেক্টর
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">স্বচ্ছ ব্যাকগ্রাউন্ড (Transparent Background)</span>
                  <span className="flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> হ্যাঁ (চেকারবোর্ড মুক্ত)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">শনাক্তকৃত ভেক্টর রঙ (Colors)</span>
                  <div className="flex items-center gap-1.5">
                    {val.detectedColors.map((hex) => (
                      <span
                        key={hex}
                        className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-300"
                      >
                        <span
                          className="w-3 h-3 rounded-sm border border-slate-600 inline-block"
                          style={{ backgroundColor: hex }}
                        />
                        {hex}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                আইকনটি ভেক্টরাইজ করার পর এখানে সম্পূর্ণ ভ্যালিডেশন রিপোর্ট প্রদর্শিত হবে।
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
