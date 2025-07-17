import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, Plus, X, RefreshCw, File, Upload, FileText } from 'lucide-react';
import BaseNode, { OutputField } from './Basenode';

import type {
  FilePathNodeProps,
  FilePathNodeData,
  NodeConfig,
  ExecutionMode
} from '../types';

import { useWorkflow, useViewerStatus } from '../WorkflowContext';
import DropTargetManager from '../DropTargetManager';

function FilePathNode({ id, data, selected }: FilePathNodeProps) {
  const { updateNodeData, executeNextNodes } = useWorkflow();
  
  // 🆕 뷰어 상태 관리
  const { isInViewer, addToViewer, removeFromViewer } = useViewerStatus(id);

  // 상태 관리 (🔧 수정: 초기값에서 저장된 데이터 복원)
  const [status, setStatus] = useState<'waiting' | 'running' | 'completed' | 'failed'>('waiting');
  const [filePaths, setFilePaths] = useState<string[]>(() => {
    // 🔧 초기값 설정시에만 저장된 데이터 복원
    if (data.filePaths && Array.isArray(data.filePaths) && data.filePaths.length > 0) {
      console.log(`🔄 FilePathNode ${id}: Restored ${data.filePaths.length} paths from saved data`);
      return data.filePaths;
    }
    return [];
  });
  const [result, setResult] = useState<string>('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  
  // 드래그앤드롭 영역 ref
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // 🔧 초기 outputData 동기화 (복원된 경우에만)
  useEffect(() => {
    if (filePaths.length > 0 && (!data.outputData?.text || data.outputData.text === '')) {
      const pathString = filePaths.join('\n');
      updateNodeData(id, {
        filePaths: filePaths,
        outputData: {
          text: pathString
        }
      });
      console.log(`🔄 FilePathNode ${id}: Synced outputData for restored paths`);
    }
  }, []); // 마운트시에만 한 번 실행

  // 🎯 파일 드롭 처리 함수 (DropTargetManager에서 호출)
  const handleFilesDrop = useCallback((droppedPaths: string[]) => {
    console.log(`📁 Files dropped to FilePathNode ${id}:`, droppedPaths);
    
    // 🔧 함수형 업데이트로 누적 보장
    setFilePaths(currentPaths => {
      const uniquePaths = [...new Set([...currentPaths, ...droppedPaths])];
      
      const pathString = uniquePaths.join('\n');
      updateNodeData(id, {
        filePaths: uniquePaths,
        outputData: { text: pathString }
      });
      
      console.log(`📤 Paths updated: ${uniquePaths.length} files (added ${droppedPaths.length} new)`);
      return uniquePaths;
    });
    
    setIsDragOver(false);
  }, [id, updateNodeData]);

  // 🎯 DropTargetManager 등록 (전역 리스너는 DropTargetManager에서 처리)
  useEffect(() => {
    const dropManager = DropTargetManager.getInstance();
    
    // 🔧 콜백 등록 (첫 번째 노드 등록 시 자동으로 전역 리스너 설정됨)
    dropManager.registerDropCallback(id, handleFilesDrop);

    return () => {
      // 🔧 콜백 해제
      dropManager.unregisterDropCallback(id);
    };
  }, [id, handleFilesDrop]); // 🔧 handleFilesDrop 의존성 추가

  // 🎯 선택된 노드를 액티브 타겟으로 설정
  useEffect(() => {
    const dropManager = DropTargetManager.getInstance();
    
    if (selected) {
      // 🔧 노드가 선택되면 액티브 타겟으로 설정
      dropManager.setActiveTarget(id);
      console.log(`🎯 FilePathNode ${id} selected - Set as active target`);
    } else {
      // 🔧 노드 선택 해제되면 액티브 타겟 해제
      dropManager.clearActiveTarget(id);
      console.log(`🎯 FilePathNode ${id} deselected - Clear active target`);
    }
  }, [selected, id]);

  // 마우스 호버 이벤트 (시각적 효과만)
  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
  }, []);

  // 브라우저 드래그앤드롭 이벤트 (시각적 피드백용)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 드래그가 완전히 영역을 벗어났을 때만
    if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    // 🎯 선택된 노드에서만 드롭 허용
    if (selected) {
      const dropManager = DropTargetManager.getInstance();
      dropManager.setActiveTarget(id);
      console.log(`🎯 Drop on selected FilePathNode ${id} - Target set`);
    } else {
      console.log(`🎯 Drop on unselected FilePathNode ${id} - Ignored`);
    }
  }, [id, selected]);

  // Dialog API로 파일 선택 (누적 방식) (🔧 수정: 함수형 업데이트)
  const selectFiles = useCallback(async () => {
    try {
      setIsDialogOpen(true);
      
      const { open } = await import('@tauri-apps/plugin-dialog');
      
      const selected = await open({
        directory: false,
        multiple: true,
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'Code Files', extensions: ['tsx', 'ts', 'js', 'jsx', 'rs', 'py', 'go', 'cpp', 'c', 'h'] },
          { name: 'Text Files', extensions: ['txt', 'md', 'json', 'yaml', 'toml', 'conf', 'log'] },
          { name: 'Config Files', extensions: ['json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg'] }
        ]
      });
      
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        console.log('🎯 Dialog API returned paths:', paths);
        
        setFilePaths(currentPaths => {
          // 🔧 수정: 함수형 업데이트로 누적 보장
          const uniquePaths = [...new Set([...currentPaths, ...paths])];
          
          const pathString = uniquePaths.join('\n');
          updateNodeData(id, {
            filePaths: uniquePaths,
            outputData: {
              text: pathString
            }
          });
          
          console.log(`📤 Files added via dialog: ${paths.length} new files, ${uniquePaths.length} total files`);
          return uniquePaths;
        });
      } else {
        console.log('💭 File selection cancelled');
      }
      
    } catch (error: any) {
      console.error('❌ File selection failed:', error);
      setResult(`Selection failed: ${error.message}`);
      setStatus('failed');
      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
    } finally {
      setIsDialogOpen(false);
    }
  }, [id, updateNodeData]);

  // 개별 파일 제거 (🔧 수정: 함수형 업데이트)
  const removeFile = useCallback((pathToRemove: string) => {
    setFilePaths(currentPaths => {
      const updatedPaths = currentPaths.filter(path => path !== pathToRemove);
      
      const pathString = updatedPaths.join('\n');
      updateNodeData(id, {
        filePaths: updatedPaths,
        outputData: {
          text: pathString
        }
      });
      
      console.log(`🗑️ File removed: ${pathToRemove}`);
      return updatedPaths;
    });
  }, [id, updateNodeData]);

  // 모든 파일 초기화
  const clearAllFiles = useCallback(() => {
    setFilePaths([]);
    updateNodeData(id, {
      filePaths: [],
      outputData: { text: '' }
    });
    console.log('🗑️ All files cleared');
  }, [id, updateNodeData]);

  // 경로들 재검증
  const refreshPaths = useCallback(async () => {
    if (filePaths.length === 0) return;
    
    try {
      setStatus('running');
      console.log('🔄 Re-verifying file paths...');
      
      const { invoke } = await import('@tauri-apps/api/core');
      const verifiedPaths = await invoke('file_path_node', {
        filePaths: filePaths
      }) as string;

      console.log('✅ Re-verification completed:', verifiedPaths);
      setStatus('completed');
      setResult(`${filePaths.length} files re-verified`);

      updateNodeData(id, {
        filePaths: filePaths,
        outputData: {
          text: verifiedPaths
        }
      });

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Re-verification failed:', errorMessage);
      setStatus('failed');
      setResult(errorMessage);
      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);
    }
  }, [filePaths, id, updateNodeData]);

  // 실행 함수
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
        filePaths: filePaths,
        outputData: {
          text: verifiedPaths
        }
      });

      // 실행 모드에 따른 다음 노드 트리거
      if (mode === 'triggered') {
        executeNextNodes(id);
        console.log(`🔗 FilePathNode: Triggering next nodes (mode: ${mode})`);
      }

      setTimeout(() => { setStatus('waiting'); setResult(''); }, 2000);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ FilePathNode execution failed:', errorMessage);
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

  // 파일명 추출 함수
  const getFileName = useCallback((fullPath: string): string => {
    return fullPath.split(/[/\\]/).pop() || fullPath;
  }, []);

  // 경로들을 문자열로 변환
  const getPathsAsString = useCallback(() => {
    return filePaths.join('\n');
  }, [filePaths]);

  // 파일 확장자 아이콘 반환
  const getFileIcon = useCallback((fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'tsx':
      case 'ts':
      case 'js':
      case 'jsx':
        return <FileText size={12} color="#61DAFB" />;
      case 'rs':
        return <FileText size={12} color="#CE422B" />;
      case 'py':
        return <FileText size={12} color="#3776AB" />;
      case 'json':
      case 'yaml':
      case 'toml':
        return <FileText size={12} color="#FFA500" />;
      default:
        return <File size={12} color="#4CAF50" />;
    }
  }, []);

  return (
    <BaseNode<FilePathNodeData>
      id={id}
      title="File Path"
      icon={<Folder size={16} stroke="white" />}
      status={status}
      selected={selected}
      onExecute={executeNode}
      hasInput={true}
      hasOutput={true}
      data={data}
      result={result}
      description="Select files or drag & drop to get full paths. Uses both Dialog API and Tauri file-drop events."
      onAddToViewer={handleViewerToggle}
      onRemoveFromViewer={handleViewerToggle}
      isInViewer={isInViewer}
    >
      {/* 🎯 드래그앤드롭 + 파일 선택 영역 */}
      <div
        ref={dropZoneRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragOver ? '#4CAF50' : (filePaths.length > 0 ? '#4CAF50' : '#666')}`,
          borderRadius: '8px',
          padding: '16px',
          textAlign: 'center',
          backgroundColor: isDragOver 
            ? 'rgba(76, 175, 80, 0.15)' 
            : filePaths.length > 0 
              ? 'rgba(76, 175, 80, 0.08)' 
              : 'rgba(255, 255, 255, 0.05)',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          marginBottom: '12px',
          position: 'relative',
          overflow: 'hidden'
        }}
        onClick={selectFiles}
      >
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          gap: '8px',
          position: 'relative',
          zIndex: 1
        }}>
          {/* 아이콘 영역 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: isDragOver ? '#4CAF50' : 'rgba(76, 175, 80, 0.2)',
            transition: 'all 0.3s ease'
          }}>
            {isDragOver ? (
              <Upload size={18} color="white" />
            ) : filePaths.length > 0 ? (
              <Folder size={18} color="#4CAF50" />
            ) : (
              <Plus size={18} color="#4CAF50" />
            )}
          </div>

          {/* 메인 텍스트 */}
          <div style={{ 
            fontSize: '12px', 
            fontWeight: 'bold',
            color: isDragOver ? '#4CAF50' : filePaths.length > 0 ? '#4CAF50' : '#999'
          }}>
            {isDragOver 
              ? 'Drop files now!' 
              : filePaths.length > 0 
                ? `${filePaths.length} file${filePaths.length > 1 ? 's' : ''} selected`
                : 'Drop files or click to select'
            }
          </div>

          {/* 서브 텍스트 */}
          <div style={{ 
            fontSize: '10px', 
            color: '#666'
          }}>
            {isDragOver 
              ? 'Release to add files'
              : 'Drag & drop or click to browse'
            }
          </div>

          {/* 로딩 상태 */}
          {isDialogOpen && (
            <div style={{
              fontSize: '9px',
              color: '#4CAF50',
              fontStyle: 'italic'
            }}>
              Opening dialog...
            </div>
          )}
        </div>
      </div>

      {/* 🎮 컨트롤 버튼들 */}
      {filePaths.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '6px',
          marginBottom: '10px',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={refreshPaths}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 8px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: '500',
              transition: 'all 0.2s ease'
            }}
            title="Re-verify all file paths"
          >
            <RefreshCw size={10} />
            Verify ({filePaths.length})
          </button>

          <button
            onClick={clearAllFiles}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 8px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: '500',
              transition: 'all 0.2s ease'
            }}
            title="Remove all files"
          >
            <X size={10} />
            Clear All
          </button>
        </div>
      )}

      {/* 📋 선택된 파일들 목록 */}
      {filePaths.length > 0 && (
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '6px',
          padding: '8px',
          marginBottom: '10px',
          maxHeight: '100px',
          overflowY: 'auto',
          border: '1px solid rgba(76, 175, 80, 0.3)'
        }}>
          <div style={{ 
            fontSize: '10px', 
            color: '#4CAF50', 
            fontWeight: 'bold',
            marginBottom: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <Folder size={10} />
            Selected Files ({filePaths.length})
          </div>
          
          {filePaths.map((path, index) => (
            <div key={index} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '4px 6px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              marginBottom: '3px',
              fontSize: '9px',
              transition: 'background-color 0.2s ease'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '4px',
                flex: 1,
                minWidth: 0
              }}>
                {getFileIcon(getFileName(path))}
                <span style={{ 
                  color: '#fff', 
                  fontWeight: '500',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {getFileName(path)}
                </span>
              </div>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(path);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#999',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  borderRadius: '3px',
                  transition: 'all 0.2s ease'
                }}
                title={`Remove: ${getFileName(path)}`}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(244, 67, 54, 0.2)';
                  e.currentTarget.style.color = '#f44336';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#999';
                }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 📤 출력 필드 */}
      <OutputField
        nodeId={id}
        label="File Paths"
        icon={<Folder size={12} />}
        value={
          (() => {
            const pathString = getPathsAsString();
            if (!pathString) return '';
            
            // 🔧 수정: 3줄로 제한하고 총 개수 표시 제거
            const lines = pathString.split('\n');
            if (lines.length > 3) {
              const preview = lines.slice(0, 3).join('\n');
              return `${preview}\n...`; // 🔧 수정: 개수 표시 제거
            }
            
            // 🔧 수정: 길이 제한 (60자로 더 축소)
            if (pathString.length > 60) {
              return pathString.substring(0, 57) + '...';
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