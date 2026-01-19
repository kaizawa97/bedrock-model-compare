"""
ベンチマーク自動実行 & レポート生成
複数モデルの性能を自動評価してレポートを生成
"""
import asyncio
import time
from typing import Dict, List, Optional
from datetime import datetime
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor
import json

from .pricing import MODEL_PRICING, calculate_cost, estimate_tokens
from .bedrock_executor import BedrockParallelExecutor


@dataclass
class BenchmarkTask:
    """ベンチマークタスク定義"""
    id: str
    name: str
    category: str
    prompt: str
    expected_capabilities: List[str]
    difficulty: str = "medium"  # easy, medium, hard
    max_tokens: int = 500


@dataclass
class BenchmarkResult:
    """ベンチマーク結果"""
    task_id: str
    model_id: str
    success: bool
    output: str
    latency_seconds: float
    input_tokens: int
    output_tokens: int
    cost_usd: float
    timestamp: datetime
    error: Optional[str] = None
    quality_score: Optional[float] = None  # 品質スコア（0-100）
    quality_feedback: Optional[str] = None  # 品質評価のフィードバック


class BenchmarkSuite:
    """ベンチマークスイート"""
    
    # 品質評価用のプロンプトテンプレート
    QUALITY_EVAL_PROMPT = """あなたは回答品質の評価者です。以下のタスクに対する回答を0-100点で採点してください。

【タスク】
{task_prompt}

【回答】
{response}

【採点基準】
- 正確性（40点）: 回答が正確で事実に基づいているか
- 完全性（30点）: 質問に対して十分に答えているか
- 明瞭性（30点）: 回答が明確で理解しやすいか

以下のJSON形式で回答してください:
{{"score": <0-100の整数>, "feedback": "<簡潔な評価コメント>"}}"""

    # 評価に使用するモデル（コスト効率の良いモデル）
    EVALUATOR_MODEL = "us.amazon.nova-lite-v1:0"
    
    # 標準ベンチマークタスク
    STANDARD_TASKS = [
        BenchmarkTask(
            id="simple_qa_1",
            name="シンプルQA: 事実確認",
            category="simple_qa",
            prompt="日本の首都はどこですか？一言で答えてください。",
            expected_capabilities=["basic_knowledge"],
            difficulty="easy",
            max_tokens=50
        ),
        BenchmarkTask(
            id="simple_qa_2",
            name="シンプルQA: 計算",
            category="simple_qa",
            prompt="123 + 456 = ? 数字のみで答えてください。",
            expected_capabilities=["basic_math"],
            difficulty="easy",
            max_tokens=20
        ),
        BenchmarkTask(
            id="code_gen_1",
            name="コード生成: FizzBuzz",
            category="code_generation",
            prompt="Pythonで1から100までのFizzBuzzを実装してください。コードのみを出力してください。",
            expected_capabilities=["code_generation", "python"],
            difficulty="easy",
            max_tokens=300
        ),
        BenchmarkTask(
            id="code_gen_2",
            name="コード生成: バイナリサーチ",
            category="code_generation",
            prompt="Pythonで二分探索アルゴリズムを実装してください。関数名はbinary_searchとし、ソート済みリストと検索値を引数に取ります。",
            expected_capabilities=["code_generation", "algorithm"],
            difficulty="medium",
            max_tokens=400
        ),
        BenchmarkTask(
            id="reasoning_1",
            name="論理推論: 数学パズル",
            category="reasoning",
            prompt="AはBより背が高く、CはBより背が低い。AとCではどちらが背が高いですか？理由も含めて答えてください。",
            expected_capabilities=["logical_reasoning"],
            difficulty="medium",
            max_tokens=200
        ),
        BenchmarkTask(
            id="reasoning_2",
            name="論理推論: 複雑な条件",
            category="reasoning",
            prompt="5人の友人A,B,C,D,Eが一列に並んでいます。AはBの隣、CはDの隣ではない、EはAの右側にいます。可能な並び順を1つ示してください。",
            expected_capabilities=["complex_reasoning"],
            difficulty="hard",
            max_tokens=300
        ),
        BenchmarkTask(
            id="creative_1",
            name="創造性: 短編ストーリー",
            category="brainstorming",
            prompt="「AIと人間の友情」をテーマに、100文字程度の超短編小説を書いてください。",
            expected_capabilities=["creative_writing"],
            difficulty="medium",
            max_tokens=200
        ),
        BenchmarkTask(
            id="analysis_1",
            name="分析: 長所短所",
            category="analysis",
            prompt="リモートワークの長所と短所を各3つずつ、箇条書きで簡潔に述べてください。",
            expected_capabilities=["analysis", "structured_output"],
            difficulty="easy",
            max_tokens=300
        ),
        BenchmarkTask(
            id="doc_1",
            name="ドキュメント: 関数説明",
            category="documentation",
            prompt="以下のPython関数のdocstringを書いてください:\ndef calculate_average(numbers: list) -> float:\n    return sum(numbers) / len(numbers)",
            expected_capabilities=["documentation"],
            difficulty="easy",
            max_tokens=200
        ),
        BenchmarkTask(
            id="multilingual_1",
            name="多言語: 翻訳",
            category="general",
            prompt="「人工知能は私たちの生活を大きく変えています」を英語に翻訳してください。",
            expected_capabilities=["translation"],
            difficulty="easy",
            max_tokens=100
        )
    ]
    
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self.executor = BedrockParallelExecutor(region=region)
        self.results: List[BenchmarkResult] = []
    
    def get_available_tasks(self) -> List[Dict]:
        """利用可能なタスク一覧"""
        return [
            {
                "id": t.id,
                "name": t.name,
                "category": t.category,
                "difficulty": t.difficulty,
                "expected_capabilities": t.expected_capabilities
            }
            for t in self.STANDARD_TASKS
        ]
    
    def _evaluate_quality(self, task_prompt: str, response: str) -> Dict:
        """回答の品質を評価（評価者モデルを使用）"""
        if not response or len(response.strip()) == 0:
            return {"score": 0, "feedback": "回答なし"}
        
        eval_prompt = self.QUALITY_EVAL_PROMPT.format(
            task_prompt=task_prompt,
            response=response[:2000]  # 長すぎる回答は切り詰め
        )
        
        try:
            eval_results = self.executor.execute_parallel_models(
                model_ids=[self.EVALUATOR_MODEL],
                prompt=eval_prompt,
                max_tokens=200,
                temperature=0.1
            )
            
            if eval_results and eval_results[0].get("success"):
                output = eval_results[0]["output"]
                # JSONを抽出
                import re
                json_match = re.search(r'\{[^}]+\}', output)
                if json_match:
                    eval_data = json.loads(json_match.group())
                    score = max(0, min(100, int(eval_data.get("score", 50))))
                    feedback = eval_data.get("feedback", "")
                    return {"score": score, "feedback": feedback}
        except Exception as e:
            print(f"品質評価エラー: {e}")
        
        return {"score": 50, "feedback": "評価不能"}
    
    def run_benchmark(
        self,
        model_ids: List[str],
        task_ids: List[str] = None,
        categories: List[str] = None
    ) -> Dict:
        """ベンチマーク実行"""
        
        # タスク選択
        tasks = self.STANDARD_TASKS
        if task_ids:
            tasks = [t for t in tasks if t.id in task_ids]
        if categories:
            tasks = [t for t in tasks if t.category in categories]
        
        if not tasks:
            return {"error": "No tasks selected"}
        
        print(f"🏁 ベンチマーク開始: {len(model_ids)}モデル × {len(tasks)}タスク")
        start_time = time.time()
        
        results = []
        
        for task in tasks:
            print(f"\n📋 タスク: {task.name}")
            
            # 各モデルで実行
            task_results = self.executor.execute_parallel_models(
                model_ids=model_ids,
                prompt=task.prompt,
                max_tokens=task.max_tokens,
                temperature=0.3  # ベンチマークは低温度で
            )
            
            for result in task_results:
                cost_info = result.get("cost", {})
                
                # 成功した場合は品質評価を実行
                quality_score = None
                quality_feedback = None
                if result["success"] and result.get("output"):
                    quality_eval = self._evaluate_quality(task.prompt, result["output"])
                    quality_score = quality_eval["score"]
                    quality_feedback = quality_eval["feedback"]
                
                benchmark_result = BenchmarkResult(
                    task_id=task.id,
                    model_id=result["model_id"],
                    success=result["success"],
                    output=result.get("output", ""),
                    latency_seconds=result["elapsed_time"],
                    input_tokens=cost_info.get("input_tokens", 0),
                    output_tokens=cost_info.get("output_tokens", 0),
                    cost_usd=cost_info.get("total_cost", 0),
                    timestamp=datetime.now(),
                    error=result.get("error"),
                    quality_score=quality_score,
                    quality_feedback=quality_feedback
                )
                results.append(benchmark_result)
                self.results.append(benchmark_result)
        
        total_time = time.time() - start_time
        
        # レポート生成
        report = self._generate_report(results, tasks, model_ids, total_time)
        
        return report
    
    def _generate_report(
        self,
        results: List[BenchmarkResult],
        tasks: List[BenchmarkTask],
        model_ids: List[str],
        total_time: float
    ) -> Dict:
        """ベンチマークレポート生成"""
        
        # モデル別集計
        model_stats = {}
        for model_id in model_ids:
            model_results = [r for r in results if r.model_id == model_id]
            successful = [r for r in model_results if r.success]
            quality_scores = [r.quality_score for r in successful if r.quality_score is not None]
            
            model_stats[model_id] = {
                "model_name": model_id.split(".")[-1][:30],
                "total_tasks": len(model_results),
                "successful_tasks": len(successful),
                "success_rate": len(successful) / len(model_results) * 100 if model_results else 0,
                "avg_latency": sum(r.latency_seconds for r in successful) / len(successful) if successful else 0,
                "total_cost": sum(r.cost_usd for r in model_results),
                "total_tokens": sum(r.input_tokens + r.output_tokens for r in model_results),
                "avg_quality_score": sum(quality_scores) / len(quality_scores) if quality_scores else 50,
                "by_category": self._aggregate_by_category(model_results, tasks)
            }
        
        # カテゴリ別集計
        category_stats = {}
        for task in tasks:
            if task.category not in category_stats:
                category_stats[task.category] = {
                    "task_count": 0,
                    "best_model": None,
                    "best_latency": float("inf"),
                    "best_success_rate": 0
                }
            category_stats[task.category]["task_count"] += 1
        
        # 各カテゴリのベストモデル特定
        for category in category_stats:
            for model_id, stats in model_stats.items():
                cat_stats = stats["by_category"].get(category, {})
                if cat_stats.get("success_rate", 0) > category_stats[category]["best_success_rate"]:
                    category_stats[category]["best_model"] = model_id
                    category_stats[category]["best_success_rate"] = cat_stats.get("success_rate", 0)
                    category_stats[category]["best_latency"] = cat_stats.get("avg_latency", 0)
        
        # ランキング生成
        rankings = self._generate_rankings(model_stats)
        
        # 推奨事項
        recommendations = self._generate_recommendations(model_stats, category_stats)
        
        return {
            "summary": {
                "total_models": len(model_ids),
                "total_tasks": len(tasks),
                "total_executions": len(results),
                "successful_executions": sum(1 for r in results if r.success),
                "total_time_seconds": round(total_time, 2),
                "total_cost_usd": round(sum(r.cost_usd for r in results), 6),
                "timestamp": datetime.now().isoformat()
            },
            "model_performance": model_stats,
            "category_analysis": category_stats,
            "rankings": rankings,
            "recommendations": recommendations,
            "detailed_results": [
                {
                    "task_id": r.task_id,
                    "model_id": r.model_id,
                    "success": r.success,
                    "latency": round(r.latency_seconds, 2),
                    "cost": round(r.cost_usd, 6),
                    "quality_score": r.quality_score,
                    "quality_feedback": r.quality_feedback,
                    "output_preview": r.output[:100] if r.output else None,
                    "error": r.error
                }
                for r in results
            ]
        }
    
    def _aggregate_by_category(
        self, 
        results: List[BenchmarkResult], 
        tasks: List[BenchmarkTask]
    ) -> Dict:
        """カテゴリ別集計"""
        task_categories = {t.id: t.category for t in tasks}
        category_results = {}
        
        for result in results:
            category = task_categories.get(result.task_id, "unknown")
            if category not in category_results:
                category_results[category] = {"success": 0, "total": 0, "latency_sum": 0}
            
            category_results[category]["total"] += 1
            if result.success:
                category_results[category]["success"] += 1
                category_results[category]["latency_sum"] += result.latency_seconds
        
        return {
            cat: {
                "success_rate": data["success"] / data["total"] * 100 if data["total"] > 0 else 0,
                "avg_latency": data["latency_sum"] / data["success"] if data["success"] > 0 else 0,
                "task_count": data["total"]
            }
            for cat, data in category_results.items()
        }
    
    def _generate_rankings(self, model_stats: Dict) -> Dict:
        """ランキング生成"""
        models = list(model_stats.items())
        
        return {
            "by_quality": sorted(
                [{"model_id": m, "value": s.get("avg_quality_score", 50)} for m, s in models],
                key=lambda x: x["value"],
                reverse=True
            ),
            "by_speed": sorted(
                [{"model_id": m, "value": s["avg_latency"]} for m, s in models if s["avg_latency"] > 0],
                key=lambda x: x["value"]
            ),
            "by_cost_efficiency": sorted(
                [{"model_id": m, "value": s["total_cost"]} for m, s in models],
                key=lambda x: x["value"]
            ),
            "overall": self._calculate_overall_ranking(model_stats)
        }
    
    def _calculate_overall_ranking(self, model_stats: Dict) -> List[Dict]:
        """総合ランキング計算（速度・コスト・品質の3軸）"""
        scores = []
        
        # 正規化用の最大値・最小値を取得
        latencies = [s["avg_latency"] for s in model_stats.values() if s["avg_latency"] > 0]
        costs = [s["total_cost"] for s in model_stats.values()]
        qualities = [s.get("avg_quality_score", 50) for s in model_stats.values()]
        
        max_latency = max(latencies) if latencies else 10
        min_latency = min(latencies) if latencies else 0
        max_cost = max(costs) if costs else 0.01
        min_cost = min(costs) if costs else 0
        max_quality = max(qualities) if qualities else 100
        min_quality = min(qualities) if qualities else 0
        
        for model_id, stats in model_stats.items():
            # 速度スコア: 速いほど高得点（0-100に正規化）
            if max_latency > min_latency and stats["avg_latency"] > 0:
                speed_score = 100 * (1 - (stats["avg_latency"] - min_latency) / (max_latency - min_latency))
            else:
                speed_score = 100 if stats["avg_latency"] > 0 else 0
            
            # コストスコア: 安いほど高得点（0-100に正規化）
            if max_cost > min_cost:
                cost_score = 100 * (1 - (stats["total_cost"] - min_cost) / (max_cost - min_cost))
            else:
                cost_score = 100
            
            # 品質スコア: 評価者モデルによる採点結果（0-100）
            quality_score = stats.get("avg_quality_score", 50)
            
            # 総合スコア: 品質40% + 速度30% + コスト30%
            overall = (quality_score * 0.4 + speed_score * 0.3 + cost_score * 0.3)
            
            scores.append({
                "model_id": model_id,
                "model_name": stats["model_name"],
                "overall_score": round(overall),
                "quality_score": round(quality_score),
                "speed_score": round(speed_score),
                "cost_score": round(cost_score)
            })
        
        return sorted(scores, key=lambda x: x["overall_score"], reverse=True)
    
    def _generate_recommendations(self, model_stats: Dict, category_stats: Dict) -> List[Dict]:
        """推奨事項生成"""
        recommendations = []
        
        # 最高品質モデル
        best_quality = max(model_stats.items(), key=lambda x: x[1].get("avg_quality_score", 0))
        recommendations.append({
            "type": "best_quality",
            "title": "最高品質モデル",
            "model_id": best_quality[0],
            "reason": f"品質スコア {best_quality[1].get('avg_quality_score', 0):.1f}点"
        })
        
        # 最速モデル
        fastest = min(
            [(m, s) for m, s in model_stats.items() if s["avg_latency"] > 0],
            key=lambda x: x[1]["avg_latency"],
            default=(None, None)
        )
        if fastest[0]:
            recommendations.append({
                "type": "fastest",
                "title": "最速モデル",
                "model_id": fastest[0],
                "reason": f"平均レイテンシ {fastest[1]['avg_latency']:.2f}秒"
            })
        
        # 最もコスト効率の良いモデル
        cheapest = min(model_stats.items(), key=lambda x: x[1]["total_cost"])
        recommendations.append({
            "type": "most_cost_effective",
            "title": "最もコスト効率の良いモデル",
            "model_id": cheapest[0],
            "reason": f"総コスト ${cheapest[1]['total_cost']:.6f}"
        })
        
        # バランス型（品質とコストのバランス）
        balanced = max(
            model_stats.items(),
            key=lambda x: (x[1].get("avg_quality_score", 50) / max(x[1]["total_cost"] * 1000, 0.001))
        )
        recommendations.append({
            "type": "balanced",
            "title": "バランス型（品質/コスト比）",
            "model_id": balanced[0],
            "reason": f"品質 {balanced[1].get('avg_quality_score', 50):.0f}点 / コスト ${balanced[1]['total_cost']:.4f}"
        })
        
        return recommendations


def get_benchmark_suite(region: str = "us-east-1") -> BenchmarkSuite:
    """ベンチマークスイートを取得"""
    return BenchmarkSuite(region=region)
