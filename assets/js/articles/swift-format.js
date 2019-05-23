//= require vendor/resize-observer.min.js

function getComputedWidthInEm(element) {
  const computed = window.getComputedStyle(element);

  const regex = /(\d+(\.\d+)?)px$/;
  const fontSize = Number(computed.fontSize.match(regex)[1]);
  const width = Number(computed.width.match(regex)[1]);
  return (width / fontSize) * 2.6;
}

(function() {
  const container = document.querySelector(".variable-width");

  const candidates = Array.from(document.querySelectorAll("[data-width]")).sort(
    ({ dataset: { width: a } }, { dataset: { width: b } }) => b.localeCompare(a)
  );

  const observer = new ResizeObserver(() => {
    const targetWidth = getComputedWidthInEm(container);
    var foundMatch = false;

    candidates.forEach(element => {
      const width = Number(element.dataset.width);
      if (!width || foundMatch) {
        element.setAttribute("hidden", "hidden");
      } else if (width < targetWidth) {
        foundMatch = true;
        element.removeAttribute("hidden");
      } else {
        element.setAttribute("hidden", "hidden");
      }
    });

    if (!foundMatch) {
      candidates[candidates.length - 1].removeAttribute("hidden");
    }
  });

  observer.observe(container);
})();
