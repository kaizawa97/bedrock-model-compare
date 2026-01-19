'use client';

import { useState, useEffect } from 'react';
import { BenchmarkReport, BenchmarkTask, BenchmarkPreset } from '@/types/analytics';

interface BenchmarkViewProps {
  apiBase: string;
}

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export default function BenchmarkView({ apiBase }: BenchmarkViewProps) {
  const [tasks, setTasks] = useState<BenchmarkTask[]>([]);
  const [presets, setPresets] = useState<BenchmarkPreset[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    fetchTasks();
    fetchPresets();
    fetchModels();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch(`${apiBase}/api/benchmark/tasks`);
      const data = await res.json();
      setTasks(data.tasks);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  };

  const fetchPresets = async () => {
    try {
      const res = await fetch(`${apiBase}/api/benchmark/presets`);
      const data = await res.json();
      setPresets(data.presets);
    } catch (err) {
      console.error('Failed to fetch presets:', err);
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch(`${apiBase}/api/models`);
      const data = await res.json();
      setAvailableModels(data.models || []);
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  };

  const applyPreset = (preset: BenchmarkPreset) => {
    setSelectedModels(preset.model_ids);
    if (preset.recommended_categories) {
      setSelectedCategories(preset.recommended_categories);
    } else {
      setSelectedCategories([]);
    }
  };

  const runBenchmark = async () => {
    if (selectedModels.length === 0) {
      setError('モデルを選択してください');
      return;
    }

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch(`${apiBase}/api/benchmark/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_ids: selectedModels,
          categories: selectedCategories.length > 0 ? selectedCategories : null
        })
      });

      if (!res.ok) throw new Error('Benchmark failed');
      const data = await res.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const categories = [...new Set(tasks.map(t => t.category))];

  const modelsByProvider = availableModels.reduce<Record<string, ModelInfo[]>>((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = [];
    acc[model.provider].push(model);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800">🏁 ベンチマーク自動実行</h2>
        <p className="text-gray-600 mt-1">複数モデルの性能を自動評価してレポートを生成</p>
      </div>

      {/* プリセット */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">⚡ クイックプリセット</h3>
        <div className="flex flex-wrap gap-3">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition text-sm"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* モデル選択 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">📦 モデル選択</h3>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setSelectedModels(availableModels.map(m => m.id))}
              className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              全選択
            </button>
            <button
              type="button"
              onClick={() => setSelectedModels([])}
              className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              全解除
            </button>
            <span className="text-gray-300">|</span>
            {Object.keys(modelsByProvider).map(provider => (
              <button
                key={provider}
                type="button"
                onClick={() => {
                  const providerModels = modelsByProvider[provider].map(m => m.id);
                  setSelectedModels(prev => [...new Set([...prev, ...providerModels])]);
                }}
                className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                {provider}
              </button>
            ))}
          </div>
          <div className="border border-gray-300 rounded-lg overflow-hidden max-h-64">
            <div className="h-full overflow-y-auto p-2 space-y-1">
              {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
                <div key={provider} className="mb-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 py-1 bg-gray-50 rounded">
                    {provider} ({providerModels.filter(m => selectedModels.includes(m.id)).length}/{providerModels.length})
                  </div>
                  {providerModels.map(model => (
                    <label
                      key={model.id}
                      className="flex items-center p-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedModels.includes(model.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedModels([...selectedModels, model.id]);
                          } else {
                            setSelectedModels(selectedModels.filter(id => id !== model.id));
                          }
                        }}
                        className="mr-2 w-3.5 h-3.5 rounded text-purple-600"
                      />
                      <span className="flex-1 truncate">{model.name}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          選択中: {selectedModels.length}モデル
        </p>
      </div>

      {/* カテゴリ選択 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">📋 テストカテゴリ</h3>
        <div className="flex flex-wrap gap-3">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                if (selectedCategories.includes(cat)) {
                  setSelectedCategories(selectedCategories.filter(c => c !== cat));
                } else {
                  setSelectedCategories([...selectedCategories, cat]);
                }
              }}
              className={`px-4 py-2 rounded-lg transition text-sm ${
                selectedCategories.includes(cat)
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-2">
          {selectedCategories.length === 0 ? '全カテゴリを実行' : `${selectedCategories.length}カテゴリ選択中`}
        </p>
      </div>

      {/* 実行ボタン */}
      <button
        onClick={runBenchmark}
        disabled={loading || selectedModels.length === 0}
        className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⏳</span>
            ベンチマーク実行中...
          </span>
        ) : (
          '🚀 ベンチマーク実行'
        )}
      </button>

      {/* エラー */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* レポート */}
      {report && (
        <div className="space-y-6">
          {/* サマリー */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">📊 ベンチマーク結果サマリー</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-600">{report.summary.total_models}</p>
                <p className="text-sm text-gray-600">モデル数</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-indigo-600">{report.summary.total_tasks}</p>
                <p className="text-sm text-gray-600">タスク数</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">
                  {((report.summary.successful_executions / report.summary.total_executions) * 100).toFixed(0)}%
                </p>
                <p className="text-sm text-gray-600">成功率</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-600">${report.summary.total_cost_usd.toFixed(4)}</p>
                <p className="text-sm text-gray-600">総コスト</p>
              </div>
            </div>
          </div>

          {/* 総合ランキング */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">🏆 総合ランキング</h3>
            <div className="space-y-3">
              {report.rankings.overall.map((item, i) => (
                <div
                  key={item.model_id}
                  className={`flex items-center gap-4 p-4 rounded-lg ${
                    i === 0 ? 'bg-yellow-50 border border-yellow-200' :
                    i === 1 ? 'bg-gray-100' :
                    i === 2 ? 'bg-orange-50' : 'bg-white border'
                  }`}
                >
                  <span className="text-2xl font-bold text-gray-400 w-8">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold">{item.model_name}</p>
                    <div className="flex gap-4 text-sm text-gray-600 mt-1">
                      <span>品質: {item.quality_score}</span>
                      <span>速度: {item.speed_score}</span>
                      <span>コスト: {item.cost_score}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-purple-600">{item.overall_score}</p>
                    <p className="text-xs text-gray-500">総合スコア</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 推奨事項 */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">💡 推奨事項</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.recommendations.map((rec, i) => (
                <div key={i} className="border rounded-lg p-4">
                  <h4 className="font-medium text-purple-700">{rec.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">{rec.model_id.split('.').pop()}</p>
                  <p className="text-sm text-gray-500 mt-2">{rec.reason}</p>
                </div>
              ))}
            </div>
          </div>

          {/* カテゴリ別分析 */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">📈 カテゴリ別ベストモデル</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">カテゴリ</th>
                    <th className="text-left py-2 px-3">ベストモデル</th>
                    <th className="text-right py-2 px-3">成功率</th>
                    <th className="text-right py-2 px-3">平均レイテンシ</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.category_analysis).map(([cat, data]) => (
                    <tr key={cat} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">{cat}</td>
                      <td className="py-2 px-3">{data.best_model?.split('.').pop() || '-'}</td>
                      <td className="text-right py-2 px-3">{data.best_success_rate.toFixed(1)}%</td>
                      <td className="text-right py-2 px-3">{data.best_latency.toFixed(2)}秒</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 詳細結果 */}
          <details className="bg-white rounded-xl shadow-sm border">
            <summary className="p-6 cursor-pointer font-semibold text-gray-800">
              📋 詳細結果を表示 ({report.detailed_results.length}件)
            </summary>
            <div className="px-6 pb-6">
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">タスク</th>
                      <th className="text-left py-2 px-2">モデル</th>
                      <th className="text-center py-2 px-2">結果</th>
                      <th className="text-right py-2 px-2">品質</th>
                      <th className="text-right py-2 px-2">レイテンシ</th>
                      <th className="text-right py-2 px-2">コスト</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.detailed_results.map((result, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-2">{result.task_id}</td>
                        <td className="py-2 px-2 truncate max-w-32">{result.model_id.split('.').pop()}</td>
                        <td className="text-center py-2 px-2">
                          {result.success ? '✅' : '❌'}
                        </td>
                        <td className="text-right py-2 px-2">
                          {result.quality_score !== null ? (
                            <span className={`font-medium ${
                              result.quality_score >= 80 ? 'text-green-600' :
                              result.quality_score >= 60 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {result.quality_score}点
                            </span>
                          ) : '-'}
                        </td>
                        <td className="text-right py-2 px-2">{result.latency.toFixed(2)}秒</td>
                        <td className="text-right py-2 px-2">${result.cost.toFixed(6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
