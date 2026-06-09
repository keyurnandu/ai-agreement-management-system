from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import health, pdf

app = FastAPI(
    title="pdf-engine",
    version="0.0.0",
    description="PyMuPDF-based PDF read/edit engine for contract-platform.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(pdf.router)
