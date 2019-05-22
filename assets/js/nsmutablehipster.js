(function() {
  document.body.contentEditable = true;
  document.querySelectorAll("a").forEach(element => {
    element.contentEditable = false;
  });
})();
