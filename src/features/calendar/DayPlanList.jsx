import { formatTaskName } from '../../services/taskName.mjs';
import { cleanEquipmentText } from '../../services/equipmentDisplay.mjs';

const columns = ['日期', '变电站', '保电任务', '保电设备', '巡视记录', '测温记录'];

export default function DayPlanList({ date, plans }) {
  return (
    <div className="p-4 sm:p-6">
      <p className="mb-4 flex items-center justify-between gap-2 text-sm text-slate-600">
        <time dateTime={date} className="font-semibold tabular-nums text-slate-900">{date}</time>
        <span>{plans.length} 条计划</span>
      </p>
      <p className="mb-2 text-xs text-slate-500 sm:hidden">表格可左右滑动查看，计划较多时可在表内上下滚动。</p>
      <div role="region" aria-label="当天巡视计划表格" tabIndex={0}
        className="max-h-[min(60dvh,32rem)] overflow-auto rounded-xl border border-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
        <table className="review-table w-full min-w-[56rem] text-left text-sm">
          <caption className="sr-only">{date} 特殊巡视计划明细，共 {plans.length} 条</caption>
          <thead className="sticky top-0 z-1 border-b border-slate-200 bg-slate-50 text-slate-600 shadow-[0_1px_0_var(--color-slate-200)]">
            <tr>{columns.map(column => <th key={column} scope="col" className="whitespace-nowrap font-medium">{column}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plans.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-600">当天暂无已确认的特殊巡视计划。</td></tr>
            )}
            {plans.map(row => (
              <tr key={row.id} className="hover:bg-slate-50/80">
                <td className="whitespace-nowrap tabular-nums">
                  <time dateTime={date}>{date}</time>
                  {row.isPreStart && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">T−1</span>}
                </td>
                <th scope="row" className="whitespace-nowrap font-medium text-slate-950">
                  {row.stationName}
                </th>
                <td className="min-w-36 max-w-56 font-medium wrap-break-word text-slate-900">{formatTaskName(row)}</td>
                <td className="min-w-48 max-w-80 leading-relaxed wrap-break-word whitespace-pre-wrap text-slate-700">{cleanEquipmentText(row.equipment, row.stationName) || '—'}</td>
                <td className="whitespace-nowrap font-medium tabular-nums text-slate-900">
                  {row.method === 'robot' ? '机器' : '人工'} {row.inspectionCount} 次
                </td>
                <td className="whitespace-nowrap tabular-nums text-slate-700">测温 {row.temperatureCount} 次</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
