// The default fauna and flora, by default biome id (0 Marine … 12 Wetland); goods are linked by name
import { t } from "@/utils/i18n";

export const SPECIES_KINDS = ["fauna", "flora"] as const;
export const RARITIES = ["common", "uncommon", "rare", "legendary"] as const;
export const DANGERS = ["harmless", "wary", "dangerous", "deadly"] as const;
export const USES = ["food", "wood", "medicine", "poison", "fiber", "dye", "ornamental", "magic"] as const;

export type SpeciesKind = (typeof SPECIES_KINDS)[number];
export type Rarity = (typeof RARITIES)[number];
export type Danger = (typeof DANGERS)[number];
export type Use = (typeof USES)[number];

export interface DefaultSpecies {
  name: string;
  kind: SpeciesKind;
  icon: string;
  biomes: number[];
  rarity: Rarity;
  danger?: Danger;
  domesticable?: boolean;
  uses?: Use[];
  goods?: string[];
}

const fauna = (
  name: string,
  icon: string,
  biomes: number[],
  rarity: Rarity,
  danger: Danger,
  goods: string[] = [],
  domesticable = false
): DefaultSpecies => ({ name, kind: "fauna", icon, biomes, rarity, danger, domesticable, goods });

const flora = (
  name: string,
  icon: string,
  biomes: number[],
  rarity: Rarity,
  uses: Use[],
  goods: string[] = []
): DefaultSpecies => ({ name, kind: "flora", icon, biomes, rarity, uses, goods });

export const getDefaultSpecies = (): DefaultSpecies[] => [
  fauna(t("Whale"), "🐋", [0], "uncommon", "wary", ["Whales"]),
  fauna(t("Dolphin"), "🐬", [0], "common", "harmless"),
  fauna(t("Shark"), "🦈", [0], "uncommon", "deadly"),
  fauna(t("Seal"), "🦭", [0, 10, 11], "common", "harmless", ["Furs"]),
  fauna(t("Cod"), "🐟", [0], "common", "harmless", ["Fish"]),
  flora(t("Kelp"), "🌿", [0], "common", ["food", "fiber"]),
  flora(t("Coral"), "🪸", [0], "uncommon", ["ornamental"], ["Pearls"]),

  fauna(t("Camel"), "🐪", [1, 2], "common", "harmless", ["Camels"], true),
  fauna(t("Scorpion"), "🦂", [1, 3], "common", "dangerous"),
  fauna(t("Fennec fox"), "🦊", [1], "uncommon", "harmless"),
  fauna(t("Vulture"), "🦅", [1, 3], "common", "harmless"),
  flora(t("Date palm"), "🌴", [1], "common", ["food", "wood"], ["Dates"]),
  flora(t("Cactus"), "🌵", [1], "common", ["food", "medicine"]),

  fauna(t("Saiga"), "🦌", [2, 4], "uncommon", "harmless", ["Game"]),
  fauna(t("Snow leopard"), "🐆", [2, 10], "rare", "deadly", ["Furs"]),
  flora(t("Sagebrush"), "🌾", [2, 4], "common", ["medicine"]),

  fauna(t("Lion"), "🦁", [3], "uncommon", "deadly"),
  fauna(t("Elephant"), "🐘", [3, 5], "uncommon", "dangerous", ["Elephants"], true),
  fauna(t("Zebra"), "🦓", [3], "common", "harmless", ["Game"]),
  fauna(t("Giraffe"), "🦒", [3], "uncommon", "harmless"),
  fauna(t("Hyena"), "🐺", [3], "common", "dangerous"),
  flora(t("Acacia"), "🌳", [3], "common", ["wood", "medicine"], ["Incense"]),
  flora(t("Baobab"), "🌳", [3], "uncommon", ["food", "fiber"]),

  fauna(t("Wild horse"), "🐎", [4], "common", "harmless", ["Horses"], true),
  fauna(t("Bison"), "🦬", [4], "common", "wary", ["Leather", "Game"], true),
  fauna(t("Hare"), "🐇", [4, 6, 9, 10], "common", "harmless", ["Game"]),
  fauna(t("Wolf"), "🐺", [4, 6, 9], "common", "dangerous", ["Furs"]),
  flora(t("Wild wheat"), "🌾", [4], "common", ["food"], ["Grain"]),
  flora(t("Lavender"), "💐", [4], "uncommon", ["medicine", "ornamental", "dye"]),

  fauna(t("Tiger"), "🐅", [5, 7], "rare", "deadly", ["Furs"]),
  fauna(t("Peacock"), "🦚", [5], "uncommon", "harmless"),
  fauna(t("Monkey"), "🐒", [5, 7], "common", "wary"),
  fauna(t("Python"), "🐍", [5, 7, 12], "uncommon", "dangerous"),
  flora(t("Teak"), "🌳", [5], "common", ["wood"], ["Wood"]),
  flora(t("Bamboo"), "🎋", [5, 7], "common", ["wood", "food", "fiber"]),
  flora(t("Pepper vine"), "🌶️", [5, 7], "uncommon", ["food"], ["Spices"]),

  fauna(t("Red deer"), "🦌", [6, 8], "common", "harmless", ["Game", "Leather"]),
  fauna(t("Wild boar"), "🐗", [6], "common", "dangerous", ["Game"]),
  fauna(t("Brown bear"), "🐻", [6, 8, 9], "uncommon", "deadly", ["Furs"]),
  fauna(t("Honeybee"), "🐝", [4, 6], "common", "wary", ["Honey"], true),
  fauna(t("Owl"), "🦉", [6, 9], "common", "harmless"),
  flora(t("Oak"), "🌳", [6], "common", ["wood", "dye"], ["Wood"]),
  flora(t("Beech"), "🌳", [6], "common", ["wood"], ["Wood"]),
  flora(t("Grapevine"), "🍇", [6], "uncommon", ["food"], ["Wine"]),
  flora(t("Fly agaric"), "🍄", [6, 9], "uncommon", ["poison", "magic"]),

  fauna(t("Jaguar"), "🐆", [7], "rare", "deadly", ["Furs"]),
  fauna(t("Parrot"), "🦜", [7], "common", "harmless"),
  fauna(t("Poison frog"), "🐸", [7], "uncommon", "deadly"),
  flora(t("Mahogany"), "🌳", [7], "uncommon", ["wood"], ["Mahogany"]),
  flora(t("Rubber tree"), "🌳", [7], "common", ["fiber"]),
  flora(t("Orchid"), "🌸", [7], "rare", ["ornamental", "medicine"]),

  fauna(t("Elk"), "🫎", [8, 9], "common", "wary", ["Game", "Leather"]),
  fauna(t("Salamander"), "🦎", [8, 12], "common", "harmless"),
  flora(t("Redwood"), "🌲", [8], "uncommon", ["wood"], ["Wood"]),
  flora(t("Fern"), "🌿", [8, 7], "common", ["food", "medicine"]),

  fauna(t("Moose"), "🫎", [9], "common", "dangerous", ["Game", "Leather"]),
  fauna(t("Lynx"), "🐈", [9], "uncommon", "wary", ["Furs"]),
  fauna(t("Sable"), "🦦", [9], "rare", "harmless", ["Furs"]),
  flora(t("Spruce"), "🌲", [9], "common", ["wood"], ["Wood", "Tar"]),
  flora(t("Pine"), "🌲", [9, 2], "common", ["wood", "medicine"], ["Wood", "Tar"]),
  flora(t("Lingonberry"), "🫐", [9, 10], "common", ["food"]),

  fauna(t("Reindeer"), "🦌", [10, 9], "common", "harmless", ["Leather", "Game"], true),
  fauna(t("Arctic fox"), "🦊", [10, 11], "common", "harmless", ["Furs"]),
  fauna(t("Musk ox"), "🐂", [10], "uncommon", "wary", ["Furs"]),
  fauna(t("Snowy owl"), "🦉", [10], "uncommon", "harmless"),
  flora(t("Lichen"), "🌱", [10, 11], "common", ["food", "dye"]),
  flora(t("Dwarf birch"), "🌳", [10], "common", ["wood"]),

  fauna(t("Polar bear"), "🐻‍❄️", [11, 10], "rare", "deadly", ["Furs"]),
  fauna(t("Walrus"), "🦭", [11, 0], "uncommon", "wary", ["Leather"]),
  flora(t("Snow moss"), "🌱", [11], "rare", ["medicine"]),

  fauna(t("Crocodile"), "🐊", [12, 7], "uncommon", "deadly", ["Leather"]),
  fauna(t("Heron"), "🪿", [12], "common", "harmless"),
  fauna(t("Beaver"), "🦫", [12, 9], "common", "harmless", ["Furs"]),
  fauna(t("Frog"), "🐸", [12, 6], "common", "harmless"),
  flora(t("Reed"), "🌾", [12], "common", ["fiber"]),
  flora(t("Bald cypress"), "🌲", [12], "uncommon", ["wood"], ["Wood"]),
  flora(t("Peat moss"), "🌱", [12], "common", ["medicine"])
];
