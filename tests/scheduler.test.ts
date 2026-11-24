import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addCalendarDays,
  addWorkingDays,
  countWorkingDaysAfter,
  resolveEffectiveStart,
} from '../src/lib/dates.ts';
import { buildPlanMarkdown } from '../src/lib/markdown.ts';
import { validateGeneratedPlan, validatePlanInputs } from '../src/lib/planValidation.ts';
import { scheduleProjectPlan } from '../src/lib/scheduler.ts';
import { loadWorkspaceState, saveWorkspaceState, type StorageLike } from '../src/lib/storage.ts';
import type { PlanInputs, ProjectPlanData, WorkspaceState } from '../src/types/plan.ts';

function makeThreeTaskPlan(): ProjectPlanData {
  return {
    title: 'Sample Three-Task Plan',
    successSummary: 'Deliver A, B, and C cleanly.',
    milestones: [
      {
        id: 'M1',
        name: 'All Work Complete',
        criteria: 'Tasks A, B, and C signed off.',
        requiredTaskIds: ['C'],
      },
    ],
    tasks: [
      {
        id: 'A',
        name: 'Build module A',
        deliverable: 'Module A package',
        effortDays: 2,
        prerequisiteIds: [],
      },
      {
        id: 'B',
        name: 'Build module B',
        deliverable: 'Module B package',
        effortDays: 1,
        prerequisiteIds: [],
      },
      {
        id: 'C',
        name: 'Integrate A and B',
        deliverable: 'Integrated release',
        effortDays: 1,
        prerequisiteIds: ['A', 'B'],
      },
    ],
    assumptions: ['Team members are onboarded.'],
    externalDependencies: [
      {
        description: 'IT security sign-off',
        confirmationQuestion: 'Can security review on the day integration finishes?',
      },
    ],
  };
}

test('schedules A=2d and B=1d in parallel with 2 people, C=1d starting day 3', () => {
  const plan = makeThreeTaskPlan();
  // 2026-11-23 is Monday
  const result = scheduleProjectPlan(plan, {
    startDate: '2026-11-23',
    deadlineDate: '2026-11-27',
    teamSize: 2,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const byId = new Map(result.tasks.map((t) => [t.id, t]));
  assert.equal(byId.get('A')?.startWorkingDay, 1);
  assert.equal(byId.get('A')?.finishWorkingDay, 2);
  assert.equal(byId.get('A')?.startDate, '2026-11-23');
  assert.equal(byId.get('A')?.finishDate, '2026-11-24');

  assert.equal(byId.get('B')?.startWorkingDay, 1);
  assert.equal(byId.get('B')?.finishWorkingDay, 1);
  assert.equal(byId.get('B')?.startDate, '2026-11-23');
  assert.equal(byId.get('B')?.finishDate, '2026-11-23');

  assert.equal(byId.get('C')?.startWorkingDay, 3);
  assert.equal(byId.get('C')?.finishWorkingDay, 3);
  assert.equal(byId.get('C')?.startDate, '2026-11-25');
  assert.equal(byId.get('C')?.finishDate, '2026-11-25');

  assert.equal(result.totalWorkingDays, 3);
  assert.equal(result.totalEffortDays, 4);
  assert.equal(result.projectFinishDate, '2026-11-25');
  assert.equal(result.milestones[0]?.date, '2026-11-25');
  assert.equal(result.meetsDeadline, true);
});

test('recalculates to 1 person finishing day 4 with unchanged 4 person-day effort', () => {
  const plan = makeThreeTaskPlan();
  const result = scheduleProjectPlan(plan, {
    startDate: '2026-11-23',
    deadlineDate: '2026-11-27',
    teamSize: 1,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const byId = new Map(result.tasks.map((t) => [t.id, t]));
  assert.equal(byId.get('A')?.startWorkingDay, 1);
  assert.equal(byId.get('A')?.finishWorkingDay, 2);
  assert.equal(byId.get('B')?.startWorkingDay, 3);
  assert.equal(byId.get('B')?.finishWorkingDay, 3);
  assert.equal(byId.get('C')?.startWorkingDay, 4);
  assert.equal(byId.get('C')?.finishWorkingDay, 4);

  assert.equal(result.totalWorkingDays, 4);
  assert.equal(result.totalEffortDays, 4);
  assert.equal(result.projectFinishDate, '2026-11-26');
});

test('day-2 deadline produces a miss, retains projected finish, and offers specific decision', () => {
  const plan = makeThreeTaskPlan();
  // Day 2 from Mon 2026-11-23 is Tue 2026-11-24
  const result = scheduleProjectPlan(plan, {
    startDate: '2026-11-23',
    deadlineDate: '2026-11-24',
    teamSize: 2,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.meetsDeadline, false);
  assert.equal(result.projectFinishDate, '2026-11-25');
  assert.equal(result.workingDaysLate, 1);
  assert.ok(result.decisionToExplore);
  assert.match(result.decisionToExplore, /"Integrate A and B" \(C/);
});

test('adding a cycle produces named actionable errors and does not invent schedule dates', () => {
  const plan = makeThreeTaskPlan();
  plan.tasks[0].prerequisiteIds = ['C']; // A -> C -> A cycle

  const result = scheduleProjectPlan(plan, {
    startDate: '2026-11-23',
    deadlineDate: '2026-11-30',
    teamSize: 2,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.code, 'CYCLE');
  assert.match(result.message, /Build module A \(A\)/);
  assert.match(result.message, /Integrate A and B \(C\)/);
  assert.match(result.message, /Tasks editor/i);
  assert.ok(!('tasks' in result));
});

test('weekend rollover moves Saturday and Sunday starts to Monday', () => {
  // 2026-11-28 is Saturday, 2026-11-29 is Sunday, 2026-11-30 is Monday
  const sat = resolveEffectiveStart('2026-11-28');
  assert.equal(sat.rolledOverFromWeekend, true);
  assert.equal(sat.effectiveStart, '2026-11-30');

  const sun = resolveEffectiveStart('2026-11-29');
  assert.equal(sun.rolledOverFromWeekend, true);
  assert.equal(sun.effectiveStart, '2026-11-30');

  const mon = resolveEffectiveStart('2026-11-30');
  assert.equal(mon.rolledOverFromWeekend, false);
  assert.equal(mon.effectiveStart, '2026-11-30');

  const plan = makeThreeTaskPlan();
  const sched = scheduleProjectPlan(plan, {
    startDate: '2026-11-28',
    deadlineDate: '2026-12-10',
    teamSize: 2,
  });
  assert.equal(sched.ok, true);
  if (!sched.ok) return;
  assert.equal(sched.rolledOverFromWeekend, true);
  assert.equal(sched.effectiveStartDate, '2026-11-30');
  assert.equal(sched.tasks[0]?.startDate, '2026-11-30');
});

test('calendar arithmetic remains exact across DST boundaries', () => {
  // UK/Europe clocks go forward Sun 2026-03-29 and US clocks go back Sun 2026-11-01
  assert.equal(addCalendarDays('2026-03-27', 3), '2026-03-30');
  assert.equal(addWorkingDays('2026-03-27', 1), '2026-03-30');
  assert.equal(addCalendarDays('2026-10-30', 4), '2026-11-03');
  assert.equal(addWorkingDays('2026-10-30', 2), '2026-11-03');
  assert.equal(countWorkingDaysAfter('2026-03-27', '2026-03-31'), 2);
});

test('unique downstream effort avoids double-counting diamond dependencies', () => {
  const diamondPlan: ProjectPlanData = {
    title: 'Diamond Priority',
    successSummary: 'Prioritise unique downstream effort.',
    milestones: [
      { id: 'M1', name: 'Done', criteria: 'All done', requiredTaskIds: ['Z'] },
    ],
    tasks: [
      // T_LOW has 2 direct dependents X(1) and Y(1) that both feed Z(5) -> unique downstream = 1+1+5 = 7
      // T_HIGH has 1 direct dependent W(8) -> unique downstream = 8
      { id: 'T_LOW', name: 'Low path', deliverable: 'D1', effortDays: 1, prerequisiteIds: [] },
      { id: 'T_HIGH', name: 'High path', deliverable: 'D2', effortDays: 1, prerequisiteIds: [] },
      { id: 'X', name: 'Branch X', deliverable: 'DX', effortDays: 1, prerequisiteIds: ['T_LOW'] },
      { id: 'Y', name: 'Branch Y', deliverable: 'DY', effortDays: 1, prerequisiteIds: ['T_LOW'] },
      { id: 'Z', name: 'Join Z', deliverable: 'DZ', effortDays: 5, prerequisiteIds: ['X', 'Y'] },
      { id: 'W', name: 'Long W', deliverable: 'DW', effortDays: 8, prerequisiteIds: ['T_HIGH'] },
    ],
    assumptions: [],
    externalDependencies: [],
  };

  const result = scheduleProjectPlan(diamondPlan, {
    startDate: '2026-11-23',
    deadlineDate: '2026-12-31',
    teamSize: 1,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const byId = new Map(result.tasks.map((t) => [t.id, t]));
  assert.equal(byId.get('T_LOW')?.downstreamEffortDays, 7);
  assert.equal(byId.get('T_HIGH')?.downstreamEffortDays, 8);
  // T_HIGH (downstream 8) starts day 1 before T_LOW (downstream 7) on day 2
  assert.equal(byId.get('T_HIGH')?.startWorkingDay, 1);
  assert.equal(byId.get('T_LOW')?.startWorkingDay, 2);
});

test('validates generated plans against duplicate IDs, missing refs, cycles, and bad estimates', () => {
  const valid = validateGeneratedPlan(makeThreeTaskPlan());
  assert.equal(valid.ok, true);

  const dupTask = makeThreeTaskPlan();
  dupTask.tasks.push({ ...dupTask.tasks[0] });
  assert.equal(validateGeneratedPlan(dupTask).ok, false);

  const missingPrereq = makeThreeTaskPlan();
  missingPrereq.tasks[2].prerequisiteIds = ['NO_SUCH_TASK'];
  assert.equal(validateGeneratedPlan(missingPrereq).ok, false);

  const cyclic = makeThreeTaskPlan();
  cyclic.tasks[0].prerequisiteIds = ['C'];
  assert.equal(validateGeneratedPlan(cyclic).ok, false);

  const zeroEffort = makeThreeTaskPlan();
  zeroEffort.tasks[0].effortDays = 0;
  assert.equal(validateGeneratedPlan(zeroEffort).ok, false);

  const badMilestoneRef = makeThreeTaskPlan();
  badMilestoneRef.milestones[0].requiredTaskIds = ['MISSING'];
  assert.equal(validateGeneratedPlan(badMilestoneRef).ok, false);

  const inputCheck = validatePlanInputs({
    goal: '   ',
    startDate: '2026-11-28', // Sat -> Mon 2026-11-30
    deadlineDate: '2026-11-29', // Sun < effective Mon
    teamSize: '1.5',
  });
  assert.equal(inputCheck.valid, false);
  assert.ok(inputCheck.errors.goal);
  assert.ok(inputCheck.errors.teamSize);
  assert.ok(inputCheck.errors.deadlineDate);
});

test('exports latest Markdown after edits and handles blocked cycles cleanly', () => {
  const plan = makeThreeTaskPlan();
  plan.tasks[0] = {
    ...plan.tasks[0],
    name: 'Design booking schema',
    effortDays: 3,
  };
  const inputs: PlanInputs = {
    goal: 'Launch booking pilot',
    startDate: '2026-11-23',
    deadlineDate: '2026-11-30',
    teamSize: 2,
    context: 'Requires IT approval',
  };

  const schedule = scheduleProjectPlan(plan, {
    startDate: inputs.startDate,
    deadlineDate: inputs.deadlineDate,
    teamSize: inputs.teamSize,
  });
  const md = buildPlanMarkdown(inputs, plan, schedule);

  assert.match(md, /# Sample Three-Task Plan/);
  assert.match(md, /Design booking schema/);
  assert.match(md, /\| A \| Design booking schema \| Module A package \| 3 \|/);
  assert.match(md, /Build module A|Design booking schema \(A\); Build module B \(B\)/);
  assert.match(md, /IT security sign-off/);

  // Cycle state should export without inventing dates
  plan.tasks[0].prerequisiteIds = ['C'];
  const blocked = scheduleProjectPlan(plan, {
    startDate: inputs.startDate,
    deadlineDate: inputs.deadlineDate,
    teamSize: inputs.teamSize,
  });
  const blockedMd = buildPlanMarkdown(inputs, plan, blocked);
  assert.match(blockedMd, /Schedule Status:\*\* Blocked/);
  assert.match(blockedMd, /\| Blocked \| Blocked \|/);
});

test('persists workspace state and restores deterministic schedule', () => {
  const store = new Map<string, string>();
  const mockStorage: StorageLike = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };

  const plan = makeThreeTaskPlan();
  plan.tasks[1].effortDays = 4;

  const state: WorkspaceState = {
    version: 1,
    inputs: {
      goal: 'Pilot booking service',
      startDate: '2026-11-23',
      deadlineDate: '2026-12-04',
      teamSize: 2,
      context: '',
    },
    plan,
    hasEdits: true,
    selectedTaskId: 'B',
    activeView: 'tasks',
    contextExpanded: true,
  };

  saveWorkspaceState(state, mockStorage);
  const restored = loadWorkspaceState(mockStorage);
  assert.ok(restored);
  assert.equal(restored.hasEdits, true);
  assert.equal(restored.selectedTaskId, 'B');
  assert.equal(restored.plan?.tasks[1]?.effortDays, 4);

  const s1 = scheduleProjectPlan(state.plan!, state.inputs);
  const s2 = scheduleProjectPlan(restored.plan!, restored.inputs);
  assert.deepEqual(s1, s2);
});
