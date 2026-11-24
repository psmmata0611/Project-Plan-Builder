import { useState, useEffect } from 'react';
import { AlertCircle, ArrowRight, CheckSquare } from 'lucide-react';
import { formatDisplayDate } from '../lib/dates';
import { parsePositiveWholeNumber } from '../lib/planValidation';
import type { ProjectPlanData, ScheduleResult, TaskItem } from '../types/plan';

interface TasksViewProps {
  plan: ProjectPlanData;
  schedule: ScheduleResult;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updater: (task: TaskItem) => TaskItem) => void;
}

export function TasksView({
  plan,
  schedule,
  selectedTaskId,
  onSelectTask,
  onUpdateTask,
}: TasksViewProps) {
  const effectiveSelectedId =
    selectedTaskId && plan.tasks.some((t) => t.id === selectedTaskId)
      ? selectedTaskId
      : plan.tasks[0]?.id ?? null;

  const selectedTask = plan.tasks.find((t) => t.id === effectiveSelectedId) ?? null;

  const [effortDraft, setEffortDraft] = useState<string>(
    selectedTask ? String(selectedTask.effortDays) : '1',
  );
  const [effortError, setEffortError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTask) {
      setEffortDraft(String(selectedTask.effortDays));
      setEffortError(null);
    }
  }, [selectedTask?.id, selectedTask?.effortDays]);

  const taskById = new Map(plan.tasks.map((t) => [t.id, t]));
  const scheduledById = schedule.ok
    ? new Map(schedule.tasks.map((t) => [t.id, t]))
    : null;
  const cycleNodeIds =
    !schedule.ok && schedule.cycleNodes
      ? new Set(schedule.cycleNodes.map((n) => n.id))
      : new Set<string>();

  const downstreamTasks = selectedTask
    ? plan.tasks.filter((t) => t.prerequisiteIds.includes(selectedTask.id))
    : [];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Tasks & Schedule Table</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select any row by clicking or pressing Enter/Space to edit details and prerequisites.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-600">
            {plan.tasks.length} tasks
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm min-w-[760px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4 whitespace-nowrap">Task</th>
                <th className="py-2.5 px-4">Deliverable</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Person-days</th>
                <th className="py-2.5 px-4">Prerequisites</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Start</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Finish</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.tasks.map((task) => {
                const isSelected = task.id === effectiveSelectedId;
                const st = scheduledById?.get(task.id);
                const inCycle = cycleNodeIds.has(task.id);
                const isLate = Boolean(
                  schedule.ok && st && st.finishDate > schedule.requestedDeadlineDate,
                );

                const prereqText =
                  task.prerequisiteIds.length === 0
                    ? 'None'
                    : task.prerequisiteIds
                        .map((id) => {
                          const p = taskById.get(id);
                          return p ? `${p.name} (${p.id})` : id;
                        })
                        .join(', ');

                return (
                  <tr
                    key={task.id}
                    tabIndex={0}
                    role="button"
                    aria-selected={isSelected}
                    onClick={() => onSelectTask(task.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectTask(task.id);
                      }
                    }}
                    className={`transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${
                      isSelected
                        ? 'bg-blue-50/80'
                        : inCycle
                          ? 'bg-red-50/40 hover:bg-red-50/70'
                          : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-4 align-top font-medium text-slate-900 min-w-[200px]">
                      <div className="flex items-start gap-2">
                        <span className="font-mono text-xs text-slate-500 mt-0.5 shrink-0">
                          {task.id}
                        </span>
                        <span>{task.name}</span>
                      </div>
                      {inCycle && (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-red-700">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>In dependency cycle</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 align-top text-slate-700 min-w-[180px]">
                      {task.deliverable}
                    </td>
                    <td className="py-3 px-4 align-top text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {task.effortDays}
                    </td>
                    <td className="py-3 px-4 align-top text-slate-600 min-w-[180px]">
                      {prereqText}
                    </td>
                    <td className="py-3 px-4 align-top font-mono tabular-nums text-slate-800 whitespace-nowrap">
                      {st ? formatDisplayDate(st.startDate) : 'Blocked'}
                    </td>
                    <td
                      className={`py-3 px-4 align-top font-mono tabular-nums whitespace-nowrap ${
                        isLate ? 'text-red-700 font-semibold' : 'text-slate-800'
                      }`}
                    >
                      {st ? formatDisplayDate(st.finishDate) : 'Blocked'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selectedTask && (
        <section
          aria-label="Edit selected task"
          className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Edit Task</h3>
              <p className="text-xs font-mono text-slate-500 mt-0.5">ID: {selectedTask.id}</p>
            </div>
            {scheduledById?.get(selectedTask.id) && (
              <div className="text-right text-xs font-mono tabular-nums text-slate-600">
                <div>
                  {formatDisplayDate(scheduledById.get(selectedTask.id)!.startDate)}
                </div>
                <div>
                  to {formatDisplayDate(scheduledById.get(selectedTask.id)!.finishDate)}
                </div>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="edit-task-name"
              className="block text-sm font-medium text-slate-800 mb-1"
            >
              Task name
            </label>
            <input
              id="edit-task-name"
              type="text"
              value={selectedTask.name}
              onChange={(e) => {
                const value = e.target.value;
                onUpdateTask(selectedTask.id, (prev) => ({ ...prev, name: value }));
              }}
              className="w-full min-h-[40px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="edit-task-deliverable"
              className="block text-sm font-medium text-slate-800 mb-1"
            >
              Deliverable
            </label>
            <input
              id="edit-task-deliverable"
              type="text"
              value={selectedTask.deliverable}
              onChange={(e) => {
                const value = e.target.value;
                onUpdateTask(selectedTask.id, (prev) => ({ ...prev, deliverable: value }));
              }}
              className="w-full min-h-[40px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="edit-task-effort"
              className="block text-sm font-medium text-slate-800 mb-1"
            >
              Estimated person-days
            </label>
            <input
              id="edit-task-effort"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={effortDraft}
              onChange={(e) => {
                const raw = e.target.value;
                setEffortDraft(raw);
                const parsed = parsePositiveWholeNumber(raw);
                if (parsed === null) {
                  setEffortError('Enter a whole number of 1 or more person-days.');
                  return;
                }
                setEffortError(null);
                onUpdateTask(selectedTask.id, (prev) => ({ ...prev, effortDays: parsed }));
              }}
              aria-invalid={Boolean(effortError)}
              className={`w-full min-h-[40px] rounded-md border px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                effortError ? 'border-red-500 bg-red-50/40' : 'border-slate-300 bg-white'
              }`}
            />
            {effortError && (
              <p role="alert" className="mt-1 text-xs font-medium text-red-700">
                {effortError}
              </p>
            )}
          </div>

          <fieldset className="border-t border-slate-200 pt-3">
            <legend className="text-sm font-medium text-slate-800 flex items-center gap-1.5 mb-2">
              <CheckSquare className="w-4 h-4 text-blue-600" aria-hidden="true" />
              <span>Prerequisites (must finish first)</span>
            </legend>
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {plan.tasks
                .filter((other) => other.id !== selectedTask.id)
                .map((other) => {
                  const checked = selectedTask.prerequisiteIds.includes(other.id);
                  const otherInCycle = cycleNodeIds.has(other.id);
                  return (
                    <label
                      key={other.id}
                      className={`flex items-start gap-2.5 rounded-md border px-2.5 py-2 text-xs cursor-pointer transition-colors ${
                        checked
                          ? otherInCycle && cycleNodeIds.has(selectedTask.id)
                            ? 'border-red-300 bg-red-50 text-red-900'
                            : 'border-blue-200 bg-blue-50/70 text-slate-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const shouldAdd = e.target.checked;
                          onUpdateTask(selectedTask.id, (prev) => {
                            const next = shouldAdd
                              ? Array.from(new Set([...prev.prerequisiteIds, other.id]))
                              : prev.prerequisiteIds.filter((id) => id !== other.id);
                            return { ...prev, prerequisiteIds: next };
                          });
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                      />
                      <span className="leading-snug">
                        <span className="font-medium">{other.name}</span>{' '}
                        <span className="font-mono text-slate-500">({other.id})</span>
                      </span>
                    </label>
                  );
                })}
            </div>
          </fieldset>

          <div className="border-t border-slate-200 pt-3 space-y-2 text-xs text-slate-600">
            <div>
              <span className="font-semibold text-slate-800">Tasks that must finish first:</span>{' '}
              {selectedTask.prerequisiteIds.length === 0 ? (
                <span>None — this task can start as soon as a team member is free.</span>
              ) : (
                <span>
                  {selectedTask.prerequisiteIds
                    .map((id) => {
                      const p = taskById.get(id);
                      const sp = scheduledById?.get(id);
                      if (!p) return id;
                      return sp
                        ? `${p.name} (${p.id}, finishes ${formatDisplayDate(sp.finishDate)})`
                        : `${p.name} (${p.id})`;
                    })
                    .join('; ')}
                  . This task starts on the next working day after all of them finish.
                </span>
              )}
            </div>

            {downstreamTasks.length > 0 && (
              <div className="flex items-start gap-1.5">
                <ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                <span>
                  <span className="font-semibold text-slate-800">Directly unblocks:</span>{' '}
                  {downstreamTasks.map((d) => `${d.name} (${d.id})`).join(', ')}.
                </span>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
