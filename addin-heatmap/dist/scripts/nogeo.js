(function () {
  // =====================================================================
  //  Add-in Mapa de calor (Cosentino) — mejoras sobre el ejemplo de Geotab
  //  1. Centro inicial del mapa
  //  2. Fondo satélite + botones Satélite / Mapa / Nombres
  //  3. Geocercas de MyGeotab + nombres por encima del mapa de calor
  //  4. Descarga en ZIP de un JPEG del mapa de calor por vehículo
  // =====================================================================

  // ---------- 1. Centro inicial del mapa ----------
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
    if (!mostrar || document.getElementById('descargarZip')) return;

    var b = document.createElement('input');
    b.type = 'button';
    b.id = 'descargarZip';
    b.value = 'Descargar imágenes (ZIP)';
    b.style.cssText = 'display:block;margin-top:8px;cursor:pointer;';
    var estado = document.createElement('div');
    estado.id = 'estadoZip';
    estado.style.cssText = 'margin-top:6px;font-size:12px;color:#444;';

    mostrar.parentNode.insertBefore(estado, mostrar.nextSibling);
    mostrar.parentNode.insertBefore(b, mostrar.nextSibling);
    b.addEventListener('click', function () {
      descargarZip().catch(function (e) {
        console.error('[zip] error', e);
        estado.textContent = 'Error al generar el ZIP: ' + (e && e.message ? e.message : e);
        b.disabled = false;
      });
    });
    console.log('[zip] botón de descarga añadido');
  }

  // Pulsa "Mostrar mapa de calor" y espera a que termine
  async function ejecutarMapa() {
    var btn = document.getElementById('showHeatMap');
    var msg = document.getElementById('message');
    var err = document.getElementById('error');
    btn.click();
    var t0 = Date.now();
    while (!btn.disabled && Date.now() - t0 < 1500) await esperar(100);   // espera a que empiece
    t0 = Date.now();
    while (btn.disabled && Date.now() - t0 < 180000) await esperar(250);  // espera a que acabe
    await esperarTeselas();
    await esperar(600);                                                   // repintado del mapa de calor
    return { mensaje: (msg && msg.textContent) || '', error: (err && err.textContent) || '' };
  }

  async function esperarTeselas() {
    var t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      var imgs = mapa.getContainer().querySelectorAll('img.leaflet-tile');
      var pendientes = 0;
      for (var i = 0; i < imgs.length; i++) if (!imgs[i].complete) pendientes++;
      if (pendientes === 0) return;
      await esperar(200);
    }
  }

  // Las teselas se vuelven a pedir por CORS para poder copiarlas en la imagen
  var cacheTeselas = {};
  var fondoFallido = false;
  function cargarTesela(src) {
    if (!cacheTeselas[src]) {
      cacheTeselas[src] = fetch(src, { mode: 'cors' })
        .then(function (r) { return r.ok ? r.blob() : null; })
        .then(function (blob) { return blob ? createImageBitmap(blob) : null; })
        .catch(function () { return null; });
    }
    return cacheTeselas[src];
  }

  async function capturarMapa(titulo) {
    var cont = mapa.getContainer();
    var r0 = cont.getBoundingClientRect();
    var W = Math.round(r0.width), H = Math.round(r0.height), cab = 36;
    var s = Math.min(window.devicePixelRatio || 1, 2);
    var lienzo = document.createElement('canvas');
    lienzo.width = Math.round(W * s);
    lienzo.height = Math.round((H + cab) * s);
    var ctx = lienzo.getContext('2d');
    ctx.scale(s, s);
    ctx.fillStyle = '#d9d9d9';
    ctx.fillRect(0, 0, W, H + cab);

    ctx.save();
    ctx.translate(0, cab);
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();

    // Fondo (teselas)
    var imgs = cont.querySelectorAll('.leaflet-tile-pane img.leaflet-tile');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (getComputedStyle(img).opacity === '0' || getComputedStyle(img.parentNode).opacity === '0') continue;
      var r = img.getBoundingClientRect();
      if (r.right < r0.left || r.left > r0.right || r.bottom < r0.top || r.top > r0.bottom) continue;
      var bmp = await cargarTesela(img.src);
      if (bmp) ctx.drawImage(bmp, r.left - r0.left, r.top - r0.top, r.width, r.height);
      else fondoFallido = true;
    }

    // Mapa de calor y geocercas (lienzos de Leaflet)
    var lienzos = cont.querySelectorAll('canvas');
    for (var k = 0; k < lienzos.length; k++) {
      var cv = lienzos[k];
      var rc = cv.getBoundingClientRect();
      if (!rc.width || !rc.height) continue;
      ctx.globalAlpha = parseFloat(getComputedStyle(cv).opacity) || 1;
      try { ctx.drawImage(cv, rc.left - r0.left, rc.top - r0.top, rc.width, rc.height); } catch (e) { /* lienzo no copiable */ }
      ctx.globalAlpha = 1;
    }

    // Nombres de las geocercas
    if (mostrarNombres) {
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      etiquetas.forEach(function (e) {
        var p = mapa.latLngToContainerPoint(e.latlng);
        if (p.x < -50 || p.y < -20 || p.x > W + 50 || p.y > H + 20) return;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(e.nombre, p.x, p.y);
        ctx.fillStyle = '#fff';
        ctx.fillText(e.nombre, p.x, p.y);
      });
    }
    ctx.restore();

    // Cabecera con el título
    ctx.fillStyle = '#1f2a37';
    ctx.fillRect(0, 0, W, cab);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(titulo, 10, cab / 2);

    return new Promise(function (ok) { lienzo.toBlob(ok, 'image/jpeg', 0.9); });
  }

  function nombreArchivo(t) {
    return String(t).replace(/[\\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').substring(0, 80);
  }

  function seleccionarSolo(sel, valores) {
    for (var i = 0; i < sel.options.length; i++) sel.options[i].selected = valores.indexOf(sel.options[i].value) !== -1;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function descargarZip() {
    var b = document.getElementById('descargarZip');
    var estado = document.getElementById('estadoZip');
    var sel = document.getElementById('vehicles');
    if (!mapa || !sel) throw new Error('el mapa todavía no está listo');

    var opciones = Array.prototype.filter.call(sel.options, function (o) { return o.value && !o.disabled; });
    var marcadas = opciones.filter(function (o) { return o.selected; });
    var lista = marcadas.length ? marcadas : opciones;
    if (!lista.length) throw new Error('no hay vehículos en la lista');

    var seleccionOriginal = marcadas.map(function (o) { return o.value; });
    var desde = (document.getElementById('from').value || '').replace('T', ' ');
    var hasta = (document.getElementById('to').value || '').replace('T', ' ');
    var porExcepciones = document.getElementById('visualizeByExceptionHistory').checked;
    var regla = '';
    if (porExcepciones) {
      var ex = document.getElementById('exceptionTypes');
      regla = ex && ex.selectedIndex >= 0 ? ex.options[ex.selectedIndex].text : '';
    }
    var modo = porExcepciones ? 'Excepciones: ' + regla : 'Ubicaciones';

    b.disabled = true;
    fondoFallido = false;
    var archivos = [];
    var resumen = ['Mapas de calor — ' + modo, 'Periodo: ' + desde + ' → ' + hasta, ''];

    // Trabajos: primero todo el grupo junto (si hay más de uno) y luego cada vehículo
    var trabajos = [];
    if (lista.length > 1) {
      trabajos.push({ nombre: 'Todos (' + lista.length + ' vehículos)', archivo: '00_Todos', valores: lista.map(function (o) { return o.value; }) });
    }
    lista.forEach(function (o, i) {
      var n = String(i + 1);
      while (n.length < 2) n = '0' + n;
      trabajos.push({ nombre: o.text, archivo: n + '_' + o.text, valores: [o.value] });
    });

    for (var t = 0; t < trabajos.length; t++) {
      var tr = trabajos[t];
      estado.textContent = 'Generando ' + (t + 1) + ' de ' + trabajos.length + ': ' + tr.nombre + '…';
      seleccionarSolo(sel, tr.valores);
      var res = await ejecutarMapa();
      if (/no data/i.test(res.mensaje) || res.error) {
        resumen.push(tr.nombre + ': sin datos' + (res.error ? ' (' + res.error + ')' : ''));
        continue;
      }
      var titulo = tr.nombre + '  ·  ' + desde + ' → ' + hasta + '  ·  ' + modo;
      var jpg = await capturarMapa(titulo);
      archivos.push({ nombre: nombreArchivo(tr.archivo) + '.jpg', datos: new Uint8Array(await jpg.arrayBuffer()) });
      resumen.push(tr.nombre + ': OK — ' + res.mensaje.trim());
    }

    if (fondoFallido) {
      resumen.push('', 'Aviso: la red no permitió copiar el fondo del mapa; las imágenes incluyen el mapa de calor, las geocercas y los nombres sobre fondo gris.');
    }
    archivos.push({ nombre: 'resumen.txt', datos: new TextEncoder().encode(resumen.join('\r\n')) });

    // Restaurar la selección y la vista del usuario
    seleccionarSolo(sel, seleccionOriginal);

    var zip = crearZip(archivos);
    var nombreZip = 'MapasCalor_' + nombreArchivo(desde) + '_a_' + nombreArchivo(hasta) + '.zip';
    var url = URL.createObjectURL(zip);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombreZip;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 5000);

    var conImagen = archivos.length - 1;
    estado.textContent = 'Listo: ' + conImagen + ' imagen(es) en ' + nombreZip + (fondoFallido ? ' (sin fondo de mapa)' : '');
    b.disabled = false;
  }

  // ZIP sin compresión (los JPEG ya van comprimidos); no necesita librerías externas
  var tablaCrc = null;
  function crc32(datos) {
    if (!tablaCrc) {
      tablaCrc = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        tablaCrc[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < datos.length; i++) crc = tablaCrc[(crc ^ datos[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function crearZip(archivos) {
    var ahora = new Date();
    var hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
    var fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
    var enc = new TextEncoder();
    var partes = [], central = [], desplazamiento = 0, tamCentral = 0;

    archivos.forEach(function (f) {
      var nombre = enc.encode(f.nombre), d = f.datos, crc = crc32(d);

      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, hora, true); lh.setUint16(12, fecha, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, d.length, true); lh.setUint32(22, d.length, true);
      lh.setUint16(26, nombre.length, true); lh.setUint16(28, 0, true);
      partes.push(lh, nombre, d);

      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, hora, true);
      ch.setUint16(14, fecha, true); ch.setUint32(16, crc, true); ch.setUint32(20, d.length, true);
      ch.setUint32(24, d.length, true); ch.setUint16(28, nombre.length, true); ch.setUint16(30, 0, true);
      ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true); ch.setUint32(42, desplazamiento, true);
      central.push(ch, nombre);

      desplazamiento += 30 + nombre.length + d.length;
      tamCentral += 46 + nombre.length;
    });

    var fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(4, 0, true); fin.setUint16(6, 0, true);
    fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true); fin.setUint32(16, desplazamiento, true); fin.setUint16(20, 0, true);

    return new Blob(partes.concat(central, [fin]), { type: 'application/zip' });
  }

  // Solo para pruebas fuera del navegador
  if (typeof module !== 'undefined' && module.exports) module.exports = { crearZip: crearZip, crc32: crc32 };
})();

 
