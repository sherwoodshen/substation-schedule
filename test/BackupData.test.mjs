import assert from 'node:assert/strict';
import test from 'node:test';
import { backupFileName, parseBackupText, planMergeKey, validateBackupRecords } from '../src/services/backupData.mjs';

const row = {
  id: 1, date: '2026-11-06', stationName: '马台街', voltage: '110kV',
  taskType: '保电', level: 2, noticeNumber: '重大活动', equipment: '马台街变1号主变',
  method: 'robot', inspectionCount: 1, temperatureCount: 1, isPreStart: false,
};

test('JSON 备份保留原始设备和测温数据，兼容 BOM 与空备份', () => {
  assert.deepEqual(parseBackupText(`\uFEFF${JSON.stringify([row])}`), [row]);
  assert.deepEqual(parseBackupText('[]'), []);
  const legacy = { ...row, noticeNumber: undefined, equipment: undefined, isPreStart: undefined };
  assert.deepEqual(validateBackupRecords([legacy])[0], { ...row, noticeNumber: '', equipment: '', isPreStart: false });
});

test('非法 JSON、错误记录类型、日期和次数会在写入前被拒绝', () => {
  assert.throws(() => parseBackupText('{'), /有效的 JSON/);
  assert.throws(() => parseBackupText('{}'), /排班记录数组/);
  for (const invalid of [
    null, [], {},
    { ...row, date: '2026-02-30' },
    { ...row, taskType: '风险预警', level: 2 },
    { ...row, stationName: '' },
    { ...row, voltage: null },
    { ...row, method: '未知' },
    { ...row, temperatureCount: -1 },
    { ...row, inspectionCount: 1.5 },
    { ...row, equipment: {} },
    { ...row, isPreStart: 'false' },
  ]) {
    assert.throws(() => validateBackupRecords([invalid]), /第 1 条排班记录格式无效/);
  }
});

test('合并忽略本机自增 ID 与人工覆盖值，同日同站的不同任务分别保留', () => {
  assert.equal(planMergeKey(row), planMergeKey({ ...row, id: 900, method: 'manual', temperatureCount: 3 }));
  for (const different of [
    { ...row, date: '2026-11-07' },
    { ...row, noticeNumber: '另一次活动' },
    { ...row, equipment: '马台街变母线' },
    { ...row, taskType: '风险预警', level: 6 },
  ]) {
    assert.notEqual(planMergeKey(row), planMergeKey(different));
  }
});

test('备份文件名使用本地日期与时分', () => {
  assert.equal(backupFileName(new Date(2026, 10, 5, 14, 30)), '备份_20261105_1430.json');
});
