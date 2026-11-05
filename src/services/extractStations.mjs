import { stations } from '../data/stations.mjs';

export function extractStations(equipment) {
  return stations.filter(({ name }) => equipment.includes(name));
}
