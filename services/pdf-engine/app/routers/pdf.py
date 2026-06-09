import base64
import json

import fitz  # PyMuPDF
from fastapi import APIRouter, Depends, Form, HTTPException, Response, UploadFile, status
from pydantic import BaseModel

from ..core.security import verify_service_token

router = APIRouter(prefix="/pdf", tags=["pdf"], dependencies=[Depends(verify_service_token)])


def _open(data: bytes) -> fitz.Document:
    try:
        return fitz.open(stream=data, filetype="pdf")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Could not open PDF: {exc}") from exc


def _parse_json(raw: str, label: str):
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid {label} JSON: {exc}") from exc


def _parse_ranges(spec: str, page_count: int) -> list[int]:
    """'1-3,5' -> zero-based [0,1,2,4], clamped to the doc, order preserved. Raises ValueError."""
    out: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            start, end = int(a), int(b)
            step = 1 if end >= start else -1
            for p in range(start, end + step, step):
                if 1 <= p <= page_count:
                    out.append(p - 1)
        else:
            p = int(part)
            if 1 <= p <= page_count:
                out.append(p - 1)
    return out


@router.post("/info", summary="Page count + document metadata")
async def info(file: UploadFile) -> dict:
    doc = _open(await file.read())
    try:
        return {
            "filename": file.filename,
            "pages": doc.page_count,
            "metadata": doc.metadata,
            "page_sizes": [
                {"page": i + 1, "width": p.rect.width, "height": p.rect.height} for i, p in enumerate(doc)
            ],
            "is_encrypted": doc.is_encrypted,
        }
    finally:
        doc.close()


@router.post("/extract-text", summary="Extract text per page")
async def extract_text(file: UploadFile) -> dict:
    doc = _open(await file.read())
    try:
        pages = [{"page": i + 1, "text": p.get_text()} for i, p in enumerate(doc)]
        return {"pages": pages, "char_count": sum(len(p["text"]) for p in pages)}
    finally:
        doc.close()


@router.post("/render", summary="Rasterize one page to PNG")
async def render(file: UploadFile, page: int = 1, dpi: int = 144) -> Response:
    doc = _open(await file.read())
    try:
        if page < 1 or page > doc.page_count:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"page out of range 1..{doc.page_count}")
        zoom = max(36, min(dpi, 300)) / 72.0
        pix = doc[page - 1].get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        return Response(
            content=pix.tobytes("png"),
            media_type="image/png",
            headers={"X-Page-Count": str(doc.page_count), "Cache-Control": "no-store"},
        )
    finally:
        doc.close()


@router.post("/page-ops", summary="Rotate / delete / reorder pages -> new PDF")
async def page_ops(file: UploadFile, ops: str = Form(...)) -> Response:
    spec = _parse_json(ops, "ops")
    op_list = spec if isinstance(spec, list) else [spec]
    doc = _open(await file.read())
    try:
        for op in op_list:
            kind = op.get("op")
            if kind == "rotate":
                degrees = int(op.get("degrees", 90))
                for pn in op.get("pages", []):
                    pg = doc[pn - 1]
                    pg.set_rotation((pg.rotation + degrees) % 360)
            elif kind == "delete":
                for idx in sorted({pn - 1 for pn in op.get("pages", [])}, reverse=True):
                    doc.delete_page(idx)
            elif kind == "reorder":
                doc.select([pn - 1 for pn in op.get("order", [])])
            else:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown op: {kind}")
        out = doc.tobytes(deflate=True, garbage=3)
        return Response(
            content=out,
            media_type="application/pdf",
            headers={"X-Page-Count": str(doc.page_count)},
        )
    finally:
        doc.close()


@router.post("/form-fields", summary="List AcroForm fields")
async def form_fields(file: UploadFile) -> dict:
    doc = _open(await file.read())
    try:
        fields = []
        for i, page in enumerate(doc):
            for w in page.widgets() or []:
                fields.append(
                    {
                        "page": i + 1,
                        "name": w.field_name,
                        "type": w.field_type_string,
                        "value": w.field_value,
                        "rect": [w.rect.x0, w.rect.y0, w.rect.x1, w.rect.y1],
                    }
                )
        return {"count": len(fields), "fields": fields}
    finally:
        doc.close()


@router.post("/fill-form", summary="Set AcroForm field values -> new PDF")
async def fill_form(file: UploadFile, values: str = Form(...)) -> Response:
    data = _parse_json(values, "values")
    doc = _open(await file.read())
    try:
        filled = 0
        for page in doc:
            for w in page.widgets() or []:
                if w.field_name in data:
                    w.field_value = str(data[w.field_name])
                    w.update()
                    filled += 1
        out = doc.tobytes(deflate=True, garbage=3)
        return Response(content=out, media_type="application/pdf", headers={"X-Fields-Filled": str(filled)})
    finally:
        doc.close()


@router.post("/stamp", summary="Stamp text values onto a PDF at normalized coords -> new PDF")
async def stamp(file: UploadFile, stamps: str = Form(...)) -> Response:
    """stamps = list of {page, x, y, w, h, text, size?, label?} with x/y/w/h as 0..1 fractions."""
    items = _parse_json(stamps, "stamps")
    if not isinstance(items, list):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "stamps must be a list")
    doc = _open(await file.read())
    try:
        for s in items:
            pno = int(s.get("page", 1)) - 1
            if pno < 0 or pno >= doc.page_count:
                continue
            page = doc[pno]
            w_pt, h_pt = page.rect.width, page.rect.height
            x = float(s.get("x", 0)) * w_pt
            y = float(s.get("y", 0)) * h_pt
            box_h = float(s.get("h", 0.04)) * h_pt
            w_box = float(s.get("w", 0.25)) * w_pt
            text = str(s.get("text", ""))
            size = float(s.get("size", 0)) or max(8.0, min(box_h * 0.7, 18.0))
            if text.startswith("data:image"):
                try:
                    b64 = text.split(",", 1)[1]
                    page.insert_image(fitz.Rect(x, y, x + w_box, y + box_h), stream=base64.b64decode(b64))
                except Exception:  # noqa: BLE001
                    pass
            elif text:
                page.insert_text((x, y + box_h * 0.7), text, fontsize=size, color=(0.05, 0.1, 0.45))
            label = s.get("label")
            if label:
                page.insert_text((x, y + box_h + 7), str(label), fontsize=6, color=(0.45, 0.45, 0.45))
        out = doc.tobytes(deflate=True, garbage=3)
        return Response(content=out, media_type="application/pdf", headers={"X-Page-Count": str(doc.page_count)})
    finally:
        doc.close()


class TextPagePayload(BaseModel):
    title: str
    lines: list[str] = []


@router.post("/text-page", summary="Render a title + lines to a (multi-page) PDF")
async def text_page(payload: TextPagePayload) -> Response:
    margin_x, top, bottom = 56, 64, 780
    doc = fitz.open()
    page = doc.new_page()
    y = top
    page.insert_text((margin_x, y), payload.title, fontsize=16, color=(0, 0, 0))
    y += 30
    for line in payload.lines:
        if y > bottom:
            page = doc.new_page()
            y = top
        page.insert_text((margin_x, y), line[:200], fontsize=10, color=(0.12, 0.12, 0.12))
        y += 16
    pages = doc.page_count
    out = doc.tobytes(deflate=True)
    doc.close()
    return Response(content=out, media_type="application/pdf", headers={"X-Page-Count": str(pages)})


@router.post("/merge", summary="Merge multiple PDFs into one -> new PDF")
async def merge(files: list[UploadFile]) -> Response:
    if not files or len(files) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "need at least 2 files to merge")
    out = fitz.open()
    try:
        for f in files:
            src = _open(await f.read())
            try:
                out.insert_pdf(src)
            finally:
                src.close()
        data = out.tobytes(deflate=True, garbage=3)
        return Response(content=data, media_type="application/pdf", headers={"X-Page-Count": str(out.page_count)})
    finally:
        out.close()


@router.post("/split", summary="Extract a page range (e.g. '1-3,5') into a new PDF")
async def split(file: UploadFile, ranges: str = Form(...)) -> Response:
    doc = _open(await file.read())
    try:
        try:
            pages = _parse_ranges(ranges, doc.page_count)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"invalid ranges: {exc}") from exc
        if not pages:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "no valid pages in the requested range")
        doc.select(pages)
        data = doc.tobytes(deflate=True, garbage=3)
        return Response(content=data, media_type="application/pdf", headers={"X-Page-Count": str(doc.page_count)})
    finally:
        doc.close()


# ── Later phases (visible contract; not yet implemented) ────────────────────────
@router.post("/redact", summary="Redaction — later")
async def redact() -> dict:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "redaction arrives in a later phase")


@router.post("/edit-text", summary="In-place content editing (Acrobat-Pro level) — Phase 2")
async def edit_text() -> dict:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "content editing arrives in Phase 2")
