// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Options } from "@/model/options/options-model";
import { Pins } from "@/model/options/pins";
import { Emblems } from "@/model/political/emblems-generator";
import { toggleAssistant } from "@/ui/assistant-bubble";
import { Dialog } from "@/ui/dialog/dialog";
import { setMapZoom, setZoomExtent } from "@/ui/map/zoom";

vi.mock("@/renderers/layers", () => ({ Layers: { draw: vi.fn() } }));
vi.mock("@/ui/map/zoom", () => ({
  applyZoomFontSize: vi.fn(),
  constrainZoom: vi.fn(),
  setMapZoom: vi.fn(),
  setTranslateExtent: vi.fn(),
  setZoomExtent: vi.fn()
}));
vi.mock("@/ui/map/canvas", () => ({
  applyZoomExtent: vi.fn(),
  fitMapToScreen: vi.fn(),
  setViewport: vi.fn()
}));
vi.mock("@/app/chrome/io-panes", () => ({
  showExportPane: vi.fn(),
  showLoadPane: vi.fn(),
  showSavePane: vi.fn()
}));
vi.mock("@/renderers/view-mode", () => ({ changeViewMode: vi.fn() }));
vi.mock("@/services/url-params", () => ({ copyMapURL: vi.fn() }));
vi.mock("@/ui/dialog/dialog", async importOriginal => {
  const { Dialog } = await importOriginal<typeof import("@/ui/dialog/dialog")>();
  return { Dialog: Object.assign(Dialog, { confirm: vi.fn() }) };
});
vi.mock("@/ui/assistant-bubble", () => ({ toggleAssistant: vi.fn() }));

let tab: typeof import("./interface-settings");
const control = (key: string): HTMLInputElement => document.querySelector(`[data-option="${key}"]`)!;
const edit = (input: HTMLInputElement, value: string, event = "input") => {
  input.value = value;
  input.dispatchEvent(new Event(event, { bubbles: true }));
};

beforeAll(async () => {
  vi.useFakeTimers();
  const html = readFileSync("src/index.html", "utf8");
  document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  document.body.insertAdjacentHTML("beforeend", '<div id="viewMode"></div>');
  vi.stubGlobal("pack", { cells: {}, cultures: [], states: [], provinces: [], burgs: [] });
  vi.stubGlobal("styles", { labels: { groups: { capital: { attrs: {} }, states: { attrs: {} } } } });
  await import("@/ui/elements/slider-input");
  await import("./tabs/heightmap-tab");
  tab = await import("./interface-settings");
  await import("@/app/chrome/options-panel");

  // Exercise the actual markup and listeners without relying on any option control ID.
  for (const [index, input] of document.querySelectorAll<HTMLElement>("[data-option]").entries()) {
    input.id = `renamed-control-${index}`;
  }
});

beforeEach(() => {
  localStorage.clear();
  options = Options.getDefaultOptions();
  tab.syncOptionInputs();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("interface settings bindings", () => {
  it("syncs the controls from the preferences", () => {
    options.app.autosave.interval = 27;
    tab.syncOptionInputs();
    expect(control("autosaveInterval").value).toBe("27");
  });

  it("writes and pins the heightmap controls outside the tab", () => {
    const inputs = document.querySelectorAll<HTMLInputElement>('[data-option="resolveDepressionsSteps"]');
    edit(inputs[1], "300", "change");

    expect(options.generation.resolveDepressionsSteps).toBe(300);
    expect(inputs[0].value).toBe("300");
    expect(Pins.valueOr("resolveDepressionsSteps", 0)).toBe(300);
  });

  it("applies select effects once, after updating the preference", () => {
    vi.mocked(toggleAssistant).mockImplementation(() => {
      expect(options.app.ui.assistant).toBe("hide");
    });
    edit(control("azgaarAssistant"), "hide");
    control("azgaarAssistant").dispatchEvent(new Event("change", { bubbles: true }));
    expect(toggleAssistant).toHaveBeenCalledExactlyOnceWith(false);
    expect(Pins.all()).toEqual({});
  });

  it("leaves the default voice selected while no voice preference is set", () => {
    const select = control("speakerVoice") as unknown as HTMLSelectElement;
    select.options.add(new Option("Albert", "0"));
    select.options.add(new Option("Daniel", "1"));
    select.value = "1"; // what loadVoices picked for this browser

    tab.syncOptionInputs();
    expect(select.value).toBe("1");

    options.app.ui.speakerVoice = "0";
    tab.syncOptionInputs();
    expect(select.value).toBe("0");
  });

  it("reshapes emblems once per selection", () => {
    const shape = vi.spyOn(Emblems, "setShape");
    edit(control("emblemShape"), "heater");
    control("emblemShape").dispatchEvent(new Event("change", { bubbles: true }));
    expect(shape).toHaveBeenCalledExactlyOnceWith("heater");
    expect(options.app.emblems.shape).toBe("heater");
  });

  it("normalizes zoom endpoints together on change", () => {
    control("zoomExtentMax").value = "10";
    edit(control("zoomExtentMin"), "15");
    expect(options.app.zoomExtent).toEqual({ min: 1, max: 20 });
    control("zoomExtentMin").dispatchEvent(new Event("change", { bubbles: true }));

    expect(options.app.zoomExtent).toEqual({ min: 10, max: 15 });
    expect(control("zoomExtentMin").value).toBe("10");
    expect(control("zoomExtentMax").value).toBe("15");
    expect(setZoomExtent).toHaveBeenCalledExactlyOnceWith(10, 15);
    expect(setMapZoom).toHaveBeenCalledExactlyOnceWith(15);
  });

  it("keeps theme controls and the displayed palette consistent", () => {
    edit(control("themeColor"), "#336699");
    edit(control("transparency"), "30");
    expect(options.app.ui.themeColor).toBe("#336699");
    expect(options.app.ui.transparency).toBe(30);
    expect(control("themeHue").value).toBe("210");
    expect(document.documentElement.style.getPropertyValue("--bg-opacity")).toBe("0.7");
  });

  it("still pairs unbound legacy controls by ID", () => {
    document
      .getElementById("dialogs")!
      .insertAdjacentHTML("beforeend", '<input id="legacyScaleInput" /><input id="legacyScaleOutput" />');
    edit(document.getElementById("legacyScaleInput") as HTMLInputElement, "3");
    expect((document.getElementById("legacyScaleOutput") as HTMLInputElement).value).toBe("3");
  });
});

describe("interface language", () => {
  const choose = (code: string) => {
    const select = document.getElementById("interfaceLanguage") as HTMLSelectElement;
    select.value = code;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return select;
  };
  beforeEach(() => {
    vi.mocked(Dialog.confirm).mockClear();
  });

  it("stores the choice and offers the reload that applies it", () => {
    const select = choose("ru");
    expect(select.value).toBe("ru");
    expect(JSON.parse(localStorage.getItem("fmg-options")!).app.language).toBe("ru");
    expect(Dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ confirm: "Reload", cancel: "Not now" }));
  });

  it("stores a switch back to the current language without asking to reload", () => {
    choose("en");
    expect(options.app.language).toBe("en");
    expect(Dialog.confirm).not.toHaveBeenCalled();
  });
});
