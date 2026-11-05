import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSchedule } from '../src/services/ScheduleGenerator.mjs';

const form = {
  taskType: '保电',
  startDate: '2026-11-01',
  endDate: '2026-11-02',
  stationNames: ['鼓楼', '宁海路'],
  equipmentText: '鼓楼和宁海路母线',
};

test('2 级保电从起始日开始，首巡按站点的常规方式安排', () => {
  const draft = generateSchedule({ ...form, level: 2 });

  assert.deepEqual(draft.map(row => row.date), [
    '2026-11-01', '2026-11-01', '2026-11-02', '2026-11-02',
  ]);
  assert.ok(draft.every(row => !row.isPreStart));
  assert.deepEqual(draft.slice(0, 2).map(row => [row.method, row.inspectionCount, row.temperatureCount]), [
    ['manual', 1, 1], ['robot', 1, 0],
  ]);
});

test('1 级保电及各级风险预警在起始日前一天安排人工 1 巡 1 测', () => {
  for (const [taskType, level] of [['保电', 1], ['风险预警', 5], ['风险预警', 6], ['风险预警', 7]]) {
    const draft = generateSchedule({ ...form, taskType, level });
    const preStart = draft.filter(row => row.isPreStart);

    assert.equal(preStart.length, form.stationNames.length);
    for (const row of preStart) {
      assert.equal(row.date, '2026-10-31');
      assert.equal(row.method, 'manual');
      assert.equal(row.inspectionCount, 1);
      assert.equal(row.temperatureCount, 1);
    }
  }
});
