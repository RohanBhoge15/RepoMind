"""
Centralized logging configuration for RepoMind.
Provides structured logging with proper levels and formatting.
"""
import logging
import sys
from datetime import datetime
from typing import Optional

def setup_logger(name: str = __name__, level: str = "INFO") -> logging.Logger:
    """
    Configure and return a logger with proper formatting.

    Args:
        name: Logger name (typically __name__)
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)

    # Prevent adding handlers multiple times
    if logger.handlers:
        return logger

    logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Create console handler
    handler = logging.StreamHandler(sys.stdout)

    # Create formatter with structured output
    formatter = logging.Formatter(
        fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    handler.setFormatter(formatter)
    logger.addHandler(handler)

    return logger

# Create default logger for convenience
logger = setup_logger()
