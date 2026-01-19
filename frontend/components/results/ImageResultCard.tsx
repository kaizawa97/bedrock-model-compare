'use client';

import { ImageResult } from '@/types';
import { useState } from 'react';

interface ImageResultCardProps {
  result: ImageResult;
  onClick: () => void;
}

function getProviderFromModelId(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.includes('titan-image')) return 'Amazon';
  if (id.includes('nova-canvas')) return 'Amazon';
  if (id.includes('stability') || id.includes('sd3') || id.includes('stable-diffusion')) return 'Stability AI';
  return 'Unknown';
}

function getShortModelName(modelId: string): string {
  const lastPart = modelId.split('.').pop()?.split(':')[0] || modelId;
  if (lastPart.includes('titan-image-generator-v2')) return 'Titan Image v2';
  if (lastPart.includes('nova-canvas')) return 'Nova Canvas';
  if (lastPart.includes('sd3-5-large')) return 'SD3.5 Large';
  if (lastPart.includes('sd3-large-turbo')) return 'SD3 Large Turbo';
  if (lastPart.includes('sd3-large')) return 'SD3 Large';
  return lastPart.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function ImageResultCard({ result, onClick }: ImageResultCardProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const modelName = getShortModelName(result.model_id);
  const provider = getProviderFromModelId(result.model_id);

  const images = result.images || [];
  const currentImage = images[selectedImageIndex];

  return (
    <div
      onClick={onClick}
      className={`
        grid grid-cols-[280px_1fr] gap-6 p-6 rounded-xl cursor-pointer
        transition-all duration-200 hover:translate-x-2 hover:shadow-lg
        ${result.success
          ? 'bg-gradient-to-r from-blue-50 to-white border-l-4 border-blue-500'
          : 'bg-gradient-to-r from-red-50 to-white border-l-4 border-red-500'
        }
      `}
    >
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-blue-600">{modelName}</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Provider</span>
            <span>{provider}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Time</span>
            <span>{result.elapsed_time.toFixed(2)}s</span>
          </div>
          {result.success && (
            <>
              <div className="flex items-center gap-2">
                <span className="font-semibold">Images</span>
                <span>{result.num_images || images.length}</span>
              </div>
              {result.width && result.height && (
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Size</span>
                  <span>{result.width}x{result.height}</span>
                </div>
              )}
            </>
          )}
          <div className="flex items-center gap-2">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {result.success ? 'Success' : 'Failed'}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border border-gray-200 overflow-hidden">
        {result.success && images.length > 0 ? (
          <div className="space-y-3">
            <div className="flex justify-center">
              <img
                src={`data:image/png;base64,${currentImage}`}
                alt={`Generated image ${selectedImageIndex + 1}`}
                className="max-h-64 object-contain rounded-lg shadow-md"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {images.length > 1 && (
              <div className="flex justify-center gap-2">
                {images.map((_, index) => (
                  <button
                    key={index}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedImageIndex(index);
                    }}
                    className={`w-8 h-8 rounded-full text-sm font-medium transition ${
                      selectedImageIndex === index
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32">
            <pre className="text-sm text-red-600 whitespace-pre-wrap break-words">{result.error}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
