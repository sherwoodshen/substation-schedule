import { describe, expect, it } from 'vitest';
import { stations } from '../src/data/stations.mjs';
import { generateSchedule } from '../src/services/ScheduleGenerator.mjs';

const base = { taskType: '风险预警', startDate: '2026-11-25', endDate: '2026-12-26',
  stationNames: ['宁海路', '小营'], equipmentText: '宁海路变母线；小营变母线' };
const manualDates = rows => rows.filter(row => row.method === 'manual').map(row => row.date);
const dayDistance = (left, right) => (Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86_400_000;

describe.each([6, 7])('%i 级风险预警：自然日熔断跨空档持续计时', level => {
  it('220kV 每两天排班，起始日人工重置T−1基准，强制人工后重新计时', () => {
    const rows = generateSchedule({ ...base, level }).filter(row => row.stationName === '宁海路');
    expect(manualDates(rows)).toEqual(['2026-11-24', '2026-11-25', '2026-12-03', '2026-12-11', '2026-12-19']);
    expect(rows.find(row => row.date === '2026-11-29').method).toBe('robot');
    expect(rows.find(row => row.date === '2026-12-05').method).toBe('robot');
    expect(rows.some(row => row.date === '2026-12-02')).toBe(false); // 满7日的空档日不额外插入任务。
    expect(rows.filter(row => !row.isPreStart).every(row => dayDistance(base.startDate, row.date) % 2 === 0)).toBe(true);
    expect(rows).toHaveLength(17);
  });

  it('110kV 每三天排班，距上次人工满14日后的首个排班日转为人工', () => {
    const rows = generateSchedule({ ...base, level }).filter(row => row.stationName === '小营');
    expect(manualDates(rows)).toEqual(['2026-11-24', '2026-11-25', '2026-12-10', '2026-12-25']);
    expect(rows.find(row => row.date === '2026-12-07').method).toBe('robot'); // 距起始日为12日，尚未达到阈值。
    expect(rows.find(row => row.date === '2026-12-13').method).toBe('robot');
    expect(rows.some(row => row.date === '2026-12-08')).toBe(false);
    expect(rows.filter(row => !row.isPreStart).every(row => dayDistance(base.startDate, row.date) % 3 === 0)).toBe(true);
    expect(rows).toHaveLength(12);
  });

  it('人工巡视正常测温，机器GIS仍免测温，站间状态互不影响', () => {
    const rows = generateSchedule({ ...base, level });
    for (const row of rows) {
      expect(row.inspectionCount).toBe(1);
      expect(row.temperatureCount).toBe(row.method === 'manual' ? 1 : 0);
    }
    const sameDay = rows.filter(row => row.date === '2026-12-19');
    expect(sameDay.map(row => [row.stationName, row.method])).toEqual([['宁海路', 'manual'], ['小营', 'robot']]);
    const laterTask = generateSchedule({ ...base, level, startDate: '2027-01-01', endDate: '2027-01-01' });
    expect(laterTask.filter(row => !row.isPreStart).every(row => row.method === 'manual' && row.isFirstDayManual)).toBe(true);
  });

  it('35kV 若支持机器巡视，也使用14自然日阈值和每3日频次', () => {
    // 仅测试台账启用机器能力，实际中保站的无机器配置不作修改。
    const ledger = stations.map(station => station.name === '中保' ? { ...station, canRobot: true } : station);
    const rows = generateSchedule({ ...base, level, stationNames: ['中保'], equipmentText: '中保变母线' }, ledger);
    expect(manualDates(rows)).toEqual(['2026-11-24', '2026-11-25', '2026-12-10', '2026-12-25']);
  });
});

it('二级保电以首日人工为起点；每日巡视频次的7/14日边界保持正确', () => {
  const rows = generateSchedule({ ...base, taskType: '保电', level: 2, startDate: '2026-11-01', endDate: '2026-11-29' });
  expect(manualDates(rows.filter(row => row.stationName === '宁海路')))
    .toEqual(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
  expect(manualDates(rows.filter(row => row.stationName === '小营'))).toEqual(['2026-11-01', '2026-11-15', '2026-11-29']);
});
