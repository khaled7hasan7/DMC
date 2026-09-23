(function () {
  'use strict';

  var STORAGE_KEY = 'dmc116-order';
  var ALIASES = { WHITE: 'BLANC', 'ابيض': 'BLANC', 'أبيض': 'BLANC', 'بلانك': 'BLANC', 'ايكرو': 'ECRU', 'إكرو': 'ECRU' };
  var LETTER_CODES = ['BLANC', 'ECRU', 'B5200'];

  // الأرقام المقبولة: قائمة Art. 116 إن وُجدت، وإلا أرقام DMC الأساسية.
  var hasArt116List = !!(window.ART116_CODES && window.ART116_CODES.length);
  var allowed = hasArt116List
    ? window.ART116_CODES.map(function (c) { return normalizeCode(c); })
    : Object.keys(window.DMC_COLORS);
  var allowedSet = new Set(allowed);

  var state = load();

  var $ = function (id) { return document.getElementById(id); };
  var codeInput = $('codeInput'), qtyInput = $('qtyInput');
  var addBtn = $('addBtn'), codeStatus = $('codeStatus'), codeSwatch = $('codeSwatch');

  if (!hasArt116List) {
    $('listNotice').hidden = false;
    $('listNotice').textContent = 'مؤقتاً: يتحقق الموقع من كل أرقام DMC الأساسية (' + allowed.length + ' لوناً) إلى أن تُضاف قائمة ألوان المقاس 8.';
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

  function perCarton() { return window.BALLS_PER_CARTON || 10; }
  function toBalls(qty, unit) { return unit === 'carton' ? qty * perCarton() : qty; }
  function unitName(unit) { return unit === 'carton' ? 'كرتونة' : 'كبة'; }
  function formatQty(item) { return item.qty + ' ' + unitName(item.unit); }

  function totalBalls() {
    return state.items.reduce(function (s, it) { return s + toBalls(it.qty, it.unit); }, 0);
  }

  function cartonsText(balls) {
    var cartons = Math.floor(balls / perCarton()), rest = balls % perCarton();
    if (!cartons) return rest + ' كبة';
    return cartons + ' كرتونة' + (rest ? ' و ' + rest + ' كبة' : '');
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'style') e.setAttribute('style', attrs[k]);
      else if (k.indexOf('aria-') === 0 || k === 'role' || k === 'dir') e.setAttribute(k, attrs[k]);
      else e[k] = attrs[k];
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  function swatch(code, extra) {
    return el('span', { class: 'swatch thread' + (extra ? ' ' + extra : ''), style: 'background-color:' + colorOf(code) });
  }

  function paintSwatch(node, code) {
    node.className = code ? 'swatch thread' + (node.classList.contains('big') ? ' big' : '') : 'swatch empty';
    node.style.backgroundColor = code ? colorOf(code) : '';
  }

  // ---------- التخزين ----------

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s && Array.isArray(s.items)) {
        return { items: s.items.filter(function (it) { return allowedSet.has(it.code) && it.qty > 0; }) };
      }
    } catch (e) { /* التخزين غير متاح */ }
    return { items: [] };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* تجاهل */ }
  }

  // ---------- أزرار الاختيار (كبة / كرتونة) والعدّاد ----------

  function segValue(seg) {
    var on = seg.querySelector('button.on');
    return on ? on.getAttribute('data-value') : null;
  }

  function setSeg(seg, value) {
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
      var on = b.getAttribute('data-value') === value;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  function makeSeg(value, onChange) {
    var seg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'الوحدة' }, [
      el('button', { type: 'button', role: 'radio', text: 'كبة' }),
      el('button', { type: 'button', role: 'radio', text: 'كرتونة' })
    ]);
    seg.children[0].setAttribute('data-value', 'ball');
    seg.children[1].setAttribute('data-value', 'carton');
    setSeg(seg, value);
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b.classList.contains('on')) return;
      setSeg(seg, b.getAttribute('data-value'));
      onChange(b.getAttribute('data-value'));
    });
    return seg;
  }

  function bindSeg(seg, onChange) {
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      setSeg(seg, b.getAttribute('data-value'));
      if (onChange) onChange(b.getAttribute('data-value'));
    });
  }

  function makeStepper(value, onChange) {
    var input = el('input', { type: 'number', min: 1, step: 1, value: value, inputMode: 'numeric', dir: 'ltr', 'aria-label': 'الكمية' });
    var wrap = el('div', { class: 'stepper' }, [
      el('button', { type: 'button', class: 'step', text: '−', 'aria-label': 'إنقاص' }),
      input,
      el('button', { type: 'button', class: 'step', text: '+', 'aria-label': 'زيادة' })
    ]);
    wrap.children[0].setAttribute('data-step', '-1');
    wrap.children[2].setAttribute('data-step', '1');
    input.addEventListener('change', function () {
      var v = parseInt(input.value, 10);
      if (v > 0) onChange(v); else input.value = value;
    });
    return wrap;
  }

  // أزرار + و − في كل الصفحة: تعدّل الحقل المجاور ثم تطلق حدث التغيير.
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.step');
    if (!b) return;
    var input = b.parentNode.querySelector('input');
    var v = Math.max(1, (parseInt(input.value, 10) || 1) + parseInt(b.getAttribute('data-step'), 10));
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---------- رسالة قصيرة أسفل الشاشة ----------

  var toastTimer = null;
  function toast(text, actionText, action) {
    var t = $('toast');
    t.innerHTML = '';
    t.appendChild(el('span', { text: text }));
    if (actionText) {
      var b = el('button', { type: 'button', text: actionText });
      b.addEventListener('click', function () { t.hidden = true; action(); });
      t.appendChild(b);
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, actionText ? 5000 : 2200);
  }

  // ---------- التحقق أثناء الكتابة ----------

  function rejectMessage(code, onPick) {
    var box = el('div', { class: 'msg err' });
    box.appendChild(el('div', {}, [
      '✗ الرقم ', el('b', { class: 'ltr', text: code }), ' غير موجود في ألوان ',
      el('span', { class: 'ltr', text: 'DMC Art. 116' }), '. لا يمكن إضافته.'
    ]));
    var sug = suggestions(code);
    if (sug.length) {
      var row = el('div', { class: 'suggest' }, [el('span', { text: 'هل تقصد:' })]);
      sug.forEach(function (c) {
        var chip = el('button', { type: 'button', class: 'chip' }, [swatch(c), c]);
        chip.addEventListener('click', function () { onPick(c); });
        row.appendChild(chip);
      });
      box.appendChild(row);
    }
    return box;
  }

  function quickLetters() {
    var codes = LETTER_CODES.filter(function (c) { return allowedSet.has(c); });
    if (!codes.length) return null;
    var row = el('div', { class: 'quick' }, [el('span', { class: 'hint', text: 'ألوان بالحروف:' })]);
    codes.forEach(function (c) {
      var chip = el('button', { type: 'button', class: 'chip' }, [swatch(c), c]);
      chip.addEventListener('click', function () { codeInput.value = c; checkCode(); });
      row.appendChild(chip);
    });
    return row;
  }

  function checkCode() {
    var code = normalizeCode(codeInput.value.trim());
    var wrap = $('codeWrap');
    codeStatus.innerHTML = '';
    wrap.classList.remove('valid', 'invalid');
    if (!code) {
      paintSwatch(codeSwatch, null);
      addBtn.disabled = true;
      var q = quickLetters();
      if (q) codeStatus.appendChild(q);
      return null;
    }
    if (allowedSet.has(code)) {
      wrap.classList.add('valid');
      paintSwatch(codeSwatch, code);
      var existing = findItem(code);
      codeStatus.appendChild(el('div', { class: 'msg ok' }, [
        '✓ الرقم ', el('b', { class: 'ltr', text: code }),
        existing ? ' موجود، وفي طلبيتك منه ' + formatQty(existing) + '. ستُجمع الكمية.' : ' موجود عند DMC.'
      ]));
      addBtn.disabled = !(parseInt(qtyInput.value, 10) > 0);
      return code;
    }
    wrap.classList.add('invalid');
    paintSwatch(codeSwatch, null);
    addBtn.disabled = true;
    codeStatus.appendChild(rejectMessage(code, function (c) { codeInput.value = c; checkCode(); }));
    return null;
  }

  // ---------- الطلبية ----------

  function findItem(code) {
    return state.items.find(function (it) { return it.code === code; });
  }

  function addItem(code, qty, unit) {
    var existing = findItem(code);
    if (!existing) { state.items.push({ code: code, qty: qty, unit: unit }); return; }
    if (existing.unit === unit) { existing.qty += qty; return; }
    // وحدتان مختلفتان: نحوّل الكل إلى كبب ثم نعيدها إلى كراتين إن أمكن.
    var balls = toBalls(existing.qty, existing.unit) + toBalls(qty, unit);
    if (balls % perCarton() === 0) { existing.qty = balls / perCarton(); existing.unit = 'carton'; }
    else { existing.qty = balls; existing.unit = 'ball'; }
  }

  var flashCode = null;

  function render() {
    var list = $('orderList');
    list.innerHTML = '';
    state.items.forEach(function (it, idx) {
      var del = el('button', { type: 'button', class: 'icon-btn', text: '×', 'aria-label': 'حذف ' + it.code });
      del.addEventListener('click', function () {
        var removed = state.items.splice(idx, 1)[0];
        commit();
        checkCode();
        toast('حُذف ' + removed.code, 'تراجع', function () {
          state.items.splice(Math.min(idx, state.items.length), 0, removed);
          commit();
        });
      });
      var li = el('li', {}, [
        swatch(it.code),
        el('div', { class: 'code' }, [
          el('b', { text: it.code }),
          el('span', { text: it.unit === 'carton' ? '= ' + toBalls(it.qty, it.unit) + ' كبة' : '' })
        ]),
        makeStepper(it.qty, function (v) { it.qty = v; commit(); }),
        makeSeg(it.unit, function (u) { it.unit = u; commit(); }),
        del
      ]);
      if (it.code === flashCode) li.classList.add('flash');
      list.appendChild(li);
    });
    flashCode = null;

    var n = state.items.length, has = n > 0, balls = totalBalls();
    $('orderEmpty').hidden = has;
    $('totals').hidden = !has;
    $('clearBtn').hidden = !has;
    $('orderBadge').hidden = !has;
    $('orderBadge').textContent = n;
    if (has) {
      var dl = $('totals');
      dl.innerHTML = '';
      [['عدد الألوان', n], ['مجموع الكبب', balls], ['بالكراتين', cartonsText(balls)]].forEach(function (p) {
        dl.appendChild(el('div', {}, [el('dt', { text: p[0] }), el('dd', { text: String(p[1]) })]));
      });
      $('summaryText').innerHTML = '';
      $('summaryText').appendChild(document.createTextNode(n + ' لون · ' + balls + ' كبة'));
      $('summaryText').appendChild(el('small', { text: 'ما يعادل ' + cartonsText(balls) }));
    } else {
      $('imageCard').hidden = true;
    }
    updateBars();
  }

  function updateBars() {
    var sheetOpen = !$('pickSheet').hidden;
    $('summaryBar').hidden = !state.items.length || sheetOpen;
    document.body.classList.toggle('has-bar', !$('summaryBar').hidden);
    document.body.classList.toggle('sheet-open', sheetOpen);
  }

  function commit() {
    save();
    render();
    renderColors();
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
    var first = parts.shift();
    var qty = 1, unit = 'ball';
    parts.forEach(function (p) {
      if (/^\d+$/.test(p)) qty = parseInt(p, 10);
      else if (/^(كرتون|كرتونة|كراتين|كرتونه|carton|box)/i.test(p)) unit = 'carton';
    });
    return { code: normalizeCode(first), first: first, qty: qty, unit: unit };
  }

  function bulkAdd() {
    var status = $('bulkStatus');
    status.innerHTML = '';
    var added = 0, rejected = [], kept = [];
    $('bulkInput').value.split(/\n/).forEach(function (line) {
      var p = parseLine(line);
      if (!p) return;
      if (allowedSet.has(p.code) && p.qty > 0) { addItem(p.code, p.qty, p.unit); added++; }
      else { rejected.push(p); kept.push(line); }
    });
    if (added) status.appendChild(el('div', { class: 'msg ok', text: '✓ أُضيف ' + added + ' لون إلى الطلبية.' }));
    rejected.forEach(function (p, i) {
      status.appendChild(rejectMessage(p.code, function (c) {
        kept[i] = kept[i].replace(p.first, c);
        $('bulkInput').value = kept.join('\n');
        bulkAdd();
      }));
    });
    // تبقى الأسطر المرفوضة فقط ليصححها المستخدم.
    $('bulkInput').value = kept.join('\n');
    if (added) commit();
  }

  // ---------- الصورة ----------

  function drawImage() {
    var canvas = $('orderCanvas');
    var ctx = canvas.getContext('2d');
    var W = 1080, pad = 48, cols = 3, gap = 20;
    var cardW = (W - pad * 2 - gap * (cols - 1)) / cols, cardH = 230;
    var rows = Math.max(1, Math.ceil(state.items.length / cols));
    var headH = 210, footH = 170;
    var H = headH + rows * cardH + (rows - 1) * gap + footH;
    canvas.width = W;
    canvas.height = H;
    var font = function (w, s, fam) { return w + ' ' + s + 'px ' + (fam || 'Cairo') + ', sans-serif'; };

    ctx.fillStyle = '#f7f4ef';
    ctx.fillRect(0, 0, W, H);

    // ملصق مثل علبة DMC: خلفية بيضاء وشريط أحمر ومربع المقاس.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, 160);
    ctx.fillStyle = '#e2483d';
    ctx.fillRect(0, 160, W, 14);

    ctx.textBaseline = 'alphabetic';
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1f1a17';
    ctx.font = font(800, 64);
    ctx.fillText('Art. 116', pad, 104);
    var artW = ctx.measureText('Art. 116').width;
    ctx.fillRect(pad + artW + 18, 50, 64, 64);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = font(800, 48);
    ctx.fillText('8', pad + artW + 50, 100);

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#1f1a17';
    ctx.font = font(700, 46, 'Reem Kufi');
    ctx.fillText('طلبية خيوط DMC', W - pad, 86);
    ctx.fillStyle = '#756a63';
    ctx.font = font(600, 26);
    var date = new Date().toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
    ctx.fillText(date, W - pad, 128);

    ctx.textAlign = 'center';
    state.items.forEach(function (it, i) {
      var r = Math.floor(i / cols), c = i % cols;
      var x = W - pad - (c + 1) * cardW - c * gap; // ترتيب من اليمين لليسار
      var y = headH + r * (cardH + gap);
      roundRect(ctx, x, y, cardW, cardH, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#e7e0d7';
      ctx.lineWidth = 2;
      ctx.stroke();

      var cx = x + cardW / 2;
      drawBall(ctx, cx, y + 72, 50, colorOf(it.code));

      ctx.fillStyle = '#1f1a17';
      ctx.direction = 'ltr';
      ctx.font = font(800, 44);
      ctx.fillText(it.code, cx, y + 170);
      ctx.direction = 'rtl';
      ctx.fillStyle = '#c62a2f';
      ctx.font = font(700, 28);
      ctx.fillText(formatQty(it), cx, y + 210);
    });

    var fy = headH + rows * cardH + (rows - 1) * gap + 40;
    roundRect(ctx, pad, fy, W - pad * 2, 100, 18);
    ctx.fillStyle = '#1f1a17';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 30);
    var balls = totalBalls();
    ctx.fillText('عدد الألوان: ' + state.items.length + '   •   مجموع الكبب: ' + balls, W / 2, fy + 45);
    ctx.font = font(600, 24);
    ctx.fillText('ما يعادل ' + cartonsText(balls) + ' (الكرتونة = ' + perCarton() + ' كبب)', W / 2, fy + 82);

    $('orderImage').src = canvas.toDataURL('image/png');
    prepareImageFile();
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

  // رسم كبة خيط: دائرة باللون مع خطوط لفّ خفيفة وظل.
  function drawBall(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = isDark(color) ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 2;
    for (var k = -r; k <= r; k += 9) {
      ctx.beginPath();
      ctx.ellipse(cx, cy + k * 0.3, r * 1.1, Math.abs(k) * 0.5 + 6, -0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.3)');
    g.addColorStop(0.3, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.2)');
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

  function openImage() {
    showView('order');
    var ready = document.fonts && document.fonts.load
      ? Promise.all([
          document.fonts.load('800 40px Cairo'),
          document.fonts.load('600 20px Cairo'),
          document.fonts.load('700 40px "Reem Kufi"')
        ]).catch(function () {})
      : Promise.resolve();
    ready.then(function () {
      $('imageCard').hidden = false;
      $('shareNote').hidden = true;
      drawImage();
      $('imageCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ---------- التحميل والمشاركة ----------

  var imageFile = null; // ملف الصورة جاهز مسبقاً حتى تعمل المشاركة مباشرة عند الضغط

  function prepareImageFile() {
    imageFile = null;
    canvasBlob().then(function (blob) {
      imageFile = new File([blob], fileName(), { type: 'image/png' });
    });
    $('waBtn').href = 'https://wa.me/?text=' + encodeURIComponent(orderText());
  }

  function orderText() {
    var lines = ['طلبية خيوط DMC Art. 116 مقاس 8', ''];
    state.items.forEach(function (it) { lines.push('• ' + it.code + ' — ' + formatQty(it)); });
    lines.push('', 'عدد الألوان: ' + state.items.length);
    lines.push('مجموع الكبب: ' + totalBalls() + ' (' + cartonsText(totalBalls()) + ')');
    return lines.join('\n');
  }

  function shareNote(text, withLink) {
    var note = $('shareNote');
    note.innerHTML = '';
    note.appendChild(document.createTextNode(text));
    if (withLink) {
      note.appendChild(document.createTextNode(' '));
      note.appendChild(el('a', { href: $('waBtn').href, target: '_blank', rel: 'noopener', text: 'افتح واتساب مع نص الطلبية' }));
    }
    note.hidden = false;
  }

  // داخل صفحة Claude يمر التحميل عبر نافذة تأكيد، وخارجها رابط تحميل عادي.
  function saveImage() {
    return canvasBlob().then(function (blob) {
      var use = window.claude && window.claude.use ? window.claude.use('downloads') : Promise.resolve(null);
      return use.then(function (downloads) {
        if (downloads) {
          return downloads.save({ filename: fileName(), data: blob }).then(
            function () { toast('تم حفظ الصورة'); },
            function (err) {
              if (err && err.code === 'declined') return;
              shareNote('تعذّر حفظ الصورة هنا. اضغط مطولاً على الصورة لحفظها.');
            });
        }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName();
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        toast('تم تحميل الصورة');
      });
    });
  }

  // ---------- تصفح الألوان ----------

  var FAMILIES = [
    { id: 'white', name: 'أبيض وكريمي', dot: '#F7F3EA' },
    { id: 'gray', name: 'رمادي وأسود', dot: '#6C6C6C' },
    { id: 'red', name: 'أحمر', dot: '#C72B3B' },
    { id: 'pink', name: 'وردي', dot: '#F08BA6' },
    { id: 'orange', name: 'برتقالي', dot: '#F27A2B' },
    { id: 'yellow', name: 'أصفر', dot: '#F5C83B' },
    { id: 'green', name: 'أخضر', dot: '#3F8F47' },
    { id: 'blue', name: 'أزرق وتركوازي', dot: '#3A6FB0' },
    { id: 'purple', name: 'بنفسجي', dot: '#7B4B94' },
    { id: 'brown', name: 'بني وبيج', dot: '#8A5A36' }
  ];

  function hsl(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, sat = 0;
    if (max !== min) {
      var d = max - min;
      sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: sat, l: l };
  }

  function familyOf(code) {
    var c = hsl(colorOf(code));
    if (c.l > 0.9) return 'white';
    if (c.s < 0.1 || c.l < 0.08) return 'gray';
    if (c.h >= 15 && c.h < 70 && (c.l < 0.4 || c.s < 0.4)) return 'brown';
    if (c.h < 12 || c.h >= 345) return c.l > 0.7 ? 'pink' : 'red';
    if (c.h < 42) return c.l > 0.8 ? 'pink' : 'orange';
    if (c.h < 70) return 'yellow';
    if (c.h < 165) return 'green';
    if (c.h < 250) return 'blue';
    if (c.h < 318) return 'purple';
    return 'pink';
  }

  var browse = { family: 'all', sort: 'family', selected: null };
  var colorsView = $('colorsView');

  function codeSortKey(c) { return /^\d+$/.test(c) ? parseInt(c, 10) : -1; }

  function renderColors() {
    if (colorsView.hidden) return;
    var q = normalizeCode($('colorSearch').value);
    var inOrder = {};
    state.items.forEach(function (it) { inOrder[it.code] = it; });

    var codes = allowed.filter(function (c) {
      return (!q || c.indexOf(q) === 0) && (browse.family === 'all' || familyOf(c) === browse.family);
    });
    $('colorCount').textContent = codes.length + ' لوناً';

    var chips = $('familyChips');
    chips.innerHTML = '';
    [{ id: 'all', name: 'الكل' }].concat(FAMILIES).forEach(function (f) {
      var chip = el('button', { type: 'button', class: 'chip' + (browse.family === f.id ? ' active' : '') },
        [f.dot ? el('span', { class: 'dot', style: 'background:' + f.dot }) : null, f.name]);
      chip.setAttribute('aria-pressed', String(browse.family === f.id));
      chip.addEventListener('click', function () { browse.family = f.id; renderColors(); });
      chips.appendChild(chip);
    });

    var groups = browse.sort === 'number'
      ? [{ name: '', codes: codes.slice().sort(function (a, b) { return codeSortKey(a) - codeSortKey(b) || a.localeCompare(b); }) }]
      : FAMILIES.map(function (f) {
          return {
            name: f.name,
            codes: codes.filter(function (c) { return familyOf(c) === f.id; })
              .sort(function (a, b) { return hsl(colorOf(b)).l - hsl(colorOf(a)).l; })
          };
        }).filter(function (g) { return g.codes.length; });

    var box = $('colorGroups');
    box.innerHTML = '';
    if (!codes.length) {
      box.appendChild(el('p', { class: 'empty-state hint', text: 'لا يوجد لون بهذا الرقم.' }));
      return;
    }
    groups.forEach(function (g) {
      var grid = el('div', { class: 'tile-grid' });
      g.codes.forEach(function (c) {
        var tile = el('button', { type: 'button', class: 'tile' + (browse.selected === c ? ' selected' : ''), 'aria-label': 'لون ' + c }, [
          swatch(c, 'big'),
          el('span', { class: 'num', text: c }),
          inOrder[c] ? el('span', { class: 'in-order', text: formatQty(inOrder[c]) }) : null
        ]);
        tile.addEventListener('click', function () { openPick(c); });
        grid.appendChild(tile);
      });
      box.appendChild(el('section', { class: 'group' }, [
        g.name ? el('h3', {}, [g.name + ' ', el('small', { text: '(' + g.codes.length + ')' })]) : null,
        grid
      ]));
    });
  }

  function openPick(code) {
    browse.selected = code;
    paintSwatch($('pickSwatch'), code);
    $('pickCode').textContent = code;
    var have = findItem(code);
    $('pickHave').textContent = have ? 'في طلبيتك: ' + formatQty(have) : 'غير مضاف بعد';
    $('pickQty').value = 1;
    setSeg($('pickSeg'), 'ball');
    $('pickSheet').hidden = false;
    updateBars();
    renderColors();
  }

  function closePick() {
    browse.selected = null;
    $('pickSheet').hidden = true;
    updateBars();
    renderColors();
  }

  function showView(which) {
    var colors = which === 'colors';
    $('orderView').hidden = colors;
    colorsView.hidden = !colors;
    $('tabOrder').classList.toggle('active', !colors);
    $('tabColors').classList.toggle('active', colors);
    $('tabOrder').setAttribute('aria-selected', String(!colors));
    $('tabColors').setAttribute('aria-selected', String(colors));
    if (colors) renderColors(); else if (!$('pickSheet').hidden) closePick();
  }

  // ---------- الأحداث ----------

  codeInput.addEventListener('input', checkCode);
  qtyInput.addEventListener('input', checkCode);
  bindSeg($('unitSeg'));
  bindSeg($('pickSeg'));
  bindSeg($('sortSeg'), function (v) { browse.sort = v; renderColors(); });

  $('addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = checkCode();
    var qty = parseInt(qtyInput.value, 10);
    if (!code || !(qty > 0)) { codeInput.focus(); return; }
    var unit = segValue($('unitSeg'));
    addItem(code, qty, unit);
    flashCode = code;
    commit();
    toast('أُضيف ' + code + ' · ' + qty + ' ' + unitName(unit));
    codeInput.value = '';
    qtyInput.value = 1;
    setSeg($('unitSeg'), 'ball');
    checkCode();
    codeInput.focus();
  });

  $('bulkBtn').addEventListener('click', bulkAdd);

  var clearArmed = null;
  $('clearBtn').addEventListener('click', function () {
    var btn = $('clearBtn');
    // تأكيد داخل الصفحة: الضغطة الأولى تطلب التأكيد والثانية تمسح.
    if (!clearArmed) {
      btn.textContent = 'اضغط مرة أخرى للمسح';
      clearArmed = setTimeout(function () { clearArmed = null; btn.textContent = 'مسح الكل'; }, 4000);
      return;
    }
    clearTimeout(clearArmed);
    clearArmed = null;
    btn.textContent = 'مسح الكل';
    var backup = state.items.slice();
    state.items = [];
    commit();
    checkCode();
    toast('مُسحت الطلبية', 'تراجع', function () { state.items = backup; commit(); });
  });

  $('imageBtn').addEventListener('click', openImage);
  $('downloadBtn').addEventListener('click', saveImage);

  // زر واتساب: على الجوال تفتح قائمة المشاركة ومعها الصورة (اختر واتساب منها).
  // إذا لم يدعم المتصفح مشاركة الصور يفتح واتساب مباشرة مع نص الطلبية.
  $('waBtn').addEventListener('click', function (e) {
    if (!imageFile || !navigator.canShare || !navigator.canShare({ files: [imageFile] })) return;
    e.preventDefault();
    navigator.share({ files: [imageFile], text: orderText() }).catch(function (err) {
      if (err && err.name === 'AbortError') return;
      shareNote('المتصفح هنا لا يسمح بإرسال الصورة مباشرة. حمّل الصورة أولاً ثم أرفقها في المحادثة، أو', true);
    });
  });

  $('tabOrder').addEventListener('click', function () { showView('order'); });
  $('tabColors').addEventListener('click', function () { showView('colors'); });
  $('goColors').addEventListener('click', function () { showView('colors'); });
  $('colorSearch').addEventListener('input', renderColors);
  $('pickClose').addEventListener('click', closePick);
  $('pickAdd').addEventListener('click', function () {
    var qty = parseInt($('pickQty').value, 10);
    var code = browse.selected;
    if (!code || !(qty > 0)) return;
    var unit = segValue($('pickSeg'));
    addItem(code, qty, unit);
    closePick();
    commit();
    toast('أُضيف ' + code + ' · ' + qty + ' ' + unitName(unit));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('pickSheet').hidden) closePick();
  });

  render();
  checkCode();
  if (location.hash === '#colors') showView('colors');
})();
