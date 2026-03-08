# =============================================================================
#  Gyana AI  –  OCR Service
#  Primary:  EasyOCR  (no Tesseract binary required, 80+ languages)
#  Fallback: pytesseract + Pillow with image pre-processing pipeline
# =============================================================================

from __future__ import annotations

import logging
import re
from pathlib import Path

log = logging.getLogger("gyana.ocr")

# Module-level EasyOCR reader cache (expensive to initialise)
_easyocr_reader = None


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def extract_text_from_image(file_path: str | Path) -> str:
    """
    Run OCR on an image file, return cleaned text.
    Tries EasyOCR first, then pytesseract.
    """
    path = Path(file_path)

    text = _try_easyocr(path)
    if not text.strip():
        text = _try_tesseract(path)

    if not text.strip():
        raise RuntimeError(
            f"OCR produced no output for '{path.name}'. "
            "Ensure the image contains readable text."
        )

    return _clean_ocr(text)


# ---------------------------------------------------------------------------
# EasyOCR
# ---------------------------------------------------------------------------
def _try_easyocr(path: Path) -> str:
    global _easyocr_reader
    try:
        import easyocr

        if _easyocr_reader is None:
            log.info("Initialising EasyOCR reader (first call – may take a moment)…")
            _easyocr_reader = easyocr.Reader(
                ["en", "hi"],   # extend for more languages, e.g. "ta", "te"
                gpu=False,
                verbose=False,
            )

        results = _easyocr_reader.readtext(
            str(path),
            detail=0,
            paragraph=True,
        )
        return "\n".join(results)

    except ImportError:
        log.debug("easyocr not installed, skipping")
        return ""
    except Exception as exc:
        log.warning("EasyOCR failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# Tesseract / pytesseract
# ---------------------------------------------------------------------------
def _try_tesseract(path: Path) -> str:
    try:
        import pytesseract
        from PIL import Image, ImageEnhance, ImageFilter

        img = Image.open(str(path)).convert("RGB")

        # ── Pre-processing pipeline for better accuracy ───────────────────
        # 1. Upscale small images (Tesseract works best at ~300 DPI)
        w, h = img.size
        if w < 1200:
            scale = 1200 / w
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

        # 2. Greyscale
        img = img.convert("L")

        # 3. Sharpen edges
        img = img.filter(ImageFilter.SHARPEN)

        # 4. Boost contrast
        img = ImageEnhance.Contrast(img).enhance(2.0)

        # OEM 3 = default engine, PSM 6 = assume uniform block of text
        text = pytesseract.image_to_string(img, config="--oem 3 --psm 6")
        return text

    except ImportError:
        log.debug("pytesseract/Pillow not installed, skipping")
        return ""
    except Exception as exc:
        log.warning("Tesseract failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# Post-processing
# ---------------------------------------------------------------------------
def _clean_ocr(text: str) -> str:
    """Remove common OCR artefacts and normalise whitespace."""
    text = text.replace("\x00", "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    lines = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # Discard lines that are only punctuation / single symbols
        if re.fullmatch(r"[\W_]{1,3}", line):
            continue
        lines.append(line)

    cleaned = "\n".join(lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()