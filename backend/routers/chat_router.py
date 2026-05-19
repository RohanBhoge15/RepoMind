"""
Chat routes for RAG-powered Q&A.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from database import get_db
from models import User, ChatHistory
from schemas import ChatRequest, ChatResponse, ChatHistoryResponse
from auth import get_current_user
from embeddings import get_embedding_service
from ai_service import get_ai_service
from helpers import verify_repository_access

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("/repos/{repo_id}", response_model=ChatResponse)
async def chat_with_repository(
    repo_id: int,
    chat_request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Ask a question about a repository using RAG.
    
    Args:
        repo_id: Repository ID
        chat_request: Chat request with question
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        AI-generated answer with context
    """
    verify_repository_access(repo_id, current_user.id, db)

    # Get embedding and AI services
    embedding_service = get_embedding_service()
    ai_service = get_ai_service()
    
    try:
        # Search for relevant code chunks
        context_chunks = embedding_service.search_similar_chunks(
            query=chat_request.question,
            repository_id=repo_id,
            limit=5
        )
        
        # Generate answer using AI
        answer = await ai_service.generate_chat_response(
            question=chat_request.question,
            context_chunks=context_chunks
        )
        
        # Save to chat history
        chat_entry = ChatHistory(
            user_id=current_user.id,
            repository_id=repo_id,
            question=chat_request.question,
            answer=answer,
            context_chunks=context_chunks
        )
        db.add(chat_entry)
        db.commit()
        db.refresh(chat_entry)
        
        return ChatResponse(
            question=chat_request.question,
            answer=answer,
            context_chunks=context_chunks,
            created_at=chat_entry.created_at
        )
        
    except Exception as e:
        logger.error(f"Failed to generate chat response: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate response"
        )


@router.get("/repos/{repo_id}/history", response_model=List[ChatHistoryResponse])
async def get_chat_history(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50
):
    """
    Get chat history for a repository.
    
    Args:
        repo_id: Repository ID
        current_user: Current authenticated user
        db: Database session
        limit: Maximum number of history items
        
    Returns:
        List of chat history entries
    """
    verify_repository_access(repo_id, current_user.id, db)
    
    # Get chat history
    history = db.query(ChatHistory).filter(
        ChatHistory.repository_id == repo_id,
        ChatHistory.user_id == current_user.id
    ).order_by(ChatHistory.created_at.desc()).limit(limit).all()
    
    return history


@router.delete("/repos/{repo_id}/history/{message_id}")
async def delete_chat_message(
    repo_id: int,
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a specific chat message.
    
    Args:
        repo_id: Repository ID
        message_id: Chat message ID to delete
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Success message
    """
    verify_repository_access(repo_id, current_user.id, db)
    
    # Find and delete the message
    message = db.query(ChatHistory).filter(
        ChatHistory.id == message_id,
        ChatHistory.repository_id == repo_id,
        ChatHistory.user_id == current_user.id
    ).first()
    
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    db.delete(message)
    db.commit()
    
    return {"message": "Chat message deleted successfully"}


@router.delete("/repos/{repo_id}/history")
async def delete_chat_messages_bulk(
    repo_id: int,
    message_ids: List[int],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete multiple chat messages (for thread deletion).
    
    Args:
        repo_id: Repository ID
        message_ids: List of chat message IDs to delete
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Number of messages deleted
    """
    verify_repository_access(repo_id, current_user.id, db)
    
    # Delete the messages
    deleted_count = db.query(ChatHistory).filter(
        ChatHistory.id.in_(message_ids),
        ChatHistory.repository_id == repo_id,
        ChatHistory.user_id == current_user.id
    ).delete(synchronize_session=False)
    
    db.commit()
    
    return {"deleted_count": deleted_count}


@router.delete("/repos/{repo_id}/history/all")
async def delete_all_chat_history(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete all chat history for a repository.
    
    Args:
        repo_id: Repository ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Number of messages deleted
    """
    verify_repository_access(repo_id, current_user.id, db)
    
    # Delete all messages
    deleted_count = db.query(ChatHistory).filter(
        ChatHistory.repository_id == repo_id,
        ChatHistory.user_id == current_user.id
    ).delete(synchronize_session=False)
    
    db.commit()
    
    return {"deleted_count": deleted_count}
