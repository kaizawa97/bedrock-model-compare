"""
ワークスペース管理エンドポイント
"""
import os
import re
import json
import shutil
import zipfile
import asyncio
import uuid
import threading
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from models.requests import WorkspaceCreateRequest, WorkspaceTaskRequest
from services.bedrock_executor import BedrockParallelExecutor

router = APIRouter(prefix="/api/workspace", tags=["workspace"])

# ワークスペースのベースパス
WORKSPACE_BASE_PATH = Path(__file__).parent.parent.parent / "workspaces"
CODE_SERVER_URL = "http://localhost:8443"
TASKS_DIR = Path(__file__).parent.parent.parent / "tasks"


class TaskManager:
    """バックグラウンドタスクを管理するクラス"""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.running_tasks: Dict[str, asyncio.Task] = {}
        self.task_locks: Dict[str, threading.Lock] = {}
        self._log_locks: Dict[str, threading.Lock] = {}  # ログファイル用のロック
        self._log_locks_lock = threading.Lock()  # ロック辞書へのアクセス用
        TASKS_DIR.mkdir(parents=True, exist_ok=True)

    def _get_log_lock(self, task_id: str) -> threading.Lock:
        """タスクIDに対応するログ用ロックを取得（なければ作成）"""
        with self._log_locks_lock:
            if task_id not in self._log_locks:
                self._log_locks[task_id] = threading.Lock()
            return self._log_locks[task_id]

    def _get_task_file(self, task_id: str) -> Path:
        return TASKS_DIR / f"{task_id}.json"

    def _get_task_log_file(self, task_id: str) -> Path:
        return TASKS_DIR / f"{task_id}_logs.json"

    def create_task(self, workspace: str, task: str, config: dict) -> str:
        """新しいタスクを作成"""
        task_id = str(uuid.uuid4())[:8]
        task_data = {
            "id": task_id,
            "workspace": workspace,
            "task": task,
            "config": config,
            "status": "pending",
            "created_at": datetime.now().isoformat(),
            "started_at": None,
            "completed_at": None,
            "iteration": 0,
            "progress": 0,
            "analysis": "",
            "files_created": [],
            "current_phase": None,
            "is_complete": False,
            "error": None,
            "history": [],
            "additional_instructions": []  # 追加指示のリスト
        }
        self._save_task(task_id, task_data)
        self._save_logs(task_id, [])
        return task_id

    def add_instruction(self, task_id: str, instruction: str) -> bool:
        """タスクに追加指示を追加"""
        task = self.get_task(task_id)
        if not task:
            return False
        instructions = task.get("additional_instructions", [])
        instructions.append({
            "instruction": instruction,
            "added_at": datetime.now().isoformat(),
            "applied": False
        })
        self.update_task(task_id, {"additional_instructions": instructions})
        self.add_log(task_id, "instruction", f"追加指示を受信: {instruction[:50]}...")
        return True

    def get_pending_instructions(self, task_id: str) -> list:
        """未適用の追加指示を取得"""
        task = self.get_task(task_id)
        if not task:
            return []
        instructions = task.get("additional_instructions", [])
        return [i for i in instructions if not i.get("applied")]

    def mark_instruction_applied(self, task_id: str, index: int):
        """指示を適用済みにマーク"""
        task = self.get_task(task_id)
        if not task:
            return
        instructions = task.get("additional_instructions", [])
        if 0 <= index < len(instructions):
            instructions[index]["applied"] = True
            self.update_task(task_id, {"additional_instructions": instructions})

    def _save_task(self, task_id: str, data: dict):
        """タスク状態をファイルに保存"""
        self._get_task_file(task_id).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

    def _save_logs(self, task_id: str, logs: list):
        """ログをファイルに保存（スレッドセーフ）"""
        lock = self._get_log_lock(task_id)
        with lock:
            self._get_task_log_file(task_id).write_text(json.dumps(logs, ensure_ascii=False), encoding='utf-8')

    def get_task(self, task_id: str) -> Optional[dict]:
        """タスク状態を取得"""
        task_file = self._get_task_file(task_id)
        if task_file.exists():
            return json.loads(task_file.read_text(encoding='utf-8'))
        return None

    def get_task_logs(self, task_id: str) -> list:
        """タスクログを取得（スレッドセーフ）"""
        log_file = self._get_task_log_file(task_id)
        if not log_file.exists():
            return []

        lock = self._get_log_lock(task_id)
        with lock:
            try:
                content = log_file.read_text(encoding='utf-8')
                if not content.strip():
                    return []
                return json.loads(content)
            except json.JSONDecodeError as e:
                # JSONが壊れている場合は空のリストで再初期化
                print(f"⚠️ ログファイルが破損しています（タスク: {task_id}）: {e}")
                # バックアップを作成
                backup_file = self._get_task_log_file(task_id).with_suffix('.json.corrupted')
                try:
                    import shutil
                    shutil.copy2(log_file, backup_file)
                except Exception:
                    pass
                # 空のログで再初期化
                log_file.write_text('[]', encoding='utf-8')
                return []

    def update_task(self, task_id: str, updates: dict):
        """タスク状態を更新"""
        task = self.get_task(task_id)
        if task:
            task.update(updates)
            self._save_task(task_id, task)

    def add_log(self, task_id: str, log_type: str, message: str):
        """ログを追加（スレッドセーフ）"""
        log_file = self._get_task_log_file(task_id)
        lock = self._get_log_lock(task_id)

        with lock:
            # ログを読み込み
            logs = []
            if log_file.exists():
                try:
                    content = log_file.read_text(encoding='utf-8')
                    if content.strip():
                        logs = json.loads(content)
                except json.JSONDecodeError:
                    # 壊れている場合は空リストで開始
                    logs = []

            # 新しいログを追加
            logs.append({
                "type": log_type,
                "message": message,
                "timestamp": datetime.now().isoformat()
            })

            # 最新1000件のみ保持
            if len(logs) > 1000:
                logs = logs[-1000:]

            # ログを保存
            log_file.write_text(json.dumps(logs, ensure_ascii=False), encoding='utf-8')

    def list_tasks(self, workspace: Optional[str] = None) -> list:
        """タスク一覧を取得"""
        tasks = []
        for task_file in TASKS_DIR.glob("*.json"):
            if task_file.name.endswith("_logs.json"):
                continue
            task = json.loads(task_file.read_text(encoding='utf-8'))
            if workspace is None or task.get("workspace") == workspace:
                tasks.append(task)
        return sorted(tasks, key=lambda x: x.get("created_at", ""), reverse=True)

    def delete_task(self, task_id: str):
        """タスクを削除"""
        task_file = self._get_task_file(task_id)
        log_file = self._get_task_log_file(task_id)
        if task_file.exists():
            task_file.unlink()
        if log_file.exists():
            log_file.unlink()


task_manager = TaskManager()


def ensure_workspace_dir():
    """ワークスペースディレクトリの存在を確認"""
    WORKSPACE_BASE_PATH.mkdir(parents=True, exist_ok=True)


@router.get("/status")
async def get_status():
    """code-serverの稼働状態を確認"""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            response = await client.get(CODE_SERVER_URL)
            # code-serverは200または302（ログインリダイレクト）を返す場合がある
            is_running = response.status_code in [200, 302, 303]
            return {
                "code_server_running": is_running,
                "code_server_url": CODE_SERVER_URL,
                "workspace_path": str(WORKSPACE_BASE_PATH)
            }
    except httpx.ConnectError:
        return {
            "code_server_running": False,
            "code_server_url": CODE_SERVER_URL,
            "workspace_path": str(WORKSPACE_BASE_PATH),
            "message": "code-serverに接続できません。finch compose up -d を実行してください。"
        }
    except Exception as e:
        return {
            "code_server_running": False,
            "code_server_url": CODE_SERVER_URL,
            "workspace_path": str(WORKSPACE_BASE_PATH),
            "message": f"エラー: {str(e)}"
        }


@router.get("/list")
async def list_workspaces():
    """ワークスペース一覧を取得"""
    ensure_workspace_dir()
    workspaces = []

    for item in WORKSPACE_BASE_PATH.iterdir():
        if item.is_dir() and not item.name.startswith('.'):
            # ファイル数とサイズを計算
            file_count = sum(1 for _ in item.rglob('*') if _.is_file())
            total_size = sum(f.stat().st_size for f in item.rglob('*') if f.is_file())

            workspaces.append({
                "name": item.name,
                "path": str(item),
                "created_at": datetime.fromtimestamp(item.stat().st_ctime).isoformat(),
                "modified_at": datetime.fromtimestamp(item.stat().st_mtime).isoformat(),
                "file_count": file_count,
                "total_size_bytes": total_size
            })

    return {"workspaces": sorted(workspaces, key=lambda x: x["modified_at"], reverse=True)}


@router.post("/create")
async def create_workspace(request: WorkspaceCreateRequest):
    """新規ワークスペースを作成"""
    ensure_workspace_dir()

    # 名前のバリデーション
    safe_name = "".join(c for c in request.name if c.isalnum() or c in "-_")
    if not safe_name:
        raise HTTPException(status_code=400, detail="無効なワークスペース名です")

    workspace_path = WORKSPACE_BASE_PATH / safe_name

    if workspace_path.exists():
        raise HTTPException(status_code=400, detail=f"ワークスペース '{safe_name}' は既に存在します")

    workspace_path.mkdir(parents=True)

    # メタデータファイルを作成
    metadata = {
        "name": safe_name,
        "description": request.description or "",
        "created_at": datetime.now().isoformat()
    }
    metadata_path = workspace_path / ".workspace.json"
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)

    return {
        "success": True,
        "workspace": {
            "name": safe_name,
            "path": str(workspace_path),
            "code_server_url": f"{CODE_SERVER_URL}/?folder=/workspace/{safe_name}"
        }
    }


@router.delete("/{name}")
async def delete_workspace(name: str):
    """ワークスペースを削除"""
    workspace_path = WORKSPACE_BASE_PATH / name

    if not workspace_path.exists():
        raise HTTPException(status_code=404, detail=f"ワークスペース '{name}' が見つかりません")

    shutil.rmtree(workspace_path)

    return {"success": True, "message": f"ワークスペース '{name}' を削除しました"}


@router.post("/upload")
async def upload_files(
    workspace_name: str = Form(...),
    files: List[UploadFile] = File(...)
):
    """ファイルをワークスペースにアップロード"""
    workspace_path = WORKSPACE_BASE_PATH / workspace_name

    if not workspace_path.exists():
        raise HTTPException(status_code=404, detail=f"ワークスペース '{workspace_name}' が見つかりません")

    uploaded_files = []

    for file in files:
        # ZIPファイルの場合は展開
        if file.filename and file.filename.endswith('.zip'):
            zip_path = workspace_path / file.filename
            with open(zip_path, "wb") as f:
                content = await file.read()
                f.write(content)

            # ZIP展開
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(workspace_path)

            # ZIPファイル削除
            zip_path.unlink()
            uploaded_files.append({"name": file.filename, "type": "zip", "extracted": True})
        else:
            # 通常ファイル
            file_path = workspace_path / (file.filename or "unnamed")
            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)
            uploaded_files.append({"name": file.filename, "type": "file", "size": len(content)})

    return {
        "success": True,
        "workspace": workspace_name,
        "uploaded_files": uploaded_files
    }


@router.post("/{name}/execute-task")
async def execute_task_on_workspace(name: str, request: WorkspaceTaskRequest):
    """
    ワークスペースに対してClaude Code的なタスクを複数モデルで実行
    各モデルが独立してタスクを実行し、結果を比較表示
    """
    workspace_path = WORKSPACE_BASE_PATH / name

    if not workspace_path.exists():
        raise HTTPException(status_code=404, detail=f"ワークスペース '{name}' が見つかりません")

    # ワークスペースのファイル構造を取得
    file_tree = []
    for item in workspace_path.rglob('*'):
        if item.is_file() and not any(part.startswith('.') for part in item.parts):
            rel_path = item.relative_to(workspace_path)
            file_tree.append(str(rel_path))

    # コードファイルの内容を収集（小さいファイルのみ）
    code_context = []
    for item in workspace_path.rglob('*'):
        if item.is_file() and item.stat().st_size < 50000:  # 50KB以下
            suffix = item.suffix.lower()
            if suffix in ['.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.md', '.txt', '.json', '.yaml', '.yml']:
                try:
                    content = item.read_text(encoding='utf-8')
                    rel_path = item.relative_to(workspace_path)
                    code_context.append(f"### {rel_path}\n```\n{content[:5000]}\n```")
                except Exception:
                    pass

    # プロンプトを構築
    context_text = "\n\n".join(code_context[:20])  # 最大20ファイル

    full_prompt = f"""あなたはコーディングアシスタントです。以下のワークスペースのコードを分析し、ユーザーのタスクを実行してください。

## ワークスペース: {name}

## ファイル構造:
{chr(10).join(file_tree[:100])}

## コード内容:
{context_text}

## タスク:
{request.task}

## 回答形式:
1. タスクの分析
2. 提案する変更内容（コード付き）
3. 実装手順

必要に応じてコードブロックを使用してください。"""

    # 並列実行
    executor = BedrockParallelExecutor(region=request.region)

    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(
        None,
        executor.execute_parallel_models,
        request.model_ids,
        full_prompt,
        request.max_tokens,
        request.temperature,
        50  # max_workers
    )

    success_count = sum(1 for r in results if r.get("success"))

    return {
        "workspace": name,
        "task": request.task,
        "results": results,
        "summary": {
            "total": len(results),
            "success": success_count,
            "failed": len(results) - success_count
        }
    }


class WorkspaceDebateRequest(BaseModel):
    model_ids: List[str]
    task: str
    rounds: int = 3
    max_tokens: int = 4000
    temperature: float = 0.7
    region: str = "us-east-1"


@router.post("/{name}/debate-task")
async def debate_task_on_workspace(name: str, request: WorkspaceDebateRequest):
    """ワークスペースのコードについて複数モデルで壁打ち"""
    workspace_path = WORKSPACE_BASE_PATH / name

    if not workspace_path.exists():
        raise HTTPException(status_code=404, detail=f"ワークスペース '{name}' が見つかりません")

    if len(request.model_ids) < 2:
        raise HTTPException(status_code=400, detail="壁打ちには2つ以上のモデルが必要です")

    # ファイル構造とコード内容を収集
    file_tree = []
    code_context = []

    for item in workspace_path.rglob('*'):
        if item.is_file() and not item.name.startswith('.'):
            rel_path = item.relative_to(workspace_path)
            file_tree.append(str(rel_path))
            suffix = item.suffix.lower()
            if suffix in ['.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.md', '.txt', '.json', '.yaml', '.yml']:
                try:
                    content = item.read_text(encoding='utf-8')
                    code_context.append(f"### {rel_path}\n```\n{content[:5000]}\n```")
                except Exception:
                    pass

    context_text = "\n\n".join(code_context[:20])
    base_context = f"""## ワークスペース: {name}

## ファイル構造:
{chr(10).join(file_tree[:100])}

## コード内容:
{context_text}

## 議論テーマ:
{request.task}"""

    async def generate_debate():
        executor = BedrockParallelExecutor(region=request.region)
        conversation_history = []

        yield f"data: {json.dumps({'type': 'start', 'total_rounds': request.rounds})}\n\n"

        for round_num in range(1, request.rounds + 1):
            yield f"data: {json.dumps({'type': 'round_start', 'round': round_num})}\n\n"

            for speaker_idx, model_id in enumerate(request.model_ids):
                yield f"data: {json.dumps({'type': 'speaking', 'round': round_num, 'model_id': model_id, 'speaker_index': speaker_idx})}\n\n"

                # 履歴を含むプロンプトを構築
                history_text = ""
                if conversation_history:
                    history_text = "\n\n## これまでの議論:\n" + "\n\n".join([
                        f"**{h['model']}** (Round {h['round']}):\n{h['output']}"
                        for h in conversation_history
                    ])

                prompt = f"""{base_context}
{history_text}

あなたは「{model_id.split('.')[-1]}」として議論に参加しています。Round {round_num}です。

これまでの議論を踏まえて、あなたの見解を述べてください。
- 他のモデルの意見に同意する場合は理由を添えて賛成を表明
- 異なる見解がある場合は建設的に反論
- 新しい視点や改善案があれば提案
- コードの具体的な改善点を指摘

簡潔かつ具体的に回答してください。"""

                import time
                start_time = time.time()

                try:
                    loop = asyncio.get_event_loop()
                    results = await loop.run_in_executor(
                        None,
                        executor.execute_parallel_models,
                        [model_id],
                        prompt,
                        request.max_tokens,
                        request.temperature,
                        1
                    )

                    elapsed_time = time.time() - start_time
                    result = results[0] if results else {"success": False, "error": "No response"}

                    if result.get("success"):
                        conversation_history.append({
                            "round": round_num,
                            "model": model_id,
                            "output": result.get("output", "")
                        })

                    yield f"data: {json.dumps({'type': 'speech', 'round': round_num, 'data': {'model_id': model_id, 'output': result.get('output', ''), 'elapsed_time': elapsed_time, 'success': result.get('success', False), 'error': result.get('error')}})}\n\n"

                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

            yield f"data: {json.dumps({'type': 'round_end', 'round': round_num})}\n\n"

        yield f"data: {json.dumps({'type': 'complete', 'total_speeches': len(conversation_history)})}\n\n"

    return StreamingResponse(generate_debate(), media_type="text/event-stream")


class AutonomousConductorRequest(BaseModel):
    conductor_model_id: str
    worker_model_ids: List[str]
    task: str
    max_iterations: int = 100
    max_tokens: int = 4000
    temperature: float = 0.7
    region: str = "us-east-1"
    parallel_mode: bool = True  # 並列実行モード
    max_parallel_workers: int = 10  # 最大並列実行数（1-50、Bedrockのレート制限に注意）
    approved_plan: dict = None  # 承認済み計画（Noneの場合は計画フェーズから開始）
    feedback: str = None  # 計画へのフィードバック（再生成時）
    previous_plan: dict = None  # 前回の計画（再生成時）


@router.post("/{name}/autonomous-conductor/plan")
async def generate_autonomous_plan(name: str, request: AutonomousConductorRequest):
    """
    自律型指揮者モード: 計画生成フェーズ
    タスクを分析し、実行計画を生成して返す（実行はしない）
    """
    import traceback
    try:
        workspace_path = WORKSPACE_BASE_PATH / name

        if not workspace_path.exists():
            raise HTTPException(status_code=404, detail=f"ワークスペース '{name}' が見つかりません")

        executor = BedrockParallelExecutor(region=request.region)
        worker_count = len(request.worker_model_ids)

        # 現在のワークスペース状態を取得
        current_files = []
        file_contents = {}
        for item in workspace_path.rglob('*'):
            if item.is_file() and not item.name.startswith('_'):
                rel_path = str(item.relative_to(workspace_path))
                current_files.append(rel_path)
                suffix = item.suffix.lower()
                if suffix in ['.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.md', '.txt', '.json', '.yaml', '.yml', '.html', '.css', '.sh', '.asm', '.s', '.makefile', '.cmake']:
                    try:
                        content = item.read_text(encoding='utf-8')
                        file_contents[rel_path] = content[:2000]
                    except:
                        pass

        files_summary = "\n".join([f"- {f}" for f in current_files[:30]])
        contents_summary = "\n\n".join([f"### {path}\n```\n{content}\n```" for path, content in list(file_contents.items())[:5]])

        # フィードバックと前回の計画がある場合の追加プロンプト
        feedback_section = ""
        if request.feedback or request.previous_plan:
            feedback_section = "\n## 重要: ユーザーからのフィードバック\n"
            if request.previous_plan:
                prev_plan_summary = json.dumps(request.previous_plan, ensure_ascii=False, indent=2)[:2000]
                feedback_section += f"""
### 前回の計画
```json
{prev_plan_summary}
```
"""
            if request.feedback:
                feedback_section += f"""
### ユーザーの要望
**以下のフィードバックを必ず反映してください：**
{request.feedback}

上記のフィードバックに基づいて、前回の計画を改善してください。
"""

        # 計画生成プロンプト
        planning_prompt = f"""あなたはシニアソフトウェアアーキテクトです。以下のタスクを達成するための詳細な実行計画を作成してください。

## タスク
{request.task}
{feedback_section}
## 利用可能なリソース
- AIワーカー数: {worker_count}個（並列実行可能）
- 最大イテレーション: {request.max_iterations}回

## 現在のワークスペース状態
### ファイル一覧
{files_summary if files_summary else '(空のワークスペース)'}

### 既存ファイル内容
{contents_summary if contents_summary else '(ファイルなし)'}

## 計画作成の指針
1. タスクを明確なフェーズに分割する
2. 各フェーズで作成するファイルと内容を具体的に記述
3. 依存関係を考慮し、並列実行可能なタスクを特定
4. 完了条件を明確に定義

以下のJSON形式で計画を出力してください：
```json
{{
  "project_name": "プロジェクト名",
  "description": "プロジェクトの概要説明",
  "architecture": "アーキテクチャの説明",
  "phases": [
    {{
      "phase_id": 1,
      "name": "フェーズ名",
      "description": "このフェーズの目的",
      "estimated_iterations": 予想イテレーション数,
      "files_to_create": [
        {{
          "path": "ファイルパス",
          "description": "ファイルの役割・内容",
          "dependencies": ["依存するファイルパス"],
          "can_parallelize": true
        }}
      ],
      "completion_criteria": "このフェーズの完了条件"
    }}
  ],
  "final_structure": [
    "最終的なファイル構造の一覧"
  ],
  "completion_criteria": "プロジェクト全体の完了条件",
  "risks": ["想定されるリスクや注意点"]
}}
```"""

        import time
        start_time = time.time()

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            executor.invoke_model,
            request.conductor_model_id,
            planning_prompt,
            request.max_tokens * 2,
            0.3,
            0
        )

        elapsed = time.time() - start_time

        if not result.get('success'):
            raise HTTPException(status_code=500, detail=result.get('error', 'Planning failed'))

        # JSONを抽出
        output = result.get('output', '')
        json_match = re.search(r'```json\s*(.*?)\s*```', output, re.DOTALL)

        plan = None
        if json_match:
            try:
                plan = json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        return {
            "success": True,
            "plan": plan,
            "raw_output": output,
            "elapsed_time": elapsed,
            "workspace": name,
            "task": request.task
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Plan generation error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"計画生成エラー: {str(e)}")


@router.post("/{name}/autonomous-conductor")
async def autonomous_conductor_on_workspace(name: str, request: AutonomousConductorRequest):
    """
    自律型指揮者モード: タスクが完了するまで自動でコード生成・修正を繰り返す
    進捗はワークスペースにファイルとして保存される
    並列モード: 複数ワーカーが同時に異なるファイルを生成
    approved_planがある場合は計画に従って実行
    """
    workspace_path = WORKSPACE_BASE_PATH / name

    if not workspace_path.exists():
        raise HTTPException(status_code=404, detail=f"ワークスペース '{name}' が見つかりません")

    async def run_autonomous():
        executor = BedrockParallelExecutor(region=request.region)
        iteration = 0
        task_complete = False
        history = []
        created_files = []
        worker_count = len(request.worker_model_ids)
        approved_plan = request.approved_plan

        yield f"data: {json.dumps({'type': 'start', 'task': request.task, 'max_iterations': request.max_iterations, 'parallel_mode': request.parallel_mode, 'worker_count': worker_count, 'has_plan': approved_plan is not None})}\n\n"

        # 進捗ログファイルを作成
        log_file = workspace_path / "_conductor_log.md"
        plan_info = ""
        if approved_plan:
            plan_info = f"\n## 承認済み計画\n- プロジェクト: {approved_plan.get('project_name', 'N/A')}\n- フェーズ数: {len(approved_plan.get('phases', []))}\n"
        log_file.write_text(f"# 自律型指揮者モード ログ\n\n## タスク\n{request.task}\n\n## 設定\n- 並列モード: {'有効' if request.parallel_mode else '無効'}\n- ワーカー数: {worker_count}{plan_info}\n\n## 進捗\n", encoding='utf-8')

        # 計画がある場合は計画情報を送信
        if approved_plan:
            yield f"data: {json.dumps({'type': 'plan_loaded', 'plan': approved_plan})}\n\n"

        current_phase_idx = 0
        phases = approved_plan.get('phases', []) if approved_plan else []

        while not task_complete and iteration < request.max_iterations:
            iteration += 1
            yield f"data: {json.dumps({'type': 'iteration_start', 'iteration': iteration})}\n\n"

            # 現在のワークスペース状態を取得
            current_files = []
            file_contents = {}
            for item in workspace_path.rglob('*'):
                if item.is_file() and not item.name.startswith('_'):
                    rel_path = str(item.relative_to(workspace_path))
                    current_files.append(rel_path)
                    suffix = item.suffix.lower()
                    if suffix in ['.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.md', '.txt', '.json', '.yaml', '.yml', '.html', '.css', '.sh', '.asm', '.s', '.makefile', '.cmake']:
                        try:
                            content = item.read_text(encoding='utf-8')
                            file_contents[rel_path] = content[:3000]
                        except:
                            pass

            files_summary = "\n".join([f"- {f}" for f in current_files[:50]])
            contents_summary = "\n\n".join([f"### {path}\n```\n{content}\n```" for path, content in list(file_contents.items())[:10]])

            history_text = "\n".join([f"- イテレーション{h['iteration']}: {h['action']}" for h in history[-5:]])

            # Phase 1: 指揮者が次のアクションを決定（並列タスク分割対応）
            conductor_prompt = f"""あなたは自律型AIプロジェクトマネージャーです。効率を最大化するため、可能な限り並列実行を活用してください。

## 目標タスク
{request.task}

## 利用可能なワーカー数
{worker_count}個のAIワーカーが並列実行可能です。

## 現在のワークスペース状態
### ファイル一覧
{files_summary if files_summary else '(空)'}

### ファイル内容
{contents_summary if contents_summary else '(ファイルなし)'}

## これまでの履歴
{history_text if history_text else '(初回)'}

## 指示
1. 現在の進捗状況を分析してください
2. タスクが完了したかどうか判定してください
3. 完了していない場合:
   - 【重要】可能な限り複数のサブタスクに分割し、並列実行してください
   - 依存関係のないタスクは同時に実行できます
   - 例: 複数のファイルを同時に生成、複数のモジュールを並列開発

以下のJSON形式で回答してください:
```json
{{
  "analysis": "現在の状況分析",
  "progress_percent": 0-100の数値,
  "is_complete": true/false,
  "parallel_tasks": [
    {{
      "task_id": 1,
      "type": "create_file",
      "file_path": "ファイルパス",
      "description": "このファイルで何を実装するか",
      "dependencies": []
    }},
    {{
      "task_id": 2,
      "type": "create_file",
      "file_path": "別のファイルパス",
      "description": "このファイルで何を実装するか",
      "dependencies": []
    }}
  ],
  "completion_reason": "完了の場合、その理由"
}}
```

並列実行できないシンプルなタスクの場合:
```json
{{
  "analysis": "現在の状況分析",
  "progress_percent": 0-100の数値,
  "is_complete": true/false,
  "next_action": {{
    "type": "create_file" | "modify_file" | "delete_file",
    "description": "アクションの説明",
    "file_path": "対象ファイルパス"
  }},
  "completion_reason": "完了の場合、その理由"
}}
```"""

            import time
            start_time = time.time()

            loop = asyncio.get_event_loop()
            conductor_result = await loop.run_in_executor(
                None,
                executor.invoke_model,
                request.conductor_model_id,
                conductor_prompt,
                request.max_tokens,
                0.3,
                0
            )

            elapsed = time.time() - start_time

            yield f"data: {json.dumps({'type': 'conductor_response', 'iteration': iteration, 'elapsed_time': elapsed, 'success': conductor_result.get('success', False)})}\n\n"

            if not conductor_result.get('success'):
                yield f"data: {json.dumps({'type': 'error', 'message': conductor_result.get('error', 'Unknown error')})}\n\n"
                break

            # JSONを抽出
            output = conductor_result.get('output', '')
            json_match = re.search(r'```json\s*(.*?)\s*```', output, re.DOTALL)

            if not json_match:
                # JSONがない場合はプレーンテキストから解析を試みる
                history.append({'iteration': iteration, 'action': 'JSON解析失敗'})
                yield f"data: {json.dumps({'type': 'parse_error', 'iteration': iteration})}\n\n"
                continue

            try:
                decision = json.loads(json_match.group(1))
            except json.JSONDecodeError:
                history.append({'iteration': iteration, 'action': 'JSON解析失敗'})
                continue

            progress = decision.get('progress_percent', 0)
            is_complete = decision.get('is_complete', False)
            next_action = decision.get('next_action', {})
            parallel_tasks = decision.get('parallel_tasks', [])

            yield f"data: {json.dumps({'type': 'decision', 'iteration': iteration, 'progress': progress, 'is_complete': is_complete, 'analysis': decision.get('analysis', ''), 'next_action': next_action, 'parallel_tasks_count': len(parallel_tasks)})}\n\n"

            # ログファイルを更新
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"\n### イテレーション {iteration}\n")
                f.write(f"- 進捗: {progress}%\n")
                f.write(f"- 分析: {decision.get('analysis', 'N/A')}\n")
                if parallel_tasks:
                    f.write(f"- 並列タスク: {len(parallel_tasks)}個\n")
                    for pt in parallel_tasks:
                        f.write(f"  - {pt.get('file_path', 'N/A')}: {pt.get('description', 'N/A')[:50]}\n")
                else:
                    f.write(f"- アクション: {next_action.get('type', 'N/A')} - {next_action.get('description', 'N/A')}\n")

            if is_complete:
                task_complete = True
                yield f"data: {json.dumps({'type': 'task_complete', 'iteration': iteration, 'reason': decision.get('completion_reason', '')})}\n\n"
                break

            # Phase 2: アクションを実行

            # 並列タスクがある場合は並列実行
            if parallel_tasks and request.parallel_mode:
                yield f"data: {json.dumps({'type': 'parallel_start', 'iteration': iteration, 'task_count': len(parallel_tasks)})}\n\n"

                # 並列タスクをワーカーに分散
                from concurrent.futures import ThreadPoolExecutor, as_completed
                import threading

                files_created_this_iteration = []
                files_lock = threading.Lock()

                def execute_parallel_task(task_info, worker_model_id, task_index):
                    """並列タスクを実行する関数"""
                    file_path = task_info.get('file_path', '')
                    description = task_info.get('description', '')
                    task_type = task_info.get('type', 'create_file')

                    if not file_path:
                        return None

                    gen_prompt = f"""以下のファイルを生成してください。

## ファイルパス
{file_path}

## 全体タスク
{request.task}

## このファイルの要求
{description}

## 現在のワークスペース
{contents_summary if contents_summary else '(空)'}

## 出力形式
ファイルの内容のみを出力してください。説明文やマークダウンのコードブロック(```)は不要です。
コードそのものだけを出力してください。"""

                    result = executor.invoke_model(
                        worker_model_id,
                        gen_prompt,
                        request.max_tokens * 2,
                        request.temperature,
                        task_index
                    )

                    if result.get('success'):
                        file_content = result.get('output', '')
                        # コードブロックを除去
                        file_content = re.sub(r'^```\w*\n?', '', file_content)
                        file_content = re.sub(r'\n?```$', '', file_content)
                        file_content = file_content.strip()

                        full_path = workspace_path / file_path
                        full_path.parent.mkdir(parents=True, exist_ok=True)
                        full_path.write_text(file_content, encoding='utf-8')

                        return {
                            'file_path': file_path,
                            'size': len(file_content),
                            'worker': worker_model_id,
                            'success': True
                        }
                    return {
                        'file_path': file_path,
                        'error': result.get('error', 'Unknown error'),
                        'success': False
                    }

                # ワーカーを循環して使用
                with ThreadPoolExecutor(max_workers=min(len(parallel_tasks), worker_count, request.max_parallel_workers)) as pool:
                    futures = {}
                    for i, task_info in enumerate(parallel_tasks):
                        worker_model = request.worker_model_ids[i % worker_count]
                        future = pool.submit(execute_parallel_task, task_info, worker_model, i)
                        futures[future] = task_info

                    for future in as_completed(futures):
                        result = future.result()
                        if result:
                            if result.get('success'):
                                created_files.append(result['file_path'])
                                files_created_this_iteration.append(result['file_path'])
                                # yieldはasync generatorなのでここでは直接使えない
                            # 結果を収集

                # 作成されたファイルを通知（ループ外で）
                for fp in files_created_this_iteration:
                    yield f"data: {json.dumps({'type': 'file_created', 'iteration': iteration, 'path': fp, 'parallel': True})}\n\n"

                yield f"data: {json.dumps({'type': 'parallel_complete', 'iteration': iteration, 'files_created': len(files_created_this_iteration)})}\n\n"
                history.append({'iteration': iteration, 'action': f'並列実行: {len(files_created_this_iteration)}ファイル作成'})

            # 単一アクションの場合
            elif next_action:
                action_type = next_action.get('type', '')

                if action_type == 'delegate_to_workers':
                    # ワーカーにタスクを委譲
                    worker_task = next_action.get('worker_task', request.task)

                    yield f"data: {json.dumps({'type': 'worker_start', 'iteration': iteration, 'task': worker_task})}\n\n"

                    # ワーカーを並列実行
                    worker_prompt = f"""以下のタスクを実行し、コードを生成してください。

## タスク
{worker_task}

## 現在のワークスペース
{contents_summary if contents_summary else '(空)'}

## 出力形式
必要なファイルをそれぞれ以下の形式で出力してください:

<<<FILE: ファイルパス>>>
ファイルの内容
<<<END_FILE>>>

複数ファイルを作成する場合は上記形式を繰り返してください。"""

                    worker_results = await loop.run_in_executor(
                        None,
                        executor.execute_parallel_models,
                        request.worker_model_ids,
                        worker_prompt,
                        request.max_tokens,
                        request.temperature,
                        len(request.worker_model_ids)
                    )

                    yield f"data: {json.dumps({'type': 'worker_complete', 'iteration': iteration, 'count': len(worker_results)})}\n\n"

                    # ワーカーの出力からファイルを抽出して保存
                    files_from_workers = 0
                    for wr in worker_results:
                        if wr.get('success'):
                            worker_output = wr.get('output', '')
                            # ファイル抽出パターン
                            file_pattern = r'<<<FILE:\s*(.+?)>>>\s*(.*?)\s*<<<END_FILE>>>'
                            matches = re.findall(file_pattern, worker_output, re.DOTALL)

                            for file_path, file_content in matches:
                                file_path = file_path.strip()
                                file_content = file_content.strip()
                                full_path = workspace_path / file_path

                                # ディレクトリを作成
                                full_path.parent.mkdir(parents=True, exist_ok=True)

                                # ファイルを保存
                                full_path.write_text(file_content, encoding='utf-8')
                                created_files.append(file_path)
                                files_from_workers += 1

                                yield f"data: {json.dumps({'type': 'file_created', 'iteration': iteration, 'path': file_path, 'size': len(file_content)})}\n\n"

                    history.append({'iteration': iteration, 'action': f'ワーカー委譲: {files_from_workers}ファイル作成'})

                elif action_type == 'create_file' or action_type == 'modify_file':
                    file_path = next_action.get('file_path', '')
                    if file_path:
                        # 指揮者にファイル内容を生成させる
                        gen_prompt = f"""以下のファイルを生成してください。

## ファイルパス
{file_path}

## タスク
{request.task}

## 要求
{next_action.get('description', '')}

## 現在のワークスペース
{contents_summary if contents_summary else '(空)'}

ファイルの内容のみを出力してください。説明やマークダウンのコードブロックは不要です。"""

                        gen_result = await loop.run_in_executor(
                            None,
                            executor.invoke_model,
                            request.conductor_model_id,
                            gen_prompt,
                            request.max_tokens * 2,
                            request.temperature,
                            0
                        )

                        if gen_result.get('success'):
                            file_content = gen_result.get('output', '')
                            # コードブロックを除去
                            file_content = re.sub(r'^```\w*\n?', '', file_content)
                            file_content = re.sub(r'\n?```$', '', file_content)

                            full_path = workspace_path / file_path
                            full_path.parent.mkdir(parents=True, exist_ok=True)
                            full_path.write_text(file_content, encoding='utf-8')
                            created_files.append(file_path)

                            yield f"data: {json.dumps({'type': 'file_created', 'iteration': iteration, 'path': file_path, 'size': len(file_content)})}\n\n"
                            history.append({'iteration': iteration, 'action': f'ファイル作成: {file_path}'})

                elif action_type == 'delete_file':
                    file_path = next_action.get('file_path', '')
                    if file_path:
                        full_path = workspace_path / file_path
                        if full_path.exists():
                            full_path.unlink()
                            yield f"data: {json.dumps({'type': 'file_deleted', 'iteration': iteration, 'path': file_path})}\n\n"
                            history.append({'iteration': iteration, 'action': f'ファイル削除: {file_path}'})

            # 少し待機
            await asyncio.sleep(0.5)

        # 完了サマリー
        yield f"data: {json.dumps({'type': 'complete', 'total_iterations': iteration, 'files_created': created_files, 'task_complete': task_complete})}\n\n"

        # 最終ログ更新
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"\n## 完了\n")
            f.write(f"- 総イテレーション: {iteration}\n")
            f.write(f"- タスク完了: {'はい' if task_complete else 'いいえ'}\n")
            f.write(f"- 作成ファイル: {len(created_files)}\n")
            for cf in created_files:
                f.write(f"  - {cf}\n")

    return StreamingResponse(run_autonomous(), media_type="text/event-stream")


@router.get("/{name}/files")
async def get_workspace_files(name: str):
    """ワークスペースのファイル一覧を取得"""
    workspace_path = WORKSPACE_BASE_PATH / name

    if not workspace_path.exists():
        raise HTTPException(status_code=404, detail=f"ワークスペース '{name}' が見つかりません")

    files = []
    for item in workspace_path.rglob('*'):
        if item.is_file():
            rel_path = item.relative_to(workspace_path)
            files.append({
                "path": str(rel_path),
                "name": item.name,
                "size": item.stat().st_size,
                "modified_at": datetime.fromtimestamp(item.stat().st_mtime).isoformat()
            })

    return {
        "workspace": name,
        "files": sorted(files, key=lambda x: x["path"])
    }


# =============================================================================
# タスク管理エンドポイント（バックグラウンド実行対応）
# =============================================================================

@router.get("/tasks/list")
async def list_all_tasks(workspace: Optional[str] = None):
    """全タスクの一覧を取得"""
    tasks = task_manager.list_tasks(workspace)
    return {"tasks": tasks}


@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """タスクの状態を取得"""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"タスク '{task_id}' が見つかりません")
    return task


@router.get("/tasks/{task_id}/logs")
async def get_task_logs(task_id: str, offset: int = 0, limit: int = 100):
    """タスクのログを取得"""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"タスク '{task_id}' が見つかりません")
    logs = task_manager.get_task_logs(task_id)
    return {
        "task_id": task_id,
        "total": len(logs),
        "logs": logs[offset:offset + limit]
    }


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    """タスクを削除"""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"タスク '{task_id}' が見つかりません")
    task_manager.delete_task(task_id)
    return {"success": True, "message": f"タスク '{task_id}' を削除しました"}


@router.post("/{name}/autonomous-conductor/background")
async def start_autonomous_conductor_background(
    name: str,
    request: AutonomousConductorRequest,
    background_tasks: BackgroundTasks
):
    """
    自律型指揮者モードをバックグラウンドで開始
    タスクIDを返し、進捗はポーリングで取得
    """
    workspace_path = WORKSPACE_BASE_PATH / name

    if not workspace_path.exists():
        raise HTTPException(status_code=404, detail=f"ワークスペース '{name}' が見つかりません")

    # タスクを作成
    task_id = task_manager.create_task(
        workspace=name,
        task=request.task,
        config={
            "conductor_model_id": request.conductor_model_id,
            "worker_model_ids": request.worker_model_ids,
            "max_iterations": request.max_iterations,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "region": request.region,
            "parallel_mode": request.parallel_mode,
            "approved_plan": request.approved_plan
        }
    )

    # バックグラウンドで実行
    background_tasks.add_task(run_autonomous_background, task_id, name, request)

    return {
        "success": True,
        "task_id": task_id,
        "message": "タスクをバックグラウンドで開始しました"
    }


async def run_autonomous_background(task_id: str, workspace_name: str, request: AutonomousConductorRequest):
    """バックグラウンドで自律型指揮者を実行"""
    workspace_path = WORKSPACE_BASE_PATH / workspace_name

    try:
        worker_count = len(request.worker_model_ids)
        task_manager.update_task(task_id, {
            "status": "running",
            "started_at": datetime.now().isoformat(),
            "conductor_model": request.conductor_model_id,
            "worker_models": request.worker_model_ids,
            "worker_count": worker_count,
            "max_parallel_workers": request.max_parallel_workers,
            "active_workers": 0,
        })
        task_manager.add_log(task_id, "info", f"タスク開始: {request.task}")
        task_manager.add_log(task_id, "info", f"指揮者: {request.conductor_model_id}, ワーカー: {worker_count}モデル, 最大並列: {request.max_parallel_workers}")

        executor = BedrockParallelExecutor(region=request.region)
        iteration = 0
        task_complete = False
        history = []
        created_files = []
        approved_plan = request.approved_plan

        # 計画がある場合
        current_phase_idx = 0
        phases = approved_plan.get('phases', []) if approved_plan else []
        total_phases = len(phases)

        if approved_plan:
            task_manager.add_log(task_id, "plan", f"計画読み込み: {approved_plan.get('project_name', 'N/A')} ({total_phases}フェーズ)")
            if phases:
                phase_names = [f"Phase {p.get('phase_id', i+1)}: {p.get('name', '不明')}" for i, p in enumerate(phases)]
                task_manager.add_log(task_id, "plan", f"フェーズ一覧: {', '.join(phase_names)}")
            task_manager.update_task(task_id, {
                "current_phase": f"Phase 1/{total_phases}" if phases else "計画なし",
                "current_phase_name": phases[0].get('name', '') if phases else '',
                "total_phases": total_phases,
                "phases": phases,
            })

        while not task_complete and iteration < request.max_iterations:
            # タスクがキャンセルされたかチェック
            current_task = task_manager.get_task(task_id)
            if current_task and current_task.get("status") == "cancelled":
                task_manager.add_log(task_id, "info", "タスクがキャンセルされました")
                break

            iteration += 1
            task_manager.update_task(task_id, {"iteration": iteration})
            task_manager.add_log(task_id, "iteration", f"イテレーション {iteration} 開始")

            # 追加指示を取得
            pending_instructions = task_manager.get_pending_instructions(task_id)
            additional_instructions_text = ""
            if pending_instructions:
                instructions_list = [f"- {inst['instruction']}" for inst in pending_instructions]
                additional_instructions_text = "\n\n## 【重要】ユーザーからの追加指示\n以下の指示を必ず優先して反映してください：\n" + "\n".join(instructions_list)
                task_manager.add_log(task_id, "instruction", f"{len(pending_instructions)}件の追加指示を反映中")
                # 指示を適用済みにマーク
                task = task_manager.get_task(task_id)
                instructions = task.get("additional_instructions", [])
                for i, inst in enumerate(instructions):
                    if not inst.get("applied"):
                        instructions[i]["applied"] = True
                task_manager.update_task(task_id, {"additional_instructions": instructions})

            # 現在のワークスペース状態を取得
            current_files = []
            file_contents = {}
            for item in workspace_path.rglob('*'):
                if item.is_file() and not item.name.startswith('_'):
                    rel_path = str(item.relative_to(workspace_path))
                    current_files.append(rel_path)
                    suffix = item.suffix.lower()
                    if suffix in ['.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.md', '.txt', '.json', '.yaml', '.yml', '.html', '.css', '.sh', '.asm', '.s', '.makefile', '.cmake']:
                        try:
                            content = item.read_text(encoding='utf-8')
                            file_contents[rel_path] = content[:3000]
                        except:
                            pass

            files_summary = "\n".join([f"- {f}" for f in current_files[:50]])
            contents_summary = "\n\n".join([f"### {path}\n```\n{content}\n```" for path, content in list(file_contents.items())[:10]])
            history_text = "\n".join([f"- イテレーション{h['iteration']}: {h['action']}" for h in history[-5:]])

            # 計画情報を構築（フェーズ完了状態を含む）
            plan_section = ""
            if phases:
                # 各フェーズの完了状態を計算
                phase_completion_status = []
                first_incomplete_phase = None

                for i, phase in enumerate(phases):
                    phase_id = phase.get('phase_id', i + 1)
                    files_to_create = phase.get('files_to_create', [])

                    # このフェーズで作成すべきファイルのうち、存在するものをカウント
                    required_files = [f.get('path', '') for f in files_to_create if f.get('path')]
                    existing_files = [f for f in required_files if f in current_files]

                    is_complete = len(existing_files) == len(required_files) and len(required_files) > 0
                    completion_percent = (len(existing_files) / len(required_files) * 100) if required_files else 0

                    phase_completion_status.append({
                        'phase_id': phase_id,
                        'is_complete': is_complete,
                        'existing_count': len(existing_files),
                        'total_count': len(required_files),
                        'missing_files': [f for f in required_files if f not in current_files]
                    })

                    if not is_complete and first_incomplete_phase is None:
                        first_incomplete_phase = phase_id

                plan_section = f"""
## 承認済み計画
プロジェクト: {approved_plan.get('project_name', 'N/A')}
全{total_phases}フェーズ:
"""
                for i, phase in enumerate(phases):
                    phase_id = phase.get('phase_id', i + 1)
                    phase_name = phase.get('name', '不明')
                    phase_desc = phase.get('description', '')
                    files_to_create = phase.get('files_to_create', [])
                    file_list = ', '.join([f.get('path', '') for f in files_to_create[:5]])
                    if len(files_to_create) > 5:
                        file_list += f" 他{len(files_to_create) - 5}ファイル"

                    # 完了状態を表示
                    status = phase_completion_status[i]
                    if status['is_complete']:
                        status_mark = "✅完了"
                    elif status['existing_count'] > 0:
                        status_mark = f"🔄進行中 ({status['existing_count']}/{status['total_count']}ファイル)"
                    else:
                        status_mark = "⏳未着手"

                    plan_section += f"  Phase {phase_id}: [{status_mark}] {phase_name} - {phase_desc[:50]}... (ファイル: {file_list})\n"

                # 次に取り組むべきフェーズを明示
                if first_incomplete_phase:
                    incomplete_status = phase_completion_status[first_incomplete_phase - 1]
                    missing_files_str = ', '.join(incomplete_status['missing_files'][:5])
                    if len(incomplete_status['missing_files']) > 5:
                        missing_files_str += f" 他{len(incomplete_status['missing_files']) - 5}ファイル"

                    plan_section += f"""
## 【最重要】次に取り組むべきフェーズ
**Phase {first_incomplete_phase}** を実行してください。
未作成ファイル: {missing_files_str}

【注意】完了済みのフェーズ（✅マーク）には戻らないでください。
current_phase_id には {first_incomplete_phase} を設定してください。
"""
                else:
                    plan_section += """
## 全フェーズ完了
全てのフェーズが完了しています。is_complete: true で回答してください。
"""

            # 指揮者プロンプト
            max_parallel = request.max_parallel_workers
            conductor_prompt = f"""あなたは自律型AIプロジェクトマネージャーです。効率を最大化するため、可能な限り並列実行を活用してください。

## 目標タスク
{request.task}
{plan_section}{additional_instructions_text}
## 【重要】並列実行設定
- 利用可能なワーカーモデル数: {worker_count}個
- **最大同時並列実行数: {max_parallel}個**
- 【効率化のため、依存関係のないファイルは必ず{max_parallel}個まで同時に生成してください】
- 1つずつ生成するのは非効率です。可能な限り多くのファイルを一度に生成してください。

## 現在のワークスペース状態
### ファイル一覧
{files_summary if files_summary else '(空)'}

### ファイル内容
{contents_summary if contents_summary else '(ファイルなし)'}

## これまでの履歴
{history_text if history_text else '(初回)'}

## 指示
1. 現在の進捗状況を分析してください
2. タスクが完了したかどうか判定してください
3. 完了していない場合:
   - 【最重要】依存関係のないファイルは **最大{max_parallel}個まで** 同時に生成できます
   - parallel_tasks配列に **できるだけ多くのタスク** を入れてください
   - 例: 10ファイル必要なら、10個全てをparallel_tasksに入れる
{"4. 【最重要】ユーザーからの追加指示がある場合は、必ずそれを優先して反映してください" if additional_instructions_text else ""}

以下のJSON形式で回答してください:
```json
{{
  "current_phase_id": 現在実行中のフェーズID（計画がある場合は必須、1から始まる数値）,
  "current_phase_name": "現在のフェーズ名",
  "analysis": "現在の状況分析",
  "progress_percent": 0-100の数値,
  "is_complete": true/false,
  "parallel_tasks": [
    {{
      "task_id": 1,
      "type": "create_file",
      "file_path": "ファイルパス",
      "description": "このファイルで何を実装するか",
      "dependencies": []
    }},
    {{
      "task_id": 2,
      "type": "create_file",
      "file_path": "別のファイルパス",
      "description": "このファイルで何を実装するか",
      "dependencies": []
    }}
  ],
  "completion_reason": "完了の場合、その理由"
}}
```

**注意**: parallel_tasksには依存関係のないタスクを最大{max_parallel}個まで含めることができます。効率のため、可能な限り多くのタスクを同時に実行してください。
計画がある場合は、必ずcurrent_phase_idとcurrent_phase_nameを回答してください。"""

            import time
            start_time = time.time()

            loop = asyncio.get_event_loop()
            conductor_result = await loop.run_in_executor(
                None,
                executor.invoke_model,
                request.conductor_model_id,
                conductor_prompt,
                request.max_tokens,
                0.3,
                0
            )

            elapsed = time.time() - start_time

            if not conductor_result.get('success'):
                task_manager.add_log(task_id, "error", f"指揮者エラー: {conductor_result.get('error', 'Unknown')}")
                continue

            # 指揮者の出力をログに追加
            conductor_output = conductor_result.get('output', '')
            conductor_preview = conductor_output[:300].replace('\n', ' ')
            if len(conductor_output) > 300:
                conductor_preview += '...'
            task_manager.add_log(task_id, "conductor", f"[{request.conductor_model_id}] ({elapsed:.1f}秒) {conductor_preview}")

            # JSONを抽出
            output = conductor_result.get('output', '')
            json_match = re.search(r'```json\s*(.*?)\s*```', output, re.DOTALL)

            if not json_match:
                history.append({'iteration': iteration, 'action': 'JSON解析失敗'})
                task_manager.add_log(task_id, "error", "JSON解析失敗")
                continue

            try:
                decision = json.loads(json_match.group(1))
            except json.JSONDecodeError:
                history.append({'iteration': iteration, 'action': 'JSON解析失敗'})
                task_manager.add_log(task_id, "error", "JSONデコード失敗")
                continue

            progress = decision.get('progress_percent', 0)
            is_complete = decision.get('is_complete', False)
            analysis = decision.get('analysis', '')
            parallel_tasks = decision.get('parallel_tasks', [])
            next_action = decision.get('next_action', {})

            # フェーズ情報を取得
            new_phase_id = decision.get('current_phase_id')
            current_phase_name = decision.get('current_phase_name', '')

            # フェーズIDが指定されていない場合は現在のフェーズを維持
            if new_phase_id is None:
                new_phase_id = current_phase_idx + 1  # 1-indexed

            # フェーズ更新のログ（フェーズが変わった場合、または初回のPhase 1）
            if phases:
                if new_phase_id != current_phase_idx + 1 or (iteration == 1 and new_phase_id == 1):
                    current_phase_idx = new_phase_id - 1
                    if 0 <= current_phase_idx < len(phases):
                        phase_info = phases[current_phase_idx]
                        phase_name = phase_info.get('name', current_phase_name or '不明')
                        task_manager.add_log(task_id, "phase", f"📍 Phase {new_phase_id}/{total_phases}: {phase_name}")

            current_phase_id = new_phase_id

            # タスク状態を更新
            update_data = {
                "progress": progress,
                "analysis": analysis,
                "history": history[-20:]
            }
            if phases:
                update_data["current_phase"] = f"Phase {current_phase_id}/{total_phases}"
                update_data["current_phase_name"] = current_phase_name or (phases[current_phase_idx].get('name', '') if 0 <= current_phase_idx < len(phases) else '')
                update_data["current_phase_id"] = current_phase_id

            task_manager.update_task(task_id, update_data)

            # ログにフェーズ情報を含める
            phase_info_str = f" [Phase {current_phase_id}/{total_phases}]" if phases else ""
            task_manager.add_log(task_id, "decision", f"進捗 {progress}%{phase_info_str}: {analysis[:80]}")

            if is_complete:
                task_complete = True
                task_manager.add_log(task_id, "success", f"タスク完了: {decision.get('completion_reason', '')}")
                break

            # 並列タスクを実行
            if parallel_tasks and request.parallel_mode:
                actual_parallel = min(len(parallel_tasks), worker_count, request.max_parallel_workers)
                task_manager.add_log(task_id, "parallel", f"並列実行開始: {len(parallel_tasks)}タスク（同時実行: {actual_parallel}、最大設定: {request.max_parallel_workers}）")

                from concurrent.futures import ThreadPoolExecutor, as_completed

                def execute_parallel_task(task_info, worker_model_id, task_index):
                    file_path = task_info.get('file_path', '')
                    description = task_info.get('description', '')

                    if not file_path:
                        return None

                    # ワーカー開始ログ
                    task_manager.add_log(task_id, "worker", f"[{worker_model_id}] {file_path} の生成開始")

                    gen_prompt = f"""以下のファイルを生成してください。

## ファイルパス
{file_path}

## 全体タスク
{request.task}

## このファイルの要求
{description}

## 現在のワークスペース
{contents_summary if contents_summary else '(空)'}

## 出力形式
ファイルの内容のみを出力してください。説明文やマークダウンのコードブロック(```)は不要です。"""

                    result = executor.invoke_model(
                        worker_model_id,
                        gen_prompt,
                        request.max_tokens * 2,
                        request.temperature,
                        task_index
                    )

                    if result.get('success'):
                        file_content = result.get('output', '')
                        file_content = re.sub(r'^```\w*\n?', '', file_content)
                        file_content = re.sub(r'\n?```$', '', file_content)
                        file_content = file_content.strip()

                        full_path = workspace_path / file_path
                        full_path.parent.mkdir(parents=True, exist_ok=True)
                        full_path.write_text(file_content, encoding='utf-8')

                        # 出力のプレビューをログに追加
                        preview = file_content[:200].replace('\n', ' ')
                        if len(file_content) > 200:
                            preview += '...'
                        task_manager.add_log(task_id, "output", f"[{worker_model_id}] {file_path}: {preview}")

                        return {'file_path': file_path, 'success': True, 'model': worker_model_id, 'content_length': len(file_content)}

                    task_manager.add_log(task_id, "error", f"[{worker_model_id}] {file_path} の生成失敗: {result.get('error', 'Unknown')}")
                    return {'file_path': file_path, 'success': False, 'error': result.get('error'), 'model': worker_model_id}

                actual_workers = min(len(parallel_tasks), worker_count, request.max_parallel_workers)
                task_manager.update_task(task_id, {"active_workers": actual_workers})

                with ThreadPoolExecutor(max_workers=actual_workers) as pool:
                    futures = {}
                    for i, task_info in enumerate(parallel_tasks):
                        worker_model = request.worker_model_ids[i % worker_count]
                        future = pool.submit(execute_parallel_task, task_info, worker_model, i)
                        futures[future] = task_info

                    completed_count = 0
                    for future in as_completed(futures):
                        result = future.result()
                        completed_count += 1
                        remaining = len(futures) - completed_count
                        task_manager.update_task(task_id, {"active_workers": min(remaining, actual_workers)})

                        if result:
                            if result.get('success'):
                                created_files.append(result['file_path'])
                                task_manager.add_log(task_id, "file", f"ファイル作成: {result['file_path']}")
                            else:
                                task_manager.add_log(task_id, "error", f"ファイル作成失敗: {result['file_path']}")

                task_manager.update_task(task_id, {"files_created": created_files})
                history.append({'iteration': iteration, 'action': f'並列実行: {len(parallel_tasks)}タスク'})

            elif next_action:
                action_type = next_action.get('type', '')
                file_path = next_action.get('file_path', '')

                if action_type in ['create_file', 'modify_file'] and file_path:
                    gen_prompt = f"""以下のファイルを生成してください。

## ファイルパス
{file_path}

## タスク
{request.task}

## 要求
{next_action.get('description', '')}

ファイルの内容のみを出力してください。"""

                    gen_result = await loop.run_in_executor(
                        None,
                        executor.invoke_model,
                        request.conductor_model_id,
                        gen_prompt,
                        request.max_tokens * 2,
                        request.temperature,
                        0
                    )

                    if gen_result.get('success'):
                        file_content = gen_result.get('output', '')
                        file_content = re.sub(r'^```\w*\n?', '', file_content)
                        file_content = re.sub(r'\n?```$', '', file_content)

                        full_path = workspace_path / file_path
                        full_path.parent.mkdir(parents=True, exist_ok=True)
                        full_path.write_text(file_content, encoding='utf-8')
                        created_files.append(file_path)

                        task_manager.add_log(task_id, "file", f"ファイル作成: {file_path}")
                        task_manager.update_task(task_id, {"files_created": created_files})
                        history.append({'iteration': iteration, 'action': f'ファイル作成: {file_path}'})

            await asyncio.sleep(0.5)

        # 完了
        task_manager.update_task(task_id, {
            "status": "completed" if task_complete else "stopped",
            "completed_at": datetime.now().isoformat(),
            "is_complete": task_complete,
            "files_created": created_files
        })
        task_manager.add_log(task_id, "info", f"処理終了: {iteration}イテレーション, {len(created_files)}ファイル作成")

    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        task_manager.update_task(task_id, {
            "status": "error",
            "error": str(e),
            "completed_at": datetime.now().isoformat()
        })
        task_manager.add_log(task_id, "error", f"エラー発生: {str(e)}")


class CancelTaskRequest(BaseModel):
    purge_files: bool = False  # 作成されたファイルを削除するか
    purge_logs: bool = False   # ログを削除するか


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str, request: CancelTaskRequest = None):
    """実行中のタスクをキャンセル（オプションでファイル・ログをパージ）"""
    if request is None:
        request = CancelTaskRequest()

    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"タスク '{task_id}' が見つかりません")

    # running以外でもパージは許可
    if task.get("status") == "running":
        task_manager.update_task(task_id, {"status": "cancelled"})
        task_manager.add_log(task_id, "info", "キャンセルリクエストを受信")

    purged_files = []
    purged_logs = False

    # ファイルをパージ
    if request.purge_files:
        workspace_name = task.get("workspace")
        files_created = task.get("files_created", [])
        if workspace_name and files_created:
            workspace_path = WORKSPACE_BASE_PATH / workspace_name
            for file_path in files_created:
                full_path = workspace_path / file_path
                try:
                    if full_path.exists():
                        full_path.unlink()
                        purged_files.append(file_path)
                        # 空のディレクトリも削除
                        parent = full_path.parent
                        while parent != workspace_path and parent.exists():
                            if not any(parent.iterdir()):
                                parent.rmdir()
                                parent = parent.parent
                            else:
                                break
                except Exception as e:
                    print(f"ファイル削除エラー: {file_path} - {e}")

            task_manager.update_task(task_id, {"files_created": []})
            task_manager.add_log(task_id, "info", f"{len(purged_files)}個のファイルを削除しました")

    # ログをパージ
    if request.purge_logs:
        task_manager._save_logs(task_id, [])
        purged_logs = True

    return {
        "success": True,
        "message": "キャンセルしました",
        "purged_files": purged_files,
        "purged_logs": purged_logs
    }


class AddInstructionRequest(BaseModel):
    instruction: str  # 追加指示


@router.post("/tasks/{task_id}/instruction")
async def add_task_instruction(task_id: str, request: AddInstructionRequest):
    """実行中のタスクに追加指示を送信"""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"タスク '{task_id}' が見つかりません")

    if task.get("status") != "running":
        raise HTTPException(status_code=400, detail="実行中のタスクにのみ指示を追加できます")

    if not request.instruction.strip():
        raise HTTPException(status_code=400, detail="指示を入力してください")

    success = task_manager.add_instruction(task_id, request.instruction.strip())
    if not success:
        raise HTTPException(status_code=500, detail="指示の追加に失敗しました")

    return {
        "success": True,
        "message": "追加指示を送信しました。次のイテレーションで反映されます。",
        "instruction": request.instruction.strip()
    }


@router.get("/tasks/{task_id}/instructions")
async def get_task_instructions(task_id: str):
    """タスクの追加指示一覧を取得"""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"タスク '{task_id}' が見つかりません")

    return {
        "instructions": task.get("additional_instructions", []),
        "pending_count": len(task_manager.get_pending_instructions(task_id))
    }


@router.post("/tasks/{task_id}/resume")
async def resume_task(task_id: str, background_tasks: BackgroundTasks):
    """停止したタスクを再開"""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"タスク '{task_id}' が見つかりません")

    if task.get("status") == "running":
        raise HTTPException(status_code=400, detail="タスクは既に実行中です")

    if task.get("is_complete"):
        raise HTTPException(status_code=400, detail="完了したタスクは再開できません")

    workspace_name = task.get("workspace")
    config = task.get("config", {})

    # リクエストを再構築
    request = AutonomousConductorRequest(
        conductor_model_id=config.get("conductor_model_id"),
        worker_model_ids=config.get("worker_model_ids", []),
        task=task.get("task"),
        max_iterations=config.get("max_iterations", 100),
        max_tokens=config.get("max_tokens", 4000),
        temperature=config.get("temperature", 0.7),
        region=config.get("region", "us-east-1"),
        parallel_mode=config.get("parallel_mode", True),
        approved_plan=config.get("approved_plan")
    )

    # 新しいタスクIDで再開（履歴は引き継ぎ）
    new_task_id = task_manager.create_task(
        workspace=workspace_name,
        task=task.get("task"),
        config=config
    )

    # 前回の進捗を引き継ぐ
    task_manager.update_task(new_task_id, {
        "resumed_from": task_id,
        "files_created": task.get("files_created", []),
        "history": task.get("history", [])
    })
    task_manager.add_log(new_task_id, "info", f"タスク {task_id} から再開")

    # バックグラウンドで実行
    background_tasks.add_task(run_autonomous_background, new_task_id, workspace_name, request)

    return {
        "success": True,
        "task_id": new_task_id,
        "resumed_from": task_id,
        "message": "タスクを再開しました"
    }
