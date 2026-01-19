# Bedrock Model Comparison Tool

A tool to execute and compare 60+ AWS Bedrock models in parallel.

Modern LLM comparison platform built with React (Next.js) + FastAPI.

> **Note**: This project was primarily developed with [Claude Opus 4.5](https://www.anthropic.com/claude/opus) using [Claude Code](https://claude.ai/claude-code).

## Features

- **60+ Models in Parallel** - Claude, Nova, Llama, Gemma, Qwen, and more
- **Real-time Streaming** - Results displayed as they arrive
- **Automatic Cost Calculation** - Calculates actual cost from input/output tokens
- **Sorting** - Sort by time, cost, or status
- **Detail Modal** - Click to view complete response
- **Markdown Support** - Beautiful rendering of Markdown responses
- **Auto Retry** - Automatic retry on rate limits
- **Modern UI** - Clean design with Tailwind CSS

### Advanced Features

- **Debate Mode** - Conduct debates between two models
- **Conductor Mode** - One model orchestrates other models
- **Autonomous Conductor Mode** - AI automatically generates and refines code iteratively
- **Workspace Feature** - Project management with code-server integration
- **Background Execution** - Continue execution even after closing the page
- **Image Generation** - Generate images with Titan Image Generator and Nova Canvas
- **Video Generation** - Generate videos with Nova Reel
- **Auto Route** - Automatically select the best model for your task
- **Benchmark** - Run standardized benchmarks across models
- **Analytics Dashboard** - Visualize model performance and costs
- **Explainability** - Understand model reasoning

## Project Structure

```
model-compare/
├── api/                        # FastAPI Backend
│   ├── main.py                 # API Entry Point
│   ├── routers/                # API Routers
│   │   ├── execute.py          # Parallel Execution
│   │   ├── debate.py           # Debate Mode
│   │   ├── conductor.py        # Conductor Mode
│   │   ├── workspace.py        # Workspace & Autonomous Conductor
│   │   ├── image.py            # Image Generation
│   │   ├── video.py            # Video Generation
│   │   ├── auto_route.py       # Auto Model Selection
│   │   ├── benchmark.py        # Benchmarking
│   │   ├── analytics.py        # Analytics
│   │   ├── explainability.py   # Model Explainability
│   │   ├── models.py           # Model List
│   │   └── settings.py         # Settings Management
│   ├── services/               # Business Logic
│   │   ├── bedrock_executor.py # Bedrock API Client
│   │   ├── pricing.py          # Cost Calculation
│   │   ├── analytics.py        # Analytics Service
│   │   ├── auto_router.py      # Auto Routing Logic
│   │   ├── benchmark.py        # Benchmark Service
│   │   ├── explainability.py   # Explainability Service
│   │   ├── image_generator.py  # Image Generation Service
│   │   └── video_generator.py  # Video Generation Service
│   ├── models/                 # Data Models
│   │   ├── constants.py        # Available Models & Regions
│   │   ├── requests.py         # Request Models
│   │   └── responses.py        # Response Models
│   ├── config/                 # Configuration
│   └── requirements.txt
├── frontend/                   # Next.js Frontend
│   ├── app/
│   │   ├── page.tsx            # Main Page
│   │   ├── layout.tsx          # App Layout
│   │   └── globals.css         # Global Styles
│   ├── components/
│   │   ├── views/              # Main Views
│   │   │   ├── CodeEditorView.tsx      # Workspace & Autonomous Conductor
│   │   │   ├── DebateView.tsx          # Debate Mode
│   │   │   ├── ConductorView.tsx       # Conductor Mode
│   │   │   ├── BenchmarkView.tsx       # Benchmark
│   │   │   ├── AnalyticsDashboard.tsx  # Analytics
│   │   │   ├── ExplainabilityView.tsx  # Explainability
│   │   │   ├── ImageGenerationView.tsx # Image Generation
│   │   │   ├── VideoGenerationView.tsx # Video Generation
│   │   │   └── AutoRouteView.tsx       # Auto Route
│   │   ├── layout/             # Layout Components
│   │   │   ├── Sidebar.tsx     # Navigation Sidebar
│   │   │   └── SettingsPanel.tsx # Settings Panel
│   │   ├── modals/             # Modal Components
│   │   │   ├── DetailModal.tsx      # Response Detail
│   │   │   ├── ComparisonModal.tsx  # Model Comparison
│   │   │   └── SettingsModal.tsx    # Settings
│   │   ├── results/            # Result Components
│   │   │   ├── ResultCard.tsx       # Text Result Card
│   │   │   ├── ResultsView.tsx      # Results Grid
│   │   │   ├── ImageResultCard.tsx  # Image Result Card
│   │   │   └── VideoResultCard.tsx  # Video Result Card
│   │   ├── forms/              # Form Components
│   │   └── common/             # Shared Components
│   └── types/                  # TypeScript Types
│       ├── index.ts            # Main Types
│       └── analytics.ts        # Analytics Types
├── docker/                     # Docker Configuration
│   └── code-server/            # code-server Docker Setup
├── tasks/                      # Background Task State
├── start.sh                    # Startup Script
├── stop.sh                     # Stop Script
└── docker-compose.yml          # Docker Compose Config
```

## Quick Start

### Prerequisites

- Python 3.14+
- Node.js 18+
- AWS Bedrock Access
- code-server (optional, for workspace feature)

### One-Command Start (Recommended)

```bash
# Start all services
./start.sh

# Stop all services
./stop.sh
# or press Ctrl+C while running
```

This will start:
- **API**: http://localhost:8000
- **Frontend**: http://localhost:3000
- **code-server**: http://localhost:8443

### Manual Setup

#### 1. Backend Setup

```bash
cd api

# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Configure environment variables
cp .env.example .env
# Edit .env file to set AWS credentials

# Install dependencies
pip install -r requirements.txt

# Start server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

#### 3. code-server (Optional)

```bash
# Install
npm install -g code-server
# or
brew install code-server

# Start
code-server --bind-addr 0.0.0.0:8443 --auth none ./workspaces
```

## Usage

### Basic Model Comparison

1. **Select Models** - Check the models you want to compare
2. **Enter Prompt** - Type your prompt
3. **Execute** - View results in real-time
4. **Compare Results** - Sort and filter to compare

### Debate Mode

Conduct debates between two models to explore different perspectives on a topic.

### Conductor Mode

One model acts as a "conductor" directing other models and integrating their results.

- **delegate**: Split tasks and assign to each worker
- **evaluate**: Evaluate and rank all worker results
- **synthesize**: Synthesize all worker responses

### Autonomous Conductor Mode (Workspace Feature)

AI automatically generates and refines code to complete a project.

1. **Create/Select Workspace**
2. **Enter Task** (e.g., "Create a Todo app")
3. **Select Conductor Model**
4. **Generate Plan** → Review plan → **Execute**
5. **Background Execution** - Monitor progress in real-time
6. **Check in VSCode** - View and edit generated code in code-server

### Image Generation

Generate images using:
- **Titan Image Generator v2** - Amazon's image generation model
- **Nova Canvas** - Advanced image generation

### Video Generation

Generate videos using:
- **Nova Reel** - Amazon's video generation model
- **Nova Reel v1.1** - Latest version

### Auto Route

Automatically select the best model based on your task requirements. The system analyzes your prompt and routes it to the optimal model.

### Benchmark

Run standardized benchmarks across multiple models to compare performance, quality, and cost.

### Analytics Dashboard

Visualize:
- Model performance over time
- Cost analysis
- Response quality metrics
- Usage patterns

## Supported Models (60+)

### Anthropic Claude
- Claude 4.5 Series (Sonnet/Opus/Haiku)
- Claude 4 Series (Sonnet/Opus/4.1)
- Claude 3.7 Sonnet
- Claude 3.5 Series (Sonnet v1/v2, Haiku)
- Claude 3 Series (Sonnet/Opus/Haiku)

### Amazon
- Nova Premier/Pro/Lite/Micro
- Nova 2 Lite/Pro
- Titan Image Generator v2
- Nova Canvas (Image)
- Nova Reel (Video)

### Meta Llama
- Llama 4 (Scout 17B/Maverick 17B)
- Llama 3.3 70B
- Llama 3.2 (1B/3B/11B/90B)
- Llama 3.1 (8B/70B)
- Llama 3 (8B/70B)

### Mistral AI
- Mistral Large 3
- Mistral Large/Small 24.02
- Mixtral 8x7B
- Mistral 7B
- Ministral (3B/8B/14B)
- Magistral Small
- Voxtral (Mini 3B/Small 24B)

### DeepSeek
- DeepSeek-R1

### Cohere
- Command R+
- Command R

### AI21 Labs
- Jamba 1.5 Large/Mini

### NVIDIA
- Nemotron Nano 3 30B
- Nemotron Nano 12B/9B v2

### Google
- Gemma 3 (4B/12B/27B)

### Qwen
- Qwen3 VL 235B
- Qwen3 Next 80B
- Qwen3 32B
- Qwen3 Coder 30B

### OpenAI
- GPT OSS 120B/20B

### Others
- MiniMax M2
- Kimi K2 Thinking (Moonshot AI)

## Tech Stack

### Backend
- **FastAPI** - High-performance Python web framework
- **boto3** - AWS SDK for Python
- **uvicorn** - ASGI server
- **python-multipart** - Multipart form data support

### Frontend
- **Next.js 16** - React framework
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Utility-first CSS
- **react-markdown** - Markdown rendering
- **rehype-highlight** - Syntax highlighting
- **remark-gfm** - GitHub Flavored Markdown

### Development Environment
- **code-server** - Browser-based VSCode
- **Docker** - Containerization

## API Endpoints

### Models
- `GET /api/models` - List available models

### Execution
- `POST /api/execute` - Parallel execution
- `POST /api/debate` - Debate mode
- `POST /api/conductor` - Conductor mode
- `POST /api/auto-route` - Auto model selection

### Media Generation
- `POST /api/image/generate` - Image generation
- `POST /api/video/generate` - Video generation

### Workspace
- `GET /api/workspace/list` - List workspaces
- `POST /api/workspace/create` - Create workspace
- `GET /api/workspace/{name}/files` - List files
- `POST /api/workspace/{name}/autonomous-conductor/plan` - Generate plan
- `POST /api/workspace/{name}/autonomous-conductor/background` - Background execution

### Task Management
- `GET /api/workspace/tasks/list` - List tasks
- `GET /api/workspace/tasks/{id}` - Get task status
- `POST /api/workspace/tasks/{id}/cancel` - Cancel task
- `POST /api/workspace/tasks/{id}/resume` - Resume task

### Analytics & Benchmark
- `GET /api/analytics` - Get analytics data
- `POST /api/benchmark` - Run benchmark

### Settings
- `GET /api/settings` - Get settings
- `POST /api/settings` - Update settings

## Development

### Backend Development

```bash
cd api
source .venv/bin/activate

# Add dependencies
pip install <package-name>
pip freeze > requirements.txt

# Start server (hot reload)
uvicorn main:app --reload
```

### Frontend Development

```bash
cd frontend

# Add dependencies
npm install <package-name>

# Build
npm run build

# Lint
npm run lint
```

## Troubleshooting

### AWS Authentication Error

```bash
# Check credentials
aws sts get-caller-identity

# Check environment variables
echo $AWS_DEFAULT_REGION
```

### Port Already in Use

```bash
# Check which process is using the port
lsof -i :8000
lsof -i :3000
lsof -i :8443

# Stop all services
./stop.sh
```

### code-server Not Installed

```bash
# Install via npm
npm install -g code-server

# Or via Homebrew (macOS)
brew install code-server
```

## License

MIT

## Contributing

Issues and Pull Requests are welcome!

## Author

[@kaizawap](https://github.com/kaizawa97)

## References

- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Claude Code](https://claude.ai/claude-code)
- [Anthropic](https://www.anthropic.com/)
