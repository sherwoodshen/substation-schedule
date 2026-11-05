import { useState } from 'react';
import MonthCalendar from '../calendar/MonthCalendar.jsx';
import { todayDate } from '../calendar/dates.js';

export default function DateRangePicker({ startDate, endDate, onChange, initialMonth }) {
  const today = todayDate();
  const [month, setMonth] = useState(initialMonth);
  const [open, setOpen] = useState(false);
  const selectingEnd = Boolean(startDate && !endDate);

  function pickDate(date) {
    if (selectingEnd) {
      const [start, end] = [startDate, date].sort();
      onChange(start, end);
      setOpen(false);
    } else {
      onChange(date, '');
    }
  }

  return (
    <fieldset className="space-y-2">
      <legend className="field-label">起止日期</legend>
      <button type="button" aria-expanded={open} aria-controls="task-date-picker" className="control flex w-full flex-wrap items-center justify-between gap-2 text-left"
        onClick={() => setOpen(value => !value)}>
        <span>{startDate || '起始日期'} <span className="mx-1 text-slate-500">至</span> {endDate || '结束日期'}</span>
        <span className="text-xs font-medium text-teal-800">{open ? '收起' : '选择日期'}</span>
      </button>
      {open && (
        <div id="task-date-picker" className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <p className="mb-2 text-sm text-slate-600" aria-live="polite">
            {selectingEnd ? '请选择结束日期。同一天可再次点击。' : '请选择起始日期。'}
          </p>
          <MonthCalendar month={month} today={today} onMonthChange={setMonth} onSelect={pickDate} range={{ startDate, endDate }} />
        </div>
      )}
    </fieldset>
  );
}
