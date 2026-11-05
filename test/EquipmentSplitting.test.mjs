import assert from 'node:assert/strict';
import test from 'node:test';
import { splitEquipmentByStation } from '../src/services/splitEquipmentByStation.mjs';
import { generateSchedule } from '../src/services/ScheduleGenerator.mjs';

const screenshotText = '加强220千伏宁海路变（特别是220千伏正母线、1号主变、110千伏正母线、宁楼1号7N1间隔）、110千伏鼓楼变（特别是110千伏Ⅰ段母线、1号主变）、长江路变（特别是110千伏Ⅰ段母线）相关设备运行维护，确保安全运行。';

test('通知段落中的站名、电压和括号设备说明分配到本站', () => {
  assert.deepEqual(Object.fromEntries(splitEquipmentByStation(screenshotText)), {
    宁海路: '220千伏宁海路变（特别是220千伏正母线、1号主变、110千伏正母线、宁楼1号7N1间隔）',
    鼓楼: '110千伏鼓楼变（特别是110千伏Ⅰ段母线、1号主变）',
    长江路: '长江路变（特别是110千伏Ⅰ段母线）',
  });
  assert.deepEqual(Object.fromEntries(splitEquipmentByStation('（（二）加强220千伏莫愁湖变（特别是110千伏Ⅲ段母线、莫虎1号797间隔）、虎踞变（特别是110千伏运行母线、运行主变）、上海路变（特别是110千伏Ⅰ段母线）相关设备运行维护，确保安全运行。）')), {
    虎踞: '虎踞变（特别是110千伏运行母线、运行主变）',
    上海路: '上海路变（特别是110千伏Ⅰ段母线）',
  });
});

test('同站多段合并、重复段去重，并列站名共用后续设备说明', () => {
  assert.deepEqual(Object.fromEntries(splitEquipmentByStation('小营变主变；小营变主变\n小营变母线')), {
    小营: '小营变主变\n小营变母线',
  });
  assert.deepEqual(Object.fromEntries(splitEquipmentByStation('鼓楼和宁海路母线')), {
    鼓楼: '鼓楼母线',
    宁海路: '宁海路母线',
  });
});

test('设备拦截按本站文本判定，其他站的主变或 110kV 不影响本站', () => {
  const rows = generateSchedule({
    taskType: '保电', level: 2, startDate: '2026-11-06', endDate: '2026-11-06',
    stationNames: ['新街口', '宁海路', '云南路'],
    equipmentText: '新街口10kV母线；宁海路主变；110千伏云南路变母线',
  });

  assert.deepEqual(rows.map(row => [row.stationName, row.equipment, row.method, row.temperatureCount]), [
    ['新街口', '新街口10kV母线', 'robot', 0],
    ['宁海路', '宁海路主变', 'manual', 1],
    ['云南路', '110千伏云南路变母线', 'robot', 0],
  ]);
});

test('截图中的所有日期均使用本站设备，T−1 正常保留人工 1 巡 1 测', () => {
  const rows = generateSchedule({
    taskType: '风险预警', level: 6, startDate: '2026-11-06', endDate: '2026-11-08',
    stationNames: ['宁海路', '鼓楼', '长江路'], equipmentText: screenshotText,
  });
  assert.equal(rows.length, 7);
  assert.equal(new Set(rows.map(row => row.equipment)).size, 3);
  for (const row of rows) {
    assert.ok(row.equipment.includes(row.stationName));
    assert.equal(['宁海路', '鼓楼', '长江路'].filter(name => row.equipment.includes(name)).length, 1);
  }
  assert.ok(rows.filter(row => row.isPreStart).every(row => row.method === 'manual' && row.temperatureCount === 1));
});
