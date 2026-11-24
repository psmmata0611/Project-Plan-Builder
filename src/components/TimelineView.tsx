import { AlertTriangle } from 'lucide-react';
import {
  formatDisplayDate,
  formatShortDate,
  formatWeekdayShort,
  isWeekend,
  listCalendarDatesInclusive,
} from '../lib/dates';
import type { ScheduleResult } from '../types/plan';

interface TimelineViewProps {
  schedule: ScheduleResult;
  onOpenTasks: () => void;
}

export function TimelineView({ schedule, onOpenTasks }: TimelineViewProps) {
  if (!schedule.ok) {
    return (
      <section className="bg-white border border-slate-200 rounded-lg p-6 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-50 text-red-700">
          <AlertTriangle className="w-5 h-5" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-slate-900">Timeline Unavailable</h2>
        <p className="text-sm text-slate-600 max-w-lg mx-auto">{schedule.message}</p>
        <button
          type="button"
          onClick={onOpenTasks}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          Open Tasks editor
        </button>
      </section>
    );
  }

  const timelineStart = schedule.effectiveStartDate;
  const timelineEnd =
    schedule.projectFinishDate >= schedule.requestedDeadlineDate
      ? schedule.projectFinishDate
      : schedule.requestedDeadlineDate;

  const calendarDays = listCalendarDatesInclusive(timelineStart, timelineEnd);
  const indexByDate = new Map(calendarDays.map((d, idx) => [d, idx]));
  const dayColWidth = calendarDays.length > 42 ? 36 : 44;
  const gridWidth = calendarDays.length * dayColWidth;
  const deadlineIdx = indexByDate.get(schedule.requestedDeadlineDate) ?? calendarDays.length - 1;

  // Group milestones that land on the same date cleanly
  const milestonesByDateIdx = new Map<number, typeof schedule.milestones>();
  for (const m of schedule.milestones) {
    const idx = indexByDate.get(m.date);
    if (idx !== undefined) {
      const list = milestonesByDateIdx.get(idx) ?? [];
      list.push(m);
      milestonesByDateIdx.set(idx, list);
    }
  }

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Project Gantt Timeline</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Calendar dates from effective start ({formatDisplayDate(timelineStart)}) across{' '}
              <span className="font-mono tabular-nums">{calendarDays.length}</span> calendar days.
              Exact task dates are also shown in the Tasks table.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-blue-600 inline-block" aria-hidden="true" />
              <span>Task span</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-red-600 inline-block" aria-hidden="true" />
              <span>Past deadline</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rotate-45 bg-blue-700 inline-block" aria-hidden="true" />
              <span>Milestone</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-0.5 h-3.5 bg-red-600 inline-block" aria-hidden="true" />
              <span>Requested deadline</span>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto" role="region" aria-label="Gantt timeline chart" tabIndex={0}>
          <div style={{ minWidth: 148 + gridWidth }} className="relative select-none">
            {/* Calendar Header Row */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              <div
                className="sticky left-0 z-20 w-[148px] sm:w-[220px] shrink-0 bg-slate-50 border-r border-slate-200 px-3 sm:px-4 py-2.5 flex items-end justify-between text-xs font-semibold text-slate-700"
              >
                <span>Task / Checkpoint</span>
                <span className="font-mono text-slate-500">Eff.</span>
              </div>

              <div className="relative flex" style={{ width: gridWidth }}>
                {calendarDays.map((dateStr, idx) => {
                  const weekend = isWeekend(dateStr);
                  const isFirstOfMonth = dateStr.endsWith('-01') || idx === 0;
                  const isDeadline = dateStr === schedule.requestedDeadlineDate;
                  return (
                    <div
                      key={dateStr}
                      style={{ width: dayColWidth }}
                      className={`shrink-0 border-r border-slate-200/80 py-1.5 text-center font-mono tabular-nums ${
                        weekend ? 'bg-slate-100 text-slate-400' : 'text-slate-700'
                      } ${isDeadline ? 'bg-red-50/70' : ''}`}
                    >
                      <div className="text-[10px] leading-tight uppercase">
                        {isFirstOfMonth ? formatShortDate(dateStr).split(' ')[1] : formatWeekdayShort(dateStr).slice(0, 2)}
                      </div>
                      <div className="text-xs font-semibold leading-tight mt-0.5">
                        {dateStr.slice(8)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Milestones Checkpoint Row */}
            <div className="flex border-b border-slate-200 bg-slate-50/40 relative">
              <div
                className="sticky left-0 z-20 w-[148px] sm:w-[220px] shrink-0 bg-slate-50 border-r border-slate-200 px-3 sm:px-4 py-2.5 text-xs font-semibold text-slate-800 flex items-center"
              >
                Milestones
              </div>
              <div className="relative h-10" style={{ width: gridWidth }}>
                {/* Day grid background */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {calendarDays.map((dateStr) => (
                    <div
                      key={`bg-m-${dateStr}`}
                      style={{ width: dayColWidth }}
                      className={`shrink-0 border-r border-slate-100 ${
                        isWeekend(dateStr) ? 'bg-slate-100/70' : ''
                      }`}
                    />
                  ))}
                </div>

                {/* Deadline Vertical Line & Flag */}
                <div
                  style={{ left: (deadlineIdx + 1) * dayColWidth - 1 }}
                  className="absolute top-0 bottom-0 w-0.5 bg-red-600 z-10 pointer-events-none"
                >
                  <span
                    className={`absolute top-0.5 whitespace-nowrap rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white font-mono ${
                      deadlineIdx < 3 ? 'left-1' : 'right-1'
                    }`}
                  >
                    Deadline {formatShortDate(schedule.requestedDeadlineDate)}
                  </span>
                </div>

                {/* Milestone Diamonds */}
                {Array.from(milestonesByDateIdx.entries()).map(([idx, ms]) => {
                  const leftCenter = idx * dayColWidth + dayColWidth / 2;
                  const label = ms.map((m) => m.id).join(', ');
                  const title = ms.map((m) => `${m.name} (${m.id}): ${formatDisplayDate(m.date)}`).join(' | ');
                  return (
                    <div
                      key={`ms-col-${idx}`}
                      style={{ left: leftCenter }}
                      title={title}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 flex items-center gap-1"
                    >
                      <span className="w-3 h-3 rotate-45 bg-blue-700 border border-white shadow-xs inline-block shrink-0" />
                      <span className="text-[11px] font-mono font-semibold text-blue-900 bg-white/90 px-1 rounded border border-blue-200 whitespace-nowrap">
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Task Bars */}
            {schedule.tasks.map((task) => {
              const startIdx = indexByDate.get(task.startDate) ?? 0;
              const finishIdx = indexByDate.get(task.finishDate) ?? startIdx;
              const barLeft = startIdx * dayColWidth + 3;
              const barWidth = Math.max((finishIdx - startIdx + 1) * dayColWidth - 6, 12);
              const pastDeadline = task.finishDate > schedule.requestedDeadlineDate;

              return (
                <div
                  key={task.id}
                  className="flex border-b border-slate-100 hover:bg-slate-50/70 transition-colors"
                >
                  <div
                    className="sticky left-0 z-20 w-[148px] sm:w-[220px] shrink-0 bg-white border-r border-slate-200 px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 truncate" title={`${task.name} (${task.id})`}>
                        <span className="font-mono text-slate-500 mr-1.5">{task.id}</span>
                        <span>{task.name}</span>
                      </div>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                      {task.effortDays}d
                    </span>
                  </div>

                  <div className="relative h-10" style={{ width: gridWidth }}>
                    {/* Grid cells */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {calendarDays.map((dateStr) => (
                        <div
                          key={`bg-${task.id}-${dateStr}`}
                          style={{ width: dayColWidth }}
                          className={`shrink-0 border-r border-slate-100 ${
                            isWeekend(dateStr) ? 'bg-slate-100/70' : ''
                          }`}
                        />
                      ))}
                    </div>

                    {/* Deadline Vertical Line */}
                    <div
                      style={{ left: (deadlineIdx + 1) * dayColWidth - 1 }}
                      className="absolute top-0 bottom-0 w-0.5 bg-red-600/80 z-10 pointer-events-none"
                    />

                    {/* Task Bar */}
                    <div
                      style={{ left: barLeft, width: barWidth }}
                      title={`${task.name} (${task.id}): ${formatDisplayDate(task.startDate)} to ${formatDisplayDate(task.finishDate)} (${task.effortDays} person-day${task.effortDays === 1 ? '' : 's'})`}
                      className={`absolute top-2 bottom-2 rounded flex items-center px-2 text-[11px] font-medium text-white shadow-xs overflow-hidden whitespace-nowrap ${
                        pastDeadline ? 'bg-red-600' : 'bg-blue-600'
                      }`}
                    >
                      <span className="truncate font-mono">
                        {task.id} · {formatShortDate(task.startDate)}–{formatShortDate(task.finishDate)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-slate-700 mb-2">Milestone Checkpoints</h3>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-700">
          {schedule.milestones.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="font-mono font-semibold text-blue-700">{m.id}</span>
              <span>{m.name}</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-mono tabular-nums text-slate-600">
                {formatDisplayDate(m.date)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
