import os

def ensure_directory_exists(directory_path: str) -> None:
    """Utility to ensure that a target directory exists."""
    if not os.path.exists(directory_path):
        os.makedirs(directory_path, exist_ok=True)
