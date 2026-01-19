"""
指揮者モード（Conductor Mode）エンドポイント
"""
import asyncio
import json
import re
from fastapi import APIRouter, HTTPException

from models.requests import ConductorRequest
from services.bedrock_executor import BedrockParallelExecutor

router = APIRouter(prefix="/api", tags=["conductor"])


@router.post("/conductor")
async def execute_conductor(request: ConductorRequest):
    """
    指揮者モード：1つのモデル（指揮者）が他のモデル（ワーカー）に指示を出す
    
    モード:
    - delegate: 指揮者がタスクを分割し、各ワーカーに異なるサブタスクを割り当て
    - evaluate: 全ワーカーに同じタスクを実行させ、指揮者が結果を評価・ランキング
    - synthesize: 全ワーカーの回答を指揮者が統合して最終回答を生成
    """
    if len(request.worker_model_ids) < 1:
        raise HTTPException(status_code=400, detail="少なくとも1つのワーカーモデルが必要です")
    
    try:
        executor = BedrockParallelExecutor(region=request.region)
        loop = asyncio.get_event_loop()
        
        print(f"🎼 指揮者モード開始: {request.mode}")
        print(f"   指揮者: {request.conductor_model_id}")
        print(f"   ワーカー: {len(request.worker_model_ids)}個")
        print(f"   タスク: {request.task[:50]}...")
        
        result = {
            "mode": request.mode,
            "conductor_model": request.conductor_model_id,
            "worker_models": request.worker_model_ids,
            "original_task": request.task,
            "phases": []
        }
        
        if request.mode == "delegate":
            result = await _execute_delegate_mode(request, executor, loop, result)
        elif request.mode == "evaluate":
            result = await _execute_evaluate_mode(request, executor, loop, result)
        elif request.mode == "synthesize":
            result = await _execute_synthesize_mode(request, executor, loop, result)
        
        # サマリー計算
        all_results = []
        for phase in result["phases"]:
            if "results" in phase:
                all_results.extend(phase["results"])
            if "conductor_response" in phase:
                all_results.append(phase["conductor_response"])
        
        result["summary"] = {
            "total_calls": len(all_results),
            "success_count": sum(1 for r in all_results if r.get("success")),
            "total_time": sum(r.get("elapsed_time", 0) for r in all_results),
            "total_cost": sum(r.get("cost", {}).get("total_cost", 0) for r in all_results if r.get("success"))
        }
        
        print(f"\n✨ 指揮者モード完了！")
        return result
        
    except Exception as e:
        import traceback
        print(f"❌ エラー: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


async def _execute_delegate_mode(request, executor, loop, result):
    """タスク分割モード"""
    # Phase 1: 指揮者がタスクを分割
    delegate_prompt = f"""あなたは複数のAIモデルを指揮する「指揮者」です。
以下のタスクを{len(request.worker_model_ids)}個のサブタスクに分割してください。

【元のタスク】
{request.task}

【ワーカーモデル数】
{len(request.worker_model_ids)}個

以下のJSON形式で出力してください：
```json
{{
  "subtasks": [
    {{"id": 1, "task": "サブタスク1の内容", "focus": "このサブタスクの焦点"}},
    {{"id": 2, "task": "サブタスク2の内容", "focus": "このサブタスクの焦点"}}
  ],
  "integration_strategy": "結果をどう統合するかの説明"
}}
```"""
    
    print(f"\n📋 Phase 1: タスク分割中...")
    conductor_result = await loop.run_in_executor(
        None,
        executor.invoke_model,
        request.conductor_model_id,
        delegate_prompt,
        request.max_tokens,
        0.3,
        0
    )
    
    result["phases"].append({
        "phase": "task_delegation",
        "conductor_response": conductor_result
    })
    
    if not conductor_result["success"]:
        return result
    
    # JSONを抽出
    json_match = re.search(r'```json\s*(.*?)\s*```', conductor_result["output"], re.DOTALL)
    if json_match:
        try:
            subtasks_data = json.loads(json_match.group(1))
            subtasks = subtasks_data.get("subtasks", [])
        except:
            subtasks = [{"id": i+1, "task": request.task} for i in range(len(request.worker_model_ids))]
    else:
        subtasks = [{"id": i+1, "task": request.task} for i in range(len(request.worker_model_ids))]
    
    # Phase 2: 各ワーカーにサブタスクを実行させる
    print(f"\n🔧 Phase 2: ワーカー実行中...")
    worker_results = []
    for i, (model_id, subtask) in enumerate(zip(request.worker_model_ids, subtasks)):
        task_content = subtask.get("task", request.task) if isinstance(subtask, dict) else subtask
        worker_prompt = f"""以下のタスクを実行してください：

{task_content}

詳細かつ具体的に回答してください。"""
        
        worker_result = await loop.run_in_executor(
            None,
            executor.invoke_model,
            model_id,
            worker_prompt,
            request.max_tokens,
            request.temperature,
            i
        )
        worker_result["assigned_subtask"] = subtask
        worker_results.append(worker_result)
        
        status = "✅" if worker_result["success"] else "❌"
        print(f"   {status} Worker {i+1}: {model_id.split('.')[-1][:20]}")
    
    result["phases"].append({
        "phase": "worker_execution",
        "results": worker_results
    })
    
    # Phase 3: 指揮者が結果を統合
    print(f"\n🎯 Phase 3: 結果統合中...")
    worker_outputs = "\n\n".join([
        f"【ワーカー{i+1} ({r['model_id'].split('.')[-1][:20]})】\nサブタスク: {r.get('assigned_subtask', {}).get('task', 'N/A')[:50]}...\n回答:\n{r['output'][:500]}..."
        for i, r in enumerate(worker_results) if r["success"]
    ])
    
    synthesis_prompt = f"""あなたは指揮者として、複数のワーカーの回答を統合します。

【元のタスク】
{request.task}

【各ワーカーの回答】
{worker_outputs}

上記の回答を統合し、元のタスクに対する包括的な最終回答を作成してください。
各ワーカーの良い点を活かし、矛盾があれば解決してください。"""
    
    synthesis_result = await loop.run_in_executor(
        None,
        executor.invoke_model,
        request.conductor_model_id,
        synthesis_prompt,
        request.max_tokens * 2,
        request.temperature,
        99
    )
    
    result["phases"].append({
        "phase": "synthesis",
        "conductor_response": synthesis_result
    })
    result["final_answer"] = synthesis_result.get("output", "")
    
    return result


async def _execute_evaluate_mode(request, executor, loop, result):
    """評価モード"""
    # 全ワーカーに同じタスクを実行させる
    print(f"\n🔧 Phase 1: 全ワーカー並列実行中...")
    worker_results = await loop.run_in_executor(
        None,
        executor.execute_parallel_models,
        request.worker_model_ids,
        request.task,
        request.max_tokens,
        request.temperature,
        len(request.worker_model_ids)
    )
    
    result["phases"].append({
        "phase": "worker_execution",
        "results": worker_results
    })
    
    # 指揮者が評価
    print(f"\n📊 Phase 2: 指揮者による評価中...")
    worker_outputs = "\n\n".join([
        f"【回答{i+1} - {r['model_id'].split('.')[-1][:20]}】\n{r['output']}"
        for i, r in enumerate(worker_results) if r["success"]
    ])
    
    eval_prompt = f"""あなたは審査員として、複数のAIモデルの回答を評価します。

【タスク】
{request.task}

【各モデルの回答】
{worker_outputs}

以下の観点で各回答を評価し、ランキングを作成してください：
1. 正確性
2. 完全性
3. 明確さ
4. 実用性

JSON形式で出力してください：
```json
{{
  "ranking": [
    {{"rank": 1, "model": "モデル名", "score": 95, "strengths": ["強み1"], "weaknesses": ["弱み1"]}},
    ...
  ],
  "best_answer_summary": "最も優れた回答の要約",
  "overall_analysis": "全体的な分析"
}}
```"""
    
    eval_result = await loop.run_in_executor(
        None,
        executor.invoke_model,
        request.conductor_model_id,
        eval_prompt,
        request.max_tokens * 2,
        0.3,
        99
    )
    
    result["phases"].append({
        "phase": "evaluation",
        "conductor_response": eval_result
    })
    result["final_answer"] = eval_result.get("output", "")
    
    return result


async def _execute_synthesize_mode(request, executor, loop, result):
    """統合モード"""
    # 全ワーカーに同じタスクを実行させる
    print(f"\n🔧 Phase 1: 全ワーカー並列実行中...")
    worker_results = await loop.run_in_executor(
        None,
        executor.execute_parallel_models,
        request.worker_model_ids,
        request.task,
        request.max_tokens,
        request.temperature,
        len(request.worker_model_ids)
    )
    
    result["phases"].append({
        "phase": "worker_execution",
        "results": worker_results
    })
    
    # 指揮者が統合
    print(f"\n🎯 Phase 2: 回答統合中...")
    worker_outputs = "\n\n".join([
        f"【{r['model_id'].split('.')[-1][:25]}の回答】\n{r['output']}"
        for r in worker_results if r["success"]
    ])
    
    synth_prompt = f"""あなたは複数のAIモデルの回答を統合する専門家です。

【タスク】
{request.task}

【各モデルの回答】
{worker_outputs}

上記の全ての回答から最良の要素を抽出し、統合された最終回答を作成してください。
- 各回答の優れた点を活かす
- 矛盾する情報は最も信頼性の高いものを採用
- 不足している情報があれば補完
- 読みやすく構造化された形式で出力"""
    
    synth_result = await loop.run_in_executor(
        None,
        executor.invoke_model,
        request.conductor_model_id,
        synth_prompt,
        request.max_tokens * 2,
        request.temperature,
        99
    )
    
    result["phases"].append({
        "phase": "synthesis",
        "conductor_response": synth_result
    })
    result["final_answer"] = synth_result.get("output", "")
    
    return result
