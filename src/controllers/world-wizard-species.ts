// The wizard's list of declared species: named animals and plants and the biomes they live in

import { DANGERS, RARITIES, SPECIES_KINDS, type SpeciesKind } from "@/data/species";
import { Additions } from "@/model/authoring/additions";
import type { Seeds, SpeciesSeed } from "@/model/authoring/world-spec";
import { Biomes } from "@/model/physical/biomes-generator";
import { tip } from "@/ui/tooltips";
import { t } from "@/utils/i18n";
import { escapeHtml } from "@/utils/string-utils";

const KIND_LABELS: Record<string, string> = { fauna: t("Fauna"), flora: t("Flora") };
const RARITY_LABELS: Record<string, string> = {
  common: t("Common"),
  uncommon: t("Uncommon"),
  rare: t("Rare"),
  legendary: t("Legendary")
};
const DANGER_LABELS: Record<string, string> = {
  harmless: t("Harmless"),
  wary: t("Wary"),
  dangerous: t("Dangerous"),
  deadly: t("Deadly")
};

// before generation the catalogue is the default one; on a map, the map's own biomes
const biomeChoices = (hasMap: boolean) =>
  (hasMap ? pack.biomes : Biomes.getDefault()).filter(biome => biome && !biome.removed && biome.name);

export function renderSpeciesSeeds(seeds: Seeds, hasMap: boolean): string {
  const rows = seeds.species.map((seed, index) => renderRow(seed, index, hasMap)).join("");
  return /* html */ `<div class="speciesSeeds">
    <p><b>${t("Declared species")}</b> <button data-species-action="add">+ ${t("Add a species")}</button><br />
      <span class="hint">${t("The map starts with the usual fauna and flora of its biomes. Add your own creatures and plants here; a name the catalogue already has replaces that species.")}</span>
    </p>
    ${rows}
  </div>`;
}

function renderRow(seed: SpeciesSeed, index: number, hasMap: boolean): string {
  const options = (values: readonly string[], labels: Record<string, string>, current?: string) =>
    values.map(v => `<option value="${v}" ${v === current ? "selected" : ""}>${labels[v]}</option>`).join("");
  const biomes = biomeChoices(hasMap)
    .map(
      ({ i, name }) =>
        `<label><input class="native" type="checkbox" data-biome="${i}" ${seed.biomes.includes(i) ? "checked" : ""} /> ${escapeHtml(name)}</label>`
    )
    .join("");
  const danger =
    seed.kind === "fauna"
      ? `<select data-prop="danger">${options(DANGERS, DANGER_LABELS, seed.danger ?? "harmless")}</select>`
      : "";
  const addNow = hasMap
    ? `<button data-species-action="addNow" data-tip="${t("Put it in the catalogue of the map on screen now")}">${t("Add to current map")}</button>`
    : "";

  return /* html */ `<div class="speciesSeed" data-index="${index}">
    <div class="seedFields">
      <input data-prop="name" placeholder="${t("Name")}" value="${escapeHtml(seed.name)}" />
      <select data-prop="kind">${options(SPECIES_KINDS, KIND_LABELS, seed.kind)}</select>
      <select data-prop="rarity">${options(RARITIES, RARITY_LABELS, seed.rarity ?? "common")}</select>
      ${danger}
      <span class="seedButtons">${addNow}<button data-species-action="remove">${t("Remove")}</button></span>
    </div>
    <div class="checks">${biomes}</div>
  </div>`;
}

export function bindSpeciesSeeds(root: HTMLElement, seeds: Seeds, rerender: () => void): void {
  root.querySelector('[data-species-action="add"]')?.addEventListener("click", () => {
    seeds.species.push({ name: "", kind: "fauna", biomes: [] });
    rerender();
  });

  root.querySelectorAll<HTMLElement>(".speciesSeed").forEach(row => {
    const index = Number(row.dataset.index);
    const seed = seeds.species[index];

    row.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-prop]").forEach(input => {
      input.addEventListener("input", () => {
        const value = input.value;
        if (input.dataset.prop === "name") seed.name = value.trim();
        else if (input.dataset.prop === "rarity") seed.rarity = value as SpeciesSeed["rarity"];
        else if (input.dataset.prop === "danger") seed.danger = value as SpeciesSeed["danger"];
        else if (input.dataset.prop === "kind") {
          seed.kind = value as SpeciesKind;
          if (seed.kind === "flora") delete seed.danger;
          rerender();
        }
      });
    });
    row.querySelectorAll<HTMLInputElement>("[data-biome]").forEach(box => {
      box.addEventListener("change", () => {
        seed.biomes = Array.from(row.querySelectorAll<HTMLInputElement>("[data-biome]:checked"), b =>
          Number(b.dataset.biome)
        );
      });
    });
    row.querySelector('[data-species-action="remove"]')?.addEventListener("click", () => {
      seeds.species.splice(index, 1);
      rerender();
    });
    row.querySelector('[data-species-action="addNow"]')?.addEventListener("click", () => {
      if (!seed.name) return void tip(t("Name it first"), false, "error");
      try {
        Additions.addSpecies(structuredClone(seed));
        tip(t("{{name}} was added to the map", { name: seed.name }), true, "success");
      } catch (error) {
        tip((error as Error).message, false, "error");
      }
    });
  });
}
