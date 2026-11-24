import { formatDisplayDate } from './dates';
import type { PlanInputs, ProjectPlanData, ScheduleResult } from '../types/plan';

export function buildPlanMarkdown(
  inputs: PlanInputs,
  plan: ProjectPlanData,
  schedule: ScheduleResult,
): string {
  const lines: string[] = [];

  lines.push(`# ${plan.title}`);
  lines.push('');
  lines.push(`**Goal:** ${inputs.goal.trim()}`);
  lines.push(`**Success Summary:** ${plan.successSummary}`);
  if (inputs.context.trim().length > 0) {
    lines.push(`**Constraints & Context:** ${inputs.context.trim()}`);
  }
  lines.push('');

  lines.push('## Schedule Summary');
  lines.push('');
  lines.push(`- **Requested Start Date:** ${formatDisplayDate(inputs.startDate)}`);
  if (schedule.effectiveStartDate) {
    lines.push(
      `- **Effective Start Date:** ${formatDisplayDate(schedule.effectiveStartDate)}${
        schedule.rolledOverFromWeekend ? ' (rolled over from weekend)' : ''
      }`,
    );
  }
  lines.push(`- **Requested Deadline:** ${formatDisplayDate(inputs.deadlineDate)}`);
  lines.push(`- **Team Size:** ${inputs.teamSize}`);

  const totalEffort = plan.tasks.reduce((sum, t) => sum + t.effortDays, 0);
  lines.push(`- **Total Estimated Effort:** ${totalEffort} person-days`);

  if (schedule.ok) {
    lines.push(`- **Projected Finish:** ${formatDisplayDate(schedule.projectFinishDate)} (${schedule.totalWorkingDays} working days)`);
    if (schedule.meetsDeadline) {
      lines.push(
        `- **Deadline Status:** On track (${schedule.workingDaysBuffer} working day${
          schedule.workingDaysBuffer === 1 ? '' : 's'
        } buffer)`,
      );
    } else {
      lines.push(
        `- **Deadline Status:** Misses deadline by ${schedule.workingDaysLate} working day${
          schedule.workingDaysLate === 1 ? '' : 's'
        }`,
      );
      if (schedule.decisionToExplore) {
        lines.push(`- **Decision to Explore:** ${schedule.decisionToExplore}`);
      }
    }
  } else {
    lines.push(`- **Schedule Status:** Blocked (${schedule.message})`);
  }
  lines.push('');

  const taskById = new Map(plan.tasks.map((t) => [t.id, t]));
  const scheduledTaskById = schedule.ok
    ? new Map(schedule.tasks.map((t) => [t.id, t]))
    : null;
  const scheduledMilestoneById = schedule.ok
    ? new Map(schedule.milestones.map((m) => [m.id, m]))
    : null;

  lines.push('## Milestones');
  lines.push('');
  for (const milestone of plan.milestones) {
    const sm = scheduledMilestoneById?.get(milestone.id);
    const dateLabel = sm ? formatDisplayDate(sm.date) : 'Unscheduled (blocked)';
    const reqNames = milestone.requiredTaskIds
      .map((id) => {
        const t = taskById.get(id);
        return t ? `${t.name} (${t.id})` : id;
      })
      .join(', ');
    lines.push(`### ${milestone.name} (${milestone.id}) — ${dateLabel}`);
    lines.push(`- **Completion Criteria:** ${milestone.criteria}`);
    lines.push(`- **Required Tasks:** ${reqNames}`);
    lines.push('');
  }

  lines.push('## Tasks');
  lines.push('');
  lines.push('| ID | Task | Deliverable | Effort (person-days) | Prerequisites | Start | Finish |');
  lines.push('| --- | --- | --- | ---: | --- | --- | --- |');

  for (const task of plan.tasks) {
    const st = scheduledTaskById?.get(task.id);
    const prereqLabel =
      task.prerequisiteIds.length === 0
        ? 'None'
        : task.prerequisiteIds
            .map((id) => {
              const p = taskById.get(id);
              return p ? `${p.name} (${p.id})` : id;
            })
            .join('; ');
    const startLabel = st ? formatDisplayDate(st.startDate) : 'Blocked';
    const finishLabel = st ? formatDisplayDate(st.finishDate) : 'Blocked';
    const safeCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    lines.push(
      `| ${safeCell(task.id)} | ${safeCell(task.name)} | ${safeCell(task.deliverable)} | ${task.effortDays} | ${safeCell(prereqLabel)} | ${startLabel} | ${finishLabel} |`,
    );
  }
  lines.push('');

  lines.push('## Planning Assumptions');
  lines.push('');
  for (const assumption of plan.assumptions) {
    lines.push(`- ${assumption}`);
  }
  for (const schedAssumption of schedule.schedulerAssumptions) {
    lines.push(`- ${schedAssumption}`);
  }
  lines.push('');

  lines.push('## External Dependencies');
  lines.push('');
  if (plan.externalDependencies.length === 0) {
    lines.push('- None identified.');
  } else {
    for (const dep of plan.externalDependencies) {
      const q = dep.confirmationQuestion ? ` — *Confirm:* ${dep.confirmationQuestion}` : '';
      lines.push(`- ${dep.description}${q}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}
