# =============================================================================
#  Gyana AI  –  Language Detection Service
#  Primary:  langid   (fast, offline, no seed needed)
#  Fallback: langdetect (Google port, needs seed for determinism)
# =============================================================================

from __future__ import annotations

import logging

log = logging.getLogger("gyana.language")

# ISO 639-1 → human name for the most common languages
_NAMES: dict[str, str] = {
    "en": "English",    "hi": "Hindi",      "ta": "Tamil",
    "te": "Telugu",     "kn": "Kannada",    "ml": "Malayalam",
    "mr": "Marathi",    "bn": "Bengali",    "gu": "Gujarati",
    "pa": "Punjabi",    "ur": "Urdu",       "sa": "Sanskrit",
    "fr": "French",     "de": "German",     "es": "Spanish",
    "it": "Italian",    "pt": "Portuguese", "nl": "Dutch",
    "ru": "Russian",    "pl": "Polish",     "sv": "Swedish",
    "zh": "Chinese",    "ja": "Japanese",   "ko": "Korean",
    "ar": "Arabic",     "fa": "Persian",    "tr": "Turkish",
    "vi": "Vietnamese", "th": "Thai",       "id": "Indonesian",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def detect_language(text: str) -> str:
    """
    Detect the dominant language of a text sample.
    Returns an ISO 639-1 code (e.g. 'en', 'hi') or 'unknown'.
    """
    if not text or len(text.strip()) < 20:
        return "unknown"

    sample = text[:3000]   # first 3 000 chars is plenty

    lang = _try_langid(sample)
    if lang:
        return lang

    lang = _try_langdetect(sample)
    if lang:
        return lang

    return "unknown"


def language_name(code: str) -> str:
    """Convert an ISO 639-1 code to a human-readable name."""
    return _NAMES.get(code.lower(), code.upper())


# ---------------------------------------------------------------------------
# Backends
# ---------------------------------------------------------------------------
def _try_langid(text: str) -> str:
    try:
        import langid
        lang, confidence = langid.classify(text)
        log.debug("langid → %s (confidence %.3f)", lang, confidence)
        return lang
    except ImportError:
        return ""
    except Exception as exc:
        log.warning("langid failed: %s", exc)
        return ""


def _try_langdetect(text: str) -> str:
    try:
        from langdetect import DetectorFactory, detect

        DetectorFactory.seed = 42   # deterministic results
        lang = detect(text)
        log.debug("langdetect → %s", lang)
        return lang
    except ImportError:
        return ""
    except Exception as exc:
        log.warning("langdetect failed: %s", exc)
        return ""