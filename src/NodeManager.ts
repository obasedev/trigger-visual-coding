/**
 * NodeManager.ts - 매우 간단한 노드 ID 관리 + 타이머 관리
 * 역할: 오직 ID 생성과 재활용 + 타이머 정리!
 * 철학: "복잡하지 않게, 한 가지만 잘하자"
 */

class NodeManager {
  private counter: number = 1;
  private recycledIds: string[] = [];
  private usedIds: Set<string> = new Set();
  
  // 🆕 타이머 관리 추가
  private activeTimers: Set<number> = new Set();
  
  constructor() {
    console.log('🎯 NodeManager 초기화 (간단 버전 + 타이머 관리)');
  }

  /**
   * 새 노드 ID 생성 (재활용 우선)
   */
  public generateNewId(): number {
    let newId: number;
    
    // 재활용 ID가 있으면 우선 사용
    if (this.recycledIds.length > 0) {
      const recycledId = this.recycledIds.pop()!;
      newId = parseInt(recycledId);
      console.log(`♻️ ID 재활용: ${newId}`);
    } else {
      // 없으면 새로 생성
      newId = this.counter;
      this.counter++;
      console.log(`🆕 새 ID 생성: ${newId}`);
    }
    
    this.usedIds.add(newId.toString());
    return newId;
  }

  /**
   * 🆕 기존 ID를 NodeManager에 등록 (초기화시 사용)
   */
  public registerExistingId(id: number): void {
    const idStr = id.toString();
    
    if (this.usedIds.has(idStr)) {
      console.log(`⚠️ ID ${id}는 이미 등록됨`);
      return;
    }
    
    this.usedIds.add(idStr);
    
    // counter를 최대값+1로 업데이트
    if (id >= this.counter) {
      this.counter = id + 1;
      console.log(`📈 Counter 업데이트: ${this.counter}`);
    }
    
    console.log(`📝 기존 ID 등록: ${id}`);
  }

  /**
   * 🆕 여러 기존 ID들을 한번에 등록
   */
  public registerExistingIds(ids: number[]): void {
    console.log(`📝 ${ids.length}개 기존 ID 등록 중...`);
    
    ids.forEach(id => {
      this.registerExistingId(id);
    });
    
    this.debugStatus();
  }

  /**
   * 🆕 노드 배열과 NodeManager 상태 동기화
   */
  public syncWithNodes(nodes: any[]): void {
    console.log(`🔄 ${nodes.length}개 노드와 동기화 중...`);
    
    // 기존 상태 초기화
    this.usedIds.clear();
    this.recycledIds = [];
    this.counter = 1;
    
    // 노드들의 ID 수집 및 등록
    const nodeIds: number[] = [];
    nodes.forEach(node => {
      const numericId = parseInt(node.id);
      if (!isNaN(numericId)) {
        nodeIds.push(numericId);
      }
    });
    
    // ID들을 정렬해서 순서대로 등록
    nodeIds.sort((a, b) => a - b);
    this.registerExistingIds(nodeIds);
    
    console.log(`✅ 동기화 완료: ${nodeIds.length}개 ID 등록`);
  }

  /**
   * ID 반납 (재활용 풀에 추가)
   */
  public releaseId(id: string | number): void {
    const idStr = typeof id === 'number' ? id.toString() : id;
    
    if (!this.usedIds.has(idStr)) {
      console.warn(`⚠️ 이미 반납된 ID: ${idStr}`);
      return;
    }
    
    this.usedIds.delete(idStr);
    this.recycledIds.push(idStr);
    
    console.log(`🗑️ ID 반납: ${idStr} (재활용 풀: ${this.recycledIds.length}개)`);
  }

  /**
   * 🆕 여러 ID들을 한번에 반납
   */
  public releaseIds(ids: (string | number)[]): void {
    console.log(`🗑️ ${ids.length}개 ID 반납 중...`);
    
    ids.forEach(id => {
      this.releaseId(id);
    });
    
    this.debugStatus();
  }

  // 🆕 타이머 관리 기능들
  
  /**
   * 타이머 등록 (메모리 누수 방지)
   */
  public registerTimer(timerId: number): void {
    this.activeTimers.add(timerId);
  }

  /**
   * 타이머 정리
   */
  public clearTimer(timerId: number): void {
    if (this.activeTimers.has(timerId)) {
      clearTimeout(timerId);
      this.activeTimers.delete(timerId);
    }
  }

  /**
   * 모든 타이머 정리 (앱 종료시 호출)
   */
  public clearAllTimers(): void {
    console.log(`🧹 ${this.activeTimers.size}개 타이머 정리 중...`);
    
    this.activeTimers.forEach(timerId => {
      clearTimeout(timerId);
    });
    this.activeTimers.clear();
    
    console.log('✅ 모든 타이머 정리 완료');
  }

  /**
   * 현재 상태 확인 (디버깅용)
   */
  public getStatus(): { 
    used: number; 
    recycled: number; 
    nextNew: number; 
    activeTimers: number;
    usedIds: string[];
    recycledIds: string[];
  } {
    return {
      used: this.usedIds.size,
      recycled: this.recycledIds.length,
      nextNew: this.counter,
      activeTimers: this.activeTimers.size,
      usedIds: Array.from(this.usedIds).sort((a, b) => parseInt(a) - parseInt(b)),
      recycledIds: [...this.recycledIds].sort((a, b) => parseInt(a) - parseInt(b))
    };
  }

  /**
   * 상태 출력
   */
  public debugStatus(): void {
    const status = this.getStatus();
    console.log('📊 NodeManager 상태:', status);
  }
}

// 싱글톤 패턴 (앱에서 하나만 사용)
let nodeManagerInstance: NodeManager | null = null;

export const getNodeManager = (): NodeManager => {
  if (!nodeManagerInstance) {
    nodeManagerInstance = new NodeManager();
  }
  return nodeManagerInstance;
};

// 개발 모드에서 브라우저 콘솔에서 접근 가능
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).nodeManager = getNodeManager();
}

export default NodeManager;