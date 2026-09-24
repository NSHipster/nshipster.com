/**
 * Page behavior: code listing tabs and the logo animation.
 */
import { setUpTabs } from "./code-tabs.ts";

function setUpLogo(): void {
  setTimeout(() => {
    if (
      document.location.pathname === "/" &&
      matchMedia("(hover: none)").matches &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      document.querySelector("#logo svg")?.classList.add("animated");
    }
  }, 1000);
}

setUpTabs();
setUpLogo();
