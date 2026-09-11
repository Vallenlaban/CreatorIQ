import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Smartphone,
  Eye,
  Sparkles,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Layers,
  ArrowRight,
  TrendingUp,
  Sliders,
  Check,
  Compass
} from 'lucide-react';

export const FeedSimulator = ({ initialVariant, onSelectTab }) => {
  // Device mode: 'desktop' | 'mobile' | 'suggested'
  const [deviceMode, setDeviceMode] = useState('desktop');

  // Squint test mode
  const [squintMode, setSquintMode] = useState(false);

  // Selected Niche
  const [selectedNiche, setSelectedNiche] = useState('tech');
  const [customSearchQuery, setCustomSearchQuery] = useState('');
  const [isSearchingYt, setIsSearchingYt] = useState(false);

  // Competitor Feed Data
  const [competitors, setCompetitors] = useState([]);
  const [feedSource, setFeedSource] = useState('curated_niche');
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);

  // Creator Candidate Video Data
  const [activeVariantKey, setActiveVariantKey] = useState(initialVariant?.id || 'A');
  const [hasCandidate, setHasCandidate] = useState(Boolean(initialVariant?.imageUrl));
  const [candidateData, setCandidateData] = useState({
    title: initialVariant?.title || 'Viral YouTube Video',
    channel: 'Your Channel',
    channelAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    views: 'Just published',
    uploaded: 'New',
    duration: '14:35',
    variants: {
      A: {
        id: 'A',
        name: 'Variant A',
        concept: 'Subject Focused',
        hook: initialVariant?.hook || 'VIRAL HOOK',
        color: initialVariant?.color || '#FFE600',
        imageUrl: initialVariant?.imageUrl || '',
        ctrScore: 96
      }
    }
  });

  useEffect(() => {
    if (initialVariant?.imageUrl) {
      setHasCandidate(true);
      setCandidateData(prev => ({
        ...prev,
        title: initialVariant.title || prev.title,
        variants: {
          ...prev.variants,
          [initialVariant.id || 'A']: {
            id: initialVariant.id || 'A',
            name: `Variant ${initialVariant.id || 'A'}`,
            concept: initialVariant.concept || 'AI Generated',
            hook: initialVariant.hook || 'VIRAL HOOK',
            color: initialVariant.color || '#FFE600',
            imageUrl: initialVariant.imageUrl,
            ctrScore: 95
          }
        }
      }));
      if (initialVariant.id) {
        setActiveVariantKey(initialVariant.id);
      }
    }
  }, [initialVariant]);

  // AI Blindspot Audit State
  const [auditData, setAuditData] = useState({
    dominance_score: 92,
    legibility_score: 96,
    color_contrast_edge: '+38% visual pop vs competitors',
    squint_pass: true,
    pros: [
      'High-contrast hook typography creates immediate visual pop against YouTube dark mode.',
      'Clear subject silhouette creates rapid emotional connection in under 0.5s.',
      'Short punchy hook text (2-3 words) avoids mobile truncation.'
    ],
    blindspot_alerts: [
      'Ensure hook text doesn\'t overlap the bottom-right YouTube video timestamp pill.',
      'Keep the most crucial keywords in the first 45 characters of your title.'
    ]
  });
  const [isAuditing, setIsAuditing] = useState(false);

  // Active Variant
  const currentVariant = candidateData.variants[activeVariantKey] || candidateData.variants.A;

  // Load Feed on Niche Change
  const loadFeed = async (nicheKey, query = '') => {
    setIsLoadingFeed(true);
    try {
      let url = `/api/simulator/feed?niche=${encodeURIComponent(nicheKey)}`;
      if (query.trim()) {
        url += `&query=${encodeURIComponent(query.trim())}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setCompetitors(data.items);
        setFeedSource(data.source);
      }
    } catch (err) {
      console.error('Failed to load feed:', err);
    } finally {
      setIsLoadingFeed(false);
      setIsSearchingYt(false);
    }
  };

  useEffect(() => {
    loadFeed(selectedNiche);
  }, [selectedNiche]);

  // Run AI Audit when active variant or competitors change
  const runAiAudit = async () => {
    setIsAuditing(true);
    try {
      const res = await fetch('/api/simulator/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: candidateData.title,
          hook_text: currentVariant.hook,
          accent_color: currentVariant.color,
          concept: currentVariant.concept,
          competitors: competitors.slice(0, 4)
        })
      });
      const data = await res.json();
      if (data.success && data.audit) {
        setAuditData(data.audit);
      }
    } catch (err) {
      console.warn('AI Audit error:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  useEffect(() => {
    if (competitors.length > 0) {
      runAiAudit();
    }
  }, [activeVariantKey, competitors]);

  const handleCustomSearch = (e) => {
    e.preventDefault();
    if (!customSearchQuery.trim()) return;
    setIsSearchingYt(true);
    loadFeed(selectedNiche, customSearchQuery);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner Header */}
      <div className="relative p-5 sm:p-7 rounded-2xl bg-gradient-to-r from-accent-purple/25 via-accent-cyan/15 to-transparent border border-white/10 overflow-hidden shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-accent-cyan bg-accent-cyan/10 px-2.5 py-1 rounded-full border border-accent-cyan/30 flex items-center gap-1.5 shadow-sm">
                <Flame className="w-3.5 h-3.5 text-accent-cyan" />
                Feature 3: Feed Blindspot & Competitor A/B Simulator
              </span>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Groq Qwen 3.8 AI
              </span>
            </div>
            <h2 className="font-outfit text-2xl sm:text-3xl font-extrabold text-white">
              YouTube Feed A/B Blindspot Simulator
            </h2>
            <p className="text-zinc-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Never publish in a vacuum. Test your candidate thumbnail alongside real competitors in YouTube’s dark feed, run the 0.5s mobile squint test, and eliminate feed blindspots before publishing.
            </p>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-3 bg-black/50 border border-white/10 p-3 rounded-xl shrink-0">
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-zinc-400">Feed Dominance</p>
              <p className="text-xl font-extrabold text-emerald-400">{auditData.dominance_score}%</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Controls Toolbar */}
      <div className="p-4 rounded-2xl bg-bg-slate/80 border border-white/10 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 1. Device Mode Switcher */}
          <div className="flex items-center gap-1 bg-black/40 border border-white/10 p-1 rounded-xl">
            <button
              onClick={() => setDeviceMode('desktop')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                deviceMode === 'desktop'
                  ? 'bg-white/15 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              Desktop Feed
            </button>
            <button
              onClick={() => setDeviceMode('mobile')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                deviceMode === 'mobile'
                  ? 'bg-white/15 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Mobile App (120px)
            </button>
            <button
              onClick={() => setDeviceMode('suggested')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                deviceMode === 'suggested'
                  ? 'bg-white/15 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              Suggested Rail
            </button>
          </div>

          {/* 2. Squint Test Toggle */}
          <button
            onClick={() => setSquintMode(!squintMode)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border cursor-pointer ${
              squintMode
                ? 'bg-accent-pink text-white border-accent-pink shadow-[0_0_15px_rgba(236,72,153,0.5)]'
                : 'bg-white/5 hover:bg-white/10 text-zinc-300 border-white/10'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>Mobile Squint Test</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-black ${squintMode ? 'bg-black/30' : 'bg-white/10'}`}>
              {squintMode ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>
      </div>

      {/* LIVE YOUTUBE FEED SIMULATION STAGE */}
      <div className="p-4 sm:p-6 rounded-2xl bg-[#0f0f0f] border border-white/10 shadow-2xl relative">
        {/* Mock YouTube Top Header Bar */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/10 text-zinc-400 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-bold text-white tracking-tighter text-sm">
              <div className="w-5 h-3.5 bg-red-600 rounded-sm flex items-center justify-center text-white">
                <div className="w-0 h-0 border-y-[3px] border-y-transparent border-l-[5px] border-l-white ml-0.5"></div>
              </div>
              <span>YouTube</span>
            </div>
            <span className="text-zinc-600">|</span>
            <span className="text-zinc-400 text-[11px]">Home Feed Simulation (Dark Theme)</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-zinc-500 font-mono">
              Mode: {deviceMode.toUpperCase()}
            </span>
            {squintMode && (
              <span className="text-[10px] font-bold text-accent-pink bg-accent-pink/10 px-2 py-0.5 rounded border border-accent-pink/30 animate-pulse">
                👁️ SQUINT FILTER APPLIED
              </span>
            )}
          </div>
        </div>

        {/* FEED GRID CONTAINER WITH SQUINT TEST FILTER EFFECT */}
        <div
          className={`transition-all duration-300 ${
            squintMode ? 'filter blur-[1.2px] contrast-125 brightness-90 scale-[0.98]' : ''
          }`}
        >
          {deviceMode === 'desktop' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-8">
              {/* Card 1: Real Competitor 1 */}
              {competitors[0] && renderCompetitorCard(competitors[0])}

              {/* Card 2: THE USER'S CANDIDATE VIDEO (Position 2 - Golden Spotlight) */}
              {renderCandidateCard()}

              {/* Cards 3+: Remaining Competitors */}
              {competitors.slice(1, 6).map((comp) => renderCompetitorCard(comp))}
            </div>
          )}

          {deviceMode === 'mobile' && (
            <div className="max-w-md mx-auto space-y-6 bg-black p-3 rounded-2xl border border-white/10 shadow-2xl">
              <div className="text-[10px] text-center font-bold text-zinc-500 uppercase tracking-widest pb-2 border-b border-white/5">
                📱 Mobile Screen Feed View (120px Scan Distance)
              </div>
              {/* Competitor 1 */}
              {competitors[0] && renderCompetitorCard(competitors[0], true)}

              {/* CANDIDATE VIDEO */}
              {renderCandidateCard(true)}

              {/* Competitor 2 */}
              {competitors[1] && renderCompetitorCard(competitors[1], true)}
            </div>
          )}

          {deviceMode === 'suggested' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 p-6 rounded-xl bg-black/60 border border-white/10 flex flex-col items-center justify-center text-center">
                <div className="w-full aspect-video bg-zinc-900 rounded-xl flex items-center justify-center text-zinc-600 mb-4">
                  <span className="text-sm font-bold">Currently Playing Video Player</span>
                </div>
                <h3 className="text-sm font-bold text-white text-left w-full">Watching: Video player viewport</h3>
              </div>
              <div className="space-y-4">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider pb-2 border-b border-white/10">
                  Up Next / Suggested Rail
                </div>
                {/* CANDIDATE COMPACT */}
                {renderCandidateCompact()}
                {/* Competitors Compact */}
                {competitors.slice(0, 4).map((comp) => renderCompetitorCompact(comp))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Insights & Blindspot Audit Details */}
      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Competitive Advantages (Why This Thumbnail Wins)
          </h4>
          <ul className="space-y-2 text-xs text-zinc-300">
            {auditData.pros?.map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Feed Blindspot Warnings (Things to Watch Out For)
          </h4>
          <ul className="space-y-2 text-xs text-zinc-300">
            {auditData.blindspot_alerts?.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  // -------------------------------------------------------------
  // Card Render Helpers
  // -------------------------------------------------------------

  function renderCandidateCard(isMobile = false) {
    if (!hasCandidate) {
      return (
        <div
          key="candidate-card-placeholder"
          className="flex flex-col gap-2.5 relative group rounded-2xl p-3 bg-accent-purple/5 border-2 border-dashed border-accent-purple/40 shadow-[0_0_20px_rgba(168,85,247,0.12)] transition-all hover:border-accent-purple/70"
        >
          {/* Top Floating Badge */}
          <div className="absolute -top-3 left-3 z-30 flex items-center gap-1.5 bg-accent-purple/80 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-lg border border-white/20">
            <Sparkles className="w-3 h-3" />
            <span>YOUR CANDIDATE SLOT</span>
          </div>

          {/* Thumbnail Container with English instruction */}
          <div
            onClick={() => onSelectTab && onSelectTab('thumbnail')}
            className="relative aspect-video rounded-xl overflow-hidden bg-gradient-to-b from-[#181024] to-[#0d0714] border border-white/10 flex flex-col items-center justify-center p-4 text-center cursor-pointer group-hover:scale-[1.01] hover:border-accent-purple/60 transition-all select-none"
          >
            <div className="w-12 h-12 rounded-2xl bg-accent-purple/20 border border-accent-purple/40 flex items-center justify-center mb-2.5 shadow-[0_0_20px_rgba(168,85,247,0.35)] group-hover:bg-accent-purple/30 transition-colors">
              <Sparkles className="w-6 h-6 text-accent-purple" />
            </div>

            <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
              No Thumbnail Selected
            </h4>

            <p className="text-[11px] text-zinc-300 mt-1 max-w-[270px] leading-relaxed">
              You must create a thumbnail in <span className="text-accent-purple font-bold">Thumbnail AI</span> first so your chosen candidate can be tested here.
            </p>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onSelectTab) onSelectTab('thumbnail');
              }}
              className="mt-3 px-3.5 py-1.5 rounded-lg bg-accent-purple hover:bg-accent-purple/90 text-white text-xs font-bold shadow-lg transition-all flex items-center gap-1.5 cursor-pointer hover:shadow-[0_0_15px_rgba(168,85,247,0.4)]"
            >
              <span>Create in Thumbnail AI</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Metadata Placeholder */}
          <div className="flex gap-3 pt-1 opacity-70">
            <div className="w-9 h-9 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center font-black text-zinc-400 text-xs shrink-0 shadow">
              YOU
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-semibold text-zinc-300 line-clamp-2 leading-snug">
                Waiting for selected Thumbnail AI candidate...
              </h3>
              <div className="flex items-center gap-1.5 text-zinc-500 text-xs mt-1">
                <span className="font-semibold text-zinc-400">{candidateData.channel}</span>
                <span className="w-1 h-1 rounded-full bg-zinc-700"></span>
                <span className="text-accent-purple/80">Pending Generation</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key="candidate-card"
        className="flex flex-col gap-2 relative group rounded-2xl p-2 bg-accent-purple/10 border-2 border-accent-purple/60 shadow-[0_0_25px_rgba(168,85,247,0.25)] transition-all"
      >
        {/* Top Floating Badge */}
        <div className="absolute -top-3 left-3 z-30 flex items-center gap-1.5 bg-accent-purple text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-lg border border-white/20">
          <Sparkles className="w-3 h-3" />
          <span>YOUR VIDEO (OPTION {currentVariant.id})</span>
        </div>

        {/* Thumbnail Image Container */}
        <div className="relative aspect-video rounded-xl overflow-hidden bg-black select-none">
          <img
            src={currentVariant.imageUrl}
            alt="Candidate Thumbnail"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />

          {/* Vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none"></div>

          {/* Hook Text Overlay */}
          <div className="absolute bottom-2 left-2 z-10 pointer-events-none">
            <span
              className="font-black uppercase text-base sm:text-lg drop-shadow-[0_4px_10px_rgba(0,0,0,0.95)] px-2 py-0.5 rounded bg-black/70 border border-white/10 inline-block transform -rotate-1"
              style={{
                color: currentVariant.color,
                fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif"
              }}
            >
              {currentVariant.hook}
            </span>
          </div>

          {/* YouTube Duration Pill */}
          <div className="absolute bottom-2 right-2 bg-black/85 text-white text-[10px] font-bold px-1.5 py-0.5 rounded font-mono shadow">
            {candidateData.duration}
          </div>
        </div>

        {/* Metadata Details */}
        <div className="flex gap-3 pt-1">
          <img
            src={candidateData.channelAvatar}
            alt={candidateData.channel}
            className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white line-clamp-2 leading-snug">
              {candidateData.title}
            </h3>
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs mt-1">
              <span className="font-semibold text-zinc-300">{candidateData.channel}</span>
              <span className="w-1 h-1 rounded-full bg-zinc-600"></span>
              <span>{candidateData.views}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderCompetitorCard(comp, isMobile = false) {
    return (
      <div key={comp.id} className="flex flex-col gap-2 group cursor-pointer">
        <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 select-none border border-white/5">
          <img
            src={comp.thumbnail_url}
            alt={comp.title}
            className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
          />
          <div className="absolute bottom-2 right-2 bg-black/85 text-white text-[10px] font-bold px-1.5 py-0.5 rounded font-mono shadow">
            {comp.duration}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <img
            src={comp.channel_avatar}
            alt={comp.channel}
            className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-zinc-200 group-hover:text-white line-clamp-2 leading-snug">
              {comp.title}
            </h3>
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs mt-1">
              <span>{comp.channel}</span>
              <span className="w-1 h-1 rounded-full bg-zinc-600"></span>
              <span>{comp.views}</span>
              <span className="w-1 h-1 rounded-full bg-zinc-600"></span>
              <span>{comp.uploaded}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderCandidateCompact() {
    if (!hasCandidate) {
      return (
        <div
          onClick={() => onSelectTab && onSelectTab('thumbnail')}
          className="flex gap-3 p-2 rounded-xl bg-accent-purple/5 border-2 border-dashed border-accent-purple/40 shadow-sm relative cursor-pointer hover:border-accent-purple/70 transition-all"
        >
          <span className="absolute -top-2.5 right-3 bg-accent-purple/80 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow">
            YOUR CANDIDATE SLOT
          </span>
          <div className="relative w-36 aspect-video rounded-lg overflow-hidden bg-gradient-to-b from-[#181024] to-[#0d0714] border border-white/10 flex flex-col items-center justify-center text-center p-2 shrink-0">
            <Sparkles className="w-4 h-4 text-accent-purple mb-1" />
            <span className="text-[10px] font-bold text-white uppercase">No Thumbnail</span>
            <span className="text-[9px] text-accent-purple font-semibold mt-0.5">Open AI &rarr;</span>
          </div>
          <div className="flex-1 min-w-0 pr-1 flex flex-col justify-center">
            <h4 className="text-xs font-semibold text-zinc-300 leading-tight line-clamp-2">
              Waiting for Thumbnail AI...
            </h4>
            <p className="text-[11px] text-accent-purple/80 font-semibold mt-1">Your Channel</p>
            <p className="text-[10px] text-zinc-500">Create in Thumbnail AI</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex gap-2.5 p-2 rounded-xl bg-accent-purple/10 border border-accent-purple/40 shadow">
        <div className="relative w-36 aspect-video rounded-lg overflow-hidden bg-black shrink-0">
          <img src={currentVariant.imageUrl} alt="Candidate" className="w-full h-full object-cover" />
          <span
            className="absolute bottom-1 left-1 font-black text-[9px] px-1 bg-black/80 rounded"
            style={{ color: currentVariant.color }}
          >
            {currentVariant.hook}
          </span>
          <span className="absolute bottom-1 right-1 text-[9px] bg-black/80 text-white px-1 rounded font-mono">
            {candidateData.duration}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-bold text-white line-clamp-2 leading-tight">
            {candidateData.title}
          </h4>
          <p className="text-[10px] text-zinc-400 mt-1">{candidateData.channel}</p>
          <p className="text-[10px] text-emerald-400 font-bold">New Candidate</p>
        </div>
      </div>
    );
  }

  function renderCompetitorCompact(comp) {
    return (
      <div key={`comp-compact-${comp.id}`} className="flex gap-2.5 cursor-pointer group">
        <div className="relative w-36 aspect-video rounded-lg overflow-hidden bg-zinc-900 shrink-0 border border-white/5">
          <img src={comp.thumbnail_url} alt={comp.title} className="w-full h-full object-cover" />
          <span className="absolute bottom-1 right-1 text-[9px] bg-black/80 text-white px-1 rounded font-mono">
            {comp.duration}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-semibold text-zinc-300 group-hover:text-white line-clamp-2 leading-tight">
            {comp.title}
          </h4>
          <p className="text-[10px] text-zinc-400 mt-1">{comp.channel}</p>
          <p className="text-[10px] text-zinc-500">{comp.views} • {comp.uploaded}</p>
        </div>
      </div>
    );
  }
};

export default FeedSimulator;
