interface XERTask {
  taskId: string;
  taskCode: string;
  taskName: string;
  duration: number | null;
  totalFloat: number | null;
  cstrType?: string;
  cstrDate?: string;
}

interface XERRelationship {
  predTaskId: string;
  taskId: string;
}

interface InsightDetail {
  type: string;
  severity: "info" | "warn" | "error";
  message: string;
  ref?: Record<string, unknown>;
}

export interface ScheduleInsights {
  score: number;
  summary: string;
  details: {
    openEnds: InsightDetail[];
    longDurations: InsightDetail[];
    hardConstraints: InsightDetail[];
    missingLogic: InsightDetail[];
    criticalPathAnalysis: InsightDetail[];
  };
}

export function computeScheduleInsights(xerData: any): ScheduleInsights {
  const tasks: XERTask[] = xerData?.tasks || [];
  const relationships: XERRelationship[] = xerData?.relationships || [];

  // Build predecessor/successor maps
  const successorsByPred = new Map<string, string[]>();
  const predecessorsByTask = new Map<string, string[]>();

  for (const rel of relationships) {
    const pred = rel.predTaskId;
    const succ = rel.taskId;
    
    if (!successorsByPred.has(pred)) successorsByPred.set(pred, []);
    if (!predecessorsByTask.has(succ)) predecessorsByTask.set(succ, []);
    
    successorsByPred.get(pred)!.push(succ);
    predecessorsByTask.get(succ)!.push(pred);
  }

  const openEnds: InsightDetail[] = [];
  const longDurations: InsightDetail[] = [];
  const hardConstraints: InsightDetail[] = [];
  const missingLogic: InsightDetail[] = [];
  const criticalPathAnalysis: InsightDetail[] = [];

  // Analyze each task
  for (const task of tasks) {
    const id = task.taskId;
    const name = task.taskName || task.taskCode || id;
    const durationHours = task.duration || 0;

    // Check for open starts (no predecessors)
    if (!predecessorsByTask.has(id) || predecessorsByTask.get(id)!.length === 0) {
      openEnds.push({
        type: "openStart",
        severity: "warn",
        message: `Activity "${name}" has no predecessors (open start)`,
        ref: { taskId: id, taskCode: task.taskCode },
      });
    }

    // Check for open finishes (no successors)
    if (!successorsByPred.has(id) || successorsByPred.get(id)!.length === 0) {
      openEnds.push({
        type: "openFinish",
        severity: "warn",
        message: `Activity "${name}" has no successors (open finish)`,
        ref: { taskId: id, taskCode: task.taskCode },
      });
    }

    // Check for long durations (> 20 working days)
    if (durationHours > 8 * 20) {
      const days = Math.round(durationHours / 8);
      longDurations.push({
        type: "longDuration",
        severity: "warn",
        message: `Activity "${name}" has long duration (~${days} working days). Consider breaking down.`,
        ref: { taskId: id, taskCode: task.taskCode, hours: durationHours },
      });
    }

    // Check for hard constraints
    const ctype = task.cstrType;
    if (ctype && ["CS", "CF", "MS", "MF", "SNET", "FNLT"].includes(ctype)) {
      hardConstraints.push({
        type: "hardConstraint",
        severity: "error",
        message: `Hard constraint (${getConstraintLabel(ctype)}) on "${name}"`,
        ref: { taskId: id, taskCode: task.taskCode, constraintType: ctype, constraintDate: task.cstrDate },
      });
    }

    // Check for completely unlinked tasks
    const hasPreds = predecessorsByTask.has(id) && predecessorsByTask.get(id)!.length > 0;
    const hasSuccs = successorsByPred.has(id) && successorsByPred.get(id)!.length > 0;
    
    if (!hasPreds && !hasSuccs) {
      missingLogic.push({
        type: "noLogic",
        severity: "error",
        message: `Activity "${name}" is completely unlinked (no predecessors or successors)`,
        ref: { taskId: id, taskCode: task.taskCode },
      });
    }

    // Critical path analysis (total float <= 0, but only for tasks with actual float values)
    if (task.totalFloat !== null && task.totalFloat !== undefined && task.totalFloat <= 0) {
      criticalPathAnalysis.push({
        type: "criticalPath",
        severity: "info",
        message: `Activity "${name}" is on the critical path (TF: ${task.totalFloat})`,
        ref: { taskId: id, taskCode: task.taskCode, totalFloat: task.totalFloat },
      });
    }
  }

  // Calculate quality score (0-100)
  let score = 100;
  score -= openEnds.length * 1;
  score -= longDurations.length * 1;
  score -= hardConstraints.length * 3;
  score -= missingLogic.length * 2;
  if (score < 0) score = 0;

  const criticalCount = criticalPathAnalysis.length;
  const summary = `Quality Score: ${score}/100 | Open Ends: ${openEnds.length} | Long Durations: ${longDurations.length} | Hard Constraints: ${hardConstraints.length} | Unlinked: ${missingLogic.length} | Critical Path: ${criticalCount} activities`;

  return {
    score,
    summary,
    details: {
      openEnds,
      longDurations,
      hardConstraints,
      missingLogic,
      criticalPathAnalysis,
    },
  };
}

function getConstraintLabel(code: string): string {
  const labels: Record<string, string> = {
    CS: "Start On (Must Start On)",
    CF: "Finish On (Must Finish On)",
    MS: "Start On or After (Mandatory Start)",
    MF: "Finish On or Before (Mandatory Finish)",
    SNET: "Start No Earlier Than",
    FNLT: "Finish No Later Than",
  };
  return labels[code] || code;
}
