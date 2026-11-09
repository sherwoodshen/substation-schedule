import { useEffect, useMemo, useState } from 'react';
import Modal from './components/Modal.jsx';
import MonthCalendar from './features/calendar/MonthCalendar.jsx';
import DayPlanList from './features/calendar/DayPlanList.jsx';
import { todayDate } from './features/calendar/dates.js';
import TaskForm from './features/intake/TaskForm.jsx';
import DraftReview from './features/review/DraftReview.jsx';
import RulesModal, { ruleTopics } from './features/rules/RulesModal.jsx';
import ExportModal from './features/export/ExportModal.jsx';
import DataBackupActions from './features/backup/DataBackupActions.jsx';
import TaskHistoryModal from './features/tasks/TaskHistoryModal.jsx';
import { generateSchedule } from './services/ScheduleGenerator.mjs';
import { saveTask, watchPlans, watchTasks } from './storage/planRepository.js';
import { normalizeTaskForm, taskEditValues } from './services/taskModel.mjs';

const dialogTitles = {
  intake: '特殊巡视安排',
  review: '核验排班草稿',
  day: '特殊巡视计划明细',
};

export default function App() {
  const today = todayDate();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [view, setView] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [plans, setPlans] = useState([]);
  const [draft, setDraft] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [editingTask, setEditingTask] = useState(null);
  const [lastForm, setLastForm] = useState(undefined);
  const [formError, setFormError] = useState('');
  const [readError, setReadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const activeRule = ruleTopics.find(topic => topic.id === view);

  useEffect(() => {
    const subscription = watchPlans({
      next: setPlans,
      error: () => setReadError('无法读取本地计划，请确认当前浏览器允许使用 IndexedDB。'),
    });
    const taskSubscription = watchTasks({
      next: setTasks,
      error: () => setReadError('无法读取本地任务记录，请重试。'),
    });
    return () => { subscription.unsubscribe(); taskSubscription.unsubscribe(); };
  }, []);

  const plansByDate = useMemo(() => {
    const grouped = new Map();
    for (const row of plans) {
      if (!grouped.has(row.date)) grouped.set(row.date, []);
      grouped.get(row.date).push(row);
    }
    return grouped;
  }, [plans]);

  function openIntake() {
    setEditingTask(null);
    setLastForm(undefined);
    setFormError('');
    setSaveError('');
    setConfirmedCount(0);
    setView('intake');
  }

  function editTask(task) {
    setEditingTask(task);
    setLastForm(taskEditValues(task, plans.filter(row => row.taskId === task.taskId)));
    setFormError('');
    setSaveError('');
    setView('intake');
  }

  function closeView() {
    setView(null);
  }

  function handleGenerate(form) {
    setFormError('');
    try {
      const normalized = normalizeTaskForm(form);
      const rows = generateSchedule(normalized);
      setLastForm(normalized);
      setDraft(rows);
      setSaveError('');
      setView('review');
    } catch (error) {
      setFormError(error.message);
    }
  }

  function handleRowSave(index, changes) {
    setDraft(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row));
  }

  function handlePlanUpdated(id) {
    setPlans(current => current.filter(row => row.id !== id));
    setConfirmedCount(0);
  }

  function handleTaskUpdated(taskId) {
    setTasks(current => current.filter(task => task.taskId !== taskId));
    setPlans(current => current.filter(row => row.taskId !== taskId));
    setConfirmedCount(0);
  }

  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await saveTask(lastForm, draft, { taskId: editingTask?.taskId, expectedRevision: editingTask?.revision });
      setConfirmedCount(draft.length);
      setMonth(lastForm.startDate.slice(0, 7));
      setDraft([]);
      setEditingTask(null);
      setView(null);
    } catch (error) {
      setSaveError(error instanceof RangeError ? error.message : '保存失败，草稿仍可编辑。请确认浏览器允许本地存储后重试。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-3 pt-7 pb-12 sm:px-8 sm:pt-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-9">
        <div>
          <p className="mb-2 text-sm font-semibold text-teal-800">小营变电运维班</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">每日特殊巡视计划表</h1>
          <p className="mt-2 text-sm text-slate-600">按日查看已确认的特殊巡视计划。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="secondary-button" type="button" aria-haspopup="dialog" onClick={() => setView('history')}>排班任务记录</button>
          <button className="primary-button" type="button" aria-haspopup="dialog" onClick={() => setView('export')}>导出巡视安排</button>
          <button className="primary-button" type="button" onClick={openIntake}>特殊巡视安排</button>
        </div>
      </header>

      {readError && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{readError}</p>}
      {confirmedCount > 0 && (
        <p role="status" className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          已确认 {confirmedCount} 条巡视计划，并保存到本地日历。
        </p>
      )}

      <section className="panel p-3 sm:p-6" aria-label="巡视月历">
        <MonthCalendar month={month} today={today} onMonthChange={setMonth} plansByDate={plansByDate}
          onSelect={date => { setSelectedDate(date); setView('day'); }} />
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-600">
          <span className="size-2 rounded-full bg-rose-600" aria-hidden="true" />
          已确认巡视计划 · 点击日期查看明细
        </p>
      </section>

      <DataBackupActions onImported={date => {
        setConfirmedCount(0);
        if (date) setMonth(date.slice(0, 7));
      }} />

      <div role="group" aria-label="巡视规则参考" className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <span className="mr-1 text-sm font-medium text-slate-600">规则参考</span>
        {ruleTopics.map(({ id, title }) => (
          <button key={id} type="button" className="secondary-button" aria-haspopup="dialog" onClick={() => setView(id)}>
            {title}
          </button>
        ))}
      </div>

      {activeRule ? (
        <RulesModal topic={activeRule} onClose={closeView} />
      ) : view === 'export' ? (
        <ExportModal plans={plans} initialMonth={month} onClose={closeView} />
      ) : view === 'history' ? (
        <TaskHistoryModal tasks={tasks} plans={plans} onClose={closeView} onEdit={editTask} onPlanUpdated={handlePlanUpdated} onTaskUpdated={handleTaskUpdated} />
      ) : view && (
        <Modal title={dialogTitles[view]} wide={view === 'review' || view === 'day'} busy={saving} onClose={closeView}>
          {view === 'day' && <DayPlanList key={selectedDate} date={selectedDate} plans={plansByDate.get(selectedDate) ?? []} onPlanUpdated={handlePlanUpdated} />}
          {view === 'intake' && <TaskForm key={editingTask?.taskId ?? 'new'} initialValues={lastForm} initialMonth={month} onGenerate={handleGenerate} error={formError} editing={Boolean(editingTask)} />}
          {view === 'review' && (
            <DraftReview draft={draft} onSaveRow={handleRowSave} onBack={() => setView('intake')}
              onConfirm={handleConfirm} saving={saving} saveError={saveError} editing={Boolean(editingTask)} />
          )}
        </Modal>
      )}
    </main>
  );
}
