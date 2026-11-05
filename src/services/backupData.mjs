function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function validateBackupRecords(value) {
  if (!Array.isArray(value)) throw new RangeError('备份内容必须是排班记录数组，请选择本工具导出的 JSON 文件。');

  return value.map((row, index) => {
    const invalid = () => new RangeError(`第 ${index + 1} 条排班记录格式无效，导入已取消。`);
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw invalid();
    const validTask = row.taskType === '保电'
      ? [1, 2].includes(row.level)
      : row.taskType === '风险预警' && [5, 6, 7].includes(row.level);
    if (!isDate(row.date) || !validTask
      || !['stationName', 'voltage'].every(field => typeof row[field] === 'string' && row[field].trim())
      || !['manual', 'robot'].includes(row.method)
      || ![row.inspectionCount, row.temperatureCount].every(count => Number.isSafeInteger(count) && count >= 0)
      || !['noticeNumber', 'equipment'].every(field => row[field] == null || typeof row[field] === 'string')
      || (row.isPreStart != null && typeof row.isPreStart !== 'boolean')) {
      throw invalid();
    }
    return {
      ...row,
      noticeNumber: row.noticeNumber ?? '',
      equipment: row.equipment ?? '',
      isPreStart: row.isPreStart ?? false,
    };
  });
}

export function parseBackupText(text) {
  let value;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/u, ''));
  } catch {
    throw new RangeError('文件不是有效的 JSON，请选择本工具导出的备份文件。');
  }
  return validateBackupRecords(value);
}

// 合并使用业务字段识别同一条计划，独立电脑的自增 id 不作为全局标识。
export function planMergeKey(row) {
  return JSON.stringify([
    row.date, row.stationName, row.taskType, row.level,
    row.noticeNumber ?? '', row.equipment ?? '', row.isPreStart ?? false,
  ]);
}

export function backupFileName(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `备份_${day}_${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseBackupText(reader.result));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败，请重新选择。'));
    reader.onabort = () => reject(new Error('文件读取已取消。'));
    reader.readAsText(file, 'UTF-8');
  });
}
