"""
SQLAlchemy ORM models for PostgreSQL database.
Defines schema for Users, Repositories, Files, Documentation, and Chat History.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, JSON, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


class IndexingStatus(str, enum.Enum):
    """Enum for repository indexing status."""
    PENDING = "pending"
    CLONING = "cloning"
    ANALYZING = "analyzing"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    GENERATING_DOCS = "generating_docs"
    COMPLETED = "completed"
    FAILED = "failed"


class User(Base):
    """User model - stores GitHub authenticated users."""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    github_id = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, nullable=False)
    email = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    access_token_encrypted = Column(Text, nullable=False)  # Encrypted GitHub token
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    repositories = relationship("Repository", back_populates="user", cascade="all, delete-orphan")
    chat_history = relationship("ChatHistory", back_populates="user", cascade="all, delete-orphan")


class Repository(Base):
    """Repository model - stores indexed GitHub repositories."""
    __tablename__ = "repositories"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    github_repo_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    full_name = Column(String, nullable=False)  # owner/repo
    description = Column(Text, nullable=True)
    url = Column(String, nullable=False)
    default_branch = Column(String, default="main")
    
    # Indexing metadata
    indexing_status = Column(Enum(IndexingStatus), default=IndexingStatus.PENDING)
    indexing_progress = Column(Integer, default=0)  # 0-100
    indexing_message = Column(String, nullable=True)
    indexed_at = Column(DateTime(timezone=True), nullable=True)
    current_file = Column(String, nullable=True)  # Currently processing file
    processed_files = Column(Integer, default=0)  # Number of files processed
    current_step = Column(String, nullable=True)  # Current processing step
    error_message = Column(Text, nullable=True)  # Error message if failed
    
    # Repository stats
    total_files = Column(Integer, default=0)
    total_lines = Column(Integer, default=0)
    languages = Column(JSON, default=dict)  # {"Python": 45, "JavaScript": 30, ...}

    # GitHub metadata
    language = Column(String, nullable=True)  # Primary language
    stars_count = Column(Integer, default=0)
    forks_count = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="repositories")
    files = relationship("File", back_populates="repository", cascade="all, delete-orphan")
    documentation_sections = relationship("DocumentationSection", back_populates="repository", cascade="all, delete-orphan")
    chat_history = relationship("ChatHistory", back_populates="repository", cascade="all, delete-orphan")


class File(Base):
    """File model - stores metadata for each file in a repository."""
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    repository_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True)
    path = Column(String, nullable=False)  # Relative path in repo
    filename = Column(String, nullable=False)
    language = Column(String, nullable=True)
    size_bytes = Column(Integer, default=0)
    lines_of_code = Column(Integer, default=0)
    content = Column(Text, nullable=True)  # Actual file content

    # AI-generated content
    explanation = Column(Text, nullable=True)  # AI-generated file explanation
    key_functions = Column(JSON, default=list)  # List of important functions/classes
    dependencies = Column(JSON, default=list)  # List of imports/dependencies
    vulnerabilities = Column(JSON, default=list)  # Security issues found

    # Metadata
    content_hash = Column(String, nullable=True, index=True)  # SHA256 of content
    last_analyzed = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    repository = relationship("Repository", back_populates="files")


class DocumentationSection(Base):
    """Documentation sections - stores auto-generated documentation."""
    __tablename__ = "documentation_sections"

    id = Column(Integer, primary_key=True, index=True)
    repository_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True)
    section_name = Column(String, nullable=False)  # e.g., "Project Overview", "Architecture"
    content = Column(Text, nullable=False)  # Markdown content
    order = Column(Integer, default=0)  # Display order
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    repository = relationship("Repository", back_populates="documentation_sections")


class ChatHistory(Base):
    """Chat history - stores Q&A interactions with repositories."""
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    repository_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    context_chunks = Column(JSON, default=list)  # Retrieved code chunks used for context
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="chat_history")
    repository = relationship("Repository", back_populates="chat_history")

