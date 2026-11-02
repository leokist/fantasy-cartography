// The map's name in `options.map.lore`; its year stays internal, dating state history and battle reports. See
// docs/architecture/configuration.md
import { requireName } from "@/utils/validation-utils";

class LoreModel {
  /** Rename the map; files it is downloaded as take the name */
  rename(name: string): void {
    options.map.lore.name = requireName(name);
  }
}

export const Lore = new LoreModel();
