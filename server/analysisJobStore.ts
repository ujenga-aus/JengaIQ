/**
 * In-memory store for tracking AI analysis job progress
 */

export interface AnalysisJob {
  jobId: string;
  revisionId: string;
  projectId: string;
  personId?: string; // User who initiated the analysis
  status: 'pending' | 'running' | 'completed' | 'failed';
  current: number;
  total: number;
  analyzedCount: number;
  errorCount: number;
  errors: Array<{ rowIndex: number; message: string }>;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number;
  aiGeneratedCellIds: string[];
  startTime: number;
  endTime?: number;
  error?: string;
}

class AnalysisJobStore {
  private jobs = new Map<string, AnalysisJob>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly COMPLETED_TTL = 15 * 60 * 1000; // 15 minutes
  private readonly FAILED_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.startCleanupTimer();
  }

  private startCleanupTimer() {
    // Clean up old jobs every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const entries = Array.from(this.jobs.entries());
      for (const [jobId, job] of entries) {
        if (!job.endTime) continue;

        const age = now - job.endTime;
        const ttl = job.status === 'failed' ? this.FAILED_TTL : this.COMPLETED_TTL;

        if (age > ttl) {
          console.log(`[JobStore] Cleaning up old job ${jobId} (status: ${job.status}, age: ${Math.round(age / 1000)}s)`);
          this.jobs.delete(jobId);
        }
      }
    }, 60 * 1000);
  }

  createJob(revisionId: string, projectId: string, total: number, personId?: string): AnalysisJob {
    const jobId = `${revisionId}-${Date.now()}`;
    const job: AnalysisJob = {
      jobId,
      revisionId,
      projectId,
      personId,
      status: 'pending',
      current: 0,
      total,
      analyzedCount: 0,
      errorCount: 0,
      errors: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedCost: 0,
      aiGeneratedCellIds: [],
      startTime: Date.now(),
    };

    this.jobs.set(jobId, job);
    console.log(`[JobStore] Created job ${jobId} for revision ${revisionId}${personId ? ` (user: ${personId})` : ''}`);
    return job;
  }

  getJob(jobId: string): AnalysisJob | undefined {
    return this.jobs.get(jobId);
  }

  updateProgress(jobId: string, current: number) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    job.current = current;
    job.status = 'running';
  }

  addSuccess(jobId: string, rowIndex: number, cellIds: string[]) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.analyzedCount++;
    job.aiGeneratedCellIds.push(...cellIds);
  }

  addError(jobId: string, rowIndex: number, message: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.errorCount++;
    job.errors.push({ rowIndex, message });
  }

  addTokens(jobId: string, inputTokens: number, outputTokens: number) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.totalInputTokens += inputTokens;
    job.totalOutputTokens += outputTokens;
    
    // Calculate cost (GPT-4o pricing)
    const inputCost = (job.totalInputTokens / 1_000_000) * 2.50;
    const outputCost = (job.totalOutputTokens / 1_000_000) * 10.00;
    job.estimatedCost = inputCost + outputCost;
  }

  completeJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'completed';
    job.endTime = Date.now();
    console.log(`[JobStore] Job ${jobId} completed: ${job.analyzedCount} analyzed, ${job.errorCount} errors`);
  }

  failJob(jobId: string, error: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'failed';
    job.error = error;
    job.endTime = Date.now();
    console.log(`[JobStore] Job ${jobId} failed: ${error}`);
  }

  cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.jobs.clear();
  }
}

export const analysisJobStore = new AnalysisJobStore();
