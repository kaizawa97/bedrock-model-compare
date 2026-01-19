.PHONY: help install install-uv run run-uv run-cli clean test

help:
	@echo "Bedrock Parallel Executor - Make Commands"
	@echo ""
	@echo "Usage:"
	@echo "  make install-uv    - Install dependencies with uv (recommended)"
	@echo "  make run-uv        - Start web server with uv (recommended)"
	@echo "  make install       - Install dependencies with pip"
	@echo "  make run           - Start web server (uv or python)"
	@echo "  make run-cli       - Run CLI tool example"
	@echo "  make clean         - Clean up generated files"
	@echo ""

install-uv:
	@echo "Installing dependencies with uv..."
	uv sync
	@echo "Installation complete!"

install:
	@echo "Installing dependencies with pip..."
	pip install -r requirements.txt
	@echo "Installation complete!"

run-uv:
	@echo "Starting web server with uv..."
	@echo "Open http://localhost:8000 in your browser"
	@echo ""
	uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload

run:
	@echo "Starting web server..."
	@echo "Open http://localhost:8000 in your browser"
	@echo ""
	@if command -v uv >/dev/null 2>&1; then \
		uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload; \
	else \
		uvicorn main:app --host 0.0.0.0 --port 8000 --reload; \
	fi

run-cli:
	@echo "Running CLI tool test..."
	@if command -v uv >/dev/null 2>&1; then \
		uv run python bedrock_executor.py \
			--model-id "anthropic.claude-3-sonnet-20240229-v1:0" \
			--prompt "Hello, please introduce yourself briefly" \
			--count 5; \
	else \
		python bedrock_executor.py \
			--model-id "anthropic.claude-3-sonnet-20240229-v1:0" \
			--prompt "Hello, please introduce yourself briefly" \
			--count 5; \
	fi

clean:
	@echo "Cleaning up..."
	rm -rf __pycache__
	rm -rf .venv
	rm -rf *.pyc
	rm -rf .pytest_cache
	rm -f results.json
	@echo "Cleanup complete!"
