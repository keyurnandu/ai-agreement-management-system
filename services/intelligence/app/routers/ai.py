from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core import vectorstore
from ..core.embeddings import get_embedder
from ..core.rag import chunk_text, cosine
from ..core.security import verify_service_token
from ..providers.factory import AVAILABLE, get_provider

router = APIRouter(prefix="/ai", tags=["ai"], dependencies=[Depends(verify_service_token)])


class CompleteRequest(BaseModel):
    prompt: str
    system: str | None = None
    max_tokens: int = 1024


class EmbedRequest(BaseModel):
    texts: list[str]


class SummarizeRequest(BaseModel):
    text: str


class AttributeSpec(BaseModel):
    key: str
    label: str | None = None
    type: str | None = "TEXT"
    prompt: str | None = ""
    mode: str | None = "STRICT"
    inclusion: list[str] = []
    exclusion: list[str] = []


class ExtractRequest(BaseModel):
    text: str
    attributes: list[AttributeSpec]


class AnalyzeRequest(BaseModel):
    text: str


class AskRequest(BaseModel):
    text: str
    question: str
    top_k: int = 4
    doc_id: str | None = None


class IndexRequest(BaseModel):
    doc_id: str
    text: str


class ClassifyRequest(BaseModel):
    text: str


class StandardClause(BaseModel):
    title: str
    text: str


class RedlineRequest(BaseModel):
    text: str
    standards: list[StandardClause] = []


class DiffRequest(BaseModel):
    before: str
    after: str


CONTRACT_SUMMARY_SYSTEM = (
    "You are a contract analyst. Summarize the contract into: parties, term, key "
    "obligations, payment terms, termination, liability, and notable risks. Be concise "
    "and use bullet points."
)


@router.get("/providers")
def providers() -> dict:
    p = get_provider()
    return {"available": AVAILABLE, "active": p.name, "model": getattr(p, "model", None)}


@router.post("/complete")
async def complete(req: CompleteRequest) -> dict:
    c = await get_provider().complete(req.prompt, req.system, req.max_tokens)
    return {"provider": c.provider, "model": c.model, "text": c.text}


@router.post("/embed")
async def embed(req: EmbedRequest) -> dict:
    vectors = await get_provider().embed(req.texts)
    return {
        "provider": get_provider().name,
        "dim": len(vectors[0]) if vectors else 0,
        "count": len(vectors),
        "vectors": vectors,
    }


@router.post("/summarize", summary="Contract summary (demonstrates the AI layer)")
async def summarize(req: SummarizeRequest) -> dict:
    c = await get_provider().complete(req.text, CONTRACT_SUMMARY_SYSTEM, 1024)
    return {"provider": c.provider, "model": c.model, "summary": c.text}


@router.post("/extract", summary="Extract defined attribute values from contract text")
async def extract(req: ExtractRequest) -> dict:
    provider = get_provider()
    values = await provider.extract(req.text, [a.model_dump() for a in req.attributes])
    return {"provider": provider.name, "values": values}


@router.post("/analyze", summary="Summary + risk/obligation/key-date extraction")
async def analyze(req: AnalyzeRequest) -> dict:
    return await get_provider().analyze(req.text)


@router.post("/ask", summary="RAG Q&A with citations (persistent on-disk index when doc_id given)")
async def ask(req: AskRequest) -> dict:
    provider = get_provider()
    embedder = get_embedder()

    cached = vectorstore.load(req.doc_id) if req.doc_id else None
    if cached and cached.get("chunks"):
        chunks = cached["chunks"]
        cvs = cached["vectors"]
        indexed = True
    else:
        chunks = chunk_text(req.text)
        if not chunks:
            return {"answer": "The document has no extractable text.", "citations": [], "provider": provider.name}
        cvs = await embedder.embed(chunks)
        if req.doc_id:
            vectorstore.save(req.doc_id, chunks, cvs)
        indexed = False

    qv = (await embedder.embed([req.question]))[0]
    scored = sorted(
        ((cosine(qv, cvs[i]), i) for i in range(len(chunks))),
        key=lambda s: s[0],
        reverse=True,
    )[: max(1, req.top_k)]

    context = "\n\n".join(f"[{rank + 1}] {chunks[idx]}" for rank, (_s, idx) in enumerate(scored))
    system = (
        "Answer the question using ONLY the provided context excerpts. Cite excerpt numbers like [1]. "
        "If the answer is not in the context, say you don't know."
    )
    c = await provider.complete(f"CONTEXT:\n{context}\n\nQUESTION: {req.question}", system, max_tokens=400)
    citations = [
        {"n": rank + 1, "score": round(score, 3), "text": chunks[idx][:240]}
        for rank, (score, idx) in enumerate(scored)
    ]
    return {
        "answer": c.text,
        "citations": citations,
        "provider": provider.name,
        "embedder": embedder.name,
        "indexed": indexed,
    }


@router.post("/index", summary="Build/refresh the on-disk vector index for a document")
async def index(req: IndexRequest) -> dict:
    embedder = get_embedder()
    chunks = chunk_text(req.text)
    if not chunks:
        return {"chunks": 0}
    vectors = await embedder.embed(chunks)
    vectorstore.save(req.doc_id, chunks, vectors)
    return {"chunks": len(chunks), "embedder": embedder.name}


@router.post("/clauses", summary="Split a contract into clauses and classify each")
async def clauses(req: ClassifyRequest) -> dict:
    return await get_provider().classify(req.text)


@router.post("/redline", summary="Compare a contract against standard clauses -> findings")
async def redline(req: RedlineRequest) -> dict:
    return await get_provider().redline(req.text, [s.model_dump() for s in req.standards])


@router.post("/diff", summary="Summarize substantive changes between two versions")
async def diff(req: DiffRequest) -> dict:
    return await get_provider().diff(req.before, req.after)
