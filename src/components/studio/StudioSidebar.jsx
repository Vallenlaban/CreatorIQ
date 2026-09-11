import React from 'react';
import { Home, Type, Image, LayoutGrid, Scissors } from 'lucide-react';

export const StudioSidebar = ({ activeTab, onSelectTab }) => {
  return (
    <div className="w-full md:w-32 bg-bg-deep/95 border-t md:border-t-0 md:border-r border-white/10 p-2 sm:p-3 md:p-4 flex flex-row md:flex-col items-center justify-around md:justify-start gap-2 sm:gap-3 md:gap-4 shrink-0 z-20 order-2 md:order-1 overflow-x-auto md:overflow-x-visible">
      {/* Sidebar Item 1: Home */}
      <button
        onClick={() => onSelectTab('home')}
        className={`studio-tab-btn group w-full max-w-[80px] sm:max-w-[100px] md:max-w-none md:w-26 py-2 md:py-3 px-1.5 md:px-2 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 md:gap-1.5 transition-all duration-300 cursor-pointer relative shrink-0 ${
          activeTab === 'home'
            ? 'bg-white/10 text-white border border-accent-purple/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
            : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
        }`}
      >
        <div className="flex items-center justify-center group-hover:scale-110 transition-transform">
          <Home className="w-5 h-5 md:w-6 md:h-6 text-accent-purple" />
        </div>
        <span className="text-[10px] md:text-xs font-bold text-center leading-tight tracking-wide">
          Home
        </span>
      </button>

      {/* Sidebar Item 2: Title Generator */}
      <button
        onClick={() => onSelectTab('title')}
        className={`studio-tab-btn group w-full max-w-[80px] sm:max-w-[100px] md:max-w-none md:w-26 py-2 md:py-3 px-1.5 md:px-2 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 md:gap-1.5 transition-all duration-300 cursor-pointer relative shrink-0 ${
          activeTab === 'title'
            ? 'bg-white/10 text-white border border-accent-pink/50 shadow-[0_0_15px_rgba(236,72,153,0.3)]'
            : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
        }`}
      >
        <div className="flex items-center justify-center group-hover:scale-110 transition-transform">
          <Type className="w-5 h-5 md:w-6 md:h-6 text-accent-pink" />
        </div>
        <span className="text-[10px] md:text-xs font-bold text-center leading-tight tracking-wide">
          Title Gen
        </span>
      </button>

      {/* Sidebar Item 3: Thumbnail AI */}
      <button
        onClick={() => onSelectTab('thumbnail')}
        className={`studio-tab-btn group w-full max-w-[80px] sm:max-w-[100px] md:max-w-none md:w-26 py-2 md:py-3 px-1.5 md:px-2 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 md:gap-1.5 transition-all duration-300 cursor-pointer relative shrink-0 ${
          activeTab === 'thumbnail'
            ? 'bg-white/10 text-white border border-accent-cyan/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
            : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
        }`}
      >
        <div className="flex items-center justify-center group-hover:scale-110 transition-transform">
          <Image className="w-5 h-5 md:w-6 md:h-6 text-accent-cyan" />
        </div>
        <span className="text-[10px] md:text-xs font-bold text-center leading-tight tracking-wide">
          Thumbnail
        </span>
      </button>

      {/* Sidebar Item 4: Feed Simulator */}
      <button
        onClick={() => onSelectTab('simulator')}
        className={`studio-tab-btn group w-full max-w-[80px] sm:max-w-[100px] md:max-w-none md:w-26 py-2 md:py-3 px-1.5 md:px-2 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 md:gap-1.5 transition-all duration-300 cursor-pointer relative shrink-0 ${
          activeTab === 'simulator'
            ? 'bg-white/10 text-white border border-emerald-400/50 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
            : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
        }`}
      >
        <div className="flex items-center justify-center group-hover:scale-110 transition-transform relative">
          <LayoutGrid className="w-5 h-5 md:w-6 md:h-6 text-emerald-400" />
        </div>
        <span className="text-[10px] md:text-xs font-bold text-center leading-tight tracking-wide">
          Simulator
        </span>
      </button>

      {/* Sidebar Item 5: Viral Repurposer (Feature 4 - NEW) */}
      <button
        onClick={() => onSelectTab('repurposer')}
        className={`studio-tab-btn group w-full max-w-[80px] sm:max-w-[100px] md:max-w-none md:w-26 py-2 md:py-3 px-1.5 md:px-2 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 md:gap-1.5 transition-all duration-300 cursor-pointer relative shrink-0 ${
          activeTab === 'repurposer'
            ? 'bg-white/10 text-white border border-amber-400/50 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
            : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
        }`}
      >
        <div className="flex items-center justify-center group-hover:scale-110 transition-transform relative">
          <Scissors className="w-5 h-5 md:w-6 md:h-6 text-amber-400" />
          <span className="absolute -top-1 -right-2 text-[8px] font-black bg-amber-400 text-black px-1 rounded-full uppercase">
            9:16
          </span>
        </div>
        <span className="text-[10px] md:text-xs font-bold text-center leading-tight tracking-wide">
          Repurposer
        </span>
      </button>
    </div>
  );
};

export default StudioSidebar;
