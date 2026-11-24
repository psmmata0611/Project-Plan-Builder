import { isValidCalendarDate } from './dates';
import { parsePositiveWholeNumber, validateGeneratedPlan } from './planValidation';
import type { WorkspaceState } from '../types/plan';

export const STORAGE_KEY = 'project_plan_builder_workspace_v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function saveWorkspaceState(
  state: WorkspaceState,
  storage: StorageLike | null = typeof window !== 'undefined' ? window.localStorage : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota or private-browsing storage errors
  }
}

export function loadWorkspaceState(
  storage: StorageLike | null = typeof window !== 'undefined' ? window.localStorage : null,
): WorkspaceState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    if (!parsed || parsed.version !== 1 || !parsed.inputs) return null;

    const goal = typeof parsed.inputs.goal === 'string' ? parsed.inputs.goal : '';
    const context = typeof parsed.inputs.context === 'string' ? parsed.inputs.context : '';
    const startDate =
      typeof parsed.inputs.startDate === 'string' && isValidCalendarDate(parsed.inputs.startDate)
        ? parsed.inputs.startDate
        : '';
    const deadlineDate =
      typeof parsed.inputs.deadlineDate === 'string' &&
      (parsed.inputs.deadlineDate === '' || isValidCalendarDate(parsed.inputs.deadlineDate))
        ? parsed.inputs.deadlineDate
        : '';
    const teamSize = parsePositiveWholeNumber(parsed.inputs.teamSize ?? 2) ?? 2;

    if (!startDate) return null;

    let plan = null;
    if (parsed.plan && typeof parsed.plan === 'object') {
      // Allow restoring edited plans even if user temporarily introduced a cycle or invalid edit
      const validated = validateGeneratedPlan(parsed.plan);
      if (validated.ok) {
        plan = validated.plan;
      } else if (
        typeof parsed.plan.title === 'string' &&
        Array.isArray(parsed.plan.tasks) &&
        Array.isArray(parsed.plan.milestones)
      ) {
        plan = parsed.plan;
      }
    }

    const activeView =
      parsed.activeView === 'overview' ||
      parsed.activeView === 'tasks' ||
      parsed.activeView === 'timeline'
        ? parsed.activeView
        : 'overview';

    return {
      version: 1,
      inputs: {
        goal,
        startDate,
        deadlineDate,
        teamSize,
        context,
      },
      plan,
      hasEdits: Boolean(parsed.hasEdits),
      selectedTaskId: typeof parsed.selectedTaskId === 'string' ? parsed.selectedTaskId : null,
      activeView,
      contextExpanded: Boolean(parsed.contextExpanded),
    };
  } catch {
    return null;
  }
}
