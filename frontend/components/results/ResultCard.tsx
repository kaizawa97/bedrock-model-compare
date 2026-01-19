'use client';

import { Result } from '@/types';
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ResultCardProps {
  result: Result;
  onClick: () => void;
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
  // global.anthropic.claude-sonnet-4-5-20250929-v1:0 -> Claude Sonnet 4.5
  const parts = modelId.split('.');
  const lastPart = parts[parts.length - 1].split(':')[0]; // バージョン除去
  
  // 一般的なモデル名のマッピング
  // Anthropic
  if (lastPart.includes('claude-sonnet-4-5')) return 'Claude Sonnet 4.5';
  if (lastPart.includes('claude-opus-4-5')) return 'Claude Opus 4.5';
  if (lastPart.includes('claude-haiku-4-5')) return 'Claude Haiku 4.5';
  if (lastPart.includes('claude-sonnet-4')) return 'Claude Sonnet 4';
  if (lastPart.includes('claude-opus-4-1')) return 'Claude Opus 4.1';
  if (lastPart.includes('claude-opus-4')) return 'Claude Opus 4';
  if (lastPart.includes('claude-3-7-sonnet')) return 'Claude 3.7 Sonnet';
  if (lastPart.includes('claude-3-5-sonnet')) return 'Claude 3.5 Sonnet';
  if (lastPart.includes('claude-3-5-haiku')) return 'Claude 3.5 Haiku';
  if (lastPart.includes('claude-3-opus')) return 'Claude 3 Opus';
  if (lastPart.includes('claude-3-sonnet')) return 'Claude 3 Sonnet';
  if (lastPart.includes('claude-3-haiku')) return 'Claude 3 Haiku';
  // Amazon Nova
  if (lastPart.includes('nova-premier')) return 'Nova Premier';
  if (lastPart.includes('nova-2-lite')) return 'Nova 2 Lite';
  if (lastPart.includes('nova-pro')) return 'Nova Pro';
  if (lastPart.includes('nova-lite')) return 'Nova Lite';
  if (lastPart.includes('nova-micro')) return 'Nova Micro';
  // Meta Llama
  if (lastPart.includes('llama4-scout')) return 'Llama 4 Scout';
  if (lastPart.includes('llama4-maverick')) return 'Llama 4 Maverick';
  if (lastPart.includes('llama3-3')) return 'Llama 3.3';
  if (lastPart.includes('llama3-2')) return 'Llama 3.2';
  if (lastPart.includes('llama3-1')) return 'Llama 3.1';
  if (lastPart.includes('llama3')) return 'Llama 3';
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
  // Cohere
  if (lastPart.includes('command-r-plus')) return 'Command R+';
  if (lastPart.includes('command-r')) return 'Command R';
  // AI21
  if (lastPart.includes('jamba-1-5-large')) return 'Jamba 1.5 Large';
  if (lastPart.includes('jamba-1-5-mini')) return 'Jamba 1.5 Mini';
  // Writer
  if (lastPart.includes('palmyra-x5')) return 'Palmyra X5';
  if (lastPart.includes('palmyra-x4')) return 'Palmyra X4';
  // NVIDIA
  if (lastPart.includes('nemotron-nano-3-30b')) return 'Nemotron 30B';
  if (lastPart.includes('nemotron-nano-12b')) return 'Nemotron 12B';
  if (lastPart.includes('nemotron-nano-9b')) return 'Nemotron 9B';
  // Google
  if (lastPart.includes('gemma-3-27b')) return 'Gemma 3 27B';
  if (lastPart.includes('gemma-3-12b')) return 'Gemma 3 12B';
  if (lastPart.includes('gemma-3-4b')) return 'Gemma 3 4B';
  // Qwen
  if (lastPart.includes('qwen3-vl')) return 'Qwen3 VL';
  if (lastPart.includes('qwen3-next')) return 'Qwen3 Next';
  if (lastPart.includes('qwen3-coder')) return 'Qwen3 Coder';
  if (lastPart.includes('qwen3-32b')) return 'Qwen3 32B';
  // Others
  if (lastPart.includes('deepseek')) return 'DeepSeek R1';
  if (lastPart.includes('gpt-oss-120b')) return 'GPT OSS 120B';
  if (lastPart.includes('gpt-oss-20b')) return 'GPT OSS 20B';
  if (lastPart.includes('minimax-m2')) return 'MiniMax M2';
  if (lastPart.includes('kimi-k2')) return 'Kimi K2';
  
  // フォールバック: 最後の部分を整形
  return lastPart.replace(/-v\d+$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function ResultCard({ result, onClick }: ResultCardProps) {
  const [model, setModel] = useState<any>(null);
  const [showThinking, setShowThinking] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).bedrockModels) {
      const foundModel = (window as any).bedrockModels.find((m: any) => m.id === result.model_id);
      setModel(foundModel);
    }
  }, [result.model_id]);

  const modelName = model?.name || getShortModelName(result.model_id);
  const provider = model?.provider || getProviderFromModelId(result.model_id);

  return (
    <div
      onClick={onClick}
      className={`
        grid grid-cols-[280px_1fr] gap-6 p-6 rounded-xl cursor-pointer
        transition-all duration-200 hover:translate-x-2 hover:shadow-lg
        ${result.success 
          ? 'bg-gradient-to-r from-green-50 to-white border-l-4 border-green-500' 
          : 'bg-gradient-to-r from-red-50 to-white border-l-4 border-red-500'
        }
      `}
    >
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-purple-600">{modelName}</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span className="font-semibold">📦</span>
            <span>{provider}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">⏱️</span>
            <span>{result.elapsed_time.toFixed(2)}秒</span>
          </div>
          {result.cost && (
            <div className="flex items-center gap-2">
              <span className="font-semibold">💰</span>
              <span className="text-green-600 font-bold">${result.cost.total_cost.toFixed(6)}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {result.success ? '✅ 成功' : '❌ 失敗'}
            </span>
            {result.thinking && (
              <span className="inline-block px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">🧠 推論</span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border border-gray-200 overflow-hidden">
        {result.thinking && (
          <div className="mb-3">
            <button
              onClick={(e) => { e.stopPropagation(); setShowThinking(!showThinking); }}
              className="text-sm text-purple-600 hover:text-purple-800 font-medium"
            >
              🧠 推論内容を{showThinking ? '隠す' : '表示'}
            </button>
            {showThinking && (
              <div className="mt-2 p-3 bg-purple-50 rounded text-sm text-gray-700 max-h-32 overflow-y-auto">
                <pre className="whitespace-pre-wrap">{result.thinking}</pre>
              </div>
            )}
          </div>
        )}
        <div className="prose prose-sm max-w-none max-h-32 overflow-y-auto">
          {result.success ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.output}</ReactMarkdown>
          ) : (
            <pre className="text-sm text-red-600 whitespace-pre-wrap break-words">{result.error}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
