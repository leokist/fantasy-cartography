// Fauna and flora editor: the species catalogue, filtered by kind and biome, edited in place

import { DANGERS, RARITIES, type SpeciesKind, USES } from "@/data/species";
import { type Species, SpeciesCatalogue } from "@/model/nature/species-generator";
import { getFileName } from "@/services/io/file-name";
import { Dialog } from "@/ui/dialog/dialog";
import { tip } from "@/ui/tooltips";
import { downloadFile } from "@/utils/file-utils";
import { t } from "@/utils/i18n";
import { ensureEl } from "@/utils/node-utils";
import { escapeHtml } from "@/utils/string-utils";

const DIALOG_ID = "speciesEditor";

const KIND_LABELS: Record<SpeciesKind, string> = { fauna: t("Fauna"), flora: t("Flora") };
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
const USE_LABELS: Record<string, string> = {
  food: t("Food"),
  wood: t("Wood"),
  medicine: t("Medicine"),
  poison: t("Poison"),
  fiber: t("Fiber"),
  dye: t("Dye"),
  ornamental: t("Ornamental"),
  magic: t("Magic")
};

let kindFilter: SpeciesKind | "" = "";
let biomeFilter = -1;
let search = "";
let expanded = -1;

function open(): void {
  if (!pack.species) return void tip(t("Generate a map first"), false, "error");
  Dialog.destroy(DIALOG_ID);
  ensureEl("dialogs").insertAdjacentHTML("beforeend", `<div id="${DIALOG_ID}" class="dialog"></div>`);
  render();
  Dialog.open(DIALOG_ID, {
    title: t("Fauna and Flora"),
    width: "46em",
    maxHeight: 640,
    position: { my: "center", at: "center", of: "svg" },
    buttons: [
      { label: t("Download JSON"), onClick: download },
      { label: t("Close"), onClick: () => Dialog.close(DIALOG_ID) }
    ]
  });
}

const livingBiomes = () => pack.biomes.filter(biome => biome && !biome.removed && biome.name);

function render(): void {
  const dialog = ensureEl(DIALOG_ID);
  const list = pack.species.filter(
    species =>
      (!kindFilter || species.kind === kindFilter) &&
      (biomeFilter < 0 || species.biomes.includes(biomeFilter)) &&
      (!search || species.name.toLowerCase().includes(search.toLowerCase()))
  );
  const biomeOptions = livingBiomes()
    .map(({ i, name }) => `<option value="${i}" ${i === biomeFilter ? "selected" : ""}>${escapeHtml(name)}</option>`)
    .join("");

  dialog.innerHTML = /* html */ `
    <style>
      #${DIALOG_ID} { white-space: normal; overflow-x: hidden }
      #${DIALOG_ID} .speciesBar { display: flex; flex-wrap: wrap; gap: 0.3em; align-items: center; margin-bottom: 0.5em; width: 100% }
      #${DIALOG_ID} .speciesRow { display: grid; grid-template-columns: 2.6em minmax(0, 1fr) 6em 7em 8em auto; gap: 0.3em; align-items: center; width: 100%; box-sizing: border-box; padding: 0.15em 0; border-bottom: 1px solid #8883 }
      #${DIALOG_ID} .speciesRow > input, #${DIALOG_ID} .speciesRow > select { width: 100%; box-sizing: border-box; min-width: 0 }
      #${DIALOG_ID} .speciesRow .icon { text-align: center }
      #${DIALOG_ID} .speciesDetails { grid-column: 1 / -1; padding: 0.4em 0 0.6em 2.9em }
      #${DIALOG_ID} .checks { display: flex; flex-wrap: wrap; gap: 0.2em 0.8em; margin: 0.2em 0 0.5em; font-size: 0.9em }
      #${DIALOG_ID} .speciesDetails textarea { width: 100%; box-sizing: border-box }
      #${DIALOG_ID} .rowButtons { white-space: nowrap }
    </style>
    <div class="speciesBar">
      <select data-filter="kind">
        <option value="">${t("All species")}</option>
        <option value="fauna" ${kindFilter === "fauna" ? "selected" : ""}>${KIND_LABELS.fauna}</option>
        <option value="flora" ${kindFilter === "flora" ? "selected" : ""}>${KIND_LABELS.flora}</option>
      </select>
      <select data-filter="biome"><option value="-1">${t("All biomes")}</option>${biomeOptions}</select>
      <input data-filter="search" placeholder="${t("Search")}" value="${escapeHtml(search)}" style="flex: 1 1 8em" />
      <button data-add="fauna">+ ${KIND_LABELS.fauna}</button>
      <button data-add="flora">+ ${KIND_LABELS.flora}</button>
      <span class="hint">${t("{{shown}} of {{total}} species", { shown: list.length, total: pack.species.length })}</span>
    </div>
    ${list.map(renderRow).join("") || `<p>${t("No species match the filters")}</p>`}`;

  bind(dialog);
}

function renderRow(species: Species): string {
  const { i, name, kind, icon, rarity, biomes } = species;
  const select = (prop: string, values: readonly string[], labels: Record<string, string>, current?: string) =>
    `<select data-prop="${prop}">${values.map(v => `<option value="${v}" ${v === current ? "selected" : ""}>${labels[v]}</option>`).join("")}</select>`;
  const trait =
    kind === "fauna"
      ? select("danger", DANGERS, DANGER_LABELS, species.danger)
      : `<span class="hint">${(species.uses ?? []).map(use => USE_LABELS[use]).join(", ") || "—"}</span>`;
  const biomeNames = biomes.map(id => pack.biomes[id]?.name).filter(Boolean);

  return /* html */ `<div class="speciesRow" data-id="${i}">
    <input class="icon" data-prop="icon" value="${escapeHtml(icon)}" data-tip="${t("An emoji for the species")}" />
    <input data-prop="name" value="${escapeHtml(name)}" />
    ${select("kind", ["fauna", "flora"], KIND_LABELS, kind)}
    ${select("rarity", RARITIES, RARITY_LABELS, rarity)}
    ${trait}
    <span class="rowButtons">
      <button data-row="details" data-tip="${escapeHtml(biomeNames.join(", "))}">${t("{{count}} biomes", { count: biomes.length })}</button>
      <button data-row="lock" data-tip="${t("Lock to keep it when the catalogue is regenerated")}">${species.lock ? "🔒" : "🔓"}</button>
      <button data-row="remove" data-tip="${t("Remove")}">✖</button>
    </span>
    ${expanded === i ? renderDetails(species) : ""}
  </div>`;
}

function renderDetails(species: Species): string {
  const check = (group: string, value: string | number, label: string, on: boolean) =>
    `<label><input class="native" type="checkbox" data-check="${group}" value="${value}" ${on ? "checked" : ""} /> ${escapeHtml(label)}</label>`;
  const biomes = livingBiomes().map(({ i, name }) => check("biomes", i, name, species.biomes.includes(i)));
  const goods = (pack.goods ?? []).map(({ i, name }) => check("goods", i, name, species.goods.includes(i)));
  const kindTraits =
    species.kind === "fauna"
      ? check("domesticable", 1, t("Domesticable"), Boolean(species.domesticable))
      : USES.map(use => check("uses", use, USE_LABELS[use], Boolean(species.uses?.includes(use)))).join("");

  return /* html */ `<div class="speciesDetails">
    <b>${t("Lives in")}</b><div class="checks">${biomes.join("")}</div>
    <div class="checks">${kindTraits}</div>
    <b>${t("Yields goods")}</b><div class="checks">${goods.join("")}</div>
    <textarea data-prop="description" rows="2" placeholder="${t("Description")}">${escapeHtml(species.description ?? "")}</textarea>
  </div>`;
}

function bind(dialog: HTMLElement): void {
  dialog.querySelector<HTMLSelectElement>('[data-filter="kind"]')?.addEventListener("change", event => {
    kindFilter = (event.target as HTMLSelectElement).value as SpeciesKind | "";
    render();
  });
  dialog.querySelector<HTMLSelectElement>('[data-filter="biome"]')?.addEventListener("change", event => {
    biomeFilter = Number((event.target as HTMLSelectElement).value);
    render();
  });
  dialog.querySelector<HTMLInputElement>('[data-filter="search"]')?.addEventListener("change", event => {
    search = (event.target as HTMLInputElement).value.trim();
    render();
  });
  dialog.querySelectorAll<HTMLButtonElement>("[data-add]").forEach(button => {
    button.addEventListener("click", () => {
      const kind = button.dataset.add as SpeciesKind;
      const id = edit(() => SpeciesCatalogue.add(kind, kind === "fauna" ? t("New animal") : t("New plant")));
      if (id === undefined) return;
      if (biomeFilter >= 0) edit(() => SpeciesCatalogue.setBiomes(id, [biomeFilter]));
      [expanded, search, kindFilter] = [id, "", ""];
      render();
    });
  });

  dialog.querySelectorAll<HTMLElement>(".speciesRow").forEach(row => {
    const id = Number(row.dataset.id);
    row.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-prop]").forEach(input => {
      input.addEventListener("change", () => setProp(id, input.dataset.prop ?? "", input.value));
    });
    row.querySelectorAll<HTMLInputElement>("[data-check]").forEach(box => {
      box.addEventListener("change", () => setChecks(row, id, box.dataset.check ?? ""));
    });
    row.querySelectorAll<HTMLButtonElement>("[data-row]").forEach(button => {
      button.addEventListener("click", () => {
        const action = button.dataset.row;
        if (action === "details") expanded = expanded === id ? -1 : id;
        else if (action === "lock") {
          const species = pack.species.find(item => item.i === id);
          edit(() => SpeciesCatalogue.setLocked(id, !species?.lock));
        } else if (action === "remove") edit(() => SpeciesCatalogue.remove(id));
        render();
      });
    });
  });
}

// an edit that breaks a rule shows why and changes nothing
function edit<T>(change: () => T): T | undefined {
  try {
    return change();
  } catch (error) {
    tip((error as Error).message, false, "error");
    return undefined;
  }
}

function setProp(id: number, prop: string, value: string): void {
  if (prop === "name") edit(() => SpeciesCatalogue.rename(id, value));
  else if (prop === "icon") edit(() => SpeciesCatalogue.setIcon(id, value));
  else if (prop === "rarity") edit(() => SpeciesCatalogue.setRarity(id, value));
  else if (prop === "danger") edit(() => SpeciesCatalogue.setDanger(id, value));
  else if (prop === "description") edit(() => SpeciesCatalogue.setDescription(id, value));
  else if (prop === "kind") {
    edit(() => SpeciesCatalogue.setKind(id, value));
    render();
  }
}

function setChecks(row: HTMLElement, id: number, group: string): void {
  const checked = Array.from(
    row.querySelectorAll<HTMLInputElement>(`[data-check="${group}"]:checked`),
    box => box.value
  );
  if (group === "biomes") edit(() => SpeciesCatalogue.setBiomes(id, checked.map(Number)));
  else if (group === "goods") edit(() => SpeciesCatalogue.setGoods(id, checked.map(Number)));
  else if (group === "uses") edit(() => SpeciesCatalogue.setUses(id, checked));
  else if (group === "domesticable") edit(() => SpeciesCatalogue.setDomesticable(id, checked.length > 0));
  if (group === "uses") {
    render(); // the row shows the uses
    return;
  }
  const button = row.querySelector<HTMLButtonElement>('[data-row="details"]');
  const species = pack.species.find(item => item.i === id);
  if (button && species) button.textContent = t("{{count}} biomes", { count: species.biomes.length });
}

/** The catalogue with biome and good names, for game engines and spreadsheets */
function download(): void {
  const named = pack.species.map(species => ({
    ...species,
    biomeNames: species.biomes.map(id => pack.biomes[id]?.name),
    goodNames: species.goods.map(id => pack.goods?.find(good => good.i === id)?.name)
  }));
  downloadFile(JSON.stringify(named, null, 2), `${getFileName("Species")}.json`, "application/json");
}

export const SpeciesEditor = { open };
