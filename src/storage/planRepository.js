import Dexie, { liveQuery } from 'dexie';
import { splitEquipmentByStation } from '../services/splitEquipmentByStation.mjs';
import { planMergeKey, validateBackupRecords, validateTaskHeaders } from '../services/backupData.mjs';
import { archiveLegacyPlans, createTaskHeader } from '../services/taskModel.mjs';

const db = new Dexie('substation-schedule');
db.version(1).stores({ plans: '++id,date' });
db.version(2).stores({ plans: '++id,date,taskId', tasks: 'taskId,createdAt,updatedAt' }).upgrade(async transaction => {
  const archived = archiveLegacyPlans(await transaction.table('plans').toArray());
  await transaction.table('tasks').bulkPut(archived.tasks);
  await transaction.table('plans').bulkPut(archived.plans);
});

export function getAllPlans() {
  return db.plans.orderBy('date').toArray();
}

export function watchPlans(observer) {
  return liveQuery(async () => {
    const rows = await getAllPlans();
    // 旧版可能已保存 2 级保电的前置巡视，日历读取时排除这些记录。
    return rows
      .filter(row => !(row.taskType === '保电' && row.level === 2 && row.isPreStart === true))
      .map(row => ({
        ...row,
        equipment: splitEquipmentByStation(row.equipment ?? '').get(row.stationName) ?? row.equipment,
      }));
  }).subscribe(observer);
}

export function watchTasks(observer) {
  return liveQuery(() => db.tasks.orderBy('createdAt').reverse().toArray()).subscribe(observer);
}

export function getTaskPlans(taskId) {
  return db.plans.where('taskId').equals(taskId).sortBy('date');
}

export function getSystemBackup() {
  return db.transaction('r', db.tasks, db.plans, async () => ({
    format: 'substation-schedule', version: 2,
    tasks: await db.tasks.toArray(), plans: await getAllPlans(),
  }));
}

export function savePlans(rows) {
  const archived = archiveLegacyPlans(rows);
  return db.transaction('rw', db.tasks, db.plans, async () => {
    await db.tasks.bulkAdd(archived.tasks);
    return db.plans.bulkAdd(archived.plans);
  });
}

export function saveTask(form, rows, { taskId, expectedRevision } = {}) {
  const incoming = validateBackupRecords(rows);
  if (!incoming.length) throw new RangeError('任务至少需要一条排班明细。');
  return db.transaction('rw', db.tasks, db.plans, async () => {
    const previous = taskId ? await db.tasks.get(taskId) : undefined;
    if (taskId && (!previous || previous.revision !== expectedRevision)) {
      throw new RangeError('该任务已被其他操作修改，请返回任务记录重新打开。');
    }
    const header = createTaskHeader(form, taskId ?? crypto.randomUUID(), previous);
    await db.tasks.put(header);
    if (previous) await db.plans.where('taskId').equals(header.taskId).delete();
    await db.plans.bulkAdd(incoming.map(({ id, ...row }) => ({ ...row, taskId: header.taskId })));
    return header;
  });
}

export function deletePlanById(id) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new RangeError('排班记录 ID 无效。');
  return db.transaction('rw', db.tasks, db.plans, async () => {
    const row = await db.plans.get(id);
    await db.plans.delete(id);
    const task = row?.taskId ? await db.tasks.get(row.taskId) : undefined;
    if (task) await db.tasks.update(task.taskId, { revision: task.revision + 1, updatedAt: new Date().toISOString() });
  });
}

export function deleteTaskById(taskId) {
  if (typeof taskId !== 'string' || !taskId.trim()) throw new RangeError('排班任务 ID 无效。');
  return db.transaction('rw', db.tasks, db.plans, async () => {
    await db.plans.where('taskId').equals(taskId).delete();
    await db.tasks.delete(taskId);
  });
}

export function importPlans(records, mode, taskHeaders) {
  if (!['replace', 'merge'].includes(mode)) throw new RangeError('请选择有效的导入方式。');
  // 为导入记录重新分配本机主键，避免不同电脑的自增 id 相互冲突。
  const incoming = validateBackupRecords(records).map(({ id, ...row }) => row);
  const headers = taskHeaders === undefined ? undefined : validateTaskHeaders(taskHeaders, incoming);
  return db.transaction('rw', db.tasks, db.plans, async () => {
    if (mode === 'replace') {
      const imported = headers ? { tasks: headers, plans: incoming } : archiveLegacyPlans(incoming);
      await db.plans.clear();
      await db.tasks.clear();
      await db.tasks.bulkAdd(imported.tasks);
      await db.plans.bulkAdd(imported.plans);
      return { added: incoming.length, skipped: 0, total: incoming.length };
    }

    const current = await db.plans.toArray();
    if (headers) {
      const existing = new Set(await db.tasks.toCollection().primaryKeys());
      const newTasks = headers.filter(task => !existing.has(task.taskId));
      const newIds = new Set(newTasks.map(task => task.taskId));
      const additions = incoming.filter(row => newIds.has(row.taskId));
      await db.tasks.bulkAdd(newTasks);
      await db.plans.bulkAdd(additions);
      return { added: additions.length, skipped: incoming.length - additions.length, total: current.length + additions.length };
    }
    const keys = new Set(current.map(planMergeKey));
    const additions = incoming.filter(row => {
      const key = planMergeKey(row);
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
    const archived = archiveLegacyPlans(additions);
    await db.tasks.bulkAdd(archived.tasks);
    await db.plans.bulkAdd(archived.plans);
    return { added: additions.length, skipped: incoming.length - additions.length, total: current.length + additions.length };
  });
}
