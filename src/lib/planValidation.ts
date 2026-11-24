import { formatDisplayDate, isValidCalendarDate, resolveEffectiveStart } from './dates.ts';
import type {
  ExternalDependency,
  MilestoneItem,
  ProjectPlanData,
  TaskItem,
} from '../types/plan.ts';

export interface InputValidationErrors {
  goal?: string;
  startDate?: string;
  deadlineDate?: string;
  teamSize?: string;
}

export interface InputValidationResult {
  valid: boolean;
  errors: InputValidationErrors;
  parsedTeamSize?: number;
  effectiveStartDate?: string;
  rolledOverFromWeekend?: boolean;
}

export function parsePositiveWholeNumber(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 ? value : null;
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number(trimmed);
  return Number.isSafeInteger(num) && num >= 1 ? num : null;
}

export function validatePlanInputs(inputs: {
  goal: string;
  startDate: string;
  deadlineDate: string;
  teamSize: string | number;
}): InputValidationResult {
  const errors: InputValidationErrors = {};

  if (!inputs.goal || inputs.goal.trim().length === 0) {
    errors.goal = 'Enter a project goal.';
  }

  const parsedTeamSize = parsePositiveWholeNumber(inputs.teamSize);
  if (parsedTeamSize === null) {
    errors.teamSize = 'Enter a positive whole number (1 or more).';
  }

  const startValid = isValidCalendarDate(inputs.startDate);
  if (!startValid) {
    errors.startDate = 'Choose a valid start date.';
  }

  const deadlineValid = isValidCalendarDate(inputs.deadlineDate);
  if (!deadlineValid) {
    errors.deadlineDate = 'Choose a deadline date.';
  }

  let effectiveStartDate: string | undefined;
  let rolledOverFromWeekend: boolean | undefined;

  if (startValid) {
    const resolved = resolveEffectiveStart(inputs.startDate);
    effectiveStartDate = resolved.effectiveStart;
    rolledOverFromWeekend = resolved.rolledOverFromWeekend;

    if (deadlineValid && inputs.deadlineDate < resolved.effectiveStart) {
      errors.deadlineDate = `Deadline must be on or after the effective start (${formatDisplayDate(resolved.effectiveStart)}).`;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    parsedTeamSize: parsedTeamSize ?? undefined,
    effectiveStartDate,
    rolledOverFromWeekend,
  };
}

export function findDependencyCycle(
  tasks: Array<{ id: string; name: string; prerequisiteIds: string[] }>,
): Array<{ id: string; name: string }> | null {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map<string, 'visiting' | 'visited'>();
  const stack: Array<{ id: string; name: string }> = [];

  function dfs(taskId: string): Array<{ id: string; name: string }> | null {
    state.set(taskId, 'visiting');
    const task = taskById.get(taskId);
    if (!task) return null;
    stack.push({ id: task.id, name: task.name });

    for (const prereqId of task.prerequisiteIds) {
      if (!taskById.has(prereqId)) continue;
      const prereqState = state.get(prereqId);
      if (prereqState === 'visiting') {
        const idx = stack.findIndex((item) => item.id === prereqId);
        const cycleSlice = idx >= 0 ? stack.slice(idx) : [...stack];
        const first = taskById.get(prereqId)!;
        return [...cycleSlice, { id: first.id, name: first.name }];
      }
      if (!prereqState) {
        const found = dfs(prereqId);
        if (found) return found;
      }
    }

    stack.pop();
    state.set(taskId, 'visited');
    return null;
  }

  for (const task of tasks) {
    if (!state.get(task.id)) {
      const cycle = dfs(task.id);
      if (cycle) return cycle;
    }
  }

  return null;
}

export function formatCycleDescription(cycleNodes: Array<{ id: string; name: string }>): string {
  return cycleNodes.map((n) => `${n.name} (${n.id})`).join(' -> ');
}

export function validateGeneratedPlan(
  raw: unknown,
): { ok: true; plan: ProjectPlanData } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Generated plan was empty or not a JSON object.' };
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.title !== 'string' || obj.title.trim().length === 0) {
    return { ok: false, error: 'Generated plan is missing a valid title.' };
  }
  if (typeof obj.successSummary !== 'string' || obj.successSummary.trim().length === 0) {
    return { ok: false, error: 'Generated plan is missing a success summary.' };
  }

  if (!Array.isArray(obj.tasks) || obj.tasks.length === 0) {
    return { ok: false, error: 'Generated plan must include at least one task.' };
  }

  const tasks: TaskItem[] = [];
  const taskIds = new Set<string>();

  for (let i = 0; i < obj.tasks.length; i += 1) {
    const item = obj.tasks[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Task at index ${i} is invalid.` };
    }
    const t = item as Record<string, unknown>;
    const id = typeof t.id === 'string' ? t.id.trim() : '';
    const name = typeof t.name === 'string' ? t.name.trim() : '';
    const deliverable = typeof t.deliverable === 'string' ? t.deliverable.trim() : '';
    const effortDays = typeof t.effortDays === 'number' ? t.effortDays : Number.NaN;

    if (!id) {
      return { ok: false, error: `Task at index ${i} is missing an ID.` };
    }
    if (taskIds.has(id)) {
      return { ok: false, error: `Duplicate task ID "${id}" in generated plan.` };
    }
    if (!name) {
      return { ok: false, error: `Task ${id} is missing a name.` };
    }
    if (!deliverable) {
      return { ok: false, error: `Task ${id} is missing a deliverable.` };
    }
    if (!Number.isInteger(effortDays) || effortDays < 1) {
      return { ok: false, error: `Task ${id} must have a whole-number positive effort estimate.` };
    }
    if (!Array.isArray(t.prerequisiteIds)) {
      return { ok: false, error: `Task ${id} is missing prerequisiteIds array.` };
    }

    const prereqSet = new Set<string>();
    const prerequisiteIds: string[] = [];
    for (const p of t.prerequisiteIds) {
      if (typeof p !== 'string' || p.trim().length === 0) {
        return { ok: false, error: `Task ${id} contains an invalid prerequisite ID.` };
      }
      const cleanP = p.trim();
      if (!prereqSet.has(cleanP)) {
        prereqSet.add(cleanP);
        prerequisiteIds.push(cleanP);
      }
    }

    taskIds.add(id);
    tasks.push({
      id,
      name,
      deliverable,
      effortDays,
      prerequisiteIds,
    });
  }

  for (const task of tasks) {
    for (const prereqId of task.prerequisiteIds) {
      if (prereqId === task.id) {
        return {
          ok: false,
          error: `Task ${task.name} (${task.id}) cannot depend on itself.`,
        };
      }
      if (!taskIds.has(prereqId)) {
        return {
          ok: false,
          error: `Task ${task.name} (${task.id}) references unknown prerequisite ID "${prereqId}".`,
        };
      }
    }
  }

  const cycle = findDependencyCycle(tasks);
  if (cycle) {
    return {
      ok: false,
      error: `Generated plan contains a dependency cycle: ${formatCycleDescription(cycle)}.`,
    };
  }

  if (!Array.isArray(obj.milestones) || obj.milestones.length === 0) {
    return { ok: false, error: 'Generated plan must include at least one milestone.' };
  }

  const milestones: MilestoneItem[] = [];
  const milestoneIds = new Set<string>();

  for (let i = 0; i < obj.milestones.length; i += 1) {
    const item = obj.milestones[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Milestone at index ${i} is invalid.` };
    }
    const m = item as Record<string, unknown>;
    const id = typeof m.id === 'string' ? m.id.trim() : '';
    const name = typeof m.name === 'string' ? m.name.trim() : '';
    const criteria = typeof m.criteria === 'string' ? m.criteria.trim() : '';

    if (!id) {
      return { ok: false, error: `Milestone at index ${i} is missing an ID.` };
    }
    if (milestoneIds.has(id)) {
      return { ok: false, error: `Duplicate milestone ID "${id}" in generated plan.` };
    }
    if (!name) {
      return { ok: false, error: `Milestone ${id} is missing a name.` };
    }
    if (!criteria) {
      return { ok: false, error: `Milestone ${id} is missing completion criteria.` };
    }
    if (!Array.isArray(m.requiredTaskIds) || m.requiredTaskIds.length === 0) {
      return { ok: false, error: `Milestone ${id} must reference at least one required task ID.` };
    }

    const reqSet = new Set<string>();
    const requiredTaskIds: string[] = [];
    for (const ref of m.requiredTaskIds) {
      if (typeof ref !== 'string' || !taskIds.has(ref.trim())) {
        return {
          ok: false,
          error: `Milestone ${name} (${id}) references unknown task ID "${String(ref)}".`,
        };
      }
      const cleanRef = ref.trim();
      if (!reqSet.has(cleanRef)) {
        reqSet.add(cleanRef);
        requiredTaskIds.push(cleanRef);
      }
    }

    milestoneIds.add(id);
    milestones.push({
      id,
      name,
      criteria,
      requiredTaskIds,
    });
  }

  const assumptions: string[] = [];
  if (Array.isArray(obj.assumptions)) {
    for (const a of obj.assumptions) {
      if (typeof a === 'string' && a.trim().length > 0) {
        assumptions.push(a.trim());
      }
    }
  }

  const externalDependencies: ExternalDependency[] = [];
  if (Array.isArray(obj.externalDependencies)) {
    for (const item of obj.externalDependencies) {
      if (!item || typeof item !== 'object') {
        return { ok: false, error: 'Generated plan contains an invalid external dependency entry.' };
      }
      const d = item as Record<string, unknown>;
      const description = typeof d.description === 'string' ? d.description.trim() : '';
      const confirmationQuestion =
        typeof d.confirmationQuestion === 'string' ? d.confirmationQuestion.trim() : '';
      if (!description) {
        return { ok: false, error: 'External dependency entry is missing a description.' };
      }
      externalDependencies.push({
        description,
        confirmationQuestion,
      });
    }
  }

  return {
    ok: true,
    plan: {
      title: obj.title.trim(),
      successSummary: obj.successSummary.trim(),
      milestones,
      tasks,
      assumptions,
      externalDependencies,
    },
  };
}
