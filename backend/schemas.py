"""
Pydantic schemas for request/response validation.
"""
from pydantic import BaseModel, Field, EmailStr, AnyUrl, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from models import IndexingStatus
import re


# ============= User Schemas =============
class UserBase(BaseModel):
    """Base user schema."""
    username: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None


class UserCreate(UserBase):
    """Schema for creating a user."""
    github_id: str = Field(..., min_length=1, max_length=100, description="GitHub user ID")
    access_token: str = Field(..., min_length=1, max_length=500, description="GitHub OAuth access token")

    @validator('github_id')
    def validate_github_id(cls, v):
        """GitHub IDs should be alphanumeric with possible hyphens/underscores."""
        if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9_-]*$', v):
            raise ValueError('Invalid GitHub ID format')
        return v

    @validator('email')
    def validate_email(cls, v):
        """Additional email validation."""
        if v and not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
            raise ValueError('Invalid email format')
        return v


class UserResponse(UserBase):
    """Schema for user response."""
    id: int
    github_id: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============= Repository Schemas =============
class RepositoryBase(BaseModel):
    """Base repository schema."""
    name: str
    full_name: str
    description: Optional[str] = None
    url: str
    default_branch: str = "main"


class RepositoryCreate(RepositoryBase):
    """Schema for creating a repository."""
    github_repo_id: str


class RepositoryUrlRequest(BaseModel):
    """Schema for importing repository by URL."""
    url: AnyUrl = Field(..., description="GitHub repository URL (HTTPS required)")

    @validator('url')
    def validate_github_url(cls, v):
        """Ensure URL is a valid GitHub URL with HTTPS."""
        url_str = str(v)
        if not url_str.startswith('https://github.com/'):
            raise ValueError('URL must be a GitHub repository URL (https://github.com/...)')
        return v


class RepositoryResponse(RepositoryBase):
    """Schema for repository response."""
    id: int
    github_repo_id: str
    indexing_status: IndexingStatus
    indexing_progress: int
    indexing_message: Optional[str] = None
    indexed_at: Optional[datetime] = None
    total_files: int
    total_lines: int
    languages: Dict[str, int]
    created_at: datetime
    updated_at: Optional[datetime] = None
    # GitHub metadata
    language: Optional[str] = None
    stars_count: int = 0
    forks_count: int = 0
    is_imported: bool = False

    class Config:
        from_attributes = True


class RepositoryListResponse(BaseModel):
    """Schema for repository list response."""
    repositories: List[RepositoryResponse]
    total: int


class IndexingStatusResponse(BaseModel):
    """Schema for indexing status response."""
    repository_id: int
    status: IndexingStatus
    progress: int
    message: Optional[str] = None
    total_files: int
    indexed_at: Optional[datetime] = None
    current_file: Optional[str] = None
    processed_files: Optional[int] = None
    current_step: Optional[str] = None
    error: Optional[str] = None


# ============= File Schemas =============
class FileBase(BaseModel):
    """Base file schema."""
    path: str
    filename: str
    language: Optional[str] = None
    size_bytes: int = 0
    lines_of_code: int = 0


class FileResponse(FileBase):
    """Schema for file response."""
    id: int
    repository_id: int
    explanation: Optional[str] = None
    key_functions: List[Dict[str, Any]] = []
    dependencies: List[str] = []
    vulnerabilities: List[Dict[str, Any]] = []
    content_hash: Optional[str] = None
    last_analyzed: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class FileTreeNode(BaseModel):
    """Schema for file tree node."""
    name: str
    path: str
    type: str  # "file" or "directory"
    children: Optional[List['FileTreeNode']] = None
    file_id: Optional[int] = None
    language: Optional[str] = None


class FileContentResponse(BaseModel):
    """Schema for file content response."""
    file_id: int
    path: str
    content: str
    language: Optional[str] = None


class FileExplanationResponse(BaseModel):
    """Schema for file explanation response."""
    file_id: int
    path: str
    explanation: str
    key_functions: List[Dict[str, Any]]
    dependencies: List[str]
    vulnerabilities: List[Dict[str, Any]]


# ============= Documentation Schemas =============
class DocumentationSectionResponse(BaseModel):
    """Schema for documentation section response."""
    id: int
    section_name: str
    content: str
    order: int
    
    class Config:
        from_attributes = True


class DocumentationResponse(BaseModel):
    """Schema for full documentation response."""
    repository_id: int
    sections: List[DocumentationSectionResponse]


# ============= Chat Schemas =============
class ChatRequest(BaseModel):
    """Schema for chat request."""
    question: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        strip_whitespace=True,
        description="User's question about the repository"
    )

    @validator('question')
    def validate_question(cls, v):
        """Prevent overly short or suspiciously long questions."""
        if len(v.strip()) < 1:
            raise ValueError('Question cannot be empty')
        if len(v) > 1000:
            raise ValueError('Question exceeds maximum length of 1000 characters')
        return v


class ChatResponse(BaseModel):
    """Schema for chat response."""
    question: str
    answer: str
    context_chunks: List[Dict[str, Any]]
    created_at: datetime


class ChatHistoryResponse(BaseModel):
    """Schema for chat history response."""
    id: int
    question: str
    answer: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============= Graph Schemas =============
class GraphNode(BaseModel):
    """Schema for dependency graph node."""
    id: str
    label: str
    path: str
    language: Optional[str] = None
    type: str  # "file"
    # Visualization metadata (added for constellation / code city / health views)
    loc: Optional[int] = 0
    size_bytes: Optional[int] = 0
    complexity: Optional[float] = 0.0
    last_modified: Optional[datetime] = None
    indexed_at: Optional[datetime] = None
    vulnerability_count: Optional[int] = 0
    has_explanation: Optional[bool] = False


class GraphEdge(BaseModel):
    """Schema for dependency graph edge."""
    source: str
    target: str
    type: str  # "imports", "requires", etc.


class DependencyGraphResponse(BaseModel):
    """Schema for dependency graph response."""
    nodes: List[GraphNode]
    edges: List[GraphEdge]


# ============= Authentication Schemas =============
class Token(BaseModel):
    """Schema for JWT token response."""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Schema for token payload data."""
    user_id: Optional[int] = None
    github_id: Optional[str] = None


class GitHubCallbackRequest(BaseModel):
    """Schema for GitHub OAuth callback."""
    code: str
    state: Optional[str] = None


# Update forward references
FileTreeNode.model_rebuild()

