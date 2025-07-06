import React, { createContext, useContext } from 'react';

/**
 * ViewerContext.tsx - 뷰어 모드 감지를 위한 Context
 * 역할: 현재 노드가 뷰어에서 렌더링되고 있는지 워크스페이스에서 렌더링되고 있는지 구분
 * 목적: 뷰어에서만 Handle 컴포넌트를 제거하여 Handle 에러 해결
 */

// ViewerContext 생성 - 기본값은 false (워크스페이스)
const ViewerContext = createContext<boolean>(false);

/**
 * ViewerProvider - 뷰어 모드임을 알려주는 Provider
 */
interface ViewerProviderProps {
  children: React.ReactNode;
  isViewer?: boolean;
}

export function ViewerProvider({ children, isViewer = false }: ViewerProviderProps) {
  return (
    <ViewerContext.Provider value={isViewer}>
      {children}
    </ViewerContext.Provider>
  );
}

/**
 * useViewer - 현재 뷰어 모드인지 확인하는 Hook
 * @returns boolean - true면 뷰어, false면 워크스페이스
 */
export function useViewer(): boolean {
  return useContext(ViewerContext);
}

/**
 * useIsWorkspace - 현재 워크스페이스 모드인지 확인하는 Hook (편의용)
 * @returns boolean - true면 워크스페이스, false면 뷰어
 */
export function useIsWorkspace(): boolean {
  return !useContext(ViewerContext);
}

export default ViewerContext;