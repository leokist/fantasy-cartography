// Fantasy Cartography has no religions: the map keeps only "No religion" so the file format stays the same

export interface Religion {
  i: number;
  name: string;
  removed?: boolean;
  [key: string]: unknown; // fields of religions in maps made before they were removed
}

/** Every cell of no religion; maps loaded with religions lose them */
export function clearReligions(): void {
  pack.religions = [{ i: 0, name: "No religion" }];
  pack.cells.religion = new Uint16Array(pack.cells.i.length);
}
