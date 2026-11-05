export function cleanEquipmentText(equipmentText, stationName) {
  const escapedName = stationName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 只剥离段首的本站名称和站点电压，保留设备自身的电压及“站用变”等名称。
  const stationPrefix = new RegExp(
    `(^|[\\n；;])\\s*(?:\\d+(?:\\.\\d+)?\\s*(?:kv|千伏)\\s*)?${escapedName}\\s*(?:变电站|变(?!压器)|站(?!用))?\\s*[:：]?\\s*`,
    'giu',
  );
  return (equipmentText ?? '')
    .replace(/[（）()]/gu, '')
    .replace(/特别是|特别/gu, '')
    .replace(stationPrefix, '$1')
    .trim();
}
