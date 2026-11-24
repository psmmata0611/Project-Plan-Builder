import { CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import { formatDisplayDate } from '../lib/dates';
import type { PlanInputs, ProjectPlanData, ScheduleResult } from '../types/plan';

interface OverviewViewProps {
  inputs: PlanInputs;
  plan: ProjectPlanData;
  schedule: ScheduleResult;
}

export function OverviewView({ inputs, plan, schedule }: OverviewViewProps) {
  const taskById = new Map(plan.tasks.map((t) => [t.id, t]));
  const totalEffort = plan.tasks.reduce((sum, t) => sum + t.effortDays, 0);
  const milestoneMap = schedule.ok
    ? new Map(schedule.milestones.map((m) => [m.id, m]))
    : null;

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6">
        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 text-balance">
            {plan.title}
          </h2>
          <p className="text-sm text-slate-700 leading-relaxed">{plan.successSummary}</p>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-500 mb-1">Project goal</div>
          <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{inputs.goal}</p>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/60">
            <div className="text-xs font-medium text-slate-500">Requested deadline</div>
            <div className="mt-1 text-base font-semibold font-mono tabular-nums text-slate-900">
              {formatDisplayDate(inputs.deadlineDate)}
            </div>
          </div>

          <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/60">
            <div className="text-xs font-medium text-slate-500">Projected finish</div>
            <div className="mt-1 text-base font-semibold font-mono tabular-nums text-slate-900">
              {schedule.ok ? formatDisplayDate(schedule.projectFinishDate) : 'Blocked by cycle'}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {schedule.ok
                ? `${schedule.totalWorkingDays} working days · projected under current assumptions`
                : 'Resolve cycle in Tasks to calculate dates'}
            </div>
          </div>

          <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/60">
            <div className="text-xs font-medium text-slate-500">Total estimated effort</div>
            <div className="mt-1 text-base font-semibold font-mono tabular-nums text-slate-900">
              {totalEffort} person-day{totalEffort === 1 ? '' : 's'}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {plan.tasks.length} tasks · team of {inputs.teamSize}
            </div>
          </div>

          <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/60">
            <div className="text-xs font-medium text-slate-500">Deadline status</div>
            {schedule.ok ? (
              schedule.meetsDeadline ? (
                <div className="mt-1 flex items-center gap-1.5 text-base font-semibold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>On track</span>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-1.5 text-base font-semibold text-red-700">
                  <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Misses by {schedule.workingDaysLate}d</span>
                </div>
              )
            ) : (
              <div className="mt-1 flex items-center gap-1.5 text-base font-semibold text-amber-700">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Schedule blocked</span>
              </div>
            )}
            <div className="mt-0.5 text-xs text-slate-500">
              {schedule.ok
                ? schedule.meetsDeadline
                  ? `${schedule.workingDaysBuffer} working day${schedule.workingDaysBuffer === 1 ? '' : 's'} buffer`
                  : `${schedule.workingDaysLate} working day${schedule.workingDaysLate === 1 ? '' : 's'} past deadline`
                : 'No dates invented while blocked'}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Milestones & Completion Criteria</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-2.5 pr-4 whitespace-nowrap">Milestone</th>
                <th className="py-2.5 pr-4 whitespace-nowrap">Checkpoint Date</th>
                <th className="py-2.5 pr-4">Completion Criteria</th>
                <th className="py-2.5">Required Tasks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.milestones.map((m) => {
                const sm = milestoneMap?.get(m.id);
                return (
                  <tr key={m.id} className="align-top">
                    <td className="py-3 pr-4 font-medium text-slate-900 whitespace-nowrap">
                      <span>{m.name}</span>
                      <span className="ml-1.5 font-mono text-xs text-slate-500">({m.id})</span>
                    </td>
                    <td className="py-3 pr-4 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                      {sm ? formatDisplayDate(sm.date) : 'Blocked'}
                    </td>
                    <td className="py-3 pr-4 text-slate-700 leading-relaxed min-w-[240px]">
                      {m.criteria}
                    </td>
                    <td className="py-3 text-slate-600 min-w-[200px]">
                      {m.requiredTaskIds
                        .map((id) => {
                          const t = taskById.get(id);
                          return t ? `${t.name} (${t.id})` : id;
                        })
                        .join(', ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-3">Planning & Schedule Assumptions</h3>
          <ul className="space-y-2.5 text-sm text-slate-700 list-disc pl-5">
            {plan.assumptions.map((item, idx) => (
              <li key={`plan-a-${idx}`} className="leading-relaxed">
                {item}
              </li>
            ))}
            {schedule.schedulerAssumptions.map((item, idx) => (
              <li key={`sched-a-${idx}`} className="leading-relaxed text-slate-600">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-3">External Dependencies & Confirmations</h3>
          {plan.externalDependencies.length === 0 ? (
            <p className="text-sm text-slate-600">No external dependencies flagged.</p>
          ) : (
            <ul className="space-y-3.5">
              {plan.externalDependencies.map((dep, idx) => (
                <li
                  key={`dep-${idx}`}
                  className="border border-slate-200 rounded-md p-3.5 bg-slate-50/50 space-y-1.5"
                >
                  <p className="text-sm font-medium text-slate-900 leading-relaxed">
                    {dep.description}
                  </p>
                  {dep.confirmationQuestion && (
                    <p className="text-xs text-blue-800 flex items-start gap-1.5 leading-relaxed">
                      <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
                      <span>
                        <span className="font-semibold">Confirm:</span> {dep.confirmationQuestion}
                      </span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
