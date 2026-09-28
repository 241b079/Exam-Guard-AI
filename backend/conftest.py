import os
import sys

# Ensure testing mode is set for NullPool on asyncpg event loops
os.environ["TESTING"] = "1"

# Ensure backend directory is in python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

