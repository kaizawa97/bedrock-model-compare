'use client';

import { useState } from 'react';
import { ExplanationResponse } from '@/types/analytics';

interface ExplainabilityViewProps {
  apiBase: string;
}

export default function ExplainabilityView({ apiBase }: ExplainabilityViewProps) {
  const [prompt, setPrompt] = useState('');
  const [criteria, setCriteria] = useState<'balanced' | 'fastest' | 'cheapest' | 'best_quality'>('balanced');
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<ExplanationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExplain = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/api/explain/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          criteria,
          include_alternatives: true
        })
      });

      if (!res.ok) throw new Error('Failed to get explanation');
      const data = await res.json();
      setExplanation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800">🔍 モデル選択の根拠説明</h2>
        <p className="text-gray-600 mt-1">なぜそのモデルが選ばれたかを透明に説明します</p>
      </div>

      {/* 入力フォーム */}
      <InputForm
        prompt={prompt}
        setPrompt={setPrompt}
        criteria={criteria}
        setCriteria={setCriteria}
        loading={loading}
        onSubmit={handleExplain}
      />

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* 説明結果 */}
      {explanation && <ExplanationResults explanation={explanation} />}
    </div>
  );
}

function InputForm({ prompt, setPrompt, criteria, setCriteria, loading, onSubmit }: {
  prompt: string;
  setPrompt: (v: string) => void;
  criteria: string;
  setCriteria: (v: any) => void;
  loading: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">プロンプト</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="分析したいプロンプトを入力してください..."
          className="w-full h-32 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">選択基準</label>
          <select
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
          >
            <option value="balanced">バランス重視</option>
            <option value="fastest">速度重視</option>
            <option value="cheapest">コスト重視</option>
            <option value="best_quality">品質重視</option>
          </select>
        </div>
        <button
          onClick={onSubmit}
          disabled={loading || !prompt.trim()}
          className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '分析中...' : '分析する'}
        </button>
      </div>
    </div>
  );
}

function ExplanationResults({ explanation }: { explanation: ExplanationResponse }) {
  return (
    <div className="space-y-6">
      {/* 選択されたモデル */}
      <div className="bg-gradient-to-r from-purple-50 to-white rounded-xl border-l-4 border-purple-500 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">🎯</span>
          <div>
            <h3 className="text-xl font-bold text-purple-700">{explanation.selected_model.name}</h3>
            <p className="text-sm text-gray-600">
              品質ティア: <span className="font-medium">{explanation.selected_model.quality_tier}</span>
            </p>
          </div>
        </div>
        <p className="text-gray-700">{explanation.explanation.summary}</p>
        <p className="text-gray-600 mt-2">{explanation.explanation.detailed}</p>
      </div>

      {/* スコアリング */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">📊 スコアリング詳細</h3>
        
        {/* 総合スコア */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium">総合スコア</span>
            <span className="text-2xl font-bold text-purple-600">
              {explanation.scoring.overall_score}/100
            </span>
          </div>
          <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all"
              style={{ width: `${explanation.scoring.overall_score}%` }}
            />
          </div>
        </div>

        {/* 内訳 */}
        <div className="space-y-3">
          {explanation.scoring.breakdown.map((item, i) => (
            <div key={i}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">{item.name}</span>
                <span className="font-medium">
                  {item.score}/100 (重み: {(item.weight * 100).toFixed(0)}%)
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    item.score >= 80 ? 'bg-green-500' :
                    item.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${item.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* キーファクター */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">🔑 選択の決め手</h3>
        <ul className="space-y-2">
          {explanation.explanation.key_factors.map((factor, i) => (
            <li key={i} className="text-gray-700">{factor}</li>
          ))}
        </ul>
      </div>

      {/* タスク分析 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">📋 タスク分析</h3>
          <div className="space-y-2">
            <p><span className="text-gray-600">タイプ:</span> <span className="font-medium">{explanation.task_analysis.type}</span></p>
            <p><span className="text-gray-600">説明:</span> {explanation.task_analysis.description}</p>
            <p><span className="text-gray-600">必要な能力:</span></p>
            <div className="flex flex-wrap gap-2 mt-1">
              {explanation.task_analysis.required_capabilities.map((cap, i) => (
                <span key={i} className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-sm">
                  {cap}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">📝 プロンプト分析</h3>
          <div className="space-y-2">
            <p><span className="text-gray-600">トークン数:</span> <span className="font-medium">{explanation.prompt_analysis.token_count}</span></p>
            <p><span className="text-gray-600">文字数:</span> {explanation.prompt_analysis.character_count}</p>
            <p><span className="text-gray-600">複雑度:</span> <span className={`font-medium ${
              explanation.prompt_analysis.complexity === 'high' ? 'text-red-600' :
              explanation.prompt_analysis.complexity === 'medium' ? 'text-yellow-600' : 'text-green-600'
            }`}>{explanation.prompt_analysis.complexity}</span></p>
            {explanation.prompt_analysis.detected_features.length > 0 && (
              <>
                <p><span className="text-gray-600">検出された特徴:</span></p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {explanation.prompt_analysis.detected_features.map((feat, i) => (
                    <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                      {feat}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 信頼度 */}
      <div className={`rounded-xl border p-6 ${
        explanation.confidence.level === 'high' ? 'bg-green-50 border-green-200' :
        explanation.confidence.level === 'medium' ? 'bg-yellow-50 border-yellow-200' :
        'bg-red-50 border-red-200'
      }`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">
            {explanation.confidence.level === 'high' ? '✅' :
             explanation.confidence.level === 'medium' ? '⚡' : '⚠️'}
          </span>
          <div>
            <h3 className="font-semibold">
              信頼度: {explanation.confidence.level === 'high' ? '高' :
                      explanation.confidence.level === 'medium' ? '中' : '低'}
            </h3>
            <p className="text-sm text-gray-600">{explanation.confidence.description}</p>
          </div>
        </div>
      </div>

      {/* 代替モデルとの比較 */}
      {explanation.comparison.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">🔄 代替モデルとの比較</h3>
          <div className="space-y-4">
            {explanation.comparison.map((alt, i) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-gray-800">{alt.model_name}</h4>
                  <span className={`px-2 py-1 rounded text-sm ${
                    alt.score_difference > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {alt.score_difference > 0 ? '-' : '+'}{Math.abs(alt.score_difference)}pt
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{alt.reason_not_selected}</p>
                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">強み:</span>
                    <span className="ml-1">{alt.strengths.join(', ') || 'なし'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">弱み:</span>
                    <span className="ml-1">{alt.weaknesses.join(', ') || 'なし'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
