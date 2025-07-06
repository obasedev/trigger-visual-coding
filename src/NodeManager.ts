/**
 * NodeManager.ts - 매우 간단한 노드 ID 관리 + 타이머 관리 (버그 수정 버전)
 * 역할: 오직 ID 생성과 재활용 + 타이머 정리!
 * 철학: "복잡하지 않게, 한 가지만 잘하자"
 * 🔧 수정: ID 중복 등록 방지, 재활용 풀 정리, 상태 동기화 개선
 */

class NodeManager {
  private counter: number = 1;
  private recycledIds: string[] = [];
  private usedIds: Set<string> = new Set();
  
  // 🆕 타이머 관리 추가
  private activeTimers: Set<number> = new Set();
  
  constructor() {
    console.log('🎯 NodeManager 초기화 (버그 수정 버전)');
  }

  /**
   * 새 노드 ID 생성 (재활용 우선, 중복 방지)
   */
  public generateNewId(): number {
    let newId: number;
    
    // 🔧 수정: 재활용 ID 검증 후 사용
    while (this.recycledIds.length > 0) {
      const recycledIdStr = this.recycledIds.pop()!;
      const recycledId = parseInt(recycledIdStr);
      
      // 🎯 핵심 수정: 재활용 ID가 현재 사용 중이 아닌 경우에만 사용
      if (!this.usedIds.has(recycledIdStr)) {
        newId = recycledId;
        this.usedIds.add(recycledIdStr);
        console.log(`♻️ ID 재활용: ${newId} (검증 완료)`);
        return newId;
      } else {
        console.log(`⚠️ ID ${recycledId} 재활용 건너뜀 (이미 사용 중)`);
      }
    }
    
    // 재활용 가능한 ID가 없으면 새로 생성
    newId = this.counter;
    this.counter++;
    console.log(`🆕 새 ID 생성: ${newId}`);
    
    this.usedIds.add(newId.toString());
    return newId;
  }

  /**
   * 🔧 수정: 기존 ID를 NodeManager에 등록 (중복 방지)
   */
  public registerExistingId(id: number): void {
    const idStr = id.toString();
    
    // 🎯 핵심 수정: 이미 등록된 ID는 건너뛰기
    if (this.usedIds.has(idStr)) {
      console.log(`⚠️ ID ${id}는 이미 등록됨 - 건너뛰기`);
      return;
    }
    
    this.usedIds.add(idStr);
    
    // 🔧 수정: 재활용 풀에서 해당 ID 제거 (중복 방지)
    this.recycledIds = this.recycledIds.filter(recycledId => recycledId !== idStr);
    
    // counter를 최대값+1로 업데이트
    if (id >= this.counter) {
      this.counter = id + 1;
      console.log(`📈 Counter 업데이트: ${this.counter}`);
    }
    
    console.log(`📝 기존 ID 등록: ${id}`);
  }

  /**
   * 🔧 수정: 여러 기존 ID들을 한번에 등록 (중복 제거)
   */
  public registerExistingIds(ids: number[]): void {
    // 🎯 핵심 수정: 중복 제거 후 등록
    const uniqueIds = [...new Set(ids)].sort((a, b) => a - b);
    console.log(`📝 ${uniqueIds.length}개 고유 ID 등록 중...`);
    
    uniqueIds.forEach(id => {
      this.registerExistingId(id);
    });
    
    this.debugStatus();
  }

  /**
   * 🔧 수정: 노드 배열과 NodeManager 상태 동기화 (완전 재설정)
   */
  public syncWithNodes(nodes: any[]): void {
    console.log(`🔄 ${nodes.length}개 노드와 동기화 중...`);
    
    // 🎯 핵심 수정: 완전히 상태 초기화
    this.usedIds.clear();
    this.recycledIds = [];
    this.counter = 1;
    
    // 현재 노드들의 ID 수집
    const currentNodeIds: number[] = [];
    nodes.forEach(node => {
      const numericId = parseInt(node.id);
      if (!isNaN(numericId)) {
        currentNodeIds.push(numericId);
      }
    });
    
    // 🔧 수정: 중복 제거 후 등록
    if (currentNodeIds.length > 0) {
      this.registerExistingIds(currentNodeIds);
    }
    
    console.log(`✅ 동기화 완료: ${currentNodeIds.length}개 ID 등록`);
  }

  /**
   * 🔧 수정: ID 반납 (중복 방지)
   */
  public releaseId(id: string | number): void {
    const idStr = typeof id === 'number' ? id.toString() : id;
    
    // 🎯 핵심 수정: 사용 중인 ID만 반납 가능
    if (!this.usedIds.has(idStr)) {
      console.warn(`⚠️ ID ${idStr}는 사용 중이 아님 - 반납 건너뛰기`);
      return;
    }
    
    // 🔧 수정: 중복 방지 - 이미 재활용 풀에 있는지 확인
    if (this.recycledIds.includes(idStr)) {
      console.warn(`⚠️ ID ${idStr}는 이미 재활용 풀에 있음 - 건너뛰기`);
      return;
    }
    
    this.usedIds.delete(idStr);
    this.recycledIds.push(idStr);
    
    console.log(`🗑️ ID 반납: ${idStr} (재활용 풀: ${this.recycledIds.length}개)`);
  }

  /**
   * 🔧 수정: 여러 ID들을 한번에 반납 (중복 방지)
   */
  public releaseIds(ids: (string | number)[]): void {
    console.log(`🗑️ ${ids.length}개 ID 반납 중...`);
    
    ids.forEach(id => {
      this.releaseId(id);
    });
    
    this.debugStatus();
  }

  // 🆕 타이머 관리 기능들 (기존과 동일)
  
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
   * 🆕 재활용 풀 정리 (유효하지 않은 ID 제거)
   */
  public cleanRecycledPool(): void {
    const beforeSize = this.recycledIds.length;
    
    // 🔧 현재 사용 중인 ID는 재활용 풀에서 제거
    this.recycledIds = this.recycledIds.filter(id => !this.usedIds.has(id));
    
    const afterSize = this.recycledIds.length;
    if (beforeSize !== afterSize) {
      console.log(`🧹 재활용 풀 정리: ${beforeSize} → ${afterSize}개`);
    }
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
    // 🆕 상태 확인 시 재활용 풀 자동 정리
    this.cleanRecycledPool();
    
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