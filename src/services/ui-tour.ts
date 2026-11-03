import { type DriveStep, driver } from "driver.js";

import { closePanel, openPanel } from "@/app/chrome/options-panel";
import { ensureEl } from "@/utils/node-utils";
import "driver.js/dist/driver.css";
import { App } from "@/ui/app-commands";
import { Dialog } from "@/ui/dialog/dialog";
import { t } from "@/utils/i18n";

function closeOptionsPanel() {
  const options = ensureEl("options");
  if (options && options.style.display !== "none") {
    ensureEl("optionsHide")?.click();
  }
}

let activeTour: ReturnType<typeof driver> | null = null;

function start() {
  if (activeTour?.isActive()) return;
  closeOptionsPanel();

  const tour = driver({
    showProgress: true,
    allowClose: true,
    popoverClass: "fmg-tour",
    overlayColor: "rgb(0,0,0)",
    overlayOpacity: 0.75,
    stagePadding: 4,
    stageRadius: 4,
    onPopoverRender: popover => {
      Object.assign(popover.wrapper.style, {
        backgroundColor: "#ffffff",
        color: "#000000",
        border: "1px solid #cccccc",
        fontFamily: "Georgia, serif"
      });
      popover.title.style.color = "#000000";
      popover.title.style.borderBottomColor = "#cccccc";
      popover.progress.style.color = "#666666";
      popover.closeButton.style.color = "#000000";
      for (const btn of [popover.previousButton, popover.nextButton]) {
        Object.assign(btn.style, {
          backgroundColor: "#f0f0f0",
          border: "1px solid #cccccc",
          color: "#000000"
        });
      }
    },
    onDestroyed: () => {
      activeTour = null;
      document.removeEventListener("keydown", handleKeydown);
      hideHeightmapCustomizationPanel();
      Dialog.closeAll();
      closeOptionsPanel();
    },
    steps: browsingSteps([
      {
        popover: {
          title: t("Welcome to Fantasy Cartography"),
          description: t(
            "This quick tour covers the essential controls. Use Next/Previous to navigate, or press Esc to exit at any time."
          )
        }
      },
      {
        element: "#map",
        popover: {
          title: t("Navigate the Map"),
          description: t(
            "Scroll the mouse wheel to zoom in and out. Click and drag on the map to pan. Double-click a location to center on it."
          ),
          onNextClick: () => {
            document.body.classList.add("tour-free-roam");
            advanceTour(tour);
          }
        }
      },
      {
        element: "#tooltip",
        onHighlightStarted: () => {
          document.body.classList.add("tour-free-roam");
        },
        popover: {
          title: t("Hover Tooltips"),
          description: t(
            "Move your mouse over the map (when the tour is over), the tooltip bar at the bottom updates with information about cells, burgs, states, and more. Click Next when you're ready to continue."
          ),
          side: "top",
          align: "center"
        }
      },
      // ── Layers tab ──────────────────────────────────────────────────────────
      {
        element: "#layersTab",
        onHighlightStarted: () => {
          openPanel("layers");
        },
        popover: {
          title: t("Layers"),
          description: t("This icon in the bottom bar opens the layers: which map elements are visible on the map."),
          side: "top"
        }
      },
      {
        element: "#layersPreset",
        onHighlightStarted: () => {
          openPanel("layers");
        },
        popover: {
          title: t("Layer Presets"),
          description: t(
            "Choose a preset to instantly show or hide common layer combinations: Political, Physical, Biomes, and more."
          ),
          side: "bottom"
        }
      },
      {
        element: "#mapLayers",
        onHighlightStarted: () => {
          openPanel("layers");
        },
        popover: {
          title: t("Toggle Individual Layers"),
          description: t(
            "Click any layer name to toggle it on or off. The button at the end of the preset row changes the layer order."
          ),
          side: "top"
        }
      },

      // ── Style tab ────────────────────────────────────────────────────────────
      {
        element: "#styleTab",
        onHighlightStarted: () => {
          openPanel("style");
        },
        popover: {
          title: t("Style"),
          description: t(
            "This icon in the bottom bar opens the style: the visual appearance of the map — color schemes, opacity, line weights, and other properties for each map element."
          ),
          side: "top"
        }
      },
      {
        element: "#stylePreset",
        onHighlightStarted: () => {
          openPanel("style");
        },
        popover: {
          title: t("Style Presets"),
          description: t(
            "Click to open the preset gallery and pick a color scheme for the map. The entire map's color palette updates instantly."
          ),
          side: "bottom"
        }
      },
      {
        element: "#styleElementSelect",
        onHighlightStarted: () => {
          openPanel("style");
        },
        popover: {
          title: t("Individual Style Settings"),
          description: t(
            "Select a specific map element from this dropdown to adjust its colors, opacity, stroke width, and other visual properties."
          ),
          side: "bottom"
        }
      },

      // ── World Wizard and settings ───────────────────────────────────────────
      {
        element: "#wizardButton",
        onHighlightStarted: () => {
          closePanel();
        },
        popover: {
          title: t("World Wizard"),
          description: t(
            "Set up the next map step by step: its size, terrain and climate, the continents and countries, and each country's regions."
          ),
          side: "top"
        }
      },
      {
        element: "#interfaceContent",
        onHighlightStarted: () => {
          openPanel("settings");
        },
        popover: {
          title: t("Interface settings"),
          description: t(
            "The gear in the bottom bar holds this browser's preferences: language, interface size, theme, autosave and more."
          ),
          side: "top",
          onNextClick: () => {
            openPanel("edit");
            advanceTour(tour);
          }
        }
      },

      // ── Edit, Add and Regenerate ──────────────────────────────────────────────
      {
        element: "#editContent",
        onHighlightStarted: () => {
          openPanel("edit");
        },
        popover: {
          title: t("Edit"),
          description: t(
            "The pencil in the bottom bar opens the map's editors, by subject: terrain and nature, countries, economy, annotations and the whole map. The icons beside it add things to the map, regenerate it or parts of it, and export, save and load it."
          ),
          side: "top"
        }
      },
      {
        element: "#editHeightmapButton",
        onHighlightStarted: () => {
          openPanel("edit");
        },
        popover: {
          title: t("Edit Heightmap"),
          description: t(
            "Open the Heightmap editor to manually sculpt terrain by raising or lowering elevation. Changes here reshape coastlines, rivers, and biomes."
          ),
          side: "top",
          onNextClick: () => {
            closePanel();
            advanceTour(tour);
          }
        }
      },
      {
        element: "#heightmapMenu",
        disableActiveInteraction: false,
        onHighlightStarted: () => {
          App.setCustomizationMenu(true);
          ensureEl("heightmapMenu").style.display = "block";
        },
        onDeselected: () => {
          hideHeightmapCustomizationPanel();
        },
        popover: {
          title: t("Heightmap Editor"),
          description: t(
            "The Heightmap editor panel lets you paint terrain directly on the map. You can raise or lower land, apply templates, convert an image into a heightmap, or preview the terrain in 3D."
          ),
          side: "right"
        }
      },

      // ── About ────────────────────────────────────────────────────────────────
      {
        element: "#aboutContent",
        onHighlightStarted: () => {
          openPanel("about");
        },
        popover: {
          title: t("About"),
          description: t("What this app is and the generator it is built on."),
          side: "top",
          onNextClick: () => {
            closePanel();
            advanceTour(tour);
          }
        }
      },

      // ── Export / Save / Load ─────────────────────────────────────────────────
      {
        element: "#exportButton",
        onHighlightStarted: () => {
          Dialog.closeAll();
          openPanel("file");
        },
        popover: {
          title: t("Export"),
          description: t(
            "Click Export to open the export dialog where you can download the map as an SVG, PNG, or JPEG image, split it into tiles, or export the world data as JSON."
          ),
          side: "top",
          onNextClick: () => {
            advanceTour(tour);
          }
        }
      },
      {
        element: "#exportMapData",
        disableActiveInteraction: false,
        onHighlightStarted: () => {
          App.showExportPane();
        },
        popover: {
          title: t("Export Options"),
          description: t(
            "Download the map as a vector SVG, raster PNG or JPEG, or tiled PNG set. You can also export the full world data as JSON for use in other tools."
          ),
          side: "top",
          onNextClick: () => {
            Dialog.closeAll();
            advanceTour(tour);
          }
        }
      },
      {
        element: "#saveButton",
        onHighlightStarted: () => {
          openPanel("file");
        },
        popover: {
          title: t("Save and Load Maps"),
          description: t(
            "Click Save to download a .map file preserving your entire world. Click Load to open a previously saved file and continue where you left off."
          ),
          side: "top",
          onNextClick: () => {
            tour.destroy();
            closePanel();
          }
        }
      }
    ])
  });

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    return !!target.closest("input, textarea, select, [contenteditable], [contenteditable='plaintext-only']");
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (!tour.isActive() || isEditableTarget(e.target)) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      document.querySelector<HTMLElement>(".driver-popover-next-btn")?.click();
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      document.querySelector<HTMLElement>(".driver-popover-prev-btn")?.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      tour.destroy();
    }
  }

  activeTour = tour;
  document.addEventListener("keydown", handleKeydown);
  tour.drive();
}

// the tabs a view-only map hides and the Save it disables
const EDITING_STEPS = [
  "#styleTab",
  "#stylePreset",
  "#styleElementSelect",
  "#wizardButton",
  "#editContent",
  "#editHeightmapButton",
  "#heightmapMenu",
  "#saveButton"
];

function browsingSteps(steps: DriveStep[]): DriveStep[] {
  if (!options.map.viewOnly) return steps;
  return steps.filter(step => typeof step.element !== "string" || !EDITING_STEPS.includes(step.element));
}

function hideHeightmapCustomizationPanel() {
  const heightmapMenu = ensureEl("heightmapMenu");
  if (heightmapMenu.style.display !== "block") return;
  heightmapMenu.style.display = "none";
  if (options.app.mode !== "heightmap") App.setCustomizationMenu(false);
}

// Let the browser finish the click before Driver.js replaces its popover. Several tour steps
// open or close panels in their callback, and replacing the clicked button during dispatch can
// leave Playwright (and real pointer users) waiting on a moving target.
function advanceTour(tour: ReturnType<typeof driver>): void {
  setTimeout(() => {
    if (tour.isActive()) tour.moveNext();
  });
}

export const UiTour = { start };
