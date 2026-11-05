import { useState } from 'react';
import { saveAs } from 'file-saver';
import Modal from '../../components/Modal.jsx';
import DateRangePicker from '../intake/DateRangePicker.jsx';
import { createScheduleWorkbook, getPlansInDateRange } from '../../services/exportPlans.mjs';

export default function ExportModal({ plans, initialMonth, onClose }) {
  const [range, setRange] = useState({ startDate: '', endDate: '' });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const matchingCount = range.startDate && range.endDate ? getPlansInDateRange(plans, range).length : 0;

  async function handleExport(event) {
    event.preventDefault();
    if (exporting) return;
    setError('');
    setMessage('');
    setExporting(true);
    try {
      const workbook = createScheduleWorkbook(plans, range);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `巡视安排_${range.startDate}_至_${range.endDate}.xlsx`);
      setMessage(`已生成 ${matchingCount} 条巡视安排的 Excel，请在浏览器下载中查看。`);
    } catch (error) {
      setError(error instanceof RangeError ? error.message : '导出失败，请重试。');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal title="导出巡视安排" busy={exporting} onClose={onClose}>
      <form onSubmit={handleExport}>
        <fieldset disabled={exporting} className="space-y-4 p-4 sm:p-6">
          <legend className="sr-only">导出配置</legend>
          <p className="text-sm leading-relaxed text-slate-600">选择需要导出的日期范围，可跨月选择。范围内所有已确认的计划都会列入 Excel。</p>
          <DateRangePicker {...range} initialMonth={initialMonth} onChange={(startDate, endDate) => {
            setRange({ startDate, endDate });
            setError('');
            setMessage('');
          }} />
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700" aria-live="polite">
            {range.startDate && range.endDate ? `选定范围内共 ${matchingCount} 条计划` : '请依次选择起始日期和结束日期。'}
          </p>
          <p className="text-xs leading-relaxed text-slate-500">横向 A4 · 一页宽 · 跨页重复表头 · 预留巡视人签字栏</p>
          {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
          {message && <p role="status" className="text-sm text-teal-900">{message}</p>}
        </fieldset>
        <div className="panel-footer justify-end">
          <button type="submit" className="primary-button" disabled={exporting}>
            {exporting ? '正在生成…' : '确认导出'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
