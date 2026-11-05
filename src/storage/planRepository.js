import Dexie, { liveQuery } from 'dexie';
import { splitEquipmentByStation } from '../services/splitEquipmentByStation.mjs';

const db = new Dexie('substation-schedule');
db.version(1).stores({ plans: '++id,date' });

export function watchPlans(observer) {
  return liveQuery(async () => {
    const rows = await db.plans.orderBy('date').toArray();
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
