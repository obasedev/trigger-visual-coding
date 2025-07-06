import React, { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Play, Eye, EyeOff } from 'lucide-react';
import './basenode.css';

import type {
  BaseNodeProps,
  InputFieldProps,
  NodeStatus,
  InfoRow,
  BaseNodeData,
  NodeDataOutput,
  ExecutionMode
} from '../types';

import { useWorkflow, useHandleConnection } from '../WorkflowContext';
import { useViewer } from '../ViewerContext'; // 🆕 뷰어 감지 Hook

const statusText: Record<NodeStatus, string> = {
  waiting: 'Ready',
  running: 'Running...',
  completed: 'Completed',
  failed: 'Failed'
};

export function InputField({
  label,
  icon,
  value,
  placeholder,
  type = 'input',
  rows = 2,
  handleId,
  nodeId,
  onChange,
  disabled
}: InputFieldProps) {
  const isConnected = handleId ? useHandleConnection(nodeId, handleId) : false;
  const isViewer = useViewer(); // 🎯 뷰어 모드 감지

  const handleChange = useCallback((newValue: string) => {
    if (disabled) return;
    if (onChange) {
      onChange(newValue);
    }
  }, [onChange, disabled]);

  return (
    <div className="node-input-field">
      {/* 🎯 핵심 수정: 뷰어에서만 Handle 제거 */}
      {handleId && !isViewer && (
        <Handle
          type="target"
          position={Position.Left}
          id={handleId}
          style={{
            backgroundColor: isConnected ? '#6366f1' : '#777777',
            width: '10px', height: '10px', left: '12px', border: '2px solid white',
            boxShadow: isConnected ? '0 2px 6px rgba(255, 193, 7, 0.3)' : '0 1px 3px rgba(0,0,0,0.3)',
            transition: 'all 0.2s ease', zIndex: 10
          }}
        />
      )}
      <div className="node-input-content">
        <div className="node-input-label">
          {icon}
          {label}
        </div>
        {disabled ? (
          <div className="node-input-display-only">
            {value || ''}
          </div>
        ) : (
          type === 'textarea' ? (
            <textarea
              value={value || ''}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={placeholder}
              rows={rows}
              className="node-textarea"
            />
          ) : (
            <input
              type="text"
              value={value || ''}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={placeholder}
              className="node-input"
            />
          )
        )}
      </div>
    </div>
  );
}

export function OutputField({
  nodeId,
  label,
  icon,
  value,
  handleId
}: {
  nodeId: string;
  label: string;
  icon?: React.ReactNode;
  value: string;
  handleId: string;
}) {
  const isConnected = useHandleConnection(nodeId, handleId);
  const isViewer = useViewer(); // 🎯 뷰어 모드 감지

  return (
    <div className="node-input-field">
      {/* 🎯 핵심 수정: 뷰어에서만 Handle 제거 */}
      {!isViewer && (
        <Handle
          type="source"
          position={Position.Right}
          id={handleId}
          style={{
            backgroundColor: isConnected ? '#6366f1' : '#777777',
            width: '10px',
            height: '10px',
            right: '12px',
            border: '2px solid white',
            boxShadow: isConnected ? '0 2px 6px rgba(255, 193, 7, 0.3)' : '0 1px 3px rgba(0,0,0,0.3)',
            transition: 'all 0.2s ease',
            zIndex: 10
          }}
        />
      )}
      <div className="node-input-content">
        <div className="node-input-label">
          {icon}
          {label}
        </div>
        <div className="node-input-display-only">
          {value || ''}
        </div>
      </div>
    </div>
  );
}

function BaseNode<T extends BaseNodeData = BaseNodeData>({
  id,
  title,
  icon,
  status,
  selected,
  onExecute,
  children,
  hasInput = true,
  hasOutput = true,
  description,
  infoRows,
  result,
  data,
  dataOutputs,
  // 🆕 뷰어 관련 props
  onAddToViewer,
  onRemoveFromViewer,
  isInViewer = false,
  // 🆕 커스텀 실행 버튼 아이콘
  customExecuteIcon
}: BaseNodeProps<T>) {

  // 🆕 Context에서 뷰어 기능 가져오기 (props가 없을 때 fallback)
  const { viewerActions } = useWorkflow();
  const isViewer = useViewer(); // 🎯 뷰어 모드 감지

  const handleExecute = React.useCallback(() => {
    try {
      onExecute('manual'); // 수동 실행 모드로 전달
    } catch (error) {
      console.error('❌ BaseNode: Execute error:', error);
    }
  }, [onExecute]);

  // 🆕 뷰어 버튼 클릭 핸들러 (Context 연동)
  const handleViewerToggle = React.useCallback(() => {
    try {
      const currentIsInViewer = isInViewer || viewerActions.isInViewer(id);
      
      if (currentIsInViewer) {
        if (onRemoveFromViewer) {
          onRemoveFromViewer();
        } else {
          viewerActions.removeFromViewer(id);
        }
        console.log(`👁️ Node ${id} removed from viewer`);
      } else {
        if (onAddToViewer) {
          onAddToViewer();
        } else {
          viewerActions.addToViewer(id, 'unknown', title);
        }
        console.log(`👁️ Node ${id} added to viewer`);
      }
    } catch (error) {
      console.error('❌ BaseNode: Viewer toggle error:', error);
    }
  }, [id, isInViewer, onAddToViewer, onRemoveFromViewer, viewerActions, title]);

  // 현재 뷰어 상태 계산
  const currentIsInViewer = isInViewer || viewerActions.isInViewer(id);

  // 동적 헤더 메시지 생성 함수
  const getHeaderMessage = () => {
    // 실행 결과가 있으면 결과 메시지 표시
    if (result) {
      // 결과 메시지가 너무 길면 축약
      if (result.length > 60) {
        return result.substring(0, 57) + '...';
      }
      return result;
    }
    
    // 상태별 메시지
    switch (status) {
      case 'running':
        return 'Executing...';
      case 'completed':
        return 'Execution completed';
      case 'failed':
        return 'Execution failed';
      case 'waiting':
      default:
        // 평소에는 노드 설명 표시
        return description || 'Ready to execute';
    }
  };

  // 헤더 메시지 색상 클래스
  const getHeaderMessageClass = () => {
    if (!result) return '';
    return status;
  };

  return (
    <div className={`base-node ${selected ? 'selected' : ''}`}>
      
      {/* 1. 통합 헤더 영역 (상하 분할) */}
      <div className="node-header">
        {/* 헤더 상단: 아이콘 + 이름 + 버튼들 */}
        <div className="header-top">
          <div className="node-title-section">
            {icon}
            <span className="node-title">{title}</span>
          </div>
          
          {/* 🆕 버튼 그룹: 뷰어 버튼 + 실행 버튼 */}
          <div className="node-button-group">
            {/* 뷰어 버튼 - 뷰어에서는 숨김 */}
            {!isViewer && (
              <button 
                onClick={handleViewerToggle} 
                className={`node-viewer-button ${currentIsInViewer ? 'active' : ''}`}
                title={currentIsInViewer ? 'Remove from viewer' : 'Add to viewer'}
              >
                {currentIsInViewer ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            )}
            
            {/* 실행 버튼 - 🆕 커스텀 아이콘 지원 */}
            <button onClick={handleExecute} className="node-execute-button">
              {customExecuteIcon || <Play size={12} />}
            </button>
          </div>
        </div>
        
        {/* 헤더 하단: 동적 설명/결과 */}
        <div className={`header-bottom ${getHeaderMessageClass()}`}>
          {getHeaderMessage()}
        </div>
      </div>

      {/* 2. 단순화된 상태 영역 (트리거만) */}
      <div className="node-status-section">
        {/* 🎯 핵심 수정: 뷰어에서만 트리거 Handle 제거 */}
        {hasInput && !isViewer && (
          <Handle
            type="target"
            position={Position.Left}
            id="trigger-input"
            style={{
              backgroundColor: '#4CAF50', width: '12px', height: '12px', left: '12px',
              border: '2px solid white', boxShadow: '0 2px 6px rgba(76, 175, 80, 0.3)', zIndex: 10
            }}
          />
        )}
        
        {hasOutput && !isViewer && (
          <Handle
            type="source"
            position={Position.Right}
            id="trigger-output"
            style={{
              backgroundColor: '#4CAF50', width: '12px', height: '12px', right: '12px',
              border: '2px solid white', boxShadow: '0 2px 6px rgba(76, 175, 80, 0.3)', zIndex: 10
            }}
          />
        )}

        {/* 트리거 상태만 */}
        <div className="status-top">
          <div className={`node-status ${status}`}>
            {status === 'running' && <div className="spinner" />}
            {statusText[status]}
          </div>
        </div>
      </div>

      {/* 3. 메인 콘텐츠 영역 */}
      <div className="node-main-content">
        <div className="node-main-column">
          {/* Info rows 표시 */}
          {infoRows && infoRows.length > 0 && (
            <div className="node-info-section">
              <div className="node-info-grid">
                {infoRows.map((row, index) => (
                  <div key={index} className="node-info-row">
                    <div className="node-info-label">{row.icon}{row.label}</div>
                    <div className={`node-info-value ${row.monospace ? 'monospace' : ''}`}>{row.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* 입력/출력 필드들 */}
          {children}
        </div>

        {/* 데이터 출력 영역 */}
        <div className="node-output-column">
          {dataOutputs && dataOutputs.length > 0 && (
            <div className="node-data-output-section-grid">
              {dataOutputs.map((output) => (
                <div key={output.id} className="node-output-field">
                  <div className="node-output-content">
                    <div className="node-output-label">
                      {output.id === 'status' && output.value}
                      {output.label}
                    </div>
                    <div className="node-output-display-only">
                      {output.value && typeof output.value !== 'object'
                        ? output.value.length > 15
                          ? output.value.substring(0, 15) + '...'
                          : output.value
                        : output.value}
                    </div>
                  </div>
                  {/* 🎯 핵심 수정: 뷰어에서만 데이터 출력 Handle 제거 */}
                  {output.id !== 'status' && !isViewer && (
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={output.id}
                      style={{
                        backgroundColor: '#6366f1', width: '10px', height: '10px',
                        border: '2px solid white', boxShadow: '0 2px 6px rgba(255, 193, 7, 0.3)',
                        position: 'absolute', right: '-8px', top: '50%', transform: 'translateY(-50%)'
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BaseNode;