import React, { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Play, Eye, EyeOff, Zap } from 'lucide-react';
import './basenode.css';


import { useWorkflow, useHandleConnection } from '../WorkflowContext';
import { useViewer } from '../ViewerPage';

const statusText = {
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
}) {
  const isConnected = handleId ? useHandleConnection(nodeId, handleId) : false;
  const isViewer = useViewer();

  const handleChange = useCallback((newValue: string) => {
    if (disabled) return;
    if (onChange) {
      onChange(newValue);
    }
  }, [onChange, disabled]);

  return (
    <div className="node-input-field">
      {handleId && !isViewer && (
        <Handle
          type="target"
          position={Position.Left}
          id={handleId}
          style={{
            backgroundColor: isConnected ? '#6366f1' : '#777777',
            width: '10px', height: '10px', left: '12px', border: '2px solid white'
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
            {(() => {
              const text = value || '';
              const lines = text.split('\n');
              if (lines.length > 3) {
                return lines.slice(0, 3).join('\n') + '\n...';
              }
              return text;
            })()}
          </div>
        ) : (
          <textarea
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            rows={1}
            className="node-input"
            style={{ resize: 'none' }}
          />
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
  const isViewer = useViewer();

  return (
    <div className="node-input-field">
      {handleId && !isViewer && (
        <Handle
          type="source"
          position={Position.Right}
          id={handleId}
          style={{
            backgroundColor: isConnected ? '#6366f1' : '#777777',
            width: '10px',
            height: '10px',
            right: '12px',
            border: '2px solid white'
          }}
        />
      )}
      <div className="node-input-content">
        <div className="node-input-label">
          {icon}
          {label}
        </div>
        <div className="node-input-display-only">
          {(() => {
            const text = value || '';
            const lines = text.split('\n');
            if (lines.length > 3) {
              return lines.slice(0, 3).join('\n') + '\n...';
            }
            return text;
          })()}
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
  data,
  // 미상의 대체에드: 뷰어 관련
  onAddToViewer,
  onRemoveFromViewer,
  isInViewer = false
}: Omit<BaseNodeProps<T>, 'infoRows' | 'result' | 'dataOutputs' | 'customExecuteIcon' | 'customButtons'>) {

  const { viewerActions } = useWorkflow();
  const isViewer = useViewer();

  const handleManualExecute = React.useCallback(() => {
    onExecute('manual');
  }, [onExecute]);

  const handleTriggerExecute = React.useCallback(() => {
    onExecute('triggered');
  }, [onExecute]);

  const handleViewerToggle = React.useCallback(() => {
    const currentIsInViewer = isInViewer || viewerActions.isInViewer(id);
    
    if (currentIsInViewer) {
      if (onRemoveFromViewer) {
        onRemoveFromViewer();
      } else {
        viewerActions.removeFromViewer(id);
      }
    } else {
      if (onAddToViewer) {
        onAddToViewer();
      } else {
        viewerActions.addToViewer(id, 'unknown', title);
      }
    }
  }, [id, isInViewer, onAddToViewer, onRemoveFromViewer, viewerActions, title]);

  const currentIsInViewer = isInViewer || viewerActions.isInViewer(id);

  return (
    <div className={`base-node ${selected ? 'selected' : ''}`}>
      
      {/* 헤더 */}
      <div className="node-header">
        <div className="header-top">
          <div className="node-title-section">
            {icon}
            <span className="node-title">{title}</span>
          </div>
          
          <div className="node-button-group">
            {/* 뷰어 버튼 */}
            {!isViewer && (
              <button 
                onClick={handleViewerToggle} 
                className={`node-viewer-button ${currentIsInViewer ? 'active' : ''}`}
                title={currentIsInViewer ? 'Remove from viewer' : 'Add to viewer'}
              >
                {currentIsInViewer ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            )}
            
            {/* 개별 실행 버튼 (얇게) */}
            <button onClick={handleManualExecute} className="node-manual-button" title="Manual Execute">
              <Play size={12} />
            </button>
            
            {/* 트리거 실행 버튼 (메인) */}
            <button onClick={handleTriggerExecute} className="node-trigger-button" title="Trigger Execute">
              <Zap size={12} />
            </button>
          </div>
        </div>
        
        {/* 설명 */}
        {description && (
          <div className="header-bottom">
            {description}
          </div>
        )}
      </div>

      {/* 상태 및 트리거 핸들 */}
      <div className="node-status-section">
        {hasInput && !isViewer && (
          <Handle
            type="target"
            position={Position.Left}
            id="trigger-input"
            style={{
              backgroundColor: '#4CAF50', width: '12px', height: '12px', left: '12px',
              border: '2px solid white'
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
              border: '2px solid white'
            }}
          />
        )}

        <div className="status-top">
          <div className={`node-status ${status}`}>
            {status === 'running' && <div className="spinner" />}
            {statusText[status]}
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="node-main-content">
        {children}
      </div>
    </div>
  );
}

export default BaseNode;