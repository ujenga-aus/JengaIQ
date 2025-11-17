// In-memory progress tracking for letter generation
interface ProgressState {
  stage: string;
  progress: number; // 0-100
  timestamp: Date;
  completed: boolean;
  error?: string;
}

const progressMap = new Map<string, ProgressState>();

// Clean up old progress entries (older than 5 minutes)
setInterval(() => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const keysToDelete: string[] = [];
  progressMap.forEach((state, sessionId) => {
    if (state.timestamp < fiveMinutesAgo) {
      keysToDelete.push(sessionId);
    }
  });
  keysToDelete.forEach(key => progressMap.delete(key));
}, 60 * 1000); // Run every minute

export function updateProgress(sessionId: string, stage: string, progress: number) {
  progressMap.set(sessionId, {
    stage,
    progress,
    timestamp: new Date(),
    completed: false,
  });
}

export function completeProgress(sessionId: string) {
  const current = progressMap.get(sessionId);
  if (current) {
    progressMap.set(sessionId, {
      ...current,
      progress: 100,
      completed: true,
      timestamp: new Date(),
    });
  }
}

export function errorProgress(sessionId: string, error: string) {
  const current = progressMap.get(sessionId);
  if (current) {
    progressMap.set(sessionId, {
      ...current,
      completed: true,
      error,
      timestamp: new Date(),
    });
  }
}

export function getProgress(sessionId: string): ProgressState | null {
  return progressMap.get(sessionId) || null;
}

export function clearProgress(sessionId: string) {
  progressMap.delete(sessionId);
}
