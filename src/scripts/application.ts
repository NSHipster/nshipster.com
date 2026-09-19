/**
 * Page behavior: code listing tabs, title sizing, and the logo animation.
 */
import { setUpTabs } from "./code-tabs.ts";

/** Scales article titles to fit their width. */
function setUpTitles(): void {
  for (const element of document.querySelectorAll<HTMLElement>('article [role="heading"] h1.title')) {
    const resize = () => {
      const compression = 1.0;
      const minFontSize = 16.0;
      const maxFontSize = 72.0;
      element.style.fontSize = `${Math.max(Math.min(element.clientWidth / (compression * 10), maxFontSize), minFontSize)}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
  }
}

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
setUpTitles();
setUpLogo();
