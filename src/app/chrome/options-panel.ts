// The collapsible panel on the right and the sticked menu below it, and the bottom bar: its icons open the layers,
// the view mode, the style editor and the interface settings in a panel above it
import { showExportPane, showLoadPane, showSavePane } from "@/app/chrome/io-panes";
import { regeneratePrompt } from "@/app/lifecycle";
import { Controllers } from "@/controllers";
import { ARROW_TIP_KEY } from "@/services/versioning";
import { makeDraggable } from "@/ui/draggable";
import { resetZoom } from "@/ui/map/zoom";
import { clearMainTip } from "@/ui/tooltips";
import { changeViewMode } from "@/ui/view-mode-switch";
import { t } from "@/utils/i18n";
import { ensureEl, findEl } from "@/utils/node-utils";

const TAB_CONTENT: Record<string, string> = {
  toolsTab: "toolsContent"
};

function showOptions(event?: Event): void {
  if (!localStorage.getItem(ARROW_TIP_KEY)) {
    clearMainTip();
    localStorage.setItem(ARROW_TIP_KEY, "true");
    ensureEl("optionsTrigger").classList.remove("glow");
  }

  ensureEl("regenerate").style.display = "none";
  ensureEl("options").style.display = "block";
  ensureEl("optionsTrigger").style.display = "none";
  event?.stopPropagation();
}

export function hideOptions(event?: Event): void {
  ensureEl("options").style.display = "none";
  ensureEl("optionsTrigger").style.display = "block";
  event?.stopPropagation();
}

export function toggleOptions(event?: Event): void {
  if (ensureEl("options").style.display === "none") showOptions(event);
  else hideOptions(event);
}

const PANELS: Record<string, { content: string; title: () => string }> = {
  layers: { content: "layersContent", title: () => t("Layers") },
  view: { content: "viewContent", title: () => t("View mode") },
  style: { content: "styleContent", title: () => t("Style") },
  edit: { content: "editContent", title: () => t("Edit") },
  add: { content: "addContent", title: () => t("Add") },
  regenerate: { content: "regenerateContent", title: () => t("Regenerate") },
  settings: { content: "interfaceContent", title: () => t("Interface settings") },
  about: { content: "aboutContent", title: () => t("About") }
};
// the bottom bar took over these tabs; commands and the style editor still open them by their old ids
const PANEL_OF_TAB: Record<string, string> = { layersTab: "layers", styleTab: "style", aboutTab: "about" };

let openPanelName: string | null = null;

/** Show a bottom panel, or close it when it is already open */
export function togglePanel(name: string): void {
  if (openPanelName === name) closePanel();
  else openPanel(name);
}

export function openPanel(name: string): void {
  const panel = PANELS[name];
  if (!panel || openPanelName === name) return; // the style editor reopens its panel when it opens
  if (openPanelName === "style" && name !== "style") void Controllers.StyleEditor.close();
  openPanelName = name;
  for (const content of ensureEl("bottomPanel").querySelectorAll<HTMLElement>(".panelcontent"))
    content.style.display = content.id === panel.content ? "block" : "none";
  for (const button of ensureEl("bottomBar").querySelectorAll<HTMLElement>("[data-panel]"))
    button.classList.toggle("active", button.dataset.panel === name);
  ensureEl("bottomPanelTitle").textContent = panel.title();
  ensureEl("bottomPanel").style.display = "block";
  document.body.classList.add("panel-open");
  if (name === "style") void Controllers.StyleEditor.open();
}

export function closePanel(): void {
  if (openPanelName === "style") void Controllers.StyleEditor.close();
  openPanelName = null;
  ensureEl("bottomPanel").style.display = "none";
  document.body.classList.remove("panel-open");
  for (const button of ensureEl("bottomBar").querySelectorAll<HTMLElement>("[data-panel]"))
    button.classList.remove("active");
}

/** Open the panel on the given tab */
export function openTab(id: string): void {
  const panel = PANEL_OF_TAB[id];
  if (panel) return void openPanel(panel);
  showOptions();
  selectTab(id);
}

/** Show the clicked tab, hiding whichever was open. Tools swaps in the customization menu instead */
function selectTab(id: string): void {
  const active = ensureEl("options").querySelector(".tab > button.active");
  if (active?.id === id) return;

  active?.classList.remove("active");
  ensureEl(id).classList.add("active");
  for (const content of ensureEl("options").querySelectorAll<HTMLElement>(".tabcontent")) {
    content.style.display = "none";
  }

  const shown = id === "toolsTab" && options.app.mode === "heightmap" ? "heightmapMenu" : TAB_CONTENT[id];
  if (shown) ensureEl(shown).style.display = "block";
}

/** Keep every `<x>Input` and its `<x>Output` showing the same value */
function onPanelInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  if (target.closest("[data-option]")) return;
  const { id, value } = target;

  if (id.endsWith("Input")) {
    const output = findEl<HTMLOutputElement>(`${id.slice(0, -5)}Output`);
    if (output) output.value = value;
  } else if (id.endsWith("Output")) {
    const input = findEl<HTMLInputElement>(`${id.slice(0, -6)}Input`);
    if (input) input.value = value;
  }
}

function initialize(): void {
  makeDraggable(ensureEl("optionsContainer"), ".drag-trigger");
  makeDraggable(ensureEl("heightmapFinalize"), "div");

  if (localStorage.getItem(ARROW_TIP_KEY)) {
    clearMainTip();
    ensureEl("optionsTrigger").classList.remove("glow");
  }

  const trigger = ensureEl("optionsTrigger");
  trigger.addEventListener("mouseenter", () => {
    if (trigger.classList.contains("glow")) return;
    if (ensureEl("options").style.display === "none") ensureEl("regenerate").style.display = "block";
  });
  ensureEl("collapsible").addEventListener("mouseleave", () => {
    ensureEl("regenerate").style.display = "none";
  });

  ensureEl("options")
    .querySelector("div.tab")
    ?.addEventListener("click", event => {
      const target = event.target as HTMLElement;
      if (target.tagName === "BUTTON") selectTab(target.id);
    });

  for (const id of ["options", "dialogs", "bottomPanel"]) {
    ensureEl(id).addEventListener("input", onPanelInput);
  }

  ensureEl("sticked").addEventListener("click", event => {
    const id = (event.target as HTMLElement).id;
    if (id === "newMapButton") regeneratePrompt();
    else if (id === "saveButton") showSavePane();
    else if (id === "exportButton") showExportPane();
    else if (id === "loadButton") void showLoadPane();
    else if (id === "zoomReset") resetZoom(1000);
    else if (id === "searchButton") Controllers.Omnibar.open();
  });

  ensureEl("viewMode").addEventListener("click", changeViewMode);
  ensureEl("optionsTrigger").addEventListener("click", showOptions);
  ensureEl("regenerate").addEventListener("click", () => regeneratePrompt());
  ensureEl("optionsHide").addEventListener("click", hideOptions);
  ensureEl("bottomBar").addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (button?.dataset.panel) togglePanel(button.dataset.panel);
    else if (button?.id === "wizardButton") {
      closePanel();
      Controllers.WorldWizard.open();
    }
  });
  ensureEl("bottomPanelClose").addEventListener("click", closePanel);
}

initialize();
