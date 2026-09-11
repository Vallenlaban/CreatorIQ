#!/usr/bin/env python3
"""
CreatorIQ - faster-whisper Local Transcription Engine
Executes faster-whisper transcription with word-level & segment-level timestamps.
"""
import sys
import os
import json
import argparse

def transcribe_audio(audio_path: str, output_json_path: str, model_size: str = "base", device: str = "cpu", compute_type: str = "int8"):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        error_payload = {
            "success": False,
            "error_type": "DEPENDENCY_MISSING",
            "message": "faster-whisper package is not installed. Install with: pip install faster-whisper"
        }
        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump(error_payload, f, indent=2)
        print(json.dumps(error_payload), file=sys.stderr)
        sys.exit(2)

    if not os.path.exists(audio_path):
        error_payload = {
            "success": False,
            "error_type": "FILE_NOT_FOUND",
            "message": f"Audio file not found: {audio_path}"
        }
        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump(error_payload, f, indent=2)
        sys.exit(1)

    print(f"Loading faster-whisper model '{model_size}' on {device} ({compute_type})...")
    model = WhisperModel(model_size, device=device, compute_type=compute_type)

    print(f"Transcribing audio: {audio_path}...")
    segments_generator, info = model.transcribe(audio_path, word_timestamps=True, beam_size=5)

    segments_data = []
    full_transcript_parts = []

    for seg in segments_generator:
        seg_dict = {
            "id": seg.id,
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
            "words": []
        }
        if seg.words:
            for w in seg.words:
                seg_dict["words"].append({
                    "word": w.word,
                    "start": round(w.start, 2),
                    "end": round(w.end, 2),
                    "probability": round(w.probability, 3)
                })
        segments_data.append(seg_dict)
        full_transcript_parts.append(seg.text.strip())

    result = {
        "success": True,
        "language": info.language,
        "language_probability": round(info.language_probability, 3),
        "duration": round(info.duration, 2),
        "full_transcript": " ".join(full_transcript_parts),
        "segments": segments_data
    }

    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Transcription complete: {len(segments_data)} segments, {round(info.duration, 2)}s audio.")
    sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description="Transcribe audio using faster-whisper")
    parser.add_argument("--audio", required=True, help="Path to input audio file (WAV/MP3)")
    parser.add_argument("--output", required=True, help="Path to save transcription JSON")
    parser.add_argument("--model", default="base", help="Whisper model size (tiny, base, small, medium, large-v3)")
    parser.add_argument("--device", default="cpu", help="Device (cpu or cuda)")
    parser.add_argument("--compute_type", default="int8", help="Compute type (int8, float16, float32)")

    args = parser.parse_args()
    transcribe_audio(args.audio, args.output, args.model, args.device, args.compute_type)

if __name__ == "__main__":
    main()
