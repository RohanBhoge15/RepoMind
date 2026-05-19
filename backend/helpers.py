"""
Helper functions to reduce code duplication across routers.
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from models import Repository, User, File


def verify_repository_access(
    repo_id: int,
    user_id: int,
    db: Session
) -> Repository:
    """
    Verify user has access to a repository and return it.

    Raises:
        HTTPException 404 if repository not found or access denied
    """
    repo = db.query(Repository).filter(
        Repository.id == repo_id,
        Repository.user_id == user_id
    ).first()

    if repo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found or access denied"
        )

    return repo


def verify_user_exists(
    user_id: int,
    db: Session
) -> User:
    """
    Verify user exists and return user object.

    Raises:
        HTTPException 404 if user not found
    """
    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return user


def verify_file_ownership(
    file_id: int,
    user_id: int,
    db: Session
) -> File:
    """
    Verify user owns the repository that contains the file.

    Raises:
        HTTPException 404 if file not found or access denied
    """
    file = db.query(File).join(Repository).filter(
        File.id == file_id,
        Repository.user_id == user_id
    ).first()

    if file is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or access denied"
        )

    return file


def sanitize_error_message(error: Exception) -> str:
    """
    Sanitize error messages to prevent information disclosure.
    Returns a generic user-friendly message while logging the full error.
    """
    if isinstance(error, HTTPException):
        return str(error.detail) if error.detail else "An error occurred"

    return "An internal error occurred. Please try again later."
