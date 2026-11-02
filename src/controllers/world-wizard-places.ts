// The wizard's places: continents, countries with their capitals and cities, and the provinces of each country,
// all put on one sketch of the map by choosing an item and tapping where it goes

import { Controllers } from "@/controllers";
import { Additions } from "@/model/authoring/additions";
import {
  CLIMATES,
  CONTINENT_SIZES,
  COUNTRY_AREA,
  COUNTRY_SIZES,
  cleanSeeds,
  type ProvinceSeed,
  RELIEFS,
  type Seeds,
  SIZINGS,
  type StateSeed,
  WATERS
} from "@/model/authoring/world-spec";
import { Biomes } from "@/model/physical/biomes-generator";
import { Names } from "@/model/society/names-generator";
import { Layers } from "@/renderers/layers";
import { tip } from "@/ui/tooltips";
import { t } from "@/utils/i18n";
import { escapeHtml } from "@/utils/string-utils";

type Placing =
  | { kind: "continent"; index: number }
  | { kind: "country"; index: number }
  | { kind: "province"; index: number }
  | { kind: "city"; index: number; city: number };

const CONTINENT_SIZE_LABELS: Record<string, string> = {
  small: t("Small"),
  medium: t("Medium"),
  large: t("Large"),
  huge: t("Huge")
};
const SIZING_LABELS: Record<string, string> = {
  size: t("By size: small, medium or large"),
  area: t("By area: a share of the map")
};
// switching to area starts each country from about the share its size took
const AREA_OF_SIZE = { small: 2, medium: 4, large: 8 };
const RELIEF_LABELS: Record<string, string> = {
  plains: t("Plains"),
  hills: t("Hills"),
  mountains: t("Mountains"),
  plateau: t("Plateau")
};
const CLIMATE_LABELS: Record<string, string> = { hot: t("Hot"), temperate: t("Temperate"), cold: t("Cold") };
const WATER_LABELS: Record<string, string> = { dry: t("Dry"), normal: t("Normal"), wet: t("Wet"), lakes: t("Lakes") };
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
const PALETTE = ["#c0392b", "#2e86c1", "#d4ac0d", "#8e44ad", "#16a085", "#e67e22", "#2c3e50", "#d35400"];
// the radii the land is built with, in shares of the map's shorter side
const CONTINENT_RADIUS: Record<string, number> = { small: 0.14, medium: 0.22, large: 0.3, huge: 0.4 };
const COUNTRY_RADIUS: Record<string, number> = { small: 0.06, medium: 0.09, large: 0.13 };

let placing: Placing | null = null;
let regionCountry = 0;

export function resetPlaces(): void {
  placing = null;
  regionCountry = 0;
}

const countryColor = (state: StateSeed, index: number) => state.color ?? PALETTE[index % PALETTE.length];
const value = (text?: string) => escapeHtml(text ?? "");
const options = (values: readonly string[], labels: Record<string, string>, current?: string, auto?: string) =>
  (auto ? `<option value="">${auto}</option>` : "") +
  values.map(v => `<option value="${v}" ${v === current ? "selected" : ""}>${labels[v] ?? v}</option>`).join("");
const placeButton = (target: string, placed: boolean) =>
  `<button data-place="${target}" class="${placed ? "" : "unplaced"}" data-tip="${t("Then tap the sketch where it goes")}">📍 ${placed ? t("Move") : t("Place")}</button>`;

function placingName(seeds: Seeds): string {
  if (!placing) return "";
  if (placing.kind === "continent") return seeds.continents[placing.index]?.name;
  if (placing.kind === "country") return seeds.states[placing.index]?.name;
  if (placing.kind === "province") return seeds.provinces[placing.index]?.name;
  return seeds.states[placing.index]?.cities?.[placing.city]?.name ?? "";
}

/** The sketch: continents as their reach, countries as dots in their colors, cities and provinces as small marks */
function renderSketch(seeds: Seeds, mode: "countries" | "regions", hasMap: boolean): string {
  const { width, height } = globalThis.options.generation.graph;
  const side = Math.min(width, height);
  // a country by area is drawn as a little more than its share of the map, as the land raised for it
  const reach = (state: StateSeed) =>
    state.area === undefined || seeds.sizing !== "area"
      ? COUNTRY_RADIUS[state.size ?? "medium"]
      : Math.sqrt(((state.area / 100) * width * height * 1.3) / Math.PI) / side;
  const circle = (x: number, y: number, radius: number) =>
    `left: ${x}%; top: ${y}%; width: ${((2 * radius * side) / width) * 100}%; height: ${((2 * radius * side) / height) * 100}%`;
  const marks: string[] = [];

  if (mode === "countries")
    for (const continent of seeds.continents)
      marks.push(
        `<div class="reach continent" style="${circle(continent.x, continent.y, CONTINENT_RADIUS[continent.size])}"><span>${value(continent.name)}</span></div>`
      );
  for (const [index, state] of seeds.states.entries()) {
    const color = countryColor(state, index);
    const faded = mode === "regions" && index !== regionCountry;
    marks.push(
      `<div class="reach" style="${circle(state.x, state.y, reach(state))}; border-color: ${color}; opacity: ${faded ? 0.3 : 1}"></div>`,
      `<div class="mark country" style="left: ${state.x}%; top: ${state.y}%; background: ${color}; opacity: ${faded ? 0.4 : 1}"><span>${value(state.name || t("Country"))}</span></div>`
    );
    if (mode === "countries")
      for (const city of state.cities ?? [])
        marks.push(
          `<div class="mark city" style="left: ${city.x}%; top: ${city.y}%"><span>${value(city.name)}</span></div>`
        );
  }
  if (mode === "regions")
    for (const province of seeds.provinces.filter(item => item.state === regionCountry))
      marks.push(
        `<div class="mark province" style="left: ${province.x}%; top: ${province.y}%"><span>${value(province.name || t("Province"))}</span></div>`
      );

  const banner = placing
    ? `<div class="placing">${t("Tap the sketch to place {{name}}", { name: escapeHtml(placingName(seeds) || "…") })} <button data-action="cancelPlace">${t("Cancel")}</button></div>`
    : `<div class="hint">${t("Choose 📍 on an item, then tap the sketch where it goes.")}</div>`;
  return /* html */ `${banner}
    <div class="sketch ${placing ? "active" : ""}" style="aspect-ratio: ${width} / ${height}; width: min(100%, ${Math.round((42 * width) / height)}vh)">
      ${hasMap ? `<canvas class="sketchMap" width="${Math.round(width / 2)}" height="${Math.round(height / 2)}"></canvas>` : ""}
      ${marks.join("")}
    </div>`;
}

export function renderCountriesStep(seeds: Seeds, hasMap: boolean): string {
  const continents = seeds.continents
    .map(
      (continent, index) => /* html */ `<div class="placeRow" data-continent="${index}">
      <input data-prop="name" placeholder="${t("Continent name")}" value="${value(continent.name)}" />
      <select data-prop="size">${options(CONTINENT_SIZES, CONTINENT_SIZE_LABELS, continent.size)}</select>
      ${placeButton(`continent:${index}`, true)}
      <button data-remove="continent:${index}">${t("Remove")}</button>
    </div>`
    )
    .join("");
  const countries = seeds.states.map((state, index) => renderCountry(seeds, state, index, hasMap)).join("");
  const forms = FORMS.map(([form, label]) => `<option value="${form}">${label}</option>`).join("");

  return /* html */ `
    ${renderSketch(seeds, "countries", hasMap)}
    <h3>${t("Continents")} <button data-add="continent">+ ${t("Continent")}</button></h3>
    <p class="hint">${t("Land is raised where you place continents and countries; the rest of the map is sea.")}</p>
    ${continents}
    <h3>${t("Countries")} <button data-add="country">+ ${t("Country")}</button></h3>
    <p class="hint">${t("Place each country's capital. The generated map has exactly these countries.")}</p>
    <div class="attrs"><label>${t("Country size")}
      <select data-sizing>${options(SIZINGS, SIZING_LABELS, seeds.sizing ?? "size")}</select></label></div>
    ${seeds.sizing === "area" ? `<p class="hint">${t("Each country grows from its capital until it covers its share of the map, if there is land enough; together they should take less than the land.")}</p>` : ""}
    ${countries}
    <datalist id="wizardForms">${forms}</datalist>`;
}

function renderCountry(seeds: Seeds, state: StateSeed, index: number, hasMap: boolean): string {
  const continentOptions = seeds.continents
    .map(
      (continent, i) =>
        `<option value="${i}" ${state.continent === i ? "selected" : ""}>${value(continent.name || `${t("Continent")} ${i + 1}`)}</option>`
    )
    .join("");
  const languageOptions = Names.nameBases
    .map((base, i) => `<option value="${i}" ${state.language === i ? "selected" : ""}>${value(base.name)}</option>`)
    .join("");
  const neighbors = seeds.states
    .map((other, i) =>
      i === index
        ? ""
        : `<label><input class="native" type="checkbox" data-neighbor="${i}" ${state.neighbors?.includes(i) ? "checked" : ""} /> ${value(other.name || `${t("Country")} ${i + 1}`)}</label>`
    )
    .join("");
  const cities = (state.cities ?? [])
    .map(
      (city, c) => /* html */ `<div class="placeRow" data-city="${c}">
      <input data-city-prop="name" placeholder="${t("City name")}" value="${value(city.name)}" />
      ${placeButton(`city:${index}:${c}`, true)}
      <button data-remove="city:${index}:${c}">×</button>
    </div>`
    )
    .join("");
  const addNow = hasMap
    ? `<button data-add-now="${index}" data-tip="${t("Put it on the map on screen now; where it is sea, land is raised for it. Locked countries stay as they are")}">${t("Add to current map")}</button>`
    : "";

  return /* html */ `<div class="countryCard" data-country="${index}" style="border-left-color: ${countryColor(state, index)}">
    <div class="placeRow">
      <input data-prop="name" placeholder="${t("Country name")}" value="${value(state.name)}" />
      <input data-prop="capital" placeholder="${t("Capital (optional)")}" value="${value(state.capital)}" />
      ${placeButton(`country:${index}`, true)}
    </div>
    <div class="placeRow">
      <select data-prop="continent"><option value="">${t("No continent")}</option>${continentOptions}</select>
      ${
        seeds.sizing === "area"
          ? `<label class="areaInput"><input data-prop="area" type="number" min="${COUNTRY_AREA.min}" max="${COUNTRY_AREA.max}" step="0.5" value="${state.area ?? COUNTRY_AREA.default}" /> % ${t("of the map")}</label>`
          : `<select data-prop="size">${options(COUNTRY_SIZES, CONTINENT_SIZE_LABELS, state.size ?? "medium")}</select>`
      }
      <input data-prop="form" list="wizardForms" placeholder="${t("Form: Kingdom, Republic…")}" value="${value(state.form)}" />
      <label class="seedColor">${t("Color")} <input data-prop="color" type="color" value="${countryColor(state, index)}" /></label>
    </div>
    <div class="placeRow">
      <select data-prop="language" data-tip="${t("The country is its own people: names of its places are made in this language")}"><option value="">${t("Language: automatic")}</option>${languageOptions}</select>
      <span><button data-emblem="${index}">${t("Emblem…")}</button> ${state.emblem ? `✓ <button data-clear-emblem="${index}" data-tip="${t("Use a generated emblem")}">×</button>` : ""}</span>
    </div>
    ${neighbors ? `<div class="checks"><span>${t("Borders")}:</span> ${neighbors}</div>` : ""}
    <div class="cities"><b>${t("Cities")}</b> <button data-add="city:${index}">+ ${t("City")}</button>${cities}</div>
    <div class="placeRow end">${addNow}<button data-remove="country:${index}">${t("Remove country")}</button></div>
  </div>`;
}

export function renderRegionsStep(seeds: Seeds, hasMap: boolean): string {
  if (!seeds.states.length)
    return `<p>${t("Add countries in the previous step first; here you divide each into provinces.")}</p>`;
  regionCountry = Math.min(regionCountry, seeds.states.length - 1);
  const tabs = seeds.states
    .map((state, index) => {
      const active = index === regionCountry ? "active" : "";
      return `<button data-region-country="${index}" class="${active}" style="border-color: ${countryColor(state, index)}">${value(state.name || `${t("Country")} ${index + 1}`)}</button>`;
    })
    .join("");
  const biomes = Biomes.getDefault()
    .filter(biome => biome?.name)
    .map(biome => [String(biome.i), biome.name] as [string, string]);
  const rows = seeds.provinces
    .map((province, index) => ({ province, index }))
    .filter(({ province }) => province.state === regionCountry)
    .map(({ province, index }) => renderProvince(province, index, biomes))
    .join("");

  return /* html */ `
    <div class="regionTabs">${tabs}</div>
    ${renderSketch(seeds, "regions", hasMap)}
    <h3>${t("Provinces")} <button data-add="province">+ ${t("Province")}</button></h3>
    <p class="hint">${t("Place each province. Its land, climate, water and nature follow your choices; automatic leaves it to the generator.")}</p>
    ${rows}`;
}

function renderProvince(province: ProvinceSeed, index: number, biomes: [string, string][]): string {
  const biomeOptions = biomes
    .map(
      ([id, name]) =>
        `<option value="${id}" ${String(province.biome) === id ? "selected" : ""}>${escapeHtml(name)}</option>`
    )
    .join("");
  return /* html */ `<div class="provinceCard" data-province="${index}">
    <div class="placeRow">
      <input data-prop="name" placeholder="${t("Province name")}" value="${value(province.name)}" />
      ${placeButton(`province:${index}`, true)}
      <button data-remove="province:${index}">${t("Remove")}</button>
    </div>
    <div class="attrs">
      <label>${t("Relief")} <select data-prop="relief">${options(RELIEFS, RELIEF_LABELS, province.relief, t("Automatic"))}</select></label>
      <label>${t("Climate")} <select data-prop="climate">${options(CLIMATES, CLIMATE_LABELS, province.climate, t("Automatic"))}</select></label>
      <label>${t("Water")} <select data-prop="water">${options(WATERS, WATER_LABELS, province.water, t("Automatic"))}</select></label>
      <label>${t("Nature")} <select data-prop="biome"><option value="">${t("Automatic")}</option>${biomeOptions}</select></label>
    </div>
  </div>`;
}

// the continent whose reach holds a spot, the nearest one when several do
function continentAt(seeds: Seeds, { x, y }: { x: number; y: number }): number | undefined {
  const { width, height } = globalThis.options.generation.graph;
  const side = Math.min(width, height);
  let best: number | undefined;
  let bestShare = 1;
  for (const [index, continent] of seeds.continents.entries()) {
    const distance = Math.hypot(((x - continent.x) / 100) * width, ((y - continent.y) / 100) * height);
    const share = distance / (CONTINENT_RADIUS[continent.size] * side);
    if (share < bestShare) [best, bestShare] = [index, share];
  }
  return best;
}

/** Wire the places of the step on screen; structure changes redraw the wizard, typed values update the seeds */
export function bindPlaces(root: HTMLElement, seeds: Seeds, rerender: () => void): void {
  drawMapPreview(root);

  root.querySelector<HTMLElement>(".sketch")?.addEventListener("click", event => {
    if (!placing) return void tip(t("Choose 📍 on an item first"), false, "warn");
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const spot = {
      x: Math.round(((event.clientX - box.left) / box.width) * 1000) / 10,
      y: Math.round(((event.clientY - box.top) / box.height) * 1000) / 10
    };
    if (placing.kind === "continent") Object.assign(seeds.continents[placing.index], spot);
    else if (placing.kind === "country") {
      const state = seeds.states[placing.index];
      Object.assign(state, spot);
      const continent = continentAt(seeds, spot);
      if (continent !== undefined) state.continent = continent;
    } else if (placing.kind === "province") Object.assign(seeds.provinces[placing.index], spot);
    else {
      const city = seeds.states[placing.index]?.cities?.[placing.city];
      if (city) Object.assign(city, spot);
    }
    placing = null;
    rerender();
  });
  root.querySelector('[data-action="cancelPlace"]')?.addEventListener("click", () => {
    placing = null;
    rerender();
  });

  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-place]"))
    button.addEventListener("click", () => {
      const [kind, index, city] = (button.dataset.place ?? "").split(":");
      placing =
        kind === "city"
          ? { kind: "city", index: Number(index), city: Number(city) }
          : ({ kind, index: Number(index) } as Placing);
      rerender();
    });

  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-add]"))
    button.addEventListener("click", () => add(seeds, button.dataset.add ?? "", rerender));
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-remove]"))
    button.addEventListener("click", () => {
      remove(seeds, button.dataset.remove ?? "");
      rerender();
    });
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-region-country]"))
    button.addEventListener("click", () => {
      regionCountry = Number(button.dataset.regionCountry);
      placing = null;
      rerender();
    });

  root.querySelector<HTMLSelectElement>("[data-sizing]")?.addEventListener("change", event => {
    setSizing(seeds, (event.target as HTMLSelectElement).value as Seeds["sizing"]);
    rerender();
  });

  for (const row of root.querySelectorAll<HTMLElement>("[data-continent]")) {
    const continent = seeds.continents[Number(row.dataset.continent)];
    bindProps(row, prop => (raw: string) => {
      if (prop === "name") continent.name = raw.trim();
      else if (prop === "size") {
        continent.size = raw as (typeof CONTINENT_SIZES)[number];
        rerender();
      }
    });
  }

  for (const card of root.querySelectorAll<HTMLElement>("[data-country]")) {
    const index = Number(card.dataset.country);
    const state = seeds.states[index];
    bindProps(card, prop => (raw: string) => setCountryProp(state, prop, raw, rerender));
    for (const box of card.querySelectorAll<HTMLInputElement>("[data-neighbor]"))
      box.addEventListener("change", () => setNeighbor(seeds, index, Number(box.dataset.neighbor), box.checked));
    for (const row of card.querySelectorAll<HTMLElement>("[data-city]")) {
      const city = state.cities?.[Number(row.dataset.city)];
      row.querySelector<HTMLInputElement>('[data-city-prop="name"]')?.addEventListener("input", event => {
        if (city) city.name = (event.target as HTMLInputElement).value.trim();
      });
    }
    card.querySelector(`[data-emblem="${index}"]`)?.addEventListener("click", () => {
      void Controllers.IconPicker.open({
        current: state.emblem ?? "",
        preferCustom: true,
        profile: "emblem",
        onPick: (icon: string) => {
          if (icon) state.emblem = icon;
          rerender();
        }
      });
    });
    card.querySelector(`[data-clear-emblem="${index}"]`)?.addEventListener("click", () => {
      delete state.emblem;
      rerender();
    });
    card.querySelector(`[data-add-now="${index}"]`)?.addEventListener("click", () => addNow(seeds, index));
  }

  for (const row of root.querySelectorAll<HTMLElement>("[data-province]")) {
    const province = seeds.provinces[Number(row.dataset.province)];
    bindProps(row, prop => (raw: string) => setProvinceProp(province, prop, raw));
  }
}

// typed values: names on input, choices on change; a country's cities have their own handlers
function bindProps(root: HTMLElement, handler: (prop: string) => (raw: string) => void): void {
  for (const input of root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-prop]")) {
    if (input.closest("[data-city]")) continue;
    const event = input instanceof HTMLSelectElement || input.type === "color" ? "change" : "input";
    input.addEventListener(event, () => handler(input.dataset.prop ?? "")(input.value));
  }
}

function setCountryProp(state: StateSeed, prop: string, raw: string, rerender: () => void): void {
  const text = raw.trim();
  if (prop === "name") state.name = text;
  else if (prop === "color") {
    state.color = raw;
    rerender();
  } else if (prop === "capital" || prop === "form") {
    if (text) state[prop] = text;
    else delete state[prop];
  } else if (prop === "size") {
    state.size = raw as StateSeed["size"];
    rerender();
  } else if (prop === "area") {
    const area = Number(raw);
    if (!(area >= COUNTRY_AREA.min && area <= COUNTRY_AREA.max))
      return void tip(t("This value is out of range"), false, "error");
    state.area = area;
    rerender();
  } else if (prop === "continent" || prop === "language") {
    if (text === "") delete state[prop];
    else state[prop] = Number(text);
  }
}

function setSizing(seeds: Seeds, sizing: Seeds["sizing"]): void {
  if (sizing === "area") {
    seeds.sizing = "area";
    for (const state of seeds.states) state.area ??= AREA_OF_SIZE[state.size ?? "medium"];
  } else {
    delete seeds.sizing;
    for (const state of seeds.states) {
      const area = state.area ?? COUNTRY_AREA.default;
      state.size = area < 3 ? "small" : area < 6 ? "medium" : "large";
    }
  }
}

function setProvinceProp(province: ProvinceSeed, prop: string, raw: string): void {
  if (prop === "name") province.name = raw.trim();
  else if (prop === "biome") {
    if (raw === "") delete province.biome;
    else province.biome = Number(raw);
  } else if (prop === "relief" || prop === "climate" || prop === "water") {
    if (raw === "") delete province[prop];
    else Object.assign(province, { [prop]: raw });
  }
}

// a border is shared: ticking it on one country ticks it on the other
function setNeighbor(seeds: Seeds, a: number, b: number, on: boolean): void {
  const link = (from: number, to: number) => {
    const state = seeds.states[from];
    const list = new Set(state.neighbors ?? []);
    if (on) list.add(to);
    else list.delete(to);
    if (list.size) state.neighbors = [...list].sort((x, y) => x - y);
    else delete state.neighbors;
  };
  link(a, b);
  link(b, a);
}

function add(seeds: Seeds, what: string, rerender: () => void): void {
  const [kind, index] = what.split(":");
  if (kind === "continent") {
    seeds.continents.push({ name: "", x: 50, y: 50, size: "medium" });
    placing = { kind: "continent", index: seeds.continents.length - 1 };
  } else if (kind === "country") {
    const continent = seeds.continents.length === 1 ? 0 : undefined;
    const size = seeds.sizing === "area" ? { area: COUNTRY_AREA.default } : { size: "medium" as const };
    seeds.states.push({ name: "", x: 50, y: 50, ...size, ...(continent === undefined ? {} : { continent }) });
    placing = { kind: "country", index: seeds.states.length - 1 };
  } else if (kind === "city") {
    const state = seeds.states[Number(index)];
    state.cities = [...(state.cities ?? []), { name: "", x: state.x, y: state.y }];
    placing = { kind: "city", index: Number(index), city: state.cities.length - 1 };
  } else if (kind === "province") {
    const state = seeds.states[regionCountry];
    seeds.provinces.push({ name: "", state: regionCountry, x: state.x, y: state.y });
    placing = { kind: "province", index: seeds.provinces.length - 1 };
  }
  rerender();
}

// removing shifts the indexes later items point at
function remove(seeds: Seeds, what: string): void {
  const [kind, a, b] = what.split(":").map((part, i) => (i ? Number(part) : part)) as [string, number, number];
  placing = null;
  if (kind === "continent") {
    seeds.continents.splice(a, 1);
    for (const state of seeds.states) {
      if (state.continent === a) delete state.continent;
      else if (state.continent !== undefined && state.continent > a) state.continent--;
    }
  } else if (kind === "country") {
    seeds.states.splice(a, 1);
    seeds.provinces = seeds.provinces.filter(province => province.state !== a);
    for (const province of seeds.provinces) if (province.state > a) province.state--;
    for (const state of seeds.states) {
      if (!state.neighbors) continue;
      state.neighbors = state.neighbors.filter(i => i !== a).map(i => (i > a ? i - 1 : i));
      if (!state.neighbors.length) delete state.neighbors;
    }
  } else if (kind === "city") seeds.states[a]?.cities?.splice(b, 1);
  else if (kind === "province") seeds.provinces.splice(a, 1);
}

function addNow(seeds: Seeds, index: number): void {
  const state = seeds.states[index];
  if (!state.name) return void tip(t("Name it first"), false, "error");
  try {
    const planted = cleanSeeds(seeds);
    const cleanIndex = planted.states.findIndex(item => item.name === state.name && item.x === state.x);
    Additions.addCountry(planted, cleanIndex);
    Layers.drawAll();
    tip(t("{{name}} was added to the map", { name: state.name }), true, "success");
  } catch (error) {
    tip((error as Error).message, false, "error");
  }
}

// the map on screen behind the sketch, so new countries can be placed on it
function drawMapPreview(root: HTMLElement): void {
  const canvas = root.querySelector<HTMLCanvasElement>(".sketchMap");
  const context = canvas?.getContext("2d");
  if (!canvas || !context || !pack.cells?.h) return;
  const { width, height } = globalThis.options.map.graph;
  const scaleX = canvas.width / width;
  const scaleY = canvas.height / height;
  context.fillStyle = "#9bb5c0";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const cell of pack.cells.i) {
    if (pack.cells.h[cell] < 20) continue;
    const [x, y] = pack.cells.p[cell];
    context.fillStyle = pack.cells.state[cell] ? (pack.states[pack.cells.state[cell]].color ?? "#c8b88a") : "#d8cfa8";
    context.fillRect(x * scaleX - 2, y * scaleY - 2, 4, 4);
  }
}
