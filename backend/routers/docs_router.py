"""
Documentation routes.
"""
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import User, Repository, DocumentationSection
from schemas import DocumentationResponse, DocumentationSectionResponse
from auth import get_current_user
from helpers import verify_repository_access

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/docs", tags=["Documentation"])


@router.get("/repos/{repo_id}", response_model=DocumentationResponse)
async def get_repository_documentation(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get full documentation for a repository.
    
    Args:
        repo_id: Repository ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Complete documentation with all sections
    """
    verify_repository_access(repo_id, current_user.id, db)

    # Get all documentation sections
    sections = db.query(DocumentationSection).filter(
        DocumentationSection.repository_id == repo_id
    ).order_by(DocumentationSection.order).all()
    
    return DocumentationResponse(
        repository_id=repo_id,
        sections=sections
    )


@router.post("/repos/{repo_id}/regenerate-diagram")
async def regenerate_diagram(
    repo_id: int,
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Regenerate a specific Mermaid diagram that had invalid syntax.
    
    Args:
        repo_id: Repository ID
        request: Contains 'broken_diagram' - the broken Mermaid code
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Newly generated valid Mermaid diagram code
    """
    from ai_service import get_ai_service
    
    broken_diagram = request.get('broken_diagram', '')
    error_message = request.get('error_message', '')
    
    if not broken_diagram:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No diagram code provided"
        )
    
    verify_repository_access(repo_id, current_user.id, db)

    # Use the new JSON pipeline for safe diagram generation
    ai_service = get_ai_service()
    
    try:
        # Use the JSON pipeline to fix the diagram
        # This generates JSON from AI, then deterministically converts to Mermaid
        fixed_diagram = await asyncio.to_thread(ai_service.fix_mermaid_diagram, broken_diagram, error_message)

        logger.info("Diagram fixed via JSON pipeline")

        # Save the fixed diagram to the database if section_id is provided
        section_id = request.get('section_id')
        if section_id:
            try:
                section = db.query(DocumentationSection).filter(
                    DocumentationSection.id == section_id,
                    DocumentationSection.repository_id == repo_id
                ).first()
                if section and broken_diagram in section.content:
                    section.content = section.content.replace(broken_diagram, fixed_diagram)
                    db.commit()
                    logger.info(f"Saved fixed diagram to section {section_id}")
            except Exception as save_err:
                logger.warning(f"Could not save fixed diagram: {save_err}")

        return {"fixed_diagram": fixed_diagram}

    except Exception as e:
        logger.error(f"Diagram regeneration failed: {e}", exc_info=True)
        # Return a fallback diagram instead of error
        fallback = """graph TD
    A[Component] --> B[Process]
    B --> C[Output]"""
        return {"fixed_diagram": fallback}



@router.post("/repos/{repo_id}/regenerate-all", response_model=DocumentationResponse)
async def regenerate_all_documentation(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Regenerate ALL documentation sections for a repository.
    
    Use this when documentation wasn't parsed correctly into sections.
    
    Args:
        repo_id: Repository ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Newly generated documentation with all sections
    """
    from ai_service import get_ai_service
    from models import File
    
    repo = verify_repository_access(repo_id, current_user.id, db)

    # Get all files for context
    files = db.query(File).filter(File.repository_id == repo_id).all()
    
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files indexed for this repository. Please re-index first."
        )
    
    # Prepare file summaries
    file_summaries = []
    for f in files:
        file_summaries.append({
            'path': f.path,
            'explanation': f.explanation or '',
            'dependencies': f.dependencies or [],
            'vulnerabilities': f.vulnerabilities or []
        })
    
    # Delete old documentation sections
    db.query(DocumentationSection).filter(
        DocumentationSection.repository_id == repo_id
    ).delete()
    db.commit()
    
    # Regenerate documentation with improved parser
    ai_service = get_ai_service()
    doc_sections = await ai_service.generate_repository_documentation(
        repo.name,
        file_summaries,
        repo.languages or {}
    )
    
    # Save new sections
    for section in doc_sections:
        db_section = DocumentationSection(
            repository_id=repo_id,
            section_name=section['section_name'],
            content=section['content'],
            order=section['order']
        )
        db.add(db_section)
    db.commit()
    
    # Get all newly created sections
    sections = db.query(DocumentationSection).filter(
        DocumentationSection.repository_id == repo_id
    ).order_by(DocumentationSection.order).all()
    
    return DocumentationResponse(
        repository_id=repo_id,
        sections=sections
    )
