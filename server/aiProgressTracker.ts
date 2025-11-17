// AI Progress Tracking Service
// Tracks progress of long-running AI operations for real-time user feedback

interface ProgressState {
  operationId: string;
  phase: string;
  percentage: number;
  startTime: number;
  estimatedTimeRemaining: number | null;
  currentStep: string;
  status: 'running' | 'completed' | 'error';
  error?: string;
  // Real-time telemetry for streaming operations
  chunkCount?: number;
  charCount?: number;
  elapsedMs?: number;
  // Contract statistics (FYI for user)
  contractStats?: {
    pageCount?: number;
    wordCount?: number;
    lineCount?: number;
    characterCount?: number;
  };
}

// In-memory store for progress tracking
const progressStore = new Map<string, ProgressState>();

export class AIProgressTracker {
  private operationId: string;
  private startTime: number;
  private phases: Array<{ name: string; weight: number }>;
  private currentPhaseIndex: number = 0;

  constructor(operationId: string, phases: Array<{ name: string; weight: number }>) {
    this.operationId = operationId;
    this.startTime = Date.now();
    this.phases = phases;
    
    // Initialize progress state
    progressStore.set(operationId, {
      operationId,
      phase: phases[0].name,
      percentage: 0,
      startTime: this.startTime,
      estimatedTimeRemaining: null,
      currentStep: phases[0].name,
      status: 'running',
    });
  }

  /**
   * Update progress to a new phase
   * @param phaseIndex - Index of the phase to update to
   * @param customStep - Optional custom step message
   * @param progressWithinPhase - Optional progress within current phase (0-100)
   * @param telemetry - Optional real-time metrics (chunkCount, charCount, elapsedMs)
   * @param contractStats - Optional contract statistics (pageCount, wordCount, etc.)
   */
  updatePhase(
    phaseIndex: number, 
    customStep?: string, 
    progressWithinPhase?: number,
    telemetry?: { chunkCount?: number; charCount?: number; elapsedMs?: number },
    contractStats?: { pageCount?: number; wordCount?: number; lineCount?: number; characterCount?: number }
  ) {
    this.currentPhaseIndex = phaseIndex;
    
    // Calculate overall percentage based on phase weights
    let completedWeight = 0;
    for (let i = 0; i < phaseIndex; i++) {
      completedWeight += this.phases[i].weight;
    }
    
    // Add progress within current phase if provided
    if (progressWithinPhase !== undefined && phaseIndex < this.phases.length) {
      const currentPhaseWeight = this.phases[phaseIndex].weight;
      completedWeight += (currentPhaseWeight * progressWithinPhase) / 100;
    }
    
    const totalWeight = this.phases.reduce((sum, p) => sum + p.weight, 0);
    const percentage = Math.min(Math.floor((completedWeight / totalWeight) * 100), 99);
    
    // Estimate time remaining
    const elapsed = Date.now() - this.startTime;
    const estimatedTotal = percentage > 0 ? (elapsed / percentage) * 100 : null;
    const estimatedTimeRemaining = estimatedTotal ? Math.max(0, estimatedTotal - elapsed) : null;
    
    const state = progressStore.get(this.operationId);
    if (state) {
      state.phase = this.phases[phaseIndex].name;
      state.percentage = percentage;
      state.estimatedTimeRemaining = estimatedTimeRemaining;
      state.currentStep = customStep || this.phases[phaseIndex].name;
      
      // Update telemetry if provided
      if (telemetry) {
        state.chunkCount = telemetry.chunkCount;
        state.charCount = telemetry.charCount;
        state.elapsedMs = telemetry.elapsedMs;
      }
      
      // Update contract statistics if provided
      if (contractStats) {
        state.contractStats = contractStats;
      }
    }
  }

  /**
   * Update progress within current phase
   */
  updateStep(step: string) {
    const state = progressStore.get(this.operationId);
    if (state) {
      state.currentStep = step;
    }
  }

  /**
   * Mark operation as complete
   */
  complete() {
    const state = progressStore.get(this.operationId);
    if (state) {
      state.percentage = 100;
      state.status = 'completed';
      state.estimatedTimeRemaining = 0;
      state.currentStep = 'Complete';
    }
    
    // Auto-cleanup after 30 seconds
    setTimeout(() => {
      progressStore.delete(this.operationId);
    }, 30000);
  }

  /**
   * Mark operation as failed
   */
  error(errorMessage: string) {
    const state = progressStore.get(this.operationId);
    if (state) {
      state.status = 'error';
      state.error = errorMessage;
    }
    
    // Auto-cleanup after 60 seconds
    setTimeout(() => {
      progressStore.delete(this.operationId);
    }, 60000);
  }

  /**
   * Get current progress state
   */
  static getProgress(operationId: string): ProgressState | null {
    return progressStore.get(operationId) || null;
  }

  /**
   * Clean up completed or old operations
   */
  static cleanup(operationId: string) {
    progressStore.delete(operationId);
  }
}
