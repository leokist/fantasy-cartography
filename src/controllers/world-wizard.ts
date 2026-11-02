// The world wizard: the map, its continents and countries, the provinces of each country and its peoples, set by
// hand or rolled, then generated once

import { newWorld } from "@/app/lifecycle";
import { Controllers } from "@/controllers";
import { bindPlaces, renderCountriesStep, renderRegionsStep, resetPlaces } from "@/controllers/world-wizard-places";
import { bindSeeds, renderSeeds } from "@/controllers/world-wizard-seeds";
import { bindSpeciesSeeds, renderSpeciesSeeds } from "@/controllers/world-wizard-species";
import { buildsLand, WorldSeeds } from "@/model/authoring/seeds";
import {
  type FieldInput,
  initialField,
  parseFieldValue,
  pinsOf,
  SPEC_FIELDS,
  type SpecFieldDef,
  WIZARD_STEPS,
  type WizardStep
} from "@/model/authoring/spec-fields";
import { cleanSeeds, type FieldMode, getDefaultSeeds, type Seeds, type SpecField } from "@/model/authoring/world-spec";
import { mapHistory } from "@/model/map-history";
import { Pins } from "@/model/options/pins";
import { Dialog } from "@/ui/dialog/dialog";
import { tip } from "@/ui/tooltips";
import { t } from "@/utils/i18n";
import { ensureEl } from "@/utils/node-utils";
import { escapeHtml } from "@/utils/string-utils";

const DIALOG_ID = "worldWizard";
const REVIEW = WIZARD_STEPS.length; // the last page, after the steps

const STEP_TEXT: Record<WizardStep, { title: string; intro: string }> = {
  map: { title: t("Map"), intro: t("Name the map, set its era and decide how large and detailed it is.") },
  countries: {
    title: t("Continents and countries"),
    intro: t("Place the continents and the countries on them, with capitals, cities, emblems and borders.")
  },
  regions: {
    title: t("Regions"),
    intro: t("Divide each country into provinces and say what each is like: relief, climate, water and nature.")
  },
  peoples: {
    title: t("Peoples and nature"),
    intro: t("Cultures, religions and population, the cultures you want for sure, and your own fauna and flora.")
  }
};

const AFTER: Partial<
  Record<WizardStep, { text: string; editor: "SpeciesEditor" | "HeightmapSelection" | "LoreEditor" }>
> = {
  map: { text: t("Write the lore"), editor: "LoreEditor" },
  peoples: { text: t("Edit fauna and flora"), editor: "SpeciesEditor" }
};

let fields: Record<string, SpecField> = {};
let seed: SpecField = { mode: "random", value: "" };
let seeds: Seeds = getDefaultSeeds();
let autoLock = true;
let page = 0;
let onCancel: (() => void) | undefined;
let generating = false;

/** `onCancel` runs when the wizard closes without generating: the start menu waits behind it on start-up */
function open(settings: { onCancel?: () => void } = {}): void {
  if (options.app.mode) return void tip(t("Exit the edit mode first"), false, "error");
  onCancel = settings.onCancel;
  generating = false;
  resetPlaces();
  const { authoring } = options.map;
  fields = Object.fromEntries(SPEC_FIELDS.map(def => [def.key, initialField(def, authoring)]));
  seed = authoring.fields.seed ?? { mode: "random", value: options.map.seed };
  autoLock = authoring.autoLock;
  seeds = structuredClone(authoring.seeds);
  page = 0;

  Dialog.destroy(DIALOG_ID);
  ensureEl("dialogs").insertAdjacentHTML("beforeend", `<div id="${DIALOG_ID}" class="dialog"></div>`);
  render();
  Dialog.open(DIALOG_ID, {
    title: t("World Wizard"),
    width: "48em",
    maxHeight: 640,
    position: { my: "center", at: "center", of: "svg" },
    onClose: () => {
      if (!generating) onCancel?.();
    }
  });
}

function render(): void {
  const dialog = ensureEl(DIALOG_ID);
  const isReview = page === REVIEW;
  const steps = [...WIZARD_STEPS.map(step => STEP_TEXT[step].title), t("Review")];
  const tabs = steps
    .map((name, i) => `<button data-page="${i}" class="${i === page ? "active" : ""}">${i + 1}. ${name}</button>`)
    .join("");

  dialog.innerHTML = /* html */ `
    <style>
      #${DIALOG_ID} .wizardTabs { display: flex; flex-wrap: wrap; gap: 0.2em; margin-bottom: 0.6em; width: 100% }
      #${DIALOG_ID} .wizardTabs button { font-size: 0.85em; padding: 0.2em 0.5em }
      #${DIALOG_ID} .wizardTabs button.active { font-weight: bold; outline: 1px solid currentColor }
      #${DIALOG_ID} { overflow-x: hidden; white-space: normal }
      #${DIALOG_ID} .wizardRow { display: grid; grid-template-columns: 7.5em minmax(0, 1fr) 12em; gap: 0.5em; width: 100%; box-sizing: border-box; align-items: center; margin: 0.35em 0 }
      #${DIALOG_ID} .wizardRow > * { min-width: 0 }
      #${DIALOG_ID} .wizardRow .hint { font-size: 0.85em; opacity: 0.7 }
      #${DIALOG_ID} .wizardRow.random input, #${DIALOG_ID} .wizardRow.random select { opacity: 0.55 }
      #${DIALOG_ID} .wizardRow input, #${DIALOG_ID} .wizardRow select { width: 100%; box-sizing: border-box }
      #${DIALOG_ID} .seedList, #${DIALOG_ID} .seedList > p { width: 100%; box-sizing: border-box }
      #${DIALOG_ID} .seed { display: grid; grid-template-columns: 9em minmax(0, 1fr); gap: 0.6em; width: 100%; box-sizing: border-box; margin: 0.6em 0; padding-top: 0.6em; border-top: 1px solid #8884 }
      #${DIALOG_ID} .spot { position: relative; cursor: crosshair; border: 1px solid #8888; background: linear-gradient(#8882 1px, transparent 1px) 0 0 / 100% 33.3%, linear-gradient(90deg, #8882 1px, transparent 1px) 0 0 / 33.3% 100%, #9bb5c033 }
      #${DIALOG_ID} .dot { position: absolute; width: 0.7em; height: 0.7em; margin: -0.35em 0 0 -0.35em; border-radius: 50%; background: #c0392b; border: 1px solid #fff; pointer-events: none }
      #${DIALOG_ID} .seedFields { display: flex; flex-wrap: wrap; gap: 0.3em; align-items: center; min-width: 0 }
      #${DIALOG_ID} .seedFields > input, #${DIALOG_ID} .seedFields > select { flex: 1 1 12em; width: 12em; min-width: 0; box-sizing: border-box }
      #${DIALOG_ID} .seedColor input.unset { opacity: 0.4 }
      #${DIALOG_ID} .speciesSeeds, #${DIALOG_ID} .speciesSeed { width: 100%; box-sizing: border-box }
      #${DIALOG_ID} .speciesSeed { margin: 0.6em 0; padding-top: 0.6em; border-top: 1px solid #8884 }
      #${DIALOG_ID} .checks { display: flex; flex-wrap: wrap; gap: 0.2em 0.8em; margin-top: 0.3em; font-size: 0.9em }
      #${DIALOG_ID} .seedButtons { margin-left: auto }
      #${DIALOG_ID} .wizardNav { display: flex; gap: 0.4em; justify-content: space-between; margin-top: 0.8em; width: 100% }
      #${DIALOG_ID} h3 { margin: 0.9em 0 0.2em; font-size: 1.05em }
      #${DIALOG_ID} .hint { font-size: 0.85em; opacity: 0.75 }
      #${DIALOG_ID} .sketch { position: relative; margin: 0 auto; box-sizing: border-box; overflow: hidden; border: 1px solid #8888; background: #9bb5c0; cursor: default }
      #${DIALOG_ID} .sketch.active { cursor: crosshair; outline: 2px solid #c0392b }
      #${DIALOG_ID} .sketchMap { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.85 }
      #${DIALOG_ID} .reach { position: absolute; transform: translate(-50%, -50%); border-radius: 50%; border: 1.5px dashed #5c4a2a; background: #e8dcb455; pointer-events: none; display: flex; align-items: center; justify-content: center; font-size: 0.8em; color: #3b2f1a }
      #${DIALOG_ID} .reach:not(.continent) { background: none; border-style: solid; border-width: 1px }
      #${DIALOG_ID} .mark { position: absolute; width: 0.8em; height: 0.8em; margin: -0.4em 0 0 -0.4em; border-radius: 50%; border: 1px solid #fff; pointer-events: none }
      #${DIALOG_ID} .mark span { position: absolute; left: 1em; top: -0.35em; white-space: nowrap; font-size: 0.8em; text-shadow: 0 0 2px #fff, 0 0 2px #fff }
      #${DIALOG_ID} .mark.city { width: 0.5em; height: 0.5em; margin: -0.25em 0 0 -0.25em; border-radius: 0; background: #333 }
      #${DIALOG_ID} .mark.province { border-radius: 0; transform: rotate(45deg); background: #6c3483 }
      #${DIALOG_ID} .mark.province span { transform: rotate(-45deg) }
      #${DIALOG_ID} .placing { background: #c0392b; color: #fff; padding: 0.3em 0.5em; margin-bottom: 0.3em }
      #${DIALOG_ID} .placeRow { display: flex; flex-wrap: wrap; gap: 0.3em; align-items: center; margin: 0.3em 0 }
      #${DIALOG_ID} .placeRow > input, #${DIALOG_ID} .placeRow > select { flex: 1 1 9em; min-width: 0; box-sizing: border-box }
      #${DIALOG_ID} .placeRow.end { justify-content: flex-end }
      #${DIALOG_ID} .attrs { display: grid; grid-template-columns: repeat(auto-fit, minmax(9em, 1fr)); gap: 0.3em 0.6em; margin: 0.3em 0 }
      #${DIALOG_ID} .attrs label { display: flex; flex-direction: column; gap: 0.1em; min-width: 0; font-size: 0.9em }
      #${DIALOG_ID} .attrs select { width: 100%; min-width: 0; box-sizing: border-box }
      #${DIALOG_ID} .countryCard, #${DIALOG_ID} .provinceCard { box-sizing: border-box; max-width: 100%; min-width: 0 }
      #${DIALOG_ID} .countryCard, #${DIALOG_ID} .provinceCard { border-left: 4px solid #6c3483; padding: 0.3em 0 0.3em 0.6em; margin: 0.6em 0; background: #8881 }
      #${DIALOG_ID} .cities { margin: 0.3em 0 }
      #${DIALOG_ID} .regionTabs { display: flex; flex-wrap: wrap; gap: 0.3em; margin-bottom: 0.5em }
      #${DIALOG_ID} .regionTabs button { border-bottom: 3px solid }
      #${DIALOG_ID} .regionTabs button.active { font-weight: bold }
      #${DIALOG_ID} button.unplaced { outline: 1px dashed #c0392b }
      #${DIALOG_ID} details { margin-top: 0.8em }
      #${DIALOG_ID} .seedColor input[type=color] { width: 2.4em; height: 1.6em; padding: 0; vertical-align: middle }
    </style>
    <div class="wizardTabs">${tabs}</div>
    ${isReview ? renderReview() : renderStep(WIZARD_STEPS[page])}
    <div class="wizardNav">
      <button data-action="rollAll" data-tip="${t("Set every field of every step to random")}">${t("All random")}</button>
      <span>
        <button data-action="back" ${page === 0 ? "disabled" : ""}>${t("Back")}</button>
        ${isReview ? `<button data-action="generate"><b>${t("Generate world")}</b></button>` : `<button data-action="next">${t("Next")}</button>`}
      </span>
    </div>`;

  dialog.querySelectorAll<HTMLButtonElement>("[data-page]").forEach(button => {
    button.addEventListener("click", () => go(Number(button.dataset.page)));
  });
  dialog.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(button => {
    button.addEventListener("click", () => act(button.dataset.action ?? ""));
  });
  dialog.querySelectorAll<HTMLSelectElement>("select.mode").forEach(select => {
    select.addEventListener("change", () => setMode(select.dataset.key ?? "", select.value as FieldMode));
  });
  dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement>(".value").forEach(input => {
    input.addEventListener("input", () => showMode(input.dataset.key ?? "", "set"));
    input.addEventListener("change", () => setValue(input.dataset.key ?? "", input.value));
  });
  bindSeeds(dialog, seeds, render);
  bindSpeciesSeeds(dialog, seeds, render);
  bindPlaces(dialog, seeds, render);
  dialog.querySelector<HTMLInputElement>("#wizardAutoLock")?.addEventListener("change", event => {
    autoLock = (event.target as HTMLInputElement).checked;
  });
}

function renderStep(step: WizardStep): string {
  const { intro } = STEP_TEXT[step];
  const rows = (advanced: boolean) =>
    SPEC_FIELDS.filter(def => def.step === step && Boolean(def.advanced) === advanced)
      .map(renderField)
      .join("");
  const more = rows(true);
  const after = AFTER[step];
  const afterButton = after
    ? `<p><button data-action="after" data-tip="${t("Generate first, then open this editor")}">${after.text}</button></p>`
    : "";
  const roll = SPEC_FIELDS.some(def => def.step === step)
    ? `<button data-action="rollStep">${t("Roll this step")}</button>`
    : "";
  return /* html */ `
    <p style="margin-top: 0">${intro} ${roll}</p>
    ${rows(false)}
    ${step === "countries" ? renderCountriesStep(seeds, hasMap()) : ""}
    ${step === "regions" ? renderRegionsStep(seeds, hasMap()) : ""}
    ${step === "peoples" ? renderSeeds("cultures", seeds, hasMap()) + renderSpeciesSeeds(seeds, hasMap()) : ""}
    ${more ? `<details><summary>${t("More settings")}</summary>${more}</details>` : ""}
    ${afterButton}`;
}

function renderField(def: SpecFieldDef): string {
  const { mode, value } = fields[def.key];
  return /* html */ `<div class="wizardRow ${mode}" data-tip="${def.hint}">
    ${modeSelect(def.key, mode)}
    <div>${def.label}<div class="hint">${def.hint}</div></div>
    ${valueInput(def.key, def.input, value)}
  </div>`;
}

function modeSelect(key: string, mode: FieldMode): string {
  return /* html */ `<select class="mode" data-key="${key}">
    <option value="set" ${mode === "set" ? "selected" : ""}>${t("Set")}</option>
    <option value="random" ${mode === "random" ? "selected" : ""}>${t("Random")}</option>
  </select>`;
}

function valueInput(key: string, input: FieldInput, value: unknown): string {
  const current = escapeHtml(String(value ?? ""));
  if (input.kind === "choice") {
    const choices = input.choices().map(([id, name]) => {
      const selected = id === String(value) ? "selected" : "";
      return `<option value="${escapeHtml(id)}" ${selected}>${escapeHtml(name)}</option>`;
    });
    return `<select class="value" data-key="${key}">${choices.join("")}</select>`;
  }
  if (input.kind === "number") {
    const { min, max, step } = input;
    return `<input class="value" data-key="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${current}" />`;
  }
  return `<input class="value" data-key="${key}" type="text" value="${current}" />`;
}

function renderReview(): string {
  const set = Object.values(fields).filter(field => field.mode === "set").length;
  const total = SPEC_FIELDS.length;
  const seedValue = escapeHtml(String(seed.value ?? ""));
  const { continents, cultures, states, provinces, species } = cleanSeeds(seeds);
  const declared =
    continents.length || cultures.length || states.length || provinces.length || species.length
      ? t(
          "Declared: {{continents}} continents, {{states}} countries, {{provinces}} provinces, {{cultures}} cultures and {{species}} species.",
          {
            continents: continents.length,
            states: states.length,
            provinces: provinces.length,
            cultures: cultures.length,
            species: species.length
          }
        )
      : t("Nothing declared: the generator makes the whole world at random.");
  return /* html */ `
    <p style="margin-top: 0">${t("{{set}} of {{total}} settings are set by you; the generator rolls the rest.", { set, total })}
      ${declared}</p>
    <div class="wizardRow ${seed.mode}">
      ${modeSelect("seed", seed.mode)}
      <div>${t("Map seed")}<div class="hint">${t("The same seed and settings rebuild the same world")}</div></div>
      <input class="value" data-key="seed" type="number" min="1" max="999999999" step="1" value="${seedValue}" />
    </div>
    <p>
      <input id="wizardAutoLock" class="checkbox" type="checkbox" ${autoLock ? "checked" : ""} />
      <label for="wizardAutoLock" class="checkbox-label">${t("Lock whatever I edit, so regeneration keeps it")}</label>
    </p>
    <p class="hint">${t("Generating replaces the current map. Save it first if you want to keep it.")}</p>`;
}

const hasMap = (): boolean => mapHistory.length > 0 && Boolean(pack.cells?.state);

function go(next: number): void {
  page = Math.max(0, Math.min(REVIEW, next));
  render();
}

function setMode(key: string, mode: FieldMode): void {
  if (key === "seed") seed = { ...seed, mode };
  else if (fields[key]) fields[key] = { ...fields[key], mode };
  showMode(key, mode);
}

// a typed value sets the field by hand; only its row changes, so a click that blurred the input still lands
function setValue(key: string, raw: string): void {
  if (key === "seed") {
    seed = { mode: "set", value: raw.trim() };
    showMode(key, "set");
    return;
  }
  const def = SPEC_FIELDS.find(field => field.key === key);
  if (!def) return;
  const value = parseFieldValue(def, raw);
  if (value === undefined) return void tip(t("This value is out of range"), false, "error");
  fields[key] = { mode: "set", value };
  showMode(key, "set");
}

function showMode(key: string, mode: FieldMode): void {
  const select = ensureEl(DIALOG_ID).querySelector<HTMLSelectElement>(`select.mode[data-key="${key}"]`);
  if (!select) return;
  select.value = mode;
  select.closest(".wizardRow")?.classList.toggle("random", mode === "random");
  select.closest(".wizardRow")?.classList.toggle("set", mode === "set");
}

function rollStep(step: WizardStep): void {
  for (const def of SPEC_FIELDS) if (def.step === step) fields[def.key] = { ...fields[def.key], mode: "random" };
  render();
}

function act(action: string): void {
  if (action === "back") go(page - 1);
  else if (action === "next") go(page + 1);
  else if (action === "rollStep") rollStep(WIZARD_STEPS[page]);
  else if (action === "after") confirmGenerate(AFTER[WIZARD_STEPS[page]]?.editor);
  else if (action === "generate") confirmGenerate();
  else if (action === "rollAll") {
    for (const key of Object.keys(fields)) fields[key] = { ...fields[key], mode: "random" };
    seed = { ...seed, mode: "random" };
    go(REVIEW);
  }
}

type AfterEditor = "SpeciesEditor" | "HeightmapSelection" | "LoreEditor";

function confirmGenerate(editor?: AfterEditor): void {
  const current = mapHistory.at(-1);
  const workingMinutes = current ? (Date.now() - current.registeredAt) / 60000 : 0;
  if (workingMinutes < 1) {
    generate(editor);
    return;
  }

  Dialog.confirm({
    title: t("Generate World"),
    message: `${t("Are you sure you want to generate a new map?")}<br>${t("All unsaved changes made to the current map will be lost")}`,
    confirm: t("Generate"),
    onConfirm: () => generate(editor)
  });
}

function generate(editor?: AfterEditor): void {
  if (options.app.mode) return void tip(t("Exit the edit mode first"), false, "error");
  const planted = cleanSeeds(seeds);
  const authoring = { autoLock, fields: structuredClone({ ...fields, seed }), seeds: planted };

  addEventListener(
    "map:generated",
    () => {
      options.map.authoring = authoring;
      if (editor) void Controllers[editor].open();
    },
    { once: true }
  );

  // every declared culture needs a slot to fill; declared countries are all the countries there are
  const pins = pinsOf(fields);
  if (planted.cultures.length) pins.cultures = Math.max(Number(fields.cultures?.value ?? 0), planted.cultures.length);
  if (planted.states.length) pins.statesNumber = planted.states.length;
  if (buildsLand(planted)) pins.template = "continents"; // only the first strokes; the land is the author's

  generating = true;
  Dialog.close(DIALOG_ID);
  WorldSeeds.planNext(planted);
  Pins.overrideNext(pins);
  void newWorld(seed.mode === "set" && seed.value ? { seed: String(seed.value) } : undefined);
}

export const WorldWizard = { open };
