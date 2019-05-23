"use strict";

(function() {
  mapkit.init({
    authorizationCallback: done => {
      done(
        "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6IjRUOTJZWlNXR00ifQ.eyJleHAiOjI0MTYzMjE2MDAuMjc2NjE2MSwiaXNzIjoiOUpXVkFEUjNSUSIsIm9yaWdpbiI6Imh0dHBzOlwvXC9uc2hpcHN0ZXIuY29tIiwiaWF0IjoxNTUyMzIxNjAwLjI3NjYxNzF9.DRsKD-6Y9MMVId46PnV9DK-YiobqGu0qCMbK1fYjglWOVnuJkpm4UGDdYLB0T4xJfStPlrSI1Pwbzsjn_i0Qww"
      );
    }
  });

  const center = new mapkit.Coordinate(37.3327, -122.0053),
    span = new mapkit.CoordinateSpan(0.0125, 0.0125),
    region = new mapkit.CoordinateRegion(center, span);

  let map = new mapkit.Map("map", {
    region: region,
    showsCompass: mapkit.FeatureVisibility.Hidden,
    showsZoomControl: false,
    showsMapTypeControl: false
  });

  const annotation = new mapkit.MarkerAnnotation(center, {
    title: "Apple Park Visitor Center",
    subtitle: "10600 North Tantau Avenue, Cupertino, CA 95014",
    glyphText: "",
    color: "#8e8e93",
    displayPriority: 1000
  });

  map.addAnnotation(annotation);
})();
