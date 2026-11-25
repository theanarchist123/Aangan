FROM python:3.12-slim

RUN pip install --no-cache-dir uv
WORKDIR /app

# Dependencies first so rebuilds are fast when only code changes.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY app ./app
COPY tools ./tools

ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 PORT=8000
EXPOSE 8000

# --proxy-headers: the host's load balancer sits in front, so per-user rate limits must read the real client address.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
