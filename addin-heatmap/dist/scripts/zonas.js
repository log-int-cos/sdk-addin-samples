(function () {
  var mapa = null;
  var capaZonas = null;

  // Guarda una referencia al mapa cuando el add-in lo crea
  if (window.L && L.Map && L.Map.addInitHook) {
    L.Map.addInitHook(function () { mapa = this; });
  }

  function colorDe(c) {
    return c ? 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')' : '#3388ff';
  }

  function dibujarZonas(api) {
    if (!mapa || !api) return;
    api.call('Get', { typeName: 'Zone', resultsLimit: 10000 }, function (zonas) {
      if (capaZonas) mapa.removeLayer(capaZonas);
      capaZonas = L.layerGroup();
      (zonas || []).forEach(function (z) {
        if (!z.points || z.points.length < 3) return;
        var puntos = z.points.map(function (p) { return [p.y, p.x]; });
        var color = colorDe(z.fillColor);
        var poligono = L.polygon(puntos, { color: color, weight: 2, fillOpacity: 0.15 });
        if (poligono.bindTooltip) poligono.bindTooltip(z.name || '');
        else poligono.bindPopup(z.name || '');
        poligono.addTo(capaZonas);
      });
      capaZonas.addTo(mapa);
    }, function (e) {
      console.error('Error al cargar las zonas', e);
    });
  }

  // Después de que el add-in cargue, dibuja las geo-zonas del polígono de Cantoria
  if (!window.geotab || !geotab.addin || !geotab.addin.heatmap) return;
  var original = geotab.addin.heatmap;
  geotab.addin.heatmap = function () {
    var addin = original.apply(this, arguments);
    var focusOriginal = addin.focus;
    addin.focus = function (api, state) {
      var r = focusOriginal.apply(this, arguments);
      dibujarZonas(api);
      return r;
    };
    return addin;
  };
})();
