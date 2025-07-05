import React, { useState, useEffect, useCallback } from 'react';
import { FileText, FolderOpen, File, FileEdit, CheckCircle, XCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import BaseNode, { InputField, OutputField } from './Basenode';

import type {
  FileCreatorNodeProps,
  FileCreatorNodeData,
  NodeConfig,
  ExecutionMode
} from '../types';

import { useWorkflow, useHandleConnection } from '../WorkflowContext';

// 백엔드 파라미터 타입 정의
interface FileCreatorParams {
  filePath: string;
  fileName: string;
  fileContent: string;
}

// 백엔드 결과 타입 정의
interface BackendResult {
  message?: string;
  [key: string]: any;
}

function FileCreatorNode({ id, data, selected }: FileCreatorNodeProps) {
  const { executeNextNodes, updateNodeData } = useWorkflow();

  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [result, setResult] = useState<string>('');

  const [localFilePath, setLocalFilePath] = useState('');
  const [localFileName, setLocalFileName] = useState('');
  const [localFileContent, setLocalFileContent] = useState('');

  const isFilePathConnected = useHandleConnection(id, 'filePath');
  const isFileNameConnected = useHandleConnection(id, 'fileName');
  const isFileContentConnected = useHandleConnection(id, 'fileContent');

  useEffect(() => {
    setLocalFilePath(data?.filePath || '');
    setLocalFileName(data?.fileName || '');
    setLocalFileContent(data?.fileContent || '');
  }, [data?.filePath, data?.fileName, data?.fileContent]);

  const handleBlur = (key: keyof FileCreatorNodeData, value: string) => {
    if (key === 'filePath' && !isFilePathConnected && data.filePath !== value) updateNodeData(id, { filePath: value });
    if (key === 'fileName' && !isFileNameConnected && data.fileName !== value) updateNodeData(id, { fileName: value });
    if (key === 'fileContent' && !isFileContentConnected && data.fileContent !== value) updateNodeData(id, { fileContent: value });
  };

  // ✅ useCallback으로 executeNode 함수 메모이제이션 (실행 모드 지원)
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    // ✅ 실행 전 필수 필드 검증
    const currentFilePath = data?.filePath?.trim() || '';
    const currentFileName = data?.fileName?.trim() || '';
    const currentFileContent = data?.fileContent || '';

    if (!currentFilePath || !currentFileName) {
      console.warn('⚠️ FileCreatorNode: Missing required fields, skipping execution');
      setStatus('failed');
      setResult('File path and name are required');
      
      // ✅ 트리거 상태 초기화
      updateNodeData(id, { triggerExecution: undefined });
      
      setTimeout(() => { 
        setStatus('waiting'); 
        setResult(''); 
      }, 2000);
      return;
    }

    setStatus('running');
    try {
      const params: FileCreatorParams = {
        filePath: currentFilePath,
        fileName: currentFileName,
        fileContent: currentFileContent
      };

      console.log(`📄 FileCreatorNode ${id}: Creating file... (mode: ${mode})`);

      const resultData: BackendResult = await invoke('file_creator_node', params);
      const resultMessage = typeof resultData === 'string' ? resultData : resultData.message || 'File created successfully';

      // 완전한 파일 경로 생성 (경로 + 파일명)
      const fullFilePath = `${params.filePath}/${params.fileName}`;

      setStatus('completed');
      setResult('File created successfully');

      updateNodeData(id, {
        triggerExecution: undefined, // ✅ 트리거 상태 초기화
        outputData: {
          createdFilePath: fullFilePath,
          fileName: params.fileName,
          fileContent: params.fileContent,
        }
      });

      // 🎯 실행 모드에 따른 연쇄 실행 결정
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 FileCreatorNode: Triggering next nodes (auto-execution)`);
      } else {
        console.log(`🔧 FileCreatorNode: Manual execution completed, no chain reaction`);
      }

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('❌ File creation failed:', errorMessage, error);
      setStatus('failed');
      setResult(errorMessage);

      // ✅ 실패시 트리거 상태 초기화 및 출력 데이터 클리어
      updateNodeData(id, {
        triggerExecution: undefined,
        outputData: {
          createdFilePath: '',
          fileName: '',
          fileContent: '',
        }
      });

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
    }
  }, [id, data?.filePath, data?.fileName, data?.fileContent, executeNextNodes, updateNodeData]);

  // ✅ 트리거 실행 감지 (executeNode가 useCallback으로 안정화됨)
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number') {
      console.log(`📄 File creation node ${id} auto-execution triggered!`);
      executeNode('triggered'); // 자동 트리거 모드로 실행
    }
  }, [data.triggerExecution, executeNode]);

  return (
    <BaseNode<FileCreatorNodeData>
      id={id}
      title="Text File Creator"
      icon={<FileText size={16} stroke="white" />}
      status={status}
      selected={selected}
      onExecute={executeNode} // 실행 모드 매개변수 지원
      data={data}
      result={result}
      description="Creates a text file at the specified path"
    >
      <div onBlur={() => handleBlur('filePath', localFilePath)}>
        <InputField
          nodeId={id}
          label="File Path"
          icon={<FolderOpen size={12} />}
          value={localFilePath}
          placeholder="/Users/username/Desktop"
          onChange={setLocalFilePath}
          handleId="filePath"
          disabled={isFilePathConnected}
        />
      </div>

      <div onBlur={() => handleBlur('fileName', localFileName)}>
        <InputField
          nodeId={id}
          label="File Name"
          icon={<File size={12} />}
          value={localFileName}
          placeholder="example.txt"
          onChange={setLocalFileName}
          handleId="fileName"
          disabled={isFileNameConnected}
        />
      </div>

      <div onBlur={() => handleBlur('fileContent', localFileContent)}>
        <InputField
          nodeId={id}
          label="File Content"
          icon={<FileEdit size={12} />}
          value={localFileContent}
          placeholder="Enter file content here..."
          type="textarea"
          rows={1}
          onChange={setLocalFileContent}
          handleId="fileContent"
          disabled={isFileContentConnected}
        />
      </div>

      <OutputField
        nodeId={id}
        label="Created File Path"
        icon={<CheckCircle size={12} />}
        value={data.outputData?.createdFilePath || ''}
        handleId="createdFilePath"
      />

      <OutputField
        nodeId={id}
        label="File Name"
        icon={<File size={12} />}
        value={data.outputData?.fileName || ''}
        handleId="fileName"
      />

      <OutputField
        nodeId={id}
        label="File Content"
        icon={<FileEdit size={12} />}
        value={data.outputData?.fileContent || ''}
        handleId="fileContent"
      />
    </BaseNode>
  );
}

// 사이드바 자동 발견을 위한 설정 정보
export const config: NodeConfig = {
  type: 'fileCreatorNode',
  label: 'File Creator',
  color: '#FF9800',
  category: 'File',
  settings: [
    { key: 'filePath', type: 'text', label: 'File Path', default: '' },
    { key: 'fileName', type: 'text', label: 'File Name', default: '' },
    { key: 'fileContent', type: 'textarea', label: 'File Content', default: '' }
  ]
};

export default FileCreatorNode;