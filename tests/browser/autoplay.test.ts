import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { setUpAutoplay } from "../../src/scripts/autoplay.ts";

/** A stand-in for a `MediaQueryList` whose result the test can change. */
function preference(matches: boolean): MediaQueryList & { set(matches: boolean): void } {
  const query = Object.assign(new EventTarget(), {
    matches,
    set(value: boolean) {
      query.matches = value;
      query.dispatchEvent(new Event("change"));
    },
  });
  return query as unknown as MediaQueryList & { set(matches: boolean): void };
}

const video = (selector: string) => document.querySelector(selector) as HTMLVideoElement;

beforeEach(() => {
  document.body.innerHTML =
    '<video id="autoplay" autoplay loop muted playsinline controls></video><video id="manual" controls></video>';
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("video autoplay", () => {
  it("stops videos that play automatically when the reader prefers reduced motion", () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    setUpAutoplay(document, preference(true));
    expect(video("#autoplay").hasAttribute("autoplay")).toBe(false);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("leaves videos alone when the reader doesn't prefer reduced motion", () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    setUpAutoplay(document, preference(false));
    expect(video("#autoplay").hasAttribute("autoplay")).toBe(true);
    expect(pause).not.toHaveBeenCalled();
  });

  it("stops videos when the preference changes to reduced motion", () => {
    const reducedMotion = preference(false);
    setUpAutoplay(document, reducedMotion);
    reducedMotion.set(true);
    expect(video("#autoplay").hasAttribute("autoplay")).toBe(false);
  });
});
