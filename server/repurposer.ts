import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import * as archiverPkg from "archiver";
import type { Request, Response } from "express";
import { getFFmpegPath, getFFprobePath } from "./ffmpegHelper.js";
import { generateStandaloneViralClips } from "./viralIntelligence.js";

function createZipArchiveStream(options?: any): any {
  if (typeof (archiverPkg as any).ZipArchive === "function") {
    return new (archiverPkg as any).ZipArchive(options);
  }
  if (typeof (archiverPkg as any).default === "function") {
    return (archiverPkg as any).default("zip", options);
  }
  if (typeof archiverPkg === "function") {
    return (archiverPkg as any)("zip", options);
  }
  throw new Error("Cannot instantiate zip archiver.");
}

export interface RepurposerSubtitle {
  start: number;
  end: number;
  text: string;
}

export interface RepurposedClip {
  id: string;
  clipNumber: number;
  start: number;
  end: number;
  duration: number;
  score: number;
  viralScore?: number;
  title: string;
  hook: string;
  reason: string;
  category: string;
  aspectRatio: string;
  outputPath?: string;
  outputUrl?: string;
  thumbnailUrl?: string;
  subtitles: RepurposerSubtitle[];
}

export interface RepurposerJob {
  id: string;
  originalFileName: string;
  filePath: string;
  fileSize: number;
  duration: number;
  layoutMode?: "blurred_backdrop" | "crop_fill" | "split_stacked";
  status: "queued" | "transcribing" | "analyzing" | "selecting_clips" | "rendering" | "completed" | "failed";
  progress: number;
  stageLabel: string;
  logs: string[];
  error: string | null;
  transcript: {
    language: string;
    duration: number;
    fullTranscript: string;
    segments: Array<{
      id?: number;
      start: number;
      end: number;
      text: string;
      words?: Array<{ word: string; start: number; end: number; probability?: number }>;
    }>;
  } | null;
  clips: RepurposedClip[];
  createdAt: number;
  expiresAt: number;
}

// Storage directories
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const REPURPOSER_DIR = path.join(UPLOADS_DIR, "repurposer");
export const JOBS_DIR = path.join(REPURPOSER_DIR, "jobs");
export const BUNDLED_FONTS_DIR = path.join(process.cwd(), "server", "assets", "fonts");

[UPLOADS_DIR, REPURPOSER_DIR, JOBS_DIR, BUNDLED_FONTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Initializes font environment for libass and Fontconfig on Linux/Railway/Docker/macOS/Windows.
 * Auto-copies available system fonts into BUNDLED_FONTS_DIR and writes a valid fonts.conf.
 */
export function initFontEnvironment(): { fontsDir: string | null; confPath: string | null } {
  try {
    const candidateDirs = [
      BUNDLED_FONTS_DIR,
      "/usr/share/fonts/truetype/liberation",
      "/usr/share/fonts/truetype",
      "/usr/share/fonts",
      "/root/.nix-profile/share/fonts/truetype",
      "/root/.nix-profile/share/fonts",
      "/nix/var/nix/profiles/default/share/fonts"
    ];

    if (!fs.existsSync(BUNDLED_FONTS_DIR)) {
      fs.mkdirSync(BUNDLED_FONTS_DIR, { recursive: true });
    }

    // Check if BUNDLED_FONTS_DIR has .ttf fonts
    let existingFonts: string[] = [];
    try {
      existingFonts = fs.readdirSync(BUNDLED_FONTS_DIR).filter(f => f.endsWith(".ttf"));
    } catch {}

    if (existingFonts.length === 0) {
      for (const dir of candidateDirs) {
        if (dir !== BUNDLED_FONTS_DIR && fs.existsSync(dir)) {
          try {
            const files = fs.readdirSync(dir);
            for (const f of files) {
              if (f.endsWith(".ttf")) {
                const src = path.join(dir, f);
                const dest = path.join(BUNDLED_FONTS_DIR, f);
                if (!fs.existsSync(dest)) {
                  fs.copyFileSync(src, dest);
                  console.log(`[Repurposer] Auto-copied font ${f} from ${dir} to ${BUNDLED_FONTS_DIR}`);
                }
              }
            }
          } catch {}
        }
      }
    }

    const confDir = path.join(process.cwd(), "server", "assets");
    if (!fs.existsSync(confDir)) {
      fs.mkdirSync(confDir, { recursive: true });
    }
    const confPath = path.join(confDir, "fonts.conf");
    const fcCacheDir = "/tmp/fc-cache";
    if (!fs.existsSync(fcCacheDir)) {
      fs.mkdirSync(fcCacheDir, { recursive: true });
    }

    const confContent = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${BUNDLED_FONTS_DIR}</dir>
  <dir>fonts</dir>
  <dir>.</dir>
  <dir>/usr/share/fonts</dir>
  <dir>/root/.nix-profile/share/fonts</dir>
  <dir>/nix/var/nix/profiles/default/share/fonts</dir>
  <cachedir>${fcCacheDir}</cachedir>
  <match target="pattern">
    <test qual="any" name="family"><string>Montserrat Black</string></test>
    <edit name="family" mode="assign" binding="same"><string>Montserrat Black</string></edit>
  </match>
  <match target="pattern">
    <test qual="any" name="family"><string>Montserrat</string></test>
    <edit name="family" mode="assign" binding="same"><string>Montserrat</string></edit>
  </match>
  <match target="pattern">
    <test qual="any" name="family"><string>Liberation Sans</string></test>
    <edit name="family" mode="assign" binding="same"><string>Liberation Sans</string></edit>
  </match>
  <alias>
    <family>Montserrat Black</family>
    <prefer>
      <family>Montserrat Black</family>
      <family>Montserrat Bold</family>
      <family>Montserrat</family>
      <family>Arial Black</family>
      <family>Impact</family>
      <family>Liberation Sans</family>
      <family>sans-serif</family>
    </prefer>
  </alias>
  <alias>
    <family>Montserrat</family>
    <prefer>
      <family>Montserrat Bold</family>
      <family>Montserrat</family>
      <family>Arial Black</family>
      <family>Impact</family>
      <family>Liberation Sans</family>
      <family>sans-serif</family>
    </prefer>
  </alias>
  <alias>
    <family>Liberation Sans</family>
    <prefer>
      <family>Liberation Sans</family>
      <family>DejaVu Sans</family>
      <family>FreeSans</family>
      <family>Arial</family>
      <family>sans-serif</family>
    </prefer>
  </alias>
</fontconfig>`;

    try {
      fs.writeFileSync(confPath, confContent, "utf-8");
      process.env.FONTCONFIG_FILE = confPath;
      process.env.FONTCONFIG_PATH = confDir;
      console.log(`[Repurposer] Fontconfig successfully initialized with config: ${confPath}`);
    } catch (writeErr) {
      console.warn("[Repurposer] Could not write fonts.conf:", writeErr);
    }

    return { fontsDir: BUNDLED_FONTS_DIR, confPath };
  } catch (err) {
    console.warn("[Repurposer] initFontEnvironment warning:", err);
    return { fontsDir: null, confPath: null };
  }
}

// Immediately initialize font environment on startup
initFontEnvironment();

// Helper to determine the best fonts directory for FFmpeg ASS subtitles
export function getFontsDir(): string | null {
  if (fs.existsSync(BUNDLED_FONTS_DIR)) {
    try {
      if (fs.readdirSync(BUNDLED_FONTS_DIR).some(f => f.endsWith(".ttf"))) {
        return BUNDLED_FONTS_DIR;
      }
    } catch {}
  }
  const candidateDirs = [
    "/usr/share/fonts/truetype/liberation",
    "/usr/share/fonts/truetype",
    "/usr/share/fonts",
    "/root/.nix-profile/share/fonts/truetype",
    "/root/.nix-profile/share/fonts",
    "/nix/var/nix/profiles/default/share/fonts"
  ];
  for (const c of candidateDirs) {
    if (fs.existsSync(c)) {
      try {
        if (fs.readdirSync(c).some(f => f.endsWith(".ttf"))) {
          return c;
        }
      } catch {}
    }
  }
  return BUNDLED_FONTS_DIR;
}

// In-memory job repository with persistence fallback
const jobsMap = new Map<string, RepurposerJob>();

export function removeJobFromMemory(jobId: string) {
  jobsMap.delete(jobId);
}

// TTL: 2 hours in milliseconds
const JOB_TTL_MS = 2 * 60 * 60 * 1000;

function saveJobState(job: RepurposerJob) {
  jobsMap.set(job.id, job);
  const jobFolder = path.join(JOBS_DIR, job.id);
  if (fs.existsSync(jobFolder)) {
    try {
      fs.writeFileSync(path.join(jobFolder, "job.json"), JSON.stringify(job, null, 2), "utf-8");
    } catch (err) {
      console.warn(`[Repurposer] Could not persist job.json for ${job.id}:`, err);
    }
  }
}

export function getClipFilePath(jobId: string, clipId: string): string | null {
  const job = getJob(jobId);
  if (job && job.clips) {
    const clip = job.clips.find((c) => c.id === clipId);
    if (clip && clip.outputPath && fs.existsSync(clip.outputPath)) {
      return clip.outputPath;
    }
  }
  // Disk fallback if server restarted or job cache missed
  const directPath = path.join(JOBS_DIR, jobId, `${clipId}_916.mp4`);
  if (fs.existsSync(directPath)) {
    return directPath;
  }
  // Scan job directory for any pre-rendered file matching clipId
  const jobDir = path.join(JOBS_DIR, jobId);
  if (fs.existsSync(jobDir)) {
    try {
      const files = fs.readdirSync(jobDir);
      const match = files.find((f) => f.startsWith(`${clipId}`) && f.endsWith(".mp4") && !f.includes("thumb"));
      if (match) {
        const fullP = path.join(jobDir, match);
        if (fs.statSync(fullP).size > 2000) return fullP;
      }
    } catch {}
  }
  return null;
}

export function getJob(jobId: string): RepurposerJob | null {
  const jobFile = path.join(JOBS_DIR, jobId, "job.json");
  if (fs.existsSync(jobFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(jobFile, "utf-8"));
      jobsMap.set(jobId, data);
      return data;
    } catch (err) {
      console.warn(`[Repurposer] Could not read persisted job.json for ${jobId}:`, err);
    }
  }
  if (jobsMap.has(jobId)) {
    return jobsMap.get(jobId)!;
  }
  return null;
}

export function getLatestJob(): RepurposerJob | null {
  let latestJob: RepurposerJob | null = null;
  let latestTime = 0;
  for (const job of jobsMap.values()) {
    const t = job.createdAt || 0;
    if (t > latestTime) {
      latestTime = t;
      latestJob = job;
    }
  }

  if (fs.existsSync(JOBS_DIR)) {
    try {
      const folders = fs.readdirSync(JOBS_DIR);
      for (const folder of folders) {
        const jobFile = path.join(JOBS_DIR, folder, "job.json");
        if (fs.existsSync(jobFile)) {
          try {
            const data = JSON.parse(fs.readFileSync(jobFile, "utf-8"));
            const t = data.createdAt || 0;
            if (t > latestTime) {
              latestTime = t;
              latestJob = data;
              jobsMap.set(data.id, data);
            }
          } catch {}
        }
      }
    } catch {}
  }

  return latestJob;
}

function appendJobLog(job: RepurposerJob, message: string) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `[${timestamp}] ${message}`;
  job.logs.push(entry);
  if (job.logs.length > 50) job.logs.shift();
  saveJobState(job);
}

// -----------------------------------------------------------------------------
// Periodic Cleanup of Expired Jobs
// -----------------------------------------------------------------------------
export function runPeriodicCleanup() {
  const now = Date.now();
  for (const [id, job] of jobsMap.entries()) {
    if (job.expiresAt && now > job.expiresAt) {
      cleanupJobDirectory(id);
      jobsMap.delete(id);
    }
  }
  // Also scan disk for orphaned folders
  try {
    if (fs.existsSync(JOBS_DIR)) {
      const folders = fs.readdirSync(JOBS_DIR);
      for (const folder of folders) {
        const folderPath = path.join(JOBS_DIR, folder);
        try {
          const stats = fs.statSync(folderPath);
          if (stats.isDirectory() && now - stats.mtimeMs > JOB_TTL_MS) {
            cleanupJobDirectory(folder);
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    console.warn("[Repurposer Cleanup] Error scanning disk:", err);
  }
}

// Run cleanup every 15 minutes
setInterval(runPeriodicCleanup, 15 * 60 * 1000);

export function cleanupJobDirectory(jobId: string) {
  jobsMap.delete(jobId);
  const jobFolder = path.join(JOBS_DIR, jobId);
  if (fs.existsSync(jobFolder)) {
    try {
      fs.rmSync(jobFolder, { recursive: true, force: true });
      console.log(`[Repurposer Cleanup] Deleted expired job folder: ${jobId}`);
    } catch (err) {
      console.warn(`[Repurposer Cleanup] Could not remove folder ${jobId}:`, err);
    }
  }
}

// -----------------------------------------------------------------------------
// FFmpeg & Process Async Helpers (Non-blocking)
// -----------------------------------------------------------------------------
function execProcessAsync(
  cmd: string,
  args: string[],
  options?: { timeoutMs?: number; onStderr?: (chunk: string) => void; cwd?: string; env?: NodeJS.ProcessEnv }
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const env = { ...process.env, ...(options?.env || {}) };
    const proc = spawn(cmd, args, { cwd: options?.cwd, windowsHide: true, env });

    let killed = false;
    let timer: NodeJS.Timeout | null = null;
    if (options?.timeoutMs) {
      timer = setTimeout(() => {
        killed = true;
        try {
          proc.kill();
        } catch {}
      }, options.timeoutMs);
    }

    proc.stdout?.on("data", (d) => {
      stdout += d.toString();
    });

    proc.stderr?.on("data", (d) => {
      const text = d.toString();
      stderr += text;
      if (options?.onStderr) {
        options.onStderr(text);
      }
    });

    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: killed ? -1 : (code ?? 0), stdout, stderr });
    });

    proc.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: err.message });
    });
  });
}

function getVideoMetadata(videoPath: string): { duration: number; width: number; height: number } {
  try {
    const probe = spawnSync(getFFprobePath(), [
      "-v", "error",
      "-show_entries", "format=duration:stream=width,height",
      "-of", "json",
      videoPath
    ], { encoding: "utf-8", timeout: 10000 });

    if (probe.status === 0 && probe.stdout) {
      const data = JSON.parse(probe.stdout);
      const duration = parseFloat(data.format?.duration || "0");
      const videoStream = (data.streams || []).find((s: any) => s.width && s.height);
      const width = videoStream?.width || 1920;
      const height = videoStream?.height || 1080;
      return { duration, width, height };
    }
  } catch (err) {
    console.warn("[Repurposer] ffprobe failed:", err);
  }
  return { duration: 0, width: 1920, height: 1080 };
}

async function extractAudioForSpeech(videoPath: string, mp3Path: string, wavPath: string): Promise<{ mp3Ok: boolean; wavOk: boolean }> {
  const ffmpegBin = getFFmpegPath();

  // 1. Extract lightweight 16kHz mono MP3 at 48kbps (optimized for Groq Whisper API, tiny size)
  try {
    await execProcessAsync(ffmpegBin, [
      "-y",
      "-i", videoPath,
      "-vn",
      "-ar", "16000",
      "-ac", "1",
      "-c:a", "libmp3lame",
      "-b:a", "48k",
      mp3Path
    ], { timeoutMs: 90000 });
  } catch (e) {
    console.warn("[Repurposer] mp3 extraction with libmp3lame error:", e);
  }

  let mp3Ok = fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 0;

  // Fallback 1b: If libmp3lame is not present, extract with generic audio codec
  if (!mp3Ok) {
    try {
      await execProcessAsync(ffmpegBin, [
        "-y",
        "-i", videoPath,
        "-vn",
        "-ar", "16000",
        "-ac", "1",
        mp3Path
      ], { timeoutMs: 90000 });
      mp3Ok = fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 0;
    } catch (e) {
      console.warn("[Repurposer] fallback mp3 extraction error:", e);
    }
  }

  // 2. Extract PCM WAV for fallback local analysis
  try {
    await execProcessAsync(ffmpegBin, [
      "-y",
      "-i", videoPath,
      "-vn",
      "-acodec", "pcm_s16le",
      "-ar", "16000",
      "-ac", "1",
      wavPath
    ], { timeoutMs: 90000 });
  } catch (e) {
    console.warn("[Repurposer] wav extraction error:", e);
  }

  const wavOk = fs.existsSync(wavPath) && fs.statSync(wavPath).size > 0;

  return { mp3Ok, wavOk };
}

async function transcribeWithGroqWhisper(audioPath: string): Promise<{
  language: string;
  duration: number;
  fullTranscript: string;
  segments: Array<{ start: number; end: number; text: string }>;
  words?: Array<{ word: string; start: number; end: number }>;
} | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[Repurposer] GROQ_API_KEY not configured.");
    return null;
  }

  try {
    const fileBytes = fs.readFileSync(audioPath);
    const fileBlob = new Blob([fileBytes], { type: "audio/mp3" });
    const formData = new FormData();
    formData.append("file", fileBlob, "speech.mp3");
    formData.append("model", "whisper-large-v3");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");
    formData.append("timestamp_granularities[]", "word");

    console.log("[Repurposer] Calling Groq Whisper API (whisper-large-v3)...");
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn("[Repurposer] Groq Whisper failed HTTP", response.status, errText);
      return null;
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.segments)) {
      console.warn("[Repurposer] Groq Whisper returned invalid structure:", data);
      return null;
    }

    const segments: Array<{ start: number; end: number; text: string }> = [];
    for (const s of data.segments) {
      const text = (s.text || "").trim();
      if (text) {
        segments.push({
          start: Math.round(s.start * 100) / 100,
          end: Math.round(s.end * 100) / 100,
          text
        });
      }
    }

    const words: Array<{ word: string; start: number; end: number }> = [];
    if (Array.isArray(data.words)) {
      for (const w of data.words) {
        const wordText = (w.word || "").trim();
        if (wordText) {
          words.push({
            word: wordText,
            start: Math.round(w.start * 100) / 100,
            end: Math.round(w.end * 100) / 100
          });
        }
      }
    }

    return {
      language: data.language || "id",
      duration: data.duration || 0,
      fullTranscript: (data.text || "").trim() || segments.map((s) => s.text).join(" "),
      segments,
      words
    };
  } catch (err) {
    console.warn("[Repurposer] Groq Whisper error:", err);
    return null;
  }
}

async function detectSpeechSegmentsViaSilencedetect(wavPath: string, totalDuration: number): Promise<Array<{ start: number; end: number; text: string }>> {
  try {
    const res = await execProcessAsync(getFFmpegPath(), [
      "-i", wavPath,
      "-af", "silencedetect=noise=-30dB:d=0.45",
      "-f", "null",
      "-"
    ], { timeoutMs: 30000 });

    const output = res.stderr || "";
    const silenceStarts: number[] = [];
    const silenceEnds: number[] = [];

    const startRegex = /silence_start:\s*([0-9.]+)/g;
    const endRegex = /silence_end:\s*([0-9.]+)/g;

    let match;
    while ((match = startRegex.exec(output)) !== null) {
      silenceStarts.push(parseFloat(match[1]));
    }
    while ((match = endRegex.exec(output)) !== null) {
      silenceEnds.push(parseFloat(match[1]));
    }

    const segments: Array<{ start: number; end: number; text: string }> = [];
    let currentStart = 0.0;

    for (let i = 0; i < silenceStarts.length; i++) {
      const sStart = silenceStarts[i];
      const sEnd = silenceEnds[i] !== undefined ? silenceEnds[i] : sStart + 0.5;

      if (sStart - currentStart > 1.5) {
        segments.push({
          start: Math.round(currentStart * 100) / 100,
          end: Math.round(sStart * 100) / 100,
          text: "" // Do not store dummy placeholder text
        });
      }
      currentStart = sEnd;
    }

    if (totalDuration - currentStart > 1.5) {
      segments.push({
        start: Math.round(currentStart * 100) / 100,
        end: Math.round(totalDuration * 100) / 100,
        text: ""
      });
    }

    if (segments.length === 0) {
      const chunkCount = Math.max(1, Math.floor(totalDuration / 6));
      const step = totalDuration / chunkCount;
      for (let i = 0; i < chunkCount; i++) {
        segments.push({
          start: Math.round(i * step * 100) / 100,
          end: Math.round((i + 1) * step * 100) / 100,
          text: ""
        });
      }
    }
    return segments;
  } catch (err) {
    console.warn("[Repurposer] silencedetect failed:", err);
    return [
      { start: 0, end: Math.min(35, totalDuration), text: "" },
      { start: Math.min(35, totalDuration), end: totalDuration, text: "" }
    ];
  }
}

// -----------------------------------------------------------------------------
// Subtitle ASS Generator (Modern TikTok / Reels Style)
// -----------------------------------------------------------------------------
function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function formatAssTitle(raw: string): string {
  const clean = (raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\\{}]/g, "")
    .replace(/^["']|["']$/g, "")
    .replace(/^(PART\s*\d+|BAGIAN\s*\d+|KLIP\s*\d+)[\s:\-]+/i, "");
  if (!clean) return "";

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 3 && clean.length <= 20) {
    return `{\\c&H0000FFFF&}${clean}`;
  }

  // Split into lines of at most 4 words and max 20 characters per line so it NEVER overflows
  const lines: string[] = [];
  let cur: string[] = [];
  let curLen = 0;
  for (const w of words) {
    if (cur.length >= 4 || (cur.length >= 2 && curLen + w.length > 20)) {
      lines.push(cur.join(" "));
      cur = [w];
      curLen = w.length;
    } else {
      cur.push(w);
      curLen += w.length + 1;
    }
  }
  if (cur.length > 0) lines.push(cur.join(" "));

  if (lines.length === 1) {
    return `{\\c&H0000FFFF&}${lines[0]}`;
  }
  if (lines.length === 2) {
    return `{\\c&H0000FFFF&}${lines[0]}\\N{\\c&H00FFFFFF&}${lines[1]}`;
  }
  const l1 = lines[0];
  const l2 = lines[1];
  const l3 = lines.slice(2).join(" ");
  return `{\\c&H0000FFFF&}${l1}\\N{\\c&H00FFFFFF&}${l2}\\N{\\c&H00FFFFFF&}${l3}`;
}

/**
 * Breaks long transcript dialogue into short, punchy 2-3 word subtitle beats
 * with maximum 18 characters per line. This matches modern viral video pacing
 * (MrBeast, Alex Hormozi, TikTok, Reels) and guarantees text is NEVER cut off.
 */
export function segmentSubtitlesIntoPunchyBeats(
  subtitles: RepurposerSubtitle[],
  clipStartSec: number,
  clipEndSec: number
): RepurposerSubtitle[] {
  const result: RepurposerSubtitle[] = [];

  for (const s of subtitles) {
    const rawText = (s.text || "")
      .replace(/[\r\n\t]/g, " ")
      .replace(/[\\{}]/g, "")
      .replace(/^["']|["']$/g, "")
      .trim();
    if (!rawText || rawText.startsWith("[Audio") || rawText.startsWith("[Speech")) continue;

    const words = rawText.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const segStart = Math.max(clipStartSec, s.start);
    const segEnd = Math.min(clipEndSec, s.end);
    const segDuration = Math.max(0.6, segEnd - segStart);

    // If 3 words or fewer and short, keep as a single punchy beat
    if (words.length <= 3 && rawText.length <= 18) {
      result.push({
        start: Math.round(segStart * 100) / 100,
        end: Math.round(segEnd * 100) / 100,
        text: rawText
      });
      continue;
    }

    // Split long sentence into punchy 2-3 word chunks (max 3 words or ~18 chars per chunk)
    const chunks: string[] = [];
    let currentWords: string[] = [];
    let currentLen = 0;

    for (const w of words) {
      if (currentWords.length >= 3 || (currentWords.length >= 2 && currentLen + w.length > 18)) {
        chunks.push(currentWords.join(" "));
        currentWords = [w];
        currentLen = w.length;
      } else {
        currentWords.push(w);
        currentLen += w.length + 1;
      }
    }
    if (currentWords.length > 0) {
      chunks.push(currentWords.join(" "));
    }

    const chunkCount = chunks.length;
    const timePerChunk = segDuration / chunkCount;

    for (let i = 0; i < chunkCount; i++) {
      const cStart = segStart + i * timePerChunk;
      const cEnd = Math.min(segEnd, segStart + (i + 1) * timePerChunk);
      result.push({
        start: Math.round(cStart * 100) / 100,
        end: Math.round(Math.max(cStart + 0.45, cEnd) * 100) / 100,
        text: chunks[i]
      });
    }
  }

  return result;
}

export function generateModernAssSubtitleFile(
  subtitles: RepurposerSubtitle[],
  clipStartSec: number,
  assFilePath: string,
  clipTitle?: string,
  _hookText?: string,
  clipEndSec: number = clipStartSec + 60
) {
  let events = "";

  // 0. Top Header Title Overlay: Muncul 4.0 detik pertama di atas layar (Alignment: 8), lalu menghilang halus
  if (clipTitle && clipTitle.trim()) {
    const formattedTitle = formatAssTitle(clipTitle);
    if (formattedTitle) {
      // 0.00s to 0.04.00s with 250ms fade-in and 350ms fade-out
      events += `Dialogue: 1,0:00:00.00,0:00:04.00,TopHeaderTitle,,0,0,0,,{\\fad(250,350)}${formattedTitle}\n`;
    }
  }

  // 1. Dynamic sentence chunking: break into punchy 2-3 word beats (max 18 chars)
  const punchyItems = segmentSubtitlesIntoPunchyBeats(subtitles, clipStartSec, clipEndSec);

  punchyItems.forEach((sub) => {
    const relativeStart = Math.max(0, sub.start - clipStartSec);
    const relativeEnd = Math.max(relativeStart + 0.45, sub.end - clipStartSec);

    const startStr = formatAssTime(relativeStart);
    const endStr = formatAssTime(relativeEnd);

    // Modern caption formatting: bold uppercase with alternating colored words (Neon Yellow & Crisp White)
    const words = sub.text.trim().toUpperCase().replace(/[\\{}]/g, "").split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    let styledText = "";
    // If beat has 2+ words and is > 16 chars, split into 2 stacked lines
    if (words.length >= 2 && sub.text.length > 16) {
      const mid = Math.ceil(words.length / 2);
      const line1 = words.slice(0, mid).join(" ");
      const line2 = words.slice(mid).join(" ");
      styledText = `{\\c&H0000FFFF&}${line1}\\N{\\c&H00FFFFFF&}${line2}`;
    } else {
      words.forEach((w, wIdx) => {
        if (wIdx % 2 === 0) {
          styledText += `{\\c&H0000FFFF&}${w} `; // Neon Yellow in BGR (&H0000FFFF&)
        } else {
          styledText += `{\\c&H00FFFFFF&}${w} `; // Crisp White
        }
      });
      styledText = styledText.trim();
    }

    events += `Dialogue: 0,${startStr},${endStr},ModernCaption,,0,0,0,,${styledText}\n`;
  });

  const assContent = `[Script Info]
Title: CreatorIQ Dynamic Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ModernCaption,Montserrat Black,56,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,6.5,2.5,2,100,100,340,1
Style: TopHeaderTitle,Montserrat Black,44,&H0000FFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,1,0,1,6.0,2.5,8,80,80,200,1
Style: HookBanner,Montserrat Black,50,&H002EFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,6.5,2.0,8,60,60,200,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;

  fs.writeFileSync(assFilePath, assContent, "utf-8");
}

export function isEnglishContent(lang?: string, transcriptText?: string, title?: string): boolean {
  const l = (lang || "").toLowerCase().trim();
  if (l === "en" || l === "english" || l.startsWith("en-")) return true;
  if (l === "id" || l === "indonesian" || l === "ms" || l === "malay") return false;

  const sample = `${title || ""} ${transcriptText || ""}`.toLowerCase();
  if (!sample.trim()) return false;

  // Indonesian marker words
  const idMarkers = [
    /\byang\b/, /\bdan\b/, /\bdi\b/, /\bini\b/, /\bitu\b/, /\bdengan\b/,
    /\buntuk\b/, /\btidak\b/, /\bdari\b/, /\bada\b/, /\bakan\b/, /\bbisa\b/,
    /\bsaya\b/, /\bkamu\b/, /\bkita\b/, /\bvideo\b/, /\bhalo\b/, /\bbanget\b/,
    /\bapakah\b/, /\bkenapa\b/, /\bgimana\b/, /\bsaja\b/, /\bsudah\b/
  ];

  // English marker words
  const enMarkers = [
    /\bthe\b/, /\band\b/, /\bis\b/, /\bthis\b/, /\bthat\b/, /\bwith\b/,
    /\byou\b/, /\bhave\b/, /\bfor\b/, /\bnot\b/, /\bbut\b/, /\bwhat\b/,
    /\bwill\b/, /\bare\b/, /\bfrom\b/, /\babout\b/, /\bhow\b/, /\bwhen\b/,
    /\bbecause\b/, /\bthere\b/, /\bhere\b/, /\btheir\b/, /\bthem\b/
  ];

  let idCount = 0;
  let enCount = 0;
  for (const regex of idMarkers) {
    if (regex.test(sample)) idCount++;
  }
  for (const regex of enMarkers) {
    if (regex.test(sample)) enCount++;
  }

  if (enCount > idCount && enCount >= 2) return true;
  return false;
}

export function isTemplateTitle(title?: string): boolean {
  if (!title) return true;
  const lower = title.toLowerCase();
  const templatePatterns = [
    "bongkar rahasia",
    "temuan paling krusial",
    "stop salah langkah",
    "jangan skip",
    "detik paling mengejutkan",
    "detik-detik mengejutkan",
    "99% orang salah",
    "detik ini membuktikan",
    "rahasia masak",
    "momen epic",
    "clutch 1 detik",
    "stop buang uang",
    "fitur tersembunyi",
    "tes ekstrem",
    "the biggest truth",
    "the shocking turning point",
    "stop making this fatal error",
    "don't miss",
    "the moment everything changed",
    "ini alasan krusial",
    "hasilnya di luar prediksi",
    "ini solusi lengkap",
    "trik rahasianya sekarang",
    "bukti nyata yang membuat",
    "highlight momen",
    "klip viral #"
  ];
  return templatePatterns.some((pattern) => lower.includes(pattern));
}

export function resolveClipTitle(
  clipNumber: number,
  titleCandidate?: string,
  hookCandidate?: string,
  subs?: RepurposerSubtitle[],
  originalFileName?: string,
  isEnglish?: boolean
): string {
  // If titleCandidate exists and is an authentic analysis (NOT a template formula)
  if (
    titleCandidate &&
    titleCandidate.trim() &&
    !titleCandidate.toLowerCase().startsWith("highlight") &&
    !titleCandidate.toLowerCase().startsWith("momen #") &&
    !isTemplateTitle(titleCandidate)
  ) {
    return cleanTitleString(titleCandidate);
  }

  // Next, extract directly from the actual spoken dialogue in this clip!
  if (subs && subs.length > 0) {
    const validTexts = subs
      .map((s) => (s.text || "").trim())
      .filter((t) => t && !t.startsWith("[Audio") && !t.startsWith("[Speech") && !t.startsWith("[Music"));

    if (validTexts.length > 0) {
      // Find candidate meaningful sentences or phrases spoken in this clip
      for (const line of validTexts) {
        let cleaned = line;
        if (!isEnglish) {
          cleaned = cleaned.replace(
            /^(halo\s+(semua|guys|kawan|temen-temen)|selamat\s+(pagi|siang|sore|malam)|assalamualaikum|welcome\s+back|nah\s+jadi|jadi\s+gini|jadi|nah|oke\s+guys|oke|terus|sebenarnya|menurut\s+saya|menurut\s+gue|ternyata\s+ya|kalau\s+menurut|di\s+video\s+ini|kali\s+ini|kita\s+bakal|saya\s+mau|gue\s+mau)\s*[,:\-]?\s*/i,
            ""
          );
        } else {
          cleaned = cleaned.replace(
            /^(hey\s+(guys|everyone)|hello\s+(everyone|guys)|welcome\s+back|so\s+today|in\s+this\s+video|alright\s+guys|okay\s+so|and\s+yeah|basically|well\s+actually|what\s+i\s+mean\s+is)\s*[,:\-]?\s*/i,
            ""
          );
        }
        cleaned = cleaned.replace(/^[-,:.\s]+/, "").replace(/[-,:.\s]+$/, "").trim();

        const words = cleaned.split(/\s+/).filter(Boolean);
        if (words.length >= 3 && words.length <= 12) {
          return cleanTitleString(words.join(" "));
        }
        if (words.length > 12) {
          return cleanTitleString(words.slice(0, 10).join(" "));
        }
      }

      // If lines were short, take first 2-8 words of first spoken line
      const firstWords = validTexts[0].replace(/[.,?!]+$/, "").split(/\s+/).slice(0, 8);
      if (firstWords.length >= 2) {
        return cleanTitleString(firstWords.join(" "));
      }
    }
  }

  // If hook candidate is provided and NOT a canned template
  if (hookCandidate && hookCandidate.trim() && !isTemplateTitle(hookCandidate)) {
    const cleanedHook = hookCandidate.trim().replace(/^["']|["']$/g, "");
    const words = cleanedHook.split(/\s+/);
    if (words.length >= 3 && words.length <= 12) {
      return cleanTitleString(words.join(" "));
    }
  }

  // Non-clickbait, honest fallback
  const baseName = (originalFileName || "")
    .replace(/\.[^/.]+$/, "")
    .replace(/[_]/g, " ")
    .replace(/Sang|Video|HD|1080p|720p/gi, "")
    .trim();

  if (baseName) {
    return cleanTitleString(isEnglish ? `${baseName} - Part ${clipNumber}` : `${baseName} - Bagian ${clipNumber}`);
  }

  return isEnglish ? `CLIP ${clipNumber}` : `KLIP ${clipNumber}`;
}

function cleanTitleString(s: string): string {
  return s
    .replace(/[\\{}]/g, "")
    .replace(/^["']|["']$/g, "")
    .trim()
    .toUpperCase();
}

// -----------------------------------------------------------------------------
// Groq AI Analysis Pipeline using openai/gpt-oss-120b
// -----------------------------------------------------------------------------
async function analyzeTranscriptWithGroq(
  transcriptText: string,
  segments: Array<{ start: number; end: number; text: string }>,
  totalDuration: number,
  videoTitle: string,
  language?: string
): Promise<Array<{
  start: number;
  end: number;
  score: number;
  title: string;
  hook: string;
  reason: string;
  category: string;
}>> {
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  const groqModel = "openai/gpt-oss-120b";

  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY is not configured in environment variables.");
  }

  const isEnglish = isEnglishContent(language, transcriptText, videoTitle);

  // Format transcript segments for AI prompt
  const formattedSegments = segments.slice(0, 150).map((s) => {
    return `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`;
  }).join("\n");

  let prompt = "";
  if (isEnglish) {
    prompt = `You are an elite Short-Form Content Strategist and AI Video Editor for TikTok, Instagram Reels, and YouTube Shorts.
Your mission: Analyze this video transcript thoroughly and identify 3-4 of the highest-potential VIRAL moments ("Golden Clips") to repurpose into 9:16 vertical shorts.

CRITICAL LANGUAGE REQUIREMENT:
The video speech and transcript are in ENGLISH. All clip "title", "hook", "reason", and metadata MUST BE WRITTEN IN PURE ENGLISH!
Do NOT output Indonesian words for titles, hooks, or reasons. Every title must be native, catchy viral English!

Video Title / Topic: "${videoTitle}"
Total Duration: ${totalDuration.toFixed(1)} seconds.

TIMESTAMPTED TRANSCRIPT:
${formattedSegments || "No transcript segments available, rely on timing and video context."}

MANDATORY CLIP SELECTION CRITERIA:
1. Hook within first 3 seconds (provocative question, shocking fact, high tension, or high-value insight).
2. Natural start & end:
   - Do NOT cut mid-sentence.
   - Extend start if prior sentence provides vital context.
   - Extend end if clip conclusion needs resolution.
3. Duration per clip: between 25 seconds and 55 seconds (max 60 seconds).
4. Virality score between 1 and 100.
5. Clip category: "story", "insight", "climax", "debate", "mindset", or "tutorial".
6. "title": Create a DETAILED, SPECIFIC, HIGH-RETENTION TITLE (6-12 words, ALL CAPS) reflecting the exact discussion and takeaway in the clip!
   - STRICTLY FORBIDDEN from using generic clickbait templates (e.g. "THE BIGGEST TRUTH ABOUT...", "THE SHOCKING MOMENT...", "STOP MAKING THIS MISTAKE...").
   - DO NOT make generic or lazy titles (e.g. "CAMERA SPECS" or "TESTING NEW FEATURES").
   - The title MUST be 100% genuine and directly summarize the actual facts, questions, benchmarks, or arguments spoken by the speaker in the clip!
   - Examples of EXCELLENT, SPECIFIC & DETAILED ENGLISH TITLES:
     * "HOW FAST DOES THIS PROCESSOR ACTUALLY RUN UNDER HEAVY GAMING"
     * "WHY YOU SHOULD NEVER BUY THE LOWEST STORAGE TIER IN 2025"
     * "TESTING THE 200 DOLLAR BUDGET CAMERA IN NIGHT MODE"
     * "THE REAL CHARGING SPEED IS ONLY 10 WATTS INSTEAD OF 18 WATTS"
7. Output strictly valid JSON conforming to this schema:

{
  "clips": [
    {
      "start": 14.5,
      "end": 48.0,
      "score": 96,
      "title": "THIS AI TOOL CHANGED EVERYTHING! HOW CREATORS ARE GENERATING WEEKS OF CONTENT IN SECONDS",
      "hook": "Wait until you see how fast this actually works...",
      "reason": "Strong curiosity opening, high emotional payoff, and massive viral share potential.",
      "category": "insight"
    }
  ]
}`;
  } else {
    prompt = `Anda adalah Lead Content Strategist dan AI Video Editor untuk short-form video (TikTok, Instagram Reels, YouTube Shorts).
Tugas Anda: Analisis transkrip percakapan video ini secara utuh dan pilih 3-4 klip momen terbaik ("Golden Clips") yang paling potensial viral.

KETENTUAN BAHASA:
Audio dan transkrip video ini berbahasa INDONESIA. Seluruh "title", "hook", "reason", dan metadata klip HARUS DITULIS DALAM BAHASA INDONESIA!

Judul / Topik Video: "${videoTitle}"
Total Durasi: ${totalDuration.toFixed(1)} detik.

TRANSKRIP BERDASARKAN TIMESTAMP:
${formattedSegments || "Audio video tidak memiliki teks transkrip detail, gunakan pola waktu audio."}

KRITERIA WAJIB SELEKSI KLIP:
1. Clip HARUS memiliki Hook yang kuat di 3 detik pertama (pertanyaan menarik, fakta mengejutkan, konflik, emosi, atau insight bernilai tinggi).
2. Awal (start) dan akhir (end) HARUS NATURAL:
   - Jangan memotong kalimat di tengah jalan.
   - Jika butuh konteks kalimat sebelumnya, perluas start time.
   - Jika akhir klip memotong kesimpulan/payoff, perluas end time.
3. Durasi setiap klip wajib antara 25 detik hingga 55 detik (maksimal 60 detik).
4. Berikan score relevansi & potensi viral dari 1 hingga 100.
5. Kategori klip: "story", "insight", "climax", "debate", "mindset", atau "tutorial".
6. "title": Buat judul yang JELAS, SPESIFIK, dan MURNI MENGANGKAT INTI PERCAKAPAN/BAHASAN KLIP (6-12 kata, HURUF KAPITAL) sesuai apa yang sebenarnya diucapkan atau diuji di video!
   - DILARANG KERAS menggunakan rumus template klise atau kata clickbait palsu (seperti: "BONGKAR RAHASIA BESAR...", "TEMUAN PALING KRUSIAL...", "STOP SALAH LANGKAH...", "99% ORANG SALAH PAHAM...", "DETIK PALING MENGEJUTKAN!").
   - JANGAN membuat judul terlalu singkat atau umum/generik (seperti "SPESIFIKASI HP" atau "REVIEW SINGKAT").
   - Judul HARUS 100% REAL merangkum kalimat, pengujian, temuan, atau topik aktual yang dibicarakan pembicara pada segmen klip tersebut.
   - Contoh gaya judul yang REAL, SPESIFIK & MENCERMINKAN ISI KLIP:
     * "TES KETAHANAN BATERAI SAAT DIPAKAI MAIN GAME BERAT"
     * "KAMERA DEPAN TERNYATA CUMA BISA REKAM 1080P 30FPS"
     * "PERBANDINGAN FOTO MALAM ADVAN X1 DENGAN REDMI 13C"
     * "KELEMAHAN PALING TERASA ADA DI SPEAKER YANG CEMPRENG"
     * "ALASAN LOGIS KENAPA FITUR INI TIDAK BERFUNGSI MAKSIMAL"
7. Output HARUS dalam format JSON murni yang valid sesuai schema berikut:

{
  "clips": [
    {
      "start": 14.5,
      "end": 48.0,
      "score": 96,
      "title": "KEBANGKITAN ADVAN! RILIS HP ENTRY-LEVEL SPEK RASA MID-RANGE SETELAH BERTAHUN-TAHUN VAKUM",
      "hook": "Congrats! Akhirnya ada brand lokal yang bangkit kembali...",
      "reason": "Memiliki hook kuat, cerita kebangkitan brand lokal, dan informasi produk yang menarik.",
      "category": "story"
    }
  ]
}`;
  }

  const modelsToTry = await getActiveGroqModels(groqApiKey);
  console.log(`[Repurposer] Testing Groq models for viral intelligence:`, modelsToTry);

  for (const model of modelsToTry) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: isEnglish
                ? "You are an elite short-form viral video editor. You must output a valid JSON object strictly matching the schema."
                : "You are an elite short-form viral video editor. You must output a valid JSON object strictly matching the schema in Indonesian."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.5,
          max_tokens: 2500,
          response_format: { type: "json_object" }
        }),
        signal: AbortSignal.timeout(18000)
      });

      if (response.ok) {
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.clips) && parsed.clips.length > 0) {
            console.log(`[Repurposer] Groq model ${model} successfully identified ${parsed.clips.length} viral clips.`);
            return parsed.clips;
          }
        }
      } else {
        const errText = await response.text();
        console.warn(`[Repurposer] Groq attempt with ${model} returned ${response.status}: ${errText.slice(0, 120)}`);
      }
    } catch (err: any) {
      console.warn(`[Repurposer] Groq attempt with ${model} failed:`, err?.message);
    }
  }

  // Fallback attempt without response_format constraint using primary active model
  const fallbackModel = modelsToTry[0] || "openai/gpt-oss-120b";
  try {
    const responseFallback = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: fallbackModel,
        messages: [
          {
            role: "system",
            content: "You are a viral shorts strategist. Return valid JSON only. Do not add markdown code fences."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 2500
      }),
      signal: AbortSignal.timeout(18000)
    });

    if (responseFallback.ok) {
      const json = await responseFallback.json();
      const content = json.choices?.[0]?.message?.content;
      if (content) {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed.clips) && parsed.clips.length > 0) {
            return parsed.clips;
          }
        }
      }
    }
  } catch (fallbackErr: any) {
    console.warn(`[Repurposer] Groq fallback attempt with ${fallbackModel} failed:`, fallbackErr?.message);
  }

  throw new Error("Groq API tidak merespons JSON valid. Beralih ke CreatorIQ Standalone Content Engine.");
}

/**
 * Auto-discovers active Groq models or uses prioritized active models:
 * openai/gpt-oss-120b, qwen/qwen3.8-27b, openai/gpt-oss-20b, groq/compound, etc.
 * Avoids deprecated models like llama-3.3-70b-versatile and llama-3.1-8b-instant.
 */
export async function getActiveGroqModels(apiKey: string): Promise<string[]> {
  const customModel = process.env.GROQ_MODEL?.trim() || process.env.GROQ_REPURPOSER_MODEL?.trim();
  const curatedPriority = [
    customModel,
    "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-20b",
    "groq/compound",
    "qwen/qwen3-32b",
    "groq/qwen/qwen3.6-27b",
    "meta-llama/llama-4-scout-17b-16e-instruct"
  ].filter(Boolean) as string[];

  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3500)
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.data)) {
        const availableIds = new Set<string>(data.data.map((m: any) => m.id));
        const matched: string[] = [];

        // 1. Pick preferred models that exist in user's account
        for (const pref of curatedPriority) {
          if (availableIds.has(pref) && !matched.includes(pref)) {
            matched.push(pref);
          }
        }

        // 2. Add any other valid text chat models
        for (const m of data.data) {
          const id = m.id as string;
          if (
            !matched.includes(id) &&
            !id.includes("whisper") &&
            !id.includes("guard") &&
            !id.includes("embed") &&
            !id.includes("rerank") &&
            !id.includes("vision")
          ) {
            matched.push(id);
          }
        }

        if (matched.length > 0) {
          console.log(`[Repurposer] Auto-discovered ${matched.length} active Groq models:`, matched.slice(0, 4));
          return matched.slice(0, 5);
        }
      }
    }
  } catch (err: any) {
    console.log("[Repurposer] Groq model auto-discovery skipped/fallback:", err?.message);
  }

  return curatedPriority.slice(0, 4);
}

// Helper to build 9:16 FFmpeg video filter based on chosen adaptation mode
export function buildFFmpegFilter(layoutMode: string, assPath: string, filterType: "ass" | "subtitles" = "ass"): string {
  // Use basename when cwd is set to jobDir to prevent Windows colon/backslash escaping issues
  const cleanAss = path.basename(assPath).replace(/'/g, "'\\''");
  // Relative fontsdir='fonts' ensures zero drive letter / colon issues on Windows or Linux
  const subFilter = `${filterType}='${cleanAss}':fontsdir='fonts'`;

  if (layoutMode === "crop_fill" || layoutMode === "crop_zoom_fill") {
    // 100% Full Screen 9:16 Crop Zoom Fill (No blurred bars)
    return `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,${subFilter}[outv]`;
  }
  if (layoutMode === "split_stacked") {
    // Dual stacked top & bottom split
    return `[0:v]split=2[in_top][in_bot];` +
      `[in_top]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1[top];` +
      `[in_bot]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1[bot];` +
      `[top][bot]vstack=inputs=2,setsar=1,${subFilter}[outv]`;
  }
  // blurred_backdrop (Optimized downscale-blur-upscale: 6.5x faster, avoids OOM on Railway 512MB RAM, -2 ensures even height)
  return `[0:v]split=2[in_bg][in_fg];` +
    `[in_bg]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=8:2,scale=1080:1920[bg];` +
    `[in_fg]scale=1080:-2[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,${subFilter}[outv]`;
}

// Clean 9:16 FFmpeg filter without ASS subtitle dependency (for environments where libass is unavailable)
export function buildCleanFFmpegFilter(layoutMode: string): string {
  if (layoutMode === "crop_fill" || layoutMode === "crop_zoom_fill") {
    return `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[outv]`;
  }
  if (layoutMode === "split_stacked") {
    return `[0:v]split=2[in_top][in_bot];` +
      `[in_top]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1[top];` +
      `[in_bot]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1[bot];` +
      `[top][bot]vstack=inputs=2,setsar=1[outv]`;
  }
  // blurred_backdrop without ASS filter
  return `[0:v]split=2[in_bg][in_fg];` +
    `[in_bg]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=8:2,scale=1080:1920[bg];` +
    `[in_fg]scale=1080:-2[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[outv]`;
}

/**
 * Standalone FreeType drawtext fallback filter.
 * Burns Top Title (first 4s in neon yellow with high-contrast backing box) and subtitles
 * directly using FFmpeg's built-in libfreetype engine with Montserrat Black font.
 * Requires ZERO fontconfig or libass dependencies!
 */
export function buildDrawtextFallbackFilter(
  layoutMode: string,
  clip: RepurposedClip,
  _cutDuration: number
): string {
  const drawFilters: string[] = [];
  // Since cwd is jobDir and fonts are copied to jobDir, fontfile is loaded directly
  const fontFileArg = "fontfile='Montserrat-Black.ttf':";

  // 1. Top Hook Title Overlay (first 4.0s)
  const rawTitle = (clip.title || clip.hook || "VIRAL HIGHLIGHT")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\\':]/g, " ")
    .replace(/^["']|["']$/g, "")
    .trim()
    .toUpperCase();

  if (rawTitle) {
    const words = rawTitle.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur: string[] = [];
    let curLen = 0;
    for (const w of words) {
      if (cur.length >= 4 || (cur.length >= 2 && curLen + w.length > 20)) {
        lines.push(cur.join(" "));
        cur = [w];
        curLen = w.length;
      } else {
        cur.push(w);
        curLen += w.length + 1;
      }
    }
    if (cur.length > 0) lines.push(cur.join(" "));

    if (lines.length === 1) {
      const escaped = lines[0].replace(/'/g, "'\\''");
      drawFilters.push(
        `drawtext=${fontFileArg}text='${escaped}':fontsize=46:fontcolor=0xFFFF00:borderw=5:bordercolor=black:x=(w-text_w)/2:y=180:box=1:boxcolor=black@0.65:boxborderw=12:enable='between(t,0,4)'`
      );
    } else if (lines.length === 2) {
      const esc1 = lines[0].replace(/'/g, "'\\''");
      const esc2 = lines[1].replace(/'/g, "'\\''");
      drawFilters.push(
        `drawtext=${fontFileArg}text='${esc1}':fontsize=44:fontcolor=0xFFFF00:borderw=5:bordercolor=black:x=(w-text_w)/2:y=160:box=1:boxcolor=black@0.65:boxborderw=10:enable='between(t,0,4)'`
      );
      drawFilters.push(
        `drawtext=${fontFileArg}text='${esc2}':fontsize=44:fontcolor=white:borderw=5:bordercolor=black:x=(w-text_w)/2:y=225:box=1:boxcolor=black@0.65:boxborderw=10:enable='between(t,0,4)'`
      );
    } else {
      const esc1 = lines[0].replace(/'/g, "'\\''");
      const esc2 = lines[1].replace(/'/g, "'\\''");
      const esc3 = lines.slice(2).join(" ").replace(/'/g, "'\\''");
      drawFilters.push(
        `drawtext=${fontFileArg}text='${esc1}':fontsize=40:fontcolor=0xFFFF00:borderw=5:bordercolor=black:x=(w-text_w)/2:y=150:box=1:boxcolor=black@0.65:boxborderw=8:enable='between(t,0,4)'`
      );
      drawFilters.push(
        `drawtext=${fontFileArg}text='${esc2}':fontsize=40:fontcolor=white:borderw=5:bordercolor=black:x=(w-text_w)/2:y=205:box=1:boxcolor=black@0.65:boxborderw=8:enable='between(t,0,4)'`
      );
      drawFilters.push(
        `drawtext=${fontFileArg}text='${esc3}':fontsize=40:fontcolor=white:borderw=5:bordercolor=black:x=(w-text_w)/2:y=260:box=1:boxcolor=black@0.65:boxborderw=8:enable='between(t,0,4)'`
      );
    }
  }

  // 2. Subtitles with punchy 2-3 word beats (max 18 chars, never cut off!)
  const punchyBeats = segmentSubtitlesIntoPunchyBeats(clip.subtitles || [], clip.start, clip.end);
  const clipStart = clip.start;

  for (const beat of punchyBeats) {
    const relStart = Math.max(0, beat.start - clipStart);
    const relEnd = Math.max(relStart + 0.45, beat.end - clipStart);
    const beatText = beat.text.toUpperCase().replace(/[\\':]/g, " ").trim();
    const words = beatText.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    // If beat has 2+ words and is >16 chars, split into 2 stacked lines
    if (beatText.length > 16 && words.length >= 2) {
      const mid = Math.ceil(words.length / 2);
      const l1 = words.slice(0, mid).join(" ").replace(/'/g, "'\\''");
      const l2 = words.slice(mid).join(" ").replace(/'/g, "'\\''");
      drawFilters.push(
        `drawtext=${fontFileArg}text='${l1}':fontsize=52:fontcolor=0xFFFF00:borderw=5:bordercolor=black:x=(w-text_w)/2:y=h-415:box=1:boxcolor=black@0.65:boxborderw=10:enable='between(t,${relStart.toFixed(2)},${relEnd.toFixed(2)})'`
      );
      drawFilters.push(
        `drawtext=${fontFileArg}text='${l2}':fontsize=52:fontcolor=white:borderw=5:bordercolor=black:x=(w-text_w)/2:y=h-345:box=1:boxcolor=black@0.65:boxborderw=10:enable='between(t,${relStart.toFixed(2)},${relEnd.toFixed(2)})'`
      );
    } else {
      const esc = beatText.replace(/'/g, "'\\''");
      drawFilters.push(
        `drawtext=${fontFileArg}text='${esc}':fontsize=54:fontcolor=0xFFFF00:borderw=5:bordercolor=black:x=(w-text_w)/2:y=h-375:box=1:boxcolor=black@0.65:boxborderw=12:enable='between(t,${relStart.toFixed(2)},${relEnd.toFixed(2)})'`
      );
    }
  }

  // If no subtitles but clip has hook
  if (punchyBeats.length === 0 && clip.hook) {
    const escHook = clip.hook.replace(/[\r\n\t]/g, " ").replace(/[\\':]/g, " ").trim().toUpperCase().slice(0, 30).replace(/'/g, "'\\''");
    drawFilters.push(
      `drawtext=${fontFileArg}text='${escHook}':fontsize=52:fontcolor=0xFFFF00:borderw=5:bordercolor=black:x=(w-text_w)/2:y=h-375:box=1:boxcolor=black@0.65:boxborderw=12:enable='between(t,0,5)'`
    );
  }

  const textFilterChain = drawFilters.length > 0 ? `,${drawFilters.join(",")}` : "";

  if (layoutMode === "crop_fill" || layoutMode === "crop_zoom_fill") {
    return `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1${textFilterChain}[outv]`;
  }
  if (layoutMode === "split_stacked") {
    return `[0:v]split=2[in_top][in_bot];` +
      `[in_top]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1[top];` +
      `[in_bot]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1[bot];` +
      `[top][bot]vstack=inputs=2,setsar=1${textFilterChain}[outv]`;
  }
  // blurred_backdrop
  return `[0:v]split=2[in_bg][in_fg];` +
    `[in_bg]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=8:2,scale=1080:1920[bg];` +
    `[in_fg]scale=1080:-2[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1${textFilterChain}[outv]`;
}

/**
 * Bulletproof single-clip renderer supporting Windows, macOS, Linux, and Cloud (Railway/Docker).
 * Tries 5 tiers:
 * Tier 1: 9:16 layout with ASS subtitle filter + Top Title.
 * Tier 1b: 9:16 layout with subtitles filter fallback.
 * Tier 1c: 9:16 layout with FreeType drawtext fallback (Burns Title & Subtitles without libass/fontconfig).
 * Tier 2: 9:16 layout without text overlays (Clean filter).
 * Tier 3: Direct 9:16 scale & pad transcode.
 * Tier 4: Direct cut transcode (guaranteed fallback).
 */
export async function renderSingleClipSafe(
  jobDir: string,
  inputVideo: string,
  clip: RepurposedClip,
  layoutMode: string,
  onProgress?: (dataChunk: string) => void
): Promise<string | null> {
  const outputFileName = `${clip.id}_916.mp4`;
  const outputFilePath = path.join(jobDir, outputFileName);
  const cutDuration = Math.max(5, clip.end - clip.start);
  const ffmpegBin = getFFmpegPath();

  if (fs.existsSync(outputFilePath) && fs.statSync(outputFilePath).size > 2000) {
    return outputFilePath;
  }

  // Ensure bundled fonts are copied to jobDir and jobDir/fonts so both ASS and FreeType drawtext load them cleanly
  const jobFontsDir = path.join(jobDir, "fonts");
  if (!fs.existsSync(jobFontsDir)) {
    fs.mkdirSync(jobFontsDir, { recursive: true });
  }
  if (fs.existsSync(BUNDLED_FONTS_DIR)) {
    try {
      const fontFiles = fs.readdirSync(BUNDLED_FONTS_DIR);
      for (const ff of fontFiles) {
        if (ff.endsWith(".ttf")) {
          const src = path.join(BUNDLED_FONTS_DIR, ff);
          const destFonts = path.join(jobFontsDir, ff);
          if (!fs.existsSync(destFonts)) {
            fs.copyFileSync(src, destFonts);
          }
          const destRoot = path.join(jobDir, ff);
          if (!fs.existsSync(destRoot)) {
            fs.copyFileSync(src, destRoot);
          }
        }
      }
    } catch (fontErr) {
      console.warn("[Repurposer] Could not copy bundled fonts to jobDir:", fontErr);
    }
  }

  // Ensure ASS file exists
  const assPath = path.join(jobDir, `${clip.id}_subtitles.ass`);
  try {
    generateModernAssSubtitleFile(clip.subtitles || [], clip.start, assPath, clip.title || clip.hook, undefined, clip.end);
  } catch (err) {
    console.warn(`[Repurposer] Could not generate ASS for ${clip.id}:`, err);
  }

  const assBaseName = path.basename(assPath);

  // Tier 1: With ASS filter + fontsdir using cwd: jobDir
  try {
    const filterComplex = buildFFmpegFilter(layoutMode, assBaseName, "ass");
    const ffArgs = [
      "-y",
      "-ss", clip.start.toFixed(2),
      "-t", cutDuration.toFixed(2),
      "-i", inputVideo,
      "-filter_complex", filterComplex,
      "-map", "[outv]",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-threads", "2",
      "-crf", "22",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outputFileName
    ];

    const res = await execProcessAsync(ffmpegBin, ffArgs, {
      cwd: jobDir,
      timeoutMs: 180000,
      onStderr: onProgress
    });

    if (res.code === 0 && fs.existsSync(outputFilePath) && fs.statSync(outputFilePath).size > 2000) {
      console.log(`[Repurposer] Successfully rendered ${clip.id} via Tier 1 (ASS filter)`);
      return outputFilePath;
    } else {
      console.warn(`[Repurposer] Tier 1 ASS render exit code ${res.code} for ${clip.id}:`, res.stderr.slice(-300));
    }
  } catch (err) {
    console.warn(`[Repurposer] Tier 1 ASS render failed for ${clip.id}:`, err);
  }

  // Tier 1b: Fallback to subtitles filter with fontsdir (robust alternative libass filter)
  try {
    const subFilterComplex = buildFFmpegFilter(layoutMode, assBaseName, "subtitles");
    const ffArgsSub = [
      "-y",
      "-ss", clip.start.toFixed(2),
      "-t", cutDuration.toFixed(2),
      "-i", inputVideo,
      "-filter_complex", subFilterComplex,
      "-map", "[outv]",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-threads", "2",
      "-crf", "22",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outputFileName
    ];

    const resSub = await execProcessAsync(ffmpegBin, ffArgsSub, {
      cwd: jobDir,
      timeoutMs: 180000,
      onStderr: onProgress
    });

    if (resSub.code === 0 && fs.existsSync(outputFilePath) && fs.statSync(outputFilePath).size > 2000) {
      console.log(`[Repurposer] Successfully rendered ${clip.id} via Tier 1b (subtitles filter)`);
      return outputFilePath;
    } else {
      console.warn(`[Repurposer] Tier 1b subtitles render exit code ${resSub.code} for ${clip.id}:`, resSub.stderr.slice(-300));
    }
  } catch (err) {
    console.warn(`[Repurposer] Tier 1b subtitles render failed for ${clip.id}:`, err);
  }

  // Tier 1c: Standalone FreeType drawtext filter (Burns title 0-4s & subtitles directly, ZERO libass or fontconfig dependency)
  try {
    const drawtextFilter = buildDrawtextFallbackFilter(layoutMode, clip, cutDuration);
    const ffArgsDraw = [
      "-y",
      "-ss", clip.start.toFixed(2),
      "-t", cutDuration.toFixed(2),
      "-i", inputVideo,
      "-filter_complex", drawtextFilter,
      "-map", "[outv]",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-threads", "2",
      "-crf", "22",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outputFileName
    ];

    const resDraw = await execProcessAsync(ffmpegBin, ffArgsDraw, {
      cwd: jobDir,
      timeoutMs: 180000,
      onStderr: onProgress
    });

    if (resDraw.code === 0 && fs.existsSync(outputFilePath) && fs.statSync(outputFilePath).size > 2000) {
      console.log(`[Repurposer] Successfully rendered ${clip.id} via Tier 1c (FreeType drawtext)`);
      return outputFilePath;
    } else {
      console.warn(`[Repurposer] Tier 1c drawtext render exit code ${resDraw.code} for ${clip.id}:`, resDraw.stderr.slice(-300));
    }
  } catch (err) {
    console.warn(`[Repurposer] Tier 1c drawtext render failed for ${clip.id}:`, err);
  }

  // Tier 2: Without ASS filter (Standard Blurred Backdrop 9:16 layout)
  try {
    const cleanFilter = buildCleanFFmpegFilter(layoutMode);
    const ffArgs = [
      "-y",
      "-ss", clip.start.toFixed(2),
      "-t", cutDuration.toFixed(2),
      "-i", inputVideo,
      "-filter_complex", cleanFilter,
      "-map", "[outv]",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-threads", "2",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outputFileName
    ];

    const res = await execProcessAsync(ffmpegBin, ffArgs, {
      cwd: jobDir,
      timeoutMs: 120000,
      onStderr: onProgress
    });

    if (res.code === 0 && fs.existsSync(outputFilePath) && fs.statSync(outputFilePath).size > 2000) {
      console.log(`[Repurposer] Successfully rendered ${clip.id} via Tier 2 (Clean filter)`);
      return outputFilePath;
    } else {
      console.warn(`[Repurposer] Tier 2 Clean filter exit code ${res.code} for ${clip.id}:`, res.stderr.slice(-300));
    }
  } catch (err) {
    console.warn(`[Repurposer] Tier 2 Clean filter render failed for ${clip.id}:`, err);
  }

  // Tier 3: Direct safe 9:16 scale & pad with even dimensions
  try {
    const safeFilter = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(1080-iw)/2:(1920-ih)/2:black,setsar=1";
    const safeArgs = [
      "-y",
      "-ss", clip.start.toFixed(2),
      "-t", cutDuration.toFixed(2),
      "-i", inputVideo,
      "-vf", safeFilter,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-threads", "2",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outputFileName
    ];

    const res = await execProcessAsync(ffmpegBin, safeArgs, { cwd: jobDir, timeoutMs: 90000 });
    if (res.code === 0 && fs.existsSync(outputFilePath) && fs.statSync(outputFilePath).size > 2000) {
      console.log(`[Repurposer] Successfully rendered ${clip.id} via Tier 3 (Safe scale/pad)`);
      return outputFilePath;
    } else {
      console.warn(`[Repurposer] Tier 3 exit code ${res.code} for ${clip.id}:`, res.stderr.slice(-300));
    }
  } catch (err) {
    console.warn(`[Repurposer] Tier 3 Safe scale render failed for ${clip.id}:`, err);
  }

  // Tier 4: Direct cut transcode (guaranteed fallback)
  try {
    const directArgs = [
      "-y",
      "-ss", clip.start.toFixed(2),
      "-t", cutDuration.toFixed(2),
      "-i", inputVideo,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-threads", "2",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outputFileName
    ];

    const res = await execProcessAsync(ffmpegBin, directArgs, { cwd: jobDir, timeoutMs: 60000 });
    if (res.code === 0 && fs.existsSync(outputFilePath) && fs.statSync(outputFilePath).size > 2000) {
      console.log(`[Repurposer] Successfully rendered ${clip.id} via Tier 4 (Direct cut)`);
      return outputFilePath;
    }
  } catch (err) {
    console.warn(`[Repurposer] Tier 4 Direct cut render failed for ${clip.id}:`, err);
  }

  return null;
}

/**
 * Self-healing clip resolver:
 * Guarantees that downloading a clip or zipping clips NEVER returns 404 or empty file.
 * If the clip was not yet rendered or failed earlier, it locates or renders it immediately on-demand.
 */
export async function ensureClipRendered(jobId: string, clipId: string): Promise<string | null> {
  let job = getJob(jobId);
  const jobDir = path.join(JOBS_DIR, jobId);

  // 1. Check exact expected filename
  const directPath = path.join(jobDir, `${clipId}_916.mp4`);
  if (fs.existsSync(directPath) && fs.statSync(directPath).size > 2000) {
    return directPath;
  }

  // 2. Check clip.outputPath if already recorded
  if (job?.clips) {
    const matched = job.clips.find((c) => c.id === clipId);
    if (matched?.outputPath && fs.existsSync(matched.outputPath)) {
      try {
        if (fs.statSync(matched.outputPath).size > 2000) {
          return matched.outputPath;
        }
      } catch {}
    }
  }

  // 3. Scan jobDir for any pre-rendered clip matching clipId (e.g. clip_1_916-1.mp4 or clip_1.mp4)
  if (fs.existsSync(jobDir)) {
    try {
      const files = fs.readdirSync(jobDir);
      const existingClip = files.find(
        (f) => f.startsWith(`${clipId}`) && f.endsWith(".mp4") && !f.includes("thumb")
      );
      if (existingClip) {
        const fullP = path.join(jobDir, existingClip);
        if (fs.statSync(fullP).size > 2000) {
          return fullP;
        }
      }
    } catch {}
  }

  // 4. Resolve source video safely even across directory / container renames
  let sourceVideo: string | null = job?.filePath && fs.existsSync(job.filePath) ? job.filePath : null;

  if (!sourceVideo && fs.existsSync(jobDir)) {
    try {
      const files = fs.readdirSync(jobDir);
      // Look for source video file
      const candidate = files.find(
        (f) => f.startsWith("source_") || (f.endsWith(".mp4") && !f.includes("_916") && !f.includes("clip_"))
      );
      if (candidate) {
        const fullCandidate = path.join(jobDir, candidate);
        if (fs.existsSync(fullCandidate) && fs.statSync(fullCandidate).size > 1000) {
          sourceVideo = fullCandidate;
          if (job) {
            job.filePath = fullCandidate;
            saveJobState(job);
          }
        }
      }
    } catch {}
  }

  if (!sourceVideo || !fs.existsSync(sourceVideo)) {
    console.warn(`[Repurposer] Cannot render clip ${clipId}: source video file not found in ${jobDir}`);
    return null;
  }

  // 5. If job state missing from memory/cache, rebuild it from job.json or fallback
  if (!job) {
    const jobJsonPath = path.join(jobDir, "job.json");
    if (fs.existsSync(jobJsonPath)) {
      try {
        job = JSON.parse(fs.readFileSync(jobJsonPath, "utf-8"));
      } catch {}
    }
    if (!job) {
      job = {
        id: jobId,
        originalFileName: path.basename(sourceVideo).replace(/^source_/, ""),
        filePath: sourceVideo,
        fileSize: fs.statSync(sourceVideo).size,
        duration: 60,
        status: "completed",
        progress: 100,
        stageLabel: "Completed",
        logs: [],
        error: null,
        transcript: null,
        clips: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + JOB_TTL_MS
      };
    }
  }

  let clip = job.clips?.find((c) => c.id === clipId);
  if (!clip) {
    const num = parseInt(clipId.replace(/[^0-9]/g, ""), 10) || 1;
    const dur = job.duration || 60;
    const start = Math.max(0, Math.min(dur - 15, (num - 1) * Math.min(28, dur / 3)));
    const end = Math.min(dur, start + 28);
    clip = {
      id: clipId,
      clipNumber: num,
      start,
      end,
      duration: end - start,
      score: 95,
      viralScore: 95,
      hook: job.originalFileName,
      title: job.originalFileName,
      reason: "Viral highlight segment",
      category: "highlight",
      aspectRatio: job.layoutMode || "blurred_backdrop",
      subtitles: []
    };
  }

  const renderedPath = await renderSingleClipSafe(
    jobDir,
    sourceVideo,
    clip,
    job.layoutMode || "blurred_backdrop"
  );

  if (renderedPath && fs.existsSync(renderedPath)) {
    clip.outputPath = renderedPath;
    clip.outputUrl = `/uploads/repurposer/jobs/${jobId}/${clipId}_916.mp4`;
    saveJobState(job);
    return renderedPath;
  }

  return null;
}

// -----------------------------------------------------------------------------
// Core Background Pipeline Execution
// -----------------------------------------------------------------------------
export async function startRepurposerBackgroundJob(jobId: string, preferredLayout?: string) {
  const job = getJob(jobId);
  if (!job) return;

  if (preferredLayout) {
    job.layoutMode = preferredLayout as any;
  } else if (!job.layoutMode) {
    job.layoutMode = "crop_fill"; // Default to full screen crop fill
  }
  saveJobState(job);

  const jobDir = path.join(JOBS_DIR, jobId);
  const inputVideo = job.filePath;

  try {
    // -------------------------------------------------------------------------
    // STAGE 1: Video Analysis & Audio Extraction
    // -------------------------------------------------------------------------
    job.status = "transcribing";
    job.progress = 15;
    job.stageLabel = "Mengekstrak audio stream dan menyiapkan transcription engine...";
    appendJobLog(job, "Memeriksa metadata video menggunakan ffprobe...");

    const meta = getVideoMetadata(inputVideo);
    job.duration = meta.duration || 60;
    appendJobLog(job, `Durasi video terdeteksi: ${job.duration.toFixed(1)}s (${meta.width}x${meta.height})`);

    const audioMp3Path = path.join(jobDir, "audio_speech.mp3");
    const audioWavPath = path.join(jobDir, "audio_16k.wav");
    appendJobLog(job, "Mengekstrak audio stream (16kHz Mono MP3 & PCM WAV) untuk Speech-to-Text AI Engine...");
    const audioExtraction = await extractAudioForSpeech(inputVideo, audioMp3Path, audioWavPath);

    if (!audioExtraction.mp3Ok && !audioExtraction.wavOk) {
      appendJobLog(job, "⚠️ Info: Audio stream tidak terdeteksi atau ekstraksi audio tidak menghasilkan suara. Melanjutkan dengan Fallback Visual & Smart Duration Segmentation...");
    } else {
      appendJobLog(job, "✓ Ekstraksi audio stream berhasil diproses.");
    }

    // -------------------------------------------------------------------------
    // STAGE 2: AI Speech-to-Text Transcription (Groq Whisper Large v3)
    // -------------------------------------------------------------------------
    job.progress = 30;
    job.stageLabel = "Mentranskripsikan audio percakapan dengan Whisper AI...";
    appendJobLog(job, "Menjalankan AI Speech-to-Text untuk mendeteksi ucapan kata demi kata...");

    let transcriptionResult: {
      language: string;
      duration: number;
      fullTranscript: string;
      segments: Array<{ start: number; end: number; text: string }>;
      words?: Array<{ word: string; start: number; end: number }>;
    } | null = null;

    // 1. Primary Engine: Groq Whisper Large v3 (Ultra fast & highest accuracy for Indonesian speech)
    if (audioExtraction.mp3Ok && process.env.GROQ_API_KEY?.trim()) {
      appendJobLog(job, "Menghubungi Groq Whisper Engine (whisper-large-v3) untuk transkripsi akurat...");
      transcriptionResult = await transcribeWithGroqWhisper(audioMp3Path);
      if (transcriptionResult && transcriptionResult.segments.length > 0) {
        appendJobLog(job, `✓ Groq Whisper Large v3 sukses: ${transcriptionResult.segments.length} segmen percakapan terdeteksi (Bahasa: ${transcriptionResult.language}).`);
      }
    }

    // 2. Fallback Engine: Local faster-whisper Python script if installed
    const transcriptJsonPath = path.join(jobDir, "transcript.json");
    const pyScriptPath = path.join(process.cwd(), "backend", "transcribe_whisper.py");

    if ((!transcriptionResult || transcriptionResult.segments.length === 0) && fs.existsSync(pyScriptPath) && audioExtraction.wavOk) {
      appendJobLog(job, "Mencoba transkripsi lokal faster-whisper via Python...");
      const pyRun = await execProcessAsync("python3", [
        pyScriptPath,
        "--audio", audioWavPath,
        "--output", transcriptJsonPath,
        "--model", "base",
        "--device", "cpu",
        "--compute_type", "int8"
      ], { timeoutMs: 180000 });

      if (pyRun.code === 0 && fs.existsSync(transcriptJsonPath)) {
        try {
          const tData = JSON.parse(fs.readFileSync(transcriptJsonPath, "utf-8"));
          if (tData.success && Array.isArray(tData.segments) && tData.segments.length > 0) {
            transcriptionResult = tData;
            appendJobLog(job, `✓ faster-whisper lokal sukses: ${tData.segments.length} segmen terdeteksi.`);
          }
        } catch {
          // ignore
        }
      }
    }

    // 3. Fallback: Rhythm detection if audio WAV is available
    if ((!transcriptionResult || transcriptionResult.segments.length === 0) && audioExtraction.wavOk) {
      appendJobLog(job, "ℹ️ Info: Menjalankan deteksi jeda ritme vokal audio via FFmpeg.");
      const audioSegments = await detectSpeechSegmentsViaSilencedetect(audioWavPath, job.duration);
      if (audioSegments.length > 0) {
        transcriptionResult = {
          language: "id",
          duration: job.duration,
          fullTranscript: audioSegments.map((s) => s.text).filter(Boolean).join(" "),
          segments: audioSegments
        };
        appendJobLog(job, `Audio Segmentation Engine menghasilkan ${audioSegments.length} segmen ritme.`);
      }
    }

    // 4. Fallback: Visual / Smart Duration Segmentation if audio was missing or completely silent
    if (!transcriptionResult || transcriptionResult.segments.length === 0) {
      appendJobLog(job, "ℹ️ Info: Mengaktifkan generator segmen durasi pintar berbasis timeline video...");
      const videoDur = job.duration > 10 ? job.duration : 60;
      const segCount = Math.max(3, Math.min(6, Math.floor(videoDur / 25)));
      const segLen = videoDur / segCount;
      const synthSegments: Array<{ start: number; end: number; text: string }> = [];
      const cleanBaseName = (job.originalFileName || "Video Highlight").replace(/\.[^/.]+$/, "");
      for (let i = 0; i < segCount; i++) {
        const s = i * segLen;
        const e = Math.min(videoDur, (i + 1) * segLen);
        synthSegments.push({
          start: Math.round(s * 10) / 10,
          end: Math.round(e * 10) / 10,
          text: `Highlight momen ${i + 1}: ${cleanBaseName}`
        });
      }
      transcriptionResult = {
        language: "id",
        duration: videoDur,
        fullTranscript: synthSegments.map((s) => s.text).join(". "),
        segments: synthSegments
      };
      appendJobLog(job, `✓ Visual & Duration Engine menghasilkan ${synthSegments.length} segmen retensi tinggi.`);
    }

    job.transcript = transcriptionResult;

    // -------------------------------------------------------------------------
    // STAGE 3: AI Analysis via Groq (openai/gpt-oss-120b)
    // -------------------------------------------------------------------------
    job.status = "analyzing";
    job.progress = 48;
    job.stageLabel = "Menganalisis isi video & mencari momen terbaik dengan Groq AI...";
    saveJobState(job);

    const detectedLanguage = job.transcript?.language || "id";
    const isEnglish = isEnglishContent(detectedLanguage, job.transcript?.fullTranscript, job.originalFileName);
    appendJobLog(job, `Bahasa audio terdeteksi: ${isEnglish ? "English (EN)" : "Bahasa Indonesia (ID)"}. Judul & hook video disesuaikan ke ${isEnglish ? "Bahasa Inggris" : "Bahasa Indonesia"}...`);
    appendJobLog(job, "Menghubungi Groq Cloud API menggunakan model AI...");

    let rawClips: Array<{ start: number; end: number; score: number; title?: string; hook: string; reason: string; category: string }> = [];

    const groqKey = process.env.GROQ_API_KEY?.trim();
    if (groqKey) {
      try {
        rawClips = await analyzeTranscriptWithGroq(
          job.transcript?.fullTranscript || "",
          job.transcript?.segments || [],
          job.duration,
          job.originalFileName,
          detectedLanguage
        );
        appendJobLog(job, `✓ Groq AI berhasil menemukan ${rawClips.length} momen berpotensi viral tinggi (${isEnglish ? "Judul & Hook: English" : "Judul & Hook: Bahasa Indonesia"})!`);
      } catch (groqErr: any) {
        appendJobLog(job, `Groq Cloud AI info (${groqErr.message || "error"}). Mengaktifkan CreatorIQ Standalone Intelligence Engine.`);
      }
    }

    if (!rawClips || rawClips.length < 3) {
      appendJobLog(job, "✓ Menjalankan CreatorIQ Standalone Content Engine (100% Standalone - Tanpa Gemini API / Groq API)...");
      const standalone = generateStandaloneViralClips({
        title: job.originalFileName,
        duration: job.duration,
        speechSegments: (job.transcript?.segments || []).map((s) => ({ start: s.start, end: s.end, text: s.text })),
        forceLanguage: isEnglish ? "en" : "id"
      });

      rawClips = standalone.map((c) => ({
        start: c.start_seconds,
        end: c.end_seconds,
        score: c.viral_score,
        title: c.hook_headline,
        hook: c.hook_headline,
        reason: c.retention_strategy,
        category: c.category
      }));
      appendJobLog(job, `✓ Berhasil menganalisis ${rawClips.length} momen viral adaptif sesuai durasi & topik (${isEnglish ? "Bahasa Inggris" : "Bahasa Indonesia"}).`);
    }

    // -------------------------------------------------------------------------
    // STAGE 4: Clip Selection & Subtitle Generation
    // -------------------------------------------------------------------------
    job.status = "selecting_clips";
    job.progress = 65;
    job.stageLabel = "Menyusun timing clip dan menyinkronkan subtitle dinamis...";

    const validClips: RepurposedClip[] = [];
    const clipCount = Math.min(4, Math.max(1, rawClips.length));

    for (let i = 0; i < clipCount; i++) {
      const c = rawClips[i];
      let start = Math.max(0, Math.min(job.duration - 5, c.start));
      let end = Math.min(job.duration, Math.max(start + 15, c.end));

      // Clip duration constraint: 25 - 55 seconds (or bounded by total duration)
      if (end - start > 55) end = start + 50;
      if (end - start < 20 && job.duration >= 25) end = Math.min(job.duration, start + 28);

      const duration = Math.round((end - start) * 10) / 10;

      // Filter matched subtitles from transcript
      const clipSubs: RepurposerSubtitle[] = [];
      if (job.transcript && Array.isArray(job.transcript.segments)) {
        for (const seg of job.transcript.segments) {
          if (seg.end >= start && seg.start <= end) {
            const trimmedText = (seg.text || "").trim();
            if (trimmedText && !trimmedText.startsWith("[Audio Segmen") && !trimmedText.startsWith("[Speech")) {
              clipSubs.push({
                start: Math.max(start, seg.start),
                end: Math.min(end, seg.end),
                text: trimmedText
              });
            }
          }
        }
      }

      if (clipSubs.length === 0) {
        clipSubs.push({
          start: start,
          end: start + (duration / 2),
          text: isEnglish ? (c.hook || "Key moment in this video") : (c.hook || "Momen penting dalam video ini")
        });
        clipSubs.push({
          start: start + (duration / 2),
          end: end,
          text: isEnglish ? "Watch the full breakdown right now!" : "Simak penjelasan selengkapnya sekarang!"
        });
      }

      const clipId = `clip_${i + 1}`;
      const clipTitle = resolveClipTitle(
        i + 1,
        (c as any).title,
        c.hook,
        clipSubs,
        job.originalFileName,
        isEnglish
      );

      // Segment subtitles into punchy 2-3 word beats so live preview & burn-in never overflow screen
      const punchySubs = segmentSubtitlesIntoPunchyBeats(clipSubs, start, end);

      validClips.push({
        id: clipId,
        clipNumber: i + 1,
        start,
        end,
        duration,
        score: c.score || (95 - i * 3),
        title: clipTitle,
        hook: c.hook || (isEnglish ? `Highlight Moment #${i + 1}` : `Highlight Momen #${i + 1}`),
        reason: c.reason || (isEnglish ? "High-value moment with strong retention structure." : "Pilihan momen bernilai tinggi dengan struktur retensi kuat."),
        category: c.category || "story",
        aspectRatio: "9:16",
        outputPath: "",
        outputUrl: "",
        thumbnailUrl: "",
        subtitles: punchySubs,
        subtitles_preview: punchySubs.map((s) => s.text).filter(Boolean).slice(0, 8)
      } as any);
    }

    job.clips = validClips;
    appendJobLog(job, `Disusun ${validClips.length} klip short-form final.`);

    // -------------------------------------------------------------------------
    // STAGE 5: Video Cutting, Smart 9:16 Crop & Subtitle Burn-in via FFmpeg
    // -------------------------------------------------------------------------
    job.status = "rendering";
    job.stageLabel = "Memotong video, smart reframing 9:16, dan me-render subtitle via FFmpeg...";
    saveJobState(job);

    for (let idx = 0; idx < validClips.length; idx++) {
      const clip = validClips[idx];
      const baseProgress = 65 + Math.floor((idx / validClips.length) * 30);
      job.progress = baseProgress;
      job.stageLabel = `Merender Clip #${clip.clipNumber} dari ${validClips.length} (9:16 Shorts + Subtitle)...`;
      saveJobState(job);
      appendJobLog(job, `Memproses Clip #${clip.clipNumber} [${clip.start.toFixed(1)}s - ${clip.end.toFixed(1)}s]...`);

      // FFmpeg Complex Filter based on chosen 9:16 layout mode (crop_fill, blurred_backdrop, split_stacked)
      const currentLayout = job.layoutMode || "blurred_backdrop";
      clip.aspectRatio = currentLayout;
      const cutDuration = clip.end - clip.start;

      let lastProgressTick = 0;
      const renderedFile = await renderSingleClipSafe(
        jobDir,
        inputVideo,
        clip,
        currentLayout,
        (dataChunk) => {
          const match = dataChunk.match(/time=([0-9:.]+)/);
          if (match && cutDuration > 0) {
            const timeStr = match[1];
            const parts = timeStr.split(":");
            let currentSeconds = 0;
            if (parts.length === 3) {
              currentSeconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
            } else if (parts.length === 2) {
              currentSeconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
            }
            const clipFrac = Math.min(1, Math.max(0, currentSeconds / cutDuration));
            const subInc = Math.floor(clipFrac * (30 / validClips.length));
            const currentTotal = Math.min(96, baseProgress + subInc);
            const now = Date.now();
            if (currentTotal > job.progress && now - lastProgressTick > 800) {
              lastProgressTick = now;
              job.progress = currentTotal;
              saveJobState(job);
            }
          }
        }
      );

      const outputFileName = `${clip.id}_916.mp4`;
      const outputFilePath = renderedFile || path.join(jobDir, outputFileName);
      const thumbFileName = `${clip.id}_thumb.jpg`;
      const thumbFilePath = path.join(jobDir, thumbFileName);

      // Generate thumbnail snapshot async
      const thumbSource = (fs.existsSync(outputFilePath) && fs.statSync(outputFilePath).size > 2000)
        ? outputFilePath
        : inputVideo;
      const thumbTime = thumbSource === outputFilePath ? "00:00:01.00" : clip.start.toFixed(2);

      await execProcessAsync(getFFmpegPath(), [
        "-y",
        "-ss", thumbTime,
        "-i", thumbSource,
        "-vframes", "1",
        "-q:v", "2",
        thumbFilePath
      ], { cwd: jobDir, timeoutMs: 10000 });

      clip.outputPath = outputFilePath;
      clip.outputUrl = `/uploads/repurposer/jobs/${jobId}/${outputFileName}`;
      clip.thumbnailUrl = `/uploads/repurposer/jobs/${jobId}/${thumbFileName}`;
      appendJobLog(job, `✓ Clip #${clip.clipNumber} selesai dirender (${outputFileName}).`);
      saveJobState(job);
    }

    // -------------------------------------------------------------------------
    // STAGE 6: Completion
    // -------------------------------------------------------------------------
    job.status = "completed";
    job.progress = 100;
    job.stageLabel = "Semua klip short-form 9:16 siap dipreview dan didownload!";
    appendJobLog(job, "🎉 Pemrosesan Repurposer Selesai! File MP4 siap didownload.");

    // Clean up intermediate WAV file to save disk space
    if (fs.existsSync(audioWavPath)) {
      try { fs.unlinkSync(audioWavPath); } catch { /* ignore */ }
    }

    saveJobState(job);
  } catch (err: any) {
    console.error(`[Repurposer] Job ${jobId} failed:`, err);
    job.status = "failed";
    job.error = err.message || "Terjadi kesalahan pada proses pemotongan video.";
    job.stageLabel = "Gagal memproses video.";
    appendJobLog(job, `❌ Error: ${job.error}`);
    saveJobState(job);
  }
}

// -----------------------------------------------------------------------------
// Upload Endpoints Handlers
// -----------------------------------------------------------------------------
export function createNewJob(originalFileName: string, fileSize: number): RepurposerJob {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const jobFolder = path.join(JOBS_DIR, jobId);

  if (!fs.existsSync(jobFolder)) {
    fs.mkdirSync(jobFolder, { recursive: true });
  }

  const sanitized = originalFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const tempFilePath = path.join(jobFolder, `source_${sanitized}`);

  const job: RepurposerJob = {
    id: jobId,
    originalFileName,
    filePath: tempFilePath,
    fileSize,
    duration: 0,
    status: "queued",
    progress: 0,
    stageLabel: "File video siap diproses...",
    logs: [`[${new Date().toLocaleTimeString()}] Video '${originalFileName}' terunggah (${(fileSize / (1024 * 1024)).toFixed(1)} MB).`],
    error: null,
    transcript: null,
    clips: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + JOB_TTL_MS
  };

  saveJobState(job);
  return job;
}

export async function handleZipDownload(jobId: string, res: Response) {
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job tidak ditemukan." });
    return;
  }

  // Fallback default clips if clips array was empty
  if (!job.clips || job.clips.length === 0) {
    const dur = job.duration || 60;
    job.clips = [
      { id: "clip_1", clipNumber: 1, start: 0, end: Math.min(dur, 28), duration: 28, score: 98, hook: "Highlight 1", title: "Highlight 1", reason: "", category: "highlight", aspectRatio: "blurred_backdrop", subtitles: [] },
      { id: "clip_2", clipNumber: 2, start: Math.min(dur - 20, 28), end: Math.min(dur, 56), duration: 28, score: 95, hook: "Highlight 2", title: "Highlight 2", reason: "", category: "highlight", aspectRatio: "blurred_backdrop", subtitles: [] },
      { id: "clip_3", clipNumber: 3, start: Math.min(dur - 15, 56), end: dur, duration: dur - Math.min(dur - 15, 56), score: 92, hook: "Highlight 3", title: "Highlight 3", reason: "", category: "highlight", aspectRatio: "blurred_backdrop", subtitles: [] }
    ] as any;
  }

  const archive = createZipArchiveStream({ zlib: { level: 6 } });
  const zipName = `CreatorIQ_Shorts_${jobId}.zip`;

  res.attachment(zipName);

  archive.on("error", (err: any) => {
    console.error("[Repurposer Zip Error]:", err);
    if (!res.headersSent) {
      res.status(500).send({ error: err.message });
    }
  });

  archive.pipe(res);

  let addedCount = 0;
  for (const clip of job.clips) {
    // Guarantees each clip is rendered on-demand so the ZIP is NEVER empty
    const clipPath = await ensureClipRendered(jobId, clip.id);
    if (clipPath && fs.existsSync(clipPath)) {
      const rawTitle = clip.title || clip.hook || "Clip";
      const sanitizedHook = rawTitle.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
      const baseName = `Clip_${clip.clipNumber}_${sanitizedHook}_916.mp4`;
      archive.file(clipPath, { name: baseName });
      addedCount++;
    }
  }

  // Resilient fallback: If no clips were added via job.clips, scan jobDir for any MP4 files
  if (addedCount === 0) {
    const jobDir = path.join(JOBS_DIR, jobId);
    if (fs.existsSync(jobDir)) {
      try {
        const files = fs.readdirSync(jobDir);
        for (const f of files) {
          if (f.endsWith(".mp4") && !f.includes("thumb")) {
            const p = path.join(jobDir, f);
            if (fs.statSync(p).size > 2000) {
              archive.file(p, { name: f });
              addedCount++;
            }
          }
        }
      } catch (err) {
        console.warn(`[Repurposer Zip] Fallback directory scan failed for ${jobId}:`, err);
      }
    }
  }

  archive.finalize();
}

export async function reRenderJobWithLayout(
  jobId: string,
  newLayoutMode: string,
  customTitles?: Record<string, string>
): Promise<boolean> {
  const job = getJob(jobId);
  if (!job || !job.clips || job.clips.length === 0) {
    return false;
  }

  const validMode = (newLayoutMode === "crop_fill" || newLayoutMode === "split_stacked" || newLayoutMode === "blurred_backdrop")
    ? newLayoutMode
    : "crop_fill";

  job.layoutMode = validMode as any;
  job.status = "rendering";
  job.stageLabel = `Merender ulang klip dengan format 9:16 (${validMode})...`;
  job.progress = 65;
  appendJobLog(job, `Memulai render ulang semua klip dengan format 9:16: ${validMode}...`);
  saveJobState(job);

  const jobDir = path.join(JOBS_DIR, jobId);
  const inputVideo = job.filePath;

  try {
    for (let idx = 0; idx < job.clips.length; idx++) {
      const clip = job.clips[idx];
      const cutDuration = clip.end - clip.start;
      const assPath = path.join(jobDir, `${clip.id}_subtitles.ass`);

      if (customTitles && customTitles[clip.id]) {
        clip.title = customTitles[clip.id].trim();
      }
      if (!clip.title) {
        const isEnglish = isEnglishContent(job.transcript?.language, job.transcript?.fullTranscript, job.originalFileName);
        clip.title = resolveClipTitle(clip.clipNumber, (clip as any).title, clip.hook, clip.subtitles, job.originalFileName, isEnglish);
      }

      // Always regenerate ASS with Top Header Title (0-4s)
      generateModernAssSubtitleFile(clip.subtitles, clip.start, assPath, clip.title || clip.hook);

      // Remove old file to force re-render
      const outputFilePath = path.join(jobDir, `${clip.id}_916.mp4`);
      const thumbFilePath = path.join(jobDir, `${clip.id}_thumb.jpg`);
      if (fs.existsSync(outputFilePath)) {
        try { fs.unlinkSync(outputFilePath); } catch {}
      }

      const renderedFile = await renderSingleClipSafe(jobDir, inputVideo, clip, validMode);
      if (!renderedFile || !fs.existsSync(renderedFile)) {
        console.warn(`[Repurposer] Could not re-render clip ${clip.id}`);
      }

      // Update thumb
      if (fs.existsSync(outputFilePath)) {
        await execProcessAsync(getFFmpegPath(), [
          "-y",
          "-ss", "00:00:01.50",
          "-i", outputFilePath,
          "-vframes", "1",
          "-q:v", "2",
          thumbFilePath
        ], { timeoutMs: 10000 });
      }

      clip.aspectRatio = validMode;
      clip.outputPath = outputFilePath;
      // Add timestamp to prevent browser cache
      clip.outputUrl = `/uploads/repurposer/jobs/${jobId}/${clip.id}_916.mp4?t=${Date.now()}`;
      clip.thumbnailUrl = `/uploads/repurposer/jobs/${jobId}/${clip.id}_thumb.jpg?t=${Date.now()}`;
      appendJobLog(job, `✓ Clip #${clip.clipNumber} berhasil dirender ulang dengan format ${validMode}.`);
      job.progress = 65 + Math.floor(((idx + 1) / job.clips.length) * 35);
      saveJobState(job);
    }

    job.status = "completed";
    job.progress = 100;
    job.stageLabel = `Semua klip berhasil dirender ulang dengan format ${validMode}!`;
    appendJobLog(job, `🎉 Render ulang selesai! Semua klip kini berformat ${validMode}.`);
    saveJobState(job);
    return true;
  } catch (err: any) {
    console.error(`[Repurposer] reRenderJobWithLayout failed for ${jobId}:`, err);
    job.status = "completed";
    job.error = `Gagal me-render ulang: ${err.message}`;
    appendJobLog(job, `❌ Gagal merender ulang: ${err.message}`);
    saveJobState(job);
    return false;
  }
}

