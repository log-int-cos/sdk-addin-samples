(function () {
  // Coordenadas por defecto (Madrid). Cámbialas por la zona de tu flota.
  var porDefecto = { coords: { latitude: 40.4168, longitude: -3.7038 } };
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition = function (ok) {
    ok(porDefecto);
  };
})();
