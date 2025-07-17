/**
 * 액티브 타겟 시스템 - 드래그앤드랍 타겟 관리
 * 
 * 🎯 목적: 여러 FilePathNode 중 마우스 호버된 노드만 파일을 받도록 제어
 * 
 * 동작 방식:
 * 1. 마우스 호버 시 해당 노드를 활성 타겟으로 설정
 * 2. 드롭 이벤트 발생 시 활성 타겟에만 파일 전달
 * 3. 마우스 떠날 때 활성 타겟 해제
 */

class DropTargetManager {
  private static instance: DropTargetManager;
  private activeTarget: string | null = null;
  private dropCallbacks: Map<string, (files: string[]) => void> = new Map();
  private isListenerSetup: boolean = false;
  private isDragActive: boolean = false;
  private lastDropTime: number = 0;

  private constructor() {}

  static getInstance(): DropTargetManager {
    if (!DropTargetManager.instance) {
      DropTargetManager.instance = new DropTargetManager();
    }
    return DropTargetManager.instance;
  }

  /**
   * 드롭 콜백 등록 (노드 마운트 시)
   */
  registerDropCallback(nodeId: string, callback: (files: string[]) => void): void {
    this.dropCallbacks.set(nodeId, callback);
    console.log(`🎯 DropTargetManager: Registered callback for node ${nodeId}`);
    
    // 첫 번째 노드 등록 시에만 전역 리스너 설정
    if (!this.isListenerSetup) {
      this.setupGlobalListeners();
      this.isListenerSetup = true;
    }
  }

  /**
   * 드롭 콜백 해제 (노드 언마운트 시)
   */
  unregisterDropCallback(nodeId: string): void {
    this.dropCallbacks.delete(nodeId);
    if (this.activeTarget === nodeId) {
      this.activeTarget = null;
    }
    console.log(`🎯 DropTargetManager: Unregistered callback for node ${nodeId}`);
  }

  /**
   * 활성 타겟 설정 (마우스 호버 시)
   */
  setActiveTarget(nodeId: string): void {
    if (this.activeTarget !== nodeId) {
      this.activeTarget = nodeId;
      console.log(`🎯 DropTargetManager: Active target → ${nodeId}`);
    }
  }

  /**
   * 활성 타겟 해제 (마우스 떠날 때)
   */
  clearActiveTarget(nodeId: string): void {
    if (this.activeTarget === nodeId && !this.isDragActive) {
      this.activeTarget = null;
      console.log(`🎯 DropTargetManager: Active target cleared`);
    }
  }

  /**
   * 현재 활성 타겟 조회
   */
  getActiveTarget(): string | null {
    return this.activeTarget;
  }

  /**
   * 파일 드롭 처리 (전역 이벤트에서 호출)
   */
  handleFileDrop(files: string[]): boolean {
    // 🎯 중복 드롭 방지 (500ms 내 중복 무시)
    const currentTime = Date.now();
    if (currentTime - this.lastDropTime < 500) {
      console.log('🎯 DropTargetManager: Duplicate drop ignored');
      return false;
    }
    this.lastDropTime = currentTime;
    
    // 🎯 드래그 상태 해제
    this.isDragActive = false;
    
    if (!this.activeTarget) {
      // 🎯 액티브 타겟이 없으면 첫 번째 노드에 전달
      console.log('🎯 DropTargetManager: No active target, using fallback');
      
      const firstNodeId = Array.from(this.dropCallbacks.keys())[0];
      if (firstNodeId) {
        const callback = this.dropCallbacks.get(firstNodeId);
        if (callback) {
          console.log(`🎯 DropTargetManager: Fallback → Node ${firstNodeId}:`, files);
          callback(files);
          return true;
        }
      }
      
      console.log('🎯 DropTargetManager: No nodes available');
      return false;
    }

    const callback = this.dropCallbacks.get(this.activeTarget);
    if (!callback) {
      console.log(`🎯 DropTargetManager: No callback for ${this.activeTarget}`);
      return false;
    }

    console.log(`🎯 DropTargetManager: Delivering → Node ${this.activeTarget}:`, files);
    callback(files);
    
    return true;
  }

  /**
   * 드래그 상태 설정 (hover 이벤트에서 호출)
   */
  setDragActive(active: boolean): void {
    this.isDragActive = active;
    console.log(`🎯 DropTargetManager: Drag active state set to ${active}`);
  }

  /**
   * 전역 Tauri 드랍 리스너 설정 (한 번만 실행)
   */
  private async setupGlobalListeners(): Promise<void> {
    try {
      console.log('🎯 DropTargetManager: Setting up global listeners...');
      
      // 방법 1: getCurrentWebview 방식 시도
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        
        await getCurrentWebview().onDragDropEvent((event) => {
          console.log('🎯 DropTargetManager: Global webview drag-drop event');
          
          if (event.payload && Array.isArray(event.payload.paths)) {
            const droppedPaths = event.payload.paths as string[];
            this.handleFileDrop(droppedPaths);
          }
        });
        
        console.log('✅ DropTargetManager: Global webview listener setup complete');
        return;
        
      } catch (webviewError) {
        console.log('💡 DropTargetManager: Webview method failed, trying classic method...');
      }
      
      // 방법 2: 클래식 이벤트 방식
      const { listen } = await import('@tauri-apps/api/event');
      
      await listen('tauri://file-drop', (event) => {
        console.log('🎯 DropTargetManager: Global classic file-drop event');
        
        if (event.payload && Array.isArray(event.payload)) {
          const droppedPaths = event.payload as string[];
          this.handleFileDrop(droppedPaths);
        }
      });

      await listen('tauri://file-drop-hover', (event) => {
        console.log('🎯 DropTargetManager: Global file-drop-hover event');
        this.setDragActive(true);
      });

      await listen('tauri://file-drop-cancelled', (event) => {
        console.log('🎯 DropTargetManager: Global file-drop-cancelled event');
        this.setDragActive(false);
      });
      
      console.log('✅ DropTargetManager: Global classic listener setup complete');
      
    } catch (error) {
      console.error('❌ DropTargetManager: Failed to setup global listeners:', error);
    }
  }

  /**
   * 현재 상태 디버깅 정보
   */
  getDebugInfo(): { activeTarget: string | null; registeredCallbacks: string[] } {
    return {
      activeTarget: this.activeTarget,
      registeredCallbacks: Array.from(this.dropCallbacks.keys())
    };
  }
}

export default DropTargetManager;