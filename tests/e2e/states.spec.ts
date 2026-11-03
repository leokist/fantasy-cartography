import {test, expect, type Page} from "@playwright/test";
import { countMaps, waitForMap, waitForNextMap } from "./wait-for-map";

// the app's console surface, see src/app/fmg.ts
declare const FMG: any;

test.describe("States", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate with seed parameter and wait for full load
    await page.goto("/?seed=test-states&width=1280&height=720");

    // Wait for map generation to complete
    await waitForMap(page);

    // Additional wait for any rendering/animations to settle
    await page.waitForTimeout(500);
  });

  test("merging as provinces keeps each merged state as a province of the ruling state", async ({page}) => {
    await page.click("#editButton");
    await page.click("#editStatesButton");
    await page.waitForSelector("#statesEditor", {state: "visible", timeout: 5000});

    const [ruler, child] = await page.evaluate(() =>
      pack.states
        .filter(s => s.i && !s.removed)
        .slice(0, 2)
        .map(s => ({
          i: s.i,
          name: s.name,
          formName: s.formName,
          coa: JSON.stringify(s.coa),
          provinces: pack.provinces.filter(p => p.i && !p.removed && p.state === s.i).map(p => p.i),
          cells: pack.cells.state.filter(id => id === s.i).length
        }))
    );
    expect(child.provinces.length).toBeGreaterThan(0);

    await page.click("#statesMerge");
    await page.check(`#mergeStatesForm input[name="rulingState"][value="${ruler.i}"]`);
    await page.click(`label[for="selectState${child.i}"]`);
    await page.click(".dialog-window:has(#mergeStatesForm) .dialog-buttonpane button:first-child");

    await page.check("#mergeStatesAsProvinces");
    await page.click(".dialog-window:has(#mergeStatesAsProvinces) .dialog-buttonpane button:first-child");
    await page.waitForTimeout(300);

    const result = await page.evaluate(
      ([r, c, oldProvinces]) => {
        const {states, provinces, cells} = pack;
        const province = provinces.find(p => p.i && !p.removed && p.state === r && p.name === states[c].name)!;
        let provinceCells = 0;
        for (let i = 0; i < cells.province.length; i++) if (cells.province[i] === province.i) provinceCells++;
        return {
          stateRemoved: Boolean(states[c].removed),
          formName: province.formName,
          fullName: province.fullName,
          coa: JSON.stringify(province.coa),
          color: province.color,
          provinceCells,
          oldProvincesRemoved: oldProvinces.every((i: number) => provinces[i].removed),
          listed: states[r].provinces!.includes(province.i),
          layerOn: FMG.Layers.isOn("provinces")
        };
      },
      [ruler.i, child.i, child.provinces] as const
    );
    expect(result).toEqual({
      stateRemoved: true,
      formName: child.formName,
      fullName: `${child.name} ${child.formName}`,
      coa: child.coa,
      color: expect.stringMatching(/^#[0-9a-f]{6}$/),
      provinceCells: child.cells,
      oldProvincesRemoved: true,
      listed: true,
      layerOn: true
    });
  });

  test("painting states applies after the States Editor closes", async ({page}) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.click("#editButton");
    await page.click("#editStatesButton");
    await page.waitForSelector("#statesEditor", {state: "visible"});
    await page.locator("#adjustLabels").evaluate((element: HTMLInputElement) => {
      element.checked = true;
    });

    await page.click("#statesManually");
    await page.waitForSelector("#paintEditor", {state: "visible"});

    const target = await page.evaluate(() => {
      const {cells, states} = (window as any).pack;
      const cell = cells.i.find(
        (cellId: number) => cells.h[cellId] >= 20 && cells.state[cellId] && states[cells.state[cellId]].center !== cellId
      );
      const [x, y] = cells.p[cell];
      const viewbox = document.getElementById("viewbox") as unknown as SVGGraphicsElement;
      const point = new DOMPoint(x, y).matrixTransform(viewbox.getScreenCTM()!);
      const state = cells.state[cell];
      states[state].label = {text: "paint-test-label"};
      return {cell, state, x: point.x, y: point.y};
    });

    await page.selectOption("#paintEditorSelect", "0");
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await page.mouse.move(target.x + 2, target.y, {steps: 2});
    await page.mouse.up();
    await expect(page.locator(`#paintEditorOverlay polygon[data-cell="${target.cell}"]`)).toBeAttached();

    await page.click("#paintEditorApply");

    expect(pageErrors).toEqual([]);
    await expect.poll(() => page.evaluate(cell => (window as any).pack.cells.state[cell], target.cell)).toBe(0);
    expect(await page.evaluate(state => (window as any).pack.states[state].label, target.state)).toBeUndefined();
  });
});

declare const pack: {
  states: import("@/model/political/states-generator").State[];
  provinces: import("@/model/political/provinces-generator").Province[];
  cells: { state: Uint16Array; province: Uint16Array; p: [number, number][] };
};
