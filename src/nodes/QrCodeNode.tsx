import React, { useState, useEffect, useCallback } from 'react';
import { QrCode, Link } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import BaseNode, { InputField } from './Basenode';

import type {
  NodeConfig,
  BaseNodeData
} from '../types';

import { useWorkflow, useHandleConnection } from '../WorkflowContext';

// QR코드 노드 데이터 타입
interface QrCodeNodeData extends BaseNodeData {
  url: string;
}

// QR코드 노드 Props 타입
interface QrCodeNodeProps {
  id: string;
  data: QrCodeNodeData;
  selected: boolean;
}

// 백엔드 결과 타입
interface QrCodeResult {
  image_base64: string;
  url: string;
  message?: string;
}

function QrCodeNode({ id, data, selected }: QrCodeNodeProps) {
  const { updateNodeData } = useWorkflow();

  const [previewImage, setPreviewImage] = useState<string>('');
  const [localUrl, setLocalUrl] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const isUrlConnected = useHandleConnection(id, 'url');

  // 현재 사용할 URL 결정
  const currentUrl = isUrlConnected ? (data?.url || '') : localUrl;

  // 초기값 설정
  useEffect(() => {
    setLocalUrl(data?.url || '');
  }, [data?.url]);

  // QR코드 생성 함수 (깜빡임 방지)
  const generateQrCode = useCallback(async (url: string): Promise<void> => {
    if (!url.trim()) {
      setPreviewImage('');
      setIsLoading(false);
      return;
    }

    // 🎯 핵심 수정: 기존 이미지가 있으면 로딩 상태 표시 안함
    const hasExistingImage = previewImage !== '';
    if (!hasExistingImage) {
      setIsLoading(true);
    }

    try {
      const resultData: QrCodeResult = await invoke('qr_code_node', { url });
      
      if (resultData.image_base64) {
        setPreviewImage(`data:image/png;base64,${resultData.image_base64}`);
      }
    } catch (error) {
      console.error('❌ QR code generation failed:', error);
      if (!hasExistingImage) {
        setPreviewImage('');
      }
    } finally {
      setIsLoading(false);
    }
  }, [previewImage]);

  // URL이 변경될 때마다 QR 코드 생성
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      generateQrCode(currentUrl);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [currentUrl, generateQrCode]);

  // 로컬 URL 변경시 노드 데이터 업데이트
  const handleUrlChange = (value: string) => {
    setLocalUrl(value);
    if (!isUrlConnected) {
      updateNodeData(id, { url: value });
    }
  };

  return (
    <BaseNode<QrCodeNodeData>
      id={id}
      title="QR Code Generator"
      icon={<QrCode size={16} stroke="white" />}
      status="waiting"
      selected={selected}
      onExecute={() => {}} // 실행 버튼 없음
      hasInput={false}     // 트리거 입력 없음
      hasOutput={false}    // 트리거 출력 없음
      data={data}
      description="Converts URL or text to QR code automatically"
    >
      {/* URL 입력 */}
      <InputField
        nodeId={id}
        label="URL or Text"
        icon={<Link size={12} />}
        value={localUrl}
        placeholder="https://example.com"
        onChange={handleUrlChange}
        handleId="url"
        disabled={isUrlConnected}
      />

      {/* QR코드 표시 영역 */}
      <div className="node-input-field">
        <div className="node-input-content">
          <div className="node-input-label">
            <QrCode size={12} />
            QR Code
          </div>
          
          {/* 로딩 상태 */}
          {isLoading && (
            <div style={{ 
              padding: '40px 15px', 
              textAlign: 'center', 
              background: '#f0f9ff', 
              borderRadius: '12px',
              border: '2px solid #3b82f6',
              color: '#1e40af'
            }}>
              <QrCode size={32} color="#3b82f6" />
              <div style={{ marginTop: '10px', fontSize: '14px' }}>
                Generating QR code...
              </div>
            </div>
          )}
          
          {/* QR코드 이미지 */}
          {!isLoading && previewImage && (
            <div style={{ 
              padding: '15px', 
              textAlign: 'center', 
              background: '#ffffff', 
              borderRadius: '12px',
              border: '2px solid #e0e0e0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <img 
                src={previewImage} 
                alt="QR Code" 
                style={{ 
                  width: '200px',
                  height: '200px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  display: 'block',
                  margin: '0 auto'
                }}
                onError={() => setPreviewImage('')}
              />
            </div>
          )}
          
          {/* 빈 상태 */}
          {!isLoading && !previewImage && !currentUrl.trim() && (
            <div style={{ 
              padding: '40px 15px', 
              textAlign: 'center', 
              background: '#f8f9fa', 
              borderRadius: '12px',
              border: '2px dashed #ddd',
              color: '#999'
            }}>
              <QrCode size={32} color="#ccc" />
              <div style={{ marginTop: '10px', fontSize: '14px' }}>
                Enter URL to generate QR code
              </div>
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
}

// 사이드바 자동 발견을 위한 설정 정보
export const config: NodeConfig = {
  type: 'qrCodeNode',
  label: 'QR Code Generator',
  color: '#2196F3',
  category: 'Utility',
  settings: [
    { key: 'url', type: 'text', label: 'URL or Text', default: '' }
  ]
};

export default QrCodeNode;