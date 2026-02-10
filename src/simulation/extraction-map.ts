import type { Vec2, ExtractionMapConfig, ExtractionZone, ZoneConfig } from './types.ts';

/** Get which zone index a y-coordinate falls in (or -1 if outside all zones) */
export function getZoneIndex(map: ExtractionMapConfig, y: number): number {
  for (let i = 0; i < map.zones.length; i++) {
    const zone = map.zones[i];
    if (y >= zone.yMin && y < zone.yMax) return i;
  }
  return -1;
}

/** Get the zone config for a y-coordinate (or null if outside all zones) */
export function getZone(map: ExtractionMapConfig, y: number): ZoneConfig | null {
  const idx = getZoneIndex(map, y);
  return idx >= 0 ? map.zones[idx] : null;
}

/** Check if a position is inside the extraction zone */
export function isInExtractionZone(pos: Vec2, zone: ExtractionZone): boolean {
  const halfW = zone.width / 2;
  const halfH = zone.height / 2;
  return (
    pos.x >= zone.x - halfW &&
    pos.x <= zone.x + halfW &&
    pos.y >= zone.y - halfH &&
    pos.y <= zone.y + halfH
  );
}

/** Check if a position is inside a rectangular region */
export function isInRegion(pos: Vec2, rx: number, ry: number, rw: number, rh: number): boolean {
  const halfW = rw / 2;
  const halfH = rh / 2;
  return (
    pos.x >= rx - halfW &&
    pos.x <= rx + halfW &&
    pos.y >= ry - halfH &&
    pos.y <= ry + halfH
  );
}
