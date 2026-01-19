'use client';

import { useState, useEffect } from 'react';
import { Model, Region, ExecutionRequest, DebateRequest, ExecutionMode, ConductorRequest } from '@/types';

interface ModelSelectorProps {
  onExecute: (request: ExecutionRequest) => void;
  onDebate: (request: DebateRequest) => void;
  onConductor: (request: ConductorRequest) => void;
  isExecuting: boolean;
  onCancel: () => void;
}

export default function ModelSelector({ onExecute, onDebate, onConductor, isExecuting, onCancel }: ModelSelectorProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [maxTokens, setMaxTokens] = useState(1000);
  const [temperature, setTemperature] = useState(0.7);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('compare');
  const [enableReasoning, setEnableReasoning] = useState(false);
  const [reasoningBudget, setReasoningBudget] = useState(5000);
  const [debateMode, setDebateMode] = useState<'debate' | 'brainstorm' | 'critique'>('debate');
  const [debateRounds, setDebateRounds] = useState(3);
  const [conductorModel, setConductorModel] = useState('');
  const [conductorMode, setConductorMode] = useState<'delegate' | 'evaluate' | 'synthesize'>('synthesize');

  useEffect(() => {
    Promise.all([
      fetch('http://localhost:8000/api/models').then(r => r.json()),
      fetch('http://localhost:8000/api/regions').then(r => r.json()),
    ]).then(([modelsData, regionsData]) => {
      setModels(modelsData.models);
      setRegions(regionsData.regions);
      if (typeof window !== 'undefined') (window as any).bedrockModels = modelsData.models;
    }).catch(console.error);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (executionMode === 'conductor') {
      if (!conductorModel) { alert('指揮者モデルを選択してください'); return; }
      if (selectedModels.length < 1) { alert('少なくとも1つのワーカーモデルを選択してください'); return; }
      onConductor({ conductor_model_id: conductorModel, worker_model_ids: selectedModels.filter(m => m !== conductorModel), task: prompt, region, max_tokens: maxTokens, temperature, mode: conductorMode, enable_reasoning: enableReasoning, reasoning_budget_tokens: reasoningBudget });
    } else if (executionMode === 'debate') {
      if (selectedModels.length < 2) { alert('壁打ちモードでは2つ以上のモデルを選択してください'); return; }
      onDebate({ model_ids: selectedModels, topic: prompt, rounds: debateRounds, region, max_tokens: maxTokens, temperature, mode: debateMode, enable_reasoning: enableReasoning, reasoning_budget_tokens: reasoningBudget });
    } else {
      if (selectedModels.length === 0) { alert('少なくとも1つのモデルを選択してください'); return; }
      onExecute({ model_ids: selectedModels, prompt, region, max_tokens: maxTokens, temperature, enable_reasoning: enableReasoning, reasoning_budget_tokens: reasoningBudget });
    }
  };

  // Filter to only text models for comparison/debate/conductor modes
  const textModels = models.filter(m => m.type === 'text');

  const toggleModel = (modelId: string) => setSelectedModels(prev => prev.includes(modelId) ? prev.filter(id => id !== modelId) : [...prev, modelId]);
  const selectAll = () => setSelectedModels(textModels.map(m => m.id));
  const deselectAll = () => setSelectedModels([]);
  const isReasoningSupported = (modelId: string) => ['claude-sonnet-4', 'claude-opus-4', 'claude-3-7', 'deepseek.r1', 'kimi-k2-thinking'].some(x => modelId.includes(x));
  const hasReasoningModel = selectedModels.some(isReasoningSupported);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
        <button type="button" onClick={() => setExecutionMode('compare')} className={`flex-1 py-3 px-4 rounded-lg font-semibold transition text-sm ${executionMode === 'compare' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-200'}`}>🚀 モデル比較</button>
        <button type="button" onClick={() => setExecutionMode('debate')} className={`flex-1 py-3 px-4 rounded-lg font-semibold transition text-sm ${executionMode === 'debate' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-200'}`}>🎭 モデル壁打ち</button>
        <button type="button" onClick={() => setExecutionMode('conductor')} className={`flex-1 py-3 px-4 rounded-lg font-semibold transition text-sm ${executionMode === 'conductor' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-200'}`}>🎼 指揮者モード</button>
      </div>

      {executionMode === 'conductor' && (
        <div className="p-4 bg-yellow-50 rounded-lg space-y-4 border-2 border-yellow-200">
          <div className="flex items-center gap-2 mb-2"><span className="text-2xl">🎼</span><span className="font-bold text-yellow-800">指揮者モード設定</span></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">🎭 指揮者モデル</label>
              <select value={conductorModel} onChange={(e) => setConductorModel(e.target.value)} className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-yellow-500 focus:outline-none">
                <option value="">選択してください</option>
                {textModels.filter(m => m.provider === 'Anthropic').map(model => (<option key={model.id} value={model.id}>{model.name} ({model.provider})</option>))}
                <optgroup label="その他のモデル">{textModels.filter(m => m.provider !== 'Anthropic').map(model => (<option key={model.id} value={model.id}>{model.name} ({model.provider})</option>))}</optgroup>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">実行モード</label>
              <select value={conductorMode} onChange={(e) => setConductorMode(e.target.value as any)} className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-yellow-500 focus:outline-none">
                <option value="delegate">📋 タスク分割</option>
                <option value="evaluate">📊 評価</option>
                <option value="synthesize">🔗 統合</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {executionMode === 'debate' && (
        <div className="p-4 bg-purple-50 rounded-lg space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">壁打ちモード</label>
              <select value={debateMode} onChange={(e) => setDebateMode(e.target.value as any)} className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-purple-600 focus:outline-none">
                <option value="debate">🎭 ディベート</option>
                <option value="brainstorm">💡 ブレインストーミング</option>
                <option value="critique">🔍 批評</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">ラウンド数</label>
              <input type="number" value={debateRounds} onChange={(e) => setDebateRounds(Number(e.target.value))} min={1} max={10} className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-purple-600 focus:outline-none" />
            </div>
          </div>
        </div>
      )}

      <div className="p-4 bg-blue-50 rounded-lg">
        <div className="flex items-center justify-between">
          <div><label className="font-semibold text-gray-700">🧠 推論モード</label><p className="text-sm text-gray-500 mt-1">Claude 4系、DeepSeek R1などで深い思考プロセスを有効化</p></div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={enableReasoning} onChange={(e) => setEnableReasoning(e.target.checked)} className="sr-only peer" />
            <div className="w-14 h-7 bg-gray-200 peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
          </label>
        </div>
        {enableReasoning && (
          <div className="mt-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">推論トークン予算</label>
            <input type="number" value={reasoningBudget} onChange={(e) => setReasoningBudget(Number(e.target.value))} min={1000} max={50000} step={1000} className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-purple-600 focus:outline-none" />
            {!hasReasoningModel && selectedModels.length > 0 && <p className="text-xs text-orange-600 mt-2">⚠️ 選択中のモデルに推論対応モデルが含まれていません</p>}
          </div>
        )}
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <label className="text-lg font-semibold text-gray-700">
            {executionMode === 'conductor' ? 'ワーカー' : 'モデル'}選択（{selectedModels.length}個選択中）
            {executionMode === 'debate' && selectedModels.length < 2 && <span className="text-red-500 text-sm ml-2">※2つ以上選択してください</span>}
          </label>
          <div className="space-x-2">
            <button type="button" onClick={selectAll} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition">全選択</button>
            <button type="button" onClick={deselectAll} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition">全解除</button>
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto border-2 border-gray-200 rounded-lg p-4 space-y-2">
          {textModels.map(model => (
            <label key={model.id} className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer">
              <input type="checkbox" checked={selectedModels.includes(model.id)} onChange={() => toggleModel(model.id)} className="mr-3 w-4 h-4" />
              <span className="flex-1">{model.name} <span className="text-gray-500">({model.provider})</span>{isReasoningSupported(model.id) && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">🧠 推論対応</span>}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-lg font-semibold text-gray-700 mb-2">{executionMode === 'debate' ? 'トピック / 議題' : executionMode === 'conductor' ? 'タスク' : 'プロンプト'}</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} required placeholder={executionMode === 'debate' ? "議論したいトピックを入力してください..." : executionMode === 'conductor' ? "指揮者に依頼するタスクを入力してください..." : "実行したいプロンプトを入力してください..."} className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-purple-600 focus:outline-none min-h-32" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">リージョン</label>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-purple-600 focus:outline-none">
            {regions.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">最大トークン数</label>
          <input type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} min={1} max={4096} className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-purple-600 focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Temperature</label>
          <input type="number" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} min={0} max={1} step={0.1} className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-purple-600 focus:outline-none" />
        </div>
      </div>

      <button type="submit" disabled={isExecuting} className="w-full py-4 bg-gradient-to-r from-purple-600 to-purple-800 text-white text-lg font-semibold rounded-lg hover:from-purple-700 hover:to-purple-900 disabled:opacity-50 disabled:cursor-not-allowed transition">
        {isExecuting ? '実行中...' : executionMode === 'debate' ? '🎭 壁打ち開始' : executionMode === 'conductor' ? '🎼 指揮者モード開始' : '🚀 実行'}
      </button>

      {isExecuting && <button type="button" onClick={onCancel} className="w-full py-4 bg-gradient-to-r from-red-600 to-red-800 text-white text-lg font-semibold rounded-lg hover:from-red-700 hover:to-red-900 transition mt-4">キャンセル</button>}
    </form>
  );
}
