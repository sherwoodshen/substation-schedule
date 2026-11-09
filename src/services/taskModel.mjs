import { formatTaskName } from './taskName.mjs';

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function normalizeTaskForm(form) {
  if (!form || !['projectName', 'noticeNumber', 'equipmentText', 'equipment']
    .every(field => form[field] == null || typeof form[field] === 'string')) {
    throw new RangeError('任务名称或设备文本格式无效。');
  }
  const custom = form.taskType === '自定义';
  const validKind = custom || (form.taskType === '保电' && [1, 2].includes(form.level))
    || (form.taskType === '风险预警' && [5, 6, 7].includes(form.level));
  if (!validKind) throw new RangeError('任务类型与级别不匹配。');
  const projectName = (form.projectName ?? '').trim();
  if (custom && !projectName) throw new RangeError('请填写自定义项目名称。');
  const inspectionDate = custom ? (form.inspectionDate ?? form.startDate) : undefined;
  if (custom && !isValidDate(inspectionDate)) throw new RangeError('请选择有效的巡视日期。');
  if (custom && (![1, 2, 3].includes(form.inspectionCount) || ![0, 1, 2, 3].includes(form.temperatureCount))) {
    throw new RangeError('巡视次数请选择 1 至 3 次，测温次数请选择 0 至 3 次。');
  }
  const startDate = custom ? inspectionDate : form.startDate;
  const endDate = custom ? inspectionDate : form.endDate;
  if (!isValidDate(startDate) || !isValidDate(endDate)) throw new RangeError('请选择完整且有效的起止日期。');
  if (endDate < startDate) throw new RangeError('结束日期须等于或晚于起始日期。');
  if (!Array.isArray(form.stationNames) || !form.stationNames.length
    || !form.stationNames.every(name => typeof name === 'string' && name.trim())) {
    throw new RangeError('请在保电设备文本中填写至少一个台账站名。');
  }
  return {
    taskType: form.taskType,
    level: custom ? null : form.level,
    projectName: custom ? projectName : '',
    noticeNumber: (form.noticeNumber ?? '').trim(),
    startDate, endDate,
    ...(custom ? { inspectionDate, inspectionCount: form.inspectionCount, temperatureCount: form.temperatureCount } : {}),
    stationNames: Array.from(new Set(form.stationNames)),
    equipmentText: (form.equipmentText ?? form.equipment ?? '').trim(),
  };
}

// 旧版多日任务只在编辑时回填首日，不自动删除原任务及其余明细。
export function taskEditValues(task, rows = []) {
  if (task.taskType !== '自定义') return task;
  const { selectedDates, ...values } = task;
  const firstRow = [...rows].sort((left, right) => left.date.localeCompare(right.date))[0];
  return {
    ...values,
    inspectionDate: task.inspectionDate ?? task.startDate ?? selectedDates?.slice().sort()[0],
    inspectionCount: task.inspectionCount ?? firstRow?.inspectionCount ?? 1,
    temperatureCount: task.temperatureCount ?? firstRow?.temperatureCount ?? 0,
    legacyMultiDate: Boolean(task.legacyMultiDate || selectedDates?.length > 1 || task.startDate !== task.endDate),
  };
}

export function createTaskHeader(form, taskId, previous) {
  const normalized = normalizeTaskForm(form);
  const now = new Date().toISOString();
  return {
    ...normalized,
    taskId,
    taskName: formatTaskName(normalized),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    revision: (previous?.revision ?? 0) + 1,
    legacy: false,
  };
}

// 旧版没有任务表头，按已有类型、单号和设备原文归档，完整保留原始明细。
export function archiveLegacyPlans(records) {
  const groups = new Map();
  for (const row of records) {
    const key = JSON.stringify([row.taskType, row.level, row.projectName, row.noticeNumber, row.equipment,
      ...(row.taskType === '自定义' ? [row.date, row.inspectionCount, row.temperatureCount] : [])]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const tasks = [];
  const plans = [];
  for (const rows of groups.values()) {
    const first = rows[0];
    const dates = Array.from(new Set(rows.filter(row => !row.isPreStart).map(row => row.date))).sort();
    if (!dates.length) {
      dates.push(new Date(Date.parse(`${first.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10));
    }
    const equipment = Array.from(new Set(rows.map(row => (
      (row.equipment ?? '').includes(row.stationName) ? row.equipment : `${row.stationName}变${row.equipment ?? ''}`
    )))).join('\n');
    const taskId = crypto.randomUUID();
    const task = createTaskHeader({
      ...first, startDate: dates[0], endDate: dates.at(-1), inspectionDate: dates[0],
      equipmentText: equipment, stationNames: Array.from(new Set(rows.map(row => row.stationName))),
    }, taskId);
    tasks.push({ ...task, legacy: true });
    plans.push(...rows.map(row => ({ ...row, taskId })));
  }
  return { tasks, plans };
}
