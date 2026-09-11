import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import {
  createNewJob,
  getJob,
  getLatestJob,
  getClipFilePath,
  ensureClipRendered,
  startRepurposerBackgroundJob,
  reRenderJobWithLayout,
  handleZipDownload,
  cleanupJobDirectory,
  removeJobFromMemory,
  isEnglishContent,
  getActiveGroqModels,
  isTemplateTitle
} from "./server/repurposer";
import {
  initCleanupManager,
  getCleanupStatus,
  executeCleanup,
  saveCleanupConfig
} from "./server/cleanupManager";
import {
  runThumbnailVisionPipeline,
  runThumbnailPipelineFromFrames,
  probeVideoMetadata
} from "./server/thumbnailVisionPipeline";
import { generateStandaloneViralClips } from "./server/viralIntelligence";

// Load environment variables from root .env
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Ensure upload directories exist
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const OUTPUTS_DIR = path.join(UPLOADS_DIR, "outputs");
if (!fs.existsSync(OUTPUTS_DIR)) {
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
}
app.use("/uploads", express.static(UPLOADS_DIR));

// Direct redirect from old studio.html URL to primary root Studio
app.get("/studio.html", (req, res) => {
  res.redirect("/");
});

// -------------------------------------------------------------
// YouTube Data API v3 Helper
// -------------------------------------------------------------
async function fetchYouTubeCompetitors(query: string, channelUrl?: string) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return { available: false, summary: "YouTube API key not configured", videos: [] };
  }

  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
      query
    )}&maxResults=5&type=video&order=relevance&key=${apiKey}`;

    const res = await fetch(searchUrl);
    if (!res.ok) {
      console.warn(`YouTube Search API returned status ${res.status}`);
      return { available: false, summary: "YouTube search unavailable", videos: [] };
    }

    const data = await res.json();
    const items = data.items || [];
    if (items.length === 0) {
      return { available: true, summary: "No direct competitor videos found", videos: [] };
    }

    const videoIds = items.map((it: any) => it.id?.videoId).filter(Boolean).join(",");
    let statsMap: Record<string, any> = {};

    if (videoIds) {
      try {
        const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`;
        const statsRes = await fetch(statsUrl);
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          for (const item of statsData.items || []) {
            statsMap[item.id] = {
              viewCount: item.statistics?.viewCount || "0",
              likeCount: item.statistics?.likeCount || "0"
            };
          }
        }
      } catch (err) {
        console.warn("Error fetching YouTube video stats:", err);
      }
    }

    const videos = items.map((it: any) => {
      const vId = it.id?.videoId;
      const snippet = it.snippet || {};
      const stats = statsMap[vId] || {};
      return {
        title: snippet.title || "",
        channelTitle: snippet.channelTitle || "",
        publishedAt: snippet.publishedAt || "",
        viewCount: stats.viewCount || "N/A"
      };
    });

    const summary = videos
      .slice(0, 4)
      .map((v: any, idx: number) => {
        const views = v.viewCount !== "N/A" ? ` (${Number(v.viewCount).toLocaleString()} views)` : "";
        return `${idx + 1}. "${v.title}" by ${v.channelTitle}${views}`;
      })
      .join(" | ");

    return { available: true, summary: summary || "Competitor videos found", videos };
  } catch (error) {
    console.warn("YouTube API fetch error:", error);
    return { available: false, summary: "YouTube competitor data unavailable due to error", videos: [] };
  }
}

// -------------------------------------------------------------
// AI Prompts and Providers (OpenRouter -> Groq Cascade)
// -------------------------------------------------------------
const SYSTEM_PROMPT = `You are an elite YouTube Growth Consultant and Viral Title Optimization AI.
Your job is to analyze a creator's raw video title idea, examine competitor patterns and market trends, and engineer 3 hyper-clickable, high-CTR YouTube titles designed to maximize views and retention without cheap misleading clickbait.

CRITICAL INSTRUCTIONS:
1. NEVER output dummy or generic placeholders (e.g. do NOT output Minecraft titles unless the input is about Minecraft).
2. Adapt titles directly to the topic and language of the user's input (e.g., Indonesian input should get natural, viral Indonesian titles or creator-standard phrasing; English gets high-converting English titles).
3. Calculate an Opportunity Score (0-100) reflecting the topic's viral potential, search interest, and curiosity gap.
4. Output 4 bullet-point reasons explaining why this title formula will perform well.
5. Provide 3 distinct title variations with individual scores (0-100), ranked by performance.
6. The title with the highest score must be selected as best_title.

You MUST respond ONLY with a valid, clean JSON object matching this exact schema:
{
  "opportunity_score": 91,
  "analysis": {
    "keyword_strength": "High search intent around core topic",
    "clickability": "Strong psychological curiosity gap",
    "trend_relevance": "Actively searched format",
    "competition": "Moderate competition with high audience demand"
  },
  "reasons": [
    "Strong emotional hook and curiosity gap",
    "High audience search intent for this topic",
    "Clear content value proposition in under 60 characters",
    "Proven format that drives high initial CTR"
  ],
  "titles": [
    {
      "title": "High CTR Title 1",
      "score": 95
    },
    {
      "title": "High CTR Title 2",
      "score": 90
    },
    {
      "title": "High CTR Title 3",
      "score": 86
    }
  ],
  "best_title": "High CTR Title 1"
}
Do NOT include markdown formatting, backticks, or introductory text. Return only valid JSON.`;

function cleanJson(text: string) {
  if (!text) return null;
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const lines = cleaned.split("\n");
    if (lines[0].startsWith("```")) lines.shift();
    if (lines.length && lines[lines.length - 1].startsWith("```")) lines.pop();
    cleaned = lines.join("\n").trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callOpenRouter(prompt: string) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.log("[OpenRouter] API key not found or empty.");
    return null;
  }

  const model = process.env.OPENROUTER_TEXT_MODEL || "meta-llama/llama-3.1-8b-instruct";
  console.log(`[OpenRouter] Requesting with model: ${model}...`);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://creatoriq.app",
        "X-Title": "CreatorIQ Title Intelligence"
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      const parsed = cleanJson(content);
      if (parsed) {
        console.log("[OpenRouter] Success.");
        return parsed;
      }
      console.warn("[OpenRouter] Non-JSON output:", content?.substring(0, 120));
    } else {
      const errText = await res.text();
      console.warn(`[OpenRouter] HTTP ${res.status}:`, errText);
    }
  } catch (err) {
    console.warn("[OpenRouter] Error:", err);
  }
  return null;
}

async function callGroq(prompt: string) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    console.log("[Groq] API key not found or empty.");
    return null;
  }

  const models = [
    process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-20b",
    "groq/compound"
  ];

  for (const model of models) {
    try {
      console.log(`[Groq] Requesting with model: ${model}...`);
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          response_format: { type: "json_object" }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        const parsed = cleanJson(content);
        if (parsed) {
          console.log(`[Groq] Success with ${model}.`);
          return parsed;
        }
      } else {
        console.warn(`[Groq] (${model}) HTTP ${res.status}:`, await res.text());
      }
    } catch (err) {
      console.warn(`[Groq] (${model}) error:`, err);
    }
  }
  return null;
}

// -------------------------------------------------------------
// Groq Thumbnail AI Engine (Primary AI Engine)
// -------------------------------------------------------------
const THUMBNAIL_SYSTEM_PROMPT = `You are CreatorIQ's elite YouTube Thumbnail Art Director and Viral Click Specialist (trained on top 2026 YouTube creators like MrBeast, Vox, MagnatesMedia, and top creators worldwide).
Your task is to analyze the video topic, title, description, and keywords, and architect 3 ultra-modern, high-CTR YouTube thumbnail concepts with visual prompts and high-converting hook text.

CRITICAL DIRECTIVES:
1. STRICT TOPIC GROUNDING: Ground the visuals strictly in the REAL TOPIC, actual subjects, teams, people, products, or events in the video. NEVER use generic unrelated fantasy or prehistoric volcano survival unless the video is specifically about that. If the video is sports/football (e.g. Timnas Indonesia vs Australia), feature intense real match action, players, stadium atmosphere, scoreboard, referee, or trophy. If tech, feature the exact device. If gaming, feature the game characters and action.
2. NATIVE LANGUAGE HOOK TEXT: Detect the language of the video title and description.
   - If Indonesian: output explosive, modern viral Indonesian text in 2-4 words ALL CAPS (e.g., 'GARUDA MENANG?!', 'GAK MASUK AKAL!', 'DETIK TERAKHIR!', 'BIKIN MERINDING!', 'SKOR GILA!').
   - If English: output high-curiosity English hook text in 2-4 words ALL CAPS (e.g., 'THEY DID IT?!', 'SHOCKING ENDING', 'UNREAL COMEBACK', 'DON'T DO THIS!').
   - Always 2 to 4 words maximum, punchy and clickable.
3. THREE DISTINCT 2026 HIGH-CTR COMPOSITIONS:
   - Variation A (Best CTR - Subject Emotion / Action): Intense close-up subject reaction or climactic motion, vibrant rim lighting (electric amber, cyan, or crimson), crisp foreground separation with shallow depth of field, leaving clean space for bold typography.
   - Variation B (Curiosity Gap / Decisive Climax): The pivotal mystery moment, shocking split-screen, anomaly, or high-stakes turning point.
   - Variation C (Cinematic Epic Scale): Dynamic wide-angle or cinematic perspective, volumetric stadium/environment lighting, dramatic lens flare, 8k YouTube trending aesthetic.
4. PROMPTS: Detailed FLUX/neural diffusion prompts specifying 8k resolution, ultra-modern YouTube creator viral style, volumetric lighting, high dynamic range, and saturated color grading.

Output MUST be strictly valid JSON matching this exact schema:
{
  "hook_text": "2-4 words explosive viral hook matching video topic and language",
  "variations": [
    {
      "id": "A",
      "concept": "Subject Focused",
      "badge": "Best CTR",
      "ctr_score": 96,
      "hook_text": "HOOK TEXT A",
      "accent_color": "#FFE600",
      "prompt": "Detailed AI image prompt for FLUX describing the specific video topic, dramatic rim lighting, 8k resolution, modern YouTube creator style"
    },
    {
      "id": "B",
      "concept": "Curiosity Hook",
      "badge": "Curiosity Hook",
      "ctr_score": 93,
      "hook_text": "HOOK TEXT B",
      "accent_color": "#00F0FF",
      "prompt": "Detailed AI image prompt for FLUX describing the decisive climax or turning point of the topic, high contrast, viral YouTube style"
    },
    {
      "id": "C",
      "concept": "Cinematic Action",
      "badge": "Cinematic Action",
      "ctr_score": 91,
      "hook_text": "HOOK TEXT C",
      "accent_color": "#FF2E63",
      "prompt": "Detailed AI image prompt for FLUX describing epic scale and atmosphere of the video topic, volumetric lighting, 8k"
    }
  ]
}`;

interface GroqThumbnailAIResult {
  data: {
    hook_text: string;
    variations: Array<{
      id: string;
      concept: string;
      badge: string;
      ctr_score: number;
      prompt: string;
      hook_text?: string;
      accent_color?: string;
    }>;
  };
  model: string;
  tier: "Primary" | "Secondary" | "Fallback";
}

async function callGroqThumbnailAI(
  videoTitle: string,
  aspectRatio: string,
  refUrl?: string,
  videoDetails?: { title?: string; author?: string; description?: string; tags?: string[] } | null
): Promise<GroqThumbnailAIResult | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    console.log("[Thumbnail AI Groq] GROQ_API_KEY not found or empty.");
    return null;
  }

  // Reliable high-speed Groq models with high token limits and stable JSON output
  let primaryModel = process.env.GROQ_THUMBNAIL_MODEL_PRIMARY || "qwen/qwen3.8-27b";
  let secondaryModel = process.env.GROQ_THUMBNAIL_MODEL_SECONDARY || "openai/gpt-oss-120b";

  // Prevent qwen3.6-27b reasoning token limit / json_validate_failed trap on Groq
  if (primaryModel.includes("qwen3.6")) primaryModel = "qwen/qwen3.8-27b";
  if (secondaryModel.includes("qwen3.6")) secondaryModel = "openai/gpt-oss-120b";

  const models: Array<{ name: string; tier: "Primary" | "Secondary" | "Fallback" }> = [
    { name: primaryModel, tier: "Primary" },
    { name: secondaryModel, tier: "Secondary" },
    { name: "openai/gpt-oss-20b", tier: "Fallback" },
    { name: "groq/compound", tier: "Fallback" }
  ];

  const descSnippet = (videoDetails?.description || "").substring(0, 500);
  const tagsSnippet = (videoDetails?.tags || []).slice(0, 10).join(", ");

  const userInstruction = `Analyze this YouTube video topic deeply and generate EXACTLY 3 viral YouTube thumbnail concepts with IDs "A", "B", and "C":
Video Title: "${videoTitle}"
${videoDetails?.author ? `Channel / Creator: "${videoDetails.author}"` : ""}
${descSnippet ? `Video Context / Description: "${descSnippet}"` : ""}
${tagsSnippet ? `Tags / Keywords: "${tagsSnippet}"` : ""}
Target Aspect Ratio: ${aspectRatio}
${refUrl ? "A visual reference keyframe from the video is available." : ""}

CRITICAL OUTPUT REQUIREMENTS:
1. STRICT JSON FORMAT: You MUST return a single valid JSON object strictly matching the specified schema. Output raw JSON only. Do not include markdown or reasoning outside the JSON.
2. STRICT TOPIC FIDELITY: Ground the concepts strictly in the real subjects, people, teams, or objects from the video description and title above.
3. LANGUAGE MATCHING: If the video is in Indonesian, write ALL hook texts in viral Indonesian (2-4 words, uppercase). If in English, write in viral English.
4. GENERATE ALL 3 DISTINCT VARIATIONS (Do not omit C):
   - Variation A (id: "A", concept: "Subject Focused", badge: "Best CTR", ctr_score: 96, accent_color: "#FFE600")
   - Variation B (id: "B", concept: "Curiosity Hook", badge: "Curiosity Hook", ctr_score: 93, accent_color: "#00F0FF")
   - Variation C (id: "C", concept: "Cinematic Action", badge: "High Stakes", ctr_score: 91, accent_color: "#FF2E63")`;

  for (const item of models) {
    try {
      console.log(`[Thumbnail AI Groq] Attempting ${item.tier} Groq model (${item.name})...`);

      const userMessages: any[] = [];
      if (refUrl && (refUrl.startsWith("http://") || refUrl.startsWith("https://") || refUrl.startsWith("data:image/")) && item.name.includes("qwen")) {
        userMessages.push({
          role: "user",
          content: [
            { type: "text", text: userInstruction },
            { type: "image_url", image_url: { url: refUrl } }
          ]
        });
      } else {
        userMessages.push({ role: "user", content: userInstruction });
      }

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: item.name,
          messages: [
            { role: "system", content: THUMBNAIL_SYSTEM_PROMPT },
            ...userMessages
          ],
          temperature: 0.7,
          max_tokens: 2048,
          response_format: { type: "json_object" }
        }),
        signal: AbortSignal.timeout(9000)
      });

      if (res.ok) {
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content;
        const parsed = cleanJson(content);
        if (parsed && Array.isArray(parsed.variations) && parsed.variations.length > 0) {
          console.log(`[Thumbnail AI Groq] Success using ${item.tier} Groq model: ${item.name}`);
          return {
            data: parsed,
            model: item.name,
            tier: item.tier
          };
        }
      } else {
        const errText = await res.text();
        console.warn(`[Thumbnail AI Groq] (${item.name} - ${item.tier}) HTTP ${res.status}:`, errText.substring(0, 150));
      }
    } catch (err: any) {
      console.warn(`[Thumbnail AI Groq] (${item.name} - ${item.tier}) error:`, err.message || err);
    }
  }

  return null;
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

async function callGemini(prompt: string) {
  const ai = getGeminiClient();
  if (!ai) return null;

  const models = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-3.6-flash"];
  for (const model of models) {
    try {
      console.log(`[Gemini] Requesting with ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: `${SYSTEM_PROMPT}\n\nTask:\n${prompt}`,
        config: {
          responseMimeType: "application/json"
        }
      });
      if (response.text) {
        const parsed = cleanJson(response.text);
        if (parsed) {
          console.log(`[Gemini] Success using ${model}.`);
          return parsed;
        }
      }
    } catch (err: any) {
      console.warn(`[Gemini] Error with ${model}:`, err.message || err);
    }
  }
  return null;
}

async function callGeminiThumbnailAI(
  videoTitle: string,
  aspectRatio: string,
  videoDetails?: { title?: string; author?: string; description?: string } | null
): Promise<{ data: any; model: string; provider: string } | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  const prompt = `Analyze this YouTube video topic deeply and generate 3 viral, high-CTR YouTube thumbnail concepts:
Video Title: "${videoTitle}"
${videoDetails?.author ? `Channel/Author: "${videoDetails.author}"` : ""}
${videoDetails?.description ? `Video Description/Snippet: "${videoDetails.description.substring(0, 300)}"` : ""}
Aspect Ratio: ${aspectRatio}

CRITICAL RULES:
1. Ground the visuals strictly and accurately in the REAL SUBJECT of this video:
   - If this is football/soccer (e.g. Indonesia vs Australia, Timnas, World Cup, AFC), focus on intense soccer match moments, player roar/celebrations, stadium floodlights, national colors, referee tension, or dramatic ball strikes. NEVER output ancient history or volcanic ash!
   - If this is tech/gadget/smartphone/PC, focus on sleek hardware, shock tests, macro lens, neon tech studio lighting, screen glow.
   - If gaming, focus on epic cinematic game characters, victory clutch moments, neon cyber effects.
   - If horror/mystery, focus on eerie lighting, shadows, spine-chilling suspense.
   - If news/current affairs, focus on dramatic podiums, breaking headline aesthetics, high contrast spotlights.
2. LANGUAGE MATCHING:
   - If the video title or description is in Indonesian, ALL Hook Texts (hook_text) MUST be in INDONESIAN (e.g., "GOL DRAMATIS!", "INDONESIA MENANG?!", "MENEGANGKAN!", "SERANGAN KILAT!", "BOCOR KE PUBLIK!").
   - If in English, use punchy English (e.g., "THEY DID IT?!", "GAME OVER?!", "DO NOT BUY!", "UNREAL GOAL!").
   - Hook text must be 2 to 4 words MAX, uppercase, punchy, high emotional trigger (curiosity, shock, excitement).
3. 3 DISTINCT VARIATIONS:
   - Variation A (id: "A", concept: "Subject Reaction", badge: "Best CTR", ctr_score: 96): High emotion human subject or star player close-up with intense expression, dramatic warm/cool rim lighting, clean composition.
   - Variation B (id: "B", concept: "Action / Climax", badge: "Action Peak", ctr_score: 94): The pivotal climax, goal moment, showdown, or shocking test with motion blur and energetic particle effects.
   - Variation C (id: "C", concept: "Curiosity / Rivalry", badge: "Curiosity Gap", ctr_score: 92): Intense head-to-head confrontation, mysterious reveal, or high-contrast split element.
4. Each variation must have:
   - "prompt": A descriptive, high-quality image generation prompt (in English for the image generator) describing camera lens, lighting, subject action, vibrant contrasting colors, cinematic depth of field, 8k quality.
   - "hook_text": 2-4 words uppercase.
   - "accent_color": High-contrast hex color (e.g. "#FFE600", "#00F0FF", "#FF2E63").
   - "badge": 1-2 words (e.g. "HIGHLIGHTS", "BEST CTR", "MATCHDAY", "EXPOSED").
   - "ctr_score": number between 91 and 98.

Output strictly valid JSON matching this schema:
{
  "hook_text": "MAIN HOOK TEXT",
  "variations": [
    {
      "id": "A",
      "concept": "Subject Reaction",
      "badge": "Best CTR",
      "ctr_score": 96,
      "hook_text": "GOL DRAMATIS!",
      "accent_color": "#FFE600",
      "prompt": "Action sports photography, Indonesian soccer player celebrating with intense passionate roar under stadium floodlights, national red jersey, dynamic motion blur, high contrast, 8k"
    },
    {
      "id": "B",
      "concept": "Action Peak",
      "badge": "Action Peak",
      "ctr_score": 94,
      "hook_text": "SERANGAN KILAT!",
      "accent_color": "#00F0FF",
      "prompt": "Dynamic soccer match duel between Australia and Indonesia, player striking ball with power, stadium crowd bokeh, dramatic cinematic rim lighting, 8k"
    },
    {
      "id": "C",
      "concept": "Curiosity Gap",
      "badge": "Curiosity Gap",
      "ctr_score": 92,
      "hook_text": "MENEGANGKAN!",
      "accent_color": "#FF2E63",
      "prompt": "Dramatic soccer rivalry confrontation under rain and stadium floodlights, intense gaze between players, high contrast sports editorial style, 8k"
    }
  ]
}`;

  const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-3.6-flash"];
  for (const modelName of candidateModels) {
    try {
      console.log(`[Thumbnail AI Gemini] Analyzing video topic with ${modelName}...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: `${THUMBNAIL_SYSTEM_PROMPT}\n\n${prompt}`,
        config: {
          responseMimeType: "application/json"
        }
      });

      if (response.text) {
        const parsed = cleanJson(response.text);
        if (parsed && Array.isArray(parsed.variations) && parsed.variations.length > 0) {
          console.log(`[Thumbnail AI Gemini] Successfully generated concepts via ${modelName}!`);
          return {
            data: parsed,
            model: modelName,
            provider: "Google Gemini AI"
          };
        }
      }
    } catch (err: any) {
      console.warn(`[Thumbnail AI Gemini] Error calling ${modelName}:`, err.message || err);
      // Automatically continue to next model in case of 503 high demand or transient issue
    }
  }
  return null;
}

function calculatePotentialText(score: number): string {
  if (score >= 90) return "Viral Potential";
  if (score >= 80) return "High Potential";
  if (score >= 70) return "Strong Potential";
  if (score >= 55) return "Moderate Potential";
  return "Emerging Potential";
}

// -------------------------------------------------------------
// Image Generation & YouTube Video Info Extraction
// -------------------------------------------------------------
function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:v=|\/|youtu\.be\/|embed\/|v\/|shorts\/)([0-9A-Za-z_-]{11})/);
  if (match) return match[1];
  if (/^[0-9A-Za-z_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

interface YouTubeDetailsResult {
  videoId: string;
  title: string;
  author: string;
  description?: string;
  tags?: string[];
  bestFrameUrl: string;
  localFrameUrl: string;
  candidateFrames: string[];
}

async function getYouTubeVideoDetails(urlOrId: string): Promise<YouTubeDetailsResult | null> {
  const videoId = extractYouTubeId(urlOrId);
  if (!videoId) return null;

  let title = "";
  let author = "";
  let description = "";
  const tags: string[] = [];

  // 1. Try YouTube Data API v3 if key exists
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (apiKey) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        const item = data.items?.[0]?.snippet;
        if (item && item.title) {
          title = item.title;
          author = item.channelTitle || "";
          description = item.description?.substring(0, 800) || "";
          if (Array.isArray(item.tags)) {
            tags.push(...item.tags);
          }
          console.log(`[YouTube API] Fetched video: "${title}" by ${author}`);
        }
      }
    } catch (err) {
      console.warn("YouTube API video details error:", err);
    }
  }

  // 2. Direct YouTube HTML scrape (Highly resilient, extracts full og:title, og:description, and tags)
  if (!title || !description || tags.length === 0) {
    try {
      const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const scrapeRes = await fetch(watchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
        },
        signal: AbortSignal.timeout(5000)
      });
      if (scrapeRes.ok) {
        const html = await scrapeRes.text();
        const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]*)"/);
        if (ogTitleMatch && ogTitleMatch[1] && (!title || title === "Viral YouTube Video")) {
          title = ogTitleMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
        }
        const ogDescMatch = html.match(/<meta property="og:description" content="([^"]*)"/);
        if (ogDescMatch && ogDescMatch[1] && !description) {
          description = ogDescMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").substring(0, 800);
        }
        const authorMatch = html.match(/<link itemprop="name" content="([^"]*)"/) || html.match(/"author":"([^"]*)"/);
        if (authorMatch && authorMatch[1] && !author) {
          author = authorMatch[1];
        }
        const tagMatches = [...html.matchAll(/<meta property="og:video:tag" content="([^"]*)"/g)];
        tagMatches.forEach(m => {
          if (m[1] && !tags.includes(m[1])) tags.push(m[1]);
        });
        console.log(`[YouTube Scraper] Extracted: "${title}" by ${author}, tags: ${tags.length}`);
      }
    } catch (err) {
      console.warn("Direct YouTube watch page scrape error:", err);
    }
  }

  // 3. Fallback to YouTube oEmbed if still needed
  if (!title || title === "Viral YouTube Video") {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (data.title) {
          title = data.title;
          if (!author) author = data.author_name || "";
          console.log(`[YouTube oEmbed] Fetched video: "${title}" by ${author}`);
        }
      }
    } catch (err) {
      console.warn("YouTube oEmbed fetch error:", err);
    }
  }

  if (!title) {
    title = "Viral YouTube Video";
  }

  // 3. Extract and verify real candidate frames from YouTube CDN
  const candidateUrls = [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/0.jpg`,
    `https://img.youtube.com/vi/${videoId}/1.jpg`,
    `https://img.youtube.com/vi/${videoId}/2.jpg`,
    `https://img.youtube.com/vi/${videoId}/3.jpg`
  ];

  const validFrames: string[] = [];
  let bestFrameUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  let localFrameUrl = bestFrameUrl;

  for (const fUrl of candidateUrls) {
    try {
      const checkRes = await fetch(fUrl, { method: "HEAD", signal: AbortSignal.timeout(3000) });
      if (checkRes.ok) {
        validFrames.push(fUrl);
        if (validFrames.length === 1) {
          bestFrameUrl = fUrl;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  if (validFrames.length > 0) {
    bestFrameUrl = validFrames[0];
  }

  // Cache frame locally to guarantee fast, reliable delivery and prevent broken images
  try {
    const frameRes = await fetch(bestFrameUrl, { signal: AbortSignal.timeout(5000) });
    if (frameRes.ok) {
      const buf = Buffer.from(await frameRes.arrayBuffer());
      if (buf.length > 1500) {
        const localFilename = `yt_ref_${videoId}_${Date.now()}.jpg`;
        const localPath = path.join(OUTPUTS_DIR, localFilename);
        fs.writeFileSync(localPath, buf);
        localFrameUrl = `/uploads/outputs/${localFilename}`;
      }
    }
  } catch (err) {
    console.warn("Could not cache YouTube frame locally, using CDN URL:", err);
  }

  return {
    videoId,
    title,
    author,
    description,
    bestFrameUrl,
    localFrameUrl,
    candidateFrames: validFrames.length > 0 ? validFrames : [bestFrameUrl]
  };
}

async function generateImageViaOpenRouter(prompt: string, refUrl?: string) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const model = process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-2.5-flash-image";
    const messagesContent: any[] = [{ type: "text", text: prompt }];
    if (refUrl) {
      messagesContent.push({ type: "image_url", image_url: { url: refUrl } });
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://creatoriq.app",
        "X-Title": "CreatorIQ Thumbnail Studio"
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: messagesContent }]
      }),
      signal: AbortSignal.timeout(9000)
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content && (content.includes("data:image/") || content.startsWith("http"))) {
        return content;
      }
    }
    return null;
  } catch (err) {
    console.warn("OpenRouter image generation error or timeout:", err);
    return null;
  }
}

async function generateImageViaHuggingFace(prompt: string, width: number, height: number, variationKey: string) {
  const token = process.env.HUGGINGFACE_API_TOKEN?.trim();
  if (!token) return null;

  try {
    const model = process.env.HUGGINGFACE_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell";
    // Modern Hugging Face Inference router endpoint
    const url = `https://router.huggingface.co/hf-inference/models/${model}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: `hyper-detailed cinematic YouTube thumbnail, 8k viral creator quality: ${prompt}`,
        parameters: { width: Math.min(width, 1024), height: Math.min(height, 1024) }
      }),
      signal: AbortSignal.timeout(9000)
    });

    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const filename = `thumb_${variationKey}_${Date.now()}.png`;
      const filePath = path.join(OUTPUTS_DIR, filename);
      fs.writeFileSync(filePath, buffer);
      return `/uploads/outputs/${filename}`;
    }
    return null;
  } catch (err: any) {
    // Graceful fallback without crashing or spamming console
    console.log(`[HF Inference] Unreachable or timed out (${err.message || 'connection failed'}), using fallback image engine.`);
    return null;
  }
}

async function generateAIThumbnailImage(
  prompt: string,
  width: number,
  height: number,
  variationId: string,
  refUrl?: string,
  topicKeyword?: string
): Promise<{ url: string; provider: string; model: string }> {
  // 1. PRIMARY RULE: If user provided a video URL or reference image, ALWAYS use the authentic crisp keyframe / thumbnail directly!
  // User directive: Do NOT use blurry/ugly AI image generation ("burik") when the user provides a video link.
  // Directly use the real, high-resolution original thumbnail from the video URL for all variations.
  if (refUrl && (refUrl.startsWith("http://") || refUrl.startsWith("https://") || refUrl.startsWith("/uploads/"))) {
    return {
      url: refUrl,
      provider: "YouTube Video Frame",
      model: "Native Keyframe HDR"
    };
  }

  // 2. Only if NO video URL or reference image was provided (i.e. pure title only), try AI generation:
  try {
    const seed = Math.floor(Math.random() * 900000) + 100000;
    const cleanPrompt = prompt.replace(/[^\w\s,.-]/g, "").substring(0, 240).trim();
    const viralPrompt = `hyperrealistic ultra-modern viral YouTube thumbnail, ${cleanPrompt}, cinematic volumetric lighting, intense depth of field, 8k resolution, trending on YouTube`;
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(viralPrompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;
    
    console.log(`[Thumbnail AI Gen] Requesting FLUX neural image (seed: ${seed}, var: ${variationId})...`);
    const res = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > 2000) {
        const filename = `thumb_${variationId}_${Date.now()}.png`;
        const filePath = path.join(OUTPUTS_DIR, filename);
        fs.writeFileSync(filePath, buffer);
        return {
          url: `/uploads/outputs/${filename}`,
          provider: "Creator Studio AI",
          model: "FLUX.1 Ultra HDR"
        };
      }
    }
  } catch (err) {
    console.warn("[Thumbnail AI Gen] FLUX attempt error or timeout:", err);
  }

  // 3. Fast Turbo Retry (Only if pure title and FLUX failed)
  try {
    const seed = Math.floor(Math.random() * 900000) + 200000;
    const concisePrompt = `viral modern youtube thumbnail, ${topicKeyword || "intense climax action"}, neon rim lighting, 8k trending`;
    const fastUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(concisePrompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=turbo`;
    const res2 = await fetch(fastUrl, { signal: AbortSignal.timeout(6000) });
    if (res2.ok) {
      const buffer2 = Buffer.from(await res2.arrayBuffer());
      if (buffer2.length > 2000) {
        const filename2 = `thumb_${variationId}_${Date.now()}.png`;
        const filePath2 = path.join(OUTPUTS_DIR, filename2);
        fs.writeFileSync(filePath2, buffer2);
        return {
          url: `/uploads/outputs/${filename2}`,
          provider: "Creator Studio AI",
          model: "FLUX Turbo"
        };
      }
    }
  } catch (err2) {
    console.warn("[Thumbnail AI Gen] Turbo retry failed:", err2);
  }

  // 4. Fallback: High-resolution curated creator photography
  const sportsCurated = [
    "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1280&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1280&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=1280&auto=format&fit=crop&q=80"
  ];

  const generalCurated = [
    "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1280&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1280&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1280&auto=format&fit=crop&q=80"
  ];

  const isSports = topicKeyword && /bola|sepak|soccer|football|u20|timnas|match|vs|afc|cup/i.test(topicKeyword);
  const pool = isSports ? sportsCurated : generalCurated;
  const idx = variationId === "A" ? 0 : (variationId === "B" ? 1 : 2);

  return {
    url: pool[idx] || pool[0],
    provider: "Creator Studio AI",
    model: "High Dynamic Range"
  };
}

// -------------------------------------------------------------
// API Routes
// -------------------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "CreatorIQ API Server",
    ai: {
      groq_connected: Boolean(process.env.GROQ_API_KEY?.trim()),
      groq_model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      gemini_connected: Boolean(process.env.GEMINI_API_KEY?.trim()),
      openrouter_connected: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
      youtube_connected: Boolean(process.env.YOUTUBE_API_KEY?.trim())
    }
  });
});

// Video Metadata & Frame Extraction Route (GET & POST)
app.all("/api/video/info", async (req, res) => {
  try {
    const url = ((req.method === "POST" ? req.body?.url : req.query.url) as string || "").trim();
    if (!url) {
      return res.status(400).json({ success: false, message: "URL is required" });
    }
    const details = await getYouTubeVideoDetails(url);
    if (!details) {
      return res.status(404).json({ success: false, message: "Could not extract video details from URL" });
    }
    return res.json({
      success: true,
      video_id: details.videoId,
      title: details.title,
      author: details.author,
      description: details.description,
      best_frame: details.bestFrameUrl,
      local_frame: details.localFrameUrl,
      candidate_frames: details.candidateFrames
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || "Failed to get video info" });
  }
});

// Upload local video snapshot or custom frame
app.post("/api/upload-frame", (req, res) => {
  try {
    const { image_data } = req.body || {};
    if (!image_data) return res.status(400).json({ success: false, message: "image_data required" });
    const matches = image_data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ success: false, message: "Invalid base64 image data" });
    }
    const buffer = Buffer.from(matches[2], "base64");
    const name = `frame_${Date.now()}_${Math.floor(Math.random() * 10000)}.png`;
    const filePath = path.join(OUTPUTS_DIR, name);
    fs.writeFileSync(filePath, buffer);
    return res.json({ success: true, url: `/uploads/outputs/${name}` });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Proxy external images with permissive CORS headers to allow clean HTML5 Canvas rendering
app.get("/api/proxy-image", async (req, res) => {
  try {
    const rawUrl = (req.query.url as string || "").trim();
    if (!rawUrl) {
      return res.status(400).send("URL parameter is required");
    }

    // Security check: only allow http or https
    if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
      return res.status(400).send("Invalid image URL protocol");
    }

    const response = await fetch(rawUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(buffer);
  } catch (err: any) {
    console.warn("Proxy image error:", err.message);
    return res.status(500).send(err.message || "Failed to proxy image");
  }
});

// Feature 1: AI Title Intelligence
app.post("/api/title/analyze", async (req, res) => {
  try {
    const { title_input, channel_url } = req.body || {};
    const titleInput = (title_input || "").trim();

    if (!titleInput) {
      return res.status(400).json({
        success: false,
        message: "Title input is required."
      });
    }

    // 1. YouTube Data API v3
    const ytResult = await fetchYouTubeCompetitors(titleInput, channel_url);
    const ytSummary = ytResult.summary;
    const ytAvailable = ytResult.available;

    // 2. Prepare Context Prompt
    let userPrompt = `User Video Title Idea: "${titleInput}"\n`;
    if (channel_url) {
      userPrompt += `Reference Channel / Style: ${channel_url}\n`;
    }
    if (ytAvailable && ytSummary) {
      userPrompt += `YouTube Competitor Context: ${ytSummary}\n`;
    } else {
      userPrompt += `YouTube Context: Competitor data unavailable. Analyze psychological curiosity gap, topic search volume, and viral click patterns.\n`;
    }
    userPrompt += `\nGenerate 3 high-converting title variations, opportunity score, reasons, and best title.`;

    // 3. AI Cascade: Groq Cloud (Ultra-Fast 120B) -> OpenRouter -> Gemini
    let aiData: any = null;
    let providerName = "";

    if (process.env.GROQ_API_KEY?.trim()) {
      console.log(`Analyzing title: "${titleInput}" via Groq Cloud (openai/gpt-oss-120b)...`);
      aiData = await callGroq(userPrompt);
      if (aiData) {
        providerName = "Groq Cloud (GPT OSS 120B)";
      }
    }

    if (!aiData && process.env.OPENROUTER_API_KEY?.trim()) {
      console.log(`Groq unavailable, trying OpenRouter...`);
      aiData = await callOpenRouter(userPrompt);
      if (aiData) {
        providerName = "OpenRouter";
      }
    }

    if (!aiData) {
      console.log(`Trying Gemini fallback...`);
      aiData = await callGemini(userPrompt);
      if (aiData) {
        providerName = "Gemini";
      }
    }

    if (!aiData) {
      // Smart contextual fallback generator if APIs encounter temporary network issues
      console.log(`Providing smart contextual title generation fallback...`);
      providerName = "CreatorIQ AI Engine";
      aiData = {
        opportunity_score: 91,
        analysis: {
          keyword_strength: "High search volume around key gameplay and hero mastery",
          clickability: "High psychological curiosity gap with clear outcome promise",
          trend_relevance: "Consistently popular tutorial and meta strategy topic",
          competition: "Moderate competition; clear positioning ensures high CTR"
        },
        reasons: [
          "Strong emotional hook promising consistent ranked wins",
          "High audience search intent for hero builds and rotation guides",
          "Optimal title length under 60 characters for desktop and mobile YouTube",
          "Proven viral YouTube gaming and tutorial framework"
        ],
        titles: [
          { title: `How to WIN EVERY GAME with ${titleInput} (Secret Pro Guide)`, score: 96 },
          { title: `Stop Playing ${titleInput} Wrong! (Carry Solo Rank Every Match)`, score: 91 },
          { title: `${titleInput} Mastery 2026: The Only Guide You Need to Rank Up`, score: 87 }
        ],
        best_title: `How to WIN EVERY GAME with ${titleInput} (Secret Pro Guide)`
      };
    }

    // Parse Opportunity Score
    const opportunityScore = Math.min(99, Math.max(10, Number(aiData.opportunity_score) || 88));
    const potentialText = calculatePotentialText(opportunityScore);

    // Parse Reasons
    let reasons: string[] = [];
    if (Array.isArray(aiData.reasons) && aiData.reasons.length > 0) {
      reasons = aiData.reasons.slice(0, 4);
    } else if (aiData.analysis && typeof aiData.analysis === "object") {
      reasons = [
        `Keyword Strength: ${aiData.analysis.keyword_strength || "High search volume"}`,
        `Clickability: ${aiData.analysis.clickability || "Strong psychological hook"}`,
        `Trend Relevance: ${aiData.analysis.trend_relevance || "Active topic demand"}`,
        `Competition: ${aiData.analysis.competition || "High CTR potential"}`
      ];
    } else {
      reasons = [
        "Strong curiosity gap and emotional trigger",
        "High search intent for this topic",
        "Clear content promise in optimal title length",
        "Proven title architecture that drives high CTR"
      ];
    }

    // Parse Titles - robust handling for any schema variation
    const rawTitles = Array.isArray(aiData.titles)
      ? aiData.titles
      : (Array.isArray(aiData.recommendations)
          ? aiData.recommendations
          : (Array.isArray(aiData.recommended_titles)
              ? aiData.recommended_titles
              : (Array.isArray(aiData.variations) ? aiData.variations : [])));

    let titlesList = rawTitles.map((t: any, idx: number) => {
      let tText = "";
      if (typeof t === "string") {
        tText = t.trim();
      } else if (typeof t === "object" && t !== null) {
        tText = (t.title || t.text || t.name || t.title_text || t.variation || t.headline || "").trim();
      }
      if (!tText) {
        tText = `${titleInput} (Variation ${idx + 1})`;
      }
      const tScore = typeof t === "object" && t && (t.score || t.ctr_score || t.opportunity_score)
        ? Number(t.score || t.ctr_score || t.opportunity_score)
        : Math.max(75, 95 - idx * 4);

      return {
        id: idx + 1,
        title: tText,
        text: tText, // Guaranteed to never be undefined
        name: tText,
        score: tScore,
        isBest: false
      };
    });

    if (titlesList.length === 0) {
      titlesList = [
        { id: 1, title: `How I Mastered ${titleInput} (Step by Step)`, text: `How I Mastered ${titleInput} (Step by Step)`, name: `How I Mastered ${titleInput} (Step by Step)`, score: 95, isBest: false },
        { id: 2, title: `I Tested ${titleInput} For 30 Days - What Happened`, text: `I Tested ${titleInput} For 30 Days - What Happened`, name: `I Tested ${titleInput} For 30 Days - What Happened`, score: 90, isBest: false },
        { id: 3, title: `The Truth About ${titleInput} (Must Watch)`, text: `The Truth About ${titleInput} (Must Watch)`, name: `The Truth About ${titleInput} (Must Watch)`, score: 86, isBest: false }
      ];
    }

    // Find Best Title by highest score
    let bestIdx = 0;
    let highestScore = -1;
    titlesList.forEach((item: any, idx: number) => {
      if (item.score > highestScore) {
        highestScore = item.score;
        bestIdx = idx;
      }
    });

    titlesList.forEach((item: any, idx: number) => {
      item.isBest = idx === bestIdx;
    });

    const bestTitleItem = titlesList[bestIdx];

    const responsePayload = {
      success: true,
      provider: providerName,
      opportunity_score: opportunityScore,
      potential_text: potentialText,
      youtube_status: ytAvailable ? "Connected" : "Fallback Mode (Direct Analysis)",
      reasons: reasons,
      titles: titlesList,
      recommendations: titlesList,
      best_title: bestTitleItem,
      recommended_titles: titlesList.map((t: any) => t.title)
    };

    return res.json(responsePayload);
  } catch (error: any) {
    console.error("Error in /api/title/analyze:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error"
    });
  }
});

// -------------------------------------------------------------
// Feature 2: Thumbnail AI Direct Video Upload & 10-Stage Pipeline
// -------------------------------------------------------------
const thumbTempDir = path.join(UPLOADS_DIR, "thumbnail_pipeline", "temp");
if (!fs.existsSync(thumbTempDir)) {
  fs.mkdirSync(thumbTempDir, { recursive: true });
}

const thumbnailVideoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, thumbTempDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || ".mp4") || ".mp4";
      const cleanBase = path.basename(file.originalname || "video", ext).replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 30);
      cb(null, `${cleanBase}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`);
    }
  }),
  limits: { fileSize: 2000 * 1024 * 1024 } // 2GB
});

// 1. Direct Video Upload Endpoint (10-Stage Pipeline: FFprobe -> Coarse -> Vision -> Fine -> Exact Frames -> Groq Hook)
app.post("/api/thumbnail/upload-video", (req, res) => {
  (thumbnailVideoUpload.single("video") as any)(req, res, async (uploadErr: any) => {
    if (uploadErr) {
      console.error("[Thumbnail Upload Multer Error]:", uploadErr);
      return res.status(400).json({
        success: false,
        message: uploadErr.code === "LIMIT_FILE_SIZE"
          ? "Ukuran file video melebihi batas upload langsung server."
          : (uploadErr.message || "Gagal mengunggah file video.")
      });
    }

    try {
      const uploaded = (req as any).file;
      if (!uploaded || !uploaded.path) {
        return res.status(400).json({
          success: false,
          message: "Silakan pilih file video untuk diunggah langsung (MP4, MOV, WEBM, MKV)."
        });
      }

      const { title, aspect_ratio } = req.body || {};
      const rawTitle = (title || "").trim();
      const videoTitle = rawTitle || path.basename(uploaded.originalname || "Viral Video", path.extname(uploaded.originalname || ""));
      const chosenAspectRatio = ["16:9", "9:16", "1:1"].includes(aspect_ratio) ? aspect_ratio : "16:9";

      console.log(`[Thumbnail AI 10-Step Pipeline] Direct video received: "${uploaded.originalname}" (${(uploaded.size / (1024 * 1024)).toFixed(1)} MB). Processing...`);

      const result = await runThumbnailVisionPipeline(
        uploaded.path,
        videoTitle,
        chosenAspectRatio
      );

      return res.json({
        success: true,
        provider: "CreatorIQ 10-Stage Vision Pipeline (Qwen 3.6 / FFmpeg / Groq)",
        model: "Qwen 3.6 Vision / GPT-OSS 120b",
        video_title: videoTitle,
        aspect_ratio: chosenAspectRatio,
        probe: result.probe,
        coarse_count: result.coarseFramesCount,
        fine_count: result.fineFramesCount,
        thumbnails: result.thumbnails
      });
    } catch (error: any) {
      console.error("[Thumbnail AI Upload Pipeline Error]:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Gagal memproses video dalam 10-tahap Vision Pipeline."
      });
    }
  });
});

// 2. Client-Extracted Frames Endpoint (Bypasses upload limits, instant & resilient)
app.post("/api/thumbnail/analyze-extracted-frames", async (req, res) => {
  try {
    const { title, aspect_ratio, frames, probe } = req.body || {};
    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tidak ada frame video yang dikirim untuk dianalisis."
      });
    }

    const videoTitle = (title || "").trim() || "Viral Video";
    const chosenAspectRatio = ["16:9", "9:16", "1:1"].includes(aspect_ratio) ? aspect_ratio : "16:9";

    console.log(`[Thumbnail AI Client Frames] Received ${frames.length} extracted frames for "${videoTitle}". Running Vision AI...`);

    const result = await runThumbnailPipelineFromFrames(
      frames,
      videoTitle,
      chosenAspectRatio,
      probe
    );

    return res.json({
      success: true,
      provider: "CreatorIQ 10-Stage Vision Pipeline (Qwen 3.6 / Groq)",
      model: "Qwen 3.6 Vision / GPT-OSS 120b",
      video_title: videoTitle,
      aspect_ratio: chosenAspectRatio,
      probe: result.probe,
      coarse_count: result.coarseFramesCount,
      fine_count: result.fineFramesCount,
      thumbnails: result.thumbnails
    });
  } catch (error: any) {
    console.error("[Thumbnail AI Frames Analysis Error]:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Gagal menganalisis frame thumbnail video."
    });
  }
});

// Feature 2: AI Thumbnail Studio (Legacy / Fallback endpoint)
app.post("/api/thumbnail/generate", async (req, res) => {
  try {
    const { video_url, title, aspect_ratio, reference_image_url } = req.body || {};
    const videoUrl = (video_url || "").trim();
    let videoTitle = (title || "").trim();
    const chosenAspectRatio = ["16:9", "9:16", "1:1"].includes(aspect_ratio) ? aspect_ratio : "16:9";

    // 1. Fetch real video details and candidate frames from YouTube URL if provided
    let videoDetails: YouTubeDetailsResult | null = null;
    const videoId = extractYouTubeId(videoUrl);
    if (videoId || videoUrl) {
      videoDetails = await getYouTubeVideoDetails(videoUrl);
      if (videoDetails && videoDetails.title) {
        // ALWAYS prioritize the real extracted YouTube video title
        videoTitle = videoDetails.title;
      }
    }

    if (!videoTitle) {
      videoTitle = "Viral YouTube Video";
    }

    if (!videoId && !videoUrl && !reference_image_url && (!title || !title.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please provide a video URL, video file, reference image, or title."
      });
    }

    // Determine the effective reference frame: manual upload or auto-extracted YouTube keyframe
    const effectiveRefUrl = reference_image_url || videoDetails?.localFrameUrl || videoDetails?.bestFrameUrl;
    const fallbackImage = videoDetails?.localFrameUrl || videoDetails?.bestFrameUrl;

    const width = chosenAspectRatio === "9:16" ? 720 : (chosenAspectRatio === "1:1" ? 1024 : 1280);
    const height = chosenAspectRatio === "9:16" ? 1280 : (chosenAspectRatio === "1:1" ? 1024 : 720);

    // Clean video topic string for AI prompt
    const topicPrompt = videoTitle.replace(/["']/g, "");

    // 2. AI Thumbnail Concept Engine (Groq Cloud AI Primary -> Gemini Fallback -> Smart Category Engine)
    let hookText = "VIRAL HOOK!";
    let activeModel = "openai/gpt-oss-120b";
    let activeProvider = "Groq Cloud AI";
    let variations: any[] = [];

    // Attempt 1: Groq Cloud AI (Primary Engine requested by user)
    const groqResult = await callGroqThumbnailAI(videoTitle, chosenAspectRatio, effectiveRefUrl, videoDetails);
    if (groqResult && groqResult.data && Array.isArray(groqResult.data.variations) && groqResult.data.variations.length > 0) {
      activeModel = groqResult.model;
      activeProvider = "Groq Cloud AI";
      if (groqResult.data.hook_text) {
        hookText = groqResult.data.hook_text;
      }
      variations = groqResult.data.variations.map((v: any, index: number) => ({
        id: v.id || ["A", "B", "C"][index] || "A",
        concept: v.concept || ["Subject Focused", "Curiosity Hook", "Cinematic Action"][index],
        badge: v.badge || ["Best CTR", "Curiosity Hook", "Cinematic Action"][index],
        ctr_score: Number(v.ctr_score) || (96 - index * 3),
        hook_text: v.hook_text || (index === 0 ? "VIRAL MOMEN!" : (index === 1 ? "GAK NYANGKA!" : "BOCOR?!")),
        accent_color: v.accent_color || (index === 0 ? "#FFE600" : (index === 1 ? "#00F0FF" : "#FF2E63")),
        prompt: v.prompt || `Hyper-realistic YouTube viral thumbnail for (${topicPrompt}), trending YouTube creator style, aspect ratio ${chosenAspectRatio}`
      }));
    } else {
      // Attempt 2: Google Gemini (Secondary Fallback)
      const geminiResult = await callGeminiThumbnailAI(videoTitle, chosenAspectRatio, videoDetails);
      if (geminiResult && geminiResult.data && Array.isArray(geminiResult.data.variations) && geminiResult.data.variations.length > 0) {
        activeModel = geminiResult.model;
        activeProvider = geminiResult.provider;
        if (geminiResult.data.hook_text) {
          hookText = geminiResult.data.hook_text;
        }
        variations = geminiResult.data.variations.map((v: any, index: number) => ({
          id: v.id || ["A", "B", "C"][index] || "A",
          concept: v.concept || ["Subject Focused", "Action Peak", "Curiosity Gap"][index],
          badge: v.badge || ["Best CTR", "Action Peak", "Curiosity Gap"][index],
          ctr_score: Number(v.ctr_score) || (96 - index * 3),
          hook_text: v.hook_text || (index === 0 ? "VIRAL MOMEN!" : (index === 1 ? "GAK NYANGKA!" : "BOCOR?!")),
          accent_color: v.accent_color || (index === 0 ? "#FFE600" : (index === 1 ? "#00F0FF" : "#FF2E63")),
          prompt: v.prompt || `Hyper-realistic YouTube viral thumbnail for (${topicPrompt}), trending YouTube creator style, aspect ratio ${chosenAspectRatio}`
        }));
      } else {
        // Attempt 3: Smart Category Intelligence (Topic & Language Grounded)
        activeModel = "CreatorIQ Category Intelligence";
        activeProvider = "Built-in Neural Heuristics";
        const titleLower = videoTitle.toLowerCase();
        const isIndonesian = /yang|dan|di|ini|dari|untuk|pada|ke|dengan|adalah|bisa|ada|tidak|saat|menang|kalah|bocor|gila|banget|parah|rahasia|misteri|hantu/i.test(titleLower);

        // Category: Sports / Football / Sepak Bola
        if (/bola|sepak|soccer|football|vs|u20|u23|u17|timnas|cup|piala|match|highlights|afc|liga|gol|goal|penalty|australia|indonesia/i.test(titleLower)) {
          hookText = isIndonesian ? "GOL DRAMATIS!" : "UNREAL GOAL!";
          variations = [
            {
              id: "A",
              concept: "Player Celebration / Roar",
              badge: "Best CTR",
              ctr_score: 96,
              hook_text: isIndonesian ? "GOL DRAMATIS!" : "UNREAL GOAL!",
              accent_color: "#FFE600",
              prompt: `Action sports photography, intense passionate soccer player celebrating with roar under blazing stadium floodlights, national team red jersey, stadium crowd bokeh, motion blur, 8k resolution, aspect ratio ${chosenAspectRatio}`
            },
            {
              id: "B",
              concept: "Climax Strike / Duel",
              badge: "Action Peak",
              ctr_score: 94,
              hook_text: isIndonesian ? "INDONESIA MENANG?!" : "DID THEY WIN?!",
              accent_color: "#00F0FF",
              prompt: `Epic soccer match decisive strike for (${topicPrompt}), ball soaring past goalkeeper into net, intense stadium lighting, dynamic lens flare, 8k, aspect ratio ${chosenAspectRatio}`
            },
            {
              id: "C",
              concept: "Rivalry Tension",
              badge: "Matchday Tension",
              ctr_score: 92,
              hook_text: isIndonesian ? "MENEGANGKAN!" : "PURE DRAMA!",
              accent_color: "#FF2E63",
              prompt: `Intense soccer rivalry confrontation between players under rain and stadium floodlights for (${topicPrompt}), extreme emotional focus, high contrast sports editorial style, 8k, aspect ratio ${chosenAspectRatio}`
            }
          ];
        }
        // Category: Tech / Gadgets
        else if (/review|unboxing|hp|smartphone|iphone|samsung|xiaomi|laptop|pc|gadget|camera/i.test(titleLower)) {
          hookText = isIndonesian ? "JANGAN BELI INI!" : "DO NOT BUY!";
          variations = [
            {
              id: "A",
              concept: "Extreme Shock Test",
              badge: "Best CTR",
              ctr_score: 96,
              hook_text: isIndonesian ? "JANGAN BELI INI!" : "DO NOT BUY!",
              accent_color: "#FFE600",
              prompt: `Cinematic macro product shot of futuristic tech gadget for (${topicPrompt}), sparks and dramatic studio lighting, dark backdrop, high contrast, 8k, aspect ratio ${chosenAspectRatio}`
            },
            {
              id: "B",
              concept: "Drop Test Damage",
              badge: "Extreme Test",
              ctr_score: 93,
              hook_text: isIndonesian ? "RUSAK PARAH?!" : "BIG MISTAKE!",
              accent_color: "#FF2E63",
              prompt: `Shocking hardware durability test for (${topicPrompt}), dramatic shattered glass particles, high speed freeze frame photography, neon studio rim light, 8k, aspect ratio ${chosenAspectRatio}`
            },
            {
              id: "C",
              concept: "Hidden Feature",
              badge: "Secret Trick",
              ctr_score: 91,
              hook_text: isIndonesian ? "GILA BANGET!" : "WASTE OF MONEY",
              accent_color: "#00F0FF",
              prompt: `Futuristic tech comparison showcase for (${topicPrompt}), holographic HUD glow, sleek minimalist cyberpunk studio, 8k, aspect ratio ${chosenAspectRatio}`
            }
          ];
        }
        // Category: Gaming / Esports
        else if (/game|gaming|gameplay|roblox|minecraft|mlbb|mobile legends|ff|free fire|pubg|valorant|gta/i.test(titleLower)) {
          hookText = isIndonesian ? "SKILL DEWA?!" : "INSANE PLAY!";
          variations = [
            {
              id: "A",
              concept: "Clutch Moment",
              badge: "Best CTR",
              ctr_score: 96,
              hook_text: isIndonesian ? "SKILL DEWA?!" : "INSANE PLAY!",
              accent_color: "#00F0FF",
              prompt: `Epic cinematic action gaming character clutch moment for (${topicPrompt}), neon energy bursts, dynamic cyber battle scene, 8k, aspect ratio ${chosenAspectRatio}`
            },
            {
              id: "B",
              concept: "Myth Bust / Glitch",
              badge: "Cheat Activated",
              ctr_score: 94,
              hook_text: isIndonesian ? "CHEAT AKTIF?!" : "IMPOSSIBLE RUN",
              accent_color: "#FFE600",
              prompt: `Dramatic gaming mystery showdown for (${topicPrompt}), mysterious dark portal, neon glitch particles, cinematic trailer lighting, 8k, aspect ratio ${chosenAspectRatio}`
            },
            {
              id: "C",
              concept: "Final Boss Battle",
              badge: "Epic Win",
              ctr_score: 91,
              hook_text: isIndonesian ? "MOMEN GILA!" : "UNREAL CLUTCH",
              accent_color: "#FF2E63",
              prompt: `Massive boss battle confrontation in video game for (${topicPrompt}), towering adversary, heroic protagonist silhouette with glowing weapon, 8k, aspect ratio ${chosenAspectRatio}`
            }
          ];
        }
        // Category: Mystery / Horror
        else if (/hantu|setan|misteri|horror|seram|penampakan|angker|toba|purba|volcano/i.test(titleLower)) {
          hookText = isIndonesian ? "JANGAN DITONTON!" : "DO NOT WATCH!";
          variations = [
            {
              id: "A",
              concept: "Spine Chilling Discovery",
              badge: "Best CTR",
              ctr_score: 96,
              hook_text: isIndonesian ? "JANGAN DITONTON!" : "DO NOT WATCH!",
              accent_color: "#FF2E63",
              prompt: `Spine chilling suspense discovery for (${topicPrompt}), flashlight beam cutting through dark foggy ruins, eerie shadows, cinematic atmospheric mystery, 8k, aspect ratio ${chosenAspectRatio}`
            },
            {
              id: "B",
              concept: "Caught On Camera",
              badge: "Caught On Cam",
              ctr_score: 93,
              hook_text: isIndonesian ? "TEREKAM JELAS?!" : "SHOCKING TRUTH",
              accent_color: "#00F0FF",
              prompt: `Eerie supernatural mystery anomaly for (${topicPrompt}), night vision security camera aesthetic, glowing eyes in darkness, cinematic horror atmosphere, 8k, aspect ratio ${chosenAspectRatio}`
            },
            {
              id: "C",
              concept: "Unsolved Case",
              badge: "Exposed",
              ctr_score: 91,
              hook_text: isIndonesian ? "TERUNGKAP!" : "THEY SURVIVED?!",
              accent_color: "#FFE600",
              prompt: `Dramatic dark mystery revelation for (${topicPrompt}), cold atmospheric mist, red spotlight, cinematic tension, 8k, aspect ratio ${chosenAspectRatio}`
            }
          ];
        }
        // Category: General Viral / News / Story / Vlog
        else {
          hookText = isIndonesian ? "BOCOR KE PUBLIK!" : "EXPOSED TO ALL!";
          variations = [
            {
              id: "A",
              concept: "Human Reaction / Shock",
              badge: "Best CTR",
              ctr_score: 96,
              hook_text: isIndonesian ? "BOCOR KE PUBLIK!" : "EXPOSED TO ALL!",
              accent_color: "#FFE600",
              prompt: `Intense expressive human subject reaction for (${topicPrompt}), eyes wide with shock, vivid cinematic rim lighting, studio dark background, high contrast, 8k, aspect ratio ${chosenAspectRatio}`
            },
            {
              id: "B",
              concept: "Shocking Revelation",
              badge: "Breaking News",
              ctr_score: 94,
              hook_text: isIndonesian ? "SEMUA KAGET?!" : "EVERYONE SHOCKED",
              accent_color: "#FF2E63",
              prompt: `Dramatic investigative revelation scene for (${topicPrompt}), spotlight hitting key evidence, dark volumetric haze, high contrast, 8k, aspect ratio ${chosenAspectRatio}`
            },
            {
              id: "C",
              concept: "Curiosity Gap",
              badge: "Exclusive",
              ctr_score: 92,
              hook_text: isIndonesian ? "GAK NYANGKA!" : "SECRET REVEALED",
              accent_color: "#00F0FF",
              prompt: `Intriguing mystery curiosity gap thumbnail for (${topicPrompt}), glowing neon accents, deep shadows, cinematic depth of field, 8k, aspect ratio ${chosenAspectRatio}`
            }
          ];
        }
      }
    }

    // Helper to ALWAYS ensure exactly 3 distinct variations (A, B, and C)
    const ensureThreeVariations = (rawList: any[], titleStr: string, aspect: string, baseHook: string) => {
      const titleLower = titleStr.toLowerCase();
      const isIndo = /yang|dan|di|ini|dari|untuk|pada|ke|dengan|adalah|bisa|ada|tidak|saat|menang|kalah|bocor|gila|banget|parah|rahasia|misteri|hantu/i.test(titleLower);

      const templateA = {
        id: "A",
        concept: "Subject Focused",
        badge: "Best CTR",
        ctr_score: 96,
        hook_text: baseHook || (isIndo ? "VIRAL MOMEN!" : "WHO WON?!"),
        accent_color: "#FFE600",
        prompt: `High-impact YouTube viral thumbnail focusing on the main subject for (${titleStr}), aspect ratio ${aspect}`
      };

      const templateB = {
        id: "B",
        concept: "Curiosity Hook",
        badge: "Curiosity Hook",
        ctr_score: 93,
        hook_text: isIndo ? "GAK NYANGKA!" : "BROKEN CODE?",
        accent_color: "#00F0FF",
        prompt: `Curiosity gap high-CTR YouTube thumbnail for (${titleStr}), aspect ratio ${aspect}`
      };

      const templateC = {
        id: "C",
        concept: "Cinematic Action",
        badge: "High Stakes",
        ctr_score: 91,
        hook_text: isIndo ? "PARAH BANGET!" : "GAME OVER?!",
        accent_color: "#FF2E63",
        prompt: `High-tension dramatic action YouTube thumbnail for (${titleStr}), aspect ratio ${aspect}`
      };

      const templates = [templateA, templateB, templateC];
      const result = [];

      for (let i = 0; i < 3; i++) {
        const raw = Array.isArray(rawList) && rawList[i] ? rawList[i] : null;
        const fallback = templates[i];
        const assignedId = ["A", "B", "C"][i];

        result.push({
          id: raw?.id || assignedId,
          concept: raw?.concept || fallback.concept,
          badge: raw?.badge || fallback.badge,
          ctr_score: Number(raw?.ctr_score) || fallback.ctr_score,
          hook_text: (raw?.hook_text || fallback.hook_text || "").trim().toUpperCase(),
          accent_color: raw?.accent_color || fallback.accent_color,
          prompt: raw?.prompt || fallback.prompt
        });
      }

      return result;
    };

    // GUARANTEE: variations MUST always have exactly 3 items (A, B, C)
    variations = ensureThreeVariations(variations, videoTitle, chosenAspectRatio, hookText);

    console.log(`[Thumbnail AI] Generating 3 fresh original AI thumbnails for video: "${videoTitle}" (Engine: ${activeProvider}, Model: ${activeModel}, Ratio: ${chosenAspectRatio})...`);

    const generatedThumbnails = [];
    for (const v of variations) {
      const genResult = await generateAIThumbnailImage(v.prompt, width, height, v.id, effectiveRefUrl, videoTitle);
      generatedThumbnails.push({
        id: v.id,
        image_url: genResult.url,
        ctr_score: v.ctr_score,
        concept: v.concept,
        badge: v.badge,
        hook_text: v.hook_text,
        accent_color: v.accent_color || (v.id === "A" ? "#FFE600" : (v.id === "B" ? "#00F0FF" : "#FF2E63")),
        prompt: v.prompt
      });
      // Small pause between generation calls to avoid provider throttling
      await new Promise((r) => setTimeout(r, 100));
    }

    console.log(`[Thumbnail AI] Successfully finished generating 3 AI thumbnails.`);

    return res.json({
      success: true,
      provider: activeProvider,
      model: activeModel,
      groq_tier: groqResult?.tier || "Primary",
      groq_model: activeModel,
      video_title: videoTitle,
      video_source_frame: videoDetails?.localFrameUrl || videoDetails?.bestFrameUrl || null,
      video_channel: videoDetails?.author || null,
      aspect_ratio: chosenAspectRatio,
      hook_text: hookText,
      thumbnails: generatedThumbnails
    });
  } catch (error: any) {
    console.error("Error in /api/thumbnail/generate:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate thumbnails"
    });
  }
});

// -------------------------------------------------------------
// YouTube Feed Blindspot & Competitor A/B Simulator Endpoints
// -------------------------------------------------------------

const CURATED_NICHE_VIDEOS: Record<string, Array<{
  id: string;
  title: string;
  channel: string;
  channel_avatar: string;
  views: string;
  uploaded: string;
  thumbnail_url: string;
  duration: string;
  verified: boolean;
}>> = {
  tech: [
    {
      id: "comp_tech_1",
      title: "The AI Bubble Is Finally Bursting (What Happens Next)",
      channel: "Fireship",
      channel_avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80",
      views: "1.4M views",
      uploaded: "2 days ago",
      thumbnail_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80",
      duration: "11:42",
      verified: true
    },
    {
      id: "comp_tech_2",
      title: "I Replaced My Entire Engineering Team with Groq AI",
      channel: "Theo - t3.gg",
      channel_avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80",
      views: "890K views",
      uploaded: "4 days ago",
      thumbnail_url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80",
      duration: "18:05",
      verified: true
    },
    {
      id: "comp_tech_3",
      title: "Apple Just Shocked The Entire Tech Industry.",
      channel: "Marques Brownlee",
      channel_avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      views: "3.8M views",
      uploaded: "1 week ago",
      thumbnail_url: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80",
      duration: "14:20",
      verified: true
    },
    {
      id: "comp_tech_4",
      title: "The Death of Software Engineers? 2026 Reality Check",
      channel: "NetworkChuck",
      channel_avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
      views: "640K views",
      uploaded: "3 days ago",
      thumbnail_url: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80",
      duration: "16:48",
      verified: true
    },
    {
      id: "comp_tech_5",
      title: "Building an Autonomous Agent in 15 Minutes",
      channel: "Matthew Berman",
      channel_avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
      views: "420K views",
      uploaded: "5 days ago",
      thumbnail_url: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=80",
      duration: "21:14",
      verified: true
    },
    {
      id: "comp_tech_6",
      title: "We Tested 50 Laptops to Find the BEST One",
      channel: "Linus Tech Tips",
      channel_avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80",
      views: "2.1M views",
      uploaded: "6 days ago",
      thumbnail_url: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&auto=format&fit=crop&q=80",
      duration: "25:31",
      verified: true
    }
  ],
  entertainment: [
    {
      id: "comp_ent_1",
      title: "Survive 100 Days In A Bunker, Win $500,000",
      channel: "MrBeast",
      channel_avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      views: "48M views",
      uploaded: "3 days ago",
      thumbnail_url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80",
      duration: "22:15",
      verified: true
    },
    {
      id: "comp_ent_2",
      title: "I Crossed The Entire Country With $0",
      channel: "Ryan Trahan",
      channel_avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      views: "12M views",
      uploaded: "5 days ago",
      thumbnail_url: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&auto=format&fit=crop&q=80",
      duration: "34:02",
      verified: true
    },
    {
      id: "comp_ent_3",
      title: "World's Most Dangerous Waterslide!",
      channel: "Dude Perfect",
      channel_avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80",
      views: "8.4M views",
      uploaded: "1 week ago",
      thumbnail_url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80",
      duration: "15:40",
      verified: true
    },
    {
      id: "comp_ent_4",
      title: "I Trapped 100 YouTubers in a Giant Glass Box",
      channel: "Airrack",
      channel_avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80",
      views: "6.2M views",
      uploaded: "4 days ago",
      thumbnail_url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&auto=format&fit=crop&q=80",
      duration: "19:12",
      verified: true
    }
  ],
  gaming: [
    {
      id: "comp_game_1",
      title: "I Built a 10,000 Player Civilization in Minecraft",
      channel: "Wisp",
      channel_avatar: "https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80",
      views: "4.1M views",
      uploaded: "2 days ago",
      thumbnail_url: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80",
      duration: "41:10",
      verified: true
    },
    {
      id: "comp_game_2",
      title: "Beating GTA 6 Without Taking Any Damage",
      channel: "RadBrad",
      channel_avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80",
      views: "1.9M views",
      uploaded: "1 day ago",
      thumbnail_url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80",
      duration: "28:44",
      verified: true
    },
    {
      id: "comp_game_3",
      title: "The Scariest Roblox Game Ever Made",
      channel: "KreekCraft",
      channel_avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80",
      views: "2.5M views",
      uploaded: "3 days ago",
      thumbnail_url: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&auto=format&fit=crop&q=80",
      duration: "18:22",
      verified: true
    }
  ],
  sports: [
    {
      id: "comp_sport_1",
      title: "DRAMA GILA! Gol Menit 98 Loloskan Timnas ke Piala Dunia?!",
      channel: "Garuda Football",
      channel_avatar: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80",
      views: "3.2M views",
      uploaded: "18 hours ago",
      thumbnail_url: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&auto=format&fit=crop&q=80",
      duration: "14:50",
      verified: true
    },
    {
      id: "comp_sport_2",
      title: "INSANE CHAMPIONS LEAGUE COMEBACK (90+5' Penalty Goal!)",
      channel: "UEFA Champions League",
      channel_avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      views: "5.7M views",
      uploaded: "1 day ago",
      thumbnail_url: "https://images.unsplash.com/photo-1489944445391-11dd35574ca6?w=800&auto=format&fit=crop&q=80",
      duration: "10:15",
      verified: true
    },
    {
      id: "comp_sport_3",
      title: "Why Nobody Can Stop Vinicius Jr Right Now",
      channel: "Tifo Football",
      channel_avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      views: "1.1M views",
      uploaded: "3 days ago",
      thumbnail_url: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&auto=format&fit=crop&q=80",
      duration: "12:30",
      verified: true
    }
  ]
};

// GET /api/simulator/feed - Returns real or curated competitor YouTube feed
app.get("/api/simulator/feed", async (req, res) => {
  try {
    const niche = (req.query.niche as string) || "tech";
    const query = (req.query.query as string)?.trim();
    const apiKey = process.env.YOUTUBE_API_KEY?.trim();

    // 1. Try real YouTube Search API if query is provided
    if (apiKey && query) {
      try {
        const ytRes = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=8&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (ytRes.ok) {
          const data = await ytRes.json();
          if (Array.isArray(data.items) && data.items.length > 0) {
            const liveItems = data.items.map((it: any) => ({
              id: it.id?.videoId || Math.random().toString(36).substring(2),
              title: it.snippet?.title || "Trending YouTube Video",
              channel: it.snippet?.channelTitle || "YouTube Creator",
              channel_avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(it.snippet?.channelTitle || "yt")}`,
              views: `${Math.floor(Math.random() * 850) + 120}K views`,
              uploaded: "Recently",
              thumbnail_url: it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url,
              duration: `${Math.floor(Math.random() * 15) + 6}:${Math.floor(Math.random() * 50) + 10}`,
              verified: true
            }));
            return res.json({
              success: true,
              source: "youtube_live",
              niche: niche,
              items: liveItems
            });
          }
        }
      } catch (e: any) {
        console.warn("[Simulator] YouTube Live API search failed, falling back to curated feed:", e.message || e);
      }
    }

    // 2. Return Curated High-Definition Niche Feed
    const feed = CURATED_NICHE_VIDEOS[niche] || CURATED_NICHE_VIDEOS["tech"];
    return res.json({
      success: true,
      source: "curated_niche",
      niche: niche,
      items: feed
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || "Failed to load feed" });
  }
});

// POST /api/simulator/audit - Groq AI Blindspot & CTR Contrast Audit
app.post("/api/simulator/audit", async (req, res) => {
  try {
    const { title, hook_text, accent_color, concept, competitors } = req.body;
    const apiKey = process.env.GROQ_API_KEY?.trim();

    if (!apiKey) {
      return res.json({
        success: true,
        source: "heuristic",
        audit: {
          dominance_score: 91,
          legibility_score: 95,
          color_contrast_edge: "+35% visual pop vs competitors",
          squint_pass: true,
          pros: [
            "High-contrast hook typography creates immediate visual pop against YouTube dark mode.",
            "Clear facial / subject silhouette creates rapid emotional connection in under 0.5s.",
            "Short punchy hook text (2-3 words) avoids mobile truncation."
          ],
          blindspot_alerts: [
            "Ensure hook text doesn't overlap the bottom-right YouTube video timestamp pill.",
            "Keep the most crucial keywords in the first 45 characters of your title."
          ]
        }
      });
    }

    const compTitles = (Array.isArray(competitors) ? competitors : [])
      .slice(0, 4)
      .map((c: any, i: number) => `${i + 1}. "${c.title}" by ${c.channel}`)
      .join("\n");

    const prompt = `You are CreatorIQ YouTube CTR & Feed Blindspot Auditor.
Analyze this creator's thumbnail concept against adjacent competitor videos in the YouTube feed:
Candidate Video:
- Title: "${title || 'Untitiled Video'}"
- Hook Text: "${hook_text || 'VIRAL HOOK'}" (Accent Color: ${accent_color || '#FFE600'})
- Concept: "${concept || 'Subject Focused'}"

Adjacent Competitors in Feed:
${compTitles || "General trending videos in niche"}

Audit this candidate thumbnail against the surrounding feed. Output strictly a JSON object matching this schema:
{
  "dominance_score": number (80-99),
  "legibility_score": number (85-100),
  "color_contrast_edge": string (e.g. "+38% visual pop vs competitors"),
  "squint_pass": boolean,
  "pros": ["Point 1", "Point 2", "Point 3"],
  "blindspot_alerts": ["Alert 1", "Alert 2"]
}`;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [
          { role: "system", content: "You are a JSON only output engine. Return valid JSON strictly." },
          { role: "user", content: prompt }
        ],
        temperature: 0.6,
        max_tokens: 650,
        response_format: { type: "json_object" }
      }),
      signal: AbortSignal.timeout(6000)
    });

    if (groqRes.ok) {
      const gJson = await groqRes.json();
      const content = gJson.choices?.[0]?.message?.content;
      const parsed = cleanJson(content);
      if (parsed && typeof parsed.dominance_score === "number") {
        return res.json({
          success: true,
          source: "groq_ai",
          model: "qwen/qwen3.8-27b",
          audit: parsed
        });
      }
    }

    // Fallback if AI response failed to parse
    return res.json({
      success: true,
      source: "heuristic",
      audit: {
        dominance_score: 89,
        legibility_score: 93,
        color_contrast_edge: "+32% visual pop vs competitors",
        squint_pass: true,
        pros: [
          "High-contrast hook typography creates immediate visual pop against YouTube dark mode.",
          "Clear subject silhouette creates rapid emotional connection in under 0.5s.",
          "Short punchy hook text (2-3 words) avoids mobile truncation."
        ],
        blindspot_alerts: [
          "Ensure hook text doesn't overlap the bottom-right YouTube video timestamp pill.",
          "Keep the most crucial keywords in the first 45 characters of your title."
        ]
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || "Failed to audit feed" });
  }
});

// -------------------------------------------------------------
// Feature 4: Viral Repurposer (1 Long-form to 3 Shorts / TikTok)
// -------------------------------------------------------------
app.post("/api/repurposer/extract-clips", async (req, res) => {
  try {
    const {
      video_url,
      url,
      video_title,
      title: rawTitle,
      channel_name,
      channel: rawChannel,
      reference_frame,
      base_frame,
      candidate_frames,
      duration,
      duration_seconds,
      category,
      custom_notes
    } = req.body || {};
    let title = (video_title || rawTitle || "").trim();
    let channel = (channel_name || rawChannel || "Your Channel").trim();
    const videoUrl = (video_url || url || "").trim();

    let ytDetails: any = null;
    if (videoUrl) {
      ytDetails = await getYouTubeVideoDetails(videoUrl);
      if (ytDetails && ytDetails.title) {
        if (!title || title === "Viral YouTube Video" || title === "I Tested 10 AI Tools In 24 Hours (Here is What Happened)") {
          title = ytDetails.title;
        }
        if (ytDetails.author && (!channel || channel === "Your Channel" || channel === "CreatorIQ Studio")) {
          channel = ytDetails.author;
        }
      }
    }

    if (!title) {
      title = "Uploaded Video Project";
    }

    const isIndonesian = !isEnglishContent(undefined, custom_notes, title);

    const userCandidateFrames = Array.isArray(candidate_frames) && candidate_frames.length > 0
      ? candidate_frames
      : [];

    const baseFrame = reference_frame || base_frame || userCandidateFrames[0] || ytDetails?.localFrameUrl || ytDetails?.bestFrameUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";

    const totalDurationSec = Number(duration_seconds) || (typeof duration === "number" ? duration : 0);
    const durationNote = totalDurationSec > 0
      ? `Total Video Duration: ${Math.floor(totalDurationSec / 60)}m ${Math.floor(totalDurationSec % 60)}s (${totalDurationSec}s). All extracted clip timestamps MUST fall strictly within 00:00 to ${String(Math.floor(totalDurationSec / 60)).padStart(2, "0")}:${String(Math.floor(totalDurationSec % 60)).padStart(2, "0")}!`
      : "";

    // AI Prompt for 3 Golden Clip Hooks Extraction
    const repurposePrompt = `You are CreatorIQ's elite Short-Form Content Strategist (trained on top 2026 TikTok, YouTube Shorts, and Instagram Reels algorithms).
Your mission: Analyze this uploaded video and automatically identify the 3 GOLDEN VIRAL MOMENTS (Clips) to repurpose into 9:16 vertical Shorts/TikToks.

Video Title: "${title}"
Channel / Creator: "${channel}"
${durationNote}
${custom_notes ? `Creator Notes: "${custom_notes}"` : ""}
Language: ${isIndonesian ? "Indonesian (Bahasa Indonesia)" : "English"}

REQUIREMENTS:
1. Extract EXACTLY 3 distinct golden clip moments:
   - Clip 1 (Curiosity Cliffhanger / Early Retention): Starts at a pivotal dilemma or controversial question that hooks the viewer within the first 3 seconds.
   - Clip 2 (Emotional Peak & High-Stakes Climax): The most dramatic, intense reaction, shock, or breakthrough moment in the video.
   - Clip 3 (Counter-Intuitive Twist / Value Bomb): A surprising revelation that debunks common belief and sparks heavy commenting / debate.
2. For each clip, provide:
   - "hook_headline": 5-10 words ALL CAPS meaningful and specific title capturing what is actually discussed or tested in this clip based on the video title "${title}". ${isIndonesian ? "DILARANG KERAS menggunakan clickbait klise seperti 'DETIK PALING MENGEJUTKAN!', '99% ORANG SALAH PAHAM!', 'BONGKAR RAHASIA...'. Judul HARUS murni dan akurat merangkum inti bahasan video secara konkret." : "STRICTLY FORBIDDEN from using generic clickbait templates like 'THE SHOCKING MOMENT...', '99% GET THIS WRONG'. The title MUST accurately reflect what is discussed in the video."}
   - "neon_color": Hex color for the main neon glow (e.g., "#FFE600", "#00F0FF", "#FF2E63").
   - "secondary_color": Hex accent (e.g., "#A855F7", "#34D399", "#F59E0B").
   - "timestamp_start" & "timestamp_end": Realistic timestamp strings (e.g., "00:14", "00:46") with 25-45 seconds duration.
   - "duration": Duration string (e.g., "32s").
   - "viral_score": Integer 90 to 99.
   - "projected_completion_rate": String percentage (e.g., "88%").
   - "subtitles_preview": Array of 3 short subtitle lines representing word-by-word kinetic captions.
   - "transcript_summary": 1-2 sentence description of what happens in this clip.
   - "retention_strategy": Why the algorithm will push this clip (retention psychology).
   - "audio_recommendation": Recommended trending sound or audio pacing (e.g., "High-energy Phonk beat", "Subtle Lo-fi pulse with dramatic pause").
   - "suggested_caption": Ready-to-copy viral caption including 3-5 trending hashtags (#Shorts, #TikTok, #FYP, etc.).

Output strictly a valid JSON object matching this schema:
{
  "golden_clips": [
    {
      "id": "clip_1",
      "clip_number": 1,
      "hook_type": "Curiosity Cliffhanger",
      "badge": "Highest Retention",
      "timestamp_start": "00:14",
      "timestamp_end": "00:48",
      "duration": "34s",
      "viral_score": 98,
      "projected_completion_rate": "86%",
      "hook_headline": "HOOK 1",
      "neon_color": "#FFE600",
      "secondary_color": "#00F0FF",
      "subtitles_preview": ["Line 1", "Line 2", "Line 3"],
      "transcript_summary": "Summary...",
      "retention_strategy": "Strategy...",
      "audio_recommendation": "Audio beat...",
      "suggested_caption": "Caption..."
    },
    {
      "id": "clip_2",
      "clip_number": 2,
      "hook_type": "Emotional Peak & Climax",
      "badge": "Viral Shock",
      "timestamp_start": "04:20",
      "timestamp_end": "04:54",
      "duration": "34s",
      "viral_score": 95,
      "projected_completion_rate": "81%",
      "hook_headline": "HOOK 2",
      "neon_color": "#FF2E63",
      "secondary_color": "#FFE600",
      "subtitles_preview": ["Line 1", "Line 2", "Line 3"],
      "transcript_summary": "Summary...",
      "retention_strategy": "Strategy...",
      "audio_recommendation": "Audio beat...",
      "suggested_caption": "Caption..."
    },
    {
      "id": "clip_3",
      "clip_number": 3,
      "hook_type": "Counter-Intuitive Twist",
      "badge": "Comment Magnet",
      "timestamp_start": "08:10",
      "timestamp_end": "08:42",
      "duration": "32s",
      "viral_score": 92,
      "projected_completion_rate": "77%",
      "hook_headline": "HOOK 3",
      "neon_color": "#00F0FF",
      "secondary_color": "#A855F7",
      "subtitles_preview": ["Line 1", "Line 2", "Line 3"],
      "transcript_summary": "Summary...",
      "retention_strategy": "Strategy...",
      "audio_recommendation": "Audio beat...",
      "suggested_caption": "Caption..."
    }
  ]
}`;

    let parsedClips: any = null;
    let engineUsed = "Groq Cloud AI";

    // 1. Groq Cloud AI Models Pipeline (using active, modern models)
    const groqKey = process.env.GROQ_API_KEY?.trim();

    if (groqKey) {
      const groqModels = await getActiveGroqModels(groqKey);
      for (const model of groqModels) {
        if (parsedClips && parsedClips.length >= 3) break;
        try {
          const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${groqKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: "You are an elite short-form content viral strategist. Respond with clean JSON only." },
                { role: "user", content: repurposePrompt }
              ],
              temperature: 0.7,
              max_tokens: 2048,
              response_format: { type: "json_object" }
            }),
            signal: AbortSignal.timeout(12000)
          });

          if (groqRes.ok) {
            const gData = await groqRes.json();
            const content = gData.choices?.[0]?.message?.content;
            const parsed = cleanJson(content);
            if (parsed && Array.isArray(parsed.golden_clips) && parsed.golden_clips.length > 0) {
              parsedClips = parsed.golden_clips;
              engineUsed = `Groq Cloud AI (${model})`;
              break;
            }
          }
        } catch (err: any) {
          console.warn(`[Repurposer Groq ${model} Error]:`, err.message || err);
        }
      }
    }

    // 2. High-Quality Standalone Viral Intelligence Engine (100% Local / Zero External API Dependency)
    if (!parsedClips || parsedClips.length < 3) {
      engineUsed = "CreatorIQ Standalone Content Engine (Zero API Key)";
      parsedClips = generateStandaloneViralClips({
        title,
        channel,
        duration: totalDurationSec || 60,
        customNotes: custom_notes,
        forceLanguage: isIndonesian ? "id" : "en"
      });
    }

    // Attach frame images to each clip (using real uploaded video frames or candidate frames)
    const ytFrames = Array.isArray(ytDetails?.candidateFrames) && ytDetails.candidateFrames.length > 0
      ? ytDetails.candidateFrames
      : [];

    const stockVisuals = [
      userCandidateFrames[0] || ytFrames[0] || baseFrame,
      userCandidateFrames[1] || ytFrames[1] || userCandidateFrames[0] || baseFrame,
      userCandidateFrames[2] || ytFrames[2] || userCandidateFrames[0] || baseFrame
    ];

    const formattedClips = parsedClips.slice(0, 3).map((clip: any, index: number) => {
      let headline = (clip.hook_headline || clip.title || "").trim();
      if (!headline || isTemplateTitle(headline)) {
        headline = isIndonesian ? `${title.toUpperCase()} - BAGIAN ${index + 1}` : `${title.toUpperCase()} - PART ${index + 1}`;
      }
      return {
        ...clip,
        id: clip.id || `clip_${index + 1}`,
        clip_number: index + 1,
        hook_headline: headline,
        frame_image: stockVisuals[index] || baseFrame
      };
    });

    return res.json({
      success: true,
      engine: engineUsed,
      video_title: title,
      channel_name: channel,
      aspect_ratio: "9:16",
      source_frame: baseFrame,
      candidate_frames: userCandidateFrames.length > 0 ? userCandidateFrames : (ytFrames.length > 0 ? ytFrames : [baseFrame]),
      video_details: ytDetails ? {
        videoId: ytDetails.videoId,
        title: ytDetails.title,
        author: ytDetails.author,
        bestFrameUrl: ytDetails.bestFrameUrl,
        candidateFrames: ytDetails.candidateFrames
      } : {
        title,
        author: channel,
        candidateFrames: userCandidateFrames
      },
      golden_clips: formattedClips
    });
  } catch (error: any) {
    console.error("Error in /api/repurposer/extract-clips:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to extract golden clips"
    });
  }
});

// -------------------------------------------------------------
// Repurposer Async Pipeline & Chunked Upload Endpoints (Up to 5GB)
// -------------------------------------------------------------
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB per chunk
});

const directUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tempDir = path.join(process.cwd(), "uploads", "repurposer", "temp");
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      cb(null, `direct_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 5 GB
});

// 1. Initialize Chunked Upload Session
app.post("/api/repurposer/upload/init", (req, res) => {
  try {
    const { fileName, fileSize } = req.body || {};
    const safeName = (fileName || "uploaded_video.mp4").trim();
    const size = Number(fileSize) || 0;

    const job = createNewJob(safeName, size);
    return res.json({
      success: true,
      jobId: job.id,
      message: "Upload session initialized."
    });
  } catch (err: any) {
    console.error("[Repurposer upload/init error]:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Receive Chunk and Append to Disk Stream
app.post("/api/repurposer/upload/chunk", chunkUpload.single("chunk") as any, (req, res) => {
  try {
    const { jobId, chunkIndex, totalChunks } = req.body || {};
    if (!jobId) {
      return res.status(400).json({ success: false, message: "jobId is required." });
    }

    const job = getJob(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found or expired." });
    }

    const chunkBuffer = (req as any).file?.buffer;
    if (!chunkBuffer || chunkBuffer.length === 0) {
      return res.status(400).json({ success: false, message: "Empty chunk received." });
    }

    // Append chunk directly to destination video file on disk
    fs.appendFileSync(job.filePath, chunkBuffer);

    const cIdx = parseInt(chunkIndex, 10) || 0;
    const tChunks = parseInt(totalChunks, 10) || 1;
    const progress = Math.min(100, Math.round(((cIdx + 1) / tChunks) * 100));

    return res.json({
      success: true,
      jobId,
      chunkIndex: cIdx,
      progress,
      message: `Chunk ${cIdx + 1}/${tChunks} written.`
    });
  } catch (err: any) {
    console.error("[Repurposer upload/chunk error]:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Complete Upload & Kick off Background Processing
app.post("/api/repurposer/upload/complete", (req, res) => {
  try {
    const { jobId, layoutMode } = req.body || {};
    if (!jobId) {
      return res.status(400).json({ success: false, message: "jobId is required." });
    }

    const job = getJob(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found." });
    }

    if (!fs.existsSync(job.filePath)) {
      return res.status(400).json({ success: false, message: "Video file is missing on disk." });
    }

    const stat = fs.statSync(job.filePath);
    job.fileSize = stat.size;

    // Start processing in background asynchronously (does not block HTTP response)
    setImmediate(() => {
      startRepurposerBackgroundJob(jobId, layoutMode || "crop_fill");
    });

    return res.json({
      success: true,
      jobId,
      status: "queued",
      message: "Video upload complete. Background processing started."
    });
  } catch (err: any) {
    console.error("[Repurposer upload/complete error]:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Single Direct Upload Endpoint (Standard Form Data)
app.post("/api/repurposer/upload/direct", directUpload.single("video") as any, (req, res) => {
  try {
    const uploaded = (req as any).file;
    if (!uploaded) {
      return res.status(400).json({ success: false, message: "No video file uploaded." });
    }

    const safeName = uploaded.originalname || "uploaded_video.mp4";
    const job = createNewJob(safeName, uploaded.size);

    // Move uploaded file to job directory
    fs.renameSync(uploaded.path, job.filePath);

    // Start processing in background
    setImmediate(() => {
      startRepurposerBackgroundJob(job.id);
    });

    return res.json({
      success: true,
      jobId: job.id,
      status: "queued",
      message: "Video uploaded. Background processing started."
    });
  } catch (err: any) {
    console.error("[Repurposer upload/direct error]:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Job Status & Real-time Progress Polling
app.get("/api/repurposer/job/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);
  if (!job) {
    return res.status(404).json({ success: false, message: "Job not found or expired." });
  }

  return res.json({
    success: true,
    job: {
      id: job.id,
      originalFileName: job.originalFileName,
      fileSize: job.fileSize,
      duration: job.duration,
      status: job.status,
      stage: job.status,
      progress: job.progress,
      stageLabel: job.stageLabel,
      logs: job.logs,
      error: job.error,
      transcriptLanguage: job.transcript?.language || null,
      totalSegments: job.transcript?.segments?.length || 0,
      clips: job.clips
    }
  });
});

// 5b. Get Latest Job (For persistent state reload & auto-recovery)
app.get("/api/repurposer/latest-job", (req, res) => {
  const job = getLatestJob();
  if (!job) {
    return res.json({ success: false, message: "No active or recent job found." });
  }

  return res.json({
    success: true,
    job: {
      id: job.id,
      originalFileName: job.originalFileName,
      fileSize: job.fileSize,
      duration: job.duration,
      status: job.status,
      stage: job.status,
      progress: job.progress,
      stageLabel: job.stageLabel,
      logs: job.logs,
      error: job.error,
      transcriptLanguage: job.transcript?.language || null,
      totalSegments: job.transcript?.segments?.length || 0,
      clips: job.clips
    }
  });
});

// 5.5 Stream Single Clip MP4 (Inline video player with HTTP 206 Partial Content range support)
app.get("/api/repurposer/stream/:jobId/:clipId", (req, res) => {
  const { jobId, clipId } = req.params;
  const filePath = getClipFilePath(jobId, clipId);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "Clip file not found or still rendering." });
  }

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", "inline");
  return res.sendFile(path.resolve(filePath), { acceptRanges: true });
});

// 6. Download Single Clip MP4 (Self-healing on-demand rendering)
app.get("/api/repurposer/download/:jobId/:clipId", async (req, res) => {
  const { jobId, clipId } = req.params;
  const filePath = await ensureClipRendered(jobId, clipId);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "Clip file not found or could not be generated." });
  }

  const job = getJob(jobId);
  const clip = job?.clips?.find((c) => c.id === clipId);
  const clipNum = clip?.clipNumber || clipId.replace(/[^0-9]/g, "") || "1";
  const rawTitle = clip?.title || clip?.hook || "Viral_Shorts";
  const cleanTitle = rawTitle.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 35).replace(/^_|_$/g, "");
  const downloadFilename = `Clip_${clipNum}_${cleanTitle || "Shorts"}_916.mp4`;

  res.setHeader("Content-Type", "video/mp4");
  return res.download(path.resolve(filePath), downloadFilename, (err) => {
    if (err && !res.headersSent) {
      console.error("[Repurposer Download Error]:", err);
    }
  });
});

// 7. Download All Clips as a ZIP file (Guaranteed non-empty zip)
app.get("/api/repurposer/download-all/:jobId", async (req, res) => {
  const { jobId } = req.params;
  await handleZipDownload(jobId, res);
});

// 8. Delete / Cancel Job and Cleanup Temporary Files
app.delete("/api/repurposer/job/:jobId", (req, res) => {
  const { jobId } = req.params;
  cleanupJobDirectory(jobId);
  return res.json({ success: true, message: `Job ${jobId} and temporary files removed.` });
});

// 9. Re-render clips with new 9:16 layout adaptation (crop_fill, blurred_backdrop, split_stacked)
app.post("/api/repurposer/job/:jobId/re-render", (req, res) => {
  try {
    const { jobId } = req.params;
    const { layoutMode, titles } = req.body || {};
    const job = getJob(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job tidak ditemukan." });
    }

    setImmediate(() => {
      reRenderJobWithLayout(jobId, layoutMode || job.layoutMode || "crop_fill", titles).catch((err) => {
        console.error(`[Repurposer] reRenderJobWithLayout error for ${jobId}:`, err);
      });
    });

    return res.json({
      success: true,
      message: `Render ulang format 9:16 (${layoutMode || job.layoutMode || "crop_fill"}) dengan judul top 4 detik telah dimulai.`,
      jobId
    });
  } catch (err: any) {
    console.error("[Repurposer re-render endpoint error]:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// Auto-Cleanup & Storage Management Endpoints
// -------------------------------------------------------------
// GET /api/cleanup/status - Current storage size, active config, and logs
app.get("/api/cleanup/status", (req, res) => {
  try {
    const status = getCleanupStatus();
    return res.json({
      success: true,
      ...status
    });
  } catch (err: any) {
    console.error("[Cleanup API status error]:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/cleanup/run - Trigger immediate on-demand cleanup
app.post("/api/cleanup/run", (req, res) => {
  try {
    const { forceAll, olderThanHours, reason } = req.body || {};
    const result = executeCleanup({
      forceAll: Boolean(forceAll),
      olderThanHours: typeof olderThanHours === "number" ? olderThanHours : undefined,
      reason: reason || (forceAll ? "Pembersihan manual langsung (Semua cache)" : "Pembersihan manual file kedaluwarsa")
    });

    return res.json({
      success: true,
      message: `Pembersihan berhasil: ${result.filesDeleted} file dihapus, ${result.formattedFreed} ruang dibebaskan.`,
      ...result
    });
  } catch (err: any) {
    console.error("[Cleanup API run error]:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/cleanup/config - Update retention hours or auto-cleanup schedule
app.post("/api/cleanup/config", (req, res) => {
  try {
    const { retentionHours, intervalMinutes, autoCleanupEnabled } = req.body || {};
    const updated = saveCleanupConfig({
      retentionHours: typeof retentionHours === "number" ? retentionHours : undefined,
      intervalMinutes: typeof intervalMinutes === "number" ? intervalMinutes : undefined,
      autoCleanupEnabled: typeof autoCleanupEnabled === "boolean" ? autoCleanupEnabled : undefined
    });

    return res.json({
      success: true,
      message: `Pengaturan pembersihan otomatis disimpan: file berumur lebih dari ${updated.retentionHours} jam akan dibersihkan otomatis.`,
      config: updated,
      status: getCleanupStatus()
    });
  } catch (err: any) {
    console.error("[Cleanup API config error]:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Global API Error Handler to guarantee JSON responses
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Server Error Handler]:", err);
  if (res.headersSent) {
    return next(err);
  }
  return res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error"
  });
});

// -------------------------------------------------------------
// Vite Server Integration (Middleware Mode)
// -------------------------------------------------------------
async function startServer() {
  // Initialize Real Automatic Cleanup Engine
  initCleanupManager(removeJobFromMemory);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CreatorIQ Server running on http://localhost:${PORT}`);
  });
}

startServer();
