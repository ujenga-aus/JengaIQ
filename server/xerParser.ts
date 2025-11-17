import { createReadStream } from 'fs';
import { createInterface } from 'readline';

export interface XERTask {
  taskId: string;
  taskCode: string;
  taskName: string;
  startDate: string | null;
  finishDate: string | null;
  duration: number | null;
  percentComplete: number | null;
  totalFloat: number | null;
  wbsId: string | null;
  calendarId: string | null;
  taskType: string | null; // TT_Task, TT_Mile, TT_LOE, TT_Rsrc, TT_FinMile
  status: string | null; // TK_Active, TK_Complete, etc.
  cstrType: string | null; // Constraint type
  cstrDate: string | null; // Constraint date
}

export interface XERProject {
  projectId: string;
  projectName: string;
  dataDate: string | null;
  startDate: string | null;
  finishDate: string | null;
}

export interface XERWBS {
  wbsId: string;
  wbsName: string;
  wbsShortName: string;
  parentWbsId: string | null;
  seqNum: number | null;
}

export interface XERRelationship {
  predTaskId: string;
  taskId: string;
  predType: string; // PR_FS, PR_SS, PR_FF, PR_SF
  lag: number | null;
}

export interface XERCalendar {
  calendarId: string;
  calendarName: string;
}

export interface XERData {
  project: XERProject | null;
  tasks: XERTask[];
  wbs: XERWBS[];
  relationships: XERRelationship[];
  calendars: XERCalendar[];
}

/**
 * Calculate critical path using CPM algorithm
 * This performs a backward pass to calculate Late Finish and Late Start,
 * then calculates Total Float for each task
 */
export function calculateCriticalPath(tasks: XERTask[], relationships: XERRelationship[]): XERTask[] {
  // Build task map for quick lookup
  const taskMap = new Map<string, XERTask>();
  tasks.forEach(task => taskMap.set(task.taskId, task));

  // Build relationship maps
  const successorMap = new Map<string, Array<{ taskId: string; predType: string; lag: number }>>();
  relationships.forEach(rel => {
    if (!successorMap.has(rel.predTaskId)) {
      successorMap.set(rel.predTaskId, []);
    }
    successorMap.get(rel.predTaskId)!.push({
      taskId: rel.taskId,
      predType: rel.predType || 'PR_FS',
      lag: rel.lag || 0
    });
  });

  // Calculate Late Dates (Backward Pass)
  const lateDates = new Map<string, { lateStart: Date; lateFinish: Date }>();
  
  // Find the project end date (maximum finish date across ALL tasks)
  let projectEnd: Date | null = null;
  tasks.forEach(task => {
    if (task.finishDate) {
      const finishDate = new Date(task.finishDate);
      if (!projectEnd || finishDate > projectEnd) {
        projectEnd = finishDate;
      }
    }
  });

  if (!projectEnd) {
    // No valid dates, return tasks unchanged
    return tasks;
  }

  // Backward pass using recursive depth-first approach
  const visited = new Set<string>();
  
  function calculateLateDates(taskId: string): { lateStart: Date; lateFinish: Date } | null {
    if (lateDates.has(taskId)) {
      return lateDates.get(taskId)!;
    }

    const task = taskMap.get(taskId);
    if (!task || !task.startDate || !task.finishDate) {
      return null;
    }

    const earlyFinish = new Date(task.finishDate);
    const earlyStart = new Date(task.startDate);
    
    // Get successors
    const successors = successorMap.get(taskId) || [];
    
    let lateFinish: Date;
    
    // Calculate late dates based on successors
    const durationMs = earlyFinish.getTime() - earlyStart.getTime();
    
    if (successors.length === 0) {
      // No successors - this is an end task
      // Late Finish = project completion date
      lateFinish = new Date(projectEnd!);
    } else {
      // For each successor, calculate the constraint on this task's late finish
      let minLateFinish: Date | null = null;
      
      for (const succ of successors) {
        if (visited.has(succ.taskId)) continue; // Avoid circular dependencies
        
        visited.add(succ.taskId);
        const succLateDates = calculateLateDates(succ.taskId);
        visited.delete(succ.taskId);
        
        if (succLateDates) {
          const lagMs = succ.lag * 60 * 60 * 1000; // Convert hours to ms
          let constraintLateFinish: Date;
          
          // Handle different relationship types
          // In backward pass: calculate predecessor late dates from successor late dates
          switch (succ.predType) {
            case 'PR_FS': // Finish-to-Start: Pred Late Finish ≤ Succ Late Start - lag
              constraintLateFinish = new Date(succLateDates.lateStart.getTime() - lagMs);
              break;
            case 'PR_SS': // Start-to-Start: Pred Late Start ≤ Succ Late Start - lag
              // So Pred Late Finish = (Succ Late Start - lag) + duration
              const predLateStartSS = new Date(succLateDates.lateStart.getTime() - lagMs);
              constraintLateFinish = new Date(predLateStartSS.getTime() + durationMs);
              break;
            case 'PR_FF': // Finish-to-Finish: Pred Late Finish ≤ Succ Late Finish - lag
              constraintLateFinish = new Date(succLateDates.lateFinish.getTime() - lagMs);
              break;
            case 'PR_SF': // Start-to-Finish: Pred Late Start ≤ Succ Late Finish - lag
              // So Pred Late Finish = (Succ Late Finish - lag) + duration
              const predLateStartSF = new Date(succLateDates.lateFinish.getTime() - lagMs);
              constraintLateFinish = new Date(predLateStartSF.getTime() + durationMs);
              break;
            default:
              constraintLateFinish = new Date(succLateDates.lateStart.getTime() - lagMs);
          }
          
          if (!minLateFinish || constraintLateFinish < minLateFinish) {
            minLateFinish = constraintLateFinish;
          }
        }
      }
      
      lateFinish = minLateFinish || new Date(projectEnd!);
    }

    // Late Start = Late Finish - Duration
    const lateStart = new Date(lateFinish.getTime() - durationMs);

    const result = { lateStart, lateFinish };
    lateDates.set(taskId, result);
    return result;
  }

  // Calculate late dates for all tasks
  tasks.forEach(task => {
    if (task.startDate && task.finishDate) {
      calculateLateDates(task.taskId);
    }
  });

  // Calculate Total Float and update tasks
  return tasks.map(task => {
    if (!task.startDate || !task.finishDate) {
      return task;
    }

    const late = lateDates.get(task.taskId);
    if (!late) {
      return task;
    }

    const earlyStart = new Date(task.startDate);
    const lateStart = late.lateStart;
    
    // Total Float = Late Start - Early Start (in hours)
    // Allow negative float to identify tasks that are behind schedule
    const floatMs = lateStart.getTime() - earlyStart.getTime();
    const floatHours = floatMs / (1000 * 60 * 60);

    return {
      ...task,
      totalFloat: floatHours // Preserve negative float
    };
  });
}

/**
 * Parse XER file (Primavera P6 tab-delimited format)
 * XER format:
 * - %T = Table definition
 * - %F = Field names
 * - %R = Row data
 */
export async function parseXERFile(filePath: string): Promise<XERData> {
  const tables: Record<string, any[]> = {};
  let currentTable: string | null = null;
  let fieldNames: string[] = [];

  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const parts = line.split('\t');
    const prefix = parts[0];

    if (prefix === '%T') {
      // Table definition
      currentTable = parts[1];
      tables[currentTable] = [];
    } else if (prefix === '%F') {
      // Field names
      fieldNames = parts.slice(1);
    } else if (prefix === '%R' && currentTable) {
      // Row data
      const record: Record<string, string> = {};
      parts.slice(1).forEach((val, idx) => {
        if (fieldNames[idx]) {
          record[fieldNames[idx]] = val;
        }
      });
      tables[currentTable].push(record);
    }
  }

  // Extract project information
  const projectData = tables['PROJECT']?.[0];
  const project: XERProject | null = projectData ? {
    projectId: projectData.proj_id || '',
    projectName: projectData.proj_short_name || projectData.proj_name || '',
    dataDate: projectData.last_recalc_date || null,
    startDate: projectData.plan_start_date || null,
    finishDate: projectData.plan_end_date || null,
  } : null;

  // Extract tasks
  const tasks: XERTask[] = (tables['TASK'] || []).map((task: any) => ({
    taskId: task.task_id || '',
    taskCode: task.task_code || '',
    taskName: task.task_name || '',
    startDate: task.act_start_date || task.target_start_date || null,
    finishDate: task.act_end_date || task.target_end_date || null,
    duration: task.target_drtn_hr_cnt ? parseFloat(task.target_drtn_hr_cnt) : null,
    percentComplete: task.phys_complete_pct ? parseFloat(task.phys_complete_pct) : null,
    totalFloat: task.total_float_hr_cnt ? parseFloat(task.total_float_hr_cnt) : null,
    wbsId: task.wbs_id || null,
    calendarId: task.clndr_id || null,
    taskType: task.task_type || null,
    status: task.status_code || null,
    cstrType: task.cstr_type || null,
    cstrDate: task.cstr_date || null,
  }));

  // Extract WBS
  const wbs: XERWBS[] = (tables['PROJWBS'] || []).map((w: any) => ({
    wbsId: w.wbs_id || '',
    wbsName: w.wbs_name || '',
    wbsShortName: w.wbs_short_name || '',
    parentWbsId: w.parent_wbs_id || null,
    seqNum: w.seq_num ? parseInt(w.seq_num) : null,
  }));

  // Extract relationships
  const relationships: XERRelationship[] = (tables['TASKPRED'] || []).map((rel: any) => ({
    predTaskId: rel.pred_task_id || '',
    taskId: rel.task_id || '',
    predType: rel.pred_type || 'PR_FS',
    lag: rel.lag_hr_cnt ? parseFloat(rel.lag_hr_cnt) : null,
  }));

  // Extract calendars
  const calendars: XERCalendar[] = (tables['CALENDAR'] || []).map((cal: any) => ({
    calendarId: cal.clndr_id || '',
    calendarName: cal.clndr_name || '',
  }));

  // Calculate critical path (recalculate total float)
  const tasksWithFloat = calculateCriticalPath(tasks, relationships);

  // Debug: Log float calculation statistics
  const floatStats = {
    total: tasksWithFloat.length,
    critical: tasksWithFloat.filter(t => t.totalFloat !== null && t.totalFloat <= 0).length,
    nearCritical: tasksWithFloat.filter(t => t.totalFloat !== null && t.totalFloat > 0 && t.totalFloat <= 40).length, // 0-5 days
    nonCritical: tasksWithFloat.filter(t => t.totalFloat !== null && t.totalFloat > 40).length,
    noFloat: tasksWithFloat.filter(t => t.totalFloat === null).length,
  };
  console.log('[CPM Debug] Float calculation stats:', floatStats);
  console.log('[CPM Debug] Sample activities:',
    tasksWithFloat.slice(0, 5).map(t => ({
      code: t.taskCode,
      name: t.taskName.substring(0, 30),
      float: t.totalFloat ? Math.round(t.totalFloat / 8) + 'd' : 'null'
    }))
  );

  return {
    project,
    tasks: tasksWithFloat,
    wbs,
    relationships,
    calendars
  };
}

/**
 * Parse XER file from buffer
 */
export async function parseXERBuffer(buffer: Buffer): Promise<XERData> {
  const tables: Record<string, any[]> = {};
  let currentTable: string | null = null;
  let fieldNames: string[] = [];

  // Split buffer into lines
  const lines = buffer.toString('utf-8').split(/\r?\n/);

  for (const line of lines) {
    const parts = line.split('\t');
    const prefix = parts[0];

    if (prefix === '%T') {
      // Table definition
      currentTable = parts[1];
      tables[currentTable] = [];
    } else if (prefix === '%F') {
      // Field names
      fieldNames = parts.slice(1);
    } else if (prefix === '%R' && currentTable) {
      // Row data
      const record: Record<string, string> = {};
      parts.slice(1).forEach((val, idx) => {
        if (fieldNames[idx]) {
          record[fieldNames[idx]] = val;
        }
      });
      tables[currentTable].push(record);
    }
  }

  // Extract project information
  const projectData = tables['PROJECT']?.[0];
  const project: XERProject | null = projectData ? {
    projectId: projectData.proj_id || '',
    projectName: projectData.proj_short_name || projectData.proj_name || '',
    dataDate: projectData.last_recalc_date || null,
    startDate: projectData.plan_start_date || null,
    finishDate: projectData.plan_end_date || null,
  } : null;

  // Extract tasks
  const tasks: XERTask[] = (tables['TASK'] || []).map((task: any) => ({
    taskId: task.task_id || '',
    taskCode: task.task_code || '',
    taskName: task.task_name || '',
    startDate: task.act_start_date || task.target_start_date || null,
    finishDate: task.act_end_date || task.target_end_date || null,
    duration: task.target_drtn_hr_cnt ? parseFloat(task.target_drtn_hr_cnt) : null,
    percentComplete: task.phys_complete_pct ? parseFloat(task.phys_complete_pct) : null,
    totalFloat: task.total_float_hr_cnt ? parseFloat(task.total_float_hr_cnt) : null,
    wbsId: task.wbs_id || null,
    calendarId: task.clndr_id || null,
    taskType: task.task_type || null,
    status: task.status_code || null,
    cstrType: task.cstr_type || null,
    cstrDate: task.cstr_date || null,
  }));

  // Extract WBS
  const wbs: XERWBS[] = (tables['PROJWBS'] || []).map((w: any) => ({
    wbsId: w.wbs_id || '',
    wbsName: w.wbs_name || '',
    wbsShortName: w.wbs_short_name || '',
    parentWbsId: w.parent_wbs_id || null,
    seqNum: w.seq_num ? parseInt(w.seq_num) : null,
  }));

  // Extract relationships
  const relationships: XERRelationship[] = (tables['TASKPRED'] || []).map((rel: any) => ({
    predTaskId: rel.pred_task_id || '',
    taskId: rel.task_id || '',
    predType: rel.pred_type || 'PR_FS',
    lag: rel.lag_hr_cnt ? parseFloat(rel.lag_hr_cnt) : null,
  }));

  // Extract calendars
  const calendars: XERCalendar[] = (tables['CALENDAR'] || []).map((cal: any) => ({
    calendarId: cal.clndr_id || '',
    calendarName: cal.clndr_name || '',
  }));

  // Calculate critical path (recalculate total float)
  const tasksWithFloat = calculateCriticalPath(tasks, relationships);

  // Debug: Log float calculation statistics
  const floatStats = {
    total: tasksWithFloat.length,
    critical: tasksWithFloat.filter(t => t.totalFloat !== null && t.totalFloat <= 0).length,
    nearCritical: tasksWithFloat.filter(t => t.totalFloat !== null && t.totalFloat > 0 && t.totalFloat <= 40).length, // 0-5 days
    nonCritical: tasksWithFloat.filter(t => t.totalFloat !== null && t.totalFloat > 40).length,
    noFloat: tasksWithFloat.filter(t => t.totalFloat === null).length,
  };
  console.log('[CPM Debug] Float calculation stats:', floatStats);
  console.log('[CPM Debug] Sample activities:',
    tasksWithFloat.slice(0, 5).map(t => ({
      code: t.taskCode,
      name: t.taskName.substring(0, 30),
      float: t.totalFloat ? Math.round(t.totalFloat / 8) + 'd' : 'null'
    }))
  );

  return {
    project,
    tasks: tasksWithFloat,
    wbs,
    relationships,
    calendars
  };
}
