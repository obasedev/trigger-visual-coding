import React, { useState, useEffect, useCallback } from 'react';
import { Edit3, FolderOpen, File, FileEdit, CheckCircle, XCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import BaseNode, { InputField, OutputField } from './Basenode';

import type {
  TextFileEditorNodeProps,
  TextFileEditorNodeData,
  NodeConfig,
  ExecutionMode
} from '../types';

import { useWorkflow, useHandleConnection } from '../WorkflowContext';

// 백엔드 파라미터 타입 정의
interface TextFileEditorParams {
  filePath: string;
  newFileName: string;
  newFileContent: string;
}

// 백엔드 결과 타입 정의
interface BackendResult {
  message?: string;
  [key: string]: any;
}

function TextFileEditorNode({ id, data, selected }: TextFileEditorNodeProps) {
  const { executeNextNodes, updateNodeData } = useWorkflow();

  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [result, setResult] = useState<string>('');

  const [localFilePath, setLocalFilePath] = useState('');
  const [localNewFileName, setLocalNewFileName] = useState('');
  const [localNewFileContent, setLocalNewFileContent] = useState('');

  const isFilePathConnected = useHandleConnection(id, 'filePath');
  const isNewFileNameConnected = useHandleConnection(id, 'newFileName');
  const isNewFileContentConnected = useHandleConnection(id, 'newFileContent');

  useEffect(() => {
    setLocalFilePath(data?.filePath || '');
    setLocalNewFileName(data?.newFileName || '');
    setLocalNewFileContent(data?.newFileContent || '');
  }, [data?.filePath, data?.newFileName, data?.newFileContent]);

  const handleBlur = (key: keyof TextFileEditorNodeData, value: string) => {
    if (key === 'filePath' && !isFilePathConnected && data.filePath !== value) updateNodeData(id, { filePath: value });
    if (key === 'newFileName' && !isNewFileNameConnected && data.newFileName !== value) updateNodeData(id, { newFileName: value });
    if (key === 'newFileContent' && !isNewFileContentConnected && data.newFileContent !== value) updateNodeData(id, { newFileContent: value });
  };

  // ✅ useCallback으로 executeNode 함수 메모이제이션 (실행 모드 지원)
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    // ✅ 실행 전 필수 필드 검증
    const currentFilePath = data?.filePath?.trim() || '';
    const currentNewFileName = data?.newFileName?.trim() || '';
    const currentNewFileContent = data?.newFileContent || '';

    if (!currentFilePath || !currentNewFileName) {
      console.warn('⚠️ TextFileEditorNode: Missing required fields, skipping execution');
      setStatus('failed');
      setResult('File path and new file name are required');
      
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
      const params: TextFileEditorParams = {
        filePath: currentFilePath,
        newFileName: currentNewFileName,
        newFileContent: currentNewFileContent
      };

      console.log(`✏️ TextFileEditorNode ${id}: Editing file... (mode: ${mode})`);

      const resultData: BackendResult = await invoke('text_file_editor_node', params);
      const resultMessage = typeof resultData === 'string' ? resultData : resultData.message || 'File edited successfully';

      // 수정된 파일의 완전한 경로 생성
      const parentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/') || currentFilePath.lastIndexOf('\\'));
      const editedFilePath = parentDir ? `${parentDir}/${params.newFileName}` : params.newFileName;

      setStatus('completed');
      setResult('File edited successfully');

      updateNodeData(id, {
        triggerExecution: undefined, // ✅ 트리거 상태 초기화
        outputData: {
          editedFilePath: editedFilePath,
          newFileName: params.newFileName,
          newFileContent: params.newFileContent,
        }
      });

      // 🎯 실행 모드에 따른 연쇄 실행 결정
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 TextFileEditorNode: Triggering next nodes (auto-execution)`);
      } else {
        console.log(`🔧 TextFileEditorNode: Manual execution completed, no chain reaction`);
      }

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('❌ File editing failed:', errorMessage, error);
      setStatus('failed');
      setResult(errorMessage);

      // ✅ 실패시 트리거 상태 초기화 및 출력 데이터 클리어
      updateNodeData(id, {
        triggerExecution: undefined,
        outputData: {
          editedFilePath: '',
          newFileName: '',
          newFileContent: '',
        }
      });

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
    }
  }, [id, data?.filePath, data?.newFileName, data?.newFileContent, executeNextNodes, updateNodeData]);

  // ✅ 트리거 실행 감지 (executeNode가 useCallback으로 안정화됨)
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number') {
      console.log(`✏️ Text file editor node ${id} auto-execution triggered!`);
      executeNode('triggered'); // 자동 트리거 모드로 실행
    }
  }, [data.triggerExecution, executeNode]);

  return (
    <BaseNode<TextFileEditorNodeData>
      id={id}
      title="Text File Editor"
      icon={<Edit3 size={16} stroke="white" />}
      status={status}
      selected={selected}
      onExecute={executeNode} // 실행 모드 매개변수 지원
      data={data}
      result={result}
      description="Edits an existing text file with new content and optionally renames it"
    >
      <div onBlur={() => handleBlur('filePath', localFilePath)}>
        <InputField
          nodeId={id}
          label="File Path"
          icon={<FolderOpen size={12} />}
          value={localFilePath}
          placeholder="/Users/username/Desktop/example.txt"
          onChange={setLocalFilePath}
          handleId="filePath"
          disabled={isFilePathConnected}
        />
      </div>

      <div onBlur={() => handleBlur('newFileName', localNewFileName)}>
        <InputField
          nodeId={id}
          label="New File Name"
          icon={<File size={12} />}
          value={localNewFileName}
          placeholder="edited_example.txt"
          onChange={setLocalNewFileName}
          handleId="newFileName"
          disabled={isNewFileNameConnected}
        />
      </div>

      <div onBlur={() => handleBlur('newFileContent', localNewFileContent)}>
        <InputField
          nodeId={id}
          label="New File Content"
          icon={<FileEdit size={12} />}
          value={localNewFileContent}
          placeholder="Enter new file content here..."
          type="textarea"
          rows={1}
          onChange={setLocalNewFileContent}
          handleId="newFileContent"
          disabled={isNewFileContentConnected}
        />
      </div>

      <OutputField
        nodeId={id}
        label="Edited File Path"
        icon={<CheckCircle size={12} />}
        value={data.outputData?.editedFilePath || ''}
        handleId="editedFilePath"
      />

      <OutputField
        nodeId={id}
        label="New File Name"
        icon={<File size={12} />}
        value={data.outputData?.newFileName || ''}
        handleId="newFileName"
      />

      <OutputField
        nodeId={id}
        label="New File Content"
        icon={<FileEdit size={12} />}
        value={data.outputData?.newFileContent || ''}
        handleId="newFileContent"
      />
    </BaseNode>
  );
}

// 사이드바 자동 발견을 위한 설정 정보
export const config: NodeConfig = {
  type: 'textFileEditorNode',
  label: 'File Editor',
  color: '#9C27B0',
  category: 'File',
  settings: [
    { key: 'filePath', type: 'text', label: 'File Path', default: '' },
    { key: 'newFileName', type: 'text', label: 'New File Name', default: '' },
    { key: 'newFileContent', type: 'textarea', label: 'New File Content', default: '' }
  ]
};

export default TextFileEditorNode;