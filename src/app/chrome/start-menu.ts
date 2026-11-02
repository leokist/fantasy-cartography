// What opens when there is no map to show: a world generated at random, or one configured by hand in the wizard

import type { GenerationConfig } from "@/app/lifecycle";
import { showLoading } from "@/app/loading";
import { Controllers } from "@/controllers";
import { Dialog } from "@/ui/dialog/dialog";
import { t } from "@/utils/i18n";
import { ensureEl, findEl } from "@/utils/node-utils";

const DIALOG_ID = "startMenu";

/** The splash stays behind the menu; its "Loading" line waits for a choice */
export function showStartMenu(start: (config?: GenerationConfig) => Promise<void>, config?: GenerationConfig): void {
  showLoading(); // boot started fading the splash; it stays as the backdrop
  showLoadingLine(false);
  Dialog.destroy(DIALOG_ID);
  ensureEl("dialogs").insertAdjacentHTML(
    "beforeend",
    /* html */ `<div id="${DIALOG_ID}" class="dialog">
      <style>
        #${DIALOG_ID} .startChoices { display: grid; width: 100%; grid-template-columns: minmax(0, 1fr); gap: 0.7em; margin: 0.2em 0 }
        #${DIALOG_ID} { white-space: normal }
        #${DIALOG_ID} .startChoices button { display: block; width: 100%; box-sizing: border-box; white-space: normal; text-align: left; padding: 0.8em 1em; line-height: 1.35; font-size: 1.2em }
        #${DIALOG_ID} .startChoices b { display: block; font-size: 1.15em; margin-bottom: 0.15em }
      </style>
      <div class="startChoices">
        <button data-choice="auto"><b>${t("Generate automatically")}</b>${t("A random world, ready in seconds. You can change anything afterwards.")}</button>
        <button data-choice="manual"><b>${t("Configure manually")}</b>${t("Set up the map, continents, countries and their regions in the World Wizard, then generate.")}</button>
      </div>
    </div>`
  );

  let chosen = false;
  const choose = (choice: string) => {
    chosen = true;
    Dialog.close(DIALOG_ID);
    if (choice === "auto") {
      showLoadingLine(true);
      void start(config);
    } else void Controllers.WorldWizard.open({ onCancel: () => showStartMenu(start, config) });
  };
  for (const button of ensureEl(DIALOG_ID).querySelectorAll<HTMLButtonElement>("[data-choice]"))
    button.addEventListener("click", () => choose(button.dataset.choice ?? ""));

  Dialog.open(DIALOG_ID, {
    title: t("Fantasy Cartography"),
    width: "min(36em, 92vw)",
    modal: true,
    closeOnEscape: false,
    position: { my: "center top", at: "center center+6em", of: "svg" }, // below the title
    beforeClose: () => chosen // there is nothing behind it to go back to
  });
}

export function showLoadingLine(visible: boolean): void {
  const line = findEl("loading-text");
  if (line) line.style.visibility = visible ? "visible" : "hidden";
}
