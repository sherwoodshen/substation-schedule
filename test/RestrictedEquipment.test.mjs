import assert from 'node:assert/strict';
import test from 'node:test';
import { stations } from '../src/data/stations.mjs';
import { restrictedEquipmentByStation } from '../src/data/restrictedEquipment.mjs';
import {
  canUseRobotForSpecial,
  findRestrictedEquipment,
  generateSchedule,
  normalizeEquipmentText,
} from '../src/services/ScheduleGenerator.mjs';

const stationByName = new Map(stations.map(station => [station.name, station]));

test('配置库全部受限特征码兼容大小写、罗马数字和千伏单位', () => {
  assert.deepEqual(Array.from(restrictedEquipmentByStation, ([name, features]) => [name, features.length]), [
    ['宁海路', 1], ['新街口', 9], ['云南路', 6], ['萨家湾', 12],
  ]);

  for (const [name, features] of restrictedEquipmentByStation) {
    for (const feature of features) {
      const variants = [
        feature,
        feature.toLowerCase(),
        feature.normalize('NFKC').replace('KV', ' 千伏 '),
      ];
      for (const equipment of variants) {
        assert.notEqual(findRestrictedEquipment(name, `特别是${equipment}及其他设备`), null);
        assert.equal(canUseRobotForSpecial(stationByName.get(name), equipment), false);
      }
    }
  }
  assert.equal(findRestrictedEquipment('新街口', '莫新1号线793间隔'), '793');
  assert.equal(findRestrictedEquipment('新街口', '莫新#1线793间隔'), '793');
  assert.equal(findRestrictedEquipment('萨家湾', '下萨2号线738间隔'), '738');
  assert.equal(normalizeEquipmentText('１１０ｋｖ Ⅱ段母线、１号主变'), '110KVII段母线、#1主变');
});

test('中文错别字不影响编号匹配，云南路使用配置中的 7H31', () => {
  assert.equal(findRestrictedEquipment('云南路', '摩云796'), '796');
  assert.equal(findRestrictedEquipment('云南路', '宁芸7n9'), '7N9');
  assert.equal(findRestrictedEquipment('云南路', '码龙1号线7h31间隔'), '7H31');
  assert.equal(findRestrictedEquipment('云南路', '码龙1号线7H3间隔'), null);
  assert.equal(findRestrictedEquipment('云南路', '11号主变变一侧701间隔'), '701');
  assert.equal(restrictedEquipmentByStation.get('云南路').includes('7H31'), true);
});

test('宁海路统一读取配置，添加和删除特征码即可改变拦截结果', () => {
  const station = stationByName.get('宁海路');
  const original = restrictedEquipmentByStation.get('宁海路');
  assert.equal(findRestrictedEquipment('宁海路', '宁海路1号主变'), '主变');
  assert.equal(canUseRobotForSpecial(station, '宁海路1号主 变'), false);
  assert.equal(canUseRobotForSpecial(station, '宁海路备用母线'), true);
  try {
    restrictedEquipmentByStation.set('宁海路', [...original, '备用母线']);
    assert.equal(canUseRobotForSpecial(station, '宁海路备用母线'), false);
    restrictedEquipmentByStation.set('宁海路', []);
    assert.equal(canUseRobotForSpecial(station, '宁海路1号主变'), true);
  } finally {
    restrictedEquipmentByStation.set('宁海路', original);
  }
});

test('普通 110kV 设备、其他站的专属编号及未列入编号不会误拦截', () => {
  for (const name of ['新街口', '云南路', '萨家湾']) {
    assert.equal(findRestrictedEquipment(name, '110kV正母线、110千伏Ⅲ段母线'), null);
    assert.equal(canUseRobotForSpecial(stationByName.get(name), '110kV正母线'), true);
  }
  assert.equal(findRestrictedEquipment('云南路', '莫新#1线793间隔'), null);
  assert.equal(findRestrictedEquipment('新街口', '宁云#1线7N9间隔'), null);
  assert.equal(findRestrictedEquipment('新街口', '莫新#1线795间隔'), null);
});

test('三站未命中清单时仍执行 T−1 人工和第14天强制人工', () => {
  const rows = generateSchedule({
    taskType: '保电', level: 1, startDate: '2026-11-01', endDate: '2026-11-15',
    stationNames: ['新街口', '云南路', '萨家湾'], equipmentText: '110kV正母线',
  });

  assert.equal(rows.length, 48);
  for (const row of rows) {
    const manual = row.isPreStart || row.date === '2026-11-14';
    assert.equal(row.method, manual ? 'manual' : 'robot');
    assert.equal(row.temperatureCount, manual ? row.inspectionCount : 0);
  }
});

test('从本站拆分文本匹配清单，命中后按基础频次测温', () => {
  const rows = generateSchedule({
    taskType: '保电', level: 2, startDate: '2026-11-06', endDate: '2026-11-06',
    stationNames: ['新街口', '云南路', '萨家湾'],
    equipmentText: '新街口变110kV正母线；云南路变摩云796；萨家湾变110千伏Ⅱ段母线',
  });

  assert.deepEqual(rows.map(row => [row.stationName, row.method, row.inspectionCount, row.temperatureCount]), [
    ['新街口', 'robot', 1, 0],
    ['云南路', 'manual', 1, 1],
    ['萨家湾', 'manual', 1, 1],
  ]);
});
