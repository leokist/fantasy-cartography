// The map's tools, each group in a panel of its own bottom-bar icon: Edit, Add, Regenerate and File, with Show
// under the eye. Every button dispatches the same command as global search, by its id
import { closePanel } from "@/app/chrome/options-panel";
import { MAP_COMMANDS } from "@/app/map-commands";
import { tip } from "@/ui/tooltips";
import { sentences, t } from "@/utils/i18n";
import { ensureEl } from "@/utils/node-utils";

const EDIT = /* html */ `
  <div class="separator">${t("Terrain and nature")}</div>
  <div class="grid">
    <button
      id="editHeightmapButton"
      data-tip="${t("Click to open Heightmap customization menu")}"
      data-shortcut="Shift + H"
    >
      ${t("Heightmap")}
    </button>
    <button id="editBiomesButton" data-tip="${t("Biomes Editor")}" data-shortcut="Shift + B">
      ${t("Biomes")}
    </button>
    <button
      id="editCoastlineSettings"
      data-tip="${t("Coastline Settings")}"
    >
      ${t("Coastlines")}
    </button>
    <button id="overviewFeaturesButton" data-tip="${t("Geographical Features Overview")}" data-shortcut="Shift + F">
      ${t("Features")}
    </button>
    <button id="overviewRiversButton" data-tip="${t("Rivers Overview")}" data-shortcut="Shift + V">
      ${t("Rivers")}
    </button>
    <button id="editSpeciesButton" data-tip="${t("Fauna and Flora")}">${t("Fauna & Flora")}</button>
  </div>
  <div class="separator">${t("Countries")}</div>
  <div class="grid">
    <button id="editStatesButton" data-tip="${t("States Editor")}" data-shortcut="Shift + S">
      ${t("States")}
    </button>
    <button id="editProvincesButton" data-tip="${t("Provinces Editor")}" data-shortcut="Shift + P">
      ${t("Provinces")}
    </button>
    <button id="overviewBurgsButton" data-tip="${t("Burgs Overview")}" data-shortcut="Shift + T">
      ${t("Burgs")}
    </button>
    <button id="editEmblemButton" data-tip="${t("Edit Emblem")}" data-shortcut="Shift + Y">
      ${t("Emblems")}
    </button>
    <button id="editNamesBaseButton" data-tip="${t("Namesbase Editor")}" data-shortcut="Shift + N">
      ${t("Namesbase")}
    </button>
  </div>
  <div class="separator">${t("Economy")}</div>
  <div class="grid">
    <button id="editGoods" data-tip="${t("Goods Editor")}" data-shortcut="Shift + G">${t("Goods")}</button>
    <button id="overviewMarketsButton" data-tip="${t("Markets Overview")}">
      ${t("Markets")}
    </button>
    <button id="editTradeAnimationButton" data-tip="${t("Trade Animation Editor")}">
      ${t("Trade")}
    </button>
    <button id="overviewRoutesButton" data-tip="${t("Routes Overview")}" data-shortcut="Shift + U">
      ${t("Routes")}
    </button>
  </div>
  <div class="separator">${t("Annotations")}</div>
  <div class="grid">
    <button id="overviewLabelsButton" data-tip="${t("Labels Overview")}" data-shortcut="Shift + L">
      ${t("Labels")}
    </button>
    <button id="overviewMarkersButton" data-tip="${t("Markers Overview")}" data-shortcut="Shift + K">
      ${t("Markers")}
    </button>
    <button id="editNotesButton" data-tip="${t("Notes Editor")}" data-shortcut="Shift + O">${t("Notes")}</button>
    <button id="overviewJourneysButton" data-tip="${t("Journeys Overview")}" data-shortcut="Shift + J">
      ${t("Journeys")}
    </button>
    <button id="editZonesButton" data-tip="${t("Zones Editor")}" data-shortcut="Shift + Z">${t("Zones")}</button>
    <button id="editMeasurersButton" data-tip="${t("Measurers Editor")}" data-shortcut="Shift + =">
      ${t("Measurers")}
    </button>
    <button id="editUnitsButton" data-tip="${t("Units Editor")}" data-shortcut="Shift + Q">${t("Units")}</button>
  </div>
  <div class="separator">${t("Whole map")}</div>
  <div class="grid">
    <button id="openSubmapTool" data-tip="${t("Click to generate a submap from the current viewport")}">${t("Submap")}</button>
    <button id="openTransformTool" data-tip="${t("Click to transform the map")}">${t("Transform")}</button>
    <button id="openWrapTool" data-tip="${t("Adjust cell shapes with a brush")}">${t("Wrap")}</button>
    <button id="zoomReset" data-tip="${t("Reset map zoom")}" data-shortcut="0 (zero)">${t("Zoom Out", { context: "button" })}</button>
  </div>
`;

const ADD = /* html */ `
  <div id="addFeature" class="grid">
    <button
      id="addBurgTool"
      data-tip="${sentences(t("Click on map to place a burg"), t("Hold Shift to add multiple"))}"
      data-shortcut="Shift + 1"
    >
      ${t("Burg")}
    </button>
    <button
      id="addLabel"
      data-tip="${sentences(t("Click on map to place label"), t("Hold Shift to add multiple"))}"
      data-shortcut="Shift + 2"
    >
      ${t("Label")}
    </button>
    <button
      id="addMarker"
      data-tip="${sentences(t("Click on map to place a marker"), t("Hold Shift to add multiple"))}"
      data-shortcut="Shift + 3"
    >
      ${t("Marker")}
    </button>
    <input type="hidden" id="addedMarkerType" name="addedMarkerType" value="" />
    <button
      id="addRiver"
      data-tip="${sentences(t("Click on map to place a river"), t("Hold Shift to add multiple"))}"
      data-shortcut="Shift + 4"
    >
      ${t("River")}
    </button>
    <button id="addRoute" data-tip="${t("Open route creation dialog")}" data-shortcut="Shift + 5">${t("Route")}</button>
  </div>
`;

const REGENERATE = /* html */ `
  <div class="grid">
    <button id="newMap" data-tip="${t("Generate a new map based on options")}" data-shortcut="F2">${t("New Map")}</button>
  </div>
  <div class="separator">${t("Parts of the map")}</div>
  <div id="regenerateFeature" class="grid">
    <button
      id="regenerateBurgs"
      data-tip="${sentences(t("Click to regenerate all unlocked burgs and routes"), t("States will remain as they are"), t("Note: burgs are only generated in populated areas"))}"
    >
      ${t("Burgs")}
    </button>
    <button
      id="regenerateEconomy"
      data-tip="${t("Rebuild market territories, production, trade deals, and taxes from the current goods and markets")}"
    >
      ${t("Economy")}
    </button>
    <button id="regenerateEmblems" data-tip="${t("Click to regenerate all emblems")}">${t("Emblems")}</button>
    <button id="regenerateGoods" data-tip="${t("Regenerate bonus goods placement")}">${t("Goods")}</button>
    <button id="regenerateIce" data-tip="${t("Click to regenerate icebergs and glaciers")}">${t("Ice")}</button>
    <button
      id="regenerateStateLabels"
      data-tip="${t("Click to update state labels placement based on current borders")}"
    >
      ${t("State Labels")}
    </button>
    <button id="regenerateMarkers" data-tip="${t("Click to configure markers generation and regenerate unlocked markers")}">
      ${t("Markers")}
    </button>
    <button id="regenerateMarkets" data-tip="${t("Regenerate markets and their territories")}">
      ${t("Markets")}
    </button>
    <button id="regeneratePopulation" data-tip="${t("Click to recalculate rural and urban population")}">
      ${t("Population")}
    </button>
    <button
      id="regenerateProduction"
      data-tip="${t("Regenerate production and trade deals")}"
    >
      ${t("Production")}
    </button>
    <button
      id="regenerateProvinces"
      data-tip="${sentences(t("Click to select states and regenerate their non-locked provinces"), t("States will remain as they are"))}"
    >
      ${t("Provinces")}
    </button>
    <button
      id="regenerateReliefIcons"
      data-tip="${t("Click to regenerate all relief icons based on current cell biome and elevation")}"
    >
      ${t("Relief")}
    </button>
    <button id="regenerateRivers" data-tip="${t("Click to regenerate all rivers (restore default state)")}">
      ${t("Rivers")}
    </button>
    <button id="regenerateRoutes" data-tip="${t("Click to regenerate all unlocked routes")}">${t("Routes")}</button>
    <button
      id="regenerateStates"
      data-tip="${t("Click to regenerate non-locked states. Emblems will be regenerated as well, burgs will remain as they are, but capitals will be different")}"
    >
      ${t("States")}
    </button>
    <button
      id="regenerateZones"
      data-tip="${t("Click to regenerate zones. Hold Ctrl and click to set zones number multiplier")}"
    >
      ${t("Zones")}
    </button>
  </div>
`;

const SHOW = /* html */ `
  <div class="separator">${t("Show")}</div>
  <div class="grid">
    <button id="overviewCellsButton" data-tip="${t("Cell Details")}" data-shortcut="Shift + E">
      ${t("Cells")}
    </button>
    <button
      id="overviewChartsButton"
      data-tip="${t("Data Charts")}"
      data-shortcut="Shift + A"
    >
      ${t("Charts")}
    </button>
    <button id="openMinimapButton" data-tip="${t("Click to open minimap overview. Click minimap to center view")}">
      ${t("Minimap")}
    </button>
  </div>
`;

const FILE = /* html */ `
  <div class="grid">
    <button id="exportButton" data-tip="${t("Select format to download image or export map data")}">${t("Export")}</button>
    <button id="saveButton" data-tip="${t("Save fully-functional map file")}">${t("Save")}</button>
    <button id="loadButton" data-tip="${t("Load fully-functional map (.map or .gz formats)")}">${t("Load")}</button>
  </div>
`;

ensureEl("editContent").innerHTML = EDIT;
ensureEl("addContent").innerHTML = ADD;
ensureEl("regenerateContent").innerHTML = REGENERATE;
ensureEl("viewContent").insertAdjacentHTML("beforeend", SHOW);
ensureEl("fileContent").innerHTML = FILE;

for (const id of ["editContent", "addContent", "regenerateContent", "viewContent", "fileContent"])
  ensureEl(id).addEventListener("click", event => {
    if (!(event.target instanceof HTMLElement) || event.target.tagName !== "BUTTON") return;
    if (event.target.closest("#viewMode")) return; // the view mode buttons have their own handler
    const command = MAP_COMMANDS.find(command => command.id === (event.target as HTMLElement).id);
    if (!command) return;
    if (options.app.mode) return tip(t("Exit customization mode first"), false, "error");
    closePanel(); // out of the way of the map and of what the command opens
    void command.run(event);
  });
