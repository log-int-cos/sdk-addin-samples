(function () {
  // ---------- 1. Centro inicial del mapa (epicentro del polígono Cantoria, entre el AC1 y AC2) ----------
  var centro = { coords: { latitude: 37.370146047645555, longitude: -2.2435926777017703 } };
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition = function (ok) { ok(centro); };
  }

  // ---------- 2. Fondo satélite + selector de mapa ----------
  var capaSatelite = null;
  var capaCallejero = null;

  if (window.L && L.tileLayer) {
    var tileLayerOriginal = L.tileLayer;
    L.tileLayer = function (url, opciones) {
      // Cuando el add-in pide el mapa de OpenStreetMap, ponemos el satélite en su lugar
      if (url && url.indexOf('openstreetmap') !== -1) {
        var imagen = tileLayerOriginal(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          { maxZoom: 19, attribution: 'Imágenes &copy; Esri' }
        );
        var etiquetas = tileLayerOriginal(
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          { maxZoom: 19 }
        );
        capaSatelite = L.layerGroup([imagen, etiquetas]);
        capaCallejero = tileLayerOriginal(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          { maxZoom: 19, attribution: '&copy; OpenStreetMap' }
        );
        return capaSatelite;
      }
      return tileLayerOriginal(url, opciones);
    };
  }

  // ---------- 3. Geocercas (zonas) de MyGeotab ----------
  var mapa = null;
  var capaZonas = null;

  if (window.L && L.Map && L.Map.addInitHook) {
    L.Map.addInitHook(function () {
      mapa = this;
      console.log('[zonas] mapa detectado');
      // Selector Satélite / Mapa (cuando el add-in ya ha puesto el fondo)
      setTimeout(function () {
        if (capaSatelite && capaCallejero && L.control && L.control.layers) {
          L.control.layers(
            { 'Satélite': capaSatelite, 'Mapa': capaCallejero },
            null,
            { position: 'topright', collapsed: false }
          ).addTo(mapa);
        }
      }, 0);
    });
  }

  function colorDe(c) {
    return c ? 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')' : '#ff0000';
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
      capaZonas = L.featureGroup();
      var renderer = L.canvas ? L.canvas({ padding: 0.5 }) : undefined;

      (zonas || []).forEach(function (z) {
        if (!z.points || z.points.length < 3) return;
        var puntos = z.points.map(function (p) { return [p.y, p.x]; });
        var color = colorDe(z.fillColor);
        var opciones = { color: color, weight: 3, opacity: 1, fillColor: color, fillOpacity: 0.3 };
        if (renderer) opciones.renderer = renderer;
        var poligono = L.polygon(puntos, opciones);
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
        dibujarZonas(api);
        return r;
      };
      return addin;
    };
  }

  if (window.geotab && geotab.addin) {
    var actual;
    Object.defineProperty(geotab.addin, 'heatmap', {
      configurable: true,
      enumerable: true,
      get: function () { return actual; },
      set: function (f) { actual = envolver(f); console.log('[zonas] add-in enganchado'); }
    });
  }
})();
