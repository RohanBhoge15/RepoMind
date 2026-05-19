"""
Authentication routes for GitHub OAuth.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta

from database import get_db
from models import User
from schemas import GitHubCallbackRequest, Token, UserResponse
from auth import exchange_code_for_token, create_access_token, encrypt_token, get_current_user
from config import get_settings

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/github")
async def github_login():
    """
    Redirect to GitHub OAuth authorization page.
    Returns the authorization URL for the frontend to redirect to.
    """
    auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.github_client_id}"
        f"&redirect_uri={settings.github_redirect_uri}"
        f"&scope=repo,user"
    )
    return {"auth_url": auth_url}


@router.post("/github/callback", response_model=Token)
async def github_callback(
    callback_data: GitHubCallbackRequest,
    db: Session = Depends(get_db)
):
    """
    Handle GitHub OAuth callback.
    Accepts either OAuth code or GitHub access token directly.

    Args:
        callback_data: OAuth callback data with code (or access token)
        db: Database session

    Returns:
        JWT access token
    """
    import httpx
    import logging

    logger = logging.getLogger(__name__)
    logger.info(f"GitHub callback received")

    # Check if this is already a GitHub access token (from NextAuth)
    # Try to use it directly to get user info
    try:
        async with httpx.AsyncClient() as client:
            # Try to get user info with the provided code (which might be an access token)
            headers = {"Authorization": f"Bearer {callback_data.code}"}
            user_response = await client.get("https://api.github.com/user", headers=headers)

            if user_response.status_code == 200:
                # It's an access token, use it directly
                github_user = user_response.json()
                github_data = {
                    "access_token": callback_data.code,
                    "github_id": str(github_user["id"]),
                    "username": github_user["login"],
                    "email": github_user.get("email"),
                    "avatar_url": github_user.get("avatar_url")
                }
                logger.info(f"Successfully authenticated user: {github_user['login']}")
            else:
                # It's an OAuth code, exchange it
                logger.info("Exchanging OAuth code for token")
                github_data = await exchange_code_for_token(callback_data.code)
    except Exception as e:
        # Fallback to OAuth code exchange
        logger.warning(f"Failed to use token directly, falling back to OAuth exchange: {e}")
        try:
            github_data = await exchange_code_for_token(callback_data.code)
        except Exception as ex:
            logger.error(f"OAuth exchange failed: {ex}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to authenticate with GitHub: {str(ex)}"
            )

    # Check if user exists
    user = db.query(User).filter(User.github_id == github_data["github_id"]).first()

    if user:
        # Update existing user
        logger.info(f"Updating existing user: {user.username}")
        user.username = github_data["username"]
        user.email = github_data.get("email")
        user.avatar_url = github_data.get("avatar_url")
        user.access_token_encrypted = encrypt_token(github_data["access_token"])
    else:
        # Create new user
        logger.info(f"Creating new user: {github_data['username']}")
        user = User(
            github_id=github_data["github_id"],
            username=github_data["username"],
            email=github_data.get("email"),
            avatar_url=github_data.get("avatar_url"),
            access_token_encrypted=encrypt_token(github_data["access_token"])
        )
        db.add(user)

    try:
        db.commit()
        db.refresh(user)
        logger.info(f"User saved successfully: {user.id}")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to save user to database: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save user to database"
        )

    # Create JWT token
    access_token = create_access_token(
        data={"user_id": user.id, "github_id": user.github_id},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
    )

    logger.info(f"JWT token created for user: {user.id}")
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    Get current authenticated user information.
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        User information
    """
    return current_user

