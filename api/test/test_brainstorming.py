#!/usr/bin/env python3
"""
ブレインストーミングタスクのモデル比較テスト
「意見の壁打ち」に最適なモデルを見つける
"""

import requests
import json
import time

# テストプロンプト（実際のハッカソンの状況）
TEST_PROMPT = """
私は社内ハッカソンで「50個のBedrockモデルを並列実行して比較するツール」を作りました。
しかし同僚から「別にSonnetで良くないか？」と言われています。

以下の記事の主張を読みました：
「モデル選択をユーザーに任せるのは間違い。システムが自動で最適なモデルを選ぶべき。
Cursorは自動ルーティングを実装し、ユーザーは何も選ばない。これが正しいUI設計だ。」

質問：
1. このツールをどう改善すべきか？
2. ハッカソンで評価されるには何を見せるべきか？
3. 実用的な価値をどう示すか？

具体的で実装可能なアイデアを3つ、それぞれ理由とともに提案してください。
"""

# 比較するモデル（ブレインストーミングに適していそうなモデル）
TEST_MODELS = [
    "us.anthropic.claude-opus-4-5-20251101-v1:0",      # 最高性能
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",    # バランス
    "us.anthropic.claude-3-5-sonnet-20241022-v2:0",    # 実績あり
    "us.deepseek.r1-v1:0",                             # 推論特化
    "amazon.nova-premier-v1:0",                        # Amazon最新
    "amazon.nova-pro-v1:0",                            # コスパ
    "us.meta.llama3-3-70b-instruct-v1:0",             # オープンソース
]

def test_auto_router():
    """Auto Routerのテスト"""
    print("=" * 80)
    print("🎯 Auto Router テスト")
    print("=" * 80)
    
    response = requests.post(
        "http://localhost:8000/api/auto-route",
        json={
            "prompt": TEST_PROMPT,
            "criteria": "balanced"
        }
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"\n✅ 自動選択結果:")
        print(f"   タスクタイプ: {result['task_type']}")
        print(f"   選択モデル: {result['selected_model']}")
        print(f"   理由: {result['reason']}")
        print(f"   推定コスト: ${result['estimated_cost']}")
        print(f"   推定レイテンシ: {result['estimated_latency']}秒")
        print(f"\n   代替案:")
        for alt in result['alternatives']:
            print(f"   - {alt['model_id']}")
            print(f"     理由: {alt['reason']}")
            print(f"     コスト倍率: {alt['cost_multiplier']}x")
    else:
        print(f"❌ エラー: {response.status_code}")
        print(response.text)

def test_model_comparison():
    """複数モデルで実際に比較実行"""
    print("\n" + "=" * 80)
    print("🚀 モデル比較実行")
    print("=" * 80)
    print(f"\n比較するモデル: {len(TEST_MODELS)}個")
    for model in TEST_MODELS:
        print(f"  - {model}")
    
    print(f"\n実行中...")
    start_time = time.time()
    
    response = requests.post(
        "http://localhost:8000/api/execute",
        json={
            "model_ids": TEST_MODELS,
            "prompt": TEST_PROMPT,
            "region": "us-east-1",
            "max_tokens": 2000,
            "temperature": 0.7,
            "max_workers": 10
        }
    )
    
    elapsed = time.time() - start_time
    
    if response.status_code == 200:
        data = response.json()
        results = data['results']
        summary = data['summary']
        
        print(f"\n✅ 実行完了（{elapsed:.1f}秒）")
        print(f"\n📊 サマリー:")
        print(f"   成功: {summary['success']}/{summary['total']}")
        print(f"   失敗: {summary['failed']}/{summary['total']}")
        print(f"   平均時間: {summary['average_time']}秒")
        
        # 成功したモデルを分析
        successful = [r for r in results if r['success']]
        
        if successful:
            print(f"\n🏆 成功したモデルの分析:")
            
            # コスト順にソート
            by_cost = sorted(successful, key=lambda x: x.get('cost', {}).get('total_cost', 999))
            print(f"\n💰 最安モデル:")
            cheapest = by_cost[0]
            print(f"   {cheapest['model_id']}")
            print(f"   コスト: ${cheapest['cost']['total_cost']:.6f}")
            print(f"   時間: {cheapest['elapsed_time']:.2f}秒")
            print(f"   出力長: {len(cheapest['output'])}文字")
            
            # 速度順にソート
            by_speed = sorted(successful, key=lambda x: x['elapsed_time'])
            print(f"\n⚡ 最速モデル:")
            fastest = by_speed[0]
            print(f"   {fastest['model_id']}")
            print(f"   時間: {fastest['elapsed_time']:.2f}秒")
            print(f"   コスト: ${fastest['cost']['total_cost']:.6f}")
            print(f"   出力長: {len(fastest['output'])}文字")
            
            # 出力の質を比較（長さで簡易評価）
            by_length = sorted(successful, key=lambda x: len(x['output']), reverse=True)
            print(f"\n📝 最も詳細な回答:")
            detailed = by_length[0]
            print(f"   {detailed['model_id']}")
            print(f"   出力長: {len(detailed['output'])}文字")
            print(f"   コスト: ${detailed['cost']['total_cost']:.6f}")
            print(f"   時間: {detailed['elapsed_time']:.2f}秒")
            
            # コスパ分析
            print(f"\n💎 コスパ分析（文字数/コスト）:")
            for r in successful:
                cost = r['cost']['total_cost']
                length = len(r['output'])
                if cost > 0:
                    value = length / cost
                    model_name = r['model_id'].split('.')[-1][:30]
                    print(f"   {model_name:30s}: {value:10.0f} 文字/$")
            
            # 結果をファイルに保存
            with open('brainstorming_test_results.json', 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"\n💾 詳細結果を brainstorming_test_results.json に保存しました")
        
        else:
            print("\n❌ すべてのモデルが失敗しました")
            for r in results:
                print(f"   {r['model_id']}: {r.get('error', 'Unknown error')}")
    
    else:
        print(f"❌ エラー: {response.status_code}")
        print(response.text)

def test_debate():
    """モデル同士の壁打ち（ディベート）テスト"""
    print("\n" + "=" * 80)
    print("🎭 モデル壁打ち（ディベート）テスト")
    print("=" * 80)
    
    # ディベートに参加するモデル
    debate_models = [
        "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "us.deepseek.r1-v1:0",
    ]
    
    topic = "AIコーディングアシスタントは、ユーザーにモデル選択を任せるべきか、それとも自動で最適なモデルを選ぶべきか？"
    
    print(f"\n📍 トピック: {topic}")
    print(f"📍 参加モデル: {debate_models}")
    print(f"📍 ラウンド数: 2")
    print(f"\n実行中...")
    
    start_time = time.time()
    
    response = requests.post(
        "http://localhost:8000/api/debate",
        json={
            "model_ids": debate_models,
            "topic": topic,
            "rounds": 2,
            "region": "us-east-1",
            "max_tokens": 1500,
            "temperature": 0.7,
            "mode": "debate",
            "enable_reasoning": False
        }
    )
    
    elapsed = time.time() - start_time
    
    if response.status_code == 200:
        data = response.json()
        
        print(f"\n✅ ディベート完了（{elapsed:.1f}秒）")
        print(f"\n📊 サマリー:")
        print(f"   総発言数: {data['summary']['total_exchanges']}")
        print(f"   成功: {data['summary']['success_count']}")
        print(f"   総時間: {data['summary']['total_time']:.2f}秒")
        
        print(f"\n🎤 議論の内容:")
        for round_data in data['rounds']:
            print(f"\n--- ラウンド {round_data['round']} ---")
            for result in round_data['results']:
                if result['success']:
                    model_name = result['model_id'].split('.')[-1][:25]
                    output_preview = result['output'][:200].replace('\n', ' ')
                    print(f"\n[{model_name}]")
                    print(f"  {output_preview}...")
                else:
                    print(f"\n[{result['model_id']}] エラー: {result.get('error', 'Unknown')}")
        
        # 結果を保存
        with open('debate_test_results.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"\n💾 詳細結果を debate_test_results.json に保存しました")
    
    else:
        print(f"❌ エラー: {response.status_code}")
        print(response.text)

def test_reasoning():
    """推論モードのオン・オフテスト"""
    print("\n" + "=" * 80)
    print("🧠 推論モード テスト")
    print("=" * 80)
    
    # 推論対応モデル
    reasoning_models = [
        "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    ]
    
    test_prompt = "1から100までの素数の合計を求めてください。計算過程も示してください。"
    
    print(f"\n📍 プロンプト: {test_prompt}")
    print(f"📍 モデル: {reasoning_models}")
    
    # 推論OFF
    print(f"\n--- 推論OFF ---")
    response_off = requests.post(
        "http://localhost:8000/api/execute-with-reasoning",
        json={
            "model_ids": reasoning_models,
            "prompt": test_prompt,
            "region": "us-east-1",
            "max_tokens": 2000,
            "temperature": 0.7,
            "enable_reasoning": False
        }
    )
    
    if response_off.status_code == 200:
        data = response_off.json()
        for r in data['results']:
            if r['success']:
                print(f"  時間: {r['elapsed_time']:.2f}秒")
                print(f"  出力長: {len(r['output'])}文字")
                print(f"  出力プレビュー: {r['output'][:150]}...")
    
    # 推論ON
    print(f"\n--- 推論ON ---")
    response_on = requests.post(
        "http://localhost:8000/api/execute-with-reasoning",
        json={
            "model_ids": reasoning_models,
            "prompt": test_prompt,
            "region": "us-east-1",
            "max_tokens": 2000,
            "temperature": 0.7,
            "enable_reasoning": True,
            "reasoning_budget_tokens": 5000
        }
    )
    
    if response_on.status_code == 200:
        data = response_on.json()
        for r in data['results']:
            if r['success']:
                print(f"  時間: {r['elapsed_time']:.2f}秒")
                print(f"  出力長: {len(r['output'])}文字")
                thinking = r.get('thinking', '')
                if thinking:
                    print(f"  推論内容長: {len(thinking)}文字")
                    print(f"  推論プレビュー: {thinking[:150]}...")
                print(f"  出力プレビュー: {r['output'][:150]}...")

def main():
    print("🧪 Bedrock Auto Router - ブレインストーミングタスクテスト")
    print()
    
    print("テストを選択してください:")
    print("  1. Auto Routerテスト")
    print("  2. モデル比較実行")
    print("  3. モデル壁打ち（ディベート）")
    print("  4. 推論モード テスト")
    print("  5. すべて実行")
    
    choice = input("\n選択 (1-5): ").strip()
    
    if choice == '1':
        test_auto_router()
    elif choice == '2':
        test_model_comparison()
    elif choice == '3':
        test_debate()
    elif choice == '4':
        test_reasoning()
    elif choice == '5':
        test_auto_router()
        test_model_comparison()
        test_debate()
        test_reasoning()
    else:
        print("無効な選択です")

if __name__ == "__main__":
    main()
