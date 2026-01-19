"""
壁打ち（ディベート/ブレインストーミング）エンドポイント
"""
import asyncio
import json
import uuid
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.requests import DebateRequest, HumanInputRequest
from services.bedrock_executor import BedrockParallelExecutor

router = APIRouter(prefix="/api", tags=["debate"])

# セッション管理（ユーザー入力待ち用）
debate_sessions: dict[str, asyncio.Queue] = {}

MODE_PROMPTS = {
    "debate": "あなたはディベートの参加者です。相手の意見に対して建設的に反論し、自分の立場を明確に主張してください。",
    "brainstorm": "あなたはブレインストーミングの参加者です。他の参加者のアイデアを発展させ、新しい視点やアイデアを追加してください。",
    "critique": "あなたは批評家です。提示された内容の長所と短所を分析し、改善点を提案してください。"
}


@router.post("/debate")
async def execute_debate(request: DebateRequest):
    """モデル同士の壁打ち（ディベート/ブレインストーミング）を実行"""
    if len(request.model_ids) < 2:
        raise HTTPException(status_code=400, detail="壁打ちには2つ以上のモデルが必要です")
    
    try:
        executor = BedrockParallelExecutor(region=request.region)
        system_prompt = MODE_PROMPTS.get(request.mode, MODE_PROMPTS["debate"])
        
        conversation_history = []
        all_results = []
        
        initial_prompt = f"""【トピック】{request.topic}

{system_prompt}

このトピックについて、あなたの見解を述べてください。"""
        
        print(f"🎭 壁打ち開始: {request.mode}モード, {request.rounds}ラウンド")
        print(f"   参加モデル: {request.model_ids}")
        print(f"   トピック: {request.topic[:50]}...")
        
        loop = asyncio.get_event_loop()
        
        for round_num in range(request.rounds):
            print(f"\n📍 ラウンド {round_num + 1}/{request.rounds}")
            round_results = []
            
            for i, model_id in enumerate(request.model_ids):
                if round_num == 0 and i == 0:
                    current_prompt = initial_prompt
                else:
                    prev_statements = "\n\n".join([
                        f"【{r['model_id'].split('.')[-1]}の発言】\n{r['output']}"
                        for r in conversation_history[-len(request.model_ids):]
                    ])
                    current_prompt = f"""【トピック】{request.topic}

{system_prompt}

【これまでの議論】
{prev_statements}

上記の議論を踏まえて、あなたの見解を述べてください。"""
                
                result = await loop.run_in_executor(
                    None,
                    lambda mid=model_id, cp=current_prompt, idx=round_num * len(request.model_ids) + i: 
                        executor.invoke_model_with_reasoning(
                            mid, cp, request.max_tokens, request.temperature, idx,
                            request.enable_reasoning, request.reasoning_budget_tokens
                        ) if request.enable_reasoning else executor.invoke_model(
                            mid, cp, request.max_tokens, request.temperature, idx
                        )
                )
                
                result["round"] = round_num + 1
                result["speaker_index"] = i
                result["skipped"] = not result["success"]  # エラー時はスキップ扱い
                
                # 成功した場合のみ会話履歴に追加（次の発言者の参照用）
                if result["success"]:
                    conversation_history.append(result)
                
                round_results.append(result)
                
                status = "✅" if result["success"] else "⏭️ スキップ"
                model_short = model_id.split('.')[-1][:20]
                print(f"   {status} [{model_short}]: {result['elapsed_time']:.2f}秒")
            
            all_results.append({
                "round": round_num + 1,
                "results": round_results
            })
        
        print(f"\n✨ 壁打ち完了！")
        
        # スキップされたモデルをカウント
        skipped_count = sum(1 for round_data in all_results for r in round_data["results"] if r.get("skipped"))
        if skipped_count > 0:
            print(f"   ⏭️ {skipped_count}件のモデルエラーをスキップしました")
        
        return {
            "mode": request.mode,
            "topic": request.topic,
            "total_rounds": request.rounds,
            "participants": request.model_ids,
            "enable_reasoning": request.enable_reasoning,
            "rounds": all_results,
            "summary": {
                "total_exchanges": len(conversation_history),
                "success_count": sum(1 for r in conversation_history if r["success"]),
                "skipped_count": skipped_count,
                "total_time": sum(r["elapsed_time"] for r in conversation_history)
            }
        }
        
    except Exception as e:
        import traceback
        print(f"❌ エラー: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/debate-stream")
async def execute_debate_stream(request: DebateRequest):
    """モデル同士の壁打ち（ストリーミング版）"""
    if len(request.model_ids) < 2:
        raise HTTPException(status_code=400, detail="壁打ちには2つ以上のモデルが必要です")
    
    # セッションID生成（ユーザー参加時のみ）
    session_id = str(uuid.uuid4()) if request.include_human else None
    if session_id:
        debate_sessions[session_id] = asyncio.Queue()
    
    async def generate():
        try:
            executor = BedrockParallelExecutor(region=request.region)
            system_prompt = MODE_PROMPTS.get(request.mode, MODE_PROMPTS["debate"])
            conversation_history = []
            skipped_count = 0  # スキップされたモデルをカウント
            
            # 参加者リスト（ユーザー含む場合）
            participants = list(request.model_ids)
            if request.include_human:
                participants.append("human")
            
            initial_prompt = f"""【トピック】{request.topic}

{system_prompt}

このトピックについて、あなたの見解を述べてください。"""
            
            yield f"data: {json.dumps({'type': 'start', 'mode': request.mode, 'topic': request.topic, 'total_rounds': request.rounds, 'participants': participants, 'session_id': session_id})}\n\n"
            
            loop = asyncio.get_event_loop()
            
            for round_num in range(request.rounds):
                yield f"data: {json.dumps({'type': 'round_start', 'round': round_num + 1})}\n\n"
                
                # モデルの発言
                for i, model_id in enumerate(request.model_ids):
                    yield f"data: {json.dumps({'type': 'speaking', 'round': round_num + 1, 'speaker_index': i, 'model_id': model_id})}\n\n"
                    
                    if round_num == 0 and i == 0:
                        current_prompt = initial_prompt
                    else:
                        prev_statements = "\n\n".join([
                            f"【{'あなた' if r['model_id'] == 'human' else r['model_id'].split('.')[-1]}の発言】\n{r['output']}"
                            for r in conversation_history[-len(participants):]
                        ])
                        current_prompt = f"""【トピック】{request.topic}

{system_prompt}

【これまでの議論】
{prev_statements}

上記の議論を踏まえて、あなたの見解を述べてください。"""
                    
                    result = await loop.run_in_executor(
                        None,
                        lambda mid=model_id, cp=current_prompt, idx=round_num * len(participants) + i:
                            executor.invoke_model_with_reasoning(
                                mid, cp, request.max_tokens, request.temperature, idx,
                                request.enable_reasoning, request.reasoning_budget_tokens
                            ) if request.enable_reasoning else executor.invoke_model(
                                mid, cp, request.max_tokens, request.temperature, idx
                            )
                    )
                    
                    result["round"] = round_num + 1
                    result["speaker_index"] = i
                    result["skipped"] = not result["success"]  # エラー時はスキップ扱い
                    
                    # 成功した場合のみ会話履歴に追加（次の発言者の参照用）
                    if result["success"]:
                        conversation_history.append(result)
                    else:
                        skipped_count += 1
                    
                    yield f"data: {json.dumps({'type': 'speech', 'data': result})}\n\n"
                    await asyncio.sleep(0)
                
                # ユーザーの発言（include_humanがTrueの場合）
                if request.include_human and session_id:
                    human_speaker_index = len(request.model_ids)
                    yield f"data: {json.dumps({'type': 'waiting_human', 'round': round_num + 1, 'speaker_index': human_speaker_index, 'session_id': session_id})}\n\n"
                    
                    # ユーザー入力を待つ（タイムアウト: 5分）
                    try:
                        human_message = await asyncio.wait_for(
                            debate_sessions[session_id].get(),
                            timeout=300.0
                        )
                        
                        # スキップの場合は発言を記録しない
                        if human_message == "[スキップ]":
                            yield f"data: {json.dumps({'type': 'speech', 'data': {'model_id': 'human', 'output': '（スキップ）', 'success': True, 'elapsed_time': 0.0, 'round': round_num + 1, 'speaker_index': human_speaker_index, 'skipped': True}})}\n\n"
                        else:
                            human_result = {
                                "model_id": "human",
                                "output": human_message,
                                "success": True,
                                "elapsed_time": 0.0,
                                "round": round_num + 1,
                                "speaker_index": human_speaker_index,
                            }
                            conversation_history.append(human_result)
                            
                            yield f"data: {json.dumps({'type': 'speech', 'data': human_result})}\n\n"
                    except asyncio.TimeoutError:
                        yield f"data: {json.dumps({'type': 'error', 'message': 'ユーザー入力がタイムアウトしました'})}\n\n"
                        break
                
                yield f"data: {json.dumps({'type': 'round_end', 'round': round_num + 1})}\n\n"
            
            summary = {
                "total_exchanges": len(conversation_history),
                "success_count": sum(1 for r in conversation_history if r["success"]),
                "skipped_count": skipped_count,
                "total_time": sum(r["elapsed_time"] for r in conversation_history)
            }
            yield f"data: {json.dumps({'type': 'complete', 'summary': summary})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            # セッションクリーンアップ
            if session_id and session_id in debate_sessions:
                del debate_sessions[session_id]
    
    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/debate-human-input")
async def submit_human_input(request: HumanInputRequest):
    """ユーザーの発言を送信"""
    if request.session_id not in debate_sessions:
        raise HTTPException(status_code=404, detail="セッションが見つかりません")
    
    await debate_sessions[request.session_id].put(request.message)
    return {"status": "ok"}
