import { stations } from '../data/stations.mjs';
import { restrictedEquipmentByStation } from '../data/restrictedEquipment.mjs';
import { robotTempCapableEquipment } from '../data/robotTempCapable.mjs';
import { splitEquipmentByStation } from './splitEquipmentByStation.mjs';
import { normalizeTaskForm } from './taskModel.mjs';

export { restrictedEquipmentByStation };

const DAY_MS = 86_400_000;
const riskIntervals = new Map([
  ['220kV', 2],
  ['110kV', 3],
  ['35kV', 3],
]);
/** 统一大写、全半角、罗马数字、电压单位、空白和“号/#”写法。 */
export function normalizeEquipmentText(text = '') {
  return (text ?? '')
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .replace(/千伏/gu, 'KV')
    .toUpperCase()
    .replace(/(\d+)号/gu, '#$1');
}

/** 按子串包含规则返回本站命中的受限特征码，未命中返回 null。 */
export function findRestrictedEquipment(stationName, equipmentText = '') {
  const normalizedText = normalizeEquipmentText(equipmentText);
  const restrictedFeatures = restrictedEquipmentByStation.get(stationName) ?? [];
  return restrictedFeatures.find(feature => normalizedText.includes(normalizeEquipmentText(feature))) ?? null;
}

export function canUseRobotForSpecial(station, equipmentText = '') {
  if (station?.canRobot !== true) return false;
  return findRestrictedEquipment(station.name, equipmentText) === null;
}

export function canRobotTemp(stationName, equipmentText = '') {
  const normalizedText = normalizeEquipmentText(equipmentText);
  const capableFeatures = robotTempCapableEquipment.get(stationName) ?? [];
  return capableFeatures.some(feature => normalizedText.includes(normalizeEquipmentText(feature)));
}

function parseDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`${label}须使用 YYYY-MM-DD 格式`);
  }

  // 统一以 UTC 零点做日历计算，避免浏览器时区影响日期。
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new RangeError(`${label}不是有效日期`);
  }
  return timestamp;
}

/**
 * 从表单生成内存草稿。form.level 为数字，日期为 YYYY-MM-DD。
 * stationLedger 可用于传入补充后的站点台账。
 */
export function generateSchedule(form, stationLedger = stations) {
  const {
    taskType, level, startDate, endDate, stationNames,
    noticeNumber, equipmentText, projectName, inspectionCount: customInspectionCount, temperatureCount: customTemperatureCount,
  } = normalizeTaskForm(form);
  const isCustom = taskType === '自定义';

  const isProtection = taskType === '保电' && [1, 2].includes(level);
  const isRisk = taskType === '风险预警' && [5, 6, 7].includes(level);
  if (!isProtection && !isRisk && !isCustom) {
    throw new RangeError('任务类型与级别不匹配');
  }
  if (!Array.isArray(stationNames) || stationNames.length === 0) {
    throw new RangeError('请至少选择一个变电站');
  }

  const equipmentByStation = splitEquipmentByStation(equipmentText, stationLedger);
  const stationByName = new Map(stationLedger.map(station => [station.name, station]));
  const selectedStations = stationNames.map(name => {
    const station = stationByName.get(name);
    if (!station) throw new RangeError(`台账中没有变电站「${name}」`);
    return { station, equipment: equipmentByStation.get(name) ?? equipmentText };
  });

  // 自定义是单日人工配置，不进入前置、频次、替代、测温豁免或长周期算法。
  if (isCustom) {
    return selectedStations.map(({ station, equipment }) => ({
      date: startDate, noticeNumber, stationName: station.name, voltage: station.voltage,
      taskType, level: null, projectName, method: 'manual',
      inspectionCount: customInspectionCount, temperatureCount: customTemperatureCount,
      equipment, isPreStart: false, isFirstDayManual: false,
    }));
  }

  const start = parseDate(startDate, '起始日期');
  const end = parseDate(endDate, '结束日期');
  if (end < start) {
    throw new RangeError('结束日期须等于或晚于起始日期');
  }
  const needsPreStart = isRisk || (isProtection && level === 1);
  if (needsPreStart && startDate === '0000-01-01') {
    throw new RangeError('T−1 日期超出 YYYY-MM-DD 支持范围');
  }

  const isPeriodicRisk = isRisk && level !== 5;
  const baseCount = level === 1 || level === 5 ? 2 : 1;
  const stationPlans = selectedStations.map(({ station, equipment }) => {
    const intervalDays = isPeriodicRisk ? riskIntervals.get(station.voltage) : 1;
    if (intervalDays === undefined) {
      throw new RangeError(`${station.name}（${station.voltage}）尚未配置风险预警${level}级巡视频次`);
    }

    return {
      station,
      equipment,
      intervalDays,
      canUseRobot: canUseRobotForSpecial(station, equipment),
      manualEveryDays: station.voltage === '220kV' ? 7 : 14,
      lastManualOffset: null,
    };
  });

  const draft = [];
  const lastOffset = (end - start) / DAY_MS;
  const firstOffset = needsPreStart ? -1 : 0;
  for (let offset = firstOffset; offset <= lastOffset; offset += 1) {
    const date = new Date(start + offset * DAY_MS).toISOString().slice(0, 10);
    const isPreStart = offset === -1;
    // 周期风险预警即使已有T−1巡视，起始日仍须人工并重设熔断基准。
    const firstDayManual = offset === 0 && (!needsPreStart || isPeriodicRisk);

    for (const plan of stationPlans) {
      const { station, equipment, intervalDays, canUseRobot, manualEveryDays } = plan;
      if (!isPreStart && offset % intervalDays !== 0) {
        // 空档日不生成任务，也不改变上次人工巡视的计时起点。
        continue;
      }

      let method = 'manual';
      // offset 以 UTC 日历日计算；T−1、首日人工及后续人工均更新本站基准。
      const daysSinceManual = plan.lastManualOffset === null ? Infinity : offset - plan.lastManualOffset;
      if (!isPreStart && !firstDayManual && canUseRobot && daysSinceManual < manualEveryDays) {
        method = 'robot';
      }
      if (method === 'manual') plan.lastManualOffset = offset;

      const inspectionCount = isPreStart ? 1 : baseCount;
      draft.push({
        date,
        noticeNumber,
        stationName: station.name,
        voltage: station.voltage,
        taskType,
        level,
        method,
        inspectionCount,
        temperatureCount: method === 'manual' || canRobotTemp(station.name, equipment) ? inspectionCount : 0,
        equipment,
        isPreStart,
        isFirstDayManual: firstDayManual,
      });
    }
  }

  return draft;
}
