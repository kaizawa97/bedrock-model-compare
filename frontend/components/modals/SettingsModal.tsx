'use client';

import { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Settings {
  aws_access_key_id: string;
  aws_secret_access_key: string;
  aws_bearer_token: string;
  aws_default_region: string;
  aws_profile: string;
  auth_method: 'none' | 'access_key' | 'bearer' | 'profile';
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>({
    aws_access_key_id: '',
    aws_secret_access_key: '',
    aws_bearer_token: '',
    aws_default_region: 'us-east-1',
    aws_profile: '',
    auth_method: 'none',
  });
  const [authMethod, setAuthMethod] = useState<'access_key' | 'bearer' | 'profile'>('bearer');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/settings');
      const data = await response.json();
      setSettings(data);
      if (data.auth_method !== 'none') {
        setAuthMethod(data.auth_method);
      }
    } catch (error) {
      console.error('設定取得エラー:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    
    try {
      const payload: any = {
        aws_default_region: settings.aws_default_region,
      };

      if (authMethod === 'access_key') {
        payload.aws_access_key_id = settings.aws_access_key_id;
        payload.aws_secret_access_key = settings.aws_secret_access_key;
        payload.aws_bearer_token = '';
        payload.aws_profile = '';
      } else if (authMethod === 'bearer') {
        payload.aws_bearer_token = settings.aws_bearer_token;
        payload.aws_access_key_id = '';
        payload.aws_secret_access_key = '';
        payload.aws_profile = '';
      } else if (authMethod === 'profile') {
        payload.aws_profile = settings.aws_profile;
        payload.aws_access_key_id = '';
        payload.aws_secret_access_key = '';
        payload.aws_bearer_token = '';
      }

      const response = await fetch('http://localhost:8000/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: '設定を保存しました' });
        fetchSettings();
      } else {
        setMessage({ type: 'error', text: data.message || '保存に失敗しました' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '保存中にエラーが発生しました' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setMessage(null);

    try {
      const response = await fetch('http://localhost:8000/api/settings/test', {
        method: 'POST',
      });
      const data = await response.json();
      setMessage({
        type: data.success ? 'success' : 'error',
        text: data.message,
      });
    } catch (error) {
      setMessage({ type: 'error', text: '接続テスト中にエラーが発生しました' });
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold text-gray-800">⚙️ AWS設定</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 認証方法選択 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">認証方法</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAuthMethod('bearer')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                  authMethod === 'bearer'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Bearer Token
              </button>
              <button
                type="button"
                onClick={() => setAuthMethod('access_key')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                  authMethod === 'access_key'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Access Key
              </button>
              <button
                type="button"
                onClick={() => setAuthMethod('profile')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                  authMethod === 'profile'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Profile
              </button>
            </div>
          </div>

          {/* Bearer Token */}
          {authMethod === 'bearer' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bearer Token
              </label>
              <input
                type="password"
                value={settings.aws_bearer_token}
                onChange={(e) => setSettings({ ...settings, aws_bearer_token: e.target.value })}
                placeholder="AWS_BEARER_TOKEN_BEDROCK"
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:border-purple-500 focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Bedrock API Key（ABSKで始まるトークン）
              </p>
            </div>
          )}

          {/* Access Key */}
          {authMethod === 'access_key' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access Key ID
                </label>
                <input
                  type="text"
                  value={settings.aws_access_key_id}
                  onChange={(e) => setSettings({ ...settings, aws_access_key_id: e.target.value })}
                  placeholder="AKIA..."
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Secret Access Key
                </label>
                <input
                  type="password"
                  value={settings.aws_secret_access_key}
                  onChange={(e) => setSettings({ ...settings, aws_secret_access_key: e.target.value })}
                  placeholder="Secret Key"
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:border-purple-500 focus:outline-none"
                />
              </div>
            </>
          )}

          {/* Profile */}
          {authMethod === 'profile' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                AWS Profile名
              </label>
              <input
                type="text"
                value={settings.aws_profile}
                onChange={(e) => setSettings({ ...settings, aws_profile: e.target.value })}
                placeholder="default"
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:border-purple-500 focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                ~/.aws/credentials に設定されたプロファイル名
              </p>
            </div>
          )}

          {/* リージョン */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              デフォルトリージョン
            </label>
            <select
              value={settings.aws_default_region}
              onChange={(e) => setSettings({ ...settings, aws_default_region: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:border-purple-500 focus:outline-none"
            >
              <option value="us-east-1">US East (N. Virginia)</option>
              <option value="us-west-2">US West (Oregon)</option>
              <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
              <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
              <option value="eu-west-1">Europe (Ireland)</option>
              <option value="eu-central-1">Europe (Frankfurt)</option>
            </select>
          </div>

          {/* メッセージ */}
          {message && (
            <div className={`p-3 rounded-lg text-sm ${
              message.type === 'success' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}>
              {message.text}
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={handleTest}
            disabled={isTesting}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 text-sm"
          >
            {isTesting ? 'テスト中...' : '🔌 接続テスト'}
          </button>
          <div className="flex-1"></div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm"
          >
            {isSaving ? '保存中...' : '💾 保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
