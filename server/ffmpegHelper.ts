import fs from "fs";
import { spawnSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

let cachedFFmpegPath: string | null = null;
let cachedFFprobePath: string | null = null;

function testExecutable(binPath: string, arg = "-version"): boolean {
  try {
    if (fs.existsSync(binPath)) {
      try {
        fs.chmodSync(binPath, 0o755);
      } catch {}
    }
    const res = spawnSync(binPath, [arg], { timeout: 3000, windowsHide: true });
    return res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Returns the verified working path to the FFmpeg executable.
 * Tests candidate paths (env var, ffmpeg-static, system nixpacks/binaries)
 * and verifies execution before caching.
 */
export function getFFmpegPath(): string {
  if (cachedFFmpegPath) return cachedFFmpegPath;

  const candidates: string[] = [];

  if (process.env.FFMPEG_PATH) {
    candidates.push(process.env.FFMPEG_PATH);
  }
  if (typeof ffmpegStatic === "string") {
    candidates.push(ffmpegStatic);
  }
  candidates.push("ffmpeg");
  candidates.push("/usr/bin/ffmpeg");
  candidates.push("/usr/local/bin/ffmpeg");
  candidates.push("/root/.nix-profile/bin/ffmpeg");

  for (const candidate of candidates) {
    if (testExecutable(candidate)) {
      console.log(`[FFmpegHelper] Verified working FFmpeg executable: ${candidate}`);
      cachedFFmpegPath = candidate;
      return candidate;
    }
  }

  console.warn("[FFmpegHelper] No verified FFmpeg executable passed test, defaulting to 'ffmpeg'");
  cachedFFmpegPath = "ffmpeg";
  return "ffmpeg";
}

/**
 * Returns the verified working path to the FFprobe executable.
 * Tests candidate paths (env var, ffprobe-static, system nixpacks/binaries)
 * and verifies execution before caching.
 */
export function getFFprobePath(): string {
  if (cachedFFprobePath) return cachedFFprobePath;

  const candidates: string[] = [];

  if (process.env.FFPROBE_PATH) {
    candidates.push(process.env.FFPROBE_PATH);
  }
  const probePath = (ffprobeStatic as any)?.path;
  if (typeof probePath === "string") {
    candidates.push(probePath);
  }
  candidates.push("ffprobe");
  candidates.push("/usr/bin/ffprobe");
  candidates.push("/usr/local/bin/ffprobe");
  candidates.push("/root/.nix-profile/bin/ffprobe");

  for (const candidate of candidates) {
    if (testExecutable(candidate)) {
      console.log(`[FFmpegHelper] Verified working FFprobe executable: ${candidate}`);
      cachedFFprobePath = candidate;
      return candidate;
    }
  }

  console.warn("[FFmpegHelper] No verified FFprobe executable passed test, defaulting to 'ffprobe'");
  cachedFFprobePath = "ffprobe";
  return "ffprobe";
}
