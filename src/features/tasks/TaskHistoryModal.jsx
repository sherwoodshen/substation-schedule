import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import DayPlanList from '../calendar/DayPlanList.jsx';
import { downloadSchedule } from '../../services/downloadSchedule.mjs';
import { deleteTaskById } from '../../storage/planRepository.js';

export default function TaskHistoryModal({ tasks, plans, onClose, onEdit, onPlanUpdated, onTaskUpdated }) {
  const [selectedId, setSelectedId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [deletedTaskIds, setDeletedTaskIds] = useState(new Set());
  const [deletingId, setDeletingId] = useState(null);
  const busy = exporting || deletingId !== null;
  const visibleTasks = tasks.filter(task => !deletedTaskIds.has(task.taskId));
  const selected = visibleTasks.find(task => task.taskId === selectedId);

  async function deleteTask(task) {
    if (busy || !window.confirm(`确认删除任务「${task.taskName}」吗？删除后该任务下的所有排班明细将一并清除且无法恢复！`)) return;
    setDeletingId(task.taskId);
    setError('');
    try {
      await deleteTaskById(task.taskId);
    } catch {
      setError('删除任务失败，请重试。任务及明细均未删除。');
      return;
    } finally {
      setDeletingId(null);
    }
    setDeletedTaskIds(current => new Set(current).add(task.taskId));
    onTaskUpdated?.(task.taskId);
  }

  async function exportTask(task) {
    setExporting(true);
    setError('');
    try {
      const rows = plans.filter(row => row.taskId === task.taskId).sort((left, right) => left.date.localeCompare(right.date));
      if (!rows.length) throw new RangeError('此任务暂无可导出的排班明细。');
      const filename = task.taskName.replace(/[\\/:*?"<>|]/gu, '-').slice(0, 60);
      await downloadSchedule(rows, { startDate: rows[0].date, endDate: rows.at(-1).date }, `任务_${filename}.xlsx`);
    } catch (error) {
      setError(error instanceof RangeError ? error.message : '任务导出失败，请重试。');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal title="排班任务记录" wide busy={busy} onClose={onClose}>
      {error && <p role="alert" className="m-4 text-sm text-red-800">{error}</p>}
      {selected ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6">
            <h3 className="min-w-0 text-lg font-semibold wrap-break-word">{selected.taskName}</h3>
            <div className="flex gap-2">
              <button type="button" className="secondary-button" disabled={busy} onClick={() => { setSelectedId(null); setError(''); }}>返回任务列表</button>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => exportTask(selected)}>导出本任务</button>
              <button type="button" className="primary-button" disabled={busy} onClick={() => onEdit(selected)}>编辑</button>
            </div>
          </div>
          <DayPlanList key={selected.taskId} plans={plans.filter(row => row.taskId === selected.taskId)} onPlanUpdated={onPlanUpdated} />
        </>
      ) : (
        <div className="max-h-[70dvh] overflow-auto p-4 sm:p-6">
          <table className="review-table w-full min-w-[44rem] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-600"><tr>{['任务名称', '日期', '明细数', '操作'].map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visibleTasks.length === 0 && <tr><td colSpan={4} className="text-center text-slate-600">暂无已下达的排班任务。</td></tr>}
              {visibleTasks.map(task => {
                const count = plans.filter(row => row.taskId === task.taskId).length;
                return (
                  <tr key={task.taskId}>
                    <th scope="row" className="max-w-64 font-medium wrap-break-word">
                      {task.taskName}
                      {task.legacy && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900">历史归档</span>}
                    </th>
                    <td className="whitespace-nowrap text-xs tabular-nums">
                      {task.startDate === task.endDate ? task.startDate : `${task.startDate} 至 ${task.endDate}`}
                    </td>
                    <td>{count}</td>
                    <td className="whitespace-nowrap">
                      <button type="button" className="row-button" disabled={busy} onClick={() => { setSelectedId(task.taskId); setError(''); }}>查看</button>
                      <button type="button" className="row-button" disabled={busy || !count} onClick={() => exportTask(task)}>导出</button>
                      <button type="button" className="row-button" disabled={busy} onClick={() => onEdit(task)}>编辑</button>
                      <button type="button" aria-label={`删除任务 ${task.taskName}`} disabled={busy} onClick={() => deleteTask(task)}
                        className="rounded-lg px-2 py-1.5 font-semibold text-red-600 enabled:hover:bg-red-50 enabled:hover:text-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                        {deletingId === task.taskId ? '删除中…' : '删除'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
