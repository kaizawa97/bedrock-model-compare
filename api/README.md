# Bedrock Model Comparison - API Server

Backend API built with FastAPI. Execute and compare 60+ Bedrock models in parallel.

## Quick Start (uv recommended)

```bash
cd api

# 1. Install dependencies
make install-uv

# 2. Start server
make run-uv
```

Or using shell script:

```bash
cd api
./start_with_uv.sh
```

## Setup (Detailed)

### Using uv (Recommended)

```bash
cd api

# Install dependencies
uv sync

# Start server
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Using pip

```bash
cd api

# Install dependencies
pip install -r requirements.txt

# Start server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Environment Variables

Create a `.env` file:

```bash
cp .env.example .env
# Edit .env to set your AWS credentials
```

AWS credentials can be configured via:
- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- AWS credentials file (`~/.aws/credentials`)
- AWS profile (`AWS_PROFILE`)
- Bearer token (`AWS_BEARER_TOKEN_BEDROCK`)

## Running

### Using Makefile

```bash
# Start with uv (recommended)
make run-uv

# Auto-detect (uses uv if available, otherwise python)
make run

# Run CLI tool test
make run-cli
```

### Direct execution

```bash
# With uv
uv run uvicorn main:app --reload

# With python
uvicorn main:app --reload
```

Server starts at `http://localhost:8000`

## API Endpoints

### Model Execution
- `GET /api/models` - List available models (60+)
- `GET /api/regions` - List available regions
- `POST /api/execute` - Parallel model execution (SSE streaming)

### Advanced Features
- `POST /api/debate` - Debate mode between two models
- `POST /api/conductor` - Conductor mode (one model orchestrates others)
- `POST /api/auto-route` - Auto model selection

### Media Generation
- `POST /api/image/generate` - Image generation
- `POST /api/video/generate` - Video generation

### Workspace
- `GET /api/workspace/list` - List workspaces
- `POST /api/workspace/create` - Create workspace
- `POST /api/workspace/{name}/autonomous-conductor/plan` - Generate plan
- `POST /api/workspace/{name}/autonomous-conductor/background` - Background execution

### Others
- `GET /health` - Health check

## Tech Stack

- FastAPI - Web framework
- boto3 - AWS SDK
- uvicorn - ASGI server
- uv - Fast Python package manager

## Supported Models

- Anthropic Claude 4.5/4/3.7/3.5/3 Series
- Amazon Nova (Premier/Pro/Lite/Micro)
- Meta Llama 4/3.3/3.2/3.1 Series
- Mistral AI (Large/Small/Mixtral/Ministral)
- DeepSeek-R1
- NVIDIA Nemotron
- Google Gemma 3
- Qwen 3
- OpenAI OSS
- MiniMax M2
- Moonshot Kimi K2
- Cohere Command R+/R
- AI21 Labs Jamba

60+ models available for parallel execution.
