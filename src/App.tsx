import React, { useState, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Workspace from './Workspace';
import ViewerPage from './ViewerPage';
import { WorkflowProvider } from './WorkflowContext';
import { ViewerProvider } from './ViewerPage';
import { Node, Edge } from '@xyflow/react';
import './App.css';

/**
 * 🎯 핵심 수정: ReactFlowProvider 완전 분리
 * - Workspace: 독립적인 ReactFlowProvider
 * - ViewerPage: 독립적인 ReactFlowProvider  
 * - Handle ID 충돌 완전 해결!
 */


// 기본 노드들
const defaultNodes = [
  {
    id: '1', 
    type: 'fileCreatorNode',
    position: { x: 300, y: 200 },
    data: {
      filePath: '',
      fileName: '',
      fileContent: ''
    }
  }
];

function App() {
  // 현재 페이지 상태
  const [currentPage, setCurrentPage] = useState('workspace');
  
  // 🔄 중앙화된 상태 관리 - 워크스페이스와 뷰어가 공유
  const [nodes, setNodes] = useState(defaultNodes);
  const [edges, setEdges] = useState([]);
  const [viewerItems, setViewerItems] = useState([]);

  // 페이지 전환 함수들
  const goToViewer = useCallback(() => {
    setCurrentPage('viewer');
  }, []);

  const goToWorkspace = useCallback(() => {
    setCurrentPage('workspace');
  }, []);

  // 🔄 노드 데이터 업데이트 함수 (중앙 관리)
  const updateNodeData = useCallback((nodeId: string, newData: any) => {
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

  // 🔄 데이터 전달 함수 (아웃풋 데이터를 연결된 노드들에게 전달)
  const sendDataToNextNodes = useCallback((completedNodeId: string, outputData: any) => {
    // 데이터 연결만 찾기 (trigger-output 제외)
    const dataConnections = edges.filter(edge => 
      edge.source === completedNodeId && edge.sourceHandle !== 'trigger-output'
    );
    
    if (dataConnections.length === 0) return;
    
    // 연결된 노드들에게 데이터 전달
    setNodes(currentNodes => 
      currentNodes.map(node => {
        const incomingConnections = dataConnections.filter(edge => edge.target === node.id);
        if (incomingConnections.length === 0) return node;
        
        // 해당 노드의 입력 필드들에 데이터 설정
        const updatedData = { ...node.data };
        incomingConnections.forEach(edge => {
          const sourceField = edge.sourceHandle;
          const targetField = edge.targetHandle;
          if (outputData && outputData[sourceField]) {
            updatedData[targetField] = outputData[sourceField];
          }
        });
        
        return { ...node, data: updatedData };
      })
    );
  }, [edges]);

  // 🚀 트리거 전달 함수 (트리거만 전달)
  const triggerNextNodes = useCallback((completedNodeId: string) => {
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

  // 🎯 통합 실행 함수 (기존 호환성 유지)
  const executeNextNodes = useCallback((completedNodeId: string, outputData?: any) => {
    // 1단계: 데이터 먼저 전달
    if (outputData) {
      sendDataToNextNodes(completedNodeId, outputData);
    }
    
    // 2단계: 잠시 후 트리거 전달 (데이터 전달이 완료된 후)
    setTimeout(() => {
      triggerNextNodes(completedNodeId);
    }, 20); // 20ms 지연으로 데이터 전달 완료 보장
  }, [sendDataToNextNodes, triggerNextNodes]);

  // 뷰어 아이템 변경 핸들러
  const handleViewerItemsChange = useCallback((newItems) => {
    setViewerItems(newItems);
  }, []);

  // 노드 변경 핸들러
  const handleNodesChange = useCallback((newNodes) => {
    setNodes(newNodes);
  }, []);

  // 엣지 변경 핸들러
  const handleEdgesChange = useCallback((newEdges) => {
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
            <WorkflowProvider
              nodes={nodes}
              edges={edges}
              updateNodeData={updateNodeData}
              onExecuteNextNodes={executeNextNodes}
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
            </WorkflowProvider>
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
            <WorkflowProvider
              nodes={nodes}
              edges={edges}
              updateNodeData={updateNodeData}
              onExecuteNextNodes={executeNextNodes}
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
            </WorkflowProvider>
          </ViewerProvider>
        </ReactFlowProvider>
      </div>
    </div>
  );
}

export default App;