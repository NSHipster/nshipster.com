/**
 * Page behavior: code listing tabs, scrollable code listings, video autoplay, and the logo animation.
 */
import { setUpAutoplay } from "./autoplay.ts";
import { setUpTabs } from "./code-tabs.ts";
import { setUpScrollableCode } from "./scrollable-code.ts";

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
setUpScrollableCode();
setUpAutoplay();
setUpLogo();
