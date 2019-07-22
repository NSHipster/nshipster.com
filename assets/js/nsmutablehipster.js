//= require vendor/typed.min.js

"use strict";

(function() {
  document.body.contentEditable = true;
  document.querySelectorAll("a").forEach(element => {
    element.contentEditable = false;
  });

  if (document.querySelector(".tagline")) {
    new Typed(".tagline strong", {
      strings: ["NSHipster", "NSMutableHipster"],
      typeSpeed: 100,
      backSpeed: 100,
      startDelay: 1000,
      onComplete: () => {
        document.querySelector(".typed-cursor").remove();
      }
    });

    document
      .querySelector(".typed-cursor")
      .setAttribute("style", "position: absolute;");
  }
})();
