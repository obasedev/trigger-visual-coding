import React, { useState, useEffect, useCallback } from 'react';
import { FileText, FolderOpen, File, FileEdit, CheckCircle, XCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import BaseNode, { InputField, OutputField } from './Basenode';


import { useWorkflow, useHandleConnection } from '../WorkflowContext';


function FileCreatorNode({ id, data, selected }) {
  const { executeNextNodes, updateNodeData } = useWorkflow();

  const [status, setStatus] = useState('waiting');
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

  const handleBlur = (key, value) => {
    if (key === 'filePath' && !isFilePathConnected && data.filePath !== value) updateNodeData(id, { filePath: value });
    if (key === 'fileName' && !isFileNameConnected && data.fileName !== value) updateNodeData(id, { fileName: value });
    if (key === 'fileContent' && !isFileContentConnected && data.fileContent !== value) updateNodeData(id, { fileContent: value });
  };

  const executeNode = useCallback(async (mode = 'triggered') => {
    // 실행 전 필수 필드 검증
    const currentFilePath = data?.filePath?.trim() || '';
    const currentFileName = data?.fileName?.trim() || '';
    const currentFileContent = data?.fileContent || '';

    if (!currentFilePath || !currentFileName) {
      console.warn('⚠️ FileCreatorNode: Missing required fields, skipping execution');
      setStatus('failed');
      setResult('File path and name are required');
      
      updateNodeData(id, { triggerExecution: undefined });
      
      setTimeout(() => { 
        setStatus('waiting'); 
        setResult(''); 
      }, 2000);
      return;
    }

    setStatus('running');
    try {
      const params = {
        filePath: currentFilePath,
        fileName: currentFileName,
        fileContent: currentFileContent
      };

      console.log(`📄 FileCreatorNode ${id}: Creating file... (mode: ${mode})`);

      const resultData = await invoke('file_creator_node', params);
      const resultMessage = typeof resultData === 'string' ? resultData : resultData.message || 'File created successfully';

      // 완전한 파일 경로 생성 (경로 + 파일명)
      const fullFilePath = `${params.filePath}/${params.fileName}`;

      setStatus('completed');
      setResult('File created successfully');

      updateNodeData(id, {
        triggerExecution: undefined,
        outputData: {
          createdFilePath: fullFilePath,
          fileName: params.fileName,
          fileContent: params.fileContent,
        }
      });

      // 실행 모드에 따른 연쇄 실행 결정
      if (mode === 'triggered') {
        executeNextNodes(id, {
          createdFilePath: fullFilePath,
          fileName: params.fileName,
          fileContent: params.fileContent,
        });
        console.log(`🔗 FileCreatorNode: Triggering next nodes with data (auto-execution)`);
      } else {
        console.log(`🔧 FileCreatorNode: Manual execution completed, no chain reaction`);
      }

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('❌ File creation failed:', errorMessage, error);
      setStatus('failed');
      setResult(errorMessage);

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
    <BaseNode
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
export const config = {
  type: 'fileCreatorNode',
  label: 'File Creator',
  color: '#FF9800',
  category: 'File',
  settings: [
    { key: 'filePath', type: 'text', label: 'File Path', default: '' },
    { key: 'fileName', type: 'text', label: 'File Name', default: '' },
    { key: 'fileContent', type: 'text', label: 'File Content', default: '' }
  ]
};

export default FileCreatorNode;