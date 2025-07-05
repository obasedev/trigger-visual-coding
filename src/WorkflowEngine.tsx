import React from 'react';
import { WorkflowProvider } from './WorkflowContext';
import { ViewerNodeItem, BaseNodeData } from './types';
import { Node } from '@xyflow/react';

interface WorkflowEngineProps {
  nodes: Node[];
  edges: any[];
  updateNodeData: (nodeId: string, newData: Partial<BaseNodeData>) => void;
  executeNextNodes: (nodeId: string) => void;
  viewerItems: ViewerNodeItem[];
  onViewerItemsChange: (items: ViewerNodeItem[]) => void;
  children: React.ReactNode;
}

/**
 * WorkflowEngine - 워크플로우 Context 제공자
 * 역할: WorkflowProvider를 래핑하여 모든 하위 컴포넌트가 동일한 Context 공유
 * 장점: Workspace와 ViewerPage가 같은 상태를 공유
 */
function WorkflowEngine({
  nodes,
  edges,
  updateNodeData,
  executeNextNodes,
  viewerItems,
  onViewerItemsChange,
  children
}: WorkflowEngineProps) {

  return (
    <WorkflowProvider 
      nodes={nodes}
      edges={edges}
      updateNodeData={updateNodeData}
      onExecuteNextNodes={executeNextNodes}
      viewerItems={viewerItems}
      onViewerItemsChange={onViewerItemsChange}
    >
      {/* 실제 UI 컴포넌트들 */}
      {children}
    </WorkflowProvider>
  );
}

export default WorkflowEngine;