"""
Configuration management for the application.
Loads environment variables and provides centralized config access.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str

    # Redis
    redis_url: str

    # GitHub OAuth
    github_client_id: str
    github_client_secret: str
    github_redirect_uri: str

    # NVIDIA NIM API (sole LLM provider)
    nvidia_api_key: str = ""
    nvidia_model: str = "meta/llama-4-maverick-17b-128e-instruct"
    nvidia_api_url: str = "https://integrate.api.nvidia.com/v1/chat/completions"

    # LLM Generation Parameters (optimized for VERY detailed documentation with diagrams)
    llm_temperature: float = 0.7  # Balanced for detailed, structured output
    llm_max_tokens: int = 16000  # Very high for comprehensive documentation with diagrams
    llm_top_p: float = 0.92  # Nucleus sampling - balanced for quality
    llm_frequency_penalty: float = 0.4  # Reduce repetition more aggressively
    llm_presence_penalty: float = 0.3  # Encourage covering diverse topics

    # Qdrant Vector DB
    qdrant_url: str
    qdrant_api_key: str
    qdrant_collection_name: str = "file_chunks"
    
    # Security
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Application
    backend_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:3000"
    clone_dir: str = "/tmp/repo_clones"  # Override with env var for Windows: set CLONE_DIR=C:\tmp\repo_clones
    
    # Embedding model
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    chunk_size: int = 200  # tokens per chunk
    chunk_overlap: int = 50  # overlap between chunks

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

