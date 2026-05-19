"""
File content and explanation routes.
"""
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import FileContentResponse, FileExplanationResponse
from auth import get_current_user
from helpers import verify_file_ownership

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["Files"])


@router.get("/{file_id}", response_model=FileContentResponse)
async def get_file_content(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get file content from database."""
    file = verify_file_ownership(file_id, current_user.id, db)

    return FileContentResponse(
        file_id=file.id,
        path=file.path,
        content=file.content or "",
        language=file.language
    )


@router.get("/{file_id}/explanation", response_model=FileExplanationResponse)
async def get_file_explanation(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get AI-generated file explanation."""
    file = verify_file_ownership(file_id, current_user.id, db)

    return FileExplanationResponse(
        file_id=file.id,
        path=file.path,
        explanation=file.explanation or "No explanation available yet",
        key_functions=file.key_functions or [],
        dependencies=file.dependencies or [],
        vulnerabilities=file.vulnerabilities or []
    )
