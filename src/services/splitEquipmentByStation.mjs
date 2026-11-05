import { stations } from '../data/stations.mjs';

/** 按站名划分设备说明，并合并同一站点重复出现的段落。 */
export function splitEquipmentByStation(equipmentText, stationLedger = stations) {
  const names = stationLedger.map(({ name }) => name)
    .sort((left, right) => right.length - left.length)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (names.length === 0) return new Map();

  // 将站名前的电压和站点后缀一起归入本站，避免电压留在上一站的段落中。
  const pattern = new RegExp(`(?:\\d+(?:\\.\\d+)?\\s*(?:kv|千伏)\\s*)?(${names.join('|')})(?:变电站|变|站)?`, 'giu');
  const mentions = Array.from(equipmentText.matchAll(pattern));
  const sections = new Map();
  let sharedStations = [];

  for (let index = 0; index < mentions.length; index += 1) {
    const mention = mentions[index];
    const nextStart = mentions[index + 1]?.index ?? equipmentText.length;
    const description = equipmentText.slice(mention.index + mention[0].length, nextStart)
      .replace(/相关设备运行维护\s*[，,]?\s*确保安全运行[\s。，,、；;!！）)]*$/u, '');
    sharedStations.push({ name: mention[1], heading: mention[0] });

    // “宁海路、鼓楼主变”中的设备说明同时分配给两个站。
    if (index + 1 < mentions.length && /^(?:[\s、，,；;]|和|与|及|以及|等)*$/u.test(description)) continue;

    const equipment = description.replace(/^[\s、，,；;:：]+|[\s、，,；;。]+$/gu, '');
    for (const { name, heading } of sharedStations) {
      if (!sections.has(name)) sections.set(name, new Set());
      sections.get(name).add(`${heading}${equipment}`);
    }
    sharedStations = [];
  }

  return new Map(Array.from(sections, ([name, parts]) => [name, Array.from(parts).join('\n')]));
}
