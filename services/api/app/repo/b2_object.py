"""On-demand object body reads/writes and prefix operations.

Kept in its own module because `b2_client.py` is at the 300-line ceiling
enforced by `tests/test_structure.py`. boto3/botocore stays confined to the
repo/ layer; the cached S3 client is reused from `b2_client` for connection
pooling.
"""

import io

from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings
from app.repo.b2_client import get_s3_client
from app.repo.list_cache import invalidate as _invalidate_list_cache


def get_object_bytes(key: str) -> bytes:
    """Download an object's full body into memory.

    Buffers the whole object, so callers MUST size-guard before calling (see
    `service.files.get_file_detail`). Raises RuntimeError on any S3 failure,
    including a not-found object — callers that need to distinguish "missing"
    should `head` first via `get_file_metadata`.

    The streaming `.read()` stays inside the try: on a large object it can fail
    mid-stream with a BotoCoreError (e.g. ReadTimeoutError, ResponseStreamingError)
    that is not a ClientError, and letting it escape would break the
    RuntimeError contract the caller's 502 mapping relies on.
    """
    client = get_s3_client()
    try:
        response = client.get_object(Bucket=settings.b2_bucket_name, Key=key)
        return response["Body"].read()
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 get_object failed for '{key}': {e}") from e


def put_bytes(key: str, data: bytes, content_type: str) -> None:
    """Write raw bytes to B2 at `key`. Raises RuntimeError on failure.

    Invalidates the shared bucket-listing cache so the new object shows up in
    the Library/stats immediately (mirrors `b2_client.upload_file`).
    """
    client = get_s3_client()
    try:
        client.put_object(
            Bucket=settings.b2_bucket_name,
            Key=key,
            Body=io.BytesIO(data),
            ContentType=content_type,
        )
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 put failed for '{key}': {e}") from e
    _invalidate_list_cache()


def list_prefix_objects(prefix: str) -> list[dict]:
    """Return every object dict (Key/Size/LastModified) under `prefix`.

    Paginates so callers see the whole prefix, not just the first 1000 keys.
    Reads B2 directly (not the shared full-bucket cache) because slide prefixes
    are small and callers want fresh results right after a write.
    """
    client = get_s3_client()
    contents: list[dict] = []
    kwargs: dict = {
        "Bucket": settings.b2_bucket_name,
        "Prefix": prefix,
        "MaxKeys": 1000,
    }
    try:
        while True:
            response = client.list_objects_v2(**kwargs)
            contents.extend(response.get("Contents", []))
            if not response.get("IsTruncated"):
                break
            kwargs["ContinuationToken"] = response["NextContinuationToken"]
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 list failed for '{prefix}': {e}") from e
    return contents


def delete_prefix(prefix: str) -> int:
    """Delete every object under `prefix`. Returns the count deleted.

    SCOPED delete: callers MUST pass a concrete, non-empty slide prefix such as
    `slides/<id>/`. An empty prefix would target the whole bucket, so it is
    rejected here as a hard guard against an accidental bucket-wide wipe.
    Raises RuntimeError on any S3 failure.
    """
    if not prefix or not prefix.endswith("/"):
        raise ValueError("delete_prefix requires a concrete prefix ending in '/'")
    objects = list_prefix_objects(prefix)
    if not objects:
        return 0
    client = get_s3_client()
    deleted = 0
    try:
        for start in range(0, len(objects), 1000):
            batch = objects[start : start + 1000]
            client.delete_objects(
                Bucket=settings.b2_bucket_name,
                Delete={"Objects": [{"Key": o["Key"]} for o in batch]},
            )
            deleted += len(batch)
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 delete failed for '{prefix}': {e}") from e
    _invalidate_list_cache()
    return deleted
