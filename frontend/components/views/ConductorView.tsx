'use client';

import { ConductorResponse, Model } from '@/types';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ConductorViewProps {
  result: ConductorResponse;
  models: Model[];
}

export default function ConductorView({ result, models }: ConductorViewProps) {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(0);

  const getModelName = (modelId: string) => {
    const model = models.find(m => m.id === modelId);
    return model?.name || modelId.split('.').pop()?.slice(0, 25) || modelId;
  };

  const getModeLabel = (mode: string) => {
    const labels: Record<string, { label: string; desc: string }> = {
      delegate: { label: '📋 タスク分割', desc: '指揮者がタスクを分割し、各ワーカーに割り当て' },
      evaluate: { label: '📊 評価', desc: '全ワーカーの回答を指揮者が評価・ランキング' },
      synthesize: { label: '🔗 統合', desc: '全ワーカーの回答を指揮者が統合' },
    };
    return labels[mode] || { label: mode, desc: '' };
  };

  const getPhaseLabel = (phase: string) => {
    const labels: Record<string, string> = {
      task_delegation: '📋 タスク分割', worker_execution: '🔧 ワーカー実行', evaluation: '📊 評価', synthesis: '🎯 統合',
    };
    return labels[phase] || phase;
  };

  const modeInfo = getModeLabel(result.mode);

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-6 space-y-6">
      <div className="border-b pb-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">🎼</span>
          <h2 className="text-2xl font-bold text-gray-800">指揮者モード</h2>
          <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">{modeInfo.label}</span>
        </div>
        <p className="text-gray-600 text-sm">{modeInfo.desc}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-gradient-to-br from-yellow-50 to-orange-50 rounded-lg border-2 border-yellow-200">
          <div className="text-sm text-gray-600 mb-1">🎭 指揮者</div>
          <div className="font-bold text-lg text-yellow-800">{getModelName(result.conductor_model)}</div>
        </div>
        <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border-2 border-blue-200">
          <div className="text-sm text-gray-600 mb-1">👷 ワーカー ({result.worker_models.length})</div>
          <div className="flex flex-wrap gap-1">
            {result.worker_models.map((modelId, i) => (<span key={i} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{getModelName(modelId)}</span>))}
          </div>
        </div>
      </div>

      <div className="p-4 bg-gray-50 rounded-lg">
        <div className="text-sm font-semibold text-gray-600 mb-2">📝 元のタスク</div>
        <div className="text-gray-800 prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result.original_task}</ReactMarkdown></div>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-gray-700">実行フェーズ</h3>
        {result.phases.map((phase, index) => (
          <div key={index} className="border rounded-lg overflow-hidden">
            <button onClick={() => setExpandedPhase(expandedPhase === index ? null : index)} className="w-full p-4 bg-gray-50 hover:bg-gray-100 flex justify-between items-center transition">
              <span className="font-medium">{getPhaseLabel(phase.phase)}</span>
              <span className="text-gray-500">{expandedPhase === index ? '▼' : '▶'}</span>
            </button>
            {expandedPhase === index && (
              <div className="p-4 space-y-4">
                {phase.conductor_response && (
                  <div className="p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
                    <div className="text-sm font-semibold text-yellow-800 mb-2">🎭 指揮者の応答</div>
                    {phase.conductor_response.success ? (
                      <div className="prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{phase.conductor_response.output}</ReactMarkdown></div>
                    ) : (<div className="text-red-600">エラー: {phase.conductor_response.error}</div>)}
                    <div className="mt-2 text-xs text-gray-500">⏱️ {phase.conductor_response.elapsed_time.toFixed(2)}秒{phase.conductor_response.cost && <span className="ml-2">💰 ${phase.conductor_response.cost.total_cost.toFixed(6)}</span>}</div>
                  </div>
                )}
                {phase.results && phase.results.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-blue-800">👷 ワーカーの結果</div>
                    {phase.results.map((r, i) => (
                      <div key={i} className={`p-4 rounded-lg border-l-4 ${r.success ? 'bg-blue-50 border-blue-400' : 'bg-red-50 border-red-400'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-medium text-gray-800">{getModelName(r.model_id)}</span>
                          <span className="text-xs text-gray-500">⏱️ {r.elapsed_time.toFixed(2)}秒</span>
                        </div>
                        {r.success ? (<div className="text-sm text-gray-700 max-h-60 overflow-y-auto prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{r.output}</ReactMarkdown></div>) : (<div className="text-red-600 text-sm">エラー: {r.error}</div>)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {result.final_answer && (
        <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-300">
          <div className="text-lg font-bold text-green-800 mb-3">✨ 最終回答</div>
          <div className="prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result.final_answer}</ReactMarkdown></div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 pt-4 border-t">
        <div className="text-center"><div className="text-2xl font-bold text-purple-600">{result.summary.total_calls}</div><div className="text-xs text-gray-600">API呼び出し</div></div>
        <div className="text-center"><div className="text-2xl font-bold text-green-600">{result.summary.success_count}</div><div className="text-xs text-gray-600">成功</div></div>
        <div className="text-center"><div className="text-2xl font-bold text-blue-600">{result.summary.total_time.toFixed(1)}s</div><div className="text-xs text-gray-600">総時間</div></div>
        <div className="text-center"><div className="text-2xl font-bold text-yellow-600">${result.summary.total_cost.toFixed(6)}</div><div className="text-xs text-gray-600">総コスト</div></div>
      </div>
    </div>
  );
}
