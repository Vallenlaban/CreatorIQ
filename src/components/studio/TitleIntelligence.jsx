import React, { useState } from 'react';
import { Sparkles, Copy, Check, Youtube, AlertCircle, Zap, Globe } from 'lucide-react';

export const TitleIntelligence = () => {
  const [titleInput, setTitleInput] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [result, setResult] = useState({
    opportunityScore: 90,
    potentialText: 'Viral Potential',
    reasons: [],
    recommendations: [],
    provider: '',
    youtubeStatus: ''
  });

  const handleAnalyze = async () => {
    if (!titleInput.trim() || isLoading) return;

    setIsLoading(true);
    setHasSearched(false);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/title/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title_input: titleInput.trim(),
          channel_url: channelUrl.trim() || undefined
        })
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to generate title intelligence.');
      }

      // Map response to component state
      const titlesList = data.titles || data.recommendations || [];
      const bestScore = Math.max(...titlesList.map((t) => t.score || 0), 0);

      const formattedRecommendations = titlesList.map((item, index) => ({
        id: item.id || index + 1,
        title: item.title,
        score: item.score || 85,
        isBest: item.isBest ?? (item.score === bestScore)
      }));

      setResult({
        opportunityScore: data.opportunity_score || 88,
        potentialText: data.potential_text || (data.opportunity_score >= 90 ? 'Viral Potential' : 'High Potential'),
        reasons: data.reasons || [
          'Strong audience search intent',
          'High curiosity potential and psychological hook',
          'Clear content promise',
          'Proven format that drives high CTR'
        ],
        recommendations: formattedRecommendations,
        provider: data.provider || 'AI Engine',
        youtubeStatus: data.youtube_status || 'Connected'
      });

      setHasSearched(true);
    } catch (err) {
      console.error('Error analyzing title:', err);
      setErrorMessage(err.message || 'Unable to connect to the Title Intelligence service.');
      setHasSearched(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAnalyze();
    }
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div>
        <span className="text-xs font-bold uppercase tracking-widest text-accent-purple bg-accent-purple/10 px-3 py-1 rounded-full border border-accent-purple/20">
          Feature 1
        </span>
        <h3 className="font-outfit text-2xl font-extrabold text-white mt-2">Title Generator</h3>
      </div>

      <div className="flex flex-col gap-8">
        {/* Input Card */}
        <div className="p-6 rounded-2xl bg-black/40 border border-white/10 space-y-6 flex flex-col justify-between">
          <div className="space-y-3 text-center">
            <h4 className="text-xl sm:text-2xl font-bold text-white">Viral Title Generator</h4>
            <p className="text-sm text-zinc-300 leading-relaxed max-w-xl mx-auto">
              Paste your video title. AI will analyze it and generate high-clicking variations instantly.
            </p>

            <div className="space-y-4 pt-2 text-left">
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
                  Video Title
                </label>
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Aku membuat sebuah perahu"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent-purple transition-colors duration-150"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Youtube className="w-4 h-4 text-red-500 fill-current shrink-0" />
                  <span>Reference channels for style inspiration (Optional)</span>
                </label>
                <input
                  type="text"
                  value={channelUrl}
                  onChange={(e) => setChannelUrl(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="https://youtube.com/@creator"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-accent-purple transition-colors duration-150"
                  disabled={isLoading}
                />
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
            onClick={handleAnalyze}
            disabled={!titleInput.trim() || isLoading}
            className={`w-full btn-glow bg-gradient-brand text-white py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
              !titleInput.trim() || isLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'hover:scale-[1.01] cursor-pointer'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
                <span>Analyzing Title...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-white" />
                <span>Analyze Title</span>
              </>
            )}
          </button>
        </div>

        {/* Output Card */}
        <div className="p-6 rounded-2xl bg-black/40 border border-white/10 space-y-6">
          {/* Initial Empty State */}
          {!isLoading && !hasSearched && !errorMessage && (
            <div className="py-12 px-4 text-center space-y-3 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-accent-pink/10 border border-accent-pink/30 flex items-center justify-center text-accent-pink mb-1">
                <Sparkles className="w-6 h-6" />
              </div>
              <h5 className="text-sm font-bold text-white">Title Analysis Ready</h5>
              <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
                Fill in your Video Title above and click <strong className="text-white">Analyze Title</strong> to generate high-CTR titles and AI insights.
              </p>
            </div>
          )}

          {/* Loading State Shimmer */}
          {isLoading && (
            <div className="space-y-4 animate-pulse py-8 text-center">
              <div className="w-16 h-16 rounded-full border-4 border-accent-purple border-t-transparent animate-spin mx-auto mb-4"></div>
              <p className="text-sm font-bold text-accent-purple">Analyzing YouTube Search Volume & Competitors...</p>
              <div className="h-4 bg-white/10 rounded w-3/4 mx-auto"></div>
              <div className="h-4 bg-white/10 rounded w-1/2 mx-auto"></div>
            </div>
          )}

          {/* Result Container */}
          {!isLoading && hasSearched && (
            <div className="space-y-6 animate-fade-in-up">
              {/* Score Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Opportunity Score</span>
                    {result.provider && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-accent-purple bg-accent-purple/10 px-2 py-0.5 rounded-full border border-accent-purple/30">
                        <Zap className="w-3 h-3" />
                        {result.provider}
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-black text-white mt-0.5">{result.potentialText}</p>
                </div>
                <div className="relative w-16 h-16 rounded-full bg-accent-purple/20 border-2 border-accent-purple flex items-center justify-center text-accent-purple font-black text-lg shadow-[0_0_15px_rgba(168,85,247,0.4)] self-start sm:self-center shrink-0">
                  <span>{result.opportunityScore}</span>
                  <span className="text-xs font-normal">/100</span>
                </div>
              </div>

              {/* Reasons */}
              {result.reasons && result.reasons.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Reason Analysis</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {result.reasons.map((reason, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold flex items-center gap-2">
                        <span className="text-emerald-300 font-bold shrink-0">✓</span>
                        <span className="leading-snug">{reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommended Titles */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Recommended Titles</h5>

                {result.recommendations.map((rec) => {
                  const isCopied = copiedId === rec.id;
                  if (rec.isBest) {
                    return (
                      <div
                        key={rec.id}
                        className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-accent-purple/20 via-accent-pink/10 to-transparent border-2 border-accent-purple shadow-[0_0_20px_rgba(168,85,247,0.3)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="flex flex-col items-center justify-center min-w-[48px] px-2 py-1 rounded-lg bg-accent-purple/20 border border-accent-purple/40 shrink-0">
                            <span className="text-base sm:text-lg font-black text-accent-purple leading-none">{rec.score}</span>
                            <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wider mt-0.5">SCORE</span>
                          </div>
                          <div className="space-y-1 min-w-0">
                            <span className="inline-block text-[10px] bg-gradient-brand text-white font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider shadow">Best Title</span>
                            <p className="text-xs sm:text-sm font-extrabold text-white leading-snug break-words">{rec.title}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleCopy(rec.id, rec.title)}
                          className="self-start sm:self-center flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-bold text-white transition-all cursor-pointer shrink-0"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-300" />}
                          <span>{isCopied ? 'Copied' : 'Copy Title'}</span>
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={rec.id}
                      className="p-3.5 sm:p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex flex-col items-center justify-center min-w-[48px] px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                          <span className="text-base sm:text-lg font-black text-emerald-400 leading-none">{rec.score}</span>
                          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mt-0.5">SCORE</span>
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-zinc-200 leading-snug break-words">{rec.title}</p>
                      </div>
                      <button
                        onClick={() => handleCopy(rec.id, rec.title)}
                        className="self-start sm:self-center flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-bold text-white transition-all cursor-pointer shrink-0"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-300" />}
                        <span>{isCopied ? 'Copied' : 'Copy Title'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TitleIntelligence;
