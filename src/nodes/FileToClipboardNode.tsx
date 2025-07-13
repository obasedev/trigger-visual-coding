import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Clipboard, CheckCircle } from 'lucide-react';
import BaseNode, { InputField } from './Basenode';

import type {
  NodeConfig,
  ExecutionMode
} from '../types';

import { useWorkflow, useViewerStatus, useHandleConnection } from '../WorkflowContext';

// 노드 데이터 타입 정의
interface FileToClipboardNodeData {
  text?: string;  // 🔧 수정: filePaths → text (FilePathNode 출력과 일치)
  triggerExecution?: number;
  outputData?: {
    status?: string;
  };
}

// 노드 Props 타입 정의
interface FileToClipboardNodeProps {
  id: string;
  data: FileToClipboardNodeData;
  selected: boolean;
}

function FileToClipboardNode({ id, data, selected }: FileToClipboardNodeProps) {
  const { updateNodeData, executeNextNodes } = useWorkflow();
  
  // 뷰어 상태 관리
  const { isInViewer, addToViewer, removeFromViewer } = useViewerStatus(id);
  
  // 입력 연결 상태 확인
  const isFilePathsConnected = useHandleConnection(id, 'text');

  // 상태 관리
  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [result, setResult] = useState<string>('');
  const [localFilePaths, setLocalFilePaths] = useState<string>(data.text || '');

  // 🆕 추가: InputField 표시용 텍스트 길이 제한 함수 (더 짧게)
  const getDisplayValue = useCallback((content: string): string => {
    if (!content) return '';
    
    const lines = content.split('\n');
    
    // 🔧 3줄 이상이면 처음 3줄만 표시 (개수 표시 제거)
    if (lines.length > 3) {
      const preview = lines.slice(0, 3).join('\n');
      return `${preview}\n...`; // 🔧 수정: 개수 표시 제거
    }
    
    // 🔧 150자 이상이면 잘라내기
    if (content.length > 150) {
      return content.substring(0, 147) + '...';
    }
    
    return content;
  }, []);

  // 파일 경로 입력 변경 처리
  const handleFilePathsChange = useCallback((value: string) => {
    if (!isFilePathsConnected) {
      setLocalFilePaths(value);
      updateNodeData(id, { text: value });
    }
  }, [id, isFilePathsConnected, updateNodeData]);

  // 연결된 데이터 동기화 (디버깅 추가)
  useEffect(() => {
    console.log('🔍 FileToClipboardNode data sync check:', {
      isConnected: isFilePathsConnected,
      dataText: data.text,
      localFilePaths: localFilePaths,
      allData: data
    });
    
    if (isFilePathsConnected && data.text !== localFilePaths) {
      console.log('🔄 Updating local file paths:', data.text);
      setLocalFilePaths(data.text || '');
    }
  }, [data.text, localFilePaths, isFilePathsConnected, data]);

  // 실행 함수
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    try {
      setStatus('running');
      
      // 🔍 디버깅: 실행시 데이터 상태 확인
      console.log('🔍 FileToClipboardNode execution debug:', {
        mode: mode,
        localFilePaths: localFilePaths,
        dataText: data.text,
        isConnected: isFilePathsConnected
      });
      
      const filePaths = localFilePaths.trim();
      if (!filePaths) {
        console.warn('⚠️ No file paths available for execution');
        setStatus('failed');
        setResult('No file paths provided');
        setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
        return;
      }

      console.log(`📋 FileToClipboardNode ${id} executing... (mode: ${mode})`);
      
      // 파일 경로들을 배열로 변환
      const pathsArray = filePaths.split('\n').filter(path => path.trim());
      console.log(`📂 Processing ${pathsArray.length} files for clipboard`);
      
      // 백엔드로 파일 읽기 및 클립보드 복사 요청
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke('file_to_clipboard_node', {
        filePaths: pathsArray
      }) as string;

      console.log('✅ Files copied to clipboard successfully');
      
      setStatus('completed');
      setResult(`${pathsArray.length} files copied to clipboard`);

      // 상태 정보 업데이트
      updateNodeData(id, {
        outputData: {
          status: 'copied'
        }
      });

      // 트리거 모드일 때만 다음 노드 실행
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 FileToClipboardNode: Triggering next nodes (mode: ${mode})`);
      }

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);

    } catch (error: unknown) {
      let errorMessage: string;
      
      if (error instanceof Error) {
        errorMessage = error.message;
        console.error('❌ FileToClipboardNode Error object:', error);
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = 'Unknown error occurred';
        console.error('❌ FileToClipboardNode Unknown error type:', error);
      }
      
      console.error('❌ FileToClipboardNode execution failed:', errorMessage);
      setStatus('failed');
      setResult(errorMessage);

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
    }
  }, [id, localFilePaths, updateNodeData, executeNextNodes]);

  // 뷰어 토글 함수
  const handleViewerToggle = useCallback(() => {
    if (isInViewer) {
      removeFromViewer();
    } else {
      addToViewer('fileToClipboardNode', 'File To Clipboard');
    }
  }, [isInViewer, addToViewer, removeFromViewer, id]);

  // 외부 트리거 실행 감지 (자동 실행)
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number') {
      console.log(`📋 FileToClipboardNode ${id} auto-execution triggered!`);
      executeNode('triggered');
    }
  }, [data.triggerExecution, executeNode]);

  // 초기화 시 데이터 정리
  useEffect(() => {
    if (data.triggerExecution) {
      updateNodeData(id, { triggerExecution: undefined });
    }
  }, []);

  return (
    <BaseNode<FileToClipboardNodeData>
      id={id}
      title="File To Clipboard"
      icon={<Copy size={16} stroke="white" />}
      status={status}
      selected={selected}
      onExecute={executeNode}
      hasInput={true}   // 트리거 입력 받음
      hasOutput={true}  // 다음 노드로 연결 가능
      data={data}
      result={result}
      description="Copy file contents to clipboard. Triggered automatically when files are received."
      onAddToViewer={handleViewerToggle}
      onRemoveFromViewer={handleViewerToggle}
      isInViewer={isInViewer}
      customExecuteIcon={<Clipboard size={12} />}
    >
      {/* 파일 경로 입력 필드 (🔧 수정: 표시용 텍스트 길이 제한) */}
      <InputField
        label="File Paths"
        icon={<Copy size={12} />}
        value={getDisplayValue(localFilePaths)}  // 🔧 수정: 길이 제한된 텍스트 표시
        placeholder="File paths (one per line)"
        type="textarea"
        rows={3}
        handleId="text"
        nodeId={id}
        onChange={handleFilePathsChange}
        disabled={isFilePathsConnected}
      />

      {/* 상태 표시 */}
      {status === 'completed' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 8px',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          borderRadius: '4px',
          marginTop: '8px'
        }}>
          <CheckCircle size={12} color="#4CAF50" />
          <span style={{ fontSize: '10px', color: '#4CAF50' }}>
            Files copied to clipboard
          </span>
        </div>
      )}
    </BaseNode>
  );
}

// 사이드바 자동 발견을 위한 설정 정보
export const config: NodeConfig = {
  type: 'fileToClipboardNode',
  label: 'File To Clipboard',
  color: '#FF9800',
  category: 'File',
  settings: [
    { key: 'autoTrigger', type: 'boolean', label: 'Auto Trigger on Input', default: true }
  ]
};

export default FileToClipboardNode;