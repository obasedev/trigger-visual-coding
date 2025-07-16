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
import { Store } from '@tauri-apps/plugin-store';
import { Save, FolderOpen, Eye } from 'lucide-react';
import Sidebar from './Sidebar';
import { WorkflowProvider } from './WorkflowContext';
import { getNodeManager } from './NodeManager';
import { BaseNodeData, ViewerNodeItem } from './types';
import { PluginManager } from './PluginManager';
import PluginNode from './nodes/PluginNode'; // 🆕 PluginNode import 추가
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

// Store 인스턴스를 전역에서 관리
let appStore: Store | null = null;

// Store 초기화 함수
const getAppStore = async (): Promise<Store> => {
  if (!appStore) {
    appStore = await Store.load('app-settings.json');
  }
  return appStore;
};

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

  // 기존 로컬 상태들
  const [internalClipboard, setInternalClipboard] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  
  // 플러그인 상태 추가
  const [pluginNodes, setPluginNodes] = useState<any[]>([]);
  
  // 플러그인 노드 배열을 안정화 (React Flow 경고 방지)
  const stablePluginNodes = useMemo(() => pluginNodes, [JSON.stringify(pluginNodes)]);
  
  const reactFlowInstance = useReactFlow();
  const nodeManager = getNodeManager();

  // 노드 데이터 업데이트 함수
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

  // 다음 노드들 실행 함수
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

  // 뷰어 목록 정리 함수
  const cleanupViewerItems = useCallback((remainingNodeIds: Set<string>) => {
    const cleanedItems = viewerItems.filter(item => remainingNodeIds.has(item.nodeId));
    if (cleanedItems.length !== viewerItems.length) {
      onViewerItemsChange(cleanedItems);
    }
  }, [viewerItems, onViewerItemsChange]);

  // 플러그인 로드 useEffect
  useEffect(() => {
    const loadPlugins = async () => {
      try {
        console.log('🔌 Starting plugin system initialization...');
        
        const pluginManager = PluginManager.getInstance();
        await pluginManager.scanAndLoadPlugins();
        
        const pluginConfigs = pluginManager.getPluginConfigs();
        setPluginNodes(pluginConfigs);
        
        console.log(`🔌 Plugin system ready: ${pluginConfigs.length} plugins loaded`);
        console.log('Plugin configs:', pluginConfigs);
        
        // 전역에 PluginManager 노출 (디버깅용)
        (window as any).PluginManager = PluginManager;
        
      } catch (error) {
        console.error('❌ Failed to initialize plugin system:', error);
      }
    };
    
    loadPlugins();
  }, []);

  // 앱 시작시 마지막 저장된 워크플로우 자동 로드
  useEffect(() => {
    const autoLoadLastWorkflow = async () => {
      try {
        const store = await getAppStore();
        const lastSavedPath = await store.get<string>('lastSavedWorkflow');
        
        if (lastSavedPath) {
          console.log(`🔄 마지막 저장된 워크플로우 자동 로드: ${lastSavedPath}`);
          
          try {
            const workflowData = await invoke('load_specific_workflow', { 
              filePath: lastSavedPath 
            }) as string;
            
            if (workflowData?.trim()) {
              const flow = JSON.parse(workflowData);
              
              if (Array.isArray(flow.nodes)) {
                onNodesChange(flow.nodes);
                nodeManager.syncWithNodes(flow.nodes);
                
                const loadedNodeIds = new Set(flow.nodes.map((node: Node) => node.id));
                cleanupViewerItems(loadedNodeIds);
              }
              if (Array.isArray(flow.edges)) onEdgesChange(flow.edges);
              if (flow.viewport) reactFlowInstance.setViewport(flow.viewport);
              
              if (Array.isArray(flow.viewerItems)) {
                const currentNodeIds = new Set(flow.nodes?.map((node: Node) => node.id) || []);
                const validViewerItems = flow.viewerItems.filter((item: any) => 
                  currentNodeIds.has(item.nodeId)
                );
                onViewerItemsChange(validViewerItems);
              } else {
                onViewerItemsChange([]);
              }
              
              console.log('✅ 마지막 워크플로우 자동 로드 완료');
            }
          } catch (error) {
            console.warn('⚠️ 마지막 저장된 파일을 찾을 수 없음:', error);
            await store.delete('lastSavedWorkflow');
          }
        } else {
          console.log('💭 저장된 워크플로우 없음 - 기본 노드로 시작');
        }
      } catch (error) {
        console.error('❌ 자동 로드 실패:', error);
      }
    };

    autoLoadLastWorkflow();
  }, []);

  // 데이터 파이프라인 동기화
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

  // 노드 변경 처리
  const onNodesChangeHandler = useCallback(
    (changes: NodeChange[]) => {
      const deletedNodeIds = changes
        .filter(change => change.type === 'remove')
        .map(change => change.id);

      if (deletedNodeIds.length > 0) {
        console.log('🗑️ Deleting nodes:', deletedNodeIds);
        
        deletedNodeIds.forEach(nodeId => {
          nodeManager.releaseId(nodeId);
        });
        
        const remainingNodeIds = new Set(
          nodes
            .filter(node => !deletedNodeIds.includes(node.id))
            .map(node => node.id)
        );
        
        cleanupViewerItems(remainingNodeIds);
      }

      const updatedNodes = applyNodeChanges(changes, nodes);
      onNodesChange(updatedNodes);
    },
    [nodes, onNodesChange, nodeManager, cleanupViewerItems]
  );

  // 엣지 변경 처리
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
        }
      });
      
      onEdgesChange(updatedEdges);
    },
    [edges, onEdgesChange]
  );

  // 초기화 작업
  useEffect(() => {
    const currentNodeIds = nodes.map(node => parseInt(node.id)).filter(id => !isNaN(id));
    currentNodeIds.forEach(id => {
      nodeManager.registerExistingId(id);
    });
  }, []);

  useEffect(() => {
    return () => {
      nodeManager.clearAllTimers();
    };
  }, [nodeManager]);

  // 히스토리 관리
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
      
      const restoredNodeIds = new Set(stateToRestore.nodes.map((node: Node) => node.id));
      cleanupViewerItems(restoredNodeIds);
    }
  }, [history, historyIndex, onNodesChange, onEdgesChange, nodeManager, cleanupViewerItems]);

  // 선택/복사/붙여넣기 기능
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

  // 키보드 단축키
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

  // 🆕 노드 타입들 동적 로딩 (플러그인 포함) - 최적화된 부분
  const nodeTypes = useMemo(() => {
    const types: any = {};
    
    // 기존 컴파일된 노드들
    Object.entries(nodeModules).forEach(([path, module]: [string, any]) => {
      const fileName = path.split('/').pop()?.replace('.tsx', '');
      if (fileName && module.default) {
        types[fileName.charAt(0).toLowerCase() + fileName.slice(1)] = module.default;
      }
    });
    
    // 🎯 핵심 수정: 플러그인 노드들을 실제 PluginNode 컴포넌트로 연결
    stablePluginNodes.forEach(pluginConfig => {
      types[pluginConfig.type] = PluginNode;
    });
    
    // 🔧 동적 플러그인 노드 매핑: 모든 plugin: 접두사를 가진 노드를 PluginNode로 연결
    const proxyTypes = new Proxy(types, {
      get(target, prop) {
        if (typeof prop === 'string' && prop.startsWith('plugin:')) {
          return PluginNode;
        }
        return target[prop];
      }
    });
    
    console.log('📋 Available node types:', Object.keys(types));
    return proxyTypes;
  }, [stablePluginNodes]); // 안정화된 플러그인 노드 배열 사용

  // 사이드바에서 노드 추가 (플러그인 지원)
  const addNodeFromSidebar = useCallback((nodeType: string) => {
    saveToHistory();
    
    // 플러그인 노드인지 확인
    if (nodeType.startsWith('plugin:')) {
      const pluginId = nodeType.replace('plugin:', '');
      const pluginManager = PluginManager.getInstance();
      const plugin = pluginManager.getPlugin(pluginId);
      
      if (plugin) {
        // 🎯 플러그인 노드 데이터 초기화
        const initialData: any = {
          pluginId: pluginId,
          // 입력 필드들 기본값 설정
          ...plugin.manifest.inputs.reduce((acc, input) => {
            acc[input.id] = '';
            return acc;
          }, {} as any)
        };

        const newNode: Node = {
          id: nodeManager.generateNewId().toString(),
          type: nodeType,
          position: { x: Math.random() * 300 + 200, y: Math.random() * 300 + 150 },
          data: initialData
        };
        
        const updatedNodes = [...nodes, newNode];
        onNodesChange(updatedNodes);
        console.log(`🔌 Added plugin node: ${plugin.manifest.name}`);
        return;
      }
    }
    
    // 기존 컴파일된 노드들 처리
    const nodeConfig: any = Object.values(nodeModules).find(m => (m as any).config?.type === nodeType)?.config;
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

  // 노드 연결
  const onConnect = useCallback(
    (params: Connection | Edge) => {
      saveToHistory();
      const updatedEdges = addEdge(params, edges);
      onEdgesChange(updatedEdges);
    },
    [edges, onEdgesChange, saveToHistory]
  );

  // 워크플로우 저장
  const saveWorkflow = useCallback(async () => {
    try {
      const flow = reactFlowInstance.toObject();
      
      const workflowData = {
        ...flow,
        viewerItems
      };
      
      const result = await invoke('save_workflow_to_desktop', { 
        workflowData: JSON.stringify(workflowData, null, 2) 
      }) as string;

      if (result && typeof result === 'string') {
        try {
          const store = await getAppStore();
          await store.set('lastSavedWorkflow', result);
          console.log(`💾 저장 완료 및 경로 기억: ${result}`);
        } catch (storeError) {
          console.warn('⚠️ Store에 경로 저장 실패:', storeError);
        }
      }
      
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

  // 워크플로우 불러오기
  const loadWorkflow = useCallback(async () => {
    try {
      const workflowData = await invoke('load_workflow_from_desktop') as string;
      if (!workflowData?.trim()) return alert('⚠️ No workflow data to load');
      
      const flow = JSON.parse(workflowData);
      if (!flow || typeof flow !== 'object') throw new Error('Invalid workflow format');
      
      if (Array.isArray(flow.nodes)) {
        onNodesChange(flow.nodes);
        nodeManager.syncWithNodes(flow.nodes);
        
        const loadedNodeIds = new Set(flow.nodes.map((node: Node) => node.id));
        cleanupViewerItems(loadedNodeIds);
      }
      if (Array.isArray(flow.edges)) onEdgesChange(flow.edges);
      if (flow.viewport) reactFlowInstance.setViewport(flow.viewport);
      
      if (Array.isArray(flow.viewerItems)) {
        const currentNodeIds = new Set(flow.nodes?.map((node: Node) => node.id) || []);
        const validViewerItems = flow.viewerItems.filter((item: any) => 
          currentNodeIds.has(item.nodeId)
        );
        onViewerItemsChange(validViewerItems);
        console.log(`✅ Viewer restored: ${validViewerItems.length} items`);
      } else {
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

  // 워크플로우 추가
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

  // 뷰어 페이지로 이동
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
      <Sidebar 
        onAddNode={addNodeFromSidebar} 
        pluginNodes={pluginNodes}
      />
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

          <button onClick={openViewer} className="workspace-button viewer">
            <Eye size={14} />
            Viewer ({viewerItems.length})
          </button>
        </div>
        
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