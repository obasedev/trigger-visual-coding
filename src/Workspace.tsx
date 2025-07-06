import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  addEdge,
  Connection,
  Edge,
  useReactFlow,
  Node,
  NodeChange,
  EdgeChange,
  applyNodeChanges
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { invoke } from '@tauri-apps/api/core';
import { Save, FolderOpen, Eye } from 'lucide-react';
import Sidebar from './Sidebar';
import { WorkflowProvider } from './WorkflowContext';
import { getNodeManager } from './NodeManager';
import { BaseNodeData, ViewerNodeItem } from './types';
import './workspace.css';

const nodeModules = import.meta.glob('./nodes/*Node.tsx', { eager: true });

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

// Workspace Props 인터페이스
interface WorkspaceProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (nodes: Node[]) => void;
  onEdgesChange: (edges: Edge[]) => void;
  viewerItems: ViewerNodeItem[];
  onViewerItemsChange: (items: ViewerNodeItem[]) => void;
  onGoToViewer: () => void;
  updateNodeData: (nodeId: string, newData: Partial<BaseNodeData>) => void;
  executeNextNodes: (nodeId: string) => void;
}

function Workspace({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  viewerItems,
  onViewerItemsChange,
  onGoToViewer,
  updateNodeData: updateNodeDataProp,
  executeNextNodes: executeNextNodesProp
}: WorkspaceProps) {

  // 🔄 기존 로컬 상태들 (히스토리, 클립보드 등은 유지)
  const [internalClipboard, setInternalClipboard] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  
  const reactFlowInstance = useReactFlow();
  const nodeManager = getNodeManager();


  // 🔄 노드 데이터 업데이트 함수 (App 상태 직접 수정)
  const updateNodeData = useCallback((nodeId: string, newData: Partial<BaseNodeData>) => {
    const updatedNodes = nodes.map((node) => {
      if (node.id === nodeId) {
        const updatedData = { ...node.data, ...newData };
        return { ...node, data: updatedData };
      }
      return node;
    });
    
    onNodesChange(updatedNodes);
    updateNodeDataProp(nodeId, newData);
  }, [nodes, onNodesChange, updateNodeDataProp]);

  // 🚀 다음 노드들 실행 함수 (App 상태 직접 수정)
  const executeNextNodes = useCallback((completedNodeId: string) => {
    const nextNodeIds: string[] = edges
      .filter(edge => edge.source === completedNodeId && edge.sourceHandle === 'trigger-output')
      .map(edge => edge.target);
    
    if (nextNodeIds.length === 0) return;
    
    const triggerTime = Date.now();
    const updatedNodes = nodes.map(node => 
      nextNodeIds.includes(node.id) 
        ? { ...node, data: { ...node.data, triggerExecution: triggerTime } } 
        : node
    );
    
    onNodesChange(updatedNodes);
    executeNextNodesProp(completedNodeId);
  }, [edges, nodes, onNodesChange, executeNextNodesProp]);

  // 🧹 뷰어 목록 정리 함수
  const cleanupViewerItems = useCallback((remainingNodeIds: Set<string>) => {
    const cleanedItems = viewerItems.filter(item => remainingNodeIds.has(item.nodeId));
    if (cleanedItems.length !== viewerItems.length) {
      onViewerItemsChange(cleanedItems);
    }
  }, [viewerItems, onViewerItemsChange]);

  // 🔄 데이터 파이프라인 동기화
  useEffect(() => {
    const dataEdges = edges.filter(edge => edge.sourceHandle !== 'trigger-output');
    const updates: { nodeId: string; newData: Partial<BaseNodeData> }[] = [];

    for (const edge of dataEdges) {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);

      if (sourceNode && targetNode && sourceNode.data.outputData && edge.sourceHandle && edge.targetHandle) {
        const valueToPush = sourceNode.data.outputData[edge.sourceHandle];
        const currentTargetValue = targetNode.data[edge.targetHandle];

        if (valueToPush !== undefined && valueToPush !== currentTargetValue) {
          updates.push({
            nodeId: targetNode.id,
            newData: { [edge.targetHandle]: valueToPush }
          });
        }
      }
    }

    if (updates.length > 0) {
      const updatedNodes = nodes.map(node => {
        const update = updates.find(u => u.nodeId === node.id);
        if (update) {
          return { ...node, data: { ...node.data, ...update.newData } };
        }
        return node;
      });
      onNodesChange(updatedNodes);
    }
  }, [nodes, edges, onNodesChange]);

  // 📝 노드 변경 처리 (삭제시 뷰어 정리 포함)
  // 📝 노드 변경 처리 (React Flow onNodesChange 오류 해결)
const onNodesChangeHandler = useCallback(
  (changes: NodeChange[]) => {
  
    
    // 노드 삭제시 뷰어에서도 제거 및 ID 관리
    const deletedNodeIds = changes
      .filter(change => change.type === 'remove')
      .map(change => change.id);

    if (deletedNodeIds.length > 0) {
      console.log('🗑️ Deleting nodes:', deletedNodeIds);
      
      // NodeManager에서 ID 반납
      deletedNodeIds.forEach(nodeId => {
        nodeManager.releaseId(nodeId);
      });
      
      // 삭제 후 남은 노드들의 ID 집합 계산
      const remainingNodeIds = new Set(
        nodes
          .filter(node => !deletedNodeIds.includes(node.id))
          .map(node => node.id)
      );
      
      // 뷰어 목록 정리
      cleanupViewerItems(remainingNodeIds);
    }

    // 🔧 수정: React Flow의 applyNodeChanges 사용하여 정확한 상태 업데이트
    const updatedNodes = applyNodeChanges(changes, nodes);
    
    // 상태 업데이트
    onNodesChange(updatedNodes);
  },
  [nodes, onNodesChange, nodeManager, cleanupViewerItems]
);

  // 📝 엣지 변경 처리
  const onEdgesChangeHandler = useCallback(
    (changes: EdgeChange[]) => {
      console.log('📝 Edge changes:', changes);
      
      let updatedEdges = [...edges];
      
      changes.forEach(change => {
        switch (change.type) {
          case 'select':
            updatedEdges = updatedEdges.map(edge =>
              edge.id === change.id
                ? { ...edge, selected: change.selected }
                : edge
            );
            break;
          case 'remove':
            updatedEdges = updatedEdges.filter(edge => edge.id !== change.id);
            break;
          // 다른 변경 타입들도 필요에 따라 추가
        }
      });
      
      onEdgesChange(updatedEdges);
    },
    [edges, onEdgesChange]
  );

  // 🏗️ 초기화 작업
  useEffect(() => {
    // 기존 노드 ID들을 NodeManager에 등록
    const currentNodeIds = nodes.map(node => parseInt(node.id)).filter(id => !isNaN(id));
    currentNodeIds.forEach(id => {
      nodeManager.registerExistingId(id);
    });
  }, []); // 한 번만 실행

  useEffect(() => {
    // 컴포넌트 언마운트시 타이머 정리
    return () => {
      nodeManager.clearAllTimers();
    };
  }, [nodeManager]);

  // 📚 히스토리 관리
  const saveToHistory = useCallback(() => {
    const currentState = {
      nodes: nodes.map(node => ({ ...node, data: { ...node.data } })),
      edges: [...edges],
      timestamp: Date.now()
    };
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(currentState);
    
    const limitedHistory = newHistory.slice(-20);
    
    setHistory(limitedHistory);
    setHistoryIndex(limitedHistory.length - 1);
  }, [nodes, edges, history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex < 0) return;
    const stateToRestore = history[historyIndex];
    if (stateToRestore) {
      onNodesChange(stateToRestore.nodes);
      onEdgesChange(stateToRestore.edges);
      nodeManager.syncWithNodes(stateToRestore.nodes);
      setHistoryIndex(prev => prev - 1);
      
      // 뷰어 목록도 정리
      const restoredNodeIds = new Set(stateToRestore.nodes.map((node: Node) => node.id));
      cleanupViewerItems(restoredNodeIds);
    }
  }, [history, historyIndex, onNodesChange, onEdgesChange, nodeManager, cleanupViewerItems]);

  const redo = useCallback(() => {
    if (historyIndex + 1 >= history.length) return;
    const stateToRestore = history[historyIndex + 1];
    if (stateToRestore) {
      onNodesChange(stateToRestore.nodes);
      onEdgesChange(stateToRestore.edges);
      nodeManager.syncWithNodes(stateToRestore.nodes);
      setHistoryIndex(prev => prev + 1);
      
      // 뷰어 목록도 정리
      const restoredNodeIds = new Set(stateToRestore.nodes.map((node: Node) => node.id));
      cleanupViewerItems(restoredNodeIds);
    }
  }, [history, historyIndex, onNodesChange, onEdgesChange, nodeManager, cleanupViewerItems]);

  // 🎯 선택/복사/붙여넣기 기능
  const selectAllNodes = useCallback(() => {
    saveToHistory();
    const updatedNodes = nodes.map(node => ({ ...node, selected: true }));
    onNodesChange(updatedNodes);
  }, [nodes, onNodesChange, saveToHistory]);

  const copySelectedNodes = useCallback(() => {
    const selectedNodes = nodes.filter(node => node.selected);
    if (selectedNodes.length === 0) return;
    
    const selectedNodeIds = new Set(selectedNodes.map(node => node.id));
    const relatedEdges = edges.filter(edge => 
      selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
    );
    
    setInternalClipboard({
      nodes: selectedNodes.map(node => ({ ...node, data: { ...node.data } })),
      edges: relatedEdges.map(edge => ({ ...edge }))
    });
  }, [nodes, edges]);

  const pasteNodes = useCallback(() => {
    if (!internalClipboard || internalClipboard.nodes?.length === 0) return;
    
    saveToHistory();
    
    const idMapping = new Map();
    const newNodes = internalClipboard.nodes.map((clipboardNode: Node) => {
      const newId = nodeManager.generateNewId();
      idMapping.set(clipboardNode.id, newId.toString());
      
      return {
        ...clipboardNode,
        id: newId.toString(),
        selected: true,
        position: { x: clipboardNode.position.x + 20, y: clipboardNode.position.y + 20 },
        data: { ...clipboardNode.data }
      };
    });
    
    const newEdges = (internalClipboard.edges || []).map((edge: Edge) => {
      const newSourceId = idMapping.get(edge.source);
      const newTargetId = idMapping.get(edge.target);
      
      if (newSourceId && newTargetId) {
        return {
          ...edge,
          id: `copied_edge_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          source: newSourceId,
          target: newTargetId
        };
      }
      return null;
    }).filter(Boolean);
    
    const updatedNodes = [
      ...nodes.map(node => ({ ...node, selected: false })),
      ...newNodes
    ];
    const updatedEdges = [...edges, ...newEdges as Edge[]];
    
    onNodesChange(updatedNodes);
    onEdgesChange(updatedEdges);
  }, [internalClipboard, nodes, edges, onNodesChange, onEdgesChange, saveToHistory, nodeManager]);

  // ⌨️ 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true'
      );
      
      if ((event.ctrlKey || event.metaKey)) {
        switch (event.key) {
          case 'a': if (!isInputFocused) { event.preventDefault(); selectAllNodes(); } break;
          case 'c': if (!isInputFocused) { event.preventDefault(); copySelectedNodes(); } break;
          case 'v': if (!isInputFocused) { event.preventDefault(); pasteNodes(); } break;
          case 'z': if (!isInputFocused) { event.preventDefault(); event.shiftKey ? redo() : undo(); } break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); };
  }, [selectAllNodes, copySelectedNodes, pasteNodes, undo, redo]);

  // 🧩 노드 타입들 동적 로딩
  const nodeTypes = useMemo(() => {
    const types: any = {};
    Object.entries(nodeModules).forEach(([path, module]: [string, any]) => {
      const fileName = path.split('/').pop()?.replace('.tsx', '');
      if (fileName && module.default) {
        types[fileName.charAt(0).toLowerCase() + fileName.slice(1)] = module.default;
      }
    });
    return types;
  }, []);

  // ➕ 사이드바에서 노드 추가
  const addNodeFromSidebar = useCallback((nodeType: string) => {
    saveToHistory();
    const nodeConfig: any = Object.values(nodeModules).find(m => (m as any).config.type === nodeType)?.config;
    if (!nodeConfig) return;
    
    const defaultData: Record<string, any> = {};
    nodeConfig.settings?.forEach((setting: any) => {
      defaultData[setting.key] = setting.default ?? '';
    });
    
    const newNode: Node = {
      id: nodeManager.generateNewId().toString(),
      type: nodeType,
      position: { x: Math.random() * 300 + 200, y: Math.random() * 300 + 150 },
      data: defaultData
    };
    
    const updatedNodes = [...nodes, newNode];
    onNodesChange(updatedNodes);
  }, [nodes, onNodesChange, saveToHistory, nodeManager]);

  // 🔗 노드 연결
  const onConnect = useCallback(
    (params: Connection | Edge) => {
      saveToHistory();
      const updatedEdges = addEdge(params, edges);
      onEdgesChange(updatedEdges);
    },
    [edges, onEdgesChange, saveToHistory]
  );

  // 💾 워크플로우 저장 (뷰어 정보 포함)
  const saveWorkflow = useCallback(async () => {
    try {
      const flow = reactFlowInstance.toObject();
      
      // 🆕 뷰어 정보도 포함해서 저장
      const workflowData = {
        ...flow,
        viewerItems // 뷰어 아이템 추가
      };
      
      const result = await invoke('save_workflow_to_desktop', { 
        workflowData: JSON.stringify(workflowData, null, 2) 
      });
      console.log('✅ Workflow + Viewer saved successfully');
    } catch (error: any) {
      if (error?.message === 'User cancelled the save operation') {
        console.log('💭 Save cancelled by user');
      } else {
        console.error('❌ Save failed:', error);
        alert('❌ Save failed: ' + (error?.message || error));
      }
    }
  }, [reactFlowInstance, viewerItems]);

  // 📂 워크플로우 불러오기 (뷰어 정보 포함)
  const loadWorkflow = useCallback(async () => {
    try {
      const workflowData = await invoke('load_workflow_from_desktop') as string;
      if (!workflowData?.trim()) return alert('⚠️ No workflow data to load');
      
      const flow = JSON.parse(workflowData);
      if (!flow || typeof flow !== 'object') throw new Error('Invalid workflow format');
      
      if (Array.isArray(flow.nodes)) {
        onNodesChange(flow.nodes);
        nodeManager.syncWithNodes(flow.nodes);
        
        // 노드 로드시 뷰어 목록 정리
        const loadedNodeIds = new Set(flow.nodes.map((node: Node) => node.id));
        cleanupViewerItems(loadedNodeIds);
      }
      if (Array.isArray(flow.edges)) onEdgesChange(flow.edges);
      if (flow.viewport) reactFlowInstance.setViewport(flow.viewport);
      
      // 🆕 뷰어 정보도 복원 (있는 경우에만)
      if (Array.isArray(flow.viewerItems)) {
        // 실제 존재하는 노드들만 필터링
        const currentNodeIds = new Set(flow.nodes?.map((node: Node) => node.id) || []);
        const validViewerItems = flow.viewerItems.filter((item: any) => 
          currentNodeIds.has(item.nodeId)
        );
        onViewerItemsChange(validViewerItems);
        console.log(`✅ Viewer restored: ${validViewerItems.length} items`);
      } else {
        // 뷰어 정보가 없으면 초기화
        onViewerItemsChange([]);
      }
      
      console.log('✅ Workflow + Viewer loaded successfully');
    } catch (error: any) {
      if (error?.message === 'User cancelled the load operation') {
        console.log('💭 Load cancelled by user');
      } else {
        console.error('❌ Load failed:', error);
        alert('❌ Load failed: ' + (error?.message || error));
      }
    }
  }, [reactFlowInstance, onNodesChange, onEdgesChange, nodeManager, cleanupViewerItems, onViewerItemsChange]);

  // 📎 워크플로우 추가 (뷰어 정보 병합)
  const appendWorkflow = useCallback(async () => {
    try {
      const workflowData = await invoke('load_workflow_from_desktop') as string;
      if (!workflowData?.trim()) return alert('⚠️ No workflow data to load');
      
      const flow = JSON.parse(workflowData);
      if (!flow || !Array.isArray(flow.nodes) || flow.nodes.length === 0) return alert('⚠️ No nodes to append');
      
      saveToHistory();
      
      const idMapping = new Map<string, string>();
      const remappedNodes = flow.nodes.map((node: any) => {
        const newId = nodeManager.generateNewId().toString();
        idMapping.set(node.id, newId);
        return { ...node, id: newId, selected: false, position: { x: node.position.x + 50, y: node.position.y + 50 } };
      });
      
      const remappedEdges = (flow.edges || []).map((edge: any) => {
        const newSource = idMapping.get(edge.source);
        const newTarget = idMapping.get(edge.target);
        return newSource && newTarget ? { ...edge, id: `imported_edge_${Date.now()}_${Math.random()}`, source: newSource, target: newTarget } : null;
      }).filter(Boolean);
      
      const updatedNodes = [...nodes, ...remappedNodes];
      const updatedEdges = [...edges, ...remappedEdges];
      
      onNodesChange(updatedNodes);
      onEdgesChange(updatedEdges);
      
      // 🆕 뷰어 정보도 추가 (ID 매핑 적용)
      if (Array.isArray(flow.viewerItems) && flow.viewerItems.length > 0) {
        const remappedViewerItems = flow.viewerItems
          .map((item: any) => {
            const newNodeId = idMapping.get(item.nodeId);
            return newNodeId ? { ...item, nodeId: newNodeId, addedAt: Date.now() } : null;
          })
          .filter(Boolean);
        
        const mergedViewerItems = [...viewerItems, ...remappedViewerItems];
        onViewerItemsChange(mergedViewerItems);
        console.log(`✅ Viewer items appended: ${remappedViewerItems.length} items`);
      }
      
      console.log(`✅ ${remappedNodes.length} nodes + viewer items appended successfully`);
    } catch (error: any) {
      if (error?.message === 'User cancelled the load operation') {
        console.log('💭 Append cancelled by user');
      } else {
        console.error('❌ Append failed:', error);
        alert('❌ Append failed: ' + (error?.message || error));
      }
    }
  }, [nodes, edges, viewerItems, onNodesChange, onEdgesChange, onViewerItemsChange, saveToHistory, nodeManager]);

  // 👁️ 뷰어 페이지로 이동
  const openViewer = useCallback(() => {
    if (viewerItems.length === 0) {
      alert('⚠️ No nodes added to viewer yet. Click the eye button on nodes to add them.');
      return;
    }
    
    console.log(`👁️ Opening viewer with ${viewerItems.length} nodes:`, viewerItems);
    onGoToViewer();
  }, [viewerItems, onGoToViewer]);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex' }}>
      <Sidebar onAddNode={addNodeFromSidebar} />
      <div style={{ flex: 1, position: 'relative' }}>
        
        {/* 상단 버튼들 */}
        <div className="workspace-button-container">
          <button onClick={saveWorkflow} className="workspace-button save">
            <Save size={14} />
            Save As...
          </button>
          
          <button onClick={loadWorkflow} className="workspace-button replace">
            <FolderOpen size={14} />
            Open File
          </button>
          
          <button onClick={appendWorkflow} className="workspace-button append">
            <FolderOpen size={14} />
            Append
          </button>

          {/* 뷰어 버튼 */}
          <button onClick={openViewer} className="workspace-button viewer">
            <Eye size={14} />
            Viewer ({viewerItems.length})
          </button>
        </div>
        
        {/* 🔧 수정: WorkflowProvider 제거 (App에서 관리) */}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChangeHandler}
          onEdgesChange={onEdgesChangeHandler}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

export default Workspace;