export const faqItems = [
  {
    question: "What is CreatorIQ?",
    answer: "CreatorIQ is an AI-powered SaaS designed for YouTube creators. It helps you stop guessing what works by generating highly optimized video titles and creating high-CTR thumbnails using advanced AI vision and text models."
  },
  {
    question: "How does AI Title Intelligence work?",
    answer: "It takes your base idea and runs it through a pipeline of LLMs (Gemini, Llama 3.1, Groq). It simultaneously checks current YouTube search trends and keyword data to generate titles optimized for maximum reach and click-through rate."
  },
  {
    question: "How are thumbnails generated?",
    answer: "We use OpenCV to extract frames from your video, analyze them for emotion and clarity using Vision models, enhance the best frames using FLUX and Gemini Flash Image, and automatically apply YouTube-style text overlays."
  },
  {
    question: "Can I upload a YouTube URL?",
    answer: "Yes! You can either upload an MP4/MOV file directly or paste an existing, unlisted, or public YouTube URL. Our backend will fetch the media for analysis using FFmpeg."
  }
];
