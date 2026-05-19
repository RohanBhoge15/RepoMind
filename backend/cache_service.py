"""
Caching service for repository indexing.
Caches file content based on Git commit SHA to reduce API calls and processing time.
"""
import logging

logger = logging.getLogger(__name__)

import hashlib
import json
import os
from typing import Optional, Dict, Any, List
from pathlib import Path
import redis
from config import get_settings

settings = get_settings()

# Redis connection for caching
redis_client = redis.from_url(settings.redis_url, decode_responses=True)

# Cache TTL (Time To Live) - 30 days
CACHE_TTL = 60 * 60 * 24 * 30


class CacheService:
    """Service for caching repository data during indexing."""
    
    def __init__(self):
        self.redis = redis_client
    
    def _get_file_cache_key(self, repo_id: str, commit_sha: str, file_path: str) -> str:
        """Generate cache key for a file."""
        return f"file:{repo_id}:{commit_sha}:{file_path}"
    
    def _get_repo_tree_key(self, repo_id: str, commit_sha: str) -> str:
        """Generate cache key for repository tree."""
        return f"tree:{repo_id}:{commit_sha}"
    
    def _get_file_hash_key(self, repo_id: str, file_path: str) -> str:
        """Generate cache key for file hash tracking."""
        return f"hash:{repo_id}:{file_path}"
    
    def get_cached_file(self, repo_id: str, commit_sha: str, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Get cached file data.
        
        Args:
            repo_id: Repository identifier
            commit_sha: Git commit SHA
            file_path: Path to the file
            
        Returns:
            Cached file data or None if not found
        """
        try:
            key = self._get_file_cache_key(repo_id, commit_sha, file_path)
            cached = self.redis.get(key)
            if cached:
                return json.loads(cached)
            return None
        except Exception as e:
            logger.info(f"Cache read error for {file_path}: {e}")
            return None
    
    def cache_file(self, repo_id: str, commit_sha: str, file_path: str, file_data: Dict[str, Any]) -> bool:
        """
        Cache file data.
        
        Args:
            repo_id: Repository identifier
            commit_sha: Git commit SHA
            file_path: Path to the file
            file_data: File data to cache
            
        Returns:
            True if successful
        """
        try:
            key = self._get_file_cache_key(repo_id, commit_sha, file_path)
            self.redis.setex(key, CACHE_TTL, json.dumps(file_data))
            return True
        except Exception as e:
            logger.info(f"Cache write error for {file_path}: {e}")
            return False
    
    def get_cached_tree(self, repo_id: str, commit_sha: str) -> Optional[List[str]]:
        """
        Get cached repository file tree.
        
        Args:
            repo_id: Repository identifier
            commit_sha: Git commit SHA
            
        Returns:
            List of file paths or None if not found
        """
        try:
            key = self._get_repo_tree_key(repo_id, commit_sha)
            cached = self.redis.get(key)
            if cached:
                return json.loads(cached)
            return None
        except Exception as e:
            logger.info(f"Cache read error for tree: {e}")
            return None
    
    def cache_tree(self, repo_id: str, commit_sha: str, file_paths: List[str]) -> bool:
        """
        Cache repository file tree.
        
        Args:
            repo_id: Repository identifier
            commit_sha: Git commit SHA
            file_paths: List of file paths in the repository
            
        Returns:
            True if successful
        """
        try:
            key = self._get_repo_tree_key(repo_id, commit_sha)
            self.redis.setex(key, CACHE_TTL, json.dumps(file_paths))
            return True
        except Exception as e:
            logger.info(f"Cache write error for tree: {e}")
            return False
    
    def get_file_hash(self, repo_id: str, file_path: str) -> Optional[str]:
        """
        Get the last known hash for a file.
        
        Args:
            repo_id: Repository identifier
            file_path: Path to the file
            
        Returns:
            File hash or None if not found
        """
        try:
            key = self._get_file_hash_key(repo_id, file_path)
            return self.redis.get(key)
        except Exception as e:
            logger.info(f"Hash read error for {file_path}: {e}")
            return None
    
    def set_file_hash(self, repo_id: str, file_path: str, file_hash: str) -> bool:
        """
        Store the hash for a file.
        
        Args:
            repo_id: Repository identifier
            file_path: Path to the file
            file_hash: Hash of the file content
            
        Returns:
            True if successful
        """
        try:
            key = self._get_file_hash_key(repo_id, file_path)
            self.redis.setex(key, CACHE_TTL, file_hash)
            return True
        except Exception as e:
            logger.info(f"Hash write error for {file_path}: {e}")
            return False
    
    def compute_file_hash(self, content: str) -> str:
        """
        Compute SHA256 hash of file content.
        
        Args:
            content: File content
            
        Returns:
            SHA256 hash
        """
        return hashlib.sha256(content.encode('utf-8')).hexdigest()
    
    def is_file_changed(self, repo_id: str, file_path: str, content: str) -> bool:
        """
        Check if a file has changed since last indexing.
        
        Args:
            repo_id: Repository identifier
            file_path: Path to the file
            content: Current file content
            
        Returns:
            True if file has changed or is new
        """
        current_hash = self.compute_file_hash(content)
        cached_hash = self.get_file_hash(repo_id, file_path)
        
        if cached_hash is None:
            # New file
            return True
        
        return current_hash != cached_hash
    
    def _get_ai_explanation_key(self, repo_id: str, file_path: str) -> str:
        """Generate cache key for AI explanation."""
        return f"ai:{repo_id}:{file_path}"
    
    def get_cached_ai_explanation(self, repo_id: str, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Get cached AI explanation for a file.
        
        Args:
            repo_id: Repository identifier
            file_path: Path to the file
            
        Returns:
            Cached AI explanation data or None if not found
        """
        try:
            key = self._get_ai_explanation_key(repo_id, file_path)
            cached = self.redis.get(key)
            if cached:
                return json.loads(cached)
            return None
        except Exception as e:
            logger.info(f"AI cache read error for {file_path}: {e}")
            return None
    
    def cache_ai_explanation(self, repo_id: str, file_path: str, explanation_data: Dict[str, Any]) -> bool:
        """
        Cache AI-generated explanation for a file.
        
        Args:
            repo_id: Repository identifier
            file_path: Path to the file
            explanation_data: AI explanation data including explanation, key_functions, dependencies, vulnerabilities
            
        Returns:
            True if successful
        """
        try:
            key = self._get_ai_explanation_key(repo_id, file_path)
            self.redis.setex(key, CACHE_TTL, json.dumps(explanation_data))
            return True
        except Exception as e:
            logger.info(f"AI cache write error for {file_path}: {e}")
            return False
    
    def _get_docs_key(self, repo_id: str) -> str:
        """Generate cache key for repository documentation."""
        return f"docs:{repo_id}"
    
    def get_cached_documentation(self, repo_id: str) -> Optional[List[Dict[str, Any]]]:
        """
        Get cached repository documentation.
        
        Args:
            repo_id: Repository identifier
            
        Returns:
            Cached documentation sections or None
        """
        try:
            key = self._get_docs_key(repo_id)
            cached = self.redis.get(key)
            if cached:
                return json.loads(cached)
            return None
        except Exception as e:
            logger.info(f"Docs cache read error: {e}")
            return None
    
    def cache_documentation(self, repo_id: str, doc_sections: List[Dict[str, Any]]) -> bool:
        """
        Cache repository documentation.
        
        Args:
            repo_id: Repository identifier
            doc_sections: Documentation sections
            
        Returns:
            True if successful
        """
        try:
            key = self._get_docs_key(repo_id)
            self.redis.setex(key, CACHE_TTL, json.dumps(doc_sections))
            return True
        except Exception as e:
            logger.info(f"Docs cache write error: {e}")
            return False
    
    def invalidate_repo_cache(self, repo_id: str):
        """
        Invalidate all cache entries for a repository.
        
        Args:
            repo_id: Repository identifier
        """
        try:
            # Find all keys for this repo
            patterns = [
                f"file:{repo_id}:*",
                f"tree:{repo_id}:*",
                f"hash:{repo_id}:*",
                f"ai:{repo_id}:*",
                f"docs:{repo_id}"
            ]
            
            for pattern in patterns:
                cursor = 0
                while True:
                    cursor, keys = self.redis.scan(cursor, match=pattern, count=100)
                    if keys:
                        self.redis.delete(*keys)
                    if cursor == 0:
                        break
            
            logger.info(f"✅ Cache invalidated for repo {repo_id}")
        except Exception as e:
            logger.info(f"Cache invalidation error: {e}")
    
    def get_cache_stats(self, repo_id: str) -> Dict[str, int]:
        """
        Get cache statistics for a repository.
        
        Args:
            repo_id: Repository identifier
            
        Returns:
            Dictionary with cache statistics
        """
        try:
            stats = {
                'files': 0,
                'trees': 0,
                'hashes': 0,
                'ai_explanations': 0
            }
            
            patterns = {
                'files': f"file:{repo_id}:*",
                'trees': f"tree:{repo_id}:*",
                'hashes': f"hash:{repo_id}:*",
                'ai_explanations': f"ai:{repo_id}:*"
            }
            
            for key, pattern in patterns.items():
                cursor = 0
                count = 0
                while True:
                    cursor, keys = self.redis.scan(cursor, match=pattern, count=100)
                    count += len(keys)
                    if cursor == 0:
                        break
                stats[key] = count
            
            return stats
        except Exception as e:
            logger.info(f"Cache stats error: {e}")
            return {'files': 0, 'trees': 0, 'hashes': 0, 'ai_explanations': 0}


# Singleton instance
_cache_service = None


def get_cache_service() -> CacheService:
    """Get the cache service singleton."""
    global _cache_service
    if _cache_service is None:
        _cache_service = CacheService()
    return _cache_service

