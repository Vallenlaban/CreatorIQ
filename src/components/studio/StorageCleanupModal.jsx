import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Clock,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Database,
  Sparkles,
  ShieldCheck,
  X,
  FileVideo,
  Image,
  FolderOpen
} from 'lucide-react';

export const StorageCleanupModal = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Fetch cleanup status
  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/cleanup/status');
      if (res.ok) {
        const data = await res.json();
        setCleanupStatus(data);
      }
    } catch (err) {
      console.warn('Failed to load cleanup status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setSuccessMessage(null);
      setErrorMessage(null);
    }
  }, [isOpen]);

  // Handle changing retention hours
  const handleUpdateRetention = async (hours) => {
    try {
      setActionLoading(true);
      setSuccessMessage(null);
      setErrorMessage(null);

      const res = await fetch('/api/cleanup/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionHours: hours })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCleanupStatus(data.status);
        setSuccessMessage(`✓ Settings saved: Files will be cleaned automatically after ${hours} hours.`);
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setErrorMessage(data.message || 'Failed to save settings.');
      }
    } catch (err) {
      setErrorMessage('Terjadi kesalahan jaringan.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle immediate manual cleanup
  const handleRunCleanup = async (forceAll = false) => {
    try {
      setActionLoading(true);
      setSuccessMessage(null);
      setErrorMessage(null);

      const res = await fetch('/api/cleanup/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forceAll,
          reason: forceAll ? 'Manual cleanup of all cache files' : 'Manual cleanup of expired files'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMessage(
          `✓ Cleanup successful! ${data.filesDeleted} files deleted (${data.formattedFreed} space freed).`
        );
        fetchStatus();
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setErrorMessage(data.message || 'Failed to run cleanup.');
      }
    } catch (err) {
      setErrorMessage('An error occurred while running cleanup.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  const storage = cleanupStatus?.storage || {
    totalFormatted: '0 B',
    totalBytes: 0,
    totalFiles: 0,
    jobsFormatted: '0 B',
    jobsCount: 0,
    outputsFormatted: '0 B',
    outputsCount: 0,
    tempFormatted: '0 B'
  };

  const retentionHours = cleanupStatus?.retentionHours || 2;
  const retentionOptions = cleanupStatus?.retentionHoursOptions || [1, 2, 4, 6, 12, 24];

  // Calculate approximate next cleanup minutes
  let nextMinutes = null;
  if (cleanupStatus?.nextCleanupTime) {
    const diffMs = new Date(cleanupStatus.nextCleanupTime).getTime() - Date.now();
    nextMinutes = Math.max(1, Math.round(diffMs / 60000));
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-2xl bg-bg-card/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-purple/20 border border-accent-purple/40 flex items-center justify-center text-accent-purple shadow-inner">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-outfit font-bold text-lg text-white">
                  Automatic Cleanup & Storage
                </h3>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Auto-Active
                </span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Automatic management for MP4 videos, 9:16 Shorts clips, and AI thumbnails
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Notification Messages */}
          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2.5 animate-slide-up">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5 animate-slide-up">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Storage Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                <span>Storage Used</span>
                <Database className="w-3.5 h-3.5 text-accent-cyan" />
              </div>
              <div className="text-2xl font-bold font-outfit text-white tracking-tight">
                {storage.totalFormatted}
              </div>
              <div className="text-[11px] text-text-muted mt-1">
                {storage.totalFiles} total files on server
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                <span>Auto-Clean Schedule</span>
                <Clock className="w-3.5 h-3.5 text-accent-purple" />
              </div>
              <div className="text-2xl font-bold font-outfit text-white tracking-tight">
                {nextMinutes ? `~${nextMinutes} Minutes` : 'Every 10m'}
              </div>
              <div className="text-[11px] text-text-muted mt-1">
                Periodic checks are running
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                <span>Total Freed</span>
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-outfit text-emerald-400 tracking-tight">
                {cleanupStatus?.totalCleanedFormatted || '0 B'}
              </div>
              <div className="text-[11px] text-text-muted mt-1">
                {cleanupStatus?.totalCleanedFiles || 0} expired files cleaned
              </div>
            </div>
          </div>

          {/* Storage Breakdown Details */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-text-secondary">
              <span>Storage Folder Details</span>
              <span className="text-[11px] text-text-muted">uploads/</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02]">
                <FileVideo className="w-4 h-4 text-accent-purple flex-shrink-0" />
                <div className="truncate">
                  <div className="text-text-muted text-[10px]">Shorts Videos & Clips</div>
                  <div className="font-semibold text-white">{storage.jobsFormatted}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02]">
                <Image className="w-4 h-4 text-accent-cyan flex-shrink-0" />
                <div className="truncate">
                  <div className="text-text-muted text-[10px]">Thumbnails & Frames</div>
                  <div className="font-semibold text-white">{storage.outputsFormatted}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02]">
                <FolderOpen className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div className="truncate">
                  <div className="text-text-muted text-[10px]">Temporary Uploads</div>
                  <div className="font-semibold text-white">{storage.tempFormatted}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Retention Configuration Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-accent-cyan" />
                  Automatic Storage Duration (Retention Time)
                </label>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Files older than this duration will be permanently cleaned from the server.
                </p>
              </div>
            </div>

            {/* Retention Pills */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {retentionOptions.map((hours) => {
                const isSelected = retentionHours === hours;
                return (
                  <button
                    key={hours}
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleUpdateRetention(hours)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-medium transition-all flex flex-col items-center justify-center gap-0.5 ${
                      isSelected
                        ? 'bg-gradient-to-r from-accent-purple to-accent-cyan text-white border-transparent shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                        : 'bg-white/[0.02] border-white/10 text-text-secondary hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    <span className="font-bold">{hours} Hours</span>
                    {hours === 2 && (
                      <span className={`text-[9px] ${isSelected ? 'text-white/80' : 'text-accent-cyan font-semibold'}`}>
                        Recommended
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Manual Action Section */}
          <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-text-muted flex items-center gap-1.5 w-full sm:w-auto">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Automatic cleanup runs every 10 minutes in the background.</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleRunCleanup(false)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-accent-purple/20 hover:bg-accent-purple/30 text-accent-purple border border-accent-purple/30 text-xs font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {actionLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Clean Expired Files</span>
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={() => {
                  if (window.confirm('Clean all cache files and temporary videos now?')) {
                    handleRunCleanup(true);
                  }
                }}
                className="w-full sm:w-auto px-3 py-2.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-text-muted hover:text-rose-300 border border-white/10 hover:border-rose-500/30 text-xs font-medium transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                title="Delete all video and thumbnail cache immediately"
              >
                <span>Reset Total</span>
              </button>
            </div>
          </div>

          {/* Recent Cleanup Logs */}
          {cleanupStatus?.recentLogs && cleanupStatus.recentLogs.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted flex items-center justify-between">
                <span>Recent Cleanup History</span>
                <button
                  type="button"
                  onClick={fetchStatus}
                  className="text-accent-cyan hover:underline flex items-center gap-1 text-[10px]"
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="max-h-32 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-black/40 border border-white/5 font-mono text-[11px]">
                {cleanupStatus.recentLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between text-text-muted hover:text-text-secondary py-0.5">
                    <span className="flex items-center gap-2">
                      <span className="text-white/40">[{log.timestamp}]</span>
                      <span className="text-white/80">{log.reason}</span>
                    </span>
                    <span className="text-emerald-400 font-medium">
                      {log.filesDeleted > 0 ? `+${log.formattedFreed} (${log.filesDeleted} files)` : '0 B (clean)'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-white/[0.01] flex items-center justify-between text-xs text-text-muted">
          <span>CreatorIQ Storage Maintenance Engine v2.0</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default StorageCleanupModal;
