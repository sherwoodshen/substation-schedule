import { useState } from 'react';
import { extractStations } from '../../services/extractStations.mjs';
import DateRangePicker from './DateRangePicker.jsx';

const levelsByType = { 保电: [1, 2], 风险预警: [5, 6, 7] };
const emptyForm = {
  taskType: '保电', level: 1, noticeNumber: '', startDate: '', endDate: '', equipmentText: '',
};

export default function TaskForm({ initialValues = emptyForm, initialMonth, onGenerate, error }) {
  const [form, setForm] = useState(initialValues);
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
      level: Number(selection.get('level')),
      noticeNumber: form.noticeNumber.trim(),
      equipmentText: form.equipmentText.trim(),
      stationNames: matchedStations.map(station => station.name),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-5 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
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
          <fieldset>
            <legend className="field-label">{form.taskType === '保电' ? '保电级别' : '预警级别'}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {levelsByType[form.taskType].map(level => (
                <label key={level} className="choice">
                  <input type="radio" name="level" value={level} className="accent-teal-700"
                    checked={form.level === level} onChange={() => setField('level', level)} />
                  {level}级
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <DateRangePicker startDate={form.startDate} endDate={form.endDate}
          initialMonth={form.startDate.slice(0, 7) || initialMonth}
          onChange={(startDate, endDate) => setForm(current => ({ ...current, startDate, endDate }))} />

        <label className="grid gap-2">
          <span className="field-label">通知单号 / 事件名称 <span className="font-normal text-slate-500">（选填）</span></span>
          <input className="control" placeholder="例如 BD-001 或重大活动保电" value={form.noticeNumber}
            onChange={event => setField('noticeNumber', event.target.value)} />
        </label>
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
        <button className="primary-button" type="submit">生成排班草稿</button>
      </div>
    </form>
  );
}
