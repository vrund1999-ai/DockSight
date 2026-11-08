# One image, three roles (pipeline job, API, Streamlit lab), selected by the container command.
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies first so code changes don't bust the dependency layer.
COPY pyproject.toml ./
RUN mkdir docksight && touch docksight/__init__.py \
    && pip install ".[ml,streamlit]" \
    && rm -rf docksight

COPY docksight ./docksight
COPY streamlit_app.py ./
RUN pip install --no-deps .

RUN useradd --create-home --uid 10001 app && mkdir -p /app/artifacts && chown -R app /app
USER app

ENV DOCKSIGHT_ARTIFACTS_DIR=/app/artifacts
EXPOSE 8000 8501

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["uvicorn", "docksight.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
