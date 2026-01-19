'use client';

import { AutoRouteResult, Model } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';

interface AutoRouteViewProps {
  result: AutoRouteResult;
  models: Model[];
}

export default function AutoRouteView({ result, models }: AutoRouteViewProps) {
  const [showAlternatives, setShowAlternatives] = useState(false);

  const getModelName = (modelId: string) => {
    const model = models.find(m => m.id === modelId);
    return model?.name || modelId.split('.').pop()?.slice(0, 30) || modelId;
  };

  const primaryResult = result.results[0];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl shadow-xl p-6 border border-indigo-200">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">🎯</span>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Auto Route 結果</h2>
            <p className="text-sm text-gray-600">タスクタイプ: <span className="font-medium">{result.routing.task_type}</span></p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-4 border border-indigo-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">✅</span>
              <span className="font-semibold text-gray-700">選択されたモデル</span>
            </div>
            <p className="text-lg font-bold text-indigo-700">{getModelName(result.routing.selected_model)}</p>
            <p className="text-sm text-gray-600 mt-2">{result.routing.reason}</p>
          </div>

          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <button onClick={() => setShowAlternatives(!showAlternatives)} className="flex items-center gap-2 w-full text-left">
              <span className="text-lg">🔄</span>
              <span className="font-semibold text-gray-700">代替案</span>
              <span className="text-xs text-gray-500">({result.routing.alternatives.length}件)</span>
              <span className={`ml-auto transform transition-transform ${showAlternatives ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {showAlternatives && (
              <div className="mt-3 space-y-2">
                {result.routing.alternatives.map((alt, idx) => (
                  <div key={idx} className="text-sm p-2 bg-gray-50 rounded">
                    <p className="font-medium text-gray-700">{getModelName(alt.model_id)}</p>
                    <p className="text-gray-500 text-xs">{alt.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {primaryResult && (
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">💬</span>
              <div>
                <h3 className="text-lg font-bold text-gray-800">{getModelName(primaryResult.model_id)}</h3>
                <p className="text-sm text-gray-500">{primaryResult.elapsed_time.toFixed(2)}秒{primaryResult.cost && <span className="ml-2">• ${primaryResult.cost.total_cost.toFixed(6)}</span>}</p>
              </div>
            </div>
            {primaryResult.success ? <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">✅ 成功</span> : <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">❌ 失敗</span>}
          </div>
          {primaryResult.success ? (
            <div className="prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{primaryResult.output}</ReactMarkdown></div>
          ) : (
            <div className="p-4 bg-red-50 rounded-lg text-red-700">{primaryResult.error}</div>
          )}
        </div>
      )}

      {result.results.length > 1 && (
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><span>📊</span>代替モデルとの比較</h3>
          <div className="space-y-4">
            {result.results.slice(1).map((res, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-700">{getModelName(res.model_id)}</span>
                  <span className="text-sm text-gray-500">{res.elapsed_time.toFixed(2)}秒{res.cost && ` • ${res.cost.total_cost.toFixed(6)}`}</span>
                </div>
                {res.success ? (
                  <div className="text-sm text-gray-600 max-h-40 overflow-y-auto"><ReactMarkdown remarkPlugins={[remarkGfm]}>{`${res.output?.slice(0, 500) ?? ''}${(res.output?.length ?? 0) > 500 ? '...' : ''}`}</ReactMarkdown></div>
                ) : (<div className="text-sm text-red-600">{res.error}</div>)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-100 rounded-lg p-4 text-sm text-gray-600">
        <div className="flex gap-6"><span>📊 実行数: {result.summary.total}</span><span>✅ 成功: {result.summary.success}</span></div>
      </div>
    </div>
  );
}
