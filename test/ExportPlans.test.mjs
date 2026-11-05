import assert from 'node:assert/strict';
import test from 'node:test';
import { createScheduleWorkbook, getPlansInDateRange } from '../src/services/exportPlans.mjs';

const range = { startDate: '2026-11-30', endDate: '2026-12-01' };
const base = {
  stationName: '小营', voltage: '110kV', taskType: '保电', level: 2, noticeNumber: '党代会',
  equipment: '110千伏小营变（特别是110千伏Ⅰ段母线）',
  method: 'robot', inspectionCount: 1, temperatureCount: 0,
};
const plans = [
  { ...base, date: '2026-12-02' },
  { ...base, date: '2026-12-01' },
  { ...base, date: '2026-11-29' },
  { ...base, date: '2026-11-30' },
];

test('导出包含跨月范围的两端日期，按日期排序且不修改输入', () => {
  const before = structuredClone(plans);
  assert.deepEqual(getPlansInDateRange(plans, range).map(row => row.date), ['2026-11-30', '2026-12-01']);
  assert.deepEqual(plans, before);
});

test('Excel 使用清洗后的七列数据，签字栏留空并配置一页宽打印', async () => {
  const workbook = createScheduleWorkbook(plans, range);
  const sheet = workbook.getWorksheet('巡视安排');
  assert.deepEqual(sheet.getRow(1).values.slice(1), ['日期', '变电站', '保电任务', '保电设备', '巡视记录', '测温记录', '巡视人']);
  assert.deepEqual(sheet.getRow(2).values.slice(1), ['2026-11-30', '小营', '二级保电党代会', '110千伏Ⅰ段母线', '机器 1 次', '测温 0 次', '']);
  assert.equal(sheet.rowCount, 3);
  assert.equal(sheet.pageSetup.orientation, 'landscape');
  assert.equal(sheet.pageSetup.paperSize, 9);
  assert.equal(sheet.pageSetup.fitToPage, true);
  assert.equal(sheet.pageSetup.fitToWidth, 1);
  assert.equal(sheet.pageSetup.fitToHeight, 0);
  assert.equal(sheet.pageSetup.printTitlesRow, '1:1');
  assert.equal(sheet.pageSetup.printArea, 'A1:G3');
  sheet.eachRow(row => row.eachCell({ includeEmpty: true }, cell => {
    assert.equal(cell.alignment.wrapText, true);
    for (const side of ['top', 'bottom', 'left', 'right']) {
      assert.equal(cell.border[side].style, 'thin');
      assert.equal(cell.border[side].color.argb, 'FF000000');
    }
  }));
  assert.ok((await workbook.xlsx.writeBuffer()).byteLength > 0);
});

test('导出缺失、无效、倒置或空记录范围时给出可读错误', () => {
  assert.throws(() => createScheduleWorkbook(plans, { startDate: '', endDate: '' }), /有效的起止日期/);
  assert.throws(() => createScheduleWorkbook(plans, { startDate: '2026-02-30', endDate: '2026-12-01' }), /有效的起止日期/);
  assert.throws(() => createScheduleWorkbook(plans, { startDate: '2026-12-01', endDate: '2026-11-30' }), /结束日期/);
  assert.throws(() => createScheduleWorkbook([], range), /没有已确认的巡视计划/);
});
