import React, { useState, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Workspace from './Workspace';
import ViewerPage from './ViewerPage';
import WorkflowEngine from './WorkflowEngine';
import { ViewerProvider } from './ViewerContext';
import { ViewerNodeItem } from './types';
import { Node, Edge } from '@xyflow/react';
import { BaseNodeData } from './types';
import './App.css';

/**
 * 🎯 핵심 수정: ReactFlowProvider 완전 분리
 * - Workspace: 독립적인 ReactFlowProvider
 * - ViewerPage: 독립적인 ReactFlowProvider  
 * - Handle ID 충돌 완전 해결!
 */

type AppPage = 'workspace' | 'viewer';

// 기본 노드들
const defaultNodes: Node[] = [
  {
    id: '1',
    type: 'startNode',
    position: { x: 100, y: 100 },
    data: {}
  },
  {
    id: '2', 
    type: 'fileCreatorNode',
    position: { x: 400, y: 100 },
    data: {
      filePath: '',
      fileName: '',
      fileContent: ''
    }
  }
];

function App() {
  // 현재 페이지 상태
  const [currentPage, setCurrentPage] = useState<AppPage>('workspace');
  
  // 🔄 중앙화된 상태 관리 - 워크스페이스와 뷰어가 공유
  const [nodes, setNodes] = useState<Node[]>(defaultNodes);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewerItems, setViewerItems] = useState<ViewerNodeItem[]>([]);

  // 페이지 전환 함수들
  const goToViewer = useCallback(() => {
    setCurrentPage('viewer');
  }, []);

  const goToWorkspace = useCallback(() => {
    setCurrentPage('workspace');
  }, []);

  // 🔄 노드 데이터 업데이트 함수 (중앙 관리)
  const updateNodeData = useCallback((nodeId: string, newData: Partial<BaseNodeData>) => {
    setNodes(currentNodes =>
      currentNodes.map(node => {
        if (node.id === nodeId) {
          const updatedData = { ...node.data, ...newData };
          return { ...node, data: updatedData };
        }
        return node;
      })
    );
  }, []);

  // 🚀 다음 노드들 실행 함수 (중앙 관리)
  const executeNextNodes = useCallback((completedNodeId: string) => {
    const nextNodeIds: string[] = edges
      .filter(edge => edge.source === completedNodeId && edge.sourceHandle === 'trigger-output')
      .map(edge => edge.target);
    
    if (nextNodeIds.length === 0) return;
    
    const triggerTime = Date.now();
    setNodes(currentNodes => 
      currentNodes.map(node => 
        nextNodeIds.includes(node.id) 
          ? { ...node, data: { ...node.data, triggerExecution: triggerTime } } 
          : node
      )
    );
  }, [edges]);

  // 뷰어 아이템 변경 핸들러
  const handleViewerItemsChange = useCallback((newItems: ViewerNodeItem[]) => {
    setViewerItems(newItems);
  }, []);

  // 노드 변경 핸들러
  const handleNodesChange = useCallback((newNodes: Node[]) => {
    setNodes(newNodes);
  }, []);

  // 엣지 변경 핸들러
  const handleEdgesChange = useCallback((newEdges: Edge[]) => {
    setEdges(newEdges);
  }, []);

  return (
    <div className="app-container">
      {/* 🎯 핵심 수정: 각 페이지마다 독립적인 ReactFlowProvider */}
      
      {/* Workspace - 독립적인 ReactFlowProvider */}
      <div style={{ 
        display: currentPage === 'workspace' ? 'block' : 'none',
        width: '100%',
        height: '100%'
      }}>
        <ReactFlowProvider>
          <ViewerProvider isViewer={false}>
            <WorkflowEngine
              nodes={nodes}
              edges={edges}
              updateNodeData={updateNodeData}
              executeNextNodes={executeNextNodes}
              viewerItems={viewerItems}
              onViewerItemsChange={handleViewerItemsChange}
            >
              <Workspace 
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                viewerItems={viewerItems}
                onViewerItemsChange={handleViewerItemsChange}
                onGoToViewer={goToViewer}
                updateNodeData={updateNodeData}
                executeNextNodes={executeNextNodes}
              />
            </WorkflowEngine>
          </ViewerProvider>
        </ReactFlowProvider>
      </div>

      {/* ViewerPage - 완전히 독립적인 ReactFlowProvider */}
      <div style={{ 
        display: currentPage === 'viewer' ? 'block' : 'none',
        width: '100%',
        height: '100%'
      }}>
        <ReactFlowProvider>
          <ViewerProvider isViewer={true}>
            <WorkflowEngine
              nodes={nodes}
              edges={edges}
              updateNodeData={updateNodeData}
              executeNextNodes={executeNextNodes}
              viewerItems={viewerItems}
              onViewerItemsChange={handleViewerItemsChange}
            >
              <ViewerPage
                viewerItems={viewerItems}
                allNodes={nodes}
                allEdges={edges}
                onViewerItemsChange={handleViewerItemsChange}
                updateNodeData={updateNodeData}
                executeNextNodes={executeNextNodes}
                onBackToWorkspace={goToWorkspace}
              />
            </WorkflowEngine>
          </ViewerProvider>
        </ReactFlowProvider>
      </div>
    </div>
  );
}

export default App;