from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import ai, analytics, health

app = FastAPI(
    title="intelligence",
    version="0.0.0",
    description="Pluggable AI, RAG, and analytics for contract-platform.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(ai.router)
app.include_router(analytics.router)
