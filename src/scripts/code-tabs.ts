/**
 * Code listing tabs, following the WAI-ARIA tabs pattern with automatic activation:
 * arrow keys, Home, and End move between tabs, and only the selected tab
 * is in the tab order. Choosing Swift or Objective-C applies the choice
 * to every listing on the page and remembers it when storage is available.
 */

export const STORAGE_KEY = "preferred-language";
const SHARED_LANGUAGES = ["swift", "objective-c"];

function readPreference(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable, e.g. when blocked by privacy settings.
    return null;
  }
}

function writePreference(language: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // The preference applies to this page only.
  }
}

function tabsOf(tablist: Element): HTMLButtonElement[] {
  return Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
}

/** Selects a tab within its group without moving focus. */
function select(tab: HTMLButtonElement): void {
  const tablist = tab.closest('[role="tablist"]');
  if (!tablist) return;
  for (const other of tabsOf(tablist)) {
    const selected = other === tab;
    other.setAttribute("aria-selected", String(selected));
    other.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(other.getAttribute("aria-controls") ?? "");
    if (panel) panel.hidden = !selected;
  }
}

/** The language shared across groups for a tab, if any. */
function sharedLanguage(tab: Element): string | undefined {
  return SHARED_LANGUAGES.find((language) => tab.classList.contains(language));
}

/** Selects a language in every group that offers it, keeping heights stable. */
function selectLanguage(language: string): void {
  for (const tab of document.querySelectorAll<HTMLButtonElement>(`[role="tab"].${CSS.escape(language)}`)) {
    select(tab);
  }
}

/** Keeps the page from jumping when a taller listing replaces a shorter one. */
function stabilizeHeights(): void {
  for (const group of document.querySelectorAll<HTMLElement>(".highlight-group")) {
    const minimum = Number.parseInt(group.style.minHeight, 10) || 0;
    if (group.clientHeight > minimum) group.style.minHeight = `${group.clientHeight}px`;
  }
}

function activate(tab: HTMLButtonElement): void {
  const language = sharedLanguage(tab);
  if (language) {
    writePreference(language);
    selectLanguage(language);
    stabilizeHeights();
  } else {
    select(tab);
  }
}

/** Sets up every tab list in a document and applies the remembered language. */
export function setUpTabs(root: ParentNode = document): void {
  for (const tablist of root.querySelectorAll('[role="tablist"]')) {
    const tabs = tabsOf(tablist);
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", (event) => {
        let target: HTMLButtonElement | undefined;
        switch (event.key) {
          case "ArrowLeft":
          case "ArrowUp":
            target = tabs[(index - 1 + tabs.length) % tabs.length];
            break;
          case "ArrowRight":
          case "ArrowDown":
            target = tabs[(index + 1) % tabs.length];
            break;
          case "Home":
            target = tabs[0];
            break;
          case "End":
            target = tabs[tabs.length - 1];
            break;
          default:
            return;
        }
        event.preventDefault();
        if (!target) return;
        activate(target);
        target.focus();
      });
    });
  }

  const preferred = readPreference();
  if (preferred && SHARED_LANGUAGES.includes(preferred)) selectLanguage(preferred);
}
