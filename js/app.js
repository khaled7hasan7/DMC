(function () {
  'use strict';

  var STORAGE_KEY = 'dmc116-order';
  var ALIASES = { WHITE: 'BLANC', 'ابيض': 'BLANC', 'أبيض': 'BLANC', 'بلانك': 'BLANC', 'ايكرو': 'ECRU', 'إكرو': 'ECRU' };

  // الأرقام المقبولة: قائمة Art. 116 إن وُجدت، وإلا أرقام DMC الأساسية.
  var allowed = window.ART116_CODES && window.ART116_CODES.length
    ? window.ART116_CODES.map(function (c) { return normalizeCode(c); })
    : Object.keys(window.DMC_COLORS);
  var allowedSet = new Set(allowed);

  var state = load();

  var $ = function (id) { return document.getElementById(id); };
  var codeInput = $('codeInput'), qtyInput = $('qtyInput'), unitInput = $('unitInput');
  var addBtn = $('addBtn'), codeStatus = $('codeStatus'), codeSwatch = $('codeSwatch');
  var perCartonInput = $('perCartonInput');

  if (!(window.ART116_CODES && window.ART116_CODES.length)) {
    $('listNotice').hidden = false;
    $('listNotice').textContent = 'تنبيه: قائمة ألوان Art. 116 الخاصة لم تُضَف بعد، لذلك يتحقق الموقع حالياً من أرقام DMC الأساسية كلها (' + allowed.length + ' لوناً).';
  }

  // ---------- أدوات ----------

  function normalizeCode(raw) {
    var s = String(raw || '')
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/\s+/g, '')
      .toUpperCase();
    if (ALIASES[s]) return ALIASES[s];
    if (/^\d+$/.test(s)) s = String(parseInt(s, 10));
    return s;
  }

  function colorOf(code) { return window.DMC_COLORS[code] || '#cccccc'; }

  function levenshtein(a, b) {
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function suggestions(code, n) {
    var num = parseInt(code, 10);
    return allowed
      .map(function (c) {
        var cn = parseInt(c, 10);
        var numDist = isNaN(num) || isNaN(cn) ? 1e6 : Math.abs(num - cn);
        return { c: c, d: levenshtein(code, c), n: numDist };
      })
      .sort(function (x, y) { return x.d - y.d || x.n - y.n; })
      .slice(0, n || 4)
      .map(function (x) { return x.c; });
  }

  function perCarton() { return Math.max(1, parseInt(state.perCarton, 10) || window.BALLS_PER_CARTON || 10); }

  function toBalls(qty, unit) { return unit === 'carton' ? qty * perCarton() : qty; }

  function formatQty(item) {
    return item.qty + ' ' + (item.unit === 'carton' ? 'كرتونة' : 'كبة');
  }

  function totalBalls() {
    return state.items.reduce(function (s, it) { return s + toBalls(it.qty, it.unit); }, 0);
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'style') e.setAttribute('style', attrs[k]);
      else e[k] = attrs[k];
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function swatch(code) { return el('span', { class: 'swatch', style: 'background:' + colorOf(code) }); }

  // ---------- التخزين ----------

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s && Array.isArray(s.items)) {
        s.items = s.items.filter(function (it) { return allowedSet.has(it.code); });
        return s;
      }
    } catch (e) { /* تخزين غير متاح */ }
    return { items: [], perCarton: window.BALLS_PER_CARTON || 10 };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* تجاهل */ }
  }

  // ---------- التحقق أثناء الكتابة ----------

  function rejectMessage(code, onPick) {
    var box = el('div', { class: 'msg err' });
    box.appendChild(el('div', {}, [
      document.createTextNode('✗ الرقم '),
      el('b', { class: 'ltr', text: code }),
      document.createTextNode(' غير موجود في ألوان '),
      el('span', { class: 'ltr', text: 'DMC Art. 116' }),
      document.createTextNode('. لا يمكن إضافته.')
    ]));
    var sug = suggestions(code);
    if (sug.length) {
      var row = el('div', { class: 'suggest' }, [el('span', { text: 'هل تقصد:' })]);
      sug.forEach(function (c) {
        var chip = el('button', { type: 'button', class: 'chip' }, [swatch(c), document.createTextNode(c)]);
        chip.addEventListener('click', function () { onPick(c); });
        row.appendChild(chip);
      });
      box.appendChild(row);
    }
    return box;
  }

  function checkCode() {
    var raw = codeInput.value.trim();
    var code = normalizeCode(raw);
    var wrap = codeInput.parentNode;
    codeStatus.innerHTML = '';
    wrap.classList.remove('valid', 'invalid');
    if (!code) {
      codeSwatch.className = 'swatch empty';
      codeSwatch.style.background = '';
      addBtn.disabled = true;
      return null;
    }
    if (allowedSet.has(code)) {
      wrap.classList.add('valid');
      codeSwatch.className = 'swatch';
      codeSwatch.style.background = colorOf(code);
      var existing = state.items.find(function (it) { return it.code === code; });
      codeStatus.appendChild(el('div', { class: 'msg ok' }, [
        document.createTextNode('✓ الرقم '),
        el('b', { class: 'ltr', text: code }),
        document.createTextNode(existing ? ' موجود، وهو مضاف في الطلبية (' + formatQty(existing) + ') وستُجمع الكمية.' : ' موجود عند DMC.')
      ]));
      addBtn.disabled = !(parseInt(qtyInput.value, 10) > 0);
      return code;
    }
    wrap.classList.add('invalid');
    codeSwatch.className = 'swatch empty';
    codeSwatch.style.background = '';
    addBtn.disabled = true;
    codeStatus.appendChild(rejectMessage(code, function (c) {
      codeInput.value = c;
      checkCode();
      qtyInput.focus();
      qtyInput.select();
    }));
    return null;
  }

  // ---------- الطلبية ----------

  function addItem(code, qty, unit) {
    var existing = state.items.find(function (it) { return it.code === code; });
    if (existing) {
      if (existing.unit === unit) {
        existing.qty += qty;
      } else {
        // وحدتان مختلفتان: نحوّل الكل إلى كبب ثم نعيدها إلى كراتين إن أمكن.
        var balls = toBalls(existing.qty, existing.unit) + toBalls(qty, unit);
        if (balls % perCarton() === 0) { existing.qty = balls / perCarton(); existing.unit = 'carton'; }
        else { existing.qty = balls; existing.unit = 'ball'; }
      }
    } else {
      state.items.push({ code: code, qty: qty, unit: unit });
    }
  }

  function render() {
    var list = $('orderList');
    list.innerHTML = '';
    state.items.forEach(function (it, idx) {
      var q = el('input', { type: 'number', min: 1, step: 1, value: it.qty, inputMode: 'numeric' });
      q.setAttribute('dir', 'ltr');
      q.addEventListener('change', function () {
        var v = parseInt(q.value, 10);
        if (v > 0) { it.qty = v; } else { q.value = it.qty; }
        commit();
      });
      var u = el('select', {}, [
        el('option', { value: 'ball', text: 'كبة' }),
        el('option', { value: 'carton', text: 'كرتونة' })
      ]);
      u.value = it.unit;
      u.addEventListener('change', function () { it.unit = u.value; commit(); });
      var del = el('button', { type: 'button', class: 'del', title: 'حذف', text: '×' });
      del.setAttribute('aria-label', 'حذف ' + it.code);
      del.addEventListener('click', function () { state.items.splice(idx, 1); commit(); checkCode(); });
      list.appendChild(el('li', {}, [
        swatch(it.code),
        el('span', { class: 'num', text: it.code }),
        el('span', { class: 'qty-edit' }, [q, u]),
        el('span', { class: 'balls', text: it.unit === 'carton' ? '= ' + toBalls(it.qty, it.unit) + ' كبة' : '' }),
        del
      ]));
    });

    var has = state.items.length > 0;
    $('orderEmpty').hidden = has;
    $('totals').hidden = !has;
    $('imageBtn').disabled = !has;
    $('clearBtn').disabled = !has;
    if (has) {
      var balls = totalBalls();
      var cartons = Math.floor(balls / perCarton()), rest = balls % perCarton();
      $('totals').innerHTML = '';
      [['عدد الألوان', state.items.length],
       ['مجموع الكبب', balls],
       ['بالكراتين', cartons + ' كرتونة' + (rest ? ' + ' + rest + ' كبة' : '')]
      ].forEach(function (p) {
        $('totals').appendChild(el('span', {}, [document.createTextNode(p[0] + ': '), el('b', { text: String(p[1]) })]));
      });
    }
    perCartonInput.value = perCarton();
  }

  function commit() {
    save();
    render();
    if (!$('imageCard').hidden) drawImage();
  }

  // ---------- إدخال القائمة دفعة واحدة ----------

  function parseLine(line) {
    var s = line
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[×xX*:=\-–,،]/g, ' ')
      .trim();
    if (!s) return null;
    var parts = s.split(/\s+/);
    var code = normalizeCode(parts.shift());
    var qty = 1, unit = 'ball';
    parts.forEach(function (p) {
      if (/^\d+$/.test(p)) qty = parseInt(p, 10);
      else if (/^(كرتون|كرتونة|كراتين|كرتونه|carton|box)/i.test(p)) unit = 'carton';
    });
    return { code: code, qty: qty, unit: unit, raw: line.trim() };
  }

  function bulkAdd() {
    var status = $('bulkStatus');
    status.innerHTML = '';
    var lines = $('bulkInput').value.split(/\n/);
    var added = [], rejected = [], kept = [];
    lines.forEach(function (line) {
      var p = parseLine(line);
      if (!p) return;
      if (allowedSet.has(p.code) && p.qty > 0) { addItem(p.code, p.qty, p.unit); added.push(p); }
      else { rejected.push(p); kept.push(line); }
    });
    if (added.length) {
      status.appendChild(el('div', { class: 'msg ok', text: '✓ تمت إضافة ' + added.length + ' لون إلى الطلبية.' }));
    }
    rejected.forEach(function (p, i) {
      status.appendChild(rejectMessage(p.code, function (c) {
        kept[i] = kept[i].replace(new RegExp('^\\s*' + p.raw.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), c);
        $('bulkInput').value = kept.join('\n');
        bulkAdd();
      }));
    });
    // نترك الأسطر المرفوضة فقط ليصححها المستخدم.
    $('bulkInput').value = kept.join('\n');
    if (added.length) commit();
  }

  // ---------- الصورة ----------

  function drawImage() {
    var canvas = $('orderCanvas');
    var ctx = canvas.getContext('2d');
    var W = 1080, pad = 48, cols = 3, gap = 20;
    var cardW = (W - pad * 2 - gap * (cols - 1)) / cols, cardH = 230;
    var rows = Math.ceil(state.items.length / cols);
    var headH = 190, footH = 170;
    var H = headH + rows * cardH + (rows - 1) * gap + footH;
    canvas.width = W;
    canvas.height = H;
    var font = function (w, s) { return w + ' ' + s + 'px Cairo, sans-serif'; };

    ctx.fillStyle = '#f6f2ec';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#b3263a';
    ctx.fillRect(0, 0, W, 150);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.font = font(800, 50);
    ctx.fillText('طلبية خيوط DMC Art. 116', W / 2, 78);
    ctx.font = font(600, 26);
    var date = new Date().toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
    ctx.fillText(date, W / 2, 122);

    state.items.forEach(function (it, i) {
      var r = Math.floor(i / cols), c = i % cols;
      var x = W - pad - (c + 1) * cardW - c * gap; // ترتيب من اليمين لليسار
      var y = headH + r * (cardH + gap);
      roundRect(ctx, x, y, cardW, cardH, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#e6ddd3';
      ctx.lineWidth = 2;
      ctx.stroke();

      var cx = x + cardW / 2, cy = y + 72, rad = 50;
      drawBall(ctx, cx, cy, rad, colorOf(it.code));

      ctx.fillStyle = '#2b2320';
      ctx.direction = 'ltr';
      ctx.font = font(800, 44);
      ctx.fillText(it.code, cx, y + 170);
      ctx.direction = 'rtl';
      ctx.fillStyle = '#b3263a';
      ctx.font = font(700, 28);
      ctx.fillText(formatQty(it), cx, y + 210);
    });

    var fy = headH + rows * cardH + (rows - 1) * gap + 40;
    roundRect(ctx, pad, fy, W - pad * 2, 100, 18);
    ctx.fillStyle = '#2b2320';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 30);
    var balls = totalBalls(), cartons = Math.floor(balls / perCarton()), rest = balls % perCarton();
    ctx.fillText('عدد الألوان: ' + state.items.length + '   •   مجموع الكبب: ' + balls, W / 2, fy + 45);
    ctx.font = font(600, 24);
    ctx.fillText('ما يعادل ' + cartons + ' كرتونة' + (rest ? ' و ' + rest + ' كبة' : '') + ' (الكرتونة = ' + perCarton() + ' كبب)', W / 2, fy + 82);
    $('orderImage').src = canvas.toDataURL('image/png');
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // رسم كبة خيط بسيطة: دائرة باللون مع خطوط لفّ وظل.
  function drawBall(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = isDark(color) ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    for (var k = -r; k <= r; k += 9) {
      ctx.beginPath();
      ctx.ellipse(cx, cy + k * 0.3, r * 1.1, Math.abs(k) * 0.5 + 6, -0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function isDark(hex) {
    var n = parseInt(hex.slice(1), 16);
    return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 90;
  }

  function canvasBlob() {
    return new Promise(function (res) { $('orderCanvas').toBlob(res, 'image/png'); });
  }

  function fileName() { return 'DMC-116-' + new Date().toISOString().slice(0, 10) + '.png'; }

  // ---------- الأحداث ----------

  codeInput.addEventListener('input', checkCode);
  qtyInput.addEventListener('input', checkCode);

  $('addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = checkCode();
    var qty = parseInt(qtyInput.value, 10);
    if (!code || !(qty > 0)) { codeInput.focus(); return; }
    addItem(code, qty, unitInput.value);
    commit();
    codeInput.value = '';
    qtyInput.value = 1;
    checkCode();
    codeInput.focus();
  });

  $('bulkBtn').addEventListener('click', bulkAdd);

  perCartonInput.addEventListener('change', function () {
    var v = parseInt(perCartonInput.value, 10);
    if (v > 0) state.perCarton = v;
    commit();
  });

  var clearArmed = null;
  $('clearBtn').addEventListener('click', function () {
    var btn = $('clearBtn');
    // تأكيد داخل الصفحة: الضغطة الأولى تطلب التأكيد والثانية تمسح.
    if (!clearArmed) {
      btn.textContent = 'اضغط مرة أخرى للتأكيد';
      clearArmed = setTimeout(function () { clearArmed = null; btn.textContent = 'مسح الطلبية'; }, 4000);
      return;
    }
    clearTimeout(clearArmed);
    clearArmed = null;
    btn.textContent = 'مسح الطلبية';
    state.items = [];
    $('imageCard').hidden = true;
    commit();
    checkCode();
  });

  $('imageBtn').addEventListener('click', function () {
    var ready = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('800 40px Cairo'), document.fonts.load('600 20px Cairo')]).catch(function () {})
      : Promise.resolve();
    ready.then(function () {
      $('imageCard').hidden = false;
      drawImage();
      $('imageCard').scrollIntoView({ behavior: 'smooth' });
    });
  });

  $('downloadBtn').addEventListener('click', function () {
    canvasBlob().then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName();
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });
  });

  if (navigator.canShare) {
    $('shareBtn').hidden = false;
    $('shareBtn').addEventListener('click', function () {
      canvasBlob().then(function (blob) {
        var file = new File([blob], fileName(), { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'طلبية خيوط DMC Art. 116' }).catch(function () {});
        }
      });
    });
  }

  render();
})();
