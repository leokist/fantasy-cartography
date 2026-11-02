// The About panel, under the info icon in the bottom bar: what the app is and the generator it is built on

import { openPanel } from "@/app/chrome/options-panel";
import { Services } from "@/services";
import { link } from "@/utils/common-utils";
import { t } from "@/utils/i18n";
import { ensureEl } from "@/utils/node-utils";

const FORK = "https://github.com/leokist/fantasy-cartography";
const BASE = "https://github.com/Azgaar/Fantasy-Map-Generator";

const TEMPLATE = /* html */ `
  <p>
    ${t(
      "Fantasy Cartography makes fantasy maps for games. Set up the continents, countries and regions of a world by hand, or generate one at random, then edit everything on it and export it, to Godot among others."
    )}
  </p>
  <p>
    ${t("It is built on {{- base}} by Azgaar, an open source map generator under the MIT license.", {
      base: link(BASE, "Fantasy Map Generator")
    })}
    ${t("Source code: {{- repository}}.", { repository: link(FORK, "GitHub") })}
  </p>
  <button id="startTourButton" type="button" style="width: 100%" data-tip="${t("Take an interactive tour of the app")}">
    ${t("Interactive Tour")}
  </button>
`;

ensureEl("aboutContent").innerHTML = TEMPLATE;
ensureEl("startTourButton").addEventListener("click", () => Services.UiTour.start());

/** Show what the app is */
export function showInfo(): void {
  openPanel("about");
}
