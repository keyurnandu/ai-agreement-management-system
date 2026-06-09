import fitz  # PyMuPDF
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "pdf-engine",
        "pymupdf": fitz.version[0],
    }
