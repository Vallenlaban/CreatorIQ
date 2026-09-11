import fs from "fs";
import path from "path";

export interface CleanupConfig {
  retentionHours: number;
  intervalMinutes: number;
  autoCleanupEnabled: boolean;
}

export interface CleanupLogEntry {
  id: string;
  timestamp: string;
  filesDeleted: number;
  bytesFreed: number;
  formattedFreed: string;
  reason: string;
}

export interface StorageBreakdown {
  jobsBytes: number;
  jobsFormatted: string;
  jobsCount: number;
  outputsBytes: number;
  outputsFormatted: string;
  outputsCount: number;
  tempBytes: number;
  tempFormatted: string;
  tempCount: number;
  totalBytes: number;
  totalFormatted: string;
  totalFiles: number;
}

export interface CleanupStatus {
  enabled: boolean;
  retentionHours: number;
  retentionHoursOptions: number[];
  intervalMinutes: number;
  lastCleanupTime: string | null;
  nextCleanupTime: string | null;
  totalCleanedFiles: number;
  totalCleanedBytes: number;
  totalCleanedFormatted: string;
  storage: StorageBreakdown;
  recentLogs: CleanupLogEntry[];
}

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const OUTPUTS_DIR = path.join(UPLOADS_DIR, "outputs");
const REPURPOSER_DIR = path.join(UPLOADS_DIR, "repurposer");
const JOBS_DIR = path.join(REPURPOSER_DIR, "jobs");
const TEMP_DIR = path.join(REPURPOSER_DIR, "temp");
const CONFIG_FILE = path.join(UPLOADS_DIR, "cleanup_config.json");

// Ensure base directories exist
[UPLOADS_DIR, OUTPUTS_DIR, REPURPOSER_DIR, JOBS_DIR, TEMP_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Default Configuration: 2 hours retention, check every 10 minutes
const DEFAULT_CONFIG: CleanupConfig = {
  retentionHours: 2,
  intervalMinutes: 10,
  autoCleanupEnabled: true
};

let currentConfig: CleanupConfig = { ...DEFAULT_CONFIG };
let lastCleanupTime: string | null = null;
let nextCleanupTime: string | null = null;
let totalCleanedFiles = 0;
let totalCleanedBytes = 0;
const recentLogs: CleanupLogEntry[] = [];
let cleanupIntervalTimer: NodeJS.Timeout | null = null;

// External callback to purge in-memory jobs when folders are deleted
let onJobDeletedCallback: ((jobId: string) => void) | null = null;

export function setOnJobDeletedCallback(cb: (jobId: string) => void) {
  onJobDeletedCallback = cb;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Load persisted configuration if exists
export function loadCleanupConfig(): CleanupConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (typeof parsed.retentionHours === "number" && parsed.retentionHours > 0) {
        currentConfig.retentionHours = parsed.retentionHours;
      }
      if (typeof parsed.intervalMinutes === "number" && parsed.intervalMinutes > 0) {
        currentConfig.intervalMinutes = parsed.intervalMinutes;
      }
      if (typeof parsed.autoCleanupEnabled === "boolean") {
        currentConfig.autoCleanupEnabled = parsed.autoCleanupEnabled;
      }
    }
  } catch (err) {
    console.warn("[CleanupManager] Failed to load cleanup_config.json, using defaults:", err);
  }
  return currentConfig;
}

export function saveCleanupConfig(config: Partial<CleanupConfig>): CleanupConfig {
  if (typeof config.retentionHours === "number" && config.retentionHours > 0) {
    currentConfig.retentionHours = Math.max(1, Math.min(168, config.retentionHours));
  }
  if (typeof config.intervalMinutes === "number" && config.intervalMinutes > 0) {
    currentConfig.intervalMinutes = Math.max(1, Math.min(1440, config.intervalMinutes));
  }
  if (typeof config.autoCleanupEnabled === "boolean") {
    currentConfig.autoCleanupEnabled = config.autoCleanupEnabled;
  }

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), "utf-8");
    console.log(`[CleanupManager] Updated config: retention=${currentConfig.retentionHours}h, interval=${currentConfig.intervalMinutes}m`);
  } catch (err) {
    console.warn("[CleanupManager] Failed to save cleanup_config.json:", err);
  }

  // Re-schedule timer if interval changed
  scheduleNextCleanup();
  return currentConfig;
}

function getDirectorySizeAndCount(dirPath: string): { bytes: number; count: number } {
  let bytes = 0;
  let count = 0;

  if (!fs.existsSync(dirPath)) {
    return { bytes: 0, count: 0 };
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          const sub = getDirectorySizeAndCount(fullPath);
          bytes += sub.bytes;
          count += sub.count;
        } else if (entry.isFile()) {
          const stat = fs.statSync(fullPath);
          bytes += stat.size;
          count += 1;
        }
      } catch {
        // ignore files in transient states
      }
    }
  } catch {
    // ignore
  }

  return { bytes, count };
}

export function calculateStorageBreakdown(): StorageBreakdown {
  const jobs = getDirectorySizeAndCount(JOBS_DIR);
  const outputs = getDirectorySizeAndCount(OUTPUTS_DIR);
  const temp = getDirectorySizeAndCount(TEMP_DIR);

  let jobsCountFolders = 0;
  if (fs.existsSync(JOBS_DIR)) {
    try {
      jobsCountFolders = fs.readdirSync(JOBS_DIR).filter((f) => {
        try {
          return fs.statSync(path.join(JOBS_DIR, f)).isDirectory();
        } catch {
          return false;
        }
      }).length;
    } catch {}
  }

  const totalBytes = jobs.bytes + outputs.bytes + temp.bytes;
  const totalFiles = jobs.count + outputs.count + temp.count;

  return {
    jobsBytes: jobs.bytes,
    jobsFormatted: formatBytes(jobs.bytes),
    jobsCount: jobsCountFolders,
    outputsBytes: outputs.bytes,
    outputsFormatted: formatBytes(outputs.bytes),
    outputsCount: outputs.count,
    tempBytes: temp.bytes,
    tempFormatted: formatBytes(temp.bytes),
    tempCount: temp.count,
    totalBytes,
    totalFormatted: formatBytes(totalBytes),
    totalFiles
  };
}

export function getCleanupStatus(): CleanupStatus {
  return {
    enabled: currentConfig.autoCleanupEnabled,
    retentionHours: currentConfig.retentionHours,
    retentionHoursOptions: [1, 2, 3, 4, 6, 12, 24],
    intervalMinutes: currentConfig.intervalMinutes,
    lastCleanupTime,
    nextCleanupTime,
    totalCleanedFiles,
    totalCleanedBytes,
    totalCleanedFormatted: formatBytes(totalCleanedBytes),
    storage: calculateStorageBreakdown(),
    recentLogs: recentLogs.slice(-15).reverse()
  };
}

/**
 * Executes a full cleanup scan across all uploads directories:
 * - uploads/repurposer/jobs/* (deletes job folders older than retention)
 * - uploads/repurposer/temp/* (deletes temp upload files older than 1 hour or retention)
 * - uploads/outputs/* (deletes thumbnails and frame images older than retention)
 */
export function executeCleanup(options?: {
  forceAll?: boolean;
  olderThanHours?: number;
  reason?: string;
}): {
  filesDeleted: number;
  bytesFreed: number;
  formattedFreed: string;
  storage: StorageBreakdown;
} {
  const now = Date.now();
  const hours = options?.olderThanHours !== undefined ? options.olderThanHours : currentConfig.retentionHours;
  const maxAgeMs = (options?.forceAll ? 0 : hours * 3600 * 1000);
  const tempMaxAgeMs = (options?.forceAll ? 0 : Math.min(maxAgeMs, 1 * 3600 * 1000)); // Temp files max 1 hour

  let filesDeleted = 0;
  let bytesFreed = 0;

  console.log(`[CleanupManager] Starting cleanup scan (Threshold: ${options?.forceAll ? "FORCE ALL" : `${hours} hours`})...`);

  // 1. Clean uploads/repurposer/jobs
  if (fs.existsSync(JOBS_DIR)) {
    try {
      const jobFolders = fs.readdirSync(JOBS_DIR);
      for (const folder of jobFolders) {
        const folderPath = path.join(JOBS_DIR, folder);
        try {
          const stats = fs.statSync(folderPath);
          if (stats.isDirectory()) {
            const ageMs = now - stats.mtimeMs;
            let shouldDelete = options?.forceAll || ageMs > maxAgeMs;

            // Also check job.json expiresAt or createdAt if present
            const jobJsonPath = path.join(folderPath, "job.json");
            if (!shouldDelete && fs.existsSync(jobJsonPath)) {
              try {
                const jobData = JSON.parse(fs.readFileSync(jobJsonPath, "utf-8"));
                if (jobData.createdAt && (now - jobData.createdAt > maxAgeMs)) {
                  shouldDelete = true;
                }
                if (jobData.expiresAt && now > jobData.expiresAt) {
                  shouldDelete = true;
                }
              } catch {
                // ignore
              }
            }

            if (shouldDelete) {
              const folderStats = getDirectorySizeAndCount(folderPath);
              fs.rmSync(folderPath, { recursive: true, force: true });
              bytesFreed += folderStats.bytes;
              filesDeleted += Math.max(1, folderStats.count);
              console.log(`[CleanupManager] Deleted expired job folder '${folder}' (${formatBytes(folderStats.bytes)}, age: ${(ageMs / (3600 * 1000)).toFixed(1)}h)`);

              if (onJobDeletedCallback) {
                try {
                  onJobDeletedCallback(folder);
                } catch (e) {
                  console.warn("[CleanupManager] Error in onJobDeletedCallback:", e);
                }
              }
            }
          }
        } catch (err) {
          console.warn(`[CleanupManager] Error processing job folder ${folder}:`, err);
        }
      }
    } catch (err) {
      console.warn("[CleanupManager] Error scanning JOBS_DIR:", err);
    }
  }

  // 2. Clean uploads/repurposer/temp
  if (fs.existsSync(TEMP_DIR)) {
    try {
      const tempFiles = fs.readdirSync(TEMP_DIR);
      for (const file of tempFiles) {
        const filePath = path.join(TEMP_DIR, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            const ageMs = now - stats.mtimeMs;
            if (options?.forceAll || ageMs > tempMaxAgeMs) {
              const size = stats.size;
              fs.unlinkSync(filePath);
              bytesFreed += size;
              filesDeleted += 1;
              console.log(`[CleanupManager] Deleted orphaned temp file '${file}' (${formatBytes(size)})`);
            }
          }
        } catch (err) {
          console.warn(`[CleanupManager] Error removing temp file ${file}:`, err);
        }
      }
    } catch (err) {
      console.warn("[CleanupManager] Error scanning TEMP_DIR:", err);
    }
  }

  // 3. Clean uploads/outputs (Generated thumbnails, uploaded custom frames, cached yt_ref frames)
  if (fs.existsSync(OUTPUTS_DIR)) {
    try {
      const outputFiles = fs.readdirSync(OUTPUTS_DIR);
      for (const file of outputFiles) {
        // Skip hidden files
        if (file.startsWith(".")) continue;
        const filePath = path.join(OUTPUTS_DIR, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            const ageMs = now - stats.mtimeMs;
            if (options?.forceAll || ageMs > maxAgeMs) {
              const size = stats.size;
              fs.unlinkSync(filePath);
              bytesFreed += size;
              filesDeleted += 1;
              console.log(`[CleanupManager] Deleted expired output file '${file}' (${formatBytes(size)}, age: ${(ageMs / (3600 * 1000)).toFixed(1)}h)`);
            }
          }
        } catch (err) {
          console.warn(`[CleanupManager] Error removing output file ${file}:`, err);
        }
      }
    } catch (err) {
      console.warn("[CleanupManager] Error scanning OUTPUTS_DIR:", err);
    }
  }

  lastCleanupTime = new Date().toISOString();
  totalCleanedFiles += filesDeleted;
  totalCleanedBytes += bytesFreed;

  const formattedFreed = formatBytes(bytesFreed);

  // Record log entry
  const logEntry: CleanupLogEntry = {
    id: `clean_${Date.now()}`,
    timestamp: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    filesDeleted,
    bytesFreed,
    formattedFreed,
    reason: options?.reason || (options?.forceAll ? "Pembersihan Manual (Semua)" : `Pembersihan otomatis (> ${hours} jam)`)
  };
  recentLogs.push(logEntry);
  if (recentLogs.length > 50) {
    recentLogs.shift();
  }

  console.log(`[CleanupManager] Cleanup finished: ${filesDeleted} files removed, ${formattedFreed} disk space freed.`);

  const storage = calculateStorageBreakdown();
  scheduleNextCleanup();

  return {
    filesDeleted,
    bytesFreed,
    formattedFreed,
    storage
  };
}

function scheduleNextCleanup() {
  if (cleanupIntervalTimer) {
    clearTimeout(cleanupIntervalTimer);
    cleanupIntervalTimer = null;
  }

  if (!currentConfig.autoCleanupEnabled) {
    nextCleanupTime = null;
    return;
  }

  const delayMs = currentConfig.intervalMinutes * 60 * 1000;
  nextCleanupTime = new Date(Date.now() + delayMs).toISOString();

  cleanupIntervalTimer = setTimeout(() => {
    try {
      executeCleanup({ reason: `Pembersihan otomatis terjadwal (> ${currentConfig.retentionHours} jam)` });
    } catch (err) {
      console.error("[CleanupManager] Auto-cleanup execution error:", err);
      scheduleNextCleanup();
    }
  }, delayMs);
}

/**
 * Initialize Cleanup Manager on server startup
 */
export function initCleanupManager(jobDeleteHook?: (jobId: string) => void) {
  loadCleanupConfig();
  if (jobDeleteHook) {
    setOnJobDeletedCallback(jobDeleteHook);
  }

  console.log(`[CleanupManager] Initialized: Auto-cleanup every ${currentConfig.intervalMinutes}m, retention threshold: ${currentConfig.retentionHours}h`);

  // Run an initial lightweight cleanup scan on startup for expired files from past runs
  setTimeout(() => {
    executeCleanup({ reason: "Pembersihan saat server startup" });
  }, 5000);

  scheduleNextCleanup();
}
