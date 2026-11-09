import Dexie from 'dexie';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { generateSchedule } from '../src/services/ScheduleGenerator.mjs';
import { taskEditValues } from '../src/services/taskModel.mjs';
import { parseSystemBackupText } from '../src/services/backupData.mjs';

let repository;
const fixture = new Dexie('substation-schedule');
fixture.version(2).stores({ plans: '++id,date,taskId', tasks: 'taskId,createdAt,updatedAt' });
const form = { taskType: '保电', level: 2, noticeNumber: '活动',
  startDate: '2026-11-06', endDate: '2026-11-08', stationNames: ['小营'], equipmentText: '小营变母线' };
const custom = { taskType: '自定义', projectName: '单日专项',
  inspectionDate: '2026-12-02', inspectionCount: 3, temperatureCount: 0, stationNames: ['马台街'], equipmentText: '马台街变主变' };
const original = { id: 8, date: '2026-11-06', stationName: '小营', voltage: '110kV',
  taskType: '保电', level: 2, noticeNumber: '旧任务', equipment: '小营变母线',
  method: 'robot', inspectionCount: 1, temperatureCount: 0, isPreStart: false };

beforeAll(async () => {
  const old = new Dexie('substation-schedule');
  old.version(1).stores({ plans: '++id,date' });
  await old.plans.add(original);
  old.close();
  repository = await import('../src/storage/planRepository.js');
});
afterEach(async () => { await fixture.plans.clear(); await fixture.tasks.clear(); });
afterAll(() => fixture.close());

it('v1 自动升级保留原始明细及主键，新增可编辑的历史任务表头', async () => {
  const backup = await repository.getSystemBackup();
  expect(backup.tasks).toHaveLength(1);
  expect(backup.tasks[0]).toMatchObject({ legacy: true, startDate: '2026-11-06', stationNames: ['小营'] });
  expect(backup.plans).toEqual([{ ...original, taskId: backup.tasks[0].taskId }]);
  expect(parseSystemBackupText(JSON.stringify(backup)).tasks).toHaveLength(1);
});

it('任务创建和编辑原子替换原任务的全部日期，不影响同日其他任务', async () => {
  const first = await repository.saveTask(form, generateSchedule(form));
  const other = await repository.saveTask(form, generateSchedule(form));
  const otherBefore = await repository.getTaskPlans(other.taskId);
  const next = await repository.saveTask(custom, generateSchedule(custom), { taskId: first.taskId, expectedRevision: 1 });
  expect(next).toMatchObject({ taskId: first.taskId, revision: 2, taskName: '单日专项', inspectionCount: 3, temperatureCount: 0, createdAt: first.createdAt });
  const rows = await repository.getTaskPlans(first.taskId);
  expect(rows.map(row => row.date)).toEqual(['2026-12-02']);
  expect(rows.map(row => row.method)).toEqual(['manual']);
  expect(rows[0]).toMatchObject({ inspectionCount: 3, temperatureCount: 0 });
  expect(next.selectedDates).toBeUndefined();
  expect(rows.every(row => row.taskId === first.taskId && row.stationName === '马台街')).toBe(true);
  expect(await repository.getTaskPlans(other.taskId)).toEqual(otherBefore);
  expect((await repository.getSystemBackup()).tasks).toHaveLength(2);
});

it('写入失败会整体回滚表头和旧明细，过期编辑版本被拒绝', async () => {
  const task = await repository.saveTask(form, generateSchedule(form));
  const before = await repository.getSystemBackup();
  await expect(repository.saveTask(custom, generateSchedule(custom).map(row => ({ ...row, uncloneable: () => {} })),
    { taskId: task.taskId, expectedRevision: task.revision })).rejects.toBeTruthy();
  expect(await repository.getSystemBackup()).toEqual(before);
  await repository.deletePlanById(before.plans[0].id);
  const afterDelete = await repository.getSystemBackup();
  await expect(repository.saveTask(form, generateSchedule(form), { taskId: task.taskId, expectedRevision: task.revision }))
    .rejects.toThrow('该任务已被其他操作修改');
  expect(await repository.getSystemBackup()).toEqual(afterDelete);
});

it('新版备份往返保留自定义日期和任务关系，重复合并保留本机任务版本', async () => {
  const task = await repository.saveTask(custom, generateSchedule(custom));
  const parsed = parseSystemBackupText(JSON.stringify(await repository.getSystemBackup()));
  await repository.importPlans([], 'replace');
  expect((await repository.getSystemBackup()).tasks).toEqual([]);
  await repository.importPlans(parsed.records, 'replace', parsed.tasks);
  expect((await repository.getSystemBackup()).tasks[0]).toEqual(task);
  const before = await repository.getTaskPlans(task.taskId);
  await repository.deletePlanById(before[0].id);
  expect(await repository.importPlans(parsed.records, 'merge', parsed.tasks)).toEqual({ added: 0, skipped: 1, total: 0 });
  expect(await repository.getTaskPlans(task.taskId)).toHaveLength(0);
  const second = await repository.saveTask(form, generateSchedule(form));
  const combined = await repository.getSystemBackup();
  await repository.importPlans(parsed.records, 'replace', parsed.tasks);
  const result = await repository.importPlans(combined.plans, 'merge', combined.tasks);
  expect(result.added).toBe(3);
  expect((await repository.getSystemBackup()).tasks.map(row => row.taskId).sort()).toEqual([task.taskId, second.taskId].sort());
});

it('旧数组备份仍可归档导入，缺失外键的新版备份在清空前被拒绝', async () => {
  await repository.importPlans([original], 'replace');
  const before = await repository.getSystemBackup();
  expect(before.tasks[0].legacy).toBe(true);
  expect(() => repository.importPlans(before.plans, 'replace', [])).toThrow('任务表头');
  expect(await repository.getSystemBackup()).toEqual(before);
});

it('旧多日自定义备份读取不丢明细，重复备份仍保留范围，编辑确认才变成单日', async () => {
  const legacy = {
    taskId: 'legacy-custom', taskType: '自定义', level: null, taskName: '旧专项', projectName: '旧专项',
    noticeNumber: '', startDate: '2026-11-29', endDate: '2026-12-02', selectedDates: ['2026-11-29', '2026-12-02'],
    stationNames: ['马台街'], equipmentText: '马台街变主变',
    createdAt: '2026-11-05T00:00:00Z', updatedAt: '2026-11-05T00:00:00Z', revision: 1,
  };
  const records = ['2026-11-29', '2026-12-02'].map((date, index) => ({
    ...original, id: index + 1, taskId: legacy.taskId, date, stationName: '马台街',
    taskType: '自定义', level: null, projectName: '旧专项', noticeNumber: '', equipment: '马台街变主变',
    method: index ? 'robot' : 'manual', temperatureCount: 1,
  }));
  const parsed = parseSystemBackupText(JSON.stringify({ format: 'substation-schedule', version: 2, tasks: [legacy], plans: records }));
  await repository.importPlans(parsed.records, 'replace', parsed.tasks);
  const reloaded = parseSystemBackupText(JSON.stringify(await repository.getSystemBackup()));
  expect(reloaded.records).toHaveLength(2);
  expect(reloaded.tasks[0]).toMatchObject({ startDate: '2026-11-29', endDate: '2026-12-02', legacyMultiDate: true });
  const edit = taskEditValues(reloaded.tasks[0], reloaded.records);
  expect(edit).toMatchObject({ inspectionDate: '2026-11-29', inspectionCount: 1, temperatureCount: 1, legacyMultiDate: true });
  const updatedForm = { ...edit, inspectionDate: '2026-12-03', inspectionCount: 2, temperatureCount: 0 };
  await repository.saveTask(updatedForm, generateSchedule(updatedForm), { taskId: legacy.taskId, expectedRevision: 1 });
  const rows = await repository.getTaskPlans(legacy.taskId);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ date: '2026-12-03', inspectionCount: 2, temperatureCount: 0 });
  const header = (await repository.getSystemBackup()).tasks[0];
  expect(header.startDate).toBe(header.endDate);
  expect(header.selectedDates).toBeUndefined();
});
