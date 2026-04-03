# =============================================================================
#  Gyana AI  –  Speech Service
#  Primary:  Groq Whisper API  (whisper-large-v3)  – fast, cloud-based
#  Fallback: OpenAI Whisper local model            – offline, no API key needed
# =============================================================================

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Optional

log = logging.getLogger("gyana.speech")

# Supported audio MIME types for Groq
_GROQ_MIME: dict[str, str] = {
    ".mp3":  "audio/mpeg",
    ".wav":  "audio/wav",
    ".m4a":  "audio/mp4",
    ".webm": "audio/webm",
    ".ogg":  "audio/ogg",
    ".flac": "audio/flac",
}

# Module-level local Whisper model cache
_local_whisper = None

_DOMAIN_CORRECTIONS = {
    r"\b(giana|jiana|gyan ai|gyaan ai|jana ai)\b": "Gyana",
    r"\b(he guru|hi guru|hey,? guru)\b": "Hey Guru",
    r"\b(aiushman|ayushmaan|ayusman)\b": "Ayushman",
    r"\b(cuttak|katak)\b": "Cuttack",
    r"\b(odisa|orissa)\b": "Odisha",
}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def transcribe_audio(
    file_path: str | Path,
    *,
    language_hint: str = "auto",
    prompt_hint: str = "",
) -> str:
    """
    Transcribe an audio file to text.
    Returns cleaned transcript string.
    """
    path = Path(file_path)

    text = _try_groq(path, language_hint=language_hint, prompt_hint=prompt_hint)
    if not text.strip():
        text = _try_local_whisper(path, language_hint=language_hint, prompt_hint=prompt_hint)

    if not text.strip():
        raise RuntimeError(
            f"Could not transcribe '{path.name}'. "
            "Ensure the audio is audible and a transcription engine is configured."
        )

    return _clean_transcript(text)


def transcribe_audio_detailed(
    file_path: str | Path,
    *,
    language_hint: str = "auto",
    prompt_hint: str = "",
) -> dict[str, str]:
    path = Path(file_path)

    text = _try_groq(path, language_hint=language_hint, prompt_hint=prompt_hint)
    provider = "groq-whisper"
    if not text.strip():
        text = _try_local_whisper(path, language_hint=language_hint, prompt_hint=prompt_hint)
        provider = "local-whisper"

    cleaned = _clean_transcript(text)
    if not cleaned:
        raise RuntimeError(
            f"Could not transcribe '{path.name}'. "
            "Ensure the audio is audible and a transcription engine is configured."
        )

    return {"text": cleaned, "provider": provider}


# ---------------------------------------------------------------------------
# Groq Whisper API
# ---------------------------------------------------------------------------
def _build_transcription_prompt(language_hint: str = "auto", prompt_hint: str = "") -> str:
    parts = [
        "Transcribe this audio cleanly and naturally.",
        "Important terms may include Gyana, Guru, Ayushman, Cuttack, and Odisha.",
        "Keep the user's spoken wording faithful, but correct obvious recognition mistakes.",
    ]
    if language_hint and language_hint != "auto":
        parts.append(f"The expected spoken language is {language_hint}.")
    if prompt_hint:
        parts.append(prompt_hint.strip())
    return " ".join(parts)


def _try_groq(path: Path, language_hint: str = "auto", prompt_hint: str = "") -> str:
    """Use Groq's hosted Whisper large-v3 for fast cloud transcription."""
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        log.debug("GROQ_API_KEY not set – skipping Groq transcription")
        return ""

    try:
        from groq import Groq

        client   = Groq(api_key=api_key)
        mime     = _GROQ_MIME.get(path.suffix.lower(), "audio/mpeg")

        with path.open("rb") as audio_file:
            result = client.audio.transcriptions.create(
                file            = (path.name, audio_file, mime),
                model           = "whisper-large-v3",
                response_format = "text",
                language        = None if language_hint == "auto" else language_hint,
                prompt          = _build_transcription_prompt(language_hint, prompt_hint),
                temperature     = 0,
            )

        # result is a plain string when response_format="text"
        text = result if isinstance(result, str) else getattr(result, "text", "")
        log.info("Groq transcription complete: %d chars", len(text))
        return text

    except ImportError:
        log.debug("groq SDK not installed")
        return ""
    except Exception as exc:
        log.warning("Groq transcription failed: %s – falling back to local Whisper", exc)
        return ""


# ---------------------------------------------------------------------------
# Local OpenAI Whisper (offline fallback)
# ---------------------------------------------------------------------------
def _try_local_whisper(path: Path, language_hint: str = "auto", prompt_hint: str = "") -> str:
    """
    Run Whisper locally (CPU).
    Install: pip install openai-whisper
    Also needs ffmpeg: sudo apt install ffmpeg
    """
    global _local_whisper
    try:
        import whisper

        if _local_whisper is None:
            model_size = os.getenv("WHISPER_MODEL", "base")
            log.info("Loading local Whisper model '%s'…", model_size)
            _local_whisper = whisper.load_model(model_size)

        result = _local_whisper.transcribe(
            str(path),
            fp16    = False,
            verbose = False,
            language = None if language_hint == "auto" else language_hint,
            initial_prompt = _build_transcription_prompt(language_hint, prompt_hint),
        )
        text = result.get("text", "")
        log.info("Local Whisper transcription complete: %d chars", len(text))
        return text

    except ImportError:
        log.debug("openai-whisper not installed")
        return ""
    except Exception as exc:
        log.warning("Local Whisper failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# Post-processing
# ---------------------------------------------------------------------------
def _clean_transcript(text: str) -> str:
    """Strip Whisper artefacts, normalise whitespace."""
    # Common Whisper hallucination artefacts
    artefacts = [
        r"\[BLANK_AUDIO\]", r"\[inaudible\]", r"\(inaudible\)",
        r"\[music\]", r"\[noise\]", r"\[silence\]",
    ]
    for pattern in artefacts:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)

    for pattern, replacement in _DOMAIN_CORRECTIONS.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

    text = re.sub(r"\s+", " ", text)
    return text.strip()


def speech_provider_status() -> dict[str, Optional[str]]:
    provider = "groq-whisper" if os.getenv("GROQ_API_KEY") else "local-whisper"
    local_model = os.getenv("WHISPER_MODEL", "base")
    return {
        "active": provider,
        "fallback": "local-whisper",
        "local_model": local_model,
    }
