from typing import Optional, Set, Dict
import time
import redis.asyncio as aioredis
from app.core.config import settings
from app.core.logging import logger

redis_client: Optional[aioredis.Redis] = None

# Fallback in-memory session store when Redis server is unreachable
_memory_tokens: Dict[str, str] = {}  # key -> status ("valid")
_memory_expires: Dict[str, float] = {}  # key -> timestamp
_memory_user_sets: Dict[str, Set[str]] = {}  # user_id -> set of jtis


async def get_redis_client() -> aioredis.Redis:
    global redis_client
    if redis_client is None:
        redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=2.0,
            socket_connect_timeout=2.0
        )
    return redis_client


async def close_redis_connection():
    global redis_client
    if redis_client is not None:
        try:
            await redis_client.close()
        except Exception:
            pass
        redis_client = None


class RedisSessionService:
    @staticmethod
    def _make_key(user_id: str, jti: str) -> str:
        return f"refresh_token:{user_id}:{jti}"

    @staticmethod
    def _make_user_set_key(user_id: str) -> str:
        return f"user_tokens:{user_id}"

    @classmethod
    async def store_refresh_token(cls, user_id: str, jti: str, expire_seconds: int) -> None:
        token_key = cls._make_key(user_id, jti)
        try:
            client = await get_redis_client()
            user_set_key = cls._make_user_set_key(user_id)
            async with client.pipeline(transaction=True) as pipe:
                pipe.set(token_key, "valid", ex=expire_seconds)
                pipe.sadd(user_set_key, jti)
                pipe.expire(user_set_key, expire_seconds)
                await pipe.execute()
        except Exception as e:
            logger.warning(f"Redis unavailable ({e}). Using in-memory fallback for token storage.")
            _memory_tokens[token_key] = "valid"
            _memory_expires[token_key] = time.time() + expire_seconds
            if user_id not in _memory_user_sets:
                _memory_user_sets[user_id] = set()
            _memory_user_sets[user_id].add(jti)

    @classmethod
    async def is_refresh_token_valid(cls, user_id: str, jti: str) -> bool:
        token_key = cls._make_key(user_id, jti)
        try:
            client = await get_redis_client()
            val = await client.get(token_key)
            if val is not None:
                return val == "valid"
        except Exception as e:
            logger.warning(f"Redis unavailable ({e}). Using in-memory fallback for token validation.")

        # Check memory fallback
        if token_key in _memory_tokens:
            exp = _memory_expires.get(token_key, 0)
            if time.time() < exp:
                return _memory_tokens[token_key] == "valid"
            else:
                # Expired
                _memory_tokens.pop(token_key, None)
                _memory_expires.pop(token_key, None)
        return False

    @classmethod
    async def revoke_refresh_token(cls, user_id: str, jti: str) -> None:
        token_key = cls._make_key(user_id, jti)
        try:
            client = await get_redis_client()
            user_set_key = cls._make_user_set_key(user_id)
            async with client.pipeline(transaction=True) as pipe:
                pipe.delete(token_key)
                pipe.srem(user_set_key, jti)
                await pipe.execute()
        except Exception:
            pass

        # Always clear memory store as well
        _memory_tokens.pop(token_key, None)
        _memory_expires.pop(token_key, None)
        if user_id in _memory_user_sets:
            _memory_user_sets[user_id].discard(jti)

    @classmethod
    async def revoke_all_user_tokens(cls, user_id: str) -> None:
        user_set_key = cls._make_user_set_key(user_id)
        try:
            client = await get_redis_client()
            jtis = await client.smembers(user_set_key)
            if jtis:
                token_keys = [cls._make_key(user_id, jti) for jti in jtis]
                async with client.pipeline(transaction=True) as pipe:
                    pipe.delete(*token_keys)
                    pipe.delete(user_set_key)
                    await pipe.execute()
            else:
                await client.delete(user_set_key)
        except Exception:
            pass

        # Clear memory store for user
        if user_id in _memory_user_sets:
            for jti in _memory_user_sets[user_id]:
                token_key = cls._make_key(user_id, jti)
                _memory_tokens.pop(token_key, None)
                _memory_expires.pop(token_key, None)
            _memory_user_sets.pop(user_id, None)
