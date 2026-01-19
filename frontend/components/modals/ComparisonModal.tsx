'use client';

import { Result } from '@/types';
import { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ComparisonModalProps {
  results: Result[];
  onClose: () => void;
}

export default function ComparisonModal({ results, onClose }: ComparisonModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const getModelInfo = (modelId: string) => {
    if (typeof window !== 'undefined' && (window as any).bedrockModels) {
      return (window as any).bedrockModels.find((m: any) => m.id === modelId);
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold">モデル比較 ({results.length}個)</h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-full w-10 h-10 flex items-center justify-center text-2xl transition"
          >
            ×
          </button>
        </div>

        {/* ボディ */}
        <div className="p-8 overflow-y-auto max-h-[calc(90vh-100px)]">
          {/* 比較テーブル */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-purple-600 mb-4">基本情報</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-purple-100">
                    <th className="p-3 text-left font-semibold border">項目</th>
                    {results.map((result, idx) => {
                      const model = getModelInfo(result.model_id);
                      return (
                        <th key={idx} className="p-3 text-left font-semibold border">
                          {model?.name || result.model_id}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-3 border font-semibold bg-gray-50">プロバイダー</td>
                    {results.map((result, idx) => {
                      const model = getModelInfo(result.model_id);
                      return (
                        <td key={idx} className="p-3 border">{model?.provider || 'Unknown'}</td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="p-3 border font-semibold bg-gray-50">ステータス</td>
                    {results.map((result, idx) => (
                      <td key={idx} className="p-3 border">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                          result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {result.success ? '✅ 成功' : '❌ 失敗'}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 border font-semibold bg-gray-50">実行時間</td>
                    {results.map((result, idx) => (
                      <td key={idx} className="p-3 border font-mono">
                        {result.elapsed_time.toFixed(2)}秒
                      </td>
                    ))}
                  </tr>
                  {results.some(r => r.cost) && (
                    <>
                      <tr>
                        <td className="p-3 border font-semibold bg-gray-50">入力トークン</td>
                        {results.map((result, idx) => (
                          <td key={idx} className="p-3 border font-mono">
                            {result.cost?.input_tokens || '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="p-3 border font-semibold bg-gray-50">出力トークン</td>
                        {results.map((result, idx) => (
                          <td key={idx} className="p-3 border font-mono">
                            {result.cost?.output_tokens || '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="p-3 border font-semibold bg-gray-50">総コスト</td>
                        {results.map((result, idx) => (
                          <td key={idx} className="p-3 border font-mono text-green-600 font-bold">
                            ${result.cost?.total_cost.toFixed(6) || '-'}
                          </td>
                        ))}
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* レスポンス比較 */}
          <div>
            <h3 className="text-xl font-bold text-purple-600 mb-4">レスポンス比較</h3>
            <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${results.length}, 1fr)` }}>
              {results.map((result, idx) => {
                const model = getModelInfo(result.model_id);
                return (
                  <div key={idx} className="border-2 border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-purple-100 p-3 font-semibold text-center">
                      {model?.name || result.model_id}
                    </div>
                    <div className="p-4 bg-white max-h-96 overflow-y-auto">
                      {result.success ? (
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {result.output}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <pre className="text-sm text-red-600 whitespace-pre-wrap">
                          {result.error}
                        </pre>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
