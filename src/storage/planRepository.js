import Dexie, { liveQuery } from 'dexie';
import { splitEquipmentByStation } from '../services/splitEquipmentByStation.mjs';
import { planMergeKey, validateBackupRecords } from '../services/backupData.mjs';

const db = new Dexie('substation-schedule');
db.version(1).stores({ plans: '++id,date' });

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

export function savePlans(rows) {
  return db.transaction('rw', db.plans, () => db.plans.bulkAdd(rows));
}

export function deletePlanById(id) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new RangeError('排班记录 ID 无效。');
  return db.plans.delete(id);
}

export function importPlans(records, mode) {
  if (!['replace', 'merge'].includes(mode)) throw new RangeError('请选择有效的导入方式。');
  // 为导入记录重新分配本机主键，避免不同电脑的自增 id 相互冲突。
  const incoming = validateBackupRecords(records).map(({ id, ...row }) => row);
  return db.transaction('rw', db.plans, async () => {
    if (mode === 'replace') {
      await db.plans.clear();
      await db.plans.bulkAdd(incoming);
      return { added: incoming.length, skipped: 0, total: incoming.length };
    }

    const current = await db.plans.toArray();
    const keys = new Set(current.map(planMergeKey));
    const additions = incoming.filter(row => {
      const key = planMergeKey(row);
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
    await db.plans.bulkAdd(additions);
    return { added: additions.length, skipped: incoming.length - additions.length, total: current.length + additions.length };
  });
}
