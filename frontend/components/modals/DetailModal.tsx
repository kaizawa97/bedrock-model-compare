'use client';

import { Result } from '@/types';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DetailModalProps {
  result: Result;
  onClose: () => void;
}

// model_idからプロバイダーを推測
function getProviderFromModelId(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.includes('anthropic') || id.includes('claude')) return 'Anthropic';
  if (id.includes('amazon') || id.includes('titan') || id.includes('nova')) return 'Amazon';
  if (id.includes('meta') || id.includes('llama')) return 'Meta';
  if (id.includes('mistral') || id.includes('mixtral') || id.includes('ministral') || id.includes('magistral') || id.includes('pixtral')) return 'Mistral AI';
  if (id.includes('cohere') || id.includes('command')) return 'Cohere';
  if (id.includes('ai21') || id.includes('jamba')) return 'AI21 Labs';
  if (id.includes('writer') || id.includes('palmyra')) return 'Writer';
  if (id.includes('nvidia') || id.includes('nemotron')) return 'NVIDIA';
  if (id.includes('google') || id.includes('gemma')) return 'Google';
  if (id.includes('qwen')) return 'Qwen';
  if (id.includes('openai') || id.includes('gpt-oss')) return 'OpenAI';
  if (id.includes('minimax')) return 'MiniMax';
  if (id.includes('moonshot') || id.includes('kimi')) return 'Moonshot AI';
  if (id.includes('deepseek')) return 'DeepSeek';
  return 'Unknown';
}

// model_idから短い表示名を取得
function getShortModelName(modelId: string): string {
  const parts = modelId.split('.');
  const lastPart = parts[parts.length - 1].split(':')[0];
  
  // Anthropic
  if (lastPart.includes('claude-sonnet-4-5')) return 'Claude Sonnet 4.5';
  if (lastPart.includes('claude-opus-4-5')) return 'Claude Opus 4.5';
  if (lastPart.includes('claude-haiku-4-5')) return 'Claude Haiku 4.5';
  if (lastPart.includes('claude-sonnet-4')) return 'Claude Sonnet 4';
  if (lastPart.includes('claude-opus-4-1')) return 'Claude Opus 4.1';
  if (lastPart.includes('claude-opus-4')) return 'Claude Opus 4';
  if (lastPart.includes('claude-3-7')) return 'Claude 3.7 Sonnet';
  if (lastPart.includes('claude-3-5-sonnet')) return 'Claude 3.5 Sonnet';
  if (lastPart.includes('claude-3-5-haiku')) return 'Claude 3.5 Haiku';
  if (lastPart.includes('claude-3-opus')) return 'Claude 3 Opus';
  if (lastPart.includes('claude-3-sonnet')) return 'Claude 3 Sonnet';
  if (lastPart.includes('claude-3-haiku')) return 'Claude 3 Haiku';
  // Amazon
  if (lastPart.includes('nova-premier')) return 'Nova Premier';
  if (lastPart.includes('nova-2-lite')) return 'Nova 2 Lite';
  if (lastPart.includes('nova-pro')) return 'Nova Pro';
  if (lastPart.includes('nova-lite')) return 'Nova Lite';
  if (lastPart.includes('nova-micro')) return 'Nova Micro';
  // Meta
  if (lastPart.includes('llama4-scout')) return 'Llama 4 Scout';
  if (lastPart.includes('llama4-maverick')) return 'Llama 4 Maverick';
  if (lastPart.includes('llama3-3')) return 'Llama 3.3 70B';
  if (lastPart.includes('llama3-2-90b')) return 'Llama 3.2 90B';
  if (lastPart.includes('llama3-2-11b')) return 'Llama 3.2 11B';
  if (lastPart.includes('llama3-2-3b')) return 'Llama 3.2 3B';
  if (lastPart.includes('llama3-2-1b')) return 'Llama 3.2 1B';
  if (lastPart.includes('llama3-1-70b')) return 'Llama 3.1 70B';
  if (lastPart.includes('llama3-1-8b')) return 'Llama 3.1 8B';
  if (lastPart.includes('llama3-70b')) return 'Llama 3 70B';
  if (lastPart.includes('llama3-8b')) return 'Llama 3 8B';
  // Mistral
  if (lastPart.includes('mistral-large-3')) return 'Mistral Large 3';
  if (lastPart.includes('pixtral-large')) return 'Pixtral Large';
  if (lastPart.includes('mistral-large')) return 'Mistral Large';
  if (lastPart.includes('mistral-small')) return 'Mistral Small';
  if (lastPart.includes('mixtral')) return 'Mixtral 8x7B';
  if (lastPart.includes('ministral-3-14b')) return 'Ministral 14B';
  if (lastPart.includes('ministral-3-8b')) return 'Ministral 8B';
  if (lastPart.includes('ministral-3-3b')) return 'Ministral 3B';
  if (lastPart.includes('magistral')) return 'Magistral Small';
  if (lastPart.includes('mistral-7b')) return 'Mistral 7B';
  // Others
  if (lastPart.includes('command-r-plus')) return 'Command R+';
  if (lastPart.includes('command-r')) return 'Command R';
  if (lastPart.includes('jamba-1-5-large')) return 'Jamba 1.5 Large';
  if (lastPart.includes('jamba-1-5-mini')) return 'Jamba 1.5 Mini';
  if (lastPart.includes('palmyra-x5')) return 'Palmyra X5';
  if (lastPart.includes('palmyra-x4')) return 'Palmyra X4';
  if (lastPart.includes('nemotron-nano-3-30b')) return 'Nemotron 30B';
  if (lastPart.includes('nemotron-nano-12b')) return 'Nemotron 12B';
  if (lastPart.includes('nemotron-nano-9b')) return 'Nemotron 9B';
  if (lastPart.includes('gemma-3-27b')) return 'Gemma 3 27B';
  if (lastPart.includes('gemma-3-12b')) return 'Gemma 3 12B';
  if (lastPart.includes('gemma-3-4b')) return 'Gemma 3 4B';
  if (lastPart.includes('qwen3-vl')) return 'Qwen3 VL';
  if (lastPart.includes('qwen3-next')) return 'Qwen3 Next';
  if (lastPart.includes('qwen3-coder')) return 'Qwen3 Coder';
  if (lastPart.includes('qwen3-32b')) return 'Qwen3 32B';
  if (lastPart.includes('deepseek') || lastPart.includes('r1')) return 'DeepSeek R1';
  if (lastPart.includes('gpt-oss-120b')) return 'GPT OSS 120B';
  if (lastPart.includes('gpt-oss-20b')) return 'GPT OSS 20B';
  if (lastPart.includes('minimax-m2')) return 'MiniMax M2';
  if (lastPart.includes('kimi-k2')) return 'Kimi K2';
  
  return lastPart.replace(/-v\d+$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function DetailModal({ result, onClose }: DetailModalProps) {
  const [model, setModel] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).bedrockModels) {
      const foundModel = (window as any).bedrockModels.find((m: any) => m.id === result.model_id);
      setModel(foundModel);
    }
  }, [result.model_id]);

  const modelName = model?.name || getShortModelName(result.model_id);
  const provider = model?.provider || getProviderFromModelId(result.model_id);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold">{modelName}</h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-full w-10 h-10 flex items-center justify-center text-2xl transition"
          >
            ×
          </button>
        </div>

        <div className="p-8 overflow-y-auto max-h-[calc(90vh-100px)]">
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">モデル名</div>
              <div className="text-lg font-semibold">{modelName}</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">プロバイダー</div>
              <div className="text-lg font-semibold">{provider}</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">実行時間</div>
              <div className="text-lg font-semibold">{result.elapsed_time.toFixed(2)}秒</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">ステータス</div>
              <div className={`text-lg font-semibold ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                {result.success ? '✅ 成功' : '❌ 失敗'}
              </div>
            </div>
          </div>

          {result.success && result.cost && (
            <div className="mb-8">
              <h3 className="text-xl font-bold text-purple-600 mb-4">コスト詳細</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">入力トークン</div>
                  <div className="text-lg font-semibold">{result.cost.input_tokens}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">出力トークン</div>
                  <div className="text-lg font-semibold">{result.cost.output_tokens}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">入力コスト</div>
                  <div className="text-lg font-semibold">${result.cost.input_cost.toFixed(6)}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">出力コスト</div>
                  <div className="text-lg font-semibold">${result.cost.output_cost.toFixed(6)}</div>
                </div>
                <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-lg col-span-2">
                  <div className="text-sm text-gray-600 mb-1">総コスト</div>
                  <div className="text-2xl font-bold text-green-600">
                    ${result.cost.total_cost.toFixed(6)} USD
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mb-8">
            <h3 className="text-xl font-bold text-purple-600 mb-4">レスポンス</h3>
            <div className="bg-gray-50 p-6 rounded-lg">
              {result.success ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.output}</ReactMarkdown>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words text-sm font-mono leading-relaxed text-red-600">
                  {result.error}
                </pre>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold text-purple-600 mb-4">モデルID</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <code className="text-sm font-mono">{result.model_id}</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
