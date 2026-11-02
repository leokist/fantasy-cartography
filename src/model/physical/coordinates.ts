// The lat/lon box the climate is computed on

import { rn } from "@/utils/number-utils";

// Fantasy Cartography makes game maps, not slices of a globe: every map sits on the same temperate-to-warm band,
// so climate comes from the climate settings and the author's regions alone
export const GAME_GEOGRAPHY = { mapSize: 20, latitude: 30, longitude: 50 };

class CoordinatesModule {
  generate(): void {
    Object.assign(options.map.geography, GAME_GEOGRAPHY);
    this.calculate();
  }

  /** calculate the map lat/lon box from its size and position */
  calculate(): void {
    const sizeFraction = options.map.geography.mapSize / 100;
    const latShift = options.map.geography.latitude / 100;
    const lonShift = options.map.geography.longitude / 100;

    const latT = rn(sizeFraction * 180, 1);
    const latN = rn(90 - (180 - latT) * latShift, 1);
    const latS = rn(latN - latT, 1);

    const lonT = rn(Math.min((options.map.graph.width / options.map.graph.height) * latT, 360), 1);
    const lonE = rn(180 - (360 - lonT) * lonShift, 1);
    const lonW = rn(lonE - lonT, 1);

    options.map.geography.coordinates = { latT, latN, latS, lonT, lonW, lonE };
  }
}

export const Coordinates = new CoordinatesModule();
