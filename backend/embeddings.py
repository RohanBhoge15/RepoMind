"""
Embedding generation and vector database operations.
Uses HuggingFace sentence-transformers for local embeddings.
Integrates with Qdrant for vector storage and retrieval.
"""
import logging

logger = logging.getLogger(__name__)

from typing import List, Dict, Any, Optional
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter,
    FieldCondition, MatchValue, SearchRequest
)
import hashlib
from config import get_settings

settings = get_settings()


class EmbeddingService:
    """Service for generating embeddings and managing vector database."""
    
    def __init__(self):
        """Initialize embedding model and Qdrant client."""
        # Load local embedding model
        self.model = SentenceTransformer(settings.embedding_model)
        self.embedding_dim = self.model.get_sentence_embedding_dimension()
        
        # Initialize Qdrant client
        self.qdrant_client = QdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key,
        )
        
        # Ensure collection exists
        self._ensure_collection()
    
    def _ensure_collection(self):
        """Create Qdrant collection if it doesn't exist."""
        from qdrant_client.models import PayloadSchemaType
        
        collections = self.qdrant_client.get_collections().collections
        collection_names = [c.name for c in collections]
        
        if settings.qdrant_collection_name not in collection_names:
            self.qdrant_client.create_collection(
                collection_name=settings.qdrant_collection_name,
                vectors_config=VectorParams(
                    size=self.embedding_dim,
                    distance=Distance.COSINE
                )
            )
        
        # Ensure repository_id index exists (for both new and existing collections)
        try:
            self.qdrant_client.create_payload_index(
                collection_name=settings.qdrant_collection_name,
                field_name="repository_id",
                field_schema=PayloadSchemaType.INTEGER
            )
        except Exception as e:
            # Index might already exist, that's okay
            if "already exists" not in str(e).lower():
                logger.info(f"⚠️ Could not create index: {e}")
    
    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding vector for text.
        
        Args:
            text: Input text to embed
            
        Returns:
            List of floats representing the embedding vector
        """
        embedding = self.model.encode(text, convert_to_numpy=True)
        return embedding.tolist()
    
    def generate_embeddings_batch(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        """
        Generate embeddings for multiple texts in batch.
        Optimized for performance with configurable batch size.
        
        Args:
            texts: List of input texts
            batch_size: Size of processing batches (default 32 for GPU efficiency)
            
        Returns:
            List of embedding vectors
        """
        if not texts:
            return []
        
        # Use sentence-transformer's built-in batching for efficiency
        embeddings = self.model.encode(
            texts, 
            convert_to_numpy=True, 
            show_progress_bar=len(texts) > 10,  # Only show progress for larger batches
            batch_size=batch_size,
            normalize_embeddings=True  # Normalize for cosine similarity
        )
        return embeddings.tolist()
    
    def chunk_code(self, content: str, file_path: str, language: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Split code content into chunks for embedding.
        
        Args:
            content: File content
            file_path: Path to the file
            language: Programming language
            
        Returns:
            List of chunk dictionaries with metadata
        """
        lines = content.split('\n')
        chunks = []
        
        # Simple line-based chunking with overlap
        chunk_size_lines = 50  # Approximate lines per chunk
        overlap_lines = 10
        
        for i in range(0, len(lines), chunk_size_lines - overlap_lines):
            chunk_lines = lines[i:i + chunk_size_lines]
            chunk_text = '\n'.join(chunk_lines)
            
            if chunk_text.strip():  # Skip empty chunks
                chunks.append({
                    'content': chunk_text,
                    'start_line': i + 1,
                    'end_line': min(i + chunk_size_lines, len(lines)),
                    'file_path': file_path,
                    'language': language
                })
        
        return chunks
    
    def store_file_chunks(
        self,
        repository_id: int,
        file_id: int,
        file_path: str,
        content: str,
        language: Optional[str] = None
    ) -> int:
        """
        Chunk file content, generate embeddings, and store in Qdrant.
        
        Args:
            repository_id: Repository ID
            file_id: File ID
            file_path: Path to file
            content: File content
            language: Programming language
            
        Returns:
            Number of chunks stored
        """
        # Generate chunks
        chunks = self.chunk_code(content, file_path, language)
        
        if not chunks:
            return 0
        
        # Generate embeddings for all chunks
        chunk_texts = [chunk['content'] for chunk in chunks]
        embeddings = self.generate_embeddings_batch(chunk_texts)
        
        # Prepare points for Qdrant
        points = []
        for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            # Generate unique ID for chunk
            chunk_id = hashlib.md5(
                f"{repository_id}:{file_id}:{chunk['start_line']}:{chunk['end_line']}".encode()
            ).hexdigest()
            
            point = PointStruct(
                id=chunk_id,
                vector=embedding,
                payload={
                    'repository_id': repository_id,
                    'file_id': file_id,
                    'file_path': file_path,
                    'language': language,
                    'start_line': chunk['start_line'],
                    'end_line': chunk['end_line'],
                    'content': chunk['content'],
                    'content_hash': hashlib.sha256(chunk['content'].encode()).hexdigest()
                }
            )
            points.append(point)
        
        # Upload to Qdrant
        self.qdrant_client.upsert(
            collection_name=settings.qdrant_collection_name,
            points=points
        )
        
        return len(points)
    
    def prepare_chunks_for_batch(
        self,
        repository_id: int,
        file_id: int, 
        file_path: str,
        content: str,
        language: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Prepare chunks for batch processing (without generating embeddings yet).
        
        Args:
            repository_id: Repository ID
            file_id: File ID
            file_path: Path to file
            content: File content
            language: Programming language
            
        Returns:
            List of chunk dictionaries ready for batch embedding
        """
        chunks = self.chunk_code(content, file_path, language)
        
        prepared_chunks = []
        for chunk in chunks:
            chunk_id = hashlib.md5(
                f"{repository_id}:{file_id}:{chunk['start_line']}:{chunk['end_line']}".encode()
            ).hexdigest()
            
            prepared_chunks.append({
                'id': chunk_id,
                'content': chunk['content'],
                'payload': {
                    'repository_id': repository_id,
                    'file_id': file_id,
                    'file_path': file_path,
                    'language': language,
                    'start_line': chunk['start_line'],
                    'end_line': chunk['end_line'],
                    'content': chunk['content'],
                    'content_hash': hashlib.sha256(chunk['content'].encode()).hexdigest()
                }
            })
        
        return prepared_chunks
    
    def batch_store_chunks(self, all_chunks: List[Dict[str, Any]], batch_size: int = 100) -> int:
        """
        Generate embeddings and store chunks in batches for better performance.
        
        Args:
            all_chunks: List of prepared chunks from prepare_chunks_for_batch
            batch_size: Number of chunks to process at once
            
        Returns:
            Total number of chunks stored
        """
        if not all_chunks:
            return 0
        
        total_stored = 0
        
        # Process in batches
        for i in range(0, len(all_chunks), batch_size):
            batch = all_chunks[i:i + batch_size]
            
            # Generate embeddings for batch
            texts = [chunk['content'] for chunk in batch]
            embeddings = self.generate_embeddings_batch(texts)
            
            # Create points
            points = []
            for chunk, embedding in zip(batch, embeddings):
                point = PointStruct(
                    id=chunk['id'],
                    vector=embedding,
                    payload=chunk['payload']
                )
                points.append(point)
            
            # Upload batch to Qdrant
            self.qdrant_client.upsert(
                collection_name=settings.qdrant_collection_name,
                points=points
            )
            
            total_stored += len(points)
            logger.info(f"📦 Stored batch {i//batch_size + 1}: {len(points)} chunks (total: {total_stored})")
        
        return total_stored
    
    def search_similar_chunks(
        self,
        query: str,
        repository_id: int,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Search for code chunks similar to query.
        
        Args:
            query: Search query
            repository_id: Repository ID to search within
            limit: Maximum number of results
            
        Returns:
            List of matching chunks with metadata and scores
        """
        # Generate query embedding
        query_embedding = self.generate_embedding(query)
        
        # Search in Qdrant with repository filter
        search_result = self.qdrant_client.search(
            collection_name=settings.qdrant_collection_name,
            query_vector=query_embedding,
            query_filter=Filter(
                must=[
                    FieldCondition(
                        key="repository_id",
                        match=MatchValue(value=repository_id)
                    )
                ]
            ),
            limit=limit
        )
        
        # Format results
        results = []
        for hit in search_result:
            results.append({
                'file_path': hit.payload['file_path'],
                'file_id': hit.payload['file_id'],
                'language': hit.payload.get('language'),
                'start_line': hit.payload['start_line'],
                'end_line': hit.payload['end_line'],
                'content': hit.payload['content'],
                'score': hit.score
            })
        
        return results
    
    def delete_repository_chunks(self, repository_id: int):
        """
        Delete all chunks for a repository.
        
        Args:
            repository_id: Repository ID
        """
        self.qdrant_client.delete(
            collection_name=settings.qdrant_collection_name,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="repository_id",
                        match=MatchValue(value=repository_id)
                    )
                ]
            )
        )


# Global instance
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Get or create global embedding service instance."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service

