# Bedrock Model Comparison - Frontend

Frontend built with Next.js + TypeScript + Tailwind CSS

## Setup

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in your browser

## Starting the Backend

In a separate terminal:

```bash
cd api
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- react-markdown
- rehype-highlight
- remark-gfm

## Development

```bash
npm run dev    # Development server
npm run build  # Build for production
npm run start  # Production server
npm run lint   # Run linter
```

## Project Structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Main page
│   ├── layout.tsx          # App layout
│   └── globals.css         # Global styles
├── components/
│   ├── views/              # Main view components
│   │   ├── CodeEditorView.tsx      # Workspace & Autonomous Conductor
│   │   ├── DebateView.tsx          # Debate mode
│   │   ├── ConductorView.tsx       # Conductor mode
│   │   ├── BenchmarkView.tsx       # Benchmark
│   │   ├── AnalyticsDashboard.tsx  # Analytics
│   │   ├── ImageGenerationView.tsx # Image generation
│   │   └── VideoGenerationView.tsx # Video generation
│   ├── layout/             # Layout components
│   ├── modals/             # Modal components
│   └── results/            # Result display components
└── types/                  # TypeScript type definitions
```
