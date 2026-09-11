import React, { useState } from 'react';
import { Sparkles, Download, Eye, Check, ChevronDown, Upload, Link as LinkIcon, Image as ImageIcon, AlertCircle, Zap, X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, LayoutGrid } from 'lucide-react';

export const ThumbnailStudio = ({ onOpenPreview, onTestInSimulator }) => {
  const [videoUrl, setVideoUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [selectedVersionKey, setSelectedVersionKey] = useState('A');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState('Analyzing Video & Extracting Candidate Frames...');
  const [hasGenerated, setHasGenerated] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [referenceImage, setReferenceImage] = useState(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState(null);
  const [detectedVideo, setDetectedVideo] = useState(null);
  const [previewModalIndex, setPreviewModalIndex] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);

  const [resultData, setResultData] = useState({
    provider: 'Groq Cloud',
    model: 'qwen/qwen3.8-27b',
    groq_tier: 'Primary',
    groq_primary_model: 'qwen/qwen3.8-27b',
    groq_secondary_model: 'openai/gpt-oss-120b',
    aspect_ratio: '16:9',
    video_source_frame: null,
    hook_text: 'THEY SURVIVED?!',
    thumbnails: []
  });

  // Fetch YouTube video details on URL change
  const handleUrlChange = async (url) => {
    setVideoUrl(url);
    const trimmed = url.trim();
    if (!trimmed.includes('youtube.com') && !trimmed.includes('youtu.be')) {
      setDetectedVideo(null);
      return;
    }

    try {
      const res = await fetch(`/api/video/info?url=${encodeURIComponent(trimmed)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setDetectedVideo(data);
        if (!customTitle || customTitle === 'Viral YouTube Video') {
          setCustomTitle(data.title);
        }
      }
    } catch (e) {
      console.warn('Error fetching video details:', e);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setReferenceImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    const trimmedUrl = videoUrl.trim();
    if (!trimmedUrl && !referenceImagePreview && !customTitle.trim()) {
      setErrorMessage('Please provide a YouTube video URL, title, or upload a reference image.');
      return;
    }

    setIsLoading(true);
    setHasGenerated(false);
    setErrorMessage(null);

    const phases = [
      'Extracting real video keyframes from YouTube...',
      'Grounding visual scene in actual video topic...',
      'Calling Groq Qwen AI (Primary: qwen3.8-27b)...',
      'Generating 3 high-CTR viral thumbnails...',
      'Applying viral typography & contrast polish...'
    ];

    let pIndex = 0;
    const interval = setInterval(() => {
      pIndex = (pIndex + 1) % phases.length;
      setLoadingPhase(phases[pIndex]);
    }, 1200);

    try {
      const response = await fetch('/api/thumbnail/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          video_url: trimmedUrl,
          title: customTitle.trim() || undefined,
          aspect_ratio: aspectRatio,
          reference_image_url: referenceImagePreview || undefined
        })
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to generate thumbnail.');
      }

      setResultData({
        provider: data.provider || 'Groq Cloud',
        model: data.model || 'openai/gpt-oss-120b',
        groq_tier: data.groq_tier || 'Primary',
        groq_primary_model: data.groq_primary_model || 'openai/gpt-oss-120b',
        groq_secondary_model: data.groq_secondary_model || 'openai/gpt-oss-20b',
        aspect_ratio: data.aspect_ratio || aspectRatio,
        video_source_frame: data.video_source_frame || null,
        hook_text: data.hook_text || 'VIRAL MOMEN!',
        thumbnails: data.thumbnails || []
      });

      if (data.thumbnails && data.thumbnails.length > 0) {
        setSelectedVersionKey(data.thumbnails[0].id);
      }

      setHasGenerated(true);
    } catch (err) {
      console.error('Thumbnail Generation error:', err);
      setErrorMessage(err.message || 'Failed to connect to the Thumbnail Studio service.');
      setHasGenerated(false);
    } finally {
      clearInterval(interval);
      setIsLoading(false);
    }
  };

  const handleUpdateItemHook = (id, newHook) => {
    setResultData(prev => ({
      ...prev,
      thumbnails: prev.thumbnails.map(t => t.id === id ? { ...t, hook_text: newHook } : t)
    }));
  };

  const handleDownload = async (imgUrl, title, hookText, accentColor, badgeText) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imgUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });

      let targetW = 1280;
      let targetH = 720;
      const currentRatio = (aspectRatio || resultData?.aspect_ratio || '').trim();

      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const natAspect = img.naturalWidth / img.naturalHeight;
        if (natAspect < 0.75 || currentRatio === '9:16') {
          targetW = img.naturalWidth >= 720 ? img.naturalWidth : 720;
          targetH = img.naturalHeight >= 1280 ? img.naturalHeight : 1280;
        } else if ((natAspect >= 0.85 && natAspect <= 1.15) || currentRatio === '1:1') {
          const side = Math.max(img.naturalWidth, img.naturalHeight, 1080);
          targetW = side;
          targetH = side;
        } else {
          targetW = img.naturalWidth >= 1280 ? img.naturalWidth : 1280;
          targetH = img.naturalHeight >= 720 ? img.naturalHeight : 720;
        }
      } else {
        if (currentRatio === '9:16') {
          targetW = 720;
          targetH = 1280;
        } else if (currentRatio === '1:1') {
          targetW = 1080;
          targetH = 1080;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      if (img.naturalWidth > 0) {
        const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
        const x = (canvas.width - img.naturalWidth * scale) / 2;
        const y = (canvas.height - img.naturalHeight * scale) / 2;
        ctx.drawImage(img, x, y, img.naturalWidth * scale, img.naturalHeight * scale);
      } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Vignette gradient
      const grad = ctx.createLinearGradient(0, canvas.height * 0.4, 0, canvas.height);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.5)');
      grad.addColorStop(1, 'rgba(0,0,0,0.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Badge
      if (badgeText && badgeText.trim()) {
        ctx.save();
        ctx.translate(60, canvas.height - 150);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 2;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(0, 0, 200, 42, 8);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(0, 0, 200, 42);
        }
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(22, 21, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 18px "Plus Jakarta Sans", Outfit, Arial, sans-serif';
        ctx.fillText(badgeText.toUpperCase(), 40, 27);
        ctx.restore();
      }

      // Hook Typography
      if (hookText && hookText.trim()) {
        ctx.save();
        ctx.translate(60, canvas.height - 60);
        ctx.rotate(-0.02);
        ctx.font = '900 76px "Plus Jakarta Sans", Outfit, Impact, Arial, sans-serif';
        const textMetrics = ctx.measureText(hookText.toUpperCase());
        const textWidth = textMetrics.width;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(-16, -76, textWidth + 36, 96, 12);
          ctx.fill();
          ctx.stroke();
        }

        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 6;
        ctx.fillStyle = accentColor || '#FFE600';
        ctx.fillText(hookText.toUpperCase(), 0, 0);
        ctx.restore();
      }

      canvas.toBlob((blob) => {
        if (!blob) {
          const link = document.createElement('a');
          link.href = imgUrl;
          link.download = `thumbnail_${(title || 'creatoriq').replace(/[^a-zA-Z0-9]/g, '_')}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          return;
        }
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `CreatorIQ_Thumbnail_${title || 'Option'}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      }, 'image/png');
    } catch (err) {
      console.warn('Canvas export error:', err);
      const link = document.createElement('a');
      link.href = imgUrl;
      link.download = `thumbnail_${(title || 'creatoriq').replace(/[^a-zA-Z0-9]/g, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const getAspectRatioClass = (ratio) => {
    if (ratio === '9:16') return 'aspect-[9/16] max-h-[380px]';
    if (ratio === '1:1') return 'aspect-square max-h-[320px]';
    return 'aspect-video';
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div>
        <span className="text-xs font-bold uppercase tracking-widest text-accent-pink bg-accent-pink/10 px-3 py-1 rounded-full border border-accent-pink/20">
          Feature 2
        </span>
        <h3 className="font-outfit text-2xl font-extrabold text-white mt-2">Thumbnail AI Studio</h3>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Left Form Panel */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-black/40 border border-white/10 space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <h4 className="text-lg font-bold text-white">Generate Thumbnails</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Paste a YouTube video URL or upload a reference image. AI Vision analyzes emotion, subjects, and generates 3 distinct high-CTR thumbnails.
            </p>

            {/* Groq Engine Indicator */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] bg-white/5 border border-white/10 px-3 py-2 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-zinc-300 font-semibold">Groq AI Engine:</span>
              <span className="text-accent-pink font-mono bg-accent-pink/10 px-1.5 py-0.5 rounded border border-accent-pink/20">
                Primary: qwen/qwen3.8-27b
              </span>
              <span className="text-accent-cyan font-mono bg-accent-cyan/10 px-1.5 py-0.5 rounded border border-accent-cyan/20">
                Secondary: openai/gpt-oss-120b
              </span>
            </div>

            <div className="space-y-4 pt-2">
              {/* Video URL Input */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>YouTube Video URL</span>
                  <span className="text-[10px] text-accent-pink lowercase bg-accent-pink/10 px-2 py-0.5 rounded border border-accent-pink/20 font-mono">
                    YouTube URL
                  </span>
                </label>

                <div className="relative">
                  <input
                    type="text"
                    value={videoUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent-pink transition-colors duration-150"
                    disabled={isLoading}
                  />
                  <LinkIcon className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
                </div>

                {/* Detected Video Preview */}
                {detectedVideo && (
                  <div className="mt-2.5 p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                    <div className="relative w-16 h-10 rounded-lg overflow-hidden bg-black shrink-0 border border-white/10 shadow">
                      <img
                        src={detectedVideo.best_frame || detectedVideo.local_frame}
                        alt="Candidate frame"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-0.5 right-0.5 bg-red-600 text-white text-[8px] font-black px-1 rounded">YT</span>
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Video Content Analyzed</span>
                      </div>
                      <p className="text-xs font-bold text-white truncate">{detectedVideo.title}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{detectedVideo.author ? `By ${detectedVideo.author}` : 'YouTube Video'}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Custom / Best Title */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
                  Video Title / Best Title (Optional)
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. I Built a Boat From Scratch"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent-pink transition-colors duration-150"
                  disabled={isLoading}
                />
              </div>

              {/* Reference Image Chooser */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
                  Reference Image (Optional)
                </label>
                <label className="border-2 border-dashed border-white/15 hover:border-accent-pink/50 rounded-xl p-4 text-center bg-white/5 transition-colors cursor-pointer group flex flex-col items-center justify-center">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isLoading}
                  />
                  {referenceImagePreview ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={referenceImagePreview}
                        alt="Reference"
                        className="w-12 h-12 rounded object-cover border border-accent-pink"
                      />
                      <div className="text-left">
                        <p className="text-xs text-white font-bold truncate max-w-[180px]">
                          {referenceImage?.name || 'Reference Image'}
                        </p>
                        <p className="text-[10px] text-accent-pink">Click to change</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-zinc-400 group-hover:text-accent-pink mx-auto mb-1 transition-colors" />
                      <p className="text-xs text-zinc-300 font-semibold">Drop face or style reference here</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">PNG, JPG up to 10MB</p>
                    </>
                  )}
                </label>
              </div>

              {/* Aspect Ratio Selector */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
                  Aspect Ratio
                </label>
                <div className="relative">
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-accent-pink appearance-none cursor-pointer"
                    disabled={isLoading}
                  >
                    <option value="16:9">16:9 (YouTube Standard - 1280×720)</option>
                    <option value="9:16">9:16 (YouTube Shorts / TikTok Vertical)</option>
                    <option value="1:1">1:1 (Square)</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={isLoading || (!videoUrl.trim() && !referenceImagePreview && !customTitle.trim())}
            className={`w-full btn-glow bg-gradient-brand text-white py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
              isLoading || (!videoUrl.trim() && !referenceImagePreview && !customTitle.trim())
                ? 'opacity-50 cursor-not-allowed pointer-events-none'
                : 'hover:scale-[1.01] cursor-pointer'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
                <span>Generating 3 Thumbnails...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-white" />
                <span>Generate 3 Thumbnails</span>
              </>
            )}
          </button>
        </div>

        {/* Right Output Results Panel */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-black/40 border border-white/10 space-y-6">
          {/* Initial State */}
          {!isLoading && !hasGenerated && (
            <div className="py-20 px-4 text-center space-y-3 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center text-accent-cyan mb-1">
                <ImageIcon className="w-6 h-6" />
              </div>
              <h5 className="text-sm font-bold text-white">Thumbnail AI Studio</h5>
              <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
                Enter your YouTube URL, select an aspect ratio, and click <strong className="text-white">Generate 3 Thumbnails</strong> to run the real AI vision pipeline.
              </p>
            </div>
          )}

          {/* Loading Shimmer */}
          {isLoading && (
            <div className="space-y-5 animate-pulse py-16 text-center">
              <div className="w-16 h-16 rounded-full border-4 border-accent-pink border-t-transparent animate-spin mx-auto mb-4"></div>
              <p className="text-sm font-bold text-accent-pink">{loadingPhase}</p>
              <div className="grid grid-cols-3 gap-3 max-w-md mx-auto pt-2">
                <div className="aspect-video bg-white/10 rounded-lg"></div>
                <div className="aspect-video bg-white/10 rounded-lg"></div>
                <div className="aspect-video bg-white/10 rounded-lg"></div>
              </div>
            </div>
          )}

          {/* Generated Thumbnails Grid */}
          {!isLoading && hasGenerated && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-bold text-white">Generated Thumbnails</h4>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-accent-purple bg-accent-purple/10 px-2.5 py-0.5 rounded-full border border-accent-purple/30">
                      <Zap className="w-3 h-3 text-accent-pink" />
                      <span>{resultData.provider}</span>
                      <span className="text-accent-cyan font-mono font-normal">({resultData.model})</span>
                    </span>
                    {resultData.groq_tier && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                        {resultData.groq_tier} Groq API
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400">Aspect Ratio: {resultData.aspect_ratio}</p>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 self-start sm:self-center">
                  Format: {resultData.aspect_ratio === '9:16' ? '720×1280' : resultData.aspect_ratio === '1:1' ? '1024×1024' : '1280×720'}
                </span>
              </div>

              <div className={`grid ${resultData.aspect_ratio === '9:16' ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'} gap-4`}>
                {resultData.thumbnails.map((item, idx) => {
                  const isSelected = selectedVersionKey === item.id;
                  const itemColor = item.accent_color || (idx === 0 ? '#FFE600' : (idx === 1 ? '#00F0FF' : '#FF3366'));
                  const itemHook = item.hook_text || resultData.hook_text || 'VIRAL HOOK';

                  return (
                    <div key={item.id} className="flex flex-col gap-2">
                      <div
                        onClick={() => setSelectedVersionKey(item.id)}
                        className={`relative rounded-xl overflow-hidden ${getAspectRatioClass(resultData.aspect_ratio)} border-2 transition-all cursor-pointer group bg-black flex items-center justify-center select-none ${
                          isSelected
                            ? 'border-accent-purple shadow-[0_0_20px_rgba(168,85,247,0.4)] scale-[1.01]'
                            : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <img
                          src={item.image_url}
                          alt={`Thumbnail ${item.id}`}
                          onError={(e) => {
                            e.currentTarget.src = resultData.video_source_frame || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1280&auto=format&fit=crop&q=80';
                          }}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />

                        {/* Dark vignette gradient */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none"></div>

                        {/* Top Badges */}
                        <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
                          <span className="bg-black/80 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/30 shadow">
                            {item.ctr_score}% CTR
                          </span>
                          <span className="bg-accent-purple text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                            {item.badge || item.concept || `Thumbnail ${item.id}`}
                          </span>
                        </div>

                        {/* Selected Indicator */}
                        {isSelected && (
                          <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-accent-purple text-white flex items-center justify-center shadow-lg">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}

                        {/* Modern YouTube Creator Viral Hook Typography Overlay */}
                        <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 pointer-events-none flex flex-col items-start select-none">
                          <div className="inline-flex items-center gap-1 mb-0.5 px-1.5 py-0.5 rounded bg-black/80 border border-white/20 shadow">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                            <span className="text-[8px] font-black uppercase tracking-wider text-white">
                              {item.badge || 'Viral'}
                            </span>
                          </div>
                          <h3
                            className="font-black text-left uppercase leading-none tracking-tight transform -rotate-1 origin-bottom-left text-lg sm:text-xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)] px-2 py-0.5 rounded bg-black/70 border border-white/10"
                            style={{
                              color: itemColor,
                              textShadow: '0 4px 10px rgba(0,0,0,0.95)',
                              fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif"
                            }}
                          >
                            {itemHook}
                          </h3>
                        </div>

                        {/* Hover Actions */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2 z-20">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewModalIndex(index);
                              setPreviewZoom(1);
                            }}
                            className="p-2 rounded-lg bg-black/80 hover:bg-black text-white border border-white/20 transition-all cursor-pointer"
                            title="Preview with Hook Text"
                          >
                            <Eye className="w-4 h-4 text-white" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(item.image_url, `Thumbnail_${item.id}`, itemHook, itemColor, item.badge || item.concept);
                            }}
                            className="p-2 rounded-lg bg-accent-purple hover:bg-accent-purple/80 text-white border border-accent-purple/40 transition-all cursor-pointer"
                            title="Download HD"
                          >
                            <Download className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      </div>

                      {/* Hook text editor */}
                      <div className="px-2 py-1.5 bg-white/[0.04] border border-white/10 rounded-lg flex items-center gap-1.5 shadow-sm">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider shrink-0">Hook:</span>
                        <input
                          type="text"
                          value={itemHook}
                          onChange={(e) => handleUpdateItemHook(item.id, e.target.value)}
                          placeholder="Edit hook text..."
                          className="w-full bg-black/40 border border-white/10 rounded px-2 py-0.5 text-[11px] text-white font-bold outline-none focus:border-accent-purple transition-all"
                        />
                      </div>

                      {/* Test in Feed Simulator Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onTestInSimulator) {
                            onTestInSimulator({
                              id: item.id,
                              title: resultData.video_title || customTitle || detectedVideo?.title || 'I Tested 10 AI Tools In 24 Hours',
                              imageUrl: item.image_url,
                              hook: itemHook,
                              color: itemColor,
                              concept: item.concept || item.badge
                            });
                          }
                        }}
                        className="w-full py-1.5 px-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm hover:scale-[1.01]"
                        title="Simulate how this thumbnail performs against competitors on YouTube feed"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>⚡ Test in Feed Simulator</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Generation Pipeline Summary Box */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2 text-xs">
                <span className="font-bold text-accent-pink uppercase tracking-wider block">
                  AI Vision & Generation Pipeline
                </span>
                <div className="grid grid-cols-2 gap-2 text-zinc-300">
                  <div>• Video Frame Extractor: <strong className="text-white">YouTube CDN Keyframe Cache</strong></div>
                  <div>• AI Engine: <strong className="text-white">{resultData.provider} ({resultData.model})</strong></div>
                  <div>• Aspect Ratio: <strong className="text-white">{resultData.aspect_ratio}</strong></div>
                  <div>• Typography Engine: <strong className="text-white">Viral Contrast Impact Hook</strong></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* High Definition Interactive Preview Lightbox Modal with Full Hook Overlay */}
      {previewModalIndex !== null && resultData.thumbnails[previewModalIndex] && (() => {
        const currItem = resultData.thumbnails[previewModalIndex];
        const currHook = (currItem.hook_text || resultData.hook_text || '').toUpperCase();
        const currColor = currItem.accent_color || '#FFE600';
        const totalThumbs = resultData.thumbnails.length;

        const handlePrevModal = (e) => {
          if (e) e.stopPropagation();
          setPreviewModalIndex((previewModalIndex - 1 + totalThumbs) % totalThumbs);
          setPreviewZoom(1);
        };

        const handleNextModal = (e) => {
          if (e) e.stopPropagation();
          setPreviewModalIndex((previewModalIndex + 1) % totalThumbs);
          setPreviewZoom(1);
        };

        return (
          <div
            className="fixed inset-0 z-50 flex bg-black/90 backdrop-blur-md items-center justify-center p-3 sm:p-6 transition-all duration-300 ease-out"
            onClick={() => setPreviewModalIndex(null)}
          >
            <div
              className={`relative ${resultData.aspect_ratio === '9:16' ? 'max-w-md' : resultData.aspect_ratio === '1:1' ? 'max-w-xl' : 'max-w-5xl'} w-full flex flex-col items-center gap-3 animate-fade-in-up`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Thumbnail Stage View Box */}
              <div className={`relative w-full ${getAspectRatioClass(resultData.aspect_ratio)} max-h-[78vh] rounded-2xl overflow-hidden border border-white/20 shadow-[0_0_50px_rgba(168,85,247,0.35)] bg-black flex items-center justify-center select-none`}>
                {/* Close Button */}
                <button
                  onClick={() => setPreviewModalIndex(null)}
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center border border-white/30 shadow-xl transition-all hover:scale-110 cursor-pointer z-40"
                  title="Close Preview"
                >
                  <X className="w-5 h-5 text-white" />
                </button>

                {/* Base Image with Zoom & Containment */}
                <img
                  src={currItem.image_url}
                  alt={`Thumbnail ${currItem.id}`}
                  style={{ transform: `scale(${previewZoom})` }}
                  className="w-full h-full object-contain transition-transform duration-200 ease-out pointer-events-none select-none"
                />

                {/* Dark Vignette Gradient for High Typography Contrast */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent pointer-events-none z-10" />

                {/* Top Badges */}
                <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                  <span className="bg-black/85 text-emerald-400 text-xs font-black px-2.5 py-1 rounded-md border border-emerald-500/40 shadow-lg">
                    {currItem.ctr_score}% CTR
                  </span>
                  <span className="bg-accent-purple text-white text-xs font-black px-2.5 py-1 rounded-md shadow-lg border border-accent-purple/50">
                    {currItem.badge || currItem.concept || `Variation ${currItem.id}`}
                  </span>
                </div>

                {/* Viral Typography Hook Overlay (Exact rendering as in export & cards) */}
                <div className="absolute bottom-5 sm:bottom-7 left-5 sm:left-7 right-5 sm:right-7 z-20 pointer-events-none flex flex-col items-start select-none">
                  {currItem.badge && (
                    <span className="mb-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded bg-red-600 text-white shadow-md">
                      {currItem.badge}
                    </span>
                  )}
                  <h2
                    className="font-black text-left uppercase leading-none tracking-tight transform -rotate-2 origin-bottom-left text-2xl sm:text-4xl md:text-5xl lg:text-6xl drop-shadow-[0_6px_20px_rgba(0,0,0,0.98)]"
                    style={{
                      color: currColor,
                      textShadow: '-3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 0 6px 18px rgba(0,0,0,0.95)',
                      fontFamily: "'Impact', 'Outfit', sans-serif"
                    }}
                  >
                    {currHook}
                  </h2>
                </div>

                {/* Side Navigation Arrows */}
                <button
                  onClick={handlePrevModal}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 shadow-lg transition-all hover:scale-110 cursor-pointer z-30"
                  title="Previous Option"
                >
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>

                <button
                  onClick={handleNextModal}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 shadow-lg transition-all hover:scale-110 cursor-pointer z-30"
                  title="Next Option"
                >
                  <ChevronRight className="w-6 h-6 text-white" />
                </button>
              </div>

              {/* Floating Bottom Toolbar: Controls & Live Hook Editor */}
              <div className="w-full flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-black/80 border border-white/20 text-white shadow-2xl backdrop-blur-md">
                {/* Variation Switcher / Counter */}
                <div className="flex items-center gap-2">
                  <span className="text-white/90 font-mono text-xs font-bold px-2 py-1 bg-white/10 rounded-md">
                    Option {currItem.id} ({previewModalIndex + 1}/{totalThumbs})
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handlePrevModal}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-accent-purple text-white transition-colors cursor-pointer"
                      title="Previous"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleNextModal}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-accent-purple text-white transition-colors cursor-pointer"
                      title="Next"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Live Hook Text Tweak Inside Modal */}
                <div className="flex-1 min-w-[200px] max-w-md flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                  <span className="text-[10px] font-black uppercase text-accent-cyan shrink-0">Live Hook:</span>
                  <input
                    type="text"
                    value={currItem.hook_text || ''}
                    onChange={(e) => handleUpdateItemHook(currItem.id, e.target.value)}
                    placeholder="Tweak hook text in preview..."
                    className="w-full bg-transparent text-xs text-white font-black uppercase outline-none"
                  />
                </div>

                {/* Zoom & Download HD Action */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewZoom((z) => Math.max(z - 0.25, 0.5))}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPreviewZoom((z) => Math.min(z + 0.25, 3.0))}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDownload(currItem.image_url, `Thumbnail_${currItem.id}`, currHook, currColor, currItem.badge || currItem.concept)}
                    className="btn-glow px-4 py-2 rounded-xl bg-gradient-brand hover:brightness-110 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg transition-all cursor-pointer"
                    title="Download High-Definition Thumbnail with Text"
                  >
                    <Download className="w-4 h-4 text-white" />
                    <span>Download HD</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ThumbnailStudio;
