from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Standard B2 env var names (see docs/SECURITY.md). The S3 endpoint is
    # derived from the region rather than configured directly, so a clone only
    # needs the four B2_* credentials plus the region. No region is hardcoded in
    # source: B2_REGION is required (validated at startup in main.py) and its
    # value is supplied by .env (see .env.example, which ships us-west-004).
    b2_region: str = ""
    b2_application_key_id: str = ""
    b2_application_key: str = ""
    b2_bucket_name: str = ""
    # Optional. Only used to build public object URLs for public buckets; the
    # app runs without it.
    b2_public_url_base: str = ""

    api_port: int = 8000
    # Interactive API docs (/docs, /redoc, /openapi.json). On by default for
    # local dev and starter-kit exploration; set false to hide the full API
    # surface in production.
    enable_docs: bool = True
    # Explicit allowlist by default — covers Next on :3000 and the
    # fallback :3001 it picks if 3000 is busy. Production deploys should
    # override with the exact frontend origin.
    api_cors_origins: str = "http://localhost:3000,http://localhost:3001"
    # Optional dev-only escape hatch: a regex that matches additional
    # allowed origins. Empty by default — set this to e.g.
    # `^http://localhost:\d+$` to accept any localhost port without
    # listing each one. NEVER ship this to production.
    api_cors_origin_regex: str = ""

    # Upload limits. Whole-slide images are large (Aperio .svs / TIFF routinely
    # run 1-4 GB), so the ceiling is generous. Uploads go browser-direct to B2
    # via a presigned PUT, so a big slide never buffers through the API; for
    # slides beyond this size use S3 multipart (see docs/features/slide-ingest.md).
    max_file_size: int = 5 * 1024 * 1024 * 1024  # 5 GB
    # TTL for the presigned PUT the browser uploads directly to B2 with. Long
    # enough for a big file on a slow link, short enough that a leaked URL is a
    # narrow, single-key, single-size window.
    presign_upload_expiry_seconds: int = 900  # 15 minutes

    # Optional confinement for key-addressed reads/deletes. Empty by default so
    # the by-key routes accept any key shape (they deliberately support nested
    # folders and reserved-word segments). Point a fork at a bucket shared with
    # other data? Set to e.g. "uploads/" to restrict all key ops to app uploads.
    allowed_key_prefix: str = ""

    # Full-bucket listing cache (repo/list_cache.py). Both /files and
    # /files/stats need every object, and paginating a 16k-object bucket takes
    # ~8-20s, so one scan is shared. Entries older than the TTL are still
    # served *immediately* while a background thread refreshes them
    # (stale-while-revalidate), so only the very first scan can make a user
    # wait. Uploads and deletes invalidate the cache outright, so the app's own
    # writes are never served stale — only bucket changes made elsewhere can lag
    # by up to this TTL.
    list_cache_ttl_seconds: float = 300.0
    # Scan the bucket once at startup so the first page view doesn't pay for the
    # cold scan. Set false for offline dev or when startup must not touch B2.
    warm_list_cache_on_startup: bool = True

    # Rate limiting (per client IP, per 60s window). In-process per replica —
    # documented in docs/RELIABILITY.md; horizontal scaling needs a shared
    # store (e.g. Redis). Writes/downloads get the tighter cap.
    rate_limit_per_minute: int = 120
    # Covers uploads, deletes, downloads and previews — kept generous enough
    # that a normal browsing/upload session doesn't trip it.
    rate_limit_write_per_minute: int = 60

    # Small durable counters (downloads, etc). Relative paths resolve against
    # the repo root (see repo/counter.py). Point at a persistent volume in
    # production if you care about surviving restarts.
    #
    # It must stay OUTSIDE services/api/: that is the directory `uvicorn
    # --reload` watches in dev, so a counter file there means every download
    # writes into the reloader's watch tree. Today uvicorn only restarts for
    # `*.py`, so the writes surface as misleading "N changes detected" log noise
    # on every download — but a single added `--reload-include` would turn a
    # normal user action into an API restart that drops in-flight requests.
    download_count_file: str = ".data/download_count.json"

    # --- WSI feature-extraction pipeline (see docs/features/feature-extraction.md) ---
    # Inference device: auto (CUDA -> Apple MPS -> CPU), or force cpu/cuda/mps.
    # Auto-detect never hard-requires a GPU; CPU is the safe default.
    extract_device: str = "auto"
    # Finite, selectable MIL bag labels for the weakly-supervised workflow. The
    # create/edit forms render these as a Select (never free text).
    mil_bag_labels: str = "tumor,normal,unknown"
    # Where torchvision caches the ResNet50 encoder weights (~100 MB, downloaded
    # once). Empty -> torchvision's default (services/api/.torch_cache, gitignored).
    extract_model_cache_dir: str = ""
    # Freely-redistributable ~1.9 MB Aperio test slide used by the "sample slide"
    # ingest option so the demo tiles + extracts in seconds on CPU.
    sample_slide_url: str = (
        "https://openslide.cs.cmu.edu/download/openslide-testdata/"
        "Aperio/CMU-1-Small-Region.svs"
    )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def b2_endpoint(self) -> str:
        # B2's S3-compatible endpoint is fully determined by the region, so it is
        # derived here rather than stored — no hardcoded region lives in the
        # source, and a clone configures only B2_REGION.
        return f"https://s3.{self.b2_region}.backblazeb2.com"

    @property
    def bag_label_options(self) -> list[str]:
        return [label.strip() for label in self.mil_bag_labels.split(",") if label.strip()]

    @property
    def cors_origins(self) -> list[str]:
        # Drop empties so a trailing comma or API_CORS_ORIGINS="" doesn't yield
        # a stray "" origin.
        return [o.strip() for o in self.api_cors_origins.split(",") if o.strip()]


settings = Settings()
