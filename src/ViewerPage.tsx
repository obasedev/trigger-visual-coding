import React, { useMemo, useCallback } from 'react';
import { ArrowLeft, Eye, Trash2, RefreshCw } from 'lucide-react';
import { Node } from '@xyflow/react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { WorkflowProvider } from './WorkflowContext';
import { ViewerNodeItem } from './types';
import './viewerpage.css';

// 노드 모듈들 import
const nodeModules = import.meta.glob('./nodes/*Node.tsx', { eager: true });

interface ViewerPageProps {
  viewerItems: ViewerNodeItem[];
  allNodes: Node[];
  allEdges: any[];
  onViewerItemsChange: (items: ViewerNodeItem[]) => void;
  updateNodeData: (nodeId: string, newData: any) => void;
  executeNextNodes: (nodeId: string) => void;
  onBackToWorkspace: () => void;
}

function ViewerPage({
  viewerItems,
  allNodes,
  allEdges,
  onViewerItemsChange,
  updateNodeData,
  executeNextNodes: executeNextNodesProp,
  onBackToWorkspace
}: ViewerPageProps) {

  // 뷰어에 있는 노드들의 실제 데이터를 가져오기
  const viewerNodes = useMemo(() => {
    return viewerItems
      .map(item => {
        const actualNode = allNodes.find(node => node.id === item.nodeId);
        return actualNode ? { ...actualNode, viewerItem: item } : null;
      })
      .filter(Boolean) as (Node & { viewerItem: ViewerNodeItem })[];
  }, [viewerItems, allNodes]);

  // 노드 타입들을 동적으로 생성
  const nodeComponents = useMemo(() => {
    const components: { [key: string]: React.ComponentType<any> } = {};
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
    // 드래그가 취소되었거나 같은 위치에 드롭된 경우
    if (!result.destination || result.destination.index === result.source.index) {
      return;
    }

    // 배열 순서 변경
    const reorderedItems = Array.from(viewerItems);
    const [removed] = reorderedItems.splice(result.source.index, 1);
    reorderedItems.splice(result.destination.index, 0, removed);

    // 순서 변경된 목록으로 업데이트
    onViewerItemsChange(reorderedItems);
    console.log(`🔄 Viewer order changed: moved item from ${result.source.index} to ${result.destination.index}`);
  };

  // 🔄 수정된 executeNextNodes - 워크스페이스와 즉시 동기화
  const executeNextNodes = useCallback((completedNodeId: string) => {
    console.log(`🚀 Viewer: Node ${completedNodeId} completed, finding next nodes...`);
    
    // 1. 상위 컴포넌트의 executeNextNodes 호출
    executeNextNodesProp(completedNodeId);
    
    // 2. 뷰어에서도 즉시 다음 노드들 찾아서 트리거
    const nextNodeIds = allEdges
      .filter(edge => edge.source === completedNodeId && edge.sourceHandle === 'trigger-output')
      .map(edge => edge.target);
    
    if (nextNodeIds.length > 0) {
      console.log(`🔗 Viewer: Triggering next nodes immediately: ${nextNodeIds.join(', ')}`);
      
      const triggerTime = Date.now();
      
      // 각 다음 노드에 트리거 신호 전송 (워크스페이스 노드들 포함)
      nextNodeIds.forEach(nodeId => {
        updateNodeData(nodeId, { triggerExecution: triggerTime });
        console.log(`⚡ Viewer: Triggered node ${nodeId} with timestamp ${triggerTime}`);
      });
    } else {
      console.log(`🏁 Viewer: No next nodes found for ${completedNodeId}`);
    }
  }, [executeNextNodesProp, allEdges, updateNodeData]);

  // 뷰어에서 노드 제거
  const removeFromViewer = (nodeId: string) => {
    const updatedItems = viewerItems.filter(item => item.nodeId !== nodeId);
    onViewerItemsChange(updatedItems);
    console.log(`🗑️ Node ${nodeId} removed from viewer`);
  };

  // 뷰어 전체 삭제
  const clearViewer = () => {
    onViewerItemsChange([]);
    console.log('🧹 Viewer cleared');
  };

  // 뷰어 새로고침 (실제 노드 데이터와 동기화)
  const refreshViewer = () => {
    // 존재하지 않는 노드들 제거
    const existingNodeIds = new Set(allNodes.map(node => node.id));
    const validItems = viewerItems.filter(item => existingNodeIds.has(item.nodeId));
    
    if (validItems.length !== viewerItems.length) {
      onViewerItemsChange(validItems);
      console.log(`🔄 Viewer refreshed: ${viewerItems.length - validItems.length} invalid items removed`);
    } else {
      console.log('🔄 Viewer is already up to date');
    }
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
                    {/* 🔄 수정된 WorkflowProvider - 수정된 executeNextNodes 전달 */}
                    <WorkflowProvider
                      nodes={allNodes}
                      edges={allEdges}
                      updateNodeData={updateNodeData}
                      onExecuteNextNodes={executeNextNodes} // 수정된 함수 전달
                      viewerItems={viewerItems}
                      onViewerItemsChange={onViewerItemsChange}
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
                                {/* 뷰어 전용 헤더 with 드래그 핸들 */}
                                <div 
                                  {...provided.dragHandleProps}
                                  className="viewer-node-header"
                                >
                                  <div className="viewer-node-info">
                                    <span className="viewer-node-id">#{node.id}</span>
                                    <span className="viewer-node-title">{node.viewerItem.nodeTitle}</span>
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
                    </WorkflowProvider>
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