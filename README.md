# CreatorIQ – AI Video Content Engine for YouTube Creators

> An all-in-one AI Content Engine that transforms raw ideas and long-form video footage into high-CTR titles, vision-optimized thumbnails, competitor-benchmarked feed simulations, and viral 9:16 vertical shorts.

Built for the **AI Content Engine Hackathon** on [Devpost](https://ai-content-engine-hacks.devpost.com/).

---

## 📌 Inspiration

Modern YouTube creators spend 80% of their time on secondary packaging and distribution tasks rather than creative production:
1. **Title Guesswork**: Guessing which title formula triggers curiosity without becoming misleading clickbait.
2. **Thumbnail Disconnect**: Creating thumbnails in isolation without testing how they actually look against fierce competitors in a real YouTube feed.
3. **Repurposing Bottleneck**: Manually scrubbing through 20–60 minute long-form videos to cut hooks, re-crop to 9:16 vertical format, format animated captions, and export clips for YouTube Shorts, TikTok, and Instagram Reels.

We built **CreatorIQ** as an end-to-end **AI Content Engine** that unifies the entire post-production packaging pipeline into a single, cohesive creator studio.

---

## 🚀 What It Does (The 4 Core Engines)

CreatorIQ consists of four tightly integrated AI modules:

### 1. Title Intelligence & CTR Scorer
* **Algorithmic CTR Scoring**: Evaluates candidate video titles against proven viral packaging frameworks (Curiosity Gap, High Stakes, Emotional Tension, Extreme Contrast, and Clarity).
* **Live Competitor Context**: Integrates with the **YouTube Data API v3** to search real-world top-performing videos in the creator's niche and benchmark title strength against actual view counts.
* **Smart Variation Generator**: Generates 5 high-converting alternative titles categorized by angle (Curiosity, Urgency, Storytelling, Direct Value, and Question Hook) powered by Google Gemini.

### 2. High-CTR Thumbnail Studio & Vision Pipeline
* **Frame-by-Frame Vision Analysis**: Allows creators to upload video files or candidate frames. The vision pipeline analyzes facial expressions, emotional intensity, focal point placement, and visual clutter.
* **AI Image Generation & Composition**: Leverages Gemini image generation models (with OpenRouter / HuggingFace fallback pipelines) to generate compelling visual assets tailored for YouTube thumbnails.
* **Dynamic Overlay Engine**: Live preview overlay with customizable badge styles, high-contrast typography stickers, and timestamp indicators.

### 3. YouTube Feed Competitor A/B Simulator
* **Real YouTube Feed Replica**: Renders an authentic, interactive replica of YouTube's desktop, mobile, and search feeds.
* **Live Competitor Injection**: Queries the YouTube Data API for actual competitor videos under the target search term, placing the creator's thumbnail and title side-by-side with real trending content.
* **AI Feed Contrast Audit**: Automatically audits visual dominance, color contrast against surrounding thumbnails, text readability at mobile scale, and title-thumbnail synergy.

### 4. Viral 9:16 Shorts Repurposer
* **Resilient Video Ingestion**: Supports direct upload and chunked upload (`/api/repurposer/upload/chunk`) with client-side frame scrubbing and progress indicators.
* **Automated Audio & Moment Extraction**: Uses server-side FFmpeg to process audio and video streams, identify high-engagement timestamps, and detect "Golden Clips" with retention ratings and hook analysis.
* **Multi-Layout 9:16 Framing**:
  * *Split Screen (50/50)*: Places the speaker camera on top and gameplay/b-roll on the bottom.
  * *Dynamic Center Focus*: Scales and frames the central action for vertical consumption.
  * *Blurred Backdrop (Pan & Scan)*: Keeps full 16:9 context centered over an aesthetically blurred, enlarged background.
* **Interactive 9:16 Smartphone Preview**: Live mobile simulator with real-time animated subtitles, sound mute/unmute control, and instant preview of selected clips.
* **Export Options**: Individual clip download (.mp4) and one-click bulk ZIP export (`archiver`) containing all generated vertical shorts and metadata.
* **Automated Storage Management**: Built-in cleanup manager (`/api/cleanup/*`) with configurable retention policies to keep server disk usage healthy.

---

## 🛠️ System Architecture & How We Built It

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Frontend                        │
│   Tailwind CSS • Vanilla TS / Interactive UI • FontAwesome  │
│   • 9:16 Mobile Simulator • Live Feed A/B Canvas            │
└──────────────────────────────┬──────────────────────────────┘
                               │ JSON / Chunked Multipart Form
┌──────────────────────────────▼──────────────────────────────┐
│                    Express Backend Server                   │
│   (server.ts • TypeScript • tsx dev • esbuild bundle)       │
├──────────────────────────────┬──────────────────────────────┤
│        AI & Vision Layer     │      Media Processing Layer  │
│  • Google Gemini SDK         │  • FFmpeg Native Pipelines   │
│    (@google/genai)           │  • Frame Snapshot Extractors │
│  • Gemini 3.8 / 3.1 Flash    │  • Multi-layout 9:16 Render  │
│  • OpenRouter / Groq APIs    │  • Archiver (ZIP Generation) │
│  • YouTube Data API v3       │  • Multer Storage & Chunks   │
└──────────────────────────────┴──────────────────────────────┘
```

* **Frontend**: HTML5, Tailwind CSS, modern responsive UI design, interactive 9:16 smartphone player with Web Video API.
* **Backend**: Node.js & Express with TypeScript (`server.ts`).
* **AI Models**: Google Gemini (`@google/genai`), utilizing `gemini-3.8-flash` and `gemini-3.1-flash-lite` for multimodal reasoning, title intelligence, and transcript-free hook detection.
* **External Integrations**: YouTube Data API v3 for live competitor video search and metric benchmarking.
* **Media Processing**: Native FFmpeg integration for fast audio stream extraction, timestamp slicing, layout composition, and 9:16 video conversion.
* **Build System**: Vite + `esbuild` CommonJS bundling for fast cold-starts and clean deployment.

---

## ⚡ Key Technical Highlights

1. **Chunked Video Upload Pipeline**: Large creator videos are uploaded in sequential binary chunks to handle network instability without losing progress.
2. **Deterministic Background Processing**: Repurposing tasks run as asynchronous background jobs with live status polling (`/api/repurposer/job/:jobId`) and progress reporting.
3. **Audio Leak Prevention**: Strict lifecycle state machine ensures audio decoders and video previews are muted during uploads and background rendering, preventing unwanted audio playback.
4. **Resilient AI Fallback Architecture**: Primary calls use Google Gemini; if secondary models or specific vision parameters are requested, fallback routes maintain uninterrupted service.

---

## 🧗 Challenges We Encountered & How We Solved Them

1. **Aspect Ratio Conversion Without Distortion**:
   * *Challenge*: Converting horizontal (16:9) video to vertical (9:16) often results in stretched subjects or cropped heads.
   * *Solution*: Implemented three distinct FFmpeg layout filters—Split Screen (top/bottom stack), Blurred Backdrop (pan & scan), and Center Crop—allowing creators to pick the best framing for their specific content type.

2. **In-Browser Video Preview vs. Server Processing**:
   * *Challenge*: Creators want immediate visual feedback without waiting minutes for complete server-side re-encoding.
   * *Solution*: Created a hybrid preview system: the client extracts immediate canvas frames and streams local video blobs for real-time mobile preview, while the server FFmpeg worker generates the final production-quality MP4 clips in the background.

3. **Live Competitor Benchmarking**:
   * *Challenge*: Creators usually test titles in a vacuum, leading to blind spots regarding what competitors in the same niche are doing.
   * *Solution*: Integrated YouTube Data API v3 search with view count retrieval, allowing the AI to score title angles against actual competitors currently ranking for the same keywords.

---

## 🏆 Accomplishments That We're Proud Of

* **Zero-Context Switching**: A creator can optimize a title, generate a thumbnail, test it in a simulated competitor feed, and extract vertical shorts without ever leaving the application.
* **Full-Stack Performance**: Fast, responsive single-page experience backed by a production-ready Express server that handles heavy video slicing, ZIP compression, and AI orchestration.
* **Authentic YouTube Feed Simulator**: Pixel-accurate simulation of YouTube's actual desktop and mobile feed layouts, providing genuine visual contrast feedback before publishing.

---

## 📚 What We Learned

* **Visual Contrast Trumps Aesthetics**: In YouTube thumbnails, a technically "beautiful" image often underperforms if it blends into YouTube's dark mode or lacks emotional focus. Contrast-testing against live competitors is a game changer for creators.
* **Multimodal AI for Video Repurposing**: Combining Gemini's multimodal reasoning with deterministic media utilities (FFmpeg) produces far superior results than attempting to do video editing purely via prompt generation.

---

## 🔮 What's Next for CreatorIQ

* **Direct YouTube API Publishing**: Allowing creators to schedule videos, update thumbnails, and publish generated Shorts directly to their channel with one click.
* **Voice-Cloned Multi-Language Dubbing**: Automatically translating and dubbing vertical shorts into Spanish, Indonesian, and Hindi for global audience reach.
* **Automated B-Roll Insertion**: Using Gemini to detect pauses and automatically insert relevant overlay footage into short clips.

---

## 💻 Local Setup & Installation Guide

### Prerequisites
* **Node.js**: v18.0 or higher
* **FFmpeg**: Installed and available in your system `PATH` (for video slicing and 9:16 rendering)
* **npm** or **pnpm**

### 1. Clone & Install Dependencies
```bash
git clone <your-repo-url>
cd creatoriq
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your API keys:
```bash
cp .env.example .env
```

Key environment variables:
```env
# Required for AI Features
GEMINI_API_KEY=your_gemini_api_key_here

# Required for Live Competitor Feed Search (Optional but recommended)
YOUTUBE_API_KEY=your_youtube_data_api_v3_key_here

# Optional Fallback Providers
OPENROUTER_API_KEY=
GROQ_API_KEY=
```

### 3. Run Development Server
```bash
npm run dev
```
Open your browser and navigate to:
```
http://localhost:3000
```

### 4. Build for Production
```bash
npm run build
npm run start
```

---

## 📄 License
MIT License. Built with ❤️ for YouTube creators worldwide.
