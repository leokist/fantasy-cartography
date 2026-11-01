// The world wizard: the author sets or rolls each generation setting step by step, then generates once

import { regenerateMap } from "@/app/lifecycle";
import { Controllers } from "@/controllers";
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
import type { FieldMode, SpecField } from "@/model/authoring/world-spec";
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
  world: { title: t("World"), intro: t("Name the world, set its era and decide how large and detailed the map is.") },
  terrain: { title: t("Terrain"), intro: t("Choose the shape of the land. You can draw it by hand after generating.") },
  climate: { title: t("Climate and water"), intro: t("Temperature and rain decide rivers, lakes, ice and biomes.") },
  nature: { title: t("Nature"), intro: t("Biomes follow from the climate, so this step has nothing to set yet.") },
  peoples: { title: t("Peoples"), intro: t("How many cultures and religions the world holds, and how they spread.") },
  politics: { title: t("Politics"), intro: t("How many states, provinces and burgs the generator places.") },
  economy: { title: t("Economy and history"), intro: t("The scale of population. Routes, places and lore follow it.") }
};

const AFTER: Partial<
  Record<WizardStep, { text: string; editor: "BiomesEditor" | "HeightmapSelection" | "LoreEditor" }>
> = {
  terrain: { text: t("Draw or import a heightmap"), editor: "HeightmapSelection" },
  nature: { text: t("Edit biomes"), editor: "BiomesEditor" },
  economy: { text: t("Write the lore"), editor: "LoreEditor" }
};

let fields: Record<string, SpecField> = {};
let seed: SpecField = { mode: "random", value: "" };
let autoLock = true;
let page = 0;

function open(): void {
  if (options.app.mode) return void tip(t("Exit the edit mode first"), false, "error");
  const { authoring } = options.map;
  fields = Object.fromEntries(SPEC_FIELDS.map(def => [def.key, initialField(def, authoring)]));
  seed = authoring.fields.seed ?? { mode: "random", value: options.map.seed };
  autoLock = authoring.autoLock;
  page = 0;

  Dialog.destroy(DIALOG_ID);
  ensureEl("dialogs").insertAdjacentHTML("beforeend", `<div id="${DIALOG_ID}" class="dialog"></div>`);
  render();
  Dialog.open(DIALOG_ID, {
    title: t("World Wizard"),
    width: "48em",
    maxHeight: 640,
    position: { my: "center", at: "center", of: "svg" }
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
      #${DIALOG_ID} .wizardNav { display: flex; gap: 0.4em; justify-content: space-between; margin-top: 0.8em; width: 100% }
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
  dialog.querySelector<HTMLInputElement>("#wizardAutoLock")?.addEventListener("change", event => {
    autoLock = (event.target as HTMLInputElement).checked;
  });
}

function renderStep(step: WizardStep): string {
  const { intro } = STEP_TEXT[step];
  const rows = SPEC_FIELDS.filter(def => def.step === step).map(renderField);
  const after = AFTER[step];
  const afterButton = after
    ? `<p><button data-action="after" data-tip="${t("Generate first, then open this editor")}">${after.text}</button></p>`
    : "";
  const roll = rows.length ? `<button data-action="rollStep">${t("Roll this step")}</button>` : "";
  return /* html */ `
    <p style="margin-top: 0">${intro} ${roll}</p>
    ${rows.join("")}
    ${step === "nature" ? `<p class="hint">${t("Fauna and flora catalogues arrive in a later version.")}</p>` : ""}
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
  return /* html */ `
    <p style="margin-top: 0">${t("{{set}} of {{total}} settings are set by you; the generator rolls the rest.", { set, total })}</p>
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

type AfterEditor = "BiomesEditor" | "HeightmapSelection" | "LoreEditor";

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
  const spec = { ...fields, seed };
  const lock = autoLock;

  addEventListener(
    "map:generated",
    () => {
      options.map.authoring = { autoLock: lock, fields: structuredClone(spec) };
      if (editor) void Controllers[editor].open();
    },
    { once: true }
  );

  Dialog.close(DIALOG_ID);
  Pins.overrideNext(pinsOf(fields));
  regenerateMap(seed.mode === "set" && seed.value ? { seed: String(seed.value) } : undefined);
}

export const WorldWizard = { open };
