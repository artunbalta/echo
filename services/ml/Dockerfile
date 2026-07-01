# syntax=docker/dockerfile:1
# ECHO ML service — the Python/FastAPI learning engine (persona posterior, reward head, gate,
# autonomy). This is what makes the LIVE world actually measure: the realtime server and the web
# app forward every BehavioralEvent here (POST /observe/behavioral → ingest → persona.observe).
#
# Build from the repo ROOT as context (so the path is services/ml/...):
#   docker build -f services/ml/Dockerfile -t echo-ml .
#   docker run -p 8000:8000 -e PORT=8000 -e ML_SERVICE_TOKEN=... echo-ml
# Hosts that inject $PORT (Render/Railway/Fly) work out of the box. /health needs no auth
# (the health check); every other endpoint requires Authorization: Bearer $ML_SERVICE_TOKEN.

FROM python:3.11-slim AS run
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Python deps first for a cached layer. (Voyage embeddings work via the httpx REST path with no
# extra SDK — see embeddings.py — so requirements.txt is the whole runtime dependency set.)
COPY services/ml/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

# The package — including echo_ml/artifacts/measurement.npz, the learned W anchors that ship in
# the image so the posterior math runs identically in prod and in tests.
COPY services/ml/echo_ml ./echo_ml

EXPOSE 8000
# Render injects $PORT; bind to it (default 8000 for local `docker run`). Entry = echo_ml.app:app.
CMD ["sh", "-c", "uvicorn echo_ml.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
