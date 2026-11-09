import Dexie from 'dexie';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App.jsx';
import TaskHistoryModal from '../src/features/tasks/TaskHistoryModal.jsx';
import * as repository from '../src/storage/planRepository.js';
import { generateSchedule } from '../src/services/ScheduleGenerator.mjs';

const fixture = new Dexie('substation-schedule');
fixture.version(2).stores({ plans: '++id,date,taskId', tasks: 'taskId,createdAt,updatedAt' });
const form = { taskType: '保电', level: 2, noticeNumber: 'A', startDate: '2026-11-06', endDate: '2026-11-08',
  stationNames: ['小营', '鼓楼'], equipmentText: '小营变母线；鼓楼变母线' };
let a, b;

beforeEach(async () => {
  await repository.importPlans([], 'replace');
  a = await repository.saveTask(form, generateSchedule(form));
  const other = { ...form, noticeNumber: 'B' };
  b = await repository.saveTask(other, generateSchedule(other));
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function () { this.setAttribute('open', ''); });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function () { this.removeAttribute('open'); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
afterAll(() => fixture.close());

async function showHistory(onTaskUpdated = vi.fn()) {
  const { tasks, plans } = await repository.getSystemBackup();
  render(<TaskHistoryModal tasks={tasks} plans={plans} onClose={vi.fn()} onEdit={vi.fn()} onPlanUpdated={vi.fn()} onTaskUpdated={onTaskUpdated} />);
  return onTaskUpdated;
}

it('取消确认时不删除表头或明细，也不通知父组件', async () => {
  const before = await repository.getSystemBackup();
  const callback = await showHistory();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: `删除任务 ${a.taskName}` }));
  expect(confirm).toHaveBeenCalledWith(`确认删除任务「${a.taskName}」吗？删除后该任务下的所有排班明细将一并清除且无法恢复！`);
  expect(await repository.getSystemBackup()).toEqual(before);
  expect(callback).not.toHaveBeenCalled();
  expect(screen.getByRole('rowheader', { name: a.taskName })).toBeTruthy();
});

it('确认后跨日期跨站级联清理，局部列表立即更新，其他任务完整保留', async () => {
  const otherBefore = await repository.getTaskPlans(b.taskId);
  const callback = await showHistory();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: `删除任务 ${a.taskName}` }));
  await waitFor(() => expect(screen.queryByRole('rowheader', { name: a.taskName })).toBeNull());
  expect(callback).toHaveBeenCalledExactlyOnceWith(a.taskId);
  expect(await fixture.tasks.get(a.taskId)).toBeUndefined();
  expect(await repository.getTaskPlans(a.taskId)).toEqual([]);
  expect(await repository.getTaskPlans(b.taskId)).toEqual(otherBefore);
  fixture.close();
  await fixture.open();
  expect(await fixture.plans.where('taskId').equals(a.taskId).count()).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: `删除任务 ${b.taskName}` }));
  await screen.findByText('暂无已下达的排班任务。');
  expect(await repository.getSystemBackup()).toMatchObject({ tasks: [], plans: [] });
});

it('删除失败保留列表和数据库，显示错误并恢复按钮', async () => {
  const before = await repository.getSystemBackup();
  const callback = await showHistory();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(repository, 'deleteTaskById').mockRejectedValueOnce(new Error('写入失败'));
  fireEvent.click(screen.getByRole('button', { name: `删除任务 ${a.taskName}` }));
  await screen.findByRole('alert');
  expect(screen.getByRole('rowheader', { name: a.taskName })).toBeTruthy();
  expect(screen.getByRole('button', { name: `删除任务 ${a.taskName}` }).disabled).toBe(false);
  expect(callback).not.toHaveBeenCalled();
  expect(await repository.getSystemBackup()).toEqual(before);
});

it('表头删除失败时，同一事务回滚已经执行的明细删除', async () => {
  const before = await repository.getSystemBackup();
  // 所有 Dexie Table 实例的公共原型，仅在本用例注入第二步删除失败。
  const prototype = Object.getPrototypeOf(Object.getPrototypeOf(fixture.tasks));
  const originalDelete = prototype.delete;
  const spy = vi.spyOn(prototype, 'delete').mockImplementation(function (key) {
    if (this.name === 'tasks') throw new Error('模拟表头删除失败');
    return originalDelete.call(this, key);
  });
  try {
    await expect(repository.deleteTaskById(a.taskId)).rejects.toThrow('模拟表头删除失败');
  } finally { spy.mockRestore(); }
  expect(await repository.getSystemBackup()).toEqual(before);
});

it('零明细任务、重复删除和不存在的任务都能安全处理', async () => {
  for (const row of await repository.getTaskPlans(a.taskId)) await repository.deletePlanById(row.id);
  expect(await fixture.tasks.get(a.taskId)).toBeTruthy();
  await repository.deleteTaskById(a.taskId);
  await repository.deleteTaskById(a.taskId);
  await repository.deleteTaskById('missing-task');
  expect(await fixture.tasks.get(a.taskId)).toBeUndefined();
  expect(await repository.getTaskPlans(b.taskId)).toHaveLength(6);
});

it.each([null, '', ' ', 5])('非法任务 ID %s 不会误删数据', async id => {
  const before = await repository.getSystemBackup();
  expect(() => repository.deleteTaskById(id)).toThrow('排班任务 ID 无效。');
  expect(await repository.getSystemBackup()).toEqual(before);
});

it('实际首页删除任务后保持弹窗打开，日历计数同步减少并清除最终红点', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T04:00:00Z'));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<App />);
  await screen.findByRole('button', { name: '2026-11-06，4 条计划' });
  fireEvent.click(screen.getByRole('button', { name: '排班任务记录' }));
  fireEvent.click(await screen.findByRole('button', { name: `删除任务 ${a.taskName}` }));
  await waitFor(() => expect(screen.queryByRole('rowheader', { name: a.taskName })).toBeNull());
  expect(screen.getByRole('dialog')).toBeTruthy();
  const calendar = screen.getByRole('region', { name: '巡视月历', hidden: true });
  await waitFor(() => expect(within(calendar).getByRole('button', { name: '2026-11-06，2 条计划', hidden: true })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: `删除任务 ${b.taskName}` }));
  await screen.findByText('暂无已下达的排班任务。');
  for (const date of ['2026-11-06', '2026-11-07', '2026-11-08']) {
    await waitFor(() => expect(within(calendar).getByRole('button', { name: date, exact: true, hidden: true })).toBeTruthy());
  }
});
