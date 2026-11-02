// The climate of the map: how warm, how cold and how wet, applied to the map on screen
import { Controllers } from "@/controllers";
import { Routes } from "@/model/economy/routes-generator";
import { Options } from "@/model/options/options-model";
import { Pins } from "@/model/options/pins";
import { Biomes } from "@/model/physical/biomes-generator";
import { Features } from "@/model/physical/features-generator";
import { Precipitation } from "@/model/physical/precipitation-generator";
import { Rivers } from "@/model/physical/river-generator";
import { Temperature } from "@/model/physical/temperature-generator";
import { convertTemperature } from "@/model/units";
import { Layers } from "@/renderers/layers";
import { Dialog } from "@/ui/dialog/dialog";
import { bindPinIcons } from "@/ui/pin-icons";
import { t } from "@/utils/i18n";
import { ensureEl, findEl } from "@/utils/node-utils";

function open(): void {
  if (options.app.mode) return;

  renderDialog();
  updateInputValues();

  Dialog.open("worldConfigurator", {
    title: t("Climate"),
    buttons: [{ label: t("Update world"), onClick: updateWorld, tip: t("Apply current settings to the map") }],
    footer: /* html */ `<div class="dontAsk" data-tip="${t("Automatically update world on input changes and button clicks")}">
      <input id="wcAutoChange" class="checkbox" type="checkbox" checked />
      <label for="wcAutoChange" class="checkbox-label"><i>${t("auto-apply changes")}</i></label>
    </div>`
  });
}

function renderDialog(): void {
  Dialog.destroy("worldConfigurator");
  ensureEl("dialogs").insertAdjacentHTML("beforeend", createDialogHtml());
  addListeners();
}

function createDialogHtml(): string {
  const temperatureControl = (param: string, label: string, dataTip: string): string => /* html */ `<div>
    <i data-locked="0" id="lock_${param}" class="icon-lock-open"></i>
    <label data-tip="${dataTip}">
      <i>${label}:</i>
      <input id="${param}Input" type="number" min="-50" max="50" />
      <span>°C<span id="${param}Converted"></span></span>
      <input id="${param}Output" type="range" min="-50" max="50" />
    </label>
  </div>`;

  return /* html */ `<div id="worldConfigurator" class="dialog stable">
    <div id="worldControls">
      <p class="hint" style="margin-top: 0; max-width: 24em">${t("The map runs from warmer in the south to colder in the north. Regions you configure in the World Wizard override it locally.")}</p>
      ${temperatureControl("temperatureEquator", t("Warmest (south)"), t("Average yearly temperature at the warm end of the scale"))}
      ${temperatureControl("temperatureNorthPole", t("Coldest (north)"), t("Average yearly temperature at the cold end of the scale"))}
      <div>
        <label
          data-tip="${t("Set precipitation - water amount clouds can bring. Defines rivers and biomes generation. Keep around 100% for default generation")}"
        >
          <i data-locked="0" id="lock_prec" class="icon-lock-open"></i>
          <i>${t("Precipitation")}:</i>
          <input id="precInput" type="number" />%
          <input id="precOutput" type="range" min="0" max="500" />
        </label>
      </div>
    </div>
  </div>`;
}

function addListeners(): void {
  // every control here is a <key>Input / <key>Output pair over one value in `options.map`
  ensureEl("worldConfigurator").addEventListener("input", onWorldInput);
  bindPinIcons(ensureEl("worldConfigurator"), currentValue);
}

/** What each lock icon in this dialog pins */
function currentValue(key: string): number | undefined {
  const { temperature } = options.map.climate;
  if (key === "temperatureEquator") return temperature.equator;
  if (key === "temperatureNorthPole") return temperature.northPole;
  if (key === "temperatureSouthPole") return temperature.southPole;
  if (key === "prec") return options.map.climate.precipitation;
  return undefined;
}

/**
 * Every control writes its value straight into `options.map`, pins it, and previews the world it
 * describes. The two halves of a pair carry the same value, so the other half follows the edited
 * one and the value is written once
 */
function onWorldInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const pair = input.id.match(/^(\w+?)(Input|Output)$/);
  if (!pair || !input.value) return;

  const [, key, half] = pair;
  const value = Number(input.value);
  if (Number.isNaN(value)) return;

  const other = findEl<HTMLInputElement>(`${key}${half === "Input" ? "Output" : "Input"}`);
  if (other) other.value = input.value;

  const { climate } = options.map;
  if (key === "temperatureEquator") climate.temperature.equator = value;
  else if (key === "temperatureNorthPole") climate.temperature.northPole = value;
  else if (key === "temperatureSouthPole") climate.temperature.southPole = value;
  else if (key === "prec") climate.precipitation = value;
  else return;

  Pins.set(key, value); // set by hand: the next map keeps it
  Options.save();
  updateConvertedTemperatures();
  if (findEl<HTMLInputElement>("wcAutoChange")?.checked) updateWorld();
}

// inputs are always in °C; show " = <value>" in user units if user units are not °C
function convertedTemperature(temperatureCelsius: number): string {
  const userUnits = options.map.units.temperature.unit;
  if (userUnits === "°C") return "";
  return ` = ${convertTemperature(temperatureCelsius)}`;
}

function updateConvertedTemperatures(): void {
  const { equator, northPole } = options.map.climate.temperature;
  ensureEl("temperatureEquatorConverted").textContent = convertedTemperature(equator);
  ensureEl("temperatureNorthPoleConverted").textContent = convertedTemperature(northPole);
}

/** The object is the source: push what it holds into both halves of every control that shows it */
function updateInputValues(): void {
  const { temperature, precipitation } = options.map.climate;

  for (const [key, value] of Object.entries({
    temperatureEquator: temperature.equator,
    temperatureNorthPole: temperature.northPole,
    prec: precipitation
  })) {
    for (const half of ["Input", "Output"]) {
      const input = findEl<HTMLInputElement>(`${key}${half}`);
      if (input) input.value = String(value);
    }
  }

  updateConvertedTemperatures();
}

function updateWorld(): void {
  Temperature.generate();
  Precipitation.generate();
  const heights = new Uint8Array(pack.cells.h);
  Rivers.generate(true, Rivers.getLocked());
  Rivers.specify();
  Routes.sync(); // its river edges follow the rivers
  pack.cells.h = new Float32Array(heights);
  Biomes.define();
  Features.defineGroups();
  Features.defineNames();

  Layers.draw("temperature", "precipitation");
  Layers.draw("biomes", "coordinates", "rivers");
  if (findEl("canvas3d")) setTimeout(() => Controllers.View3d.update(), 500);
}

export const WorldConfigurator = { open };
