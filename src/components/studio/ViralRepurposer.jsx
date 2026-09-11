import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Play,
  Pause,
  Download,
  Copy,
  Check,
  RefreshCw,
  Smartphone,
  Scissors,
  Volume2,
  VolumeX,
  TrendingUp,
  Hash,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Music,
  Sliders,
  Video,
  Layers,
  CheckCircle2,
  AlertCircle,
  Upload,
  FileVideo,
  Clock,
  RotateCcw,
  HardDrive
} from 'lucide-react';
import StorageCleanupModal from './StorageCleanupModal';

// Helper to convert "MM:SS" or "HH:MM:SS" string to seconds
const parseTimestampToSeconds = (ts) => {
  if (!ts) return 0;
  const parts = ts.toString().split(':').map((p) => parseFloat(p) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
};

// Format seconds into MM:SS
const formatSeconds = (sec) => {
  if (isNaN(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// Render styled hook title matching Screenshot 1 (Yellow + White stacked lines, thick black stroke, NO BOX)
const renderScreenshot1Title = (titleText, accentColor = '#FFE600') => {
  if (!titleText) return null;
  const clean = titleText.replace(/^["']|["']$/g, '').trim().toUpperCase();

  // If colon exists: e.g. "BUG CHARGING ADVAN X1: KLAIM 18W TAPI CUMA 10W"
  if (clean.includes(':')) {
    const parts = clean.split(':');
    const header = parts[0].trim();
    const body = parts.slice(1).join(':').trim();
    return (
      <div className="flex flex-col items-center leading-tight">
        <span style={{ color: accentColor }}>{header}:</span>
        {body && <span className="text-white">{body}</span>}
      </div>
    );
  }

  // If question mark exists: e.g. "BUG CHARGING ADVAN X1? KLAIM 18W TAPI NYATA HANYA 10W"
  if (clean.includes('?')) {
    const parts = clean.split('?');
    const header = parts[0].trim();
    const body = parts.slice(1).join('?').trim();
    return (
      <div className="flex flex-col items-center leading-tight">
        <span style={{ color: accentColor }}>{header}?</span>
        {body && <span className="text-white">{body}</span>}
      </div>
    );
  }

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 4) {
    return <span style={{ color: accentColor }}>{clean}</span>;
  }

  // Split into 2 balanced lines
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(' ');
  const line2 = words.slice(mid).join(' ');

  return (
    <div className="flex flex-col items-center leading-tight">
      <span style={{ color: accentColor }}>{line1}</span>
      <span className="text-white">{line2}</span>
    </div>
  );
};

// Render kinetic subtitle matching Screenshot 1 (Alternating Yellow/White words, thick black stroke, NO BOX)
const renderScreenshot1Subtitle = (subText, accentColor = '#FFE600') => {
  if (!subText) return null;
  const clean = subText.replace(/^["']|["']$/g, '').trim().toUpperCase();
  const words = clean.split(/\s+/).filter(Boolean);

  return (
    <div className="inline-flex flex-wrap items-center justify-center gap-1.5 px-2 max-w-[95%]">
      {words.map((word, wIdx) => (
        <span
          key={wIdx}
          style={{
            color: wIdx % 2 === 1 ? accentColor : '#FFFFFF',
            WebkitTextStroke: '2.5px #000',
            paintOrder: 'stroke fill',
            textShadow: '0 2px 6px rgba(0,0,0,0.95), 0 0 2px #000'
          }}
          className="font-black text-sm sm:text-base tracking-wide"
        >
          {word}
        </span>
      ))}
    </div>
  );
};

export const ViralRepurposer = ({ onSelectTab, onTestInSimulator, currentProjectData }) => {
  // Uploaded Video States
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState('');
  const [videoDuration, setVideoDuration] = useState(60);
  const [videoResolution, setVideoResolution] = useState('1920x1080');
  const [videoFileSize, setVideoFileSize] = useState('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  // Video Frame Snapshots
  const [candidateFrames, setCandidateFrames] = useState([
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80'
  ]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);

  // Metadata States
  const [videoTitle, setVideoTitle] = useState(
    currentProjectData?.title || 'My Uploaded Video Project'
  );
  const [channelName, setChannelName] = useState(currentProjectData?.channel || 'CreatorIQ Studio');
  const [referenceFrame, setReferenceFrame] = useState(
    currentProjectData?.image || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'
  );

  // AI Extraction States
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [engineUsed, setEngineUsed] = useState('CreatorIQ Multi-Platform Neural Engine');
  const [goldenClips, setGoldenClips] = useState([]);
  const [activeClipIndex, setActiveClipIndex] = useState(0);

  // 9:16 Canvas & Player Customizer States
  const [layoutMode, setLayoutMode] = useState('blurred_backdrop'); // 'blurred_backdrop' | 'crop_fill' | 'split_stacked'
  const [hookPosition, setHookPosition] = useState('center'); // 'top' | 'center' | 'bottom'
  const [customHookText, setCustomHookText] = useState('');
  const [customNeonColor, setCustomNeonColor] = useState('#FFE600');
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState(0);
  const [hasCopiedCaption, setHasCopiedCaption] = useState(false);
  const [hasCopiedPackage, setHasCopiedPackage] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRecordingClip, setIsRecordingClip] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);

  // Storage and Auto-cleanup state
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const [cleanupRetentionHours, setCleanupRetentionHours] = useState(2);

  useEffect(() => {
    fetch('/api/cleanup/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.retentionHours) {
          setCleanupRetentionHours(data.retentionHours);
        }
      })
      .catch(() => {});
  }, [isStorageModalOpen]);

  // Video Refs
  const mainVideoRef = useRef(null);
  const bgVideoRef = useRef(null);

  // Sync active clip custom text
  const currentClip = goldenClips[activeClipIndex] || null;

  // Active clip time boundaries in seconds
  const clipStartSec = currentClip ? parseTimestampToSeconds(currentClip.timestamp_start) : 0;
  const clipEndSec = currentClip
    ? parseTimestampToSeconds(currentClip.timestamp_end) || clipStartSec + 30
    : 30;
  const clipLengthSec = Math.max(1, clipEndSec - clipStartSec);

  // Initial load
  useEffect(() => {
    handleExtractClips(videoTitle, referenceFrame, candidateFrames, videoDuration);
  }, []);

  // When active clip changes, seek video to clipStartSec and sync hook
  useEffect(() => {
    if (currentClip) {
      setCustomHookText(currentClip.hook_headline || currentClip.title || currentClip.hook || '');
      setCustomNeonColor(currentClip.neon_color || '#FFE600');
      setActiveSubtitleIndex(0);

      const targetFrame = currentClip.frame_image || referenceFrame;
      setReferenceFrame(targetFrame);

      const isClipRendered = Boolean(
        uploadedVideoUrl && (
          uploadedVideoUrl.includes('/api/repurposer/stream/') ||
          uploadedVideoUrl.includes('/uploads/repurposer/jobs/') ||
          (currentClip.outputUrl && uploadedVideoUrl === currentClip.outputUrl)
        )
      );

      const targetSeek = isClipRendered ? 0 : clipStartSec;

      if (mainVideoRef.current) {
        mainVideoRef.current.currentTime = targetSeek;
        if (isPlaying) {
          mainVideoRef.current.play().catch(() => {});
        }
      }
      if (bgVideoRef.current) {
        bgVideoRef.current.currentTime = targetSeek;
        if (isPlaying) {
          bgVideoRef.current.play().catch(() => {});
        }
      }
    }
  }, [activeClipIndex, goldenClips]);

  // Video timeupdate handler to keep video within clip loop
  const handleVideoTimeUpdate = () => {
    if (!mainVideoRef.current) return;
    const cur = mainVideoRef.current.currentTime;
    setCurrentPlaybackTime(cur);

    const isClipRendered = Boolean(
      uploadedVideoUrl && (
        uploadedVideoUrl.includes('/api/repurposer/stream/') ||
        uploadedVideoUrl.includes('/uploads/repurposer/jobs/') ||
        (currentClip?.outputUrl && uploadedVideoUrl === currentClip.outputUrl)
      )
    );

    // If past clip end time, loop back to clip start
    if (isClipRendered) {
      const clipDuration = mainVideoRef.current.duration || clipLengthSec;
      if (cur >= clipDuration - 0.2) {
        mainVideoRef.current.currentTime = 0;
        if (bgVideoRef.current) bgVideoRef.current.currentTime = 0;
      }
    } else {
      if (cur >= clipEndSec || cur < clipStartSec - 0.5) {
        mainVideoRef.current.currentTime = clipStartSec;
        if (bgVideoRef.current) {
          bgVideoRef.current.currentTime = clipStartSec;
        }
      }
    }

    // Advance subtitle based on progress through clip
    const subList = currentClip?.subtitles_preview || currentClip?.subtitles;
    if (subList?.length) {
      const relTime = isClipRendered ? cur : Math.max(0, cur - clipStartSec);
      const progress = Math.max(0, Math.min(1, relTime / Math.max(1, clipLengthSec)));
      const subIdx = Math.min(
        subList.length - 1,
        Math.floor(progress * subList.length)
      );
      setActiveSubtitleIndex(subIdx);
    }
  };

  // Sync background video with main video
  const handlePlayToggle = () => {
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    if (mainVideoRef.current) {
      if (nextPlaying) {
        mainVideoRef.current.play().catch(() => {});
      } else {
        mainVideoRef.current.pause();
      }
    }
    if (bgVideoRef.current) {
      if (nextPlaying) {
        bgVideoRef.current.play().catch(() => {});
      } else {
        bgVideoRef.current.pause();
      }
    }
  };

  // Toggle Mute
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (mainVideoRef.current) {
      mainVideoRef.current.muted = nextMuted;
    }
  };

  // Subtitle cycle fallback if video is not loaded
  useEffect(() => {
    if (!uploadedVideoUrl && isPlaying && currentClip?.subtitles_preview?.length) {
      const interval = setInterval(() => {
        setActiveSubtitleIndex((prev) => (prev + 1) % currentClip.subtitles_preview.length);
      }, 2400);
      return () => clearInterval(interval);
    }
  }, [uploadedVideoUrl, isPlaying, currentClip]);

  // Handle Video File Extraction via HTML5 Canvas
  const handleFileUpload = (file) => {
    if (!file) return;
    setIsProcessingFile(true);

    const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    const displayTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
    setVideoTitle(displayTitle);
    setUploadedFile(file);

    // Format file size
    const mbSize = (file.size / (1024 * 1024)).toFixed(1);
    setVideoFileSize(`${mbSize} MB`);

    if (file.type.startsWith('video/')) {
      const objUrl = URL.createObjectURL(file);
      setUploadedVideoUrl(objUrl);

      const video = document.createElement('video');
      video.src = objUrl;
      video.muted = true;
      video.playsInline = true;

      video.addEventListener('loadedmetadata', () => {
        const duration = Math.max(10, Math.floor(video.duration || 60));
        setVideoDuration(duration);
        if (video.videoWidth && video.videoHeight) {
          setVideoResolution(`${video.videoWidth}x${video.videoHeight}`);
        }

        // Capture 3 strategic retention frames:
        // Frame 1: Hook at 15% duration
        // Frame 2: Climax at 50% duration
        // Frame 3: Twist at 80% duration
        const captureTimes = [
          Math.min(duration * 0.15, duration - 5),
          Math.min(duration * 0.5, duration - 3),
          Math.min(duration * 0.8, duration - 1)
        ];
        const extracted = [];
        let cur = 0;

        const capture = () => {
          if (cur >= captureTimes.length) {
            if (extracted.length > 0) {
              setReferenceFrame(extracted[0]);
              setCandidateFrames(extracted);
              setSelectedCandidateIndex(0);
              handleExtractClips(displayTitle, extracted[0], extracted, duration);
            }
            setIsProcessingFile(false);
            return;
          }
          video.currentTime = Math.max(0, captureTimes[cur]);
        };

        video.addEventListener('seeked', () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              extracted.push(canvas.toDataURL('image/jpeg', 0.88));
            }
          } catch (e) {
            console.warn('Frame capture error:', e);
          }
          cur++;
          capture();
        });

        capture();
      });
    } else if (file.type.startsWith('image/')) {
      // Still image upload
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          const imgData = e.target.result;
          setReferenceFrame(imgData);
          setCandidateFrames([imgData, imgData, imgData]);
          setSelectedCandidateIndex(0);
          handleExtractClips(displayTitle, imgData, [imgData], 60);
          setIsProcessingFile(false);
        }
      };
      reader.readAsDataURL(file);
    } else {
      setIsProcessingFile(false);
    }
  };

  // Load High-Quality Sample Video for Instant One-Click Testing
  const handleLoadSampleVideo = async () => {
    setIsProcessingFile(true);
    const sampleTitle = 'Testing High Impact AI Video Tools';
    setVideoTitle(sampleTitle);
    setChannelName('CreatorIQ Lab');
    setVideoFileSize('8.4 MB (HD MP4)');
    setVideoResolution('1920x1080');
    setVideoDuration(75);

    // Reliable public Creative Commons video snippet
    const sampleUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    setUploadedVideoUrl(sampleUrl);

    // High resolution sample frames
    const sampleFrames = [
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80'
    ];
    setCandidateFrames(sampleFrames);
    setReferenceFrame(sampleFrames[0]);
    setSelectedCandidateIndex(0);

    await handleExtractClips(sampleTitle, sampleFrames[0], sampleFrames, 75);
    setIsProcessingFile(false);
  };

  // Handle Extraction API Call
  const handleExtractClips = async (overrideTitle, overrideFrame, overrideFrames, overrideDuration) => {
    setIsLoading(true);
    setLoadingStep(1);

    const titleToUse = overrideTitle || videoTitle;
    const frameToUse = overrideFrame || referenceFrame;
    const framesToUse = overrideFrames || candidateFrames;
    const durationToUse = overrideDuration || videoDuration;

    // Visual progression simulation
    const timer1 = setTimeout(() => setLoadingStep(2), 600);
    const timer2 = setTimeout(() => setLoadingStep(3), 1300);

    try {
      const response = await fetch('/api/repurposer/extract-clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_title: titleToUse,
          title: titleToUse,
          channel_name: channelName,
          channel: channelName,
          reference_frame: frameToUse,
          base_frame: frameToUse,
          candidate_frames: framesToUse,
          duration: durationToUse,
          duration_seconds: durationToUse
        })
      });

      clearTimeout(timer1);
      clearTimeout(timer2);

      const data = await response.json();
      if (data.success && Array.isArray(data.golden_clips) && data.golden_clips.length > 0) {
        setGoldenClips(data.golden_clips);
        setEngineUsed(data.engine || 'CreatorIQ Multi-Platform Neural Engine');
        if (data.video_title) setVideoTitle(data.video_title);
        if (data.source_frame) setReferenceFrame(data.source_frame);
        if (Array.isArray(data.candidate_frames) && data.candidate_frames.length > 0) {
          setCandidateFrames(data.candidate_frames);
          setSelectedCandidateIndex(0);
        }
        setActiveClipIndex(0);
      } else {
        throw new Error(data.message || 'Failed to extract golden clips');
      }
    } catch (err) {
      console.warn('Repurposer API fallback:', err);
      // Contextual standalone fallback based on uploaded video title & duration (Zero API Key)
      const dur = Math.max(15, durationToUse || 60);
      const isId = /cara|yang|di|ini|itu|dan|dari|untuk|bisa|dengan|saya|kamu|kita|gimana|rahasia|kenapa|jangan|resep|masak|belajar|koding|coding/i.test(titleToUse || '');
      const subject = (titleToUse || 'Video Highlight').replace(/\.[^/.]+$/, '').trim();

      const t1Start = formatSeconds(Math.min(10, dur * 0.08));
      const t1End = formatSeconds(Math.min(dur, Math.max(t1Start + 18, dur * 0.35)));
      const t2Start = formatSeconds(Math.min(dur - 20, Math.max(t1End + 2, dur * 0.45)));
      const t2End = formatSeconds(Math.min(dur, Math.max(t2Start + 18, dur * 0.75)));
      const t3Start = formatSeconds(Math.min(dur - 18, Math.max(t2End + 2, dur * 0.78)));
      const t3End = formatSeconds(Math.min(dur, Math.max(t3Start + 16, dur * 0.96)));

      const cleanSubject = (subject || '').trim().toUpperCase();
      const hook1 = isId
        ? `${cleanSubject} - BAGIAN 1`
        : `${cleanSubject} - PART 1`;
      const hook2 = isId
        ? `${cleanSubject} - BAGIAN 2`
        : `${cleanSubject} - PART 2`;
      const hook3 = isId
        ? `${cleanSubject} - BAGIAN 3`
        : `${cleanSubject} - PART 3`;

      setEngineUsed('CreatorIQ Standalone Content Engine (Zero API Key)');
      setGoldenClips([
        {
          id: 'clip_1',
          clip_number: 1,
          hook_type: 'Curiosity Cliffhanger',
          badge: 'Highest Retention',
          timestamp_start: t1Start,
          timestamp_end: t1End,
          duration: `${Math.round(dur * 0.3)}s`,
          viral_score: 98,
          projected_completion_rate: '88%',
          hook_headline: hook1,
          neon_color: '#FFE600',
          secondary_color: '#00F0FF',
          subtitles_preview: isId
            ? [
                `${subject} - Bagian 1`,
                'Simak perbincangan selengkapnya di video ini.'
              ]
            : [
                `${subject} - Part 1`,
                'Watch the full breakdown in this video.'
              ],
          transcript_summary: isId
            ? `Cuplikan pembuka bagian 1 dari video ${subject}.`
            : `Opening highlight segment from ${subject}.`,
          retention_strategy: isId
            ? 'Menyoroti momen pembuka yang langsung memperkenalkan topik inti video secara jelas.'
            : 'Highlights the opening premise to capture viewer interest directly without fluff.',
          audio_recommendation: 'Audio dialog asli jernih dengan ketukan tempo stabil',
          suggested_caption: isId
            ? `${hook1} — Simak cuplikan selengkapnya! #Shorts #TikTokIndonesia #FYP`
            : `${hook1} — Watch the full breakdown! #Shorts #TikTokViral #FYP`,
          frame_image: framesToUse[0] || frameToUse
        },
        {
          id: 'clip_2',
          clip_number: 2,
          hook_type: 'Emotional Peak & Climax',
          badge: 'Viral Shock',
          timestamp_start: t2Start,
          timestamp_end: t2End,
          duration: `${Math.round(dur * 0.32)}s`,
          viral_score: 95,
          projected_completion_rate: '83%',
          hook_headline: hook2,
          neon_color: '#FF2E63',
          secondary_color: '#FFE600',
          subtitles_preview: isId
            ? [
                `${subject} - Bagian 2`,
                'Momen pembahasan inti di segmen ini.'
              ]
            : [
                `${subject} - Part 2`,
                'Key discussion segment in this video.'
              ],
          transcript_summary: isId
            ? `Cuplikan pembahasan inti bagian 2 dari video ${subject}.`
            : `Key discussion clip from ${subject}.`,
          retention_strategy: isId
            ? 'Menyajikan momen perbincangan paling intens dengan pembuktian langsung.'
            : 'Presents the central argument and key visual findings.',
          audio_recommendation: 'Audio dialog fokus dengan artikulasi vokal tegas',
          suggested_caption: isId
            ? `${hook2} — Momen paling menarik di video ini! #Shorts #Trending #FYP`
            : `${hook2} — Key moment from this video! #Viral #Reels #Shorts`,
          frame_image: framesToUse[1] || framesToUse[0] || frameToUse
        },
        {
          id: 'clip_3',
          clip_number: 3,
          hook_type: 'Counter-Intuitive Twist',
          badge: 'Comment Magnet',
          timestamp_start: t3Start,
          timestamp_end: t3End,
          duration: `${Math.round(dur * 0.28)}s`,
          viral_score: 92,
          projected_completion_rate: '79%',
          hook_headline: hook3,
          neon_color: '#00F0FF',
          secondary_color: '#A855F7',
          subtitles_preview: isId
            ? [
                `${subject} - Bagian 3`,
                'Kesimpulan dan poin penting di bagian ini.'
              ]
            : [
                `${subject} - Part 3`,
                'Conclusion and main takeaways.'
              ],
          transcript_summary: isId
            ? `Cuplikan kesimpulan dan poin penting dari video ${subject}.`
            : `Concluding takeaway segment from ${subject}.`,
          retention_strategy: isId
            ? 'Poin bahasan inti yang memicu opini dan diskusi audiens di kolom komentar.'
            : 'Key takeaway segment that drives comments and natural discussion.',
          audio_recommendation: 'Modern Lo-Fi Beat dengan vokal jernih',
          suggested_caption: isId
            ? `${hook3} — Bagaimana menurut kalian? #Shorts #Tips #FYP`
            : `Stop doing it the old way! Save this so you do not forget 💡 #Tutorial #TipsAndTricks #Shorts #LifeHacks`,
          frame_image: framesToUse[2] || framesToUse[0] || frameToUse
        }
      ]);
    } finally {
      setIsLoading(false);
      setLoadingStep(0);
    }
  };

  // Copy Suggested Caption
  const handleCopyCaption = () => {
    if (!currentClip) return;
    navigator.clipboard.writeText(currentClip.suggested_caption || '');
    setHasCopiedCaption(true);
    setTimeout(() => setHasCopiedCaption(false), 2000);
  };

  // Copy Full Multi-Platform Package
  const handleCopyFullPackage = () => {
    if (!currentClip) return;
    const pkg = `🎬 VIRAL REPURPOSED CLIP #${currentClip.clip_number} (${currentClip.hook_type})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Source: Uploaded Video ("${videoTitle}")
⏱️ Video Timestamp: ${currentClip.timestamp_start} - ${currentClip.timestamp_end} (${currentClip.duration})
🔥 Viral Retention Score: ${currentClip.viral_score}/100 (Projected Completion: ${currentClip.projected_completion_rate})
📱 Format: 9:16 Vertical (YouTube Shorts / TikTok / Instagram Reels)

🪝 VERTICAL HOOK HEADLINE:
${customHookText || currentClip.hook_headline}

💬 KINETIC SUBTITLE PREVIEW:
${(currentClip.subtitles_preview || []).map((s, i) => `${i + 1}. "${s}"`).join('\n')}

📈 RETENTION STRATEGY:
${currentClip.retention_strategy}

🎵 AUDIO RECOMMENDATION:
${currentClip.audio_recommendation}

📝 READY-TO-POST CAPTION & HASHTAGS:
${currentClip.suggested_caption}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated with CreatorIQ Viral Repurposer`;

    navigator.clipboard.writeText(pkg);
    setHasCopiedPackage(true);
    setTimeout(() => setHasCopiedPackage(false), 2000);
  };

  // Export High-Res 9:16 Cover (1080x1920) via HTML5 Canvas
  const handleExportVerticalCover = async () => {
    if (!currentClip) return;
    setIsExporting(true);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      let imgSrc = currentClip.frame_image || referenceFrame || '';
      if ((imgSrc.startsWith('http://') || imgSrc.startsWith('https://')) && !imgSrc.includes(window.location.host)) {
        imgSrc = `/api/proxy-image?url=${encodeURIComponent(imgSrc)}`;
      }

      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        img.src = imgSrc;
      });

      // 1. Draw Background based on layoutMode
      if (layoutMode === 'crop_fill') {
        const scale = Math.max(1080 / img.width, 1920 / img.height);
        const nw = img.width * scale;
        const nh = img.height * scale;
        const ox = (1080 - nw) / 2;
        const oy = (1920 - nh) / 2;
        ctx.drawImage(img, ox, oy, nw, nh);
      } else if (layoutMode === 'split_stacked') {
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, 1080, 1920);
        const topH = 1080 * (9 / 16);
        ctx.drawImage(img, 0, 240, 1080, topH);
      } else {
        // Blurred Backdrop Mode (YouTube Shorts standard)
        ctx.filter = 'blur(40px) brightness(0.35)';
        const bgScale = Math.max(1080 / img.width, 1920 / img.height);
        ctx.drawImage(
          img,
          (1080 - img.width * bgScale) / 2,
          (1920 - img.height * bgScale) / 2,
          img.width * bgScale,
          img.height * bgScale
        );
        ctx.filter = 'none';

        // Dark gradient overlay
        const grad = ctx.createLinearGradient(0, 0, 0, 1920);
        grad.addColorStop(0, 'rgba(0,0,0,0.65)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.1)');
        grad.addColorStop(1, 'rgba(0,0,0,0.85)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1080, 1920);

        // Center sharp 16:9 frame
        const videoHeight = 1080 * (9 / 16);
        const videoY = (1920 - videoHeight) / 2;
        ctx.drawImage(img, 0, videoY, 1080, videoHeight);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 4;
        ctx.strokeRect(0, videoY, 1080, videoHeight);
      }

      // 2. Top timestamp badge
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 2;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(40, 90, 480, 68, 34);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(`⏱️ ${currentClip.timestamp_start} - ${currentClip.timestamp_end} (${currentClip.duration})`, 65, 134);

      // 3. Render High-Impact Neon Hook Text
      const textToRender = (customHookText || currentClip.hook_headline || 'VIRAL HOOK').toUpperCase();
      let textY = 960;
      if (hookPosition === 'top') textY = 520;
      if (hookPosition === 'bottom') textY = 1420;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '900 74px sans-serif';

      const m = ctx.measureText(textToRender);
      const tw = m.width;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
      ctx.strokeStyle = customNeonColor || '#FFE600';
      ctx.lineWidth = 6;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(540 - tw / 2 - 36, textY - 80, tw + 72, 110, 20);
        ctx.fill();
        ctx.stroke();
      }

      // Glowing Neon Text
      ctx.shadowColor = customNeonColor || '#FFE600';
      ctx.shadowBlur = 35;
      ctx.fillStyle = customNeonColor || '#FFE600';
      ctx.fillText(textToRender, 540, textY);
      ctx.restore();

      // 4. Render Subtitle Line Below Hook
      if (currentClip.subtitles_preview && currentClip.subtitles_preview[0]) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'bold 44px sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,0.95)';
        ctx.shadowBlur = 20;
        ctx.fillText(`"${currentClip.subtitles_preview[0]}"`, 540, textY + 85);
        ctx.restore();
      }

      // 5. Bottom Channel Meta
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`@${channelName}`, 60, 1780);

      ctx.font = '28px sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillText(
        (currentClip.suggested_caption || '').substring(0, 50) + '...',
        60,
        1825
      );

      // Download PNG Cover
      canvas.toBlob((blob) => {
        if (!blob) return;
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `CreatorIQ_Shorts_Clip_${currentClip.clip_number}_${(videoTitle || 'clip').replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      }, 'image/png');
    } catch (err) {
      console.warn('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Record 9:16 Video Clip using HTML5 Canvas & MediaRecorder
  const handleRecordVideoClip = async () => {
    if (!mainVideoRef.current || isRecordingClip) return;
    setIsRecordingClip(true);
    setRecordingProgress(0);

    try {
      const v = mainVideoRef.current;
      v.currentTime = clipStartSec;
      v.muted = false;
      await v.play().catch(() => {});

      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 1280;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create canvas context');

      const stream = canvas.captureStream(30);
      // Capture audio from video element if supported
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaElementSource(v);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioCtx.destination);
        if (dest.stream.getAudioTracks().length > 0) {
          stream.addTrack(dest.stream.getAudioTracks()[0]);
        }
      } catch (e) {
        console.warn('Audio capture note:', e);
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm'
      });
      const recordedChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CreatorIQ_Clip_${currentClip?.clip_number || 1}_9x16.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        setIsRecordingClip(false);
        setRecordingProgress(0);
      };

      mediaRecorder.start();

      // Render loop
      let animFrameId;
      const render = () => {
        if (!isRecordingClip) return;
        const cur = v.currentTime;
        const p = Math.max(0, Math.min(100, ((cur - clipStartSec) / clipLengthSec) * 100));
        setRecordingProgress(Math.floor(p));

        // 1. Draw video onto canvas according to layoutMode
        if (layoutMode === 'crop_fill') {
          const s = Math.max(720 / v.videoWidth, 1280 / v.videoHeight);
          const nw = v.videoWidth * s;
          const nh = v.videoHeight * s;
          ctx.drawImage(v, (720 - nw) / 2, (1280 - nh) / 2, nw, nh);
        } else {
          // Blurred background
          ctx.filter = 'blur(25px) brightness(0.4)';
          const s = Math.max(720 / (v.videoWidth || 720), 1280 / (v.videoHeight || 1280));
          ctx.drawImage(v, (720 - (v.videoWidth || 720) * s) / 2, (1280 - (v.videoHeight || 1280) * s) / 2, (v.videoWidth || 720) * s, (v.videoHeight || 1280) * s);
          ctx.filter = 'none';

          // Sharp 16:9 Center Video
          const vh = 720 * (9 / 16);
          const vy = (1280 - vh) / 2;
          ctx.drawImage(v, 0, vy, 720, vh);
        }

        // 2. Draw Neon Hook
        const hookText = (customHookText || currentClip?.hook_headline || 'VIRAL MOMENT').toUpperCase();
        let ty = 640;
        if (hookPosition === 'top') ty = 320;
        if (hookPosition === 'bottom') ty = 960;

        ctx.font = '900 48px sans-serif';
        ctx.textAlign = 'center';
        const tm = ctx.measureText(hookText);
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeStyle = customNeonColor;
        ctx.lineWidth = 4;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(360 - tm.width / 2 - 20, ty - 50, tm.width + 40, 70, 14);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = customNeonColor;
        ctx.fillText(hookText, 360, ty);

        if (cur >= clipEndSec) {
          mediaRecorder.stop();
          cancelAnimationFrame(animFrameId);
        } else {
          animFrameId = requestAnimationFrame(render);
        }
      };

      animFrameId = requestAnimationFrame(render);
    } catch (err) {
      console.warn('Video record error:', err);
      setIsRecordingClip(false);
      setRecordingProgress(0);
    }
  };

  // Test in Feed Simulator Bridge
  const handleSendToSimulator = () => {
    if (!currentClip || !onTestInSimulator) return;
    onTestInSimulator({
      id: 'A',
      title: currentClip.hook_headline || videoTitle,
      channel: channelName,
      hook: currentClip.hook_headline,
      color: customNeonColor,
      imageUrl: currentClip.frame_image || referenceFrame,
      concept: `Shorts Clip #${currentClip.clip_number} (${currentClip.hook_type})`
    });
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Feature Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/30 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Upload-to-Shorts Multiplier
            </span>
            <span className="text-[10px] bg-accent-purple text-white px-2 py-0.5 rounded-full font-black uppercase tracking-wider shadow">
              9:16 VIRAL
            </span>
          </div>
          <h3 className="font-outfit text-2xl sm:text-3xl font-extrabold text-white mt-2 flex items-center gap-2">
            Viral Repurposer: Uploaded Video ➔ 3 Shorts / TikTok Clips
          </h3>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1 max-w-3xl leading-relaxed">
            Upload any video file (MP4, MOV, WebM). CreatorIQ snapshots 3 retention moments directly from your video, formats to vertical 9:16, and renders high-energy neon hooks with synchronized subtitles.
          </p>
        </div>

        {/* Re-analyze Clips Button */}
        <button
          onClick={() => handleExtractClips()}
          disabled={isLoading}
          className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-2 border border-white/15 transition-all self-start sm:self-auto cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-accent-cyan ${isLoading ? 'animate-spin' : ''}`} />
          <span>Re-Analyze Video Clips</span>
        </button>
      </div>

      {/* DEDICATED VIDEO UPLOAD FRAME & ANALYSIS HUB */}
      <div className="p-5 sm:p-6 rounded-2xl bg-black/40 border border-white/10 space-y-4">
        {/* Upload Zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer?.files?.[0]) {
              handleFileUpload(e.dataTransfer.files[0]);
            }
          }}
          className="relative border-2 border-dashed border-amber-500/40 hover:border-amber-400 rounded-2xl p-6 sm:p-8 text-center transition-all bg-gradient-to-b from-amber-500/[0.04] to-transparent hover:bg-amber-500/[0.08] cursor-pointer group"
        >
          <input
            type="file"
            accept="video/*,image/*"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
            }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
          />

          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              {isProcessingFile ? (
                <RefreshCw className="w-7 h-7 animate-spin" />
              ) : (
                <Upload className="w-7 h-7" />
              )}
            </div>

            <div>
              <h4 className="text-sm sm:text-base font-bold text-white">
                {uploadedFile
                  ? `Active File: ${uploadedFile.name}`
                  : 'Drop your video file here (MP4, MOV, WebM) or click to browse'}
              </h4>
              <p className="text-xs text-zinc-400 mt-1 max-w-xl mx-auto">
                CreatorIQ extracts frames across your video timeline and crafts 3 viral 9:16 clip retention hooks.
              </p>
            </div>

            {/* Badges or Try Sample Video */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <span className="text-[11px] px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-zinc-300 font-mono">
                Supported: MP4, MOV, WebM, M4V
              </span>
              {!uploadedVideoUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLoadSampleVideo();
                  }}
                  className="z-20 text-[11px] font-bold px-3 py-1 rounded-md bg-accent-purple/20 hover:bg-accent-purple/30 text-accent-purple border border-accent-purple/40 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Try Sample Video (1-Click Test)</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Real Auto-Cleanup & Storage Notification Strip */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/10 text-xs">
          <div className="flex items-center gap-2 text-text-muted">
            <HardDrive className="w-4 h-4 text-accent-cyan shrink-0" />
            <span>
              Automatic server cleanup is active: raw videos and 9:16 Shorts clips will be cleaned automatically after{' '}
                <strong className="text-white font-semibold">{cleanupRetentionHours} Hours</strong>.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsStorageModalOpen(true)}
            className="text-accent-cyan hover:text-accent-purple font-semibold hover:underline shrink-0 text-xs transition-colors flex items-center gap-1 cursor-pointer"
          >
            Manage Storage
          </button>
        </div>

        {/* Connected Video Status & Scene Frame Strip */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative w-20 h-12 rounded-lg overflow-hidden border border-white/20 shrink-0 bg-black shadow">
              <img src={referenceFrame} alt="Uploaded Frame" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-0.5">
                <span className="text-[8px] font-mono text-white bg-red-600 px-1 rounded">16:9</span>
              </div>
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  UPLOADED VIDEO
                </span>
                {videoDuration > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-zinc-300">
                    ⏱️ {formatSeconds(videoDuration)}
                  </span>
                )}
                {videoResolution && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-zinc-300">
                    {videoResolution}
                  </span>
                )}
                {videoFileSize && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-zinc-400">
                    {videoFileSize}
                  </span>
                )}
              </div>

              {/* Editable Video Title */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  onBlur={() => handleExtractClips(videoTitle)}
                  placeholder="Video Title or Subject"
                  className="bg-transparent text-sm font-bold text-white border-b border-transparent hover:border-white/30 focus:border-accent-purple focus:outline-none transition-all truncate max-w-sm"
                />
              </div>
            </div>
          </div>

          {/* Extracted Scene Frame Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-t md:border-t-0 md:border-l border-white/10 pt-3 md:pt-0 md:pl-4 w-full md:w-auto">
            <span className="text-[11px] font-bold text-zinc-400 whitespace-nowrap">
              Frames from Video:
            </span>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              {candidateFrames.slice(0, 4).map((fUrl, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setReferenceFrame(fUrl);
                    setSelectedCandidateIndex(idx);
                  }}
                  title={`Video Frame #${idx + 1}`}
                  className={`relative w-16 h-9 rounded-lg overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                    selectedCandidateIndex === idx
                      ? 'border-amber-400 scale-105 shadow-[0_0_12px_rgba(245,158,11,0.5)] ring-2 ring-amber-400/40'
                      : 'border-white/20 opacity-70 hover:opacity-100 hover:border-white/50'
                  }`}
                >
                  <img src={fUrl} alt={`Frame ${idx + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 right-0 bg-black/80 text-[8px] font-mono text-white px-0.5 leading-none">
                    #{idx + 1}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Engine Banner */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-zinc-400">Retention Clip Analyzer:</span>
            <span className="font-mono text-accent-pink font-semibold">{engineUsed}</span>
          </div>
          <span className="text-zinc-400">
            Output: <strong className="text-white">3 Golden Moments Sliced</strong> for 9:16 Shorts / Reels
          </span>
        </div>
      </div>

      {/* Loading Screen Overlay */}
      {isLoading && (
        <div className="p-10 rounded-2xl bg-black/60 border border-accent-purple/30 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-accent-purple/20 border border-accent-purple/40 flex items-center justify-center mx-auto animate-bounce">
            <Scissors className="w-6 h-6 text-accent-purple" />
          </div>
          <h4 className="text-base font-bold text-white">Analyzing Uploaded Video Retention Architecture</h4>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Detecting cliffhanger hooks, emotional peaks, and rendering 9:16 neon hooks from your video...
          </p>
          <div className="flex justify-center gap-3 text-xs font-semibold text-zinc-400">
            <span className={loadingStep >= 1 ? 'text-accent-purple font-bold' : ''}>1. Video Timeline Scan</span>
            <span>&rarr;</span>
            <span className={loadingStep >= 2 ? 'text-accent-pink font-bold' : ''}>2. Climax Timestamp Slicing</span>
            <span>&rarr;</span>
            <span className={loadingStep >= 3 ? 'text-emerald-400 font-bold' : ''}>3. 9:16 Neon Rendering</span>
          </div>
        </div>
      )}

      {/* Main Studio Grid: 3 Golden Clips Selector + 9:16 Phone Canvas + Multi-Platform Control Deck */}
      {!isLoading && goldenClips.length > 0 && currentClip && (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* LEFT: 3 Golden Clip Cards Selector */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Scissors className="w-4 h-4 text-accent-purple" />
                3 Golden Moments from Video
              </h4>
              <span className="text-[11px] text-accent-pink font-bold">Select to Play</span>
            </div>

            <div className="space-y-3">
              {goldenClips.map((clip, index) => {
                const isActive = activeClipIndex === index;
                return (
                  <div
                    key={clip.id || index}
                    onClick={() => setActiveClipIndex(index)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative group ${
                      isActive
                        ? 'bg-gradient-to-r from-accent-purple/20 via-black to-black border-accent-purple shadow-[0_0_25px_rgba(168,85,247,0.25)]'
                        : 'bg-black/40 border-white/10 hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    {/* Top Row: Clip # and Viral Badge */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent-purple/30 text-accent-purple border border-accent-purple/40">
                        Clip #{clip.clip_number} &bull; {clip.duration}
                      </span>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${clip.neon_color}20`,
                          color: clip.neon_color,
                          border: `1px solid ${clip.neon_color}50`
                        }}
                      >
                        {clip.badge || clip.hook_type}
                      </span>
                    </div>

                    {/* Hook Headline */}
                    <h5 className="text-sm font-extrabold text-white group-hover:text-accent-pink transition-colors">
                      {clip.hook_headline}
                    </h5>

                    {/* Timestamp & Score */}
                    <div className="flex items-center justify-between text-xs text-zinc-400 mt-2 pt-2 border-t border-white/10">
                      <span className="font-mono text-zinc-300 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        {clip.timestamp_start} - {clip.timestamp_end}
                      </span>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">{clip.viral_score}</span>
                        <span className="text-[10px] text-zinc-500">Score</span>
                      </div>
                    </div>

                    {/* Active Glow Indicator */}
                    {isActive && (
                      <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent-purple animate-ping"></div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quick Multi-Platform Export Action Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-white/5 to-transparent border border-white/10 space-y-3">
              <h5 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-accent-cyan" />
                Multi-Platform Multiplication
              </h5>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Repurposed for simultaneous upload to <strong>YouTube Shorts</strong>, <strong>TikTok</strong>, and <strong>Instagram Reels</strong>.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleCopyFullPackage}
                  className="w-full py-2 px-3 rounded-xl bg-accent-purple/20 hover:bg-accent-purple/30 text-white font-bold text-xs flex items-center justify-center gap-2 border border-accent-purple/40 transition-all cursor-pointer"
                >
                  {hasCopiedPackage ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied Full Package!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Full Metadata Package</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleSendToSimulator}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center justify-center gap-2 border border-emerald-500/30 transition-all cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>⚡ Test in Feed Simulator</span>
                </button>
              </div>
            </div>
          </div>

          {/* CENTER: Adaptive 9:16 Vertical Smartphone Live Preview Canvas */}
          <div className="lg:col-span-4 flex flex-col items-center">
            {/* Phone Bezel Container */}
            <div className="relative w-full max-w-[320px] aspect-[9/16] rounded-[36px] p-3 bg-gradient-to-b from-[#2a2a38] via-[#15151f] to-[#0d0d14] shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(168,85,247,0.15)] border-4 border-[#3a3a4c] select-none">
              {/* Speaker / Dynamic Island Notch */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-4 bg-black rounded-full z-40 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-[#1a1a24] mr-2"></div>
                <div className="w-8 h-1 rounded-full bg-[#1a1a24]"></div>
              </div>

              {/* Internal 9:16 Screen Frame */}
              <div className="relative w-full h-full rounded-[26px] overflow-hidden bg-black flex flex-col justify-between">
                {/* 1. Video Layer Rendering based on layoutMode */}
                <div className="absolute inset-0 z-0">
                  {uploadedVideoUrl ? (
                    // Actual Uploaded Video Element
                    <div className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center">
                      {layoutMode === 'crop_fill' ? (
                        <video
                          ref={mainVideoRef}
                          src={uploadedVideoUrl}
                          onTimeUpdate={handleVideoTimeUpdate}
                          autoPlay={isPlaying}
                          muted={isMuted}
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      ) : layoutMode === 'split_stacked' ? (
                        <div className="w-full h-full flex flex-col bg-zinc-950">
                          <div className="h-1/2 relative overflow-hidden">
                            <video
                              ref={mainVideoRef}
                              src={uploadedVideoUrl}
                              onTimeUpdate={handleVideoTimeUpdate}
                              autoPlay={isPlaying}
                              muted={isMuted}
                              playsInline
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="h-1/2 bg-gradient-to-b from-black to-[#14101e] p-3 flex flex-col justify-center items-center text-center">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                              Reaction & Highlight Stream
                            </span>
                            <div className="w-16 h-1 bg-accent-purple/40 rounded-full mt-2 animate-pulse"></div>
                          </div>
                        </div>
                      ) : (
                        // Blurred Backdrop Mode (Standard YouTube Shorts - Matching Screenshot 1)
                        <>
                          {/* Background blurred looping video */}
                          <video
                            ref={bgVideoRef}
                            src={uploadedVideoUrl}
                            autoPlay={isPlaying}
                            muted
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover filter blur-lg scale-115 opacity-70 brightness-90"
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60"></div>

                          {/* Crisp 16:9 Center Video */}
                          <div className="relative w-full aspect-video z-10 shadow-2xl border-y border-white/20">
                            <video
                              ref={mainVideoRef}
                              src={uploadedVideoUrl}
                              onTimeUpdate={handleVideoTimeUpdate}
                              autoPlay={isPlaying}
                              muted={isMuted}
                              playsInline
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    // Fallback to Image Frame
                    <div className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center">
                      <img
                        src={currentClip.frame_image || referenceFrame}
                        alt="Blurred BG"
                        className="absolute inset-0 w-full h-full object-cover filter blur-lg scale-115 opacity-70 brightness-90"
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60"></div>
                      <div className="relative w-full aspect-video z-10 shadow-2xl border-y border-white/20">
                        <img
                          src={currentClip.frame_image || referenceFrame}
                          alt="Center Frame"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Top Bar: Shorts / TikTok Header */}
                <div className="relative z-20 pt-8 px-4 flex items-center justify-between text-white/90">
                  <div className="flex items-center gap-3 text-xs font-bold">
                    <span className="opacity-60">Following</span>
                    <span className="border-b-2 border-white pb-0.5">For You</span>
                  </div>
                  <span className="text-[10px] font-mono bg-black/60 px-2 py-0.5 rounded-full border border-white/20">
                    ⏱️ {currentClip.duration}
                  </span>
                </div>

                {/* 3a. Top Hook Title Overlay - Exactly matching Screenshot 1 (Yellow + White stacked lines, thick black stroke, NO BOX) */}
                <div
                  className={`absolute left-0 right-0 z-20 px-3 text-center pointer-events-none transition-all ${
                    hookPosition === 'top'
                      ? 'top-12 sm:top-14'
                      : hookPosition === 'bottom'
                      ? 'bottom-28'
                      : 'top-1/2 -translate-y-1/2'
                  }`}
                >
                  <div
                    className="font-black text-xs sm:text-[13px] tracking-tight uppercase select-none drop-shadow-2xl"
                    style={{
                      WebkitTextStroke: '2.5px #000',
                      paintOrder: 'stroke fill',
                      textShadow: '0 3px 10px rgba(0,0,0,0.95), 0 0 3px #000'
                    }}
                  >
                    {renderScreenshot1Title(
                      customHookText || currentClip.title || currentClip.hook || currentClip.hook_headline || 'VIRAL MOMENT',
                      customNeonColor
                    )}
                  </div>
                </div>

                {/* 3b. Lower Third Spoken Subtitle Overlay - Exactly matching Screenshot 1 (Alternating Yellow/White words, thick black stroke, NO BOX) */}
                {(currentClip.subtitles_preview || currentClip.subtitles) && (
                  <div className="absolute bottom-20 left-0 right-0 z-20 px-3 text-center pointer-events-none">
                    {renderScreenshot1Subtitle(
                      currentClip.subtitles_preview
                        ? (currentClip.subtitles_preview[activeSubtitleIndex] || currentClip.subtitles_preview[0])
                        : (currentClip.subtitles[activeSubtitleIndex]?.text || currentClip.subtitles[0]?.text || ''),
                      customNeonColor
                    )}
                  </div>
                )}

                {/* 4. Right Side Action Rail (TikTok/Shorts Likes & Comments) */}
                <div className="absolute right-2 bottom-16 z-30 flex flex-col items-center gap-3 text-white">
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-9 h-9 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-accent-pink hover:scale-110 transition-transform cursor-pointer">
                      <Heart className="w-5 h-5 fill-accent-pink" />
                    </div>
                    <span className="text-[10px] font-bold">142K</span>
                  </div>

                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-9 h-9 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:scale-110 transition-transform cursor-pointer">
                      <MessageCircle className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold">3,890</span>
                  </div>

                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-9 h-9 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:scale-110 transition-transform cursor-pointer">
                      <Bookmark className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold">24K</span>
                  </div>

                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-9 h-9 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:scale-110 transition-transform cursor-pointer">
                      <Share2 className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold">Share</span>
                  </div>

                  {/* Spinning Audio Disc */}
                  <div className="w-8 h-8 rounded-full bg-zinc-900 border-2 border-white/40 flex items-center justify-center animate-spin">
                    <Music className="w-3.5 h-3.5 text-accent-purple" />
                  </div>
                </div>

                {/* 5. Bottom Channel Meta & Scrubber Progress */}
                <div className="relative z-20 pb-4 px-3 text-white space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black">@{channelName}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400/20" />
                  </div>
                  <p className="text-[11px] text-zinc-200 line-clamp-1 pr-12">
                    {currentClip.suggested_caption}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                    <Music className="w-3 h-3 text-accent-purple" />
                    <span className="truncate max-w-[180px]">
                      {currentClip.audio_recommendation || 'Original Sound - CreatorIQ Mix'}
                    </span>
                  </div>

                  {/* Scrubber Progress Bar */}
                  <div className="w-full h-1.5 bg-white/20 rounded-full mt-2 overflow-hidden relative">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-100"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, ((currentPlaybackTime - clipStartSec) / clipLengthSec) * 100)
                        )}%`
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Player Controls */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4">
              <button
                onClick={handlePlayToggle}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>{isPlaying ? 'Pause Clip' : 'Play Clip'}</span>
              </button>

              {uploadedVideoUrl && (
                <button
                  onClick={handleToggleMute}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  title={isMuted ? 'Unmute Video Audio' : 'Mute Video Audio'}
                >
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>{isMuted ? 'Muted' : 'Sound On'}</span>
                </button>
              )}

              <button
                onClick={handleExportVerticalCover}
                disabled={isExporting}
                className="px-3 py-1.5 rounded-xl bg-accent-purple hover:bg-accent-purple/90 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExporting ? 'Rendering Cover...' : 'Download 9:16 Cover (PNG)'}</span>
              </button>

              {uploadedVideoUrl && (
                <button
                  onClick={handleRecordVideoClip}
                  disabled={isRecordingClip}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-pink-500 hover:brightness-110 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>
                    {isRecordingClip ? `Recording Clip (${recordingProgress}%)...` : 'Export 9:16 Clip'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* RIGHT: Hook Customizer & Clip Intelligence Deck */}
          <div className="lg:col-span-4 space-y-5">
            {/* 1. Neon Hook Customizer Card */}
            <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-4">
              <h5 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-accent-pink" />
                9:16 Hook & Layout Customizer
              </h5>

              {/* Edit Hook Headline Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300">Edit Vertical Hook Text</label>
                <input
                  type="text"
                  value={customHookText}
                  onChange={(e) => setCustomHookText(e.target.value)}
                  placeholder="Explosive Hook Headline"
                  className="w-full bg-white/5 border border-white/10 focus:border-accent-pink rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none"
                />
              </div>

              {/* Neon Color Palette */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300">Neon Color Glow</label>
                <div className="flex items-center gap-2">
                  {[
                    { name: 'Yellow', hex: '#FFE600' },
                    { name: 'Cyan', hex: '#00F0FF' },
                    { name: 'Crimson', hex: '#FF2E63' },
                    { name: 'Purple', hex: '#A855F7' },
                    { name: 'Lime', hex: '#22C55E' },
                    { name: 'White', hex: '#FFFFFF' }
                  ].map((color) => (
                    <button
                      key={color.hex}
                      onClick={() => setCustomNeonColor(color.hex)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                        customNeonColor === color.hex ? 'scale-125 border-white shadow-lg' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color.hex }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              {/* Vertical Positioning */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300">Hook Position</label>
                <div className="grid grid-cols-3 gap-2">
                  {['top', 'center', 'bottom'].map((pos) => (
                    <button
                      key={pos}
                      onClick={() => setHookPosition(pos)}
                      className={`py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                        hookPosition === pos
                          ? 'bg-accent-purple text-white border border-accent-purple shadow'
                          : 'bg-white/5 text-zinc-400 hover:text-white border border-white/10'
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              {/* 9:16 Video Frame Layout Modes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300">Frame Layout Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'blurred_backdrop', label: 'Blurred BG' },
                    { id: 'crop_fill', label: 'Crop Fill' },
                    { id: 'split_stacked', label: 'Split 2-Tier' }
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setLayoutMode(mode.id)}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-bold text-center transition-all cursor-pointer ${
                        layoutMode === mode.id
                          ? 'bg-accent-pink text-white border border-accent-pink shadow'
                          : 'bg-white/5 text-zinc-400 hover:text-white border border-white/10'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. Clip Intelligence Card */}
            <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  Algorithm Retention Strategy
                </h5>
                <span className="text-[11px] text-emerald-400 font-bold">
                  {currentClip.projected_completion_rate} Projected Completion
                </span>
              </div>

              {/* Strategy Details */}
              <p className="text-xs text-zinc-300 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/10">
                {currentClip.retention_strategy}
              </p>

              {/* Audio Recommendation */}
              <div className="space-y-1 text-xs">
                <span className="text-zinc-400 font-bold flex items-center gap-1">
                  <Music className="w-3.5 h-3.5 text-accent-cyan" />
                  Recommended Sound / Audio Beat:
                </span>
                <p className="text-zinc-200 font-medium">
                  {currentClip.audio_recommendation}
                </p>
              </div>

              {/* Ready-to-copy Caption */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-400 flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5 text-accent-pink" />
                    Viral Caption & Hashtags
                  </span>
                  <button
                    onClick={handleCopyCaption}
                    className="text-[11px] text-accent-pink hover:underline flex items-center gap-1 cursor-pointer font-bold"
                  >
                    {hasCopiedCaption ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{hasCopiedCaption ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
                <div className="p-2.5 bg-black/60 rounded-xl border border-white/10 text-xs text-zinc-300 select-all font-mono leading-relaxed">
                  {currentClip.suggested_caption}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Storage and Automatic Cleanup Manager Modal */}
      <StorageCleanupModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
      />
    </div>
  );
};

export default ViralRepurposer;
