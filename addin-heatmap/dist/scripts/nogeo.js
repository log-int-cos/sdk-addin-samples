(function () {
  // =====================================================================
  //  Add-in Mapa de calor (Cosentino) — mejoras sobre el ejemplo de Geotab
  //  1. Centro inicial del mapa
  //  2. Fondo satélite + botones Satélite / Mapa / Nombres
  //  3. Geocercas de MyGeotab + nombres por encima del mapa de calor
  //  4. Descarga en ZIP de un JPEG del mapa de calor por vehículo
  // =====================================================================

 // ---------- 1. Centro inicial del mapa (epicentro del polígono Cantoria, entre el AC1 y AC2) ----------
  var centro = { coords: { latitude: 37.370146047645555, longitude: -2.2435926777017703 } };
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition = function (ok) { ok(centro); };
  }

  var mapa = null;
  var capaZonas = null;
  var capaNombres = null;
  var etiquetas = [];          // [{ nombre, latlng }] para pintarlas también en las imágenes
  var mostrarNombres = true;

  // ---------- 2. Fondo satélite + botones ----------
  function configurarFondo(m) {
    var satelite = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Imágenes &copy; Esri' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19 })
    ]);
    var callejero = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19, attribution: '&copy; OpenStreetMap' });

    m.eachLayer(function (capa) {
      if (capa instanceof L.TileLayer) m.removeLayer(capa);
    });
    satelite.addTo(m);
    console.log('[mapa] fondo satélite aplicado');

    var caja = document.createElement('div');
    caja.style.cssText = 'position:absolute;top:10px;right:10px;z-index:1000;display:flex;gap:4px;align-items:center;' +
      'background:#fff;padding:4px;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.4);font:13px sans-serif;';

    function boton(texto) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = texto;
      b.style.cssText = 'all:unset;cursor:pointer;padding:5px 10px;border-radius:4px;font:13px sans-serif;';
      caja.appendChild(b);
      return b;
    }
    function pintar(b, activo) {
      b.style.background = activo ? '#1f6feb' : 'transparent';
      b.style.color = activo ? '#fff' : '#222';
    }

    var bSat = boton('Satélite');
    var bMapa = boton('Mapa');
    var sep = document.createElement('span');
    sep.style.cssText = 'width:1px;height:20px;background:#ccc;margin:0 2px;';
    caja.appendChild(sep);
    var bNombres = boton('Nombres');

    function activarFondo(cual) {
      if (cual === 'sat') {
        if (m.hasLayer(callejero)) m.removeLayer(callejero);
        if (!m.hasLayer(satelite)) satelite.addTo(m);
      } else {
        if (m.hasLayer(satelite)) m.removeLayer(satelite);
        if (!m.hasLayer(callejero)) callejero.addTo(m);
      }
      pintar(bSat, cual === 'sat');
      pintar(bMapa, cual === 'mapa');
    }
    function activarNombres(si) {
      mostrarNombres = si;
      if (capaNombres) {
        if (si && !m.hasLayer(capaNombres)) capaNombres.addTo(m);
        if (!si && m.hasLayer(capaNombres)) m.removeLayer(capaNombres);
      }
      pintar(bNombres, si);
    }

    if (L.DomEvent) {
      L.DomEvent.disableClickPropagation(caja);
      L.DomEvent.disableScrollPropagation(caja);
    }
    bSat.addEventListener('click', function () { activarFondo('sat'); });
    bMapa.addEventListener('click', function () { activarFondo('mapa'); });
    bNombres.addEventListener('click', function () { activarNombres(!mostrarNombres); });

    m.getContainer().appendChild(caja);
    activarFondo('sat');
    activarNombres(true);
    console.log('[mapa] botones añadidos');
  }

  if (window.L && L.Map && L.Map.addInitHook) {
    L.Map.addInitHook(function () {
      var m = this;
      mapa = m;
      console.log('[zonas] mapa detectado');
      setTimeout(function () {
        try { configurarFondo(m); } catch (e) { console.error('[mapa] error', e); }
        try { crearBotonDescarga(); } catch (e) { console.error('[zip] error', e); }
      }, 0);
    });
  }

  // ---------- 3. Geocercas y nombres ----------
  function colorDe(c) {
    return c ? 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')' : '#ff0000';
  }

  function puntoDentro(lat, lng, puntos) {
    var dentro = false;
    for (var i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
      var yi = puntos[i][0], xi = puntos[i][1], yj = puntos[j][0], xj = puntos[j][1];
      if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) dentro = !dentro;
    }
    return dentro;
  }

  // Centro de masas del polígono; si cae fuera (polígonos en forma de L), centro del recuadro
  function centroEtiqueta(puntos, poligono) {
    var a = 0, cx = 0, cy = 0, n = puntos.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = puntos[i][1], yi = puntos[i][0], xj = puntos[j][1], yj = puntos[j][0];
      var f = xj * yi - xi * yj;
      a += f; cx += (xi + xj) * f; cy += (yi + yj) * f;
    }
    if (Math.abs(a) > 1e-12) {
      a *= 0.5;
      var lat = cy / (6 * a), lng = cx / (6 * a);
      if (puntoDentro(lat, lng, puntos)) return L.latLng(lat, lng);
    }
    return poligono.getBounds().getCenter();
  }

  function iconoNombre(nombre) {
    var seguro = String(nombre).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
    return L.divIcon({
      className: '',
      iconSize: [0, 0],
      html: '<div style="transform:translate(-50%,-50%);white-space:nowrap;pointer-events:none;' +
        'font:bold 12px Arial,sans-serif;color:#fff;' +
        'text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 4px #000;">' +
        seguro + '</div>'
    });
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
      if (capaNombres) mapa.removeLayer(capaNombres);
      capaZonas = L.featureGroup();
      capaNombres = L.layerGroup();      // marcadores: van en una capa por encima del mapa de calor
      etiquetas = [];
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

        if (z.name) {
          var posicion = centroEtiqueta(puntos, poligono);
          etiquetas.push({ nombre: z.name, latlng: posicion });
          L.marker(posicion, { icon: iconoNombre(z.name), interactive: false, keyboard: false }).addTo(capaNombres);
        }
      });

      capaZonas.addTo(mapa);
      if (mostrarNombres) capaNombres.addTo(mapa);
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

  // ---------- 4. Descarga ZIP con un JPEG por vehículo ----------
  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function crearBotonDescarga() {
    var mostrar = document.getElementById('showHeatMap');
    if (!mostrar || document.getElementById('desc
 
