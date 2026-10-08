(function () {
  // Centro inicial del mapa (epicentro del polígono Cantoria, entre el AC1 y AC2)
  var porDefecto = { coords: { latitude: 37.370146047645555, longitude: -2.2435926777017703 } };
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition = function (ok) {
    ok(porDefecto);
  };
})();
