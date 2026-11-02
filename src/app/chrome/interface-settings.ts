// The interface settings, under the gear in the bottom bar: preferences of this browser, applied at once. Map
// settings live in the World Wizard; only the heightmap editor's drainage controls are bound here too
import { hsl } from "d3";
import { PerformanceSettings } from "@/app/chrome/performance-settings";
import { Controllers } from "@/controllers";
import { isLanguage, LANGUAGES } from "@/data/languages";
import { DEFAULT_THEME_COLOR, Options } from "@/model/options/options-model";
import type { OptionsData } from "@/model/options/options-schema";
import { Pins } from "@/model/options/pins";
import { Emblems } from "@/model/political/emblems-generator";
import { Cultures } from "@/model/society/cultures-generator";
import { EmblemRenderer } from "@/renderers/emblems/renderer";
import {
  applyPerformancePreset,
  applyPerformanceSettings,
  onPerformanceChange,
  resolvePerformancePreset
} from "@/renderers/performance";
import { viewport } from "@/renderers/viewport/viewport";
import { confirmCleanupData } from "@/services/versioning";
import { toggleAssistant } from "@/ui/assistant-bubble";
import { Dialog } from "@/ui/dialog/dialog";
import { applyZoomExtent, fitMapToScreen, setViewport } from "@/ui/map/canvas";
import { constrainZoom, setMapZoom, setTranslateExtent, setZoomExtent } from "@/ui/map/zoom";
import { Catalog, sentences, t } from "@/utils/i18n";
import { ensureEl, findEl } from "@/utils/node-utils";
import { minmax, rn } from "@/utils/number-utils";

interface OptionBinding {
  read: (config: OptionsData) => string | number | null;
  update: (value: string) => void;
  pin?: string;
  event?: "change";
}

interface OptionDefinition<T extends string | number> {
  read: (config: OptionsData) => T | null;
  write: (config: OptionsData, value: T) => void;
  parse: (value: string) => T;
  pin?: string;
  effect?: (value: T) => void;
}

const OPTION_BINDINGS: Record<string, OptionBinding> = {
  resolveDepressionsSteps: option({
    read: o => o.generation.resolveDepressionsSteps,
    write: (o, value) => (o.generation.resolveDepressionsSteps = value),
    parse: Number,
    pin: "resolveDepressionsSteps"
  }),
  lakeElevationLimit: option({
    read: o => o.generation.lakeElevationLimit,
    write: (o, value) => (o.generation.lakeElevationLimit = value),
    parse: Number,
    pin: "lakeElevationLimit",
    effect: () => options.app.mode === "heightmap" && Controllers.HeightmapEditor.redrawDrainage() // the editor's overlay
  }),
  uiSize: option({
    read: o => o.app.ui.size,
    write: (o, value) => (o.app.ui.size = value),
    parse: Number,
    effect: changeUiSize
  }),
  tooltipSize: option({
    read: o => o.app.ui.tooltipSize,
    write: (o, value) => (o.app.ui.tooltipSize = value),
    parse: Number,
    effect: changeTooltipSize
  }),
  azgaarAssistant: option({
    read: o => o.app.ui.assistant,
    write: (o, value) => (o.app.ui.assistant = value),
    parse: value => (value === "hide" ? "hide" : "show"),
    effect: value => toggleAssistant(value === "show")
  }),
  speakerVoice: option({
    read: o => o.app.ui.speakerVoice || null, // unset keeps the default voice loadVoices picked
    write: (o, value) => (o.app.ui.speakerVoice = value),
    parse: String
  }),
  emblemShape: option({
    read: o => o.app.emblems.shape,
    write: (o, value) => (o.app.emblems.shape = value),
    parse: String,
    effect: changeEmblemShape
  }),
  performancePreset: { read: o => resolvePerformancePreset(o.app.performance), update: applyPerformancePreset },
  onloadBehavior: option({
    read: o => o.app.onLoad,
    write: (o, value) => (o.app.onLoad = value),
    parse: value => (value === "lastSaved" ? "lastSaved" : "random")
  }),
  autosaveInterval: option({
    read: o => o.app.autosave.interval,
    write: (o, value) => (o.app.autosave.interval = value),
    parse: Number
  }),
  viewportWidth: { read: () => viewport.width, update: changeViewportSize, event: "change" },
  viewportHeight: { read: () => viewport.height, update: changeViewportSize, event: "change" },
  zoomExtentMin: { read: o => o.app.zoomExtent.min, update: changeZoomExtent, event: "change" },
  zoomExtentMax: { read: o => o.app.zoomExtent.max, update: changeZoomExtent, event: "change" },
  themeHue: { read: o => hsl(o.app.ui.themeColor).h, update: changeThemeHue },
  themeColor: { read: o => o.app.ui.themeColor, update: value => setTheme(value, options.app.ui.transparency) },
  transparency: { read: o => o.app.ui.transparency, update: value => setTheme(options.app.ui.themeColor, +value) }
};

function option<T extends string | number>(definition: OptionDefinition<T>): OptionBinding {
  const { read, write, parse, pin, effect } = definition;
  return {
    read,
    pin,
    update(raw) {
      const value = parse(raw);
      Options.set(o => write(o, value));
      if (pin) Pins.set(pin, value);
      effect?.(value);
    }
  };
}

const collator = new Intl.Collator();
/** English first, then the rest by their own name */
const LANGUAGE_OPTIONS = Object.entries(LANGUAGES).sort(([a, x], [b, y]) =>
  a === "en" ? -1 : b === "en" ? 1 : collator.compare(x, y)
);

interface Row {
  label: string;
  tip: string;
  control: string;
  icon?: string;
}

const row = ({ label, tip, control, icon = "" }: Row): string => /* html */ `
  <tr data-tip="${tip}">
    <td>${icon}</td>
    <td>${label}</td>
    <td>${control}</td>
  </tr>`;

/** a control with a small companion (a second input, a test button, a preview) in one cell */
const inline = (...parts: string[]) => `<div class="inline">${parts.join("")}</div>`;

const slider = (key: string, attributes: string) =>
  `<slider-input id="${key}" data-option="${key}" ${attributes}></slider-input>`;

const choice = (value: string, label: string) => `<option value="${value}">${label}</option>`;

const interfaceRows = () =>
  [
    row({
      label: t("Autosave interval"),
      tip: t("Set autosave interval in minutes. Set 0 to disable autosave. Map is saved to browser memory"),
      control: slider("autosaveInterval", `min="0" max="60" step="1"`)
    }),
    row({
      label: t("On load"),
      tip: t("Set what Generator should do on load"),
      control: /* html */ `
        <select id="onloadBehavior" data-option="onloadBehavior">
          ${choice("random", t("Generate random map"))}
          ${choice("lastSaved", t("Open last saved map"))}
        </select>`
    }),
    row({
      label: t("Speaker voice"),
      tip: t("Select speech synthesis voice to pronounce generated names"),
      control: inline(
        `<select id="speakerVoice" data-option="speakerVoice"></select>`,
        `<span id="speakerTest" data-tip="${t("Click to test the voice")}" style="cursor: pointer">🔊</span>`
      )
    }),
    row({
      label: t("Emblem shape"),
      tip: t("Select emblem shape. Can be changed individually in the Emblem Editor"),
      control: inline(
        `<select id="emblemShape" data-option="emblemShape">${getEmblemShapeOptions()}</select>`,
        `<svg class="emblemShapePreview" viewBox="0 0 200 210"><path id="emblemShapeImage" /></svg>`
      )
    })
  ].join("");

const EMBLEM_SHAPE_GROUPS: [group: string, shapes: [id: string, label: string][]][] = [
  [
    t("Diversiform"),
    [
      ["culture", t("Country-specific")],
      ["random", t("Country-random")],
      ["state", t("Same as the country emblem")]
    ]
  ],
  [
    t("Basic"),
    [
      ["heater", t("Heater")],
      ["spanish", t("Spanish")],
      ["french", t("French")]
    ]
  ],
  [
    t("Regional"),
    [
      ["horsehead", t("Horsehead")],
      ["horsehead2", t("Horsehead Edgy")],
      ["polish", t("Polish")],
      ["hessen", t("Hessen")],
      ["swiss", t("Swiss")]
    ]
  ],
  [
    t("Historical"),
    [
      ["boeotian", t("Boeotian")],
      ["roman", t("Roman")],
      ["kite", t("Kite")],
      ["oldFrench", t("Old French")],
      ["renaissance", t("Renaissance")],
      ["baroque", t("Baroque")]
    ]
  ],
  [
    t("Specific"),
    [
      ["targe", t("Targe")],
      ["targe2", `${t("Targe")} 2`],
      ["pavise", t("Pavise")],
      ["wedged", t("Wedged")],
      ["embowed", t("Embowed")]
    ]
  ],
  [
    t("Banner"),
    [
      ["flag", t("Flag")],
      ["pennon", t("Pennon")],
      ["guidon", t("Guidon")],
      ["banner", t("Banner")],
      ["dovetail", t("Dovetail")],
      ["gonfalon", t("Gonfalon")],
      ["pennant", t("Pennant")]
    ]
  ],
  [
    t("Simple"),
    [
      ["round", t("Round")],
      ["oval", t("Oval")],
      ["vesicaPiscis", t("Vesica Piscis")],
      ["square", t("Square")],
      ["diamond", t("Diamond")],
      ["hexagon", t("Hexagon")]
    ]
  ],
  [t("Fantasy"), [1, 2, 3, 4, 5].map(n => [`fantasy${n}`, `${t("Fantasy")} ${n}`])],
  [
    t("Middle Earth"),
    [
      ["noldor", t("Noldor")],
      ["gondor", t("Gondor")],
      ["easterling", t("Easterling")],
      ["erebor", t("Erebor")],
      ["ironHills", t("Iron Hills")],
      ["urukHai", t("UrukHai")],
      ["moriaOrc", t("Moria Orc")]
    ]
  ]
];

function getEmblemShapeOptions(): string {
  return EMBLEM_SHAPE_GROUPS.map(
    ([group, shapes]) =>
      `<optgroup label="${group}">${shapes.map(([id, label]) => choice(id, label)).join("")}</optgroup>`
  ).join("");
}

const INTERFACE_TEMPLATE = /* html */ `
  <p class="tip">${t("Interface preferences saved in this browser. Changes apply immediately")}</p>
  <table>
    <tr data-tip="${t("Select the interface language. It applies after a reload")}">
      <td></td>
      <td>${t("Language")}</td>
      <td>
        <select id="interfaceLanguage">
          ${LANGUAGE_OPTIONS.map(
            ([code, name]) => `<option value="${code}" ${code === Catalog.language ? "selected" : ""}>${name}</option>`
          ).join("")}
        </select>
      </td>
      <td></td>
    </tr>
    <tr
      data-tip="${t("Set user interface size. Please note browser zoom also affects interface size (Ctrl + or Ctrl - to change)")}"
    >
      <td></td>
      <td>${t("Interface size")}</td>
      <td colspan="2">
        <slider-input id="uiSize" data-option="uiSize" min=".6" max="3" step=".1"></slider-input>
      </td>
    </tr>
    <tr data-tip="${t("Set tooltip size")}">
      <td></td>
      <td>${t("Tooltip size")}</td>
      <td colspan="2">
        <slider-input id="tooltipSize" data-option="tooltipSize" min="1" max="32" value="14"></slider-input>
      </td>
    </tr>
    <tr data-tip="${t("Set theme hue for dialogs and tool windows")}">
      <td>
        <i data-tip="${t("Reset to default")}" id="themeColorRestore" class="icon-ccw"></i>
      </td>
      <td>${t("Theme color")}</td>
      <td>
        <input id="themeHueInput" data-option="themeHue" type="range" min="0" max="359" />
      </td>
      <td>
        <input id="themeColorInput" data-option="themeColor" type="color" />
      </td>
    </tr>
    <tr data-tip="${t("Set dialog and tool windows transparency")}">
      <td></td>
      <td>${t("Transparency")}</td>
      <td colspan="2">
        <slider-input id="transparencyInput" data-option="transparency" min="0" max="100"></slider-input>
      </td>
    </tr>
    <tr data-tip="${t("Rendering preset: visual quality traded for speed. Pick 'Speed' if the map feels slow")}">
      <td></td>
      <td>${t("Performance")}</td>
      <td>
        <select id="performancePreset" data-option="performancePreset">
          <option value="quality">${t("Quality")}</option>
          <option value="balance" selected>${t("Balance")}</option>
          <option value="speed">${t("Speed")}</option>
          <option value="custom" disabled hidden>${t("Custom")}</option>
        </select>
      </td>
      <td>
        <i data-tip="${t("Open the performance settings")}" id="openPerformanceSettings" class="icon-cog"></i>
      </td>
    </tr>
    <tr data-tip="${t("Toggle Fantasy Cartography Assistant (help bubble on the bottom right corner)")}">
      <td></td>
      <td>${t("Fantasy Cartography Assistant")}</td>
      <td>
        <select id="azgaarAssistant" data-option="azgaarAssistant">
          <option value="show" selected>${t("Show")}</option>
          <option value="hide">${t("Hide")}</option>
        </select>
      </td>
    </tr>
    <tr
      data-tip="${t("Size of the map window on screen. Independent of the map size: it is how much of the map you see at once. Set by hand it is remembered, until you fit it back to the window")}"
    >
      <td>
        <i data-tip="${t("Fit the viewport to the browser window")}" id="viewportFit" class="icon-ccw"></i>
      </td>
      <td>${t("Viewport size")}</td>
      <td>
        <input id="viewportWidth" data-option="viewportWidth" class="paired" type="number" min="100" />
        <span>x</span>
        <input id="viewportHeight" data-option="viewportHeight" class="paired" type="number" min="100" />
        <span>px</span>
      </td>
      <td></td>
    </tr>
    <tr data-tip="${t("Set minimum and maximum possible zoom level")}">
      <td>
        <i data-tip="${t("Reset to default")}" id="zoomExtentDefault" class="icon-ccw"></i>
      </td>
      <td>${t("Zoom extent")}</td>
      <td>
        <span data-tip="${t("Minimum possible zoom level (should be > 0)")}">${t("min")}</span>
        <input
          data-tip="${t("Minimum possible zoom level (should be > 0)")}"
          id="zoomExtentMin" data-option="zoomExtentMin"
          class="paired"
          type="number"
          min=".2"
          step=".1"
          max="20"
          value="1"
        />
        <span data-tip="${t("Maximum possible zoom level (should be > 1)")}">${t("max")}</span>
        <input
          data-tip="${t("Maximum possible zoom level (should be > 1)")}"
          id="zoomExtentMax" data-option="zoomExtentMax"
          class="paired"
          type="number"
          min="1"
          max="50"
          value="20"
        />
      </td>
      <td>
        <i
          data-tip="${t("Allow dragging the map beyond the canvas borders")}"
          id="translateExtent"
          data-on="0"
          class="icon-hand-paper-o"
        ></i>
      </td>
    </tr>
    ${interfaceRows()}
  </table>
  <div style="margin: 0.5em 0.3em 0">
    <button id="optionsReset" style="width: 100%" data-tip="${t("Click to restore default options and reload the page")}">
      ${t("Reset all settings")}
    </button>
  </div>
`;

const pendingInputs = new WeakMap<HTMLElement, string>();

ensureEl("interfaceContent").innerHTML = INTERFACE_TEMPLATE;
addListeners();
loadVoices();
onPerformanceChange(() => syncOption("performancePreset")); // the preset follows the fields, wherever they change

function addListeners(): void {
  const root = ensureEl("interfaceContent");
  for (const element of [root, ensureEl("heightmapMenu")]) {
    element.addEventListener("input", onOptionInput);
    element.addEventListener("change", onOptionInput);
  }
  ensureEl("interfaceLanguage").addEventListener("change", event => changeLanguage(event.target as HTMLSelectElement));

  const onClick = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target.id === "viewportFit") fitViewportToWindow();
    else if (target.id === "zoomExtentDefault") restoreDefaultZoomExtent();
    else if (target.id === "translateExtent") toggleTranslateExtent(target);
    else if (target.id === "openPerformanceSettings") PerformanceSettings.open();
    else if (target.id === "speakerTest") testSpeaker();
    else if (target.id === "themeColorRestore") restoreDefaultThemeColor();
    else if (target.id === "optionsReset") confirmCleanupData();
  };
  root.addEventListener("click", onClick);
}

function optionInputs<T extends HTMLElement = HTMLInputElement>(key: string): NodeListOf<T> {
  return document.querySelectorAll<T>(`:is(#interfaceContent, #heightmapMenu) [data-option="${key}"]`);
}

function optionInput<T extends HTMLElement = HTMLInputElement>(key: string): T {
  const input = optionInputs<T>(key)[0];
  if (!input) throw new Error(`Missing option control: ${key}`);
  return input;
}

function syncOption(key: string, source?: HTMLElement): void {
  const value = OPTION_BINDINGS[key].read(options);
  if (value === null) return;
  for (const input of optionInputs(key)) {
    if (input === source) continue;
    input.value = String(value);
    pendingInputs.delete(input);
  }
}

export function syncOptionInputs(): void {
  for (const key of Object.keys(OPTION_BINDINGS)) syncOption(key);
  syncViewOnly();
}

function syncViewOnly(): void {
  const viewOnly = !!options.map.viewOnly;
  document.body.classList.toggle("view-only", viewOnly);

  const saveButton = findEl<HTMLButtonElement>("saveButton");
  if (!saveButton) return;
  saveButton.disabled = viewOnly;
  saveButton.dataset.tip = viewOnly
    ? t("The map is in view-only mode and cannot be saved")
    : t("Save fully-functional map file");
}

function onOptionInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const key = input.dataset.option;
  if (!key || !Object.hasOwn(OPTION_BINDINGS, key)) return;
  const binding = OPTION_BINDINGS[key];
  if (binding.event === "change" && event.type !== "change") return;

  // A native change commits the last input; it must not repeat its effects.
  if (event.type !== "change" || pendingInputs.get(input) !== input.value) {
    binding.update(input.value);
    syncOption(key, input);
  }

  if (event.type === "input") pendingInputs.set(input, input.value);
  else {
    pendingInputs.delete(input);
    Options.persist();
  }
}

/** The density step of the next map, as the submap and transform tools ask for it */
export function changeCellsDensity(density: number): void {
  Options.set(o => (o.generation.graph.density = density));
}

/** Re-shield every emblem that has not been customised, and re-render the ones on screen */
function changeEmblemShape(shape: string): void {
  Emblems.setShape(shape);

  const image = ensureEl("emblemShapeImage");
  const { shieldPaths } = EmblemRenderer;
  const shapePath = shieldPaths[shape as keyof typeof shieldPaths];
  if (shapePath) image.setAttribute("d", shapePath);
  else image.removeAttribute("d");

  const specificShape = ["culture", "state", "random"].includes(shape) ? null : shape;
  if (shape === "random")
    for (const culture of pack.cultures) if (!culture.removed) culture.shield = Cultures.getRandomShield();

  for (const state of pack.states) {
    if (!state.i || state.removed || !state.coa || "icon" in state.coa) continue;
    const shield = specificShape || Emblems.getShield(state.culture ?? 0);
    if (shield === state.coa.shield) continue;
    state.coa.shield = shield;
    EmblemRenderer.trigger(`stateCOA${state.i}`, state.coa);
  }

  for (const province of pack.provinces) {
    if (!province.i || province.removed || !province.coa || "icon" in province.coa) continue;
    const shield = specificShape || Emblems.getShield(pack.cells.culture[province.center] ?? 0, province.state);
    if (shield === province.coa.shield) continue;
    province.coa.shield = shield;
    EmblemRenderer.trigger(`provinceCOA${province.i}`, province.coa);
  }

  for (const burg of pack.burgs) {
    if (!burg.i || burg.removed || !burg.coa || "icon" in burg.coa) continue;
    const shield = specificShape || Emblems.getShield(burg.culture ?? 0, burg.state);
    if (shield === burg.coa.shield) continue;
    burg.coa.shield = shield;
    EmblemRenderer.trigger(`burgCOA${burg.i}`, burg.coa);
  }
}

function changeUiSize(value: number): void {
  if (Number.isNaN(value) || value < 0.5) return;
  const size = Math.min(value, maxUiSize());

  optionInput("uiSize").value = String(size);
  document.body.style.fontSize = `${rn(size * 10, 2)}px`;
  ensureEl("options").style.width = `${size * 300}px`;
}

const maxUiSize = () => rn(Math.min(window.innerHeight / 465, window.innerWidth / 302), 1);

function changeTooltipSize(value: number): void {
  ensureEl("tooltip").style.fontSize = `calc(${value}px + 0.5vw)`;
}

/**
 * The theme is a colour and a transparency edited by three controls - a picker, a hue slider and a
 * reset. One writer for the pair keeps the object holding what the dialogs are actually painted
 * with, whichever control moved. See docs/architecture/configuration.md
 */
function setTheme(themeColor: string, transparency: number): void {
  Options.set(o => {
    o.app.ui.themeColor = themeColor;
    o.app.ui.transparency = transparency;
  });
  changeDialogsTheme(themeColor, transparency);
}

function restoreDefaultThemeColor(): void {
  setTheme(DEFAULT_THEME_COLOR, options.app.ui.transparency);
}

function changeThemeHue(hue: string): void {
  const { s, l } = hsl(options.app.ui.themeColor);
  setTheme(hsl(+hue, s, l).hex(), options.app.ui.transparency);
}

/**
 * Derive the whole dialog palette from one colour and one transparency. This applies what the
 * object holds; `setTheme` is what puts it there
 */
function changeDialogsTheme(themeColor: string, transparency: number): void {
  optionInput("transparency").value = String(transparency);
  const alpha = (100 - transparency) / 100;
  const alphaReduced = Math.min(alpha + 0.3, 1);

  const { h, s, l } = hsl(themeColor);
  optionInput("themeColor").value = themeColor;
  optionInput("themeHue").value = String(h);

  const variables: [name: string, value: string][] = [
    ["--bg-opacity", String(alpha)],
    ["--bg-main", hsl(h, s, l, alpha).toString()],
    ["--bg-lighter", hsl(h, s, l + 0.02, alpha).toString()],
    ["--bg-light", hsl(h, s - 0.02, l + 0.06, alpha).toString()],
    ["--light-solid", hsl(h, s + 0.01, l + 0.05, 1).toString()],
    ["--dark-solid", hsl(h, s, l - 0.2, 1).toString()],
    ["--header", hsl(h, s, l - 0.03, alphaReduced).toString()],
    ["--header-active", hsl(h, s, l - 0.09, alphaReduced).toString()],
    ["--bg-disabled", hsl(h, s - 0.04, l + 0.09).toString()],
    ["--bg-dialogs", hsl(0, 0, 0.98, alpha).toString()]
  ];
  for (const [name, value] of variables) document.documentElement.style.setProperty(name, value);
}

function changeZoomExtent(value: string): void {
  const minInput = optionInput("zoomExtentMin");
  const maxInput = optionInput("zoomExtentMax");
  if (+minInput.value > +maxInput.value) [minInput.value, maxInput.value] = [maxInput.value, minInput.value];

  setZoomExtentPreference(Math.max(+minInput.value, 0.01), Math.min(+maxInput.value, 200));
  setMapZoom(minmax(+value, 0.01, 200));
}

/**
 * The window onto the map, not the map. It is free of the extent the graph was built on: a viewport
 * larger than the extent scales the map up to cover it. See docs/architecture/configuration.md
 */
function changeViewportSize(): void {
  const width = +optionInput("viewportWidth").value;
  const height = +optionInput("viewportHeight").value;
  if (!(width > 0) || !(height > 0)) return;

  setViewport(width, height);
  Options.set(o => (o.app.viewport = { width: viewport.width, height: viewport.height }));
}

/** Back to following the browser window, which is what the viewport does until it is set by hand */
function fitViewportToWindow(): void {
  Options.set(o => (o.app.viewport = null));
  fitMapToScreen();
}

/** The default is the fitted view: the ceiling is the app's, the floor is the map's and the window's */
function restoreDefaultZoomExtent(): void {
  Options.set(o => (o.app.zoomExtent.max = Options.getDefaultOptions().app.zoomExtent.max));
  optionInput("zoomExtentMax").value = String(options.app.zoomExtent.max);
  applyZoomExtent();
  setMapZoom(options.app.zoomExtent.min);
}

/** The single writer of the zoom extent: one pair, normalised together and shown together */
function setZoomExtentPreference(min: number, max: number): void {
  Options.set(o => (o.app.zoomExtent = { min, max }));
  optionInput("zoomExtentMin").value = String(min);
  optionInput("zoomExtentMax").value = String(max);
  setZoomExtent(min, max); // a hand-set floor stands until the next fit re-derives it
  constrainZoom();
}

/** Let the user pan beyond the canvas edges, so a map can be inspected off-centre */
function toggleTranslateExtent(el: HTMLElement): void {
  const isOn = !+(el.dataset.on ?? 0);
  el.dataset.on = String(+isOn);

  const { width, height } = options.map.graph;
  if (isOn) setTranslateExtent(-width / 2, -height / 2, width * 1.5, height * 1.5);
  else setTranslateExtent(0, 0, width, height);
}

/** Voices arrive asynchronously and some browsers report none at all, so poll briefly then give up */
function loadVoices(): void {
  let attempts = 0;
  const select = optionInput<HTMLSelectElement>("speakerVoice");

  const interval = setInterval(() => {
    const voices = speechSynthesis.getVoices();

    if (!voices.length) {
      if (++attempts < 10) return;
      clearInterval(interval);
      if (!select.options.length) select.options.add(new Option(t("No voices available"), ""));
      return;
    }

    clearInterval(interval);
    for (const [index, voice] of voices.entries()) select.options.add(new Option(voice.name, String(index)));
    select.value = options.app.ui.speakerVoice || String(voices.findIndex(voice => voice.lang === "en-US"));
  }, 1000);
}

function testSpeaker(): void {
  const speech = new SpeechSynthesisUtterance(t("The quick brown fox jumps over the lazy dog"));
  const voices = speechSynthesis.getVoices();
  if (voices.length) speech.voice = voices[Number(options.app.ui.speakerVoice)] ?? speech.voice;
  speechSynthesis.speak(speech);
}

/** Store the interface language and offer the reload that applies it */
function changeLanguage(select: HTMLSelectElement): void {
  const code = select.value;
  if (!isLanguage(code)) return;
  Options.set(o => (o.app.language = code));
  Options.persist();
  if (code === Catalog.language) return;

  Dialog.confirm({
    title: t("Change language"),
    message: sentences(
      t("The interface switches to {{language}} after a reload", { language: LANGUAGES[code] }),
      t("If you have unsaved changes, save the map first")
    ),
    confirm: t("Reload"),
    cancel: t("Not now"),
    onConfirm: () => {
      window.onbeforeunload = null; // the user just confirmed the reload, don't ask again
      location.reload();
    }
  });
}

/**
 * Restore what the settings themselves show. The values themselves are restored by `Options.restore` before this runs
 */
const defaultUiSize = (): number => minmax(rn(window.innerWidth / 1280, 1), 1, maxUiSize());

export function restoreUi(): void {
  // `syncInputs` has already put every preference in its control; these are the ones that also do
  // something the moment they are read back. See docs/architecture/configuration.md
  const { ui, emblems } = options.app;

  Emblems.setShape(emblems.shape);
  changeTooltipSize(ui.tooltipSize);

  optionInput("uiSize").max = String(maxUiSize());
  changeUiSize(ui.size ?? defaultUiSize());

  changeDialogsTheme(ui.themeColor, ui.transparency);
  applyPerformanceSettings();
  applyZoomExtent();
}
