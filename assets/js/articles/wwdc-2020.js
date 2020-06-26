"use strict";

(function () {
  const details = document.querySelector("details");
  if (details) {
    let listener = details.addEventListener("toggle", (event) => {
      console.log("ADSFADSAFD");
      const video = document.querySelector("video");
      video.loop = true;
      video.controls = false;
      video.play();
      details.removeEventListener("toggle", listener);
    });
  }
})();
