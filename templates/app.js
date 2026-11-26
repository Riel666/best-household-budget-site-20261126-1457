// Hearth & Ledger — the site's own interactivity (no network, no libraries).
// Data comes from data.js (window.HEARTH_DATA), written by main.ts.
// Added transactions and goal contributions are kept in localStorage so the
// household's own entries survive a reload; everything still works with
// JavaScript off except the filters, the forms and the sorting.
(function () {
  'use strict';
  var DATA = window.HEARTH_DATA || { categories: [], transactions: [], goals: [] };
  var store = {
    get: function (key, fallback) {
      try { var v = window.localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode: keep working in memory */ }
    },
  };
  var money = function (n) {
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var catLabel = function (key) {
    var c = DATA.categories.find(function (x) { return x.key === key; });
    return c ? c.label : key;
  };

  // ---------- sortable tables ----------
  document.querySelectorAll('table.data.sortable').forEach(function (table) {
    table.querySelectorAll('th button.sort').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var th = btn.closest('th');
        var col = Array.prototype.indexOf.call(th.parentNode.children, th);
        var type = btn.getAttribute('data-type') || 'text';
        var tbody = table.querySelector('tbody');
        var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
        var dir = btn.getAttribute('data-dir') === 'asc' ? -1 : 1;
        table.querySelectorAll('th button.sort').forEach(function (b) { b.removeAttribute('data-dir'); });
        btn.setAttribute('data-dir', dir === 1 ? 'asc' : 'desc');
        rows.sort(function (a, b) {
          var av = a.children[col].getAttribute('data-value') || a.children[col].textContent.trim();
          var bv = b.children[col].getAttribute('data-value') || b.children[col].textContent.trim();
          if (type === 'number') return dir * (parseFloat(av) - parseFloat(bv));
          return dir * av.localeCompare(bv);
        });
        rows.forEach(function (r) { tbody.appendChild(r); });
      });
    });
  });

  // ---------- transactions page: filter + add ----------
  var txTable = document.getElementById('tx-table');
  if (txTable) {
    var extra = store.get('hearth-extra-tx', []);
    var tbody = txTable.querySelector('tbody');
    var renderExtra = function () {
      tbody.querySelectorAll('tr.added').forEach(function (r) { r.remove(); });
      extra.forEach(function (t) {
        var tr = document.createElement('tr');
        tr.className = 'added';
        tr.setAttribute('data-category', t.category);
        tr.innerHTML = '<td>' + esc(t.date) + '</td><td>' + esc(t.merchant) + '</td>'
          + '<td>' + esc(catLabel(t.category)) + '</td>'
          + '<td class="num" data-value="' + t.amount + '">' + money(t.amount) + '</td>'
          + '<td>' + esc(t.note || 'Added on this device') + '</td>';
        tbody.prepend(tr);
      });
    };
    renderExtra();
    var applyFilter = function () {
      var cat = (document.getElementById('tx-category') || {}).value || '';
      var q = ((document.getElementById('tx-search') || {}).value || '').toLowerCase();
      var shown = 0;
      tbody.querySelectorAll('tr').forEach(function (tr) {
        var okCat = !cat || tr.getAttribute('data-category') === cat;
        var okQ = !q || tr.textContent.toLowerCase().indexOf(q) !== -1;
        tr.style.display = okCat && okQ ? '' : 'none';
        if (okCat && okQ) shown++;
      });
      var count = document.getElementById('tx-count');
      if (count) count.textContent = shown + ' of ' + tbody.querySelectorAll('tr').length + ' transactions shown';
    };
    ['tx-category', 'tx-search'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', applyFilter);
    });
    applyFilter();
    var form = document.getElementById('add-tx-form');
    if (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var amount = parseFloat(document.getElementById('tx-amount').value);
        if (!amount) return;
        var t = {
          date: document.getElementById('tx-date').value || new Date().toISOString().slice(0, 10),
          merchant: document.getElementById('tx-merchant').value.trim() || 'Unnamed',
          category: document.getElementById('tx-cat').value,
          amount: -Math.abs(amount),
          note: 'Added on this device',
        };
        extra.unshift(t);
        store.set('hearth-extra-tx', extra);
        renderExtra();
        applyFilter();
        form.reset();
        var done = document.getElementById('tx-added-note');
        if (done) done.textContent = 'Added ' + money(t.amount) + ' to ' + catLabel(t.category) + '. It is saved on this device.';
      });
    }
  }

  // ---------- budgets page: sort rows ----------
  var budgetList = document.getElementById('budget-list');
  var budgetSort = document.getElementById('budget-sort');
  if (budgetList && budgetSort) {
    budgetSort.addEventListener('change', function () {
      var rows = Array.prototype.slice.call(budgetList.querySelectorAll('.budget-row'));
      var mode = budgetSort.value;
      rows.sort(function (a, b) {
        var pa = parseFloat(a.getAttribute('data-pct'));
        var pb = parseFloat(b.getAttribute('data-pct'));
        if (mode === 'pct-desc') return pb - pa;
        if (mode === 'pct-asc') return pa - pb;
        if (mode === 'spent-desc') return parseFloat(b.getAttribute('data-spent')) - parseFloat(a.getAttribute('data-spent'));
        return a.getAttribute('data-label').localeCompare(b.getAttribute('data-label'));
      });
      rows.forEach(function (r) { budgetList.appendChild(r); });
    });
  }

  // ---------- goals page: contribute ----------
  var goalForm = document.getElementById('goal-form');
  if (goalForm) {
    var contribs = store.get('hearth-goal-contribs', {});
    var refreshGoals = function () {
      document.querySelectorAll('[data-goal]').forEach(function (card) {
        var key = card.getAttribute('data-goal');
        var goal = DATA.goals.find(function (g) { return g.key === key; });
        if (!goal) return;
        var saved = goal.saved + (contribs[key] || 0);
        var pct = Math.min(100, (saved / goal.target) * 100);
        var num = card.querySelector('.goal-saved');
        if (num) num.textContent = money(saved) + ' of ' + money(goal.target);
        var pctEl = card.querySelector('.pct');
        if (pctEl) pctEl.textContent = Math.round(pct) + '%';
        var bar = card.querySelector('.bar > i');
        if (bar) bar.style.width = pct.toFixed(1) + '%';
        var left = card.querySelector('.goal-left');
        if (left) left.textContent = money(Math.max(0, goal.target - saved)) + ' to go · ' + money(goal.monthly) + ' a month';
      });
    };
    refreshGoals();
    goalForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var key = document.getElementById('goal-pick').value;
      var amount = parseFloat(document.getElementById('goal-amount').value);
      if (!amount || amount <= 0) return;
      contribs[key] = (contribs[key] || 0) + amount;
      store.set('hearth-goal-contribs', contribs);
      refreshGoals();
      var done = document.getElementById('goal-added-note');
      var goal = DATA.goals.find(function (g) { return g.key === key; });
      if (done && goal) done.textContent = 'Added ' + money(amount) + ' to ' + goal.label + '. It is saved on this device.';
      goalForm.reset();
    });
  }
})();
