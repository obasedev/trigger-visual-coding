import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, Upload, X } from 'lucide-react';
import BaseNode, { OutputField } from './Basenode';

import type {
  FilePathNodeProps,
  FilePathNodeData,
  NodeConfig,
  ExecutionMode
} from '../types';

import { useWorkflow, useViewerStatus } from '../WorkflowContext';

function FilePathNode({ id, data, selected }: FilePathNodeProps) {
  const { updateNodeData, executeNextNodes } = useWorkflow();
  
  // 🆕 뷰어 상태 관리
  const { isInViewer, addToViewer, removeFromViewer } = useViewerStatus(id);

  // 상태 관리
  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [result, setResult] = useState<string>('');
  
  // 파일 입력 ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 파일 경로들을 문자열로 변환
  const getPathsAsString = useCallback(() => {
    return filePaths.join('\n');
  }, [filePaths]);

  // 파일 경로 업데이트
  const updateFilePaths = useCallback((paths: string[]) => {
    setFilePaths(paths);
    const pathString = paths.join('\n');
    updateNodeData(id, {
      filePaths: paths,
      outputData: {
        text: pathString
      }
    });
  }, [id, updateNodeData]);

  // 파일들에서 경로 추출 - 간단한 방법
  const extractPaths = useCallback((files: FileList) => {
    const paths: string[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Tauri 환경에서 파일의 실제 경로 추출 시도
      let filePath: string;
      
      if ((file as any).path) {
        // Tauri에서 제공하는 실제 경로
        filePath = (file as any).path;
        console.log(`✅ 실제 경로 추출: ${filePath}`);
      } else if ((file as any).webkitRelativePath) {
        // 폴더 드롭 시 상대 경로
        filePath = (file as any).webkitRelativePath;
        console.log(`✅ 상대 경로 추출: ${filePath}`);
      } else {
        // 파일명만 있는 경우 - 백엔드에서 검색하도록 전달
        filePath = file.name;
        console.log(`⚠️ 파일명만 추출, 백엔드에서 검색 예정: ${filePath}`);
      }
      
      if (filePath && !paths.includes(filePath)) {
        paths.push(filePath);
      }
    }
    
    return paths;
  }, []);

  // 드래그 앤 드롭 이벤트 핸들러
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      const paths = extractPaths(droppedFiles);
      updateFilePaths(paths);
      console.log(`📁 Files dropped: ${paths.length} files`);
    }
  }, [extractPaths, updateFilePaths]);

  // 파일 브라우징 - 기본 HTML input 사용
  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const paths = extractPaths(selectedFiles);
      updateFilePaths(paths);
      console.log(`📁 Files selected: ${paths.length} files`);
    }
  }, [extractPaths, updateFilePaths]);

  // 경로 초기화
  const handleClear = useCallback(() => {
    setFilePaths([]);
    updateNodeData(id, {
      filePaths: [],
      outputData: { text: '' }
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    console.log('🗑️ File paths cleared');
  }, [id, updateNodeData]);

  // 실행 함수 - StartNode처럼 항상 다음 노드 트리거
  const executeNode = useCallback(async (mode: ExecutionMode = 'triggered'): Promise<void> => {
    try {
      setStatus('running');
      
      if (filePaths.length === 0) {
        console.warn('⚠️ FilePathNode: No files selected');
        setStatus('failed');
        setResult('No files selected');
        
        setTimeout(() => { 
          setStatus('waiting'); 
          setResult(''); 
        }, 2000);
        return;
      }

      console.log(`📁 FilePathNode ${id} executing... (mode: ${mode})`);
      console.log(`📤 Processing ${filePaths.length} file paths`);
      
      // 백엔드로 경로 검증 요청
      const { invoke } = await import('@tauri-apps/api/core');
      const verifiedPaths = await invoke('file_path_node', {
        filePaths: filePaths
      }) as string;

      console.log('✅ File paths verified:', verifiedPaths);
      
      setStatus('completed');
      setResult(`${filePaths.length} files processed`);

      // 검증된 경로들로 출력 데이터 업데이트
      updateNodeData(id, {
        outputData: {
          text: verifiedPaths
        }
      });

      // 🚀 항상 다음 노드들 트리거 (StartNode처럼)
      executeNextNodes(id);
      console.log(`🔗 FilePathNode: Triggering next nodes (mode: ${mode})`);

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ FilePathNode failed:', errorMessage);
      setStatus('failed');
      setResult(errorMessage);

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
    }
  }, [id, filePaths, updateNodeData, executeNextNodes]);

  // 🆕 뷰어 토글 함수
  const handleViewerToggle = useCallback(() => {
    if (isInViewer) {
      removeFromViewer();
      console.log(`👁️ FilePathNode ${id} removed from viewer`);
    } else {
      addToViewer('filePathNode', 'File Path');
      console.log(`👁️ FilePathNode ${id} added to viewer`);
    }
  }, [isInViewer, addToViewer, removeFromViewer, id]);
  // 외부 트리거 실행 감지
  useEffect(() => {
    if (data.triggerExecution && typeof data.triggerExecution === 'number') {
      console.log(`📁 FilePathNode ${id} auto-execution triggered!`);
      executeNode('triggered');
    }
  }, [data.triggerExecution, executeNode]);

  // 파일 미리보기 텍스트 생성
  const getPreviewText = useCallback(() => {
    if (filePaths.length === 0) return 'No files selected';
    
    if (filePaths.length === 1) {
      const fileName = filePaths[0].split(/[/\\]/).pop() || filePaths[0];
      return `Selected: ${fileName}`;
    }
    
    const firstFile = filePaths[0].split(/[/\\]/).pop() || filePaths[0];
    return `Selected: ${firstFile} and ${filePaths.length - 1} more...`;
  }, [filePaths]);

  return (
    <BaseNode<FilePathNodeData>
      id={id}
      title="File Path"
      icon={<Folder size={16} stroke="white" />}
      status={status}
      selected={selected}
      onExecute={executeNode}
      hasInput={false}  // 시작점 노드
      hasOutput={true}  // 경로 출력
      data={data}
      result={result}
      description="Drag & drop files to get their paths. Acts as a workflow starting point."
      // 🆕 뷰어 관련 props 추가
      onAddToViewer={handleViewerToggle}
      onRemoveFromViewer={handleViewerToggle}
      isInViewer={isInViewer}
    >
      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* 드래그 앤 드롭 영역 */}
      <div
        className={`file-drop-zone ${isDragOver ? 'drag-over' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragOver ? '#4CAF50' : '#666'}`,
          borderRadius: '8px',
          padding: '20px',
          textAlign: 'center',
          backgroundColor: isDragOver ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 255, 255, 0.05)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          marginBottom: '12px'
        }}
        onClick={handleBrowseClick}
      >
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          gap: '8px',
          color: isDragOver ? '#4CAF50' : '#999'
        }}>
          <Upload size={24} />
          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
            {isDragOver ? 'Drop files now!' : 'Drop files here'}
          </div>
          <div style={{ fontSize: '12px' }}>
            or click to browse
          </div>
        </div>
      </div>

      {/* 선택된 파일들 미리보기 */}
      {filePaths.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          borderRadius: '6px',
          fontSize: '12px',
          marginBottom: '12px'
        }}>
          <span style={{ color: '#4CAF50', flex: 1 }}>
            {getPreviewText()}
          </span>
          <button
            onClick={handleClear}
            style={{
              background: 'none',
              border: 'none',
              color: '#999',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Clear files"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 출력 필드 */}
      <OutputField
        nodeId={id}
        label="File Paths"
        icon={<Folder size={12} />}
        value={
          (() => {
            const pathString = getPathsAsString();
            if (!pathString) return '';
            
            // 2줄로 제한
            const lines = pathString.split('\n');
            if (lines.length > 2) {
              return lines.slice(0, 2).join('\n') + '...';
            }
            
            // 길이 제한 (80자)
            if (pathString.length > 80) {
              return pathString.substring(0, 80) + '...';
            }
            
            return pathString;
          })()
        }
        handleId="text"
      />
    </BaseNode>
  );
}

// 사이드바 자동 발견을 위한 설정 정보
export const config: NodeConfig = {
  type: 'filePathNode',
  label: 'File Path',
  color: '#4CAF50',
  category: 'File',
  settings: [
    { key: 'allowMultiple', type: 'boolean', label: 'Allow Multiple Files', default: true }
  ]
};

export default FilePathNode;