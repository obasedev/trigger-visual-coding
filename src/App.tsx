import React, { useState, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Workspace from './Workspace';
import ViewerPage from './ViewerPage';
import WorkflowEngine from './WorkflowEngine';
import { ViewerNodeItem } from './types';
import { Node, Edge } from '@xyflow/react';
import { BaseNodeData } from './types';
import './App.css';

/**
 * 메인 애플리케이션 컴포넌트 (통합된 Context)
 * 🔧 수정사항: WorkflowProvider를 App 레벨로 이동하여 
 * Workspace와 ViewerPage가 동일한 Context를 공유하도록 함
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
      <ReactFlowProvider>
        {/* 🔧 Handle 에러 해결: 다시 동시 렌더링 방식으로 (더 안전) */}
        <WorkflowEngine
          nodes={nodes}
          edges={edges}
          updateNodeData={updateNodeData}
          executeNextNodes={executeNextNodes}
          viewerItems={viewerItems}
          onViewerItemsChange={handleViewerItemsChange}
        >
          {/* 🎯 두 페이지 동시 렌더링 (Handle 에러 없음) */}
          
          {/* Workspace - 항상 렌더링됨 (백그라운드 실행 보장) */}
          <div style={{ 
            display: currentPage === 'workspace' ? 'block' : 'none',
            width: '100%',
            height: '100%'
          }}>
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
          </div>

          {/* ViewerPage - 항상 렌더링됨 */}
          <div style={{ 
            display: currentPage === 'viewer' ? 'block' : 'none',
            width: '100%',
            height: '100%'
          }}>
            <ViewerPage
              viewerItems={viewerItems}
              allNodes={nodes}
              allEdges={edges}
              onViewerItemsChange={handleViewerItemsChange}
              updateNodeData={updateNodeData}
              executeNextNodes={executeNextNodes}
              onBackToWorkspace={goToWorkspace}
            />
          </div>
        </WorkflowEngine>
      </ReactFlowProvider>
    </div>
  );
}

export default App;