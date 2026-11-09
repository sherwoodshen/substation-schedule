import { useState } from 'react';
import { extractStations } from '../../services/extractStations.mjs';
import DateRangePicker from './DateRangePicker.jsx';

const levelsByType = { 保电: [1, 2], 风险预警: [5, 6, 7], 自定义: [] };
const emptyForm = {
  taskType: '保电', level: 1, noticeNumber: '', startDate: '', endDate: '', equipmentText: '',
  projectName: '', inspectionDate: '', inspectionCount: 1, temperatureCount: 0,
};

export default function TaskForm({ initialValues = emptyForm, initialMonth, onGenerate, error, editing }) {
  // TODO: 后续考虑在此处接入真实天气 API 提示
  const [form, setForm] = useState(() => ({ ...emptyForm, ...initialValues }));
  const matchedStations = extractStations(form.equipmentText);

  function setField(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const selection = new FormData(event.currentTarget);
    onGenerate({
      ...form,
      taskType: selection.get('taskType'),
      level: form.taskType === '自定义' ? null : Number(selection.get('level')),
      noticeNumber: form.taskType === '自定义' ? '' : form.noticeNumber.trim(),
      equipmentText: form.equipmentText.trim(),
      stationNames: matchedStations.map(station => station.name),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-5 p-4 sm:p-6">
        <div className={`grid gap-4 ${form.taskType === '自定义' ? '' : 'sm:grid-cols-2'}`}>
          <fieldset>
            <legend className="field-label">任务类型</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.keys(levelsByType).map(taskType => (
                <label key={taskType} className="choice">
                  <input type="radio" name="taskType" value={taskType} className="accent-teal-700"
                    checked={form.taskType === taskType}
                    onChange={() => setForm(current => ({ ...current, taskType, level: levelsByType[taskType][0] }))} />
                  {taskType}
                </label>
              ))}
            </div>
          </fieldset>
          {form.taskType === '自定义' ? (
            <label className="grid content-start gap-2">
              <span className="field-label">项目名称</span>
              <input required className="control" value={form.projectName} placeholder="填写本次自定义排班名称"
                onChange={event => setField('projectName', event.target.value)} />
            </label>
          ) : <fieldset>
            <legend className="field-label">{form.taskType === '保电' ? '保电级别' : '预警级别'}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {levelsByType[form.taskType].map(level => (
                <label key={level} className="choice">
                  <input type="radio" name="level" value={level} className="accent-teal-700"
                    checked={form.level === level} onChange={() => setField('level', level)} />
                  {form.taskType === '保电' ? (level === 1 ? '一级' : '二级') : `${level}级`}
                </label>
              ))}
            </div>
          </fieldset>}
        </div>

        {form.taskType === '自定义' ? (
          <>
            <label className="grid gap-2">
              <span className="field-label">巡视日期</span>
              <input type="date" required className="control w-full" value={form.inspectionDate}
                onChange={event => setField('inspectionDate', event.target.value)} />
            </label>
            <label className="grid gap-2">
              <span className="field-label">巡视次数</span>
              <select className="control" value={form.inspectionCount}
                onChange={event => setField('inspectionCount', Number(event.target.value))}>
                {[1, 2, 3].map(count => <option key={count} value={count}>{count}</option>)}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="field-label">测温次数</span>
              <select className="control" value={form.temperatureCount}
                onChange={event => setField('temperatureCount', Number(event.target.value))}>
                {[0, 1, 2, 3].map(count => <option key={count} value={count}>{count}</option>)}
              </select>
            </label>
          </>
        ) : <DateRangePicker startDate={form.startDate} endDate={form.endDate}
          initialMonth={form.startDate.slice(0, 7) || initialMonth}
          onChange={(startDate, endDate) => setForm(current => ({ ...current, startDate, endDate }))} />}

        {initialValues.legacy && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">此任务由历史明细归档，表单日期和设备由已有记录回填。保存后将按当前参数重新排班，请核对。</p>}
        {initialValues.legacyMultiDate && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">此任务为旧版多日自定义任务，已回填首日配置。重新保存后将替换原任务的全部明细，仅保留本次选择的单日安排。</p>}

        {form.taskType !== '自定义' && <label className="grid gap-2">
          <span className="field-label">通知单号 / 事件名称 <span className="font-normal text-slate-500">（选填）</span></span>
          <input className="control" placeholder="例如 BD-001 或重大活动保电" value={form.noticeNumber}
            onChange={event => setField('noticeNumber', event.target.value)} />
        </label>}
        <div>
          <label className="grid gap-2">
            <span className="field-label">保电设备</span>
            <textarea className="control resize-y" rows={4} required aria-describedby="station-matches"
              placeholder={'例如 220kV宁海路变110kV正母线\n可粘贴多行设备说明'}
              value={form.equipmentText} onChange={event => setField('equipmentText', event.target.value)} />
          </label>
          <div id="station-matches" aria-live="polite" className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {matchedStations.length > 0 ? (
              <>
                <span className="font-medium text-slate-700">已自动识别变电站</span>
                {matchedStations.map(station => (
                  <span key={station.name} className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-900">
                    {station.name} ({station.voltage})
                  </span>
                ))}
              </>
            ) : (
              <span className="text-slate-600">
                {form.equipmentText.trim() ? '未匹配到变电站，请检查文本是否包含台账中的站名。' : '粘贴含站名的设备说明，系统会自动匹配台账。'}
              </span>
            )}
          </div>
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      </div>

      <div className="panel-footer justify-end">
        <button className="primary-button" type="submit">{editing ? '重新生成排班草稿' : '生成排班草稿'}</button>
      </div>
    </form>
  );
}
