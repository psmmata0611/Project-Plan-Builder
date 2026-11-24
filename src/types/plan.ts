export type CalendarDate = string; // YYYY-MM-DD

export interface PlanInputs {
  goal: string;
  startDate: CalendarDate;
  deadlineDate: CalendarDate;
  teamSize: number;
  context: string;
}

export interface TaskItem {
  id: string;
  name: string;
  deliverable: string;
  effortDays: number;
  prerequisiteIds: string[];
}

export interface MilestoneItem {
  id: string;
  name: string;
  criteria: string;
  requiredTaskIds: string[];
}

export interface ExternalDependency {
  description: string;
  confirmationQuestion: string;
}

export interface ProjectPlanData {
  title: string;
  successSummary: string;
  milestones: MilestoneItem[];
  tasks: TaskItem[];
  assumptions: string[];
  externalDependencies: ExternalDependency[];
}

export interface ScheduledTask extends TaskItem {
  startDate: CalendarDate;
  finishDate: CalendarDate;
  startWorkingDay: number;
  finishWorkingDay: number;
  downstreamEffortDays: number;
}

export interface ScheduledMilestone extends MilestoneItem {
  date: CalendarDate;
  workingDay: number;
}

export interface ScheduleSuccess {
  ok: true;
  requestedStartDate: CalendarDate;
  effectiveStartDate: CalendarDate;
  rolledOverFromWeekend: boolean;
  requestedDeadlineDate: CalendarDate;
  projectFinishDate: CalendarDate;
  totalWorkingDays: number;
  totalEffortDays: number;
  teamSize: number;
  meetsDeadline: boolean;
  workingDaysLate: number;
  workingDaysBuffer: number;
  decisionToExplore: string | null;
  tasks: ScheduledTask[];
  milestones: ScheduledMilestone[];
  schedulerAssumptions: string[];
}

export interface ScheduleFailure {
  ok: false;
  code: 'CYCLE' | 'INVALID_INPUT' | 'INVALID_PLAN';
  message: string;
  cycleNodes?: Array<{ id: string; name: string }>;
  requestedStartDate?: CalendarDate;
  effectiveStartDate?: CalendarDate;
  rolledOverFromWeekend?: boolean;
  schedulerAssumptions: string[];
}

export type ScheduleResult = ScheduleSuccess | ScheduleFailure;

export interface WorkspaceState {
  version: 1;
  inputs: PlanInputs;
  plan: ProjectPlanData | null;
  hasEdits: boolean;
  selectedTaskId: string | null;
  activeView: 'overview' | 'tasks' | 'timeline';
  contextExpanded: boolean;
}
