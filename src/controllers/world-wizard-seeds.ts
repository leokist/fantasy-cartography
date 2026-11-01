// The wizard's lists of declared cultures and states: each placed on a sketch of the map, to found on
// generation or to add to the map on screen at once

import { Controllers } from "@/controllers";
import { Additions } from "@/model/authoring/additions";
import type { CultureSeed, Seeds, StateSeed } from "@/model/authoring/world-spec";
import { Names } from "@/model/society/names-generator";
import { Layers } from "@/renderers/layers";
import { tip } from "@/ui/tooltips";
import { t } from "@/utils/i18n";
import { escapeHtml } from "@/utils/string-utils";

type Kind = "cultures" | "states";
type Seed = CultureSeed | StateSeed;

const FORMS: [string, string][] = [
  ["Kingdom", t("Kingdom")],
  ["Empire", t("Empire")],
  ["Duchy", t("Duchy")],
  ["Principality", t("Principality")],
  ["Republic", t("Republic")],
  ["Free City", t("Free City")],
  ["Theocracy", t("Theocracy")],
  ["Horde", t("Horde")]
];

export function renderSeeds(kind: Kind, seeds: Seeds, hasMap: boolean): string {
  const list = seeds[kind] as Seed[];
  const title = kind === "states" ? t("Declared states") : t("Declared cultures");
  const hint =
    kind === "states"
      ? t(
          "Name a state and click the sketch where its capital should be. The generator founds it there and rolls the rest."
        )
      : t("Name a culture and click the sketch where it begins. It spreads from there over the land.");
  const add = kind === "states" ? t("Add a state") : t("Add a culture");
  const rows = list.map((seed, index) => renderSeed(kind, seed, index, seeds, hasMap)).join("");
  const forms = FORMS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");

  return /* html */ `<div class="seedList" data-kind="${kind}">
    <p><b>${title}</b> <button data-seed-action="add">+ ${add}</button><br /><span class="hint">${hint}</span></p>
    ${rows}
    ${kind === "states" ? `<datalist id="wizardForms">${forms}</datalist>` : ""}
  </div>`;
}

function renderSeed(kind: Kind, seed: Seed, index: number, seeds: Seeds, hasMap: boolean): string {
  const { width, height } = options.generation.graph;
  const value = (text?: string) => escapeHtml(text ?? "");
  const color = seed.color ?? "#808080";
  const extra = kind === "states" ? stateFields(seed as StateSeed, seeds) : cultureFields(seed as CultureSeed);
  const addNow = hasMap
    ? `<button data-seed-action="addNow" data-tip="${t("Found it on the map on screen now, without regenerating; locked entities stay as they are")}">${t("Add to current map")}</button>`
    : "";

  return /* html */ `<div class="seed" data-index="${index}">
    <div class="spot" style="aspect-ratio: ${width} / ${height}" data-tip="${t("Click where it should be")}">
      <span class="dot" style="left: ${seed.x}%; top: ${seed.y}%"></span>
    </div>
    <div class="seedFields">
      <input data-prop="name" placeholder="${t("Name")}" value="${value(seed.name)}" />
      ${extra}
      <label class="seedColor">${t("Color")} <input data-prop="color" type="color" value="${color}" ${seed.color ? "" : 'class="unset"'} /></label>
      <span class="seedButtons">${addNow}<button data-seed-action="remove">${t("Remove")}</button></span>
    </div>
  </div>`;
}

function stateFields(seed: StateSeed, seeds: Seeds): string {
  const value = (text?: string) => escapeHtml(text ?? "");
  const cultures = seeds.cultures
    .map((culture, i) => {
      const selected = seed.culture === i ? "selected" : "";
      return `<option value="${i}" ${selected}>${escapeHtml(culture.name || `${t("Culture")} ${i + 1}`)}</option>`;
    })
    .join("");
  return /* html */ `
    <input data-prop="capital" placeholder="${t("Capital (optional)")}" value="${value(seed.capital)}" />
    <input data-prop="form" list="wizardForms" placeholder="${t("Form: Kingdom, Republic…")}" value="${value(seed.form)}" />
    <select data-prop="culture"><option value="">${t("Culture of the place")}</option>${cultures}</select>
    <span><button data-seed-action="emblem">${t("Emblem…")}</button> ${seed.emblem ? `✓ <button data-seed-action="clearEmblem" data-tip="${t("Use a generated emblem")}">×</button>` : ""}</span>`;
}

function cultureFields(seed: CultureSeed): string {
  const bases = Names.nameBases
    .map(({ name }, i) => `<option value="${i}" ${seed.base === i ? "selected" : ""}>${escapeHtml(name)}</option>`)
    .join("");
  return `<select data-prop="base"><option value="">${t("Language: automatic")}</option>${bases}</select>`;
}

/** Wire one list; `rerender` redraws the wizard after a change of structure, field edits update the seed in place */
export function bindSeeds(root: HTMLElement, seeds: Seeds, rerender: () => void): void {
  root.querySelectorAll<HTMLElement>(".seedList").forEach(listEl => {
    const kind = listEl.dataset.kind as Kind;
    const list = seeds[kind] as Seed[];

    listEl.querySelector('[data-seed-action="add"]')?.addEventListener("click", () => {
      list.push({ name: "", x: 50, y: 50 });
      rerender();
    });

    listEl.querySelectorAll<HTMLElement>(".seed").forEach(row => {
      const index = Number(row.dataset.index);
      const seed = list[index] as Seed & Partial<StateSeed> & Partial<CultureSeed>;

      row.querySelector<HTMLElement>(".spot")?.addEventListener("click", event => {
        const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
        seed.x = Math.round(((event.clientX - box.left) / box.width) * 1000) / 10;
        seed.y = Math.round(((event.clientY - box.top) / box.height) * 1000) / 10;
        const dot = row.querySelector<HTMLElement>(".dot");
        if (dot) dot.style.cssText = `left: ${seed.x}%; top: ${seed.y}%`;
      });

      row.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-prop]").forEach(input => {
        input.addEventListener("input", () => setProp(seed, input.dataset.prop ?? "", input.value));
      });

      row.querySelectorAll<HTMLButtonElement>("[data-seed-action]").forEach(button => {
        button.addEventListener("click", () => {
          const action = button.dataset.seedAction;
          if (action === "remove") removeSeed(seeds, kind, index);
          else if (action === "clearEmblem") delete seed.emblem;
          else if (action === "addNow") return addNow(kind, seed);
          else if (action === "emblem") return pickEmblem(seed, rerender);
          rerender();
        });
      });
    });
  });
}

function setProp(seed: Seed & Partial<StateSeed> & Partial<CultureSeed>, prop: string, raw: string): void {
  const text = raw.trim();
  if (prop === "name") seed.name = text;
  else if (prop === "color") seed.color = raw;
  else if (prop === "capital" || prop === "form") {
    if (text) seed[prop] = text;
    else delete seed[prop];
  } else if (prop === "culture" || prop === "base") {
    if (text === "") delete seed[prop];
    else seed[prop] = Number(text);
  }
}

// a state names its culture by index, so removing a culture shifts the states that come after it
function removeSeed(seeds: Seeds, kind: Kind, index: number): void {
  seeds[kind].splice(index, 1);
  if (kind !== "cultures") return;
  for (const state of seeds.states) {
    if (state.culture === undefined) continue;
    if (state.culture === index) delete state.culture;
    else if (state.culture > index) state.culture--;
  }
}

function pickEmblem(seed: Partial<StateSeed>, rerender: () => void): void {
  void Controllers.IconPicker.open({
    current: seed.emblem ?? "",
    preferCustom: true,
    profile: "emblem",
    onPick: (icon: string) => {
      if (icon) seed.emblem = icon;
      rerender();
    }
  });
}

function addNow(kind: Kind, seed: Seed): void {
  if (!seed.name) return void tip(t("Name it first"), false, "error");
  try {
    const declared = structuredClone(seed);
    if (kind === "states") {
      const state = declared as StateSeed;
      delete state.culture; // a culture seed exists only on the next generated map
      Additions.addState(state);
      Layers.draw("states", "borders", "provinces", "burgIcons", "labels", "emblems");
    } else {
      Additions.addCulture(declared as CultureSeed);
      Layers.draw("cultures");
    }
    tip(t("{{name}} was added to the map", { name: seed.name }), true, "success");
  } catch (error) {
    tip((error as Error).message, false, "error");
  }
}
