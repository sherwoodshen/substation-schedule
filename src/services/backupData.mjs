import { isValidDate, normalizeTaskForm, taskEditValues } from './taskModel.mjs';
import { formatTaskName } from './taskName.mjs';

export function validateBackupRecords(value) {
  if (!Array.isArray(value)) throw new RangeError('备份内容必须是排班记录数组，请选择本工具导出的 JSON 文件。');

  return value.map((row, index) => {
    const invalid = () => new RangeError(`第 ${index + 1} 条排班记录格式无效，导入已取消。`);
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw invalid();
    const validTask = row.taskType === '保电'
      ? [1, 2].includes(row.level)
      : (row.taskType === '风险预警' && [5, 6, 7].includes(row.level))
        || (row.taskType === '自定义' && typeof row.projectName === 'string' && row.projectName.trim());
    if (!isValidDate(row.date) || !validTask
      || !['stationName', 'voltage'].every(field => typeof row[field] === 'string' && row[field].trim())
      || !['manual', 'robot'].includes(row.method)
      || ![row.inspectionCount, row.temperatureCount].every(count => Number.isSafeInteger(count) && count >= 0)
      || !['noticeNumber', 'equipment'].every(field => row[field] == null || typeof row[field] === 'string')
      || (row.isPreStart != null && typeof row.isPreStart !== 'boolean')
      || (row.isFirstDayManual != null && typeof row.isFirstDayManual !== 'boolean')) {
      throw invalid();
    }
    return {
      ...row,
      ...(row.taskType === '自定义' ? { level: null, projectName: row.projectName.trim() } : {}),
      noticeNumber: row.noticeNumber ?? '',
      equipment: row.equipment ?? '',
      isPreStart: row.isPreStart ?? false,
    };
  });
}

export function parseBackupText(text) {
  return parseSystemBackupText(text).records;
}

export function validateTaskHeaders(headers, records) {
  if (!Array.isArray(headers)) throw new RangeError('备份中的任务表头无效。');
  const ids = new Set();
  const tasks = headers.map(header => {
    if (!header || typeof header.taskId !== 'string' || !header.taskId.trim() || ids.has(header.taskId)
      || !Number.isSafeInteger(header.revision) || header.revision < 1
      || ![header.createdAt, header.updatedAt].every(value => typeof value === 'string' && Number.isFinite(Date.parse(value)))) {
      throw new RangeError('备份中的任务标识、版本或时间无效。');
    }
    ids.add(header.taskId);
    // 仅为旧备份保留原有多日表头和明细；新增/重新保存的任务一律为单日。
    if (header.taskType === '自定义' && Array.isArray(header.selectedDates)
      && (header.inspectionDate == null || header.legacyMultiDate === true)) {
      const dates = [...new Set(header.selectedDates)].sort();
      if (!dates.length || !dates.every(isValidDate)) throw new RangeError('备份中的历史自定义日期无效。');
      const form = normalizeTaskForm(taskEditValues({ ...header, startDate: dates[0], endDate: dates.at(-1) },
        records.filter(row => row.taskId === header.taskId)));
      return { ...header, ...form, startDate: dates[0], endDate: dates.at(-1), selectedDates: dates,
        legacyMultiDate: dates.length > 1, taskName: formatTaskName(form) };
    }
    const form = normalizeTaskForm(header);
    return { ...header, ...form, taskName: formatTaskName(form) };
  });
  const byId = new Map(tasks.map(task => [task.taskId, task]));
  for (const row of records) {
    const task = byId.get(row.taskId);
    if (!task || task.taskType !== row.taskType || task.level !== row.level) {
      throw new RangeError('备份存在缺失或不匹配的任务表头，导入已取消。');
    }
  }
  return tasks;
}

export function parseSystemBackupText(text) {
  let value;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/u, ''));
  } catch {
    throw new RangeError('文件不是有效的 JSON，请选择本工具导出的备份文件。');
  }
  if (Array.isArray(value)) return { records: validateBackupRecords(value), tasks: undefined };
  if (value?.format !== 'substation-schedule' || value.version !== 2) {
    throw new RangeError('备份内容必须是排班记录数组或本工具导出的任务备份文件。');
  }
  const records = validateBackupRecords(value.plans);
  return { records, tasks: validateTaskHeaders(value.tasks, records) };
}

// 合并使用业务字段识别同一条计划，独立电脑的自增 id 不作为全局标识。
export function planMergeKey(row) {
  return JSON.stringify([
    row.date, row.stationName, row.taskType, row.level,
    row.noticeNumber ?? '', row.equipment ?? '', row.isPreStart ?? false, row.projectName ?? '',
  ]);
}

export function backupFileName(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `备份_${day}_${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(reader.result);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败，请重新选择。'));
    reader.onabort = () => reject(new Error('文件读取已取消。'));
    reader.readAsText(file, 'UTF-8');
  });
}

export function readBackupFile(file) {
  return readFileText(file).then(parseBackupText);
}

export function readSystemBackupFile(file) {
  return readFileText(file).then(parseSystemBackupText);
}
