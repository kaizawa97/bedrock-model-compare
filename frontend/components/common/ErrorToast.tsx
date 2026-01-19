'use client';

import { useState, useEffect } from 'react';

export interface ErrorMessage {
  id: string;
  message: string;
  type: 'error' | 'warning' | 'info';
}

interface ErrorToastProps {
  errors: ErrorMessage[];
  onDismiss: (id: string) => void;
}

export default function ErrorToast({ errors, onDismiss }: ErrorToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md">
      {errors.map((error) => (
        <div
          key={error.id}
          className={`p-4 rounded-lg shadow-lg flex items-start gap-3 animate-slide-in ${
            error.type === 'error' 
              ? 'bg-red-50 border border-red-200 text-red-800'
              : error.type === 'warning'
                ? 'bg-yellow-50 border border-yellow-200 text-yellow-800'
                : 'bg-blue-50 border border-blue-200 text-blue-800'
          }`}
        >
          <span className="text-xl flex-shrink-0">
            {error.type === 'error' ? '❌' : error.type === 'warning' ? '⚠️' : 'ℹ️'}
          </span>
          <div className="flex-1 text-sm">{error.message}</div>
          <button
            onClick={() => onDismiss(error.id)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// エラー管理用のカスタムフック
export function useErrorToast() {
  const [errors, setErrors] = useState<ErrorMessage[]>([]);

  const addError = (message: string, type: 'error' | 'warning' | 'info' = 'error') => {
    const id = Date.now().toString();
    setErrors(prev => [...prev, { id, message, type }]);
    
    // 5秒後に自動で消える
    setTimeout(() => {
      dismissError(id);
    }, 5000);
  };

  const dismissError = (id: string) => {
    setErrors(prev => prev.filter(e => e.id !== id));
  };

  return { errors, addError, dismissError };
}
