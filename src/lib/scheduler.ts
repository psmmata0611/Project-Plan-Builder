import {
  addWorkingDays,
  countWorkingDaysAfter,
  formatDisplayDate,
  isValidCalendarDate,
  resolveEffectiveStart,
} from './dates';
import {
  findDependencyCycle,
  formatCycleDescription,
  parsePositiveWholeNumber,
} from './planValidation';
import type {
  CalendarDate,
  ProjectPlanData,
  ScheduleResult,
  ScheduledMilestone,
  ScheduledTask,
  TaskItem,
} from '../types/plan';

export const SCHEDULER_ASSUMPTIONS: string[] = [
  'Working days are Monday to Friday; weekend start dates roll over to the next Monday.',
  'Full team availability is assumed across every working day, with no public holidays or leave.',
  'No specialist role constraints apply: any team member can pick up any ready task and works on it for consecutive working days.',
];

export function compareStableIds(a: string, b: string): number {
  const chunkRe = /(\d+|\D+)/g;
  const aParts = a.match(chunkRe) ?? [a];
  const bParts = b.match(chunkRe) ?? [b];
  const len = Math.min(aParts.length, bParts.length);

  for (let i = 0; i < len; i += 1) {
    const ap = aParts[i];
    const bp = bParts[i];
    const aNum = /^\d+$/.test(ap) ? Number(ap) : null;
    const bNum = /^\d+$/.test(bp) ? Number(bp) : null;
    if (aNum !== null && bNum !== null) {
      if (aNum !== bNum) return aNum - bNum;
    } else if (ap !== bp) {
      return ap < bp ? -1 : 1;
    }
  }
  return aParts.length - bParts.length;
}

function computeUniqueDownstreamEfforts(tasks: TaskItem[]): Map<string, number> {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const dependentsById = new Map<string, string[]>();
  for (const t of tasks) {
    dependentsById.set(t.id, []);
  }
  for (const t of tasks) {
    for (const prereqId of t.prerequisiteIds) {
      dependentsById.get(prereqId)?.push(t.id);
    }
  }

  const downstreamEffortById = new Map<string, number>();

  for (const task of tasks) {
    const visited = new Set<string>();
    const queue = [...(dependentsById.get(task.id) ?? [])];
    while (queue.length > 0) {
      const currId = queue.shift()!;
      if (visited.has(currId) || currId === task.id) continue;
      visited.add(currId);
      const nextDeps = dependentsById.get(currId);
      if (nextDeps) {
        for (const nextId of nextDeps) {
          if (!visited.has(nextId)) {
            queue.push(nextId);
          }
        }
      }
    }

    let effortSum = 0;
    for (const downstreamId of visited) {
      effortSum += taskById.get(downstreamId)?.effortDays ?? 0;
    }
    downstreamEffortById.set(task.id, effortSum);
  }

  return downstreamEffortById;
}

interface CoreScheduleOutput {
  scheduledTasks: Array<{
    task: TaskItem;
    startDayIdx: number;
    finishDayIdx: number;
    downstreamEffortDays: number;
  }>;
  maxFinishDayIdx: number;
}

function runPrioritySimulation(tasks: TaskItem[], teamSize: number): CoreScheduleOutput {
  const downstreamEffortById = computeUniqueDownstreamEfforts(tasks);
  const finishDayById = new Map<string, number>();
  const startedIds = new Set<string>();
  const activeTasks: Array<{ task: TaskItem; startDayIdx: number; finishDayIdx: number }> = [];
  const scheduledTasks: CoreScheduleOutput['scheduledTasks'] = [];

  let dayIdx = 0;

  while (scheduledTasks.length < tasks.length) {
    // Release tasks that finished before `dayIdx`
    for (let i = activeTasks.length - 1; i >= 0; i -= 1) {
      if (activeTasks[i].finishDayIdx < dayIdx) {
        finishDayById.set(activeTasks[i].task.id, activeTasks[i].finishDayIdx);
        activeTasks.splice(i, 1);
      }
    }

    let freeSlots = teamSize - activeTasks.length;

    if (freeSlots > 0) {
      const ready = tasks
        .filter((task) => {
          if (startedIds.has(task.id)) return false;
          return task.prerequisiteIds.every((prereqId) => {
            const prereqFinish = finishDayById.get(prereqId);
            return prereqFinish !== undefined && prereqFinish < dayIdx;
          });
        })
        .sort((a, b) => {
          const effortDiff =
            (downstreamEffortById.get(b.id) ?? 0) - (downstreamEffortById.get(a.id) ?? 0);
          if (effortDiff !== 0) return effortDiff;
          return compareStableIds(a.id, b.id);
        });

      const toStart = ready.slice(0, freeSlots);
      for (const task of toStart) {
        const finishDayIdx = dayIdx + task.effortDays - 1;
        startedIds.add(task.id);
        activeTasks.push({ task, startDayIdx: dayIdx, finishDayIdx });
        scheduledTasks.push({
          task,
          startDayIdx: dayIdx,
          finishDayIdx,
          downstreamEffortDays: downstreamEffortById.get(task.id) ?? 0,
        });
      }
      freeSlots -= toStart.length;
    }

    if (scheduledTasks.length === tasks.length) {
      break;
    }

    if (activeTasks.length === 0) {
      throw new Error('Scheduler stalled: unstarted tasks remain with no active tasks.');
    }

    const earliestActiveFinish = Math.min(...activeTasks.map((a) => a.finishDayIdx));
    dayIdx = earliestActiveFinish + 1;
  }

  const maxFinishDayIdx = Math.max(...scheduledTasks.map((s) => s.finishDayIdx));
  return { scheduledTasks, maxFinishDayIdx };
}

export function scheduleProjectPlan(
  plan: ProjectPlanData,
  params: {
    startDate: CalendarDate;
    deadlineDate: CalendarDate;
    teamSize: number;
  },
): ScheduleResult {
  if (!isValidCalendarDate(params.startDate)) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Start date must be a valid calendar date (YYYY-MM-DD).',
      schedulerAssumptions: SCHEDULER_ASSUMPTIONS,
    };
  }

  const { effectiveStart, rolledOverFromWeekend } = resolveEffectiveStart(params.startDate);

  if (!isValidCalendarDate(params.deadlineDate)) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Deadline date must be a valid calendar date (YYYY-MM-DD).',
      requestedStartDate: params.startDate,
      effectiveStartDate: effectiveStart,
      rolledOverFromWeekend,
      schedulerAssumptions: SCHEDULER_ASSUMPTIONS,
    };
  }

  if (params.deadlineDate < effectiveStart) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: `Requested deadline (${formatDisplayDate(params.deadlineDate)}) is earlier than the effective start date (${formatDisplayDate(effectiveStart)}).`,
      requestedStartDate: params.startDate,
      effectiveStartDate: effectiveStart,
      rolledOverFromWeekend,
      schedulerAssumptions: SCHEDULER_ASSUMPTIONS,
    };
  }

  const teamSize = parsePositiveWholeNumber(params.teamSize);
  if (teamSize === null) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Team size must be a positive whole number.',
      requestedStartDate: params.startDate,
      effectiveStartDate: effectiveStart,
      rolledOverFromWeekend,
      schedulerAssumptions: SCHEDULER_ASSUMPTIONS,
    };
  }

  if (!plan.tasks || plan.tasks.length === 0) {
    return {
      ok: false,
      code: 'INVALID_PLAN',
      message: 'Plan must contain at least one task to schedule.',
      requestedStartDate: params.startDate,
      effectiveStartDate: effectiveStart,
      rolledOverFromWeekend,
      schedulerAssumptions: SCHEDULER_ASSUMPTIONS,
    };
  }

  const taskIds = new Set<string>();
  for (const task of plan.tasks) {
    const cleanId = task.id.trim();
    if (!cleanId) {
      return {
        ok: false,
        code: 'INVALID_PLAN',
        message: 'Every task must have a non-empty ID.',
        requestedStartDate: params.startDate,
        effectiveStartDate: effectiveStart,
        rolledOverFromWeekend,
        schedulerAssumptions: SCHEDULER_ASSUMPTIONS,
      };
    }
    if (taskIds.has(cleanId)) {
      return {
        ok: false,
        code: 'INVALID_PLAN',
        message: `Duplicate task ID "${cleanId}" found.`,
        requestedStartDate: params.startDate,
        effectiveStartDate: effectiveStart,
        rolledOverFromWeekend,
        schedulerAssumptions: SCHEDULER_ASSUMPTIONS,
      };
    }
    if (!Number.isInteger(task.effortDays) || task.effortDays < 1) {
      return {
        ok: false,
        code: 'INVALID_PLAN',
        message: `Task "${task.name}" (${task.id}) must have a positive whole-number effort estimate.`,
        requestedStartDate: params.startDate,
        effectiveStartDate: effectiveStart,
        rolledOverFromWeekend,
        schedulerAssumptions: SCHEDULER_ASSUMPTIONS,
      };
    }
    taskIds.add(cleanId);
  }

  for (const task of plan.tasks) {
    for (const prereqId of task.prerequisiteIds) {
      if (prereqId === task.id) {
        return {
          ok: false,
          code: 'CYCLE',
          message: `Dependency cycle detected: ${task.name} (${task.id}) -> ${task.name} (${task.id}). Uncheck itself in the Tasks editor to restore the schedule.`,
          cycleNodes: [
            { id: task.id, name: task.name },
            { id: task.id, name: task.name },
          ],
          requestedStartDate: params.startDate,
          effectiveStartDate: effectiveStart,
          rolledOverFromWeekend,
          schedulerAssumptions: SCHEDULER_ASSUMPTIONS,
        };
      }
      if (!taskIds.has(prereqId)) {
        return {
          ok: false,
          code: 'INVALID_PLAN',
          message: `Task "${task.name}" (${task.id}) references missing prerequisite "${prereqId}".`,
          requestedStartDate: params.startDate,
          effectiveStartDate: effectiveStart,
          rolledOverFromWeekend,
          schedulerAssumptions: SCHEDULER_ASSUMPTIONS,
        };
      }
    }
  }

  for (const milestone of plan.milestones) {
    for (const reqId of milestone.requiredTaskIds) {
      if (!taskIds.has(reqId)) {
        return {
          ok: false,
          code: 'INVALID_PLAN',
          message: `Milestone "${milestone.name}" (${milestone.id}) references missing task "${reqId}".`,
          requestedStartDate: params.startDate,
          effectiveStartDate: effectiveStart,
          rolledOverFromWeekend,
          schedulerAssumptions: SCHEDULER_ASSUMPTIONS,
        };
      }
    }
  }

  const cycleNodes = findDependencyCycle(plan.tasks);
  if (cycleNodes) {
    return {
      ok: false,
      code: 'CYCLE',
      message: `Dependency cycle detected: ${formatCycleDescription(cycleNodes)}. Remove one of these prerequisite links in the Tasks editor to recalculate the schedule.`,
      cycleNodes,
      requestedStartDate: params.startDate,
      effectiveStartDate: effectiveStart,
      rolledOverFromWeekend,
      schedulerAssumptions: SCHEDULER_ASSUMPTIONS,
    };
  }

  const sim = runPrioritySimulation(plan.tasks, teamSize);
  const scheduledMap = new Map<string, ScheduledTask>();

  // Preserve original task array order for display consistency
  const simById = new Map(sim.scheduledTasks.map((s) => [s.task.id, s]));
  const scheduledTasks: ScheduledTask[] = plan.tasks.map((task) => {
    const entry = simById.get(task.id)!;
    const startDate = addWorkingDays(effectiveStart, entry.startDayIdx);
    const finishDate = addWorkingDays(effectiveStart, entry.finishDayIdx);
    const st: ScheduledTask = {
      ...task,
      startDate,
      finishDate,
      startWorkingDay: entry.startDayIdx + 1,
      finishWorkingDay: entry.finishDayIdx + 1,
      downstreamEffortDays: entry.downstreamEffortDays,
    };
    scheduledMap.set(task.id, st);
    return st;
  });

  const milestones: ScheduledMilestone[] = plan.milestones.map((m) => {
    let latestWorkingDay = 1;
    let latestDate = effectiveStart;
    for (const reqId of m.requiredTaskIds) {
      const reqTask = scheduledMap.get(reqId);
      if (reqTask && reqTask.finishWorkingDay >= latestWorkingDay) {
        latestWorkingDay = reqTask.finishWorkingDay;
        latestDate = reqTask.finishDate;
      }
    }
    return {
      ...m,
      date: latestDate,
      workingDay: latestWorkingDay,
    };
  });

  const totalWorkingDays = sim.maxFinishDayIdx + 1;
  const projectFinishDate = addWorkingDays(effectiveStart, sim.maxFinishDayIdx);
  const totalEffortDays = plan.tasks.reduce((sum, t) => sum + t.effortDays, 0);
  const meetsDeadline = projectFinishDate <= params.deadlineDate;
  const workingDaysLate = meetsDeadline
    ? 0
    : countWorkingDaysAfter(params.deadlineDate, projectFinishDate);
  const workingDaysBuffer = meetsDeadline
    ? countWorkingDaysAfter(projectFinishDate, params.deadlineDate)
    : 0;

  let decisionToExplore: string | null = null;
  if (!meetsDeadline) {
    const lateTasks = [...scheduledTasks]
      .filter((t) => t.finishDate > params.deadlineDate)
      .sort((a, b) => {
        if (b.finishWorkingDay !== a.finishWorkingDay) {
          return b.finishWorkingDay - a.finishWorkingDay;
        }
        return b.effortDays - a.effortDays;
      });

    const primaryLate = lateTasks[0];
    const plusOneSim = runPrioritySimulation(plan.tasks, teamSize + 1);
    const plusOneFinishDate = addWorkingDays(effectiveStart, plusOneSim.maxFinishDayIdx);
    const confirmationItem = plan.externalDependencies.find(
      (d) => d.confirmationQuestion.trim().length > 0,
    );

    if (primaryLate) {
      if (plusOneSim.maxFinishDayIdx < sim.maxFinishDayIdx) {
        decisionToExplore = `Explore splitting or reducing effort on "${primaryLate.name}" (${primaryLate.id}, ${primaryLate.effortDays} person-day${primaryLate.effortDays === 1 ? '' : 's'}, finishes ${formatDisplayDate(primaryLate.finishDate)}), or test raising team size from ${teamSize} to ${teamSize + 1} (projected finish moves to ${formatDisplayDate(plusOneFinishDate)}).`;
      } else {
        decisionToExplore = `Explore reducing effort or parallelising "${primaryLate.name}" (${primaryLate.id}, ${primaryLate.effortDays} person-day${primaryLate.effortDays === 1 ? '' : 's'}, finishes ${formatDisplayDate(primaryLate.finishDate)}), as adding team members alone does not shorten its dependency chain.`;
      }
      if (confirmationItem) {
        decisionToExplore += ` Also confirm early: ${confirmationItem.confirmationQuestion}`;
      }
    }
  }

  return {
    ok: true,
    requestedStartDate: params.startDate,
    effectiveStartDate: effectiveStart,
    rolledOverFromWeekend,
    requestedDeadlineDate: params.deadlineDate,
    projectFinishDate,
    totalWorkingDays,
    totalEffortDays,
    teamSize,
    meetsDeadline,
    workingDaysLate,
    workingDaysBuffer,
    decisionToExplore,
    tasks: scheduledTasks,
    milestones,
    schedulerAssumptions: SCHEDULER_ASSUMPTIONS,
  };
}
