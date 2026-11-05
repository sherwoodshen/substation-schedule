import { daysInMonth, shiftMonth } from './dates.js';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

export default function MonthCalendar({
  month, today, onMonthChange, onSelect, plansByDate, range,
}) {
  const [year, monthNumber] = month.split('-');
  const compact = Boolean(range);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold tabular-nums sm:text-xl" aria-live="polite">
          {year} 年 {Number(monthNumber)} 月
        </h3>
        <div className="flex items-center gap-1">
          <button className="secondary-button" type="button" onClick={() => onMonthChange(shiftMonth(month, -1))}
            aria-label="上个月">‹</button>
          {!compact && (
            <button className="secondary-button" type="button" onClick={() => onMonthChange(today.slice(0, 7))}>今天</button>
          )}
          <button className="secondary-button" type="button" onClick={() => onMonthChange(shiftMonth(month, 1))}
            aria-label="下个月">›</button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 sm:gap-1.5">
        {weekdays.map(day => (
          <div key={day} className="py-2 text-center text-xs font-medium text-slate-600" aria-label={`星期${day}`}>
            {day}
          </div>
        ))}
        {daysInMonth(month).map((date, index) => {
          if (!date) return <span aria-hidden="true" key={`blank-${index}`} />;

          const count = plansByDate?.get(date)?.length ?? 0;
          const selected = date === range?.startDate || date === range?.endDate;
          const withinRange = range?.endDate && date > range.startDate && date < range.endDate;
          const rangeStyle = selected ? 'border-teal-700 bg-teal-700 text-white hover:bg-teal-800'
            : withinRange ? 'border-teal-100 bg-teal-50' : 'border-slate-200 bg-white hover:bg-slate-50';

          return (
            <button key={date} type="button" onClick={() => onSelect(date)}
              aria-label={count ? `${date}，${count} 条计划` : date}
              aria-current={date === today ? 'date' : undefined}
              aria-pressed={compact ? Boolean(selected || withinRange) : undefined}
              className={`flex min-w-0 flex-col items-center rounded-lg border text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 ${rangeStyle} ${compact ? 'min-h-9 justify-center' : 'min-h-13 gap-1 px-1 py-2 sm:min-h-21 sm:items-start sm:px-3 sm:py-2.5'}`}>
              <span className={date === today && !selected ? 'font-semibold text-teal-800 underline decoration-2 underline-offset-3' : 'font-medium'}>
                {Number(date.slice(-2))}
              </span>
              {count > 0 && (
                <span aria-hidden="true" className="flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-800">
                  <span className="size-1.5 rounded-full bg-rose-600" />
                  <span className="hidden sm:inline">{count} 条</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
