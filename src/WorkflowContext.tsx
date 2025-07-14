import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { Edge, Node } from '@xyflow/react';

// 중앙 타입 정의 import
import type { 
  WorkflowContextType,
  WorkflowProviderProps,
  BaseNodeData,
  ViewerNodeItem,
  ViewerActions
} from './types';

// Context 생성 (기본값 정의)
const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

/**
 * WorkflowProvider (뷰어 기능 추가)
 * 역할: 워크플로우 전체에서 공유되어야 할 상태와 함수들을 제공합니다.
 * ✅ 변경사항: 뷰어 관련 상태와 함수들을 추가하여 노드 뷰어 기능을 지원합니다.
 */
export function WorkflowProvider({ 
  children, 
  nodes, 
  edges, 
  updateNodeData,
  onExecuteNextNodes,
  // 🆕 뷰어 관련 props
  viewerItems,
  onViewerItemsChange
}: WorkflowProviderProps) {
  
  // 🆕 뷰어 관련 함수들을 메모이제이션으로 최적화
  const viewerActions: ViewerActions = useMemo(() => ({
    
    // 뷰어에 노드 추가
    addToViewer: (nodeId: string, nodeType: string, nodeTitle: string) => {
      // 중복 추가 방지
      const isAlreadyAdded = viewerItems.some(item => item.nodeId === nodeId);
      if (isAlreadyAdded) {
        console.warn(`⚠️ Node ${nodeId} is already in viewer`);
        return;
      }
      
      const newItem: ViewerNodeItem = {
        nodeId,
        nodeType,
        nodeTitle,
        addedAt: Date.now()
      };
      
      const updatedItems = [...viewerItems, newItem];
      onViewerItemsChange(updatedItems);
      console.log(`✅ Node ${nodeId} (${nodeTitle}) added to viewer`);
    },
    
    // 뷰어에서 노드 제거
    removeFromViewer: (nodeId: string) => {
      const updatedItems = viewerItems.filter(item => item.nodeId !== nodeId);
      onViewerItemsChange(updatedItems);
      console.log(`🗑️ Node ${nodeId} removed from viewer`);
    },
    
    // 노드가 뷰어에 있는지 확인
    isInViewer: (nodeId: string): boolean => {
      return viewerItems.some(item => item.nodeId === nodeId);
    },
    
    // 뷰어 목록 전체 삭제
    clearViewer: () => {
      onViewerItemsChange([]);
      console.log(`🧹 Viewer cleared (${viewerItems.length} items removed)`);
    },
    
    // 뷰어 목록 반환
    getViewerItems: (): ViewerNodeItem[] => {
      return [...viewerItems]; // 복사본 반환으로 안전성 확보
    },
    
    // 🆕 뷰어 노드의 커스텀 라벨 업데이트
    updateViewerLabel: (nodeId: string, customLabel: string) => {
      const updatedItems = viewerItems.map(item => {
        if (item.nodeId === nodeId) {
          return {
            ...item,
            customLabel: customLabel.trim() || undefined // 빈 문자열이면 undefined로 설정
          };
        }
        return item;
      });
      
      // 실제로 변경된 경우에만 상태 업데이트
      const hasChanged = updatedItems.some((item, index) => {
        const originalItem = viewerItems[index];
        return originalItem && (
          item.customLabel !== originalItem.customLabel ||
          item.nodeId !== originalItem.nodeId
        );
      });
      
      if (hasChanged) {
        onViewerItemsChange(updatedItems);
        console.log(`🏷️ Node ${nodeId} label updated to: "${customLabel || '(default)'}"`);
      }
    }
    
  }), [viewerItems, onViewerItemsChange]);

  // 기존 Context 값과 뷰어 기능을 통합
  const contextValue = useMemo(() => ({
    allNodes: nodes,
    allEdges: edges,
    updateNodeData,
    executeNextNodes: onExecuteNextNodes,
    // 🆕 뷰어 관련 함수들
    viewerActions
  }), [nodes, edges, updateNodeData, onExecuteNextNodes, viewerActions]);

  return (
    <WorkflowContext.Provider value={contextValue}>
      {children}
    </WorkflowContext.Provider>
  );
}

/**
 * useWorkflow (Custom Hook) - 기존 기능 유지
 * 역할: 하위 컴포넌트에서 쉽게 WorkflowContext의 값들을 사용할 수 있게 합니다.
 */
export function useWorkflow(): WorkflowContextType {
  const context = useContext(WorkflowContext);
  if (context === undefined) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }
  return context;
}

/**
 * 🆕 useViewer (Custom Hook)
 * 역할: 뷰어 관련 기능만 필요한 컴포넌트에서 사용하는 편의 훅
 */
export function useViewer() {
  const { viewerActions } = useWorkflow();
  return viewerActions;
}

/**
 * 🆕 useViewerStatus (Custom Hook)
 * 역할: 특정 노드의 뷰어 상태만 확인하는 최적화된 훅
 */
export function useViewerStatus(nodeId: string): {
  isInViewer: boolean;
  addToViewer: (nodeType: string, nodeTitle: string) => void;
  removeFromViewer: () => void;
  updateLabel: (customLabel: string) => void; // 🆕 라벨 업데이트 함수 추가
} {
  const { viewerActions } = useWorkflow();
  
  // 해당 노드의 뷰어 상태를 메모이제이션
  const isInViewer = useMemo(() => 
    viewerActions.isInViewer(nodeId), 
    [viewerActions, nodeId]
  );
  
  // 노드별 뷰어 조작 함수를 메모이제이션
  const addToViewer = useCallback((nodeType: string, nodeTitle: string) => {
    viewerActions.addToViewer(nodeId, nodeType, nodeTitle);
  }, [viewerActions, nodeId]);
  
  const removeFromViewer = useCallback(() => {
    viewerActions.removeFromViewer(nodeId);
  }, [viewerActions, nodeId]);
  
  // 🆕 라벨 업데이트 함수
  const updateLabel = useCallback((customLabel: string) => {
    viewerActions.updateViewerLabel(nodeId, customLabel);
  }, [viewerActions, nodeId]);
  
  return {
    isInViewer,
    addToViewer,
    removeFromViewer,
    updateLabel // 🆕 추가
  };
}

/**
 * useHandleConnection (Custom Hook) - 기존 기능 유지
 * 역할: 특정 입력 핸들의 연결 상태를 확인합니다.
 * 중요: 출력 핸들 연결은 입력 필드 비활성화에 영향을 주지 않습니다.
 * 
 * 수정사항 (2025-07-01):
 * - 기존: 입력과 출력 핸들을 모두 체크하여 잘못된 비활성화 발생
 * - 수정: 입력 핸들(target)만 체크하여 정확한 비활성화 적용
 */
export function useHandleConnection(nodeId: string, handleId: string): boolean {
  const { allEdges } = useWorkflow();
  
  return useMemo(() => 
    allEdges.some(edge => 
      edge.target === nodeId && edge.targetHandle === handleId
    ), 
    [allEdges, nodeId, handleId]
  );
}