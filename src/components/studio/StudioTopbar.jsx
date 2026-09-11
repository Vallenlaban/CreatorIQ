import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, User, HardDrive, Sparkles } from 'lucide-react';
import StorageCleanupModal from './StorageCleanupModal';

export const StudioTopbar = () => {
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);
  const [retentionHours, setRetentionHours] = useState(2);

  useEffect(() => {
    fetch('/api/cleanup/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.retentionHours) {
          setRetentionHours(data.retentionHours);
        }
      })
      .catch(() => {});
  }, [isCleanupModalOpen]);

  return (
    <>
      <header className="w-full bg-bg-deep/90 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50 px-4 sm:px-8 py-4 flex items-center justify-between shadow-2xl">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-full bg-gradient-brand flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.5)] group-hover:scale-105 transition-transform">
            <Play className="w-5 h-5 text-white ml-0.5 fill-current" />
          </div>
          <div>
            <span className="font-outfit font-bold text-xl tracking-tight text-white">
              Creator<span className="text-transparent bg-clip-text bg-gradient-brand">IQ</span>
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {/* Real Auto-Cleanup & Storage Trigger */}
          <button
            onClick={() => setIsCleanupModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-accent-purple/40 text-xs font-medium text-text-secondary hover:text-white transition-all group"
            title="Manage Automatic Cleanup & Server Storage"
          >
            <HardDrive className="w-3.5 h-3.5 text-accent-cyan group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">Auto-Clean:</span>
            <span className="text-white font-semibold">{retentionHours} Hours</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </button>

          {/* Guest Profile Circle */}
          <div
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#00a2ff] flex items-center justify-center text-white shadow-lg border border-white/20 select-none pointer-events-none cursor-default"
            title="Account"
          >
            <User className="w-5 h-5 text-white" />
          </div>
        </div>
      </header>

      {/* Storage & Auto Cleanup Modal */}
      <StorageCleanupModal
        isOpen={isCleanupModalOpen}
        onClose={() => setIsCleanupModalOpen(false)}
      />
    </>
  );
};

export default StudioTopbar;
