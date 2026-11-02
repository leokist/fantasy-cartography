// Export to Godot: the package settings, its build and download

import { heightToMeters } from "@/model/units";
import {
  buildGodotFiles,
  defaultSettings,
  type GodotSettings,
  mapRegion,
  zipGodotFiles
} from "@/services/io/godot/godot-package";
import { Dialog } from "@/ui/dialog/dialog";
import { tip } from "@/ui/tooltips";
import { link } from "@/utils/common-utils";
import { downloadFile } from "@/utils/file-utils";
import { t } from "@/utils/i18n";
import { ensureEl } from "@/utils/node-utils";

const DIALOG_ID = "godotExport";
const SIZES = [512, 1024, 2048, 4096, 8192];
const ADDON_URL = "https://github.com/leokist/fantasy-cartography/tree/master/godot";
const STEPS: Record<string, string> = {
  terrain: t("Shaping the terrain..."),
  curves: t("Tracing rivers, roads and lakes..."),
  places: t("Placing burgs and borders..."),
  images: t("Writing the maps..."),
  emblems: t("Drawing emblems..."),
  preview: t("Building the preview mesh..."),
  zip: t("Packing the zip...")
};

let regionKind: "map" | "visible" = "map";
let settings: GodotSettings;
let busy = false;

function open(): void {
  if (!pack.cells?.h) return void tip(t("Generate a map first"), false, "error");
  settings ??= defaultSettings(mapRegion(regionKind));
  settings.region = mapRegion(regionKind);
  Dialog.destroy(DIALOG_ID);
  ensureEl("dialogs").insertAdjacentHTML("beforeend", `<div id="${DIALOG_ID}" class="dialog"></div>`);
  render();
  Dialog.open(DIALOG_ID, {
    title: t("Export to Godot"),
    width: "30em",
    position: { my: "center", at: "center", of: "svg" },
    buttons: [
      { label: t("Download package"), onClick: download },
      { label: t("Close"), onClick: () => Dialog.close(DIALOG_ID) }
    ]
  });
}

function render(): void {
  const body = ensureEl(DIALOG_ID);
  const sizes = SIZES.map(
    size => `<option value="${size}" ${size === settings.columns ? "selected" : ""}>${size} px</option>`
  ).join("");
  body.innerHTML = /* html */ `
    <style>
      #${DIALOG_ID} .godotGrid { display: grid; grid-template-columns: minmax(0, 1fr) 10em; gap: 0.4em 0.8em; align-items: center }
      #${DIALOG_ID} .godotGrid input[type=number], #${DIALOG_ID} .godotGrid select { width: 100%; box-sizing: border-box }
      #${DIALOG_ID} .hint { font-size: 0.85em; opacity: 0.75 }
      #${DIALOG_ID} label.check { display: block; margin-top: 0.3em }
    </style>
    <p class="hint">${t("Heights in meters, biome and mask maps, smooth rivers and roads, places and borders, ready for the Fantasy Cartography Importer addon and Terrain3D.")}</p>
    <div class="godotGrid">
      <span>${t("Area")}</span>
      <select data-setting="region">
        <option value="map" ${regionKind === "map" ? "selected" : ""}>${t("Whole map")}</option>
        <option value="visible" ${regionKind === "visible" ? "selected" : ""}>${t("Visible area")}</option>
      </select>
      <span>${t("Heightmap width")}</span>
      <select data-setting="columns">${sizes}</select>
      <span>${t("Meters per pixel")}</span>
      <input data-setting="metersPerPixel" type="number" min="0.25" max="100" step="0.25" value="${settings.metersPerPixel}" />
      <span>${t("Highest peak, m")}</span>
      <input data-setting="maxAltitude" type="number" min="1" max="20000" step="1" value="${settings.maxAltitude}" />
      <span>${t("Deepest sea, m")}</span>
      <input data-setting="seaDepth" type="number" min="0" max="20000" step="1" value="${settings.seaDepth}" />
      <span>${t("Relief detail")}</span>
      <input data-setting="detail" type="range" min="0" max="1" step="0.05" value="${settings.detail}" />
    </div>
    <p class="hint" data-summary></p>
    <label class="check"><input class="native" type="checkbox" data-setting="emblems" ${settings.emblems ? "checked" : ""} /> ${t("Emblems of states and provinces")}</label>
    <label class="check"><input class="native" type="checkbox" data-setting="burgEmblems" ${settings.burgEmblems ? "checked" : ""} /> ${t("Emblems of burgs")}</label>
    <label class="check"><input class="native" type="checkbox" data-setting="preview" ${settings.preview ? "checked" : ""} /> ${t("Preview mesh (.glb)")}</label>
    <p class="hint">${t("No need to unzip: in Godot, enable the Fantasy Cartography Importer addon and choose Project > Tools > Import Fantasy Cartography package. Get the addon from {{- link}}.", { link: link(ADDON_URL, t("the project's godot folder")) })}</p>
    <p data-status style="font-style: italic"></p>`;

  for (const input of body.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting]"))
    input.addEventListener("change", () => {
      const key = input.dataset.setting as string;
      if (key === "region") {
        regionKind = input.value as typeof regionKind;
        settings.region = mapRegion(regionKind);
      } else if (input instanceof HTMLInputElement && input.type === "checkbox")
        (settings as unknown as Record<string, boolean>)[key] = input.checked;
      else (settings as unknown as Record<string, number>)[key] = Number(input.value);
      summarize();
    });
  summarize();
}

function summarize(): void {
  const { region, columns, metersPerPixel } = settings;
  const rows = Math.round((columns * (region.y1 - region.y0)) / (region.x1 - region.x0));
  const km = (pixels: number) => (pixels * metersPerPixel) / 1000;
  const realPeak = Math.round(heightToMeters(100));
  const lines = [
    t("{{columns}} × {{rows}} px, a world of {{width}} × {{height}} km.", {
      columns,
      rows,
      width: km(columns).toLocaleString(undefined, { maximumFractionDigits: 2 }),
      height: km(rows).toLocaleString(undefined, { maximumFractionDigits: 2 })
    }),
    t("The map's own scale would put its highest peak at {{meters}} m.", { meters: realPeak })
  ];
  if (columns >= 8192) lines.push(t("A large heightmap takes a while and a lot of memory."));
  ensureEl(DIALOG_ID).querySelector("[data-summary]")!.textContent = lines.join(" ");
}

async function download(): Promise<void> {
  if (busy) return;
  const status = ensureEl(DIALOG_ID).querySelector<HTMLElement>("[data-status]")!;
  const show = (step: string) => {
    status.textContent = STEPS[step] ?? step;
  };
  busy = true;
  try {
    const files = await buildGodotFiles({ ...settings }, show);
    show("zip");
    const name = (options.map.lore.name || "world").replace(/[\\/:*?"<>|]/g, "").trim() || "world";
    const zip = await zipGodotFiles(files, `${name}-godot`);
    downloadFile(zip, `${name}-godot.zip`, "application/zip");
    status.textContent = t("The package is ready.");
  } catch (error) {
    status.textContent = "";
    tip(t("Godot export failed: {{error}}", { error: (error as Error).message }), false, "error", 8000);
  } finally {
    busy = false;
  }
}

export const GodotExport = { open };
