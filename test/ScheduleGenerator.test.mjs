import assert from 'node:assert/strict';
import test from 'node:test';
import { stations } from '../src/data/stations.mjs';
import { restrictedEquipmentByStation } from '../src/data/restrictedEquipment.mjs';
import { robotTempCapableEquipment } from '../src/data/robotTempCapable.mjs';
import { canRobotTemp, canUseRobotForSpecial, generateSchedule } from '../src/services/ScheduleGenerator.mjs';

const form = {
  taskType: '保电',
  startDate: '2026-11-01',
  endDate: '2026-11-02',
  stationNames: ['鼓楼', '宁海路'],
  equipmentText: '鼓楼和宁海路母线',
};

test('6级风险预警220kV跨空档日计时：第1天人工，第9天触发7天熔断', () => {
  const station = stations.find(row => row.name === '宁海路');
  const equipmentText = '宁海路变GIS母线';
  assert.equal(station.voltage, '220kV');
  assert.equal(canUseRobotForSpecial(station, equipmentText), true);
  // T−1为10月31日，第1天为11月1日，到第9天共10个自然日。
  const rows = generateSchedule({
    taskType: '风险预警', level: 6, startDate: '2026-11-01', endDate: '2026-11-09',
    stationNames: ['宁海路'], equipmentText,
  });
  assert.deepEqual(rows.map(row => row.date), [
    '2026-10-31', '2026-11-01', '2026-11-03', '2026-11-05', '2026-11-07', '2026-11-09',
  ], '只在T−1及每2天的正常排班日生成记录，空档日不插入任务');
  assert.deepEqual(rows.map(row => row.method), ['manual', 'manual', 'robot', 'robot', 'robot', 'manual']);
  assert.deepEqual(rows.map(row => row.isPreStart), [true, false, false, false, false, false]);
  assert.ok(rows.every(row => row.inspectionCount === 1));
  assert.deepEqual(rows.map(row => row.temperatureCount), [1, 1, 0, 0, 0, 1]);
  const last = rows.at(-1);
  assert.equal(last.date, '2026-11-09');
  assert.equal(last.method, 'manual', '距第1天人工已过8天，必须熔断');
  assert.ok(last.temperatureCount > 0);
  assert.equal(last.temperatureCount, last.inspectionCount);
});

test('6级风险预警110kV跨空档日计时：第1天人工，第16天触发14天熔断', () => {
  const station = stations.find(row => row.name === '小营');
  const equipmentText = '小营变GIS母线';
  assert.equal(station.voltage, '110kV');
  assert.equal(canUseRobotForSpecial(station, equipmentText), true);
  // 含T−1共18个自然日；末日为第17天，不额外生成第19天的记录。
  const rows = generateSchedule({
    taskType: '风险预警', level: 6, startDate: '2026-11-01', endDate: '2026-11-17',
    stationNames: ['小营'], equipmentText,
  });
  assert.deepEqual(rows.map(row => row.date), [
    '2026-10-31', '2026-11-01', '2026-11-04', '2026-11-07', '2026-11-10', '2026-11-13', '2026-11-16',
  ], '只在T−1及每3天的正常排班日生成记录，空档日不重置计时');
  assert.deepEqual(rows.map(row => row.method), ['manual', 'manual', 'robot', 'robot', 'robot', 'robot', 'manual']);
  assert.deepEqual(rows.map(row => row.isPreStart), [true, false, false, false, false, false, false]);
  assert.ok(rows.every(row => row.inspectionCount === 1));
  assert.deepEqual(rows.map(row => row.temperatureCount), [1, 1, 0, 0, 0, 0, 1]);
  const last = rows.at(-1);
  assert.equal(last.date, '2026-11-16');
  assert.equal(last.method, 'manual', '距第1天人工已过15天，必须熔断');
  assert.ok(last.temperatureCount > 0);
  assert.equal(last.temperatureCount, last.inspectionCount);
});

test('马台街 1号主变允许机器巡视，测温次数与巡视次数相等', () => {
  for (const level of [1, 2]) {
    const rows = generateSchedule({
      taskType: '保电', level, startDate: '2026-11-06', endDate: '2026-11-07',
      stationNames: ['马台街'], equipmentText: '1号主变',
    });
    const row = rows.find(plan => plan.date === '2026-11-07');
    assert.equal(row.method, 'robot');
    assert.equal(row.inspectionCount, level === 1 ? 2 : 1);
    assert.ok(row.temperatureCount > 0);
    assert.equal(row.temperatureCount, row.inspectionCount);
    assert.ok(rows.filter(plan => plan.isPreStart).every(plan => plan.method === 'manual' && plan.temperatureCount === 1));
  }
});

test('11 站主变命中机器测温白名单，宁海路不在白名单中', () => {
  assert.deepEqual(Array.from(robotTempCapableEquipment.keys()), [
    '新街口', '云南路', '萨家湾', '小营', '上海路', '古平岗',
    '长江路', '安仁街', '珠江路', '玄武', '马台街',
  ]);
  const rows = generateSchedule({
    taskType: '保电', level: 2, startDate: '2026-11-06', endDate: '2026-11-07',
    stationNames: Array.from(robotTempCapableEquipment.keys()), equipmentText: '1号主变',
  });
  assert.equal(rows.length, 22);
  assert.ok(rows.filter(row => row.date === '2026-11-07').every(row => row.method === 'robot' && row.temperatureCount === row.inspectionCount));
  assert.equal(canRobotTemp('宁海路', '1号主变'), false);
  assert.equal(canRobotTemp('马台街', '１号主 变'), true);
  assert.equal(canRobotTemp('马台街', '110千伏Ⅰ段母线'), false);
});

test('机器测温按本站设备计算，受限主变仍强制人工', () => {
  const rows = generateSchedule({
    taskType: '保电', level: 2, startDate: '2026-11-06', endDate: '2026-11-07',
    stationNames: ['马台街', '小营', '云南路', '宁海路'],
    equipmentText: '马台街变母线；小营变1号主变；云南路变1号主变701间隔；宁海路变1号主变',
  });
  assert.deepEqual(rows.filter(row => row.date === '2026-11-07').map(row => [row.stationName, row.method, row.temperatureCount]), [
    ['马台街', 'robot', 0],
    ['小营', 'robot', 1],
    ['云南路', 'manual', 1],
    ['宁海路', 'manual', 1],
  ]);
});

test('宁海路主变命中独立配置，正常巡视日强制人工且不豁免测温', () => {
  const station = stations.find(row => row.name === '宁海路');
  const equipmentText = '宁海路变1号主变、7N1间隔';
  assert.ok(station);
  assert.equal(station.voltage, '220kV');
  assert.equal(station.canRobot, true);
  assert.ok(restrictedEquipmentByStation.get('宁海路')?.includes('主变'));
  assert.equal(canUseRobotForSpecial(station, equipmentText), false);

  for (const level of [1, 2]) {
    const input = {
      taskType: '保电', level,
      startDate: '2026-11-01', endDate: '2026-11-05',
      stationNames: ['宁海路'], equipmentText,
    };
    // 第3天既不是 T−1，也未到220kV站第7天强制人工的边界。
    const rows = generateSchedule(input).filter(row => row.date === '2026-11-03');
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.equal(row.stationName, '宁海路');
    assert.equal(row.isPreStart, false);
    assert.equal(row.method, 'manual');
    assert.equal(row.inspectionCount, level === 1 ? 2 : 1);
    assert.ok(row.temperatureCount > 0);
    assert.equal(row.temperatureCount, row.inspectionCount);

    // 同站、同日仅保留7N1间隔时应允许机器替代，排除日期或站点导致人工的假阳性。
    const controlEquipment = '宁海路变7N1间隔';
    assert.equal(canUseRobotForSpecial(station, controlEquipment), true);
    const controlRows = generateSchedule({ ...input, equipmentText: controlEquipment })
      .filter(candidate => candidate.date === row.date);
    assert.equal(controlRows.length, 1);
    assert.equal(controlRows[0].method, 'robot');
    assert.equal(controlRows[0].temperatureCount, 0);
  }
});

test('2 级保电从起始日开始，首日锁定人工，次日按站点的常规方式安排', () => {
  const draft = generateSchedule({ ...form, level: 2 });

  assert.deepEqual(draft.map(row => row.date), [
    '2026-11-01', '2026-11-01', '2026-11-02', '2026-11-02',
  ]);
  assert.ok(draft.every(row => !row.isPreStart));
  assert.deepEqual(draft.slice(0, 2).map(row => [row.method, row.inspectionCount, row.temperatureCount]), [
    ['manual', 1, 1], ['manual', 1, 1],
  ]);
  assert.deepEqual(draft.slice(2).map(row => row.method), ['manual', 'robot']);
  assert.ok(draft.slice(0, 2).every(row => row.isFirstDayManual));
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
    const firstDay = draft.find(row => row.date === form.startDate && row.stationName === '宁海路');
    const periodicRisk = taskType === '风险预警' && [6, 7].includes(level);
    assert.equal(firstDay.method, periodicRisk ? 'manual' : 'robot');
    assert.equal(firstDay.isFirstDayManual, periodicRisk);
  }
});

test('自定义每站仅生成所选单日人工记录，次数完全按表单原值', () => {
  for (const inspectionCount of [1, 2, 3]) {
    for (const temperatureCount of [0, 1, 2, 3]) {
      const rows = generateSchedule({
        taskType: '自定义', projectName: '节前专项', inspectionDate: '2026-12-02',
        inspectionCount, temperatureCount,
        // 遗留的日期字段不参与自定义单日生成。
        startDate: '2026-11-01', endDate: '2026-12-31', selectedDates: ['2026-11-29', '2026-12-01'],
        stationNames: ['小营', '鼓楼', '宁海路'], equipmentText: '小营变母线；鼓楼变母线；宁海路变主变',
      });
      assert.equal(rows.length, 3);
      assert.ok(rows.every(row => row.date === '2026-12-02' && row.method === 'manual'
        && row.inspectionCount === inspectionCount && row.temperatureCount === temperatureCount
        && !row.isPreStart && !row.isFirstDayManual && row.projectName === '节前专项'));
    }
  }
});

test('自定义必填项目名、单日和有效次数，拒绝使用多选日期生成新任务', () => {
  const input = { taskType: '自定义', projectName: '专项', inspectionDate: '2026-11-06',
    inspectionCount: 3, temperatureCount: 0, stationNames: ['宁海路'], equipmentText: '宁海路变主变' };
  for (const change of [{ projectName: ' ' }, { inspectionDate: '' }, { inspectionDate: '2026-02-30' },
    { inspectionCount: 0 }, { inspectionCount: 4 }, { inspectionCount: '2' },
    { temperatureCount: -1 }, { temperatureCount: 4 }, { temperatureCount: undefined },
    { inspectionDate: undefined, selectedDates: ['2026-11-06', '2026-11-07'] }]) {
    assert.throws(() => generateSchedule({ ...input, ...change }), RangeError);
  }
});

test('无前置任务的长期替代计数从首日人工后重新计算', () => {
  const rows = generateSchedule({ taskType: '保电', level: 2,
    startDate: '2026-11-01', endDate: '2026-11-16',
    stationNames: ['宁海路', '小营'], equipmentText: '宁海路变母线；小营变母线' });
  assert.deepEqual(rows.filter(row => row.method === 'manual' && row.stationName === '宁海路').map(row => row.date),
    ['2026-11-01', '2026-11-08', '2026-11-15']);
  assert.deepEqual(rows.filter(row => row.method === 'manual' && row.stationName === '小营').map(row => row.date),
    ['2026-11-01', '2026-11-15']);
});
