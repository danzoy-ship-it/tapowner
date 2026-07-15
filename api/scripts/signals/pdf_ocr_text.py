# OCR text extractor for image-only foreclosure notice PDFs (companion of
# load_pdf_foreclosures.mjs). Prints the full text of a PDF to stdout with
# form-feed (\f) page separators -- same shape as `pdftotext` output.
#
# Per page: if the PDF already carries a usable text layer, use it; otherwise
# rasterize the page (PyMuPDF) and OCR it. Two OCR engines supported:
#   - tesseract (cross-platform; needs the binary on PATH or TESSERACT_EXE)
#   - Windows.Media.Ocr via `pip install winocr` (Windows-only, no install/
#     admin needed; measured cleaner than 300dpi tesseract on these packets)
# Default: winocr if importable, else tesseract. Force with OCR_ENGINE=win|tesseract.
#
# Deps: pip install pymupdf pillow winocr  (winocr optional if tesseract used)
# Env:  OCR_ENGINE, OCR_DPI (default 300; winocr uses 200), OCR_PSM (default 3),
#       TESSERACT_EXE.
#
# Usage: python pdf_ocr_text.py <file.pdf>
import io
import os
import shutil
import subprocess
import sys

import fitz  # PyMuPDF


def find_tesseract():
    exe = os.environ.get("TESSERACT_EXE") or shutil.which("tesseract")
    if not exe:
        for p in (
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ):
            if os.path.exists(p):
                exe = p
                break
    return exe


def make_engine():
    """Returns (name, ocr_fn) where ocr_fn(page) -> text."""
    want = os.environ.get("OCR_ENGINE", "").lower()
    if want != "tesseract":
        try:
            import winocr  # noqa: F401
            from PIL import Image

            def ocr_win(page):
                import winocr

                dpi = int(os.environ.get("OCR_DPI", "200"))
                img = Image.open(io.BytesIO(page.get_pixmap(dpi=dpi).tobytes("png")))
                op = winocr.recognize_pil(img, "en-US")
                res = op.get() if hasattr(op, "get") else op  # IAsyncOperation
                return "\n".join(line.text for line in res.lines)

            return "win", ocr_win
        except ImportError:
            if want == "win":
                sys.stderr.write("OCR_ENGINE=win but winocr/pillow not installed\n")
                sys.exit(2)
    tess = find_tesseract()
    if not tess:
        sys.stderr.write("no OCR engine: install tesseract or `pip install winocr pillow`\n")
        sys.exit(2)

    def ocr_tess(page):
        dpi = int(os.environ.get("OCR_DPI", "300"))
        png = page.get_pixmap(dpi=dpi).tobytes("png")
        r = subprocess.run(
            [tess, "stdin", "stdout", "--psm", os.environ.get("OCR_PSM", "3"), "-l", "eng"],
            input=png,
            capture_output=True,
        )
        if r.returncode != 0:
            raise RuntimeError(r.stderr.decode("utf-8", "replace")[:300])
        return r.stdout.decode("utf-8", "replace")

    return "tesseract", ocr_tess


def main():
    pdf_path = sys.argv[1]
    _, ocr = make_engine()
    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        text = page.get_text()
        if len(text.strip()) >= 200:  # real embedded text layer -> keep it
            pages.append(text)
            continue
        pages.append(ocr(page))
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.write("\f".join(pages))


if __name__ == "__main__":
    main()
