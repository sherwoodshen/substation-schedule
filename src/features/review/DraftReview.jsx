import { useState } from 'react';
import { stations } from '../../data/stations.mjs';
import { canRobotTemp, canUseRobotForSpecial } from '../../services/ScheduleGenerator.mjs';
import { formatTaskName } from '../../services/taskName.mjs';

const stationByName = new Map(stations.map(station => [station.name, station]));
const columns = ['日期', '保单号', '变电站', '保电设备', '巡视方式', '巡视次数', '测温次数', '操作'];

export default function DraftReview({ draft, onSaveRow, onBack, onConfirm, saving, saveError, editing }) {
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  const firstRow = draft[0];
  const taskName = firstRow ? formatTaskName(firstRow) : '';
  const editingRow = edit === null ? null : draft[edit.index];
  const customEditing = editingRow?.taskType === '自定义';
  const robotTemperature = editingRow && canRobotTemp(editingRow.stationName, editingRow.equipment)
    ? editingRow.inspectionCount : 0;

  function startEdit(row, index) {
    setEdit({
      index,
      method: row.method,
      inspectionCount: String(row.inspectionCount),
      manualTemperature: String(row.taskType !== '自定义' && row.method === 'robot' ? row.inspectionCount : row.temperatureCount),
    });
  }

  function closeEdit() {
    setEdit(null);
    setError('');
  }

  function saveEdit() {
    if (edit.method === 'robot' && !canUseRobotForSpecial(stationByName.get(editingRow.stationName), editingRow.equipment)) {
      setError('该站设备不具备机器巡视资格，请选择人工巡视。');
      return;
    }
    const inspectionCount = Number(edit.inspectionCount);
    if (customEditing && (edit.inspectionCount.trim() === '' || !Number.isSafeInteger(inspectionCount) || inspectionCount < 1)) {
      setError('巡视次数请输入正整数。');
      return;
    }
    const temperatureCount = !customEditing && edit.method === 'robot' ? robotTemperature : Number(edit.manualTemperature);
    if ((customEditing || edit.method === 'manual') && (
      edit.manualTemperature.trim() === '' || !Number.isSafeInteger(temperatureCount) || temperatureCount < 0
    )) {
      setError('测温次数请输入 0 或正整数。');
      return;
    }
    onSaveRow(edit.index, { method: edit.method, temperatureCount, ...(customEditing ? { inspectionCount } : {}) });
    closeEdit();
  }

  return (
    <section aria-label="草稿核验">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:px-6">
        <div className="min-w-0 flex-1">
          {taskName && (
            <p className="inline-block max-w-full rounded-xl bg-teal-50 px-3 py-2 text-lg leading-relaxed font-semibold wrap-break-word text-teal-950">
              {taskName}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500 sm:hidden">表格可横向滑动查看。</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium tabular-nums">{draft.length} 条计划</span>
      </div>

      <div className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700"
        role="region" aria-label="排班草稿表格" tabIndex={0}>
        <table className="review-table w-full min-w-225 text-left text-sm">
          <thead className="border-y border-slate-200 bg-slate-50 text-slate-600">
            <tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {draft.map((row, index) => {
              const editing = edit?.index === index;
              return (
                <tr key={`${row.date}-${row.stationName}`} className={editing ? 'bg-teal-50/60' : 'hover:bg-slate-50'}>
                  <td className="whitespace-nowrap tabular-nums">
                    <time dateTime={row.date}>{row.date}</time>
                    {row.isPreStart && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">T−1</span>}
                    {row.taskType !== '自定义' && row.isFirstDayManual && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">首日</span>}
                  </td>
                  <td className="max-w-40 wrap-break-word">{row.noticeNumber || '—'}</td>
                  <th scope="row" className="whitespace-nowrap font-medium">{row.stationName}</th>
                  <td className="max-w-48 wrap-break-word whitespace-pre-wrap">{row.equipment || '—'}</td>
                  <td>
                    {editing ? (
                      <select className="control min-w-21" aria-label="巡视方式" value={edit.method}
                        onChange={event => {
                          setEdit({ ...edit, method: event.target.value });
                          setError('');
                        }}>
                        <option value="manual">人工</option>
                        {canUseRobotForSpecial(stationByName.get(row.stationName), row.equipment) && (
                          <option value="robot">机器</option>
                        )}
                      </select>
                    ) : (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.method === 'robot'
                        ? 'bg-teal-100 text-teal-900' : 'bg-slate-100 text-slate-800'}`}>
                        {row.method === 'robot' ? '机器' : '人工'}
                      </span>
                    )}
                  </td>
                  <td className="tabular-nums">
                    {editing && customEditing ? (
                      <input className="control w-20" type="number" min="1" step="1" aria-label="巡视次数"
                        aria-invalid={Boolean(error)} aria-describedby={error ? 'draft-edit-error' : undefined}
                        value={edit.inspectionCount} onChange={event => {
                          setEdit({ ...edit, inspectionCount: event.target.value });
                          setError('');
                        }} />
                    ) : row.inspectionCount}
                  </td>
                  <td className="tabular-nums">
                    {editing ? (
                      <input className="control w-20" type="number" min="0" step="1" aria-label="测温次数"
                        aria-invalid={Boolean(error)} aria-describedby={error ? 'draft-edit-error' : undefined}
                        disabled={!customEditing && edit.method === 'robot'} value={!customEditing && edit.method === 'robot' ? robotTemperature : edit.manualTemperature}
                        onChange={event => {
                          setEdit({ ...edit, manualTemperature: event.target.value });
                          setError('');
                        }} />
                    ) : row.temperatureCount}
                  </td>
                  <td className="whitespace-nowrap">
                    {row.taskType !== '自定义' && (row.isPreStart || row.isFirstDayManual) ? (
                      <span className="text-xs text-slate-500">规则锁定</span>
                    ) : editing ? (
                      <div className="flex gap-1">
                        <button className="row-button" type="button" onClick={saveEdit}>保存</button>
                        <button className="row-button text-slate-600" type="button" onClick={closeEdit}>取消</button>
                      </div>
                    ) : (
                      <button className="row-button" type="button" disabled={edit !== null || saving}
                        aria-label={`编辑 ${row.date} ${row.stationName}`} onClick={() => startEdit(row, index)}>编辑</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel-footer justify-between">
        <button className="secondary-button" type="button" disabled={edit !== null || saving} onClick={onBack}>返回表单</button>
        <div className="flex flex-wrap items-center gap-3">
          {error && <p id="draft-edit-error" role="alert" className="text-sm text-red-800">{error}</p>}
          {edit && !error && <p className="text-sm text-slate-600">请先保存或取消当前行的编辑。</p>}
          <button className="primary-button" type="button" disabled={edit !== null || draft.length === 0 || saving}
            onClick={onConfirm}>{saving ? '正在保存…' : editing ? '确认修改并生效' : '确认无误并生效'}</button>
        </div>
        {saveError && <p role="alert" className="w-full text-sm text-red-800">{saveError}</p>}
      </div>
    </section>
  );
}
