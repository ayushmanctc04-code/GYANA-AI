# =============================================================================
#  Gyana AI  –  Document Service
#  Extracts clean text from PDF, DOCX, PPTX, TXT
#  PDF:  pdfplumber (primary, preserves layout) → PyMuPDF (fallback)
#  DOCX: python-docx – paragraphs + headings + tables
#  PPTX: python-pptx – all shapes + tables + speaker notes
#  TXT:  UTF-8 with latin-1 fallback
# =============================================================================

from __future__ import annotations

import logging
import re
from pathlib import Path

log = logging.getLogger("gyana.document")


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def extract_text(file_path: str | Path) -> str:
    """
    Dispatch to the correct extractor based on file extension.
    Returns cleaned, normalised text string.
    Raises ValueError for unsupported extensions.
    """
    path = Path(file_path)
    ext  = path.suffix.lower()

    extractors = {
        ".pdf":  _extract_pdf,
        ".docx": _extract_docx,
        ".pptx": _extract_pptx,
        ".txt":  _extract_txt,
    }

    fn = extractors.get(ext)
    if fn is None:
        raise ValueError(f"No text extractor for extension '{ext}'.")

    raw = fn(path)
    return _clean(raw)


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------
def _extract_pdf(path: Path) -> str:
    """pdfplumber (tables + layout) → PyMuPDF fallback."""

    # ── pdfplumber ────────────────────────────────────────────────────────────
    try:
        import pdfplumber

        parts: list[str] = []
        with pdfplumber.open(str(path)) as pdf:
            for i, page in enumerate(pdf.pages, 1):
                header = f"[Page {i}]"

                body = page.extract_text(x_tolerance=2, y_tolerance=2) or ""

                # Extract tables as readable text
                table_rows: list[str] = []
                for table in page.extract_tables():
                    for row in table:
                        cells = [str(c or "").strip() for c in row]
                        if any(cells):
                            table_rows.append(" | ".join(cells))

                section = "\n".join(filter(None, [header, body, *table_rows]))
                if section.strip():
                    parts.append(section)

        result = "\n\n".join(parts)
        if result.strip():
            log.debug("PDF extracted via pdfplumber: %s chars", len(result))
            return result

    except ImportError:
        log.debug("pdfplumber not available, trying PyMuPDF")
    except Exception as exc:
        log.warning("pdfplumber failed for %s: %s – trying PyMuPDF", path.name, exc)

    # ── PyMuPDF fallback ──────────────────────────────────────────────────────
    try:
        import fitz  # PyMuPDF

        parts = []
        with fitz.open(str(path)) as doc:
            for i, page in enumerate(doc, 1):
                text = page.get_text("text")
                if text.strip():
                    parts.append(f"[Page {i}]\n{text}")

        result = "\n\n".join(parts)
        log.debug("PDF extracted via PyMuPDF: %s chars", len(result))
        return result

    except ImportError:
        pass

    # ── PyPDF2 last resort ────────────────────────────────────────────────────
    try:
        from PyPDF2 import PdfReader

        reader = PdfReader(str(path))
        parts  = []
        for i, page in enumerate(reader.pages, 1):
            text = page.extract_text() or ""
            if text.strip():
                parts.append(f"[Page {i}]\n{text}")

        result = "\n\n".join(parts)
        log.debug("PDF extracted via PyPDF2: %s chars", len(result))
        return result

    except ImportError:
        pass

    raise RuntimeError(
        "PDF extraction requires pdfplumber, PyMuPDF (pymupdf), or PyPDF2.\n"
        "Install: pip install pdfplumber"
    )


# ---------------------------------------------------------------------------
# DOCX
# ---------------------------------------------------------------------------
def _extract_docx(path: Path) -> str:
    try:
        from docx import Document
    except ImportError:
        raise RuntimeError("pip install python-docx")

    doc   = Document(str(path))
    parts: list[str] = []

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        # Prefix headings so chunker can use them as context anchors
        style = para.style.name if para.style else ""
        if style.startswith("Heading"):
            lvl = "".join(filter(str.isdigit, style)) or "1"
            parts.append(f"{'#' * int(lvl)} {text}")
        else:
            parts.append(text)

    # Tables
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(
                cell.text.strip() for cell in row.cells if cell.text.strip()
            )
            if row_text:
                parts.append(row_text)

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# PPTX
# ---------------------------------------------------------------------------
def _extract_pptx(path: Path) -> str:
    try:
        from pptx import Presentation
    except ImportError:
        raise RuntimeError("pip install python-pptx")

    prs   = Presentation(str(path))
    parts: list[str] = []

    for slide_num, slide in enumerate(prs.slides, 1):
        slide_parts = [f"[Slide {slide_num}]"]

        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    t = para.text.strip()
                    if t:
                        slide_parts.append(t)
            if shape.has_table:
                for row in shape.table.rows:
                    row_text = " | ".join(
                        c.text.strip() for c in row.cells if c.text.strip()
                    )
                    if row_text:
                        slide_parts.append(row_text)

        # Speaker notes
        if slide.has_notes_slide:
            notes = slide.notes_slide.notes_text_frame.text.strip()
            if notes:
                slide_parts.append(f"[Notes] {notes}")

        if len(slide_parts) > 1:          # more than just the header
            parts.append("\n".join(slide_parts))

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# TXT
# ---------------------------------------------------------------------------
def _extract_txt(path: Path) -> str:
    for enc in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
        try:
            return path.read_text(encoding=enc)
        except (UnicodeDecodeError, LookupError):
            continue
    raise RuntimeError(f"Cannot decode text file: {path.name}")


# ---------------------------------------------------------------------------
# Text cleaning
# ---------------------------------------------------------------------------
def _clean(text: str) -> str:
    if not text:
        return ""
    text = text.replace("\x00", "")                  # null bytes
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)           # max 2 blank lines
    lines = [ln.rstrip() for ln in text.split("\n")]
    return "\n".join(lines).strip()