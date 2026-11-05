export default function DayPlanList({ date, plans }) {
  return (
    <div className="p-4 sm:p-6">
      <p className="mb-4 flex items-center justify-between gap-2 text-sm text-slate-600">
        <time dateTime={date} className="font-semibold tabular-nums text-slate-900">{date}</time>
        <span>{plans.length} 条计划</span>
      </p>
      {plans.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">当天暂无已确认的特殊巡视计划。</p>
      ) : (
        <ul className="space-y-3">
          {plans.map(row => (
            <li key={row.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{row.stationName} <span className="text-xs font-normal text-slate-600">{row.voltage}</span></h3>
                <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-medium text-teal-900">{row.taskType} {row.level}级</span>
                {row.isPreStart && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-900">T−1</span>}
              </div>
              {row.noticeNumber && <p className="mt-2 wrap-break-word text-slate-600">通知 / 事件 · {row.noticeNumber}</p>}
              <p className="mt-2 wrap-break-word whitespace-pre-wrap text-slate-700">{row.equipment}</p>
              <p className="mt-2 font-medium tabular-nums">
                {row.method === 'robot' ? '机器' : '人工'} · 巡视 {row.inspectionCount} 次 · 测温 {row.temperatureCount} 次
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
