import React, { useMemo, useCallback, useState, createContext, useContext } from 'react';
import { ArrowLeft, Eye, Trash2, RefreshCw, Edit3, Check, X } from 'lucide-react';
import { Node } from '@xyflow/react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { WorkflowProvider } from './WorkflowContext';
import './viewerpage.css';

// 뷰어 모드 감지를 위한 Context
const ViewerContext = createContext(false);

export function ViewerProvider({ children, isViewer = false }) {
  return (
    <ViewerContext.Provider value={isViewer}>
      {children}
    </ViewerContext.Provider>
  );
}

export function useViewer() {
  return useContext(ViewerContext);
}

export function useIsWorkspace() {
  return !useContext(ViewerContext);
}

// 노드 모듈들 import
const nodeModules = import.meta.glob('./nodes/*Node.tsx', { eager: true });


function ViewerPage({
  viewerItems,
  allNodes,
  allEdges,
  onViewerItemsChange,
  updateNodeData,
  executeNextNodes: executeNextNodesProp,
  onBackToWorkspace
}) {

  // 🆕 라벨 편집 상태 관리
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');

  // 뷰어에 있는 노드들의 실제 데이터를 가져오기
  const viewerNodes = useMemo(() => {
    return viewerItems
      .map(item => {
        const actualNode = allNodes.find(node => node.id === item.nodeId);
        return actualNode ? { ...actualNode, viewerItem: item } : null;
      })
      .filter(Boolean);
  }, [viewerItems, allNodes]);

  // 노드 타입들을 동적으로 생성
  const nodeComponents = useMemo(() => {
    const components = {};
    Object.entries(nodeModules).forEach(([path, module]: [string, any]) => {
      const fileName = path.split('/').pop()?.replace('.tsx', '');
      if (fileName && module.default) {
        const componentName = fileName.charAt(0).toLowerCase() + fileName.slice(1);
        components[componentName] = module.default;
      }
    });
    return components;
  }, []);

  // 🎯 DND 드래그 완료 핸들러
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) {
      return;
    }

    const reorderedItems = Array.from(viewerItems);
    const [removed] = reorderedItems.splice(result.source.index, 1);
    reorderedItems.splice(result.destination.index, 0, removed);

    onViewerItemsChange(reorderedItems);
  };

  // 🔄 간소화된 executeNextNodes - App에서 처리하므로 단순하게
  const executeNextNodes = useCallback((completedNodeId: string) => {
    executeNextNodesProp(completedNodeId);
  }, [executeNextNodesProp]);

  // 뷰어에서 노드 제거
  const removeFromViewer = (nodeId: string) => {
    const updatedItems = viewerItems.filter(item => item.nodeId !== nodeId);
    onViewerItemsChange(updatedItems);
  };

  // 뷰어 전체 삭제
  const clearViewer = () => {
    onViewerItemsChange([]);
  };

  // 뷰어 새로고침 (실제 노드 데이터와 동기화)
  const refreshViewer = () => {
    const existingNodeIds = new Set(allNodes.map(node => node.id));
    const validItems = viewerItems.filter(item => existingNodeIds.has(item.nodeId));
    
    if (validItems.length !== viewerItems.length) {
      onViewerItemsChange(validItems);
    }
  };

  // 🆕 라벨 편집 시작
  const startEditingLabel = (nodeId: string, currentLabel: string) => {
    setEditingNodeId(nodeId);
    setEditingLabel(currentLabel);
  };

  // 🆕 라벨 편집 취소
  const cancelEditingLabel = () => {
    setEditingNodeId(null);
    setEditingLabel('');
  };

  // 🆕 라벨 편집 저장
  const saveEditingLabel = (nodeId: string) => {
    const updatedItems = viewerItems.map(item => {
      if (item.nodeId === nodeId) {
        return {
          ...item,
          customLabel: editingLabel.trim() || undefined // 빈 문자열이면 undefined로 설정
        };
      }
      return item;
    });
    
    onViewerItemsChange(updatedItems);
    setEditingNodeId(null);
    setEditingLabel('');
  };

  // 🆕 엔터키로 저장, ESC로 취소
  const handleLabelKeyDown = (e: React.KeyboardEvent, nodeId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEditingLabel(nodeId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditingLabel();
    }
  };

  // 🆕 표시할 라벨 계산 (customLabel이 있으면 사용, 없으면 기본 nodeTitle, ID는 표시 안함)
  const getDisplayLabel = (viewerItem: ViewerNodeItem) => {
    return viewerItem.customLabel || viewerItem.nodeTitle;
  };

  return (
    <div className="viewer-page">
      {/* 헤더 */}
      <div className="viewer-header">
        <div className="viewer-header-left">
          <button onClick={onBackToWorkspace} className="viewer-back-button">
            <ArrowLeft size={16} />
            Back to Workspace
          </button>
          <div className="viewer-title">
            <Eye size={20} />
            Node Viewer
          </div>
        </div>
        
        <div className="viewer-header-right">
          <div className="viewer-node-count">
            {viewerItems.length} {viewerItems.length === 1 ? 'node' : 'nodes'}
          </div>
          
          <button onClick={refreshViewer} className="viewer-action-button" title="Refresh viewer">
            <RefreshCw size={14} />
          </button>
          
          <button 
            onClick={clearViewer} 
            className="viewer-action-button danger" 
            title="Clear all nodes"
            disabled={viewerItems.length === 0}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="viewer-content">
        {viewerItems.length === 0 ? (
          // 빈 상태
          <div className="viewer-empty-state">
            <div className="viewer-empty-icon">
              <Eye size={48} />
            </div>
            <h2 className="viewer-empty-title">No nodes in viewer</h2>
            <p className="viewer-empty-description">
              Add nodes to the viewer by clicking the eye button on any node in the workspace.
            </p>
            <button onClick={onBackToWorkspace} className="viewer-empty-action">
              Go to Workspace
            </button>
          </div>
        ) : (
          // 노드 목록 with DND
          <div className="viewer-nodes-container">
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="viewer-nodes">
                {(provided, snapshot) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className={`viewer-droppable ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                  >
                    {viewerNodes.map((node, index) => {
                        const NodeComponent = nodeComponents[node.type];
                        
                        if (!NodeComponent) {
                          return (
                            <Draggable key={node.id} draggableId={node.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={`viewer-node-wrapper error ${snapshot.isDragging ? 'dragging' : ''}`}
                                >
                                  <div className="viewer-node-error">
                                    <div className="viewer-node-error-content">
                                      <h3>Unknown Node Type</h3>
                                      <p>Node type "{node.type}" not found</p>
                                      <button 
                                        onClick={() => removeFromViewer(node.id)}
                                        className="viewer-remove-button"
                                      >
                                        Remove from Viewer
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        }

                        return (
                          <Draggable key={node.id} draggableId={node.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`viewer-node-wrapper ${snapshot.isDragging ? 'dragging' : ''}`}
                              >
                                {/* 🆕 뷰어 전용 헤더 with 편집 가능한 라벨 */}
                                <div 
                                  {...provided.dragHandleProps}
                                  className="viewer-node-header"
                                >
                                  <div className="viewer-node-info">
                                    <span className="viewer-node-id">#{node.id}</span>
                                    
                                    {/* 🆕 편집 가능한 라벨 영역 */}
                                    {editingNodeId === node.id ? (
                                      // 편집 모드
                                      <div className="viewer-label-edit-container">
                                        <input
                                          type="text"
                                          value={editingLabel}
                                          onChange={(e) => setEditingLabel(e.target.value)}
                                          onKeyDown={(e) => handleLabelKeyDown(e, node.id)}
                                          className="viewer-label-input"
                                          placeholder={node.viewerItem.nodeTitle}
                                          autoFocus
                                          onBlur={() => saveEditingLabel(node.id)}
                                        />

                                      </div>
                                    ) : (
                                      // 일반 모드 - 클릭하면 편집 모드로 전환
                                      <div className="viewer-label-display-container">
                                        <span 
                                          className="viewer-node-title editable"
                                          onClick={() => startEditingLabel(
                                            node.id, 
                                            node.viewerItem.customLabel || ''
                                          )}
                                          title="Click to edit label"
                                        >
                                          {getDisplayLabel(node.viewerItem)}
                                        </span>
                                        <button
                                          onClick={() => startEditingLabel(
                                            node.id, 
                                            node.viewerItem.customLabel || ''
                                          )}
                                          className="viewer-edit-label-button"
                                          title="Edit label"
                                        >
                                          <Edit3 size={10} />
                                        </button>
                                      </div>
                                    )}
                                    
                                    <span className="viewer-node-type">{node.type}</span>
                                  </div>
                                  <div className="viewer-header-actions">
                                    <div className="viewer-drag-indicator">⋮⋮</div>
                                    <button 
                                      onClick={() => removeFromViewer(node.id)}
                                      className="viewer-remove-button"
                                      title="Remove from viewer"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                                
                                {/* 실제 노드 컴포넌트 */}
                                <div className="viewer-node-content">
                                  <NodeComponent
                                    id={node.id}
                                    data={node.data}
                                    selected={false}
                                  />
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        )}
      </div>
    </div>
  );
}

export default ViewerPage;