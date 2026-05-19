"""
Main FastAPI application.
Configures routes, middleware, and startup/shutdown events.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import get_settings
from database import engine, Base
from routers import auth_router, repo_router, file_router, docs_router, chat_router, graph_router, cache_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    """
    # Startup: Create database tables
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created")
    
    yield
    
    # Shutdown: Cleanup
    print("👋 Shutting down...")


# Create FastAPI application
app = FastAPI(
    title="RepoMind API",
    description="AI-powered GitHub repository indexing and documentation system",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router.router)
app.include_router(repo_router.router)
app.include_router(file_router.router)
app.include_router(docs_router.router)
app.include_router(chat_router.router)
app.include_router(graph_router.router)
app.include_router(cache_router.router)


@app.get("/")
async def root():
    """Root endpoint - API health check."""
    return {
        "message": "GitHub Codebase Explorer API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )

