import React, { useState, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Workspace from './Workspace';
import ViewerPage from './ViewerPage';
import { ViewerNodeItem } from './types';
import { Node, Edge } from '@xyflow/react';
import { BaseNodeData } from './types';
import './App.css';

/**
 * 메인 애플리케이션 컴포넌트 (뷰어 라우팅 추가)
 * 역할: 워크스페이스와 뷰어 페이지 간 전환 관리, 전체 상태 관리
 * 변경사항: 페이지 라우팅과 뷰어 상태 관리 추가
 */

type AppPage = 'workspace' | 'viewer';

function App() {
  // 현재 페이지 상태
  const [currentPage, setCurrentPage] = useState<AppPage>('workspace');
  
  // 워크스페이스와 뷰어 간 공유되는 상태들
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewerItems, setViewerItems] = useState<ViewerNodeItem[]>([]);

  // 페이지 전환 함수들
  const goToViewer = useCallback(() => {
    console.log('📖 Switching to viewer page');
    setCurrentPage('viewer');
  }, []);

  const goToWorkspace = useCallback(() => {
    console.log('🏗️ Switching to workspace');
    setCurrentPage('workspace');
  }, []);

  // 노드 데이터 업데이트 함수
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

  // 다음 노드들 실행 함수
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

  return (
    <div className="app-container">
      <ReactFlowProvider>
        {currentPage === 'workspace' ? (
          <Workspace 
            // 워크스페이스에 상태 관리 함수들 전달
            initialNodes={nodes}
            initialEdges={edges}
            onNodesChange={setNodes}
            onEdgesChange={setEdges}
            viewerItems={viewerItems}
            onViewerItemsChange={handleViewerItemsChange}
            onGoToViewer={goToViewer}
            updateNodeData={updateNodeData}
            executeNextNodes={executeNextNodes}
          />
        ) : (
          <ViewerPage
            viewerItems={viewerItems}
            allNodes={nodes}
            allEdges={edges}
            onViewerItemsChange={handleViewerItemsChange}
            updateNodeData={updateNodeData}
            executeNextNodes={executeNextNodes}
            onBackToWorkspace={goToWorkspace}
          />
        )}
      </ReactFlowProvider>
    </div>
  );
}

export default App;