import React from 'react';
import { Type, Image as ImageIcon, ArrowRight, Code, Sparkles, CheckCircle2, LayoutGrid, Eye } from 'lucide-react';

export const OverviewCards = ({ onSelectTab }) => {
  return (
    <div className="space-y-10">
      {/* Welcome Hero Box */}
      <div className="relative p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-accent-purple/20 via-accent-pink/10 to-transparent border border-white/10 overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="text-xs font-extrabold uppercase tracking-widest text-accent-pink bg-accent-pink/20 px-3 py-1 rounded-full border border-accent-pink/30">
            CreatorIQ Studio Dashboard
          </span>
          <h3 className="font-outfit text-2xl sm:text-4xl font-extrabold text-white mt-3">
            Welcome to Your AI Video Growth Studio
          </h3>
          <p className="text-zinc-300 text-sm sm:text-base mt-2 leading-relaxed">
            Select an AI tool from the sidebar or choose a quick action below to start optimizing your titles and thumbnails for maximum YouTube CTR.
          </p>

          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={() => onSelectTab('title')}
              className="px-4 py-2.5 rounded-xl bg-accent-purple text-white font-bold text-sm flex items-center gap-2 shadow-lg hover:scale-105 transition-all cursor-pointer"
            >
              <Type className="w-4 h-4" />
              Title Generator
            </button>
            <button
              onClick={() => onSelectTab('thumbnail')}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm flex items-center gap-2 border border-white/15 transition-all cursor-pointer"
            >
              <ImageIcon className="w-4 h-4" />
              Thumbnail AI
            </button>
            <button
              onClick={() => onSelectTab('simulator')}
              className="px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-bold text-sm flex items-center gap-2 border border-emerald-500/30 transition-all cursor-pointer shadow-lg hover:scale-105"
            >
              <LayoutGrid className="w-4 h-4 text-emerald-400" />
              Feed A/B Simulator
            </button>
            <button
              onClick={() => onSelectTab('repurposer')}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-accent-pink/20 hover:from-amber-500/30 hover:to-accent-pink/30 text-amber-300 font-bold text-sm flex items-center gap-2 border border-amber-500/30 transition-all cursor-pointer shadow-lg hover:scale-105"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              Viral Repurposer (9:16)
              <span className="text-[10px] bg-amber-400 text-black px-1.5 py-0.2 rounded font-black">NEW</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recommended Production Workflow (5 Steps) */}
      <div className="p-6 rounded-2xl bg-black/40 border border-white/10">
        <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-6 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-purple" />
          Recommended Production Workflow
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div
            onClick={() => onSelectTab('title')}
            className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-accent-purple/50 transition-all cursor-pointer flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-accent-purple/30 text-accent-purple font-bold flex items-center justify-center shrink-0">
              1
            </div>
            <div>
              <p className="text-[10px] text-accent-purple font-bold uppercase">FEATURE 1</p>
              <p className="text-sm font-bold text-white">Title Intelligence</p>
            </div>
          </div>

          <div
            onClick={() => onSelectTab('thumbnail')}
            className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-accent-pink/50 transition-all cursor-pointer flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-accent-pink/30 text-accent-pink font-bold flex items-center justify-center shrink-0">
              2
            </div>
            <div>
              <p className="text-[10px] text-accent-pink font-bold uppercase">FEATURE 2</p>
              <p className="text-sm font-bold text-white">Thumbnail Studio</p>
            </div>
          </div>

          <div
            onClick={() => onSelectTab('simulator')}
            className="p-4 rounded-xl bg-white/5 border border-emerald-500/40 hover:border-emerald-400 transition-all cursor-pointer flex items-center gap-3 shadow-[0_0_15px_rgba(52,211,153,0.1)]"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/30 text-emerald-400 font-bold flex items-center justify-center shrink-0">
              3
            </div>
            <div>
              <p className="text-[10px] text-emerald-400 font-bold uppercase">FEATURE 3</p>
              <p className="text-sm font-bold text-white">Feed Simulator</p>
            </div>
          </div>

          <div
            onClick={() => onSelectTab('repurposer')}
            className="p-4 rounded-xl bg-white/5 border border-amber-400/40 hover:border-amber-400 transition-all cursor-pointer flex items-center gap-3 shadow-[0_0_15px_rgba(251,191,36,0.15)]"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-400/30 text-amber-300 font-bold flex items-center justify-center shrink-0">
              4
            </div>
            <div>
              <p className="text-[10px] text-amber-400 font-bold uppercase">FEATURE 4 (NEW)</p>
              <p className="text-sm font-bold text-white">Viral Repurposer</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/30 text-cyan-400 font-bold flex items-center justify-center shrink-0">
              5
            </div>
            <div>
              <p className="text-[10px] text-cyan-400 font-bold uppercase">RESULT</p>
              <p className="text-sm font-bold text-white">Multi-Platform Reach</p>
            </div>
          </div>
        </div>
      </div>

      {/* Supported Technologies */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-white tracking-wide uppercase flex items-center gap-2">
            <Code className="w-4 h-4 text-accent-cyan" />
            Supported Technologies
          </h4>
          <span className="text-xs text-zinc-500">CreatorIQ Architecture</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 hover:border-accent-purple/40 transition-all">
            <span className="text-xs font-bold text-accent-purple uppercase">Frontend</span>
            <p className="text-sm font-bold text-white mt-1">React + Tailwind CSS</p>
          </div>
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 hover:border-accent-purple/40 transition-all">
            <span className="text-xs font-bold text-accent-pink uppercase">Backend</span>
            <p className="text-sm font-bold text-white mt-1">FastAPI</p>
          </div>
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 hover:border-accent-purple/40 transition-all">
            <span className="text-xs font-bold text-accent-cyan uppercase">AI Text</span>
            <p className="text-sm font-bold text-white mt-1">
              Gemini API <span className="text-zinc-400 text-xs font-normal">➔ OpenRouter ➔ Groq</span>
            </p>
          </div>
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 hover:border-accent-purple/40 transition-all">
            <span className="text-xs font-bold text-emerald-400 uppercase">AI Vision</span>
            <p className="text-sm font-bold text-white mt-1">
              Gemini Vision <span className="text-zinc-400 text-xs font-normal">➔ Llama 3.2 Vision</span>
            </p>
          </div>
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 hover:border-accent-purple/40 transition-all">
            <span className="text-xs font-bold text-amber-400 uppercase">AI Thumbnail Gen</span>
            <p className="text-sm font-bold text-white mt-1">
              Gemini 2.5 Flash <span className="text-zinc-400 text-xs font-normal">➔ HuggingFace</span>
            </p>
          </div>
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 hover:border-accent-purple/40 transition-all">
            <span className="text-xs font-bold text-blue-400 uppercase">Video & Processing</span>
            <p className="text-sm font-bold text-white mt-1">OpenCV + FFmpeg</p>
          </div>
        </div>
      </div>

      {/* How CreatorIQ Works Steps */}
      <div className="space-y-4 pt-4 border-t border-white/10">
        <h4 className="text-sm font-bold text-white tracking-wide uppercase flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-pink" />
          How CreatorIQ Works
        </h4>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <span className="w-6 h-6 rounded-full bg-accent-purple text-white text-xs font-bold inline-flex items-center justify-center mb-1">
              1
            </span>
            <p className="text-xs font-bold text-white">Enter Video Title</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <span className="w-6 h-6 rounded-full bg-accent-purple text-white text-xs font-bold inline-flex items-center justify-center mb-1">
              2
            </span>
            <p className="text-xs font-bold text-white">Analyze Trends</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <span className="w-6 h-6 rounded-full bg-accent-purple text-white text-xs font-bold inline-flex items-center justify-center mb-1">
              3
            </span>
            <p className="text-xs font-bold text-white">Generate Better Titles</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <span className="w-6 h-6 rounded-full bg-accent-pink text-white text-xs font-bold inline-flex items-center justify-center mb-1">
              4
            </span>
            <p className="text-xs font-bold text-white">Upload Video / URL</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <span className="w-6 h-6 rounded-full bg-accent-pink text-white text-xs font-bold inline-flex items-center justify-center mb-1">
              5
            </span>
            <p className="text-xs font-bold text-white">Generate 3 Thumbnails</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <span className="w-6 h-6 rounded-full bg-accent-pink text-white text-xs font-bold inline-flex items-center justify-center mb-1">
              6
            </span>
            <p className="text-xs font-bold text-white">Choose Best Thumbnail</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 col-span-2 sm:col-span-1">
            <span className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold inline-flex items-center justify-center mb-1">
              7
            </span>
            <p className="text-xs font-bold text-emerald-400">Ready to Publish</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewCards;
