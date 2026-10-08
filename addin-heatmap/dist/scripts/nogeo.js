(function () {
  // ---------- 1. Centro inicial del mapa (epicentro del polígono Cantoria, entre el AC1 y AC2) ----------
  var centro = { coords: { latitude: 37.370146047645555, longitude: -2.2435926777017703 } };
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition = function (ok) { ok(centro); };
  }

  // ---------- 2. Geocercas (zonas) de MyGeotab ----------
  var mapa = null;
  var capaZonas = null;

  if (window.L && L.Map && L.Map.addInitHook) {
    L.Map.addInitHook(function () {
      mapa = this;
      console.log('[zonas] mapa detectado');
    });
  } else {
    console.warn('[zonas] Leaflet no está cargado todavía');
  }

  function colorDe(c) {
    return c ? 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')' : '#3388ff';
  }

  function dibujarZonas(api, intento) {
    intento = intento || 0;
    if (!mapa) {
      if (intento < 20) return setTimeout(function () { dibujarZonas(api, intento + 1); }, 500);
      return console.warn('[zonas] no se encontró el mapa');
    }
    api.call('Get', { typeName: 'Zone', resultsLimit: 10000 }, function (zonas) {
      console.log('[zonas] zonas recibidas: ' + (zonas ? zonas.length : 0));
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
      console.error('[zonas] error al cargar las zonas', e);
    });
  }

  function envolver(fabrica) {
    if (typeof fabrica !== 'function') return fabrica;
    return function () {
      var addin = fabrica.apply(this, arguments);
      var focusOriginal = addin.focus;
      addin.focus = function (api) {
        var r = focusOriginal.apply(this, arguments);
        console.log('[zonas] focus llamado, cargando zonas...');
        dibujarZonas(api);
        return r;
      };
      return addin;
    };
  }

  // Se engancha en el momento exacto en que el add-in se registra
  if (window.geotab && geotab.addin) {
    var actual;
    Object.defineProperty(geotab.addin, 'heatmap', {
      configurable: true,
      enumerable: true,
      get: function () { return actual; },
      set: function (f) { actual = envolver(f); console.log('[zonas] add-in enganchado'); }
    });
  } else {
    console.warn('[zonas] objeto geotab.addin no disponible');
  }
})();

