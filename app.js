/* FuzzyLab browser dashboard: no dependencies, APIs, cookies, or analytics. */
(function () {
  'use strict';
  const E = window.FuzzyEngine;
  if (!E) {
    document.body.textContent = 'Fuzzy engine could not load. Please keep fuzzy-engine.js beside index.html.';
    return;
  }

  const $ = (id) => document.getElementById(id);
  const ids = ['attendance', 'assignment', 'exam', 'participation'];
  const colors = {
    Low: '#e97875', Medium: '#f0b857', High: '#20bda4',
    Poor: '#ed6b7a', Average: '#f2b85b', Good: '#5c94f5', Excellent: '#1fbaa0',
  };
  const names = { attendance: 'Attendance', assignment: 'Assignment', exam: 'Exam', participation: 'Participation' };
  let currentResult;
  let activePreset = 'balanced';

  function format(value, precision = 2) { return Number(value).toFixed(precision); }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function formatInput(id, value) { return id === 'participation' ? String(Number(value)) : String(Math.round(value)); }
  function getInputs() {
    return Object.fromEntries(ids.map((id) => [id, Number($(id + '-range').value)]));
  }
  function setField(id, value) {
    const config = E.INPUT_VARS[id];
    const number = Number(value);
    const safe = Math.max(config.min, Math.min(config.max, Number.isFinite(number) ? number : config.min));
    const rounded = id === 'participation' ? Math.round(safe * 2) / 2 : Math.round(safe);
    const slider = $(id + '-range');
    slider.value = rounded;
    $(id + '-number').value = formatInput(id, rounded);
    const percent = (rounded - config.min) / (config.max - config.min) * 100;
    slider.style.setProperty('--progress', `${percent}%`);
  }
  function selectPreset(id) {
    activePreset = id;
    document.querySelectorAll('[data-preset]').forEach((button) => {
      const selected = button.dataset.preset === id;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  function applyPreset(id) {
    const preset = E.PRESETS[id];
    if (!preset) return;
    for (const key of ids) setField(key, preset[key]);
    selectPreset(id);
    update();
  }

  function setText(id, text) { $(id).textContent = text; }
  function setLevelTag(element, level) {
    element.className = 'level-pill level-' + level.toLowerCase();
    element.textContent = level;
  }

  function renderMetrics(r) {
    setText('metric-score', format(r.score));
    setText('metric-level', r.level);
    setText('metric-rules', r.firedRules.length);
    setText('ring-score', format(r.score, 1));
    setLevelTag($('result-level'), r.level);
    setText('centroid-value', `CENTROID ${format(r.score)}`);
    const descriptions = {
      Poor: ['Further support may be useful', 'The configured rules indicate stronger contributions from lower performance bands for this profile.'],
      Average: ['A developing performance profile', 'The combined fuzzy rules place the centroid closest to the Average output set.'],
      Good: ['A positive performance profile', 'The overlapping rule contributions produce a centroid closest to the Good output set.'],
      Excellent: ['A strong performance profile', 'Activated rules put most of the aggregated output in the Excellent fuzzy region.'],
    };
    const [headline, body] = descriptions[r.level];
    setText('result-heading', headline);
    setText('result-explanation', body);
    const scoreDial = $('score-ring');
    scoreDial.style.setProperty('--ring-color', colors[r.level]);
    scoreDial.style.setProperty('--ring-score', `${Math.max(0, Math.min(100, r.score))}%`);
  }

  function renderInputMemberships(r) {
    $('input-memberships').innerHTML = ids.map((key) => {
      const max = E.INPUT_VARS[key].max;
      const unit = max === 10 ? ' / 10' : max === 100 && key === 'attendance' ? '%' : ' / 100';
      const bars = Object.entries(r.memberships[key]).map(([name, degree]) => `
        <div class="membership-bar"><div class="membership-bar-caption"><span>${name}</span><b>${format(degree)}</b></div>
        <div class="membership-track" aria-label="${names[key]} ${name} membership ${format(degree)}"><div class="membership-fill ${name.toLowerCase()}" style="width:${Math.max(0, Math.min(100, degree * 100))}%"></div></div></div>`).join('');
      return `<div class="membership-item"><div class="membership-item-header"><strong>${names[key]}</strong><span>${formatInput(key, r.inputs[key])}${unit}</span></div><div class="membership-bars">${bars}</div></div>`;
    }).join('');
  }

  function table(rows, headings) {
    return `<table><thead><tr>${headings.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
  function renderTopRules(r) {
    const strongest = r.firedRules.slice(0, 5);
    const rows = strongest.map((rule) => `<tr><td><span class="rule-id">R${rule.id}</span></td>
      <td class="rule-text">${escapeHTML(rule.text)}</td>
      <td class="rule-strength">${format(rule.strength, 3)}</td>
      <td><span class="rule-status">${rule.output}</span></td></tr>`);
    $('top-rules').className = 'table-scroller';
    $('top-rules').innerHTML = table(rows, ['Rule', 'IF–THEN statement', 'Strength', 'Outcome']);
  }
  function renderRuleExplorer(r) {
    const activeOnly = $('only-active').checked;
    const rules = (activeOnly ? r.firedRules : r.rules);
    const rows = rules.map((rule) => `<tr><td><span class="rule-id">R${rule.id}</span></td>
       <td class="rule-text">${escapeHTML(rule.text)}</td>
       <td>${rule.degrees.map((deg) => format(deg, 3)).join(' · ')}</td>
       <td class="rule-strength">${format(rule.strength, 3)}</td>
       <td><span class="rule-status ${rule.strength === 0 ? 'inactive' : ''}">${rule.strength > 0 ? 'Fired' : 'Inactive'}</span></td></tr>`);
    $('rules-table').innerHTML = table(rows, ['ID', 'Full fuzzy IF–THEN rule', 'Antecedent degrees', 'Strength', 'Status']);
  }

  function chartSVG(points, options = {}) {
    const W = options.width ?? 920;
    const H = options.height ?? 292;
    const margin = { top: 16, left: 45, right: 16, bottom: 39 };
    const xMax = options.xMax ?? 100;
    const xmin = margin.left, xmax = W - margin.right, yTop = margin.top, yBottom = H - margin.bottom;
    const x = (val) => xmin + val / xMax * (xmax - xmin);
    const y = (val) => yBottom - Math.max(0, Math.min(1, val)) * (yBottom - yTop);
    const path = (items) => items.map(([val, deg], i) => `${i ? 'L' : 'M'}${x(val).toFixed(2)},${y(deg).toFixed(2)}`).join(' ');
    const line = (items, color, width = 2.1, extras = '') => `<path d="${path(items)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" ${extras}/>`;
    const area = (items, color, opacity = .12) => `<path d="${path(items)} L ${x(items[items.length - 1][0])},${yBottom} L ${x(items[0][0])},${yBottom} Z" fill="${color}" opacity="${opacity}"/>`;
    const ticks = [0, .25, .5, .75, 1].map((t) => `<line x1="${xmin}" x2="${xmax}" y1="${y(t)}" y2="${y(t)}" stroke="#e9eff3" stroke-width="1"/><text x="${xmin - 11}" y="${y(t) + 3.5}" text-anchor="end" font-size="11" fill="#8798a8">${t === 1 ? '1.0' : t === 0 ? '0' : t.toFixed(2)}</text>`).join('');
    const xticks = [0, .25, .5, .75, 1].map((p) => `<text x="${x(xMax * p)}" y="${yBottom + 24}" font-size="11" fill="#8798a8" text-anchor="middle">${Math.round(xMax * p)}</text>`).join('');
    let elements = '';
    if (options.filledSets) {
      for (const [name, entries] of Object.entries(options.filledSets)) elements += area(entries, colors[name], .17);
    }
    if (options.curves) {
      for (const [name, entries] of Object.entries(options.curves)) elements += line(entries, colors[name], 2.2);
    }
    if (options.aggregate) elements += line(options.aggregate, '#17374f', 3.8);
    if (Number.isFinite(options.marker)) {
      const xx = x(options.marker);
      elements += `<line x1="${xx}" x2="${xx}" y1="${yTop}" y2="${yBottom}" stroke="${options.markerColor ?? '#9658df'}" stroke-width="2.1" stroke-dasharray="6 5"/>`;
      if (options.markerCaption) {
        const rightAligned = options.marker > xMax * .62;
        const tx = rightAligned ? xx - 8 : xx + 8;
        elements += `<text x="${tx}" y="${yTop + 12}" fill="${options.markerColor ?? '#9658df'}" font-size="12" font-weight="800" text-anchor="${rightAligned ? 'end' : 'start'}">${escapeHTML(options.markerCaption)}</text>`;
      }
    }
    if (options.dots) {
      for (const dot of options.dots) elements += `<circle cx="${x(dot.value)}" cy="${y(dot.degree)}" r="4.3" fill="${colors[dot.name]}" stroke="white" stroke-width="1.7"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHTML(options.label ?? 'Fuzzy membership chart')}" style="max-width:100%"><title>${escapeHTML(options.label ?? 'Fuzzy membership chart')}</title>${ticks}${xticks}${elements}<text x="${xmax}" y="${H - 5}" text-anchor="end" fill="#91a2b0" font-size="10">${escapeHTML(options.xLabel ?? 'Performance score')}</text></svg>`;
  }

  function renderAggregatedChart(r) {
    const clipped = {};
    const curves = {};
    for (const name of Object.keys(E.OUTPUT_SETS)) {
      clipped[name] = [];
      curves[name] = [];
      for (let i = 0; i < 1001; i += 5) {
        clipped[name].push([r.universe[i], r.clipped[name][i]]);
        // Curves are included for the second tab only. On output chart, filled areas are emphasized.
        curves[name].push([r.universe[i], E.getMembership('output', name, r.universe[i])]);
      }
    }
    const aggregate = r.universe.filter((_, i) => i % 5 === 0).map((val, j) => [val, r.aggregated[j * 5]]);
    $('output-chart').innerHTML = chartSVG([], {
      filledSets: clipped, aggregate, marker: r.score, markerCaption: format(r.score),
      xLabel: 'Performance score / 100', label: `Aggregated output and centroid ${format(r.score)}`,
    });
    $('output-sets-chart').innerHTML = chartSVG([], {
      curves, xLabel: 'Performance score / 100', label: 'Original overlapping fuzzy output membership sets',
    });
  }

  function renderMembershipCharts(r) {
    $('membership-charts').innerHTML = ids.map((key) => {
      const cfg = E.INPUT_VARS[key];
      const curves = {};
      const dots = [];
      for (const name of Object.keys(cfg.sets)) {
        curves[name] = Array.from({ length: 201 }, (_, i) => {
          const x = i * cfg.max / 200;
          return [x, E.getMembership(key, name, x)];
        });
        dots.push({ name, value: r.inputs[key], degree: r.memberships[key][name] });
      }
      return `<div class="small-chart"><div class="small-chart-head"><span>${names[key]}</span><span>${formatInput(key, r.inputs[key])}${key === 'attendance' ? '%' : key === 'participation' ? '/10' : '/100'}</span></div>
        ${chartSVG([], {width:460,height:205,xMax:cfg.max,curves,dots,marker:r.inputs[key],markerColor:'#74899a',xLabel:cfg.max === 10 ? 'Participation / 10' : `${names[key]} / 100`,label:`Membership curves for ${names[key]}`})}
        <div class="small-chart-caption">Low <span style="color:${colors.Low}">●</span> ${format(r.memberships[key].Low)} &nbsp;·&nbsp; Medium <span style="color:${colors.Medium}">●</span> ${format(r.memberships[key].Medium)} &nbsp;·&nbsp; High <span style="color:${colors.High}">●</span> ${format(r.memberships[key].High)}</div></div>`;
    }).join('');
  }

  function renderParameters() {
    const rows = [];
    for (const [key, cfg] of Object.entries(E.INPUT_VARS)) {
      for (const [name, [shape, params]] of Object.entries(cfg.sets)) {
        rows.push(`<tr><td>${names[key]}</td><td>${name}</td><td>${shape === 'tri' ? 'Triangular' : 'Trapezoidal'}</td><td>${params.join(', ')}</td></tr>`);
      }
    }
    for (const [name, [shape, params]] of Object.entries(E.OUTPUT_SETS)) {
      rows.push(`<tr><td>Performance output</td><td>${name}</td><td>${shape === 'tri' ? 'Triangular' : 'Trapezoidal'}</td><td>${params.join(', ')}</td></tr>`);
    }
    $('parameters-table').innerHTML = table(rows, ['Variable', 'Set', 'Shape', 'Parameters']);
  }

  function renderComparison(r) {
    const presetId = $('comparison-preset').value;
    const preset = E.PRESETS[presetId];
    const compareInputs = Object.fromEntries(ids.map((id) => [id, preset[id]]));
    const b = E.evaluate(compareInputs);
    setText('compare-score-a', format(r.score));
    setText('compare-level-a', r.level);
    setText('compare-score-b', format(b.score));
    setText('compare-level-b', b.level);
    $('compare-bar-a').style.width = `${r.score}%`;
    $('compare-bar-b').style.width = `${b.score}%`;
    const difference = r.score - b.score;
    setText('comparison-insight', `Current profile: ${r.level}. Reference profile: ${b.level}. The current centroid score is ${Math.abs(difference).toFixed(2)} points ${difference >= 0 ? 'higher than or equal to' : 'lower than'} the reference score. Update the inputs to compare the profiles in real time.`);
    const rows = ids.map((key) => `<tr><td>${names[key]}</td><td>${formatInput(key, r.inputs[key])}</td><td>${formatInput(key, compareInputs[key])}</td></tr>`);
    rows.push(`<tr><td><strong>Fuzzy score</strong></td><td class="rule-strength">${format(r.score)}</td><td class="rule-strength">${format(b.score)}</td></tr>`);
    $('comparison-table').innerHTML = table(rows, ['Variable', 'Profile A · current', `Profile B · ${escapeHTML(preset.title)}`]);
  }

  function update() {
    try {
      const result = E.evaluate(getInputs());
      currentResult = result;
      $('error-notice').hidden = true;
      renderMetrics(result);
      renderInputMemberships(result);
      renderTopRules(result);
      renderRuleExplorer(result);
      renderAggregatedChart(result);
      renderMembershipCharts(result);
      renderComparison(result);
    } catch (error) {
      $('error-notice').textContent = `Could not evaluate the inputs: ${error.message}`;
      $('error-notice').hidden = false;
      console.error(error);
    }
  }

  function csvQuote(value) { return '"' + String(value).replaceAll('"', '""') + '"'; }
  function exportCSV() {
    if (!currentResult) return;
    const r = currentResult;
    const rows = [
      ['FuzzyLab - Student Performance Analysis'],
      ['Metric', 'Value'],
      ['Attendance (%)', r.inputs.attendance],
      ['Assignment score', r.inputs.assignment],
      ['Exam score', r.inputs.exam],
      ['Participation (0-10)', r.inputs.participation],
      ['Centroid performance score', format(r.score, 4)],
      ['Performance level', r.level],
      ['Fired rules', r.firedRules.length],
      [],
      ['Membership variable', 'Low', 'Medium', 'High'],
      ...ids.map((id) => [names[id], format(r.memberships[id].Low, 4), format(r.memberships[id].Medium, 4), format(r.memberships[id].High, 4)]),
      [],
      ['Rule ID', 'IF-THEN rule', 'Strength', 'Outcome', 'Active'],
      ...r.rules.map((rule) => [rule.id, rule.text, format(rule.strength, 4), rule.output, rule.strength > 0 ? 'Yes' : 'No']),
      [],
      ['Method', 'Mamdani fuzzy inference; min AND; max aggregation; discrete centroid'],
      ['Note', 'Experimental rule-based estimate, not an official academic grade'],
    ];
    const csv = '\uFEFF' + rows.map((row) => row.map(csvQuote).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'fuzzy-student-analysis.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function activateTab(tabName, focusButton = false) {
    for (const button of document.querySelectorAll('[role="tab"]')) {
      const selected = button.dataset.tab === tabName;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focusButton) button.focus();
    }
    for (const section of document.querySelectorAll('.tab-panel')) {
      section.hidden = section.id !== 'tab-' + tabName;
    }
  }

  function init() {
    for (const id of ids) {
      const slider = $(id + '-range');
      const numberField = $(id + '-number');
      setField(id, slider.value);
      slider.addEventListener('input', () => {
        setField(id, slider.value);
        selectPreset('');
        update();
      });
      numberField.addEventListener('input', () => {
        const val = Number(numberField.value);
        if (numberField.value !== '' && Number.isFinite(val) && val >= E.INPUT_VARS[id].min && val <= E.INPUT_VARS[id].max) {
          setField(id, val);
          selectPreset('');
          update();
        }
      });
      numberField.addEventListener('change', () => {
        if (numberField.value === '') {
          // Empty input is not a valid student score; restore the displayed slider value.
          numberField.value = slider.value;
        } else setField(id, numberField.value);
        selectPreset('');
        update();
      });
    }
    document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => applyPreset(button.dataset.preset)));
    $('reset-inputs').addEventListener('click', () => applyPreset('balanced'));
    $('download-report').addEventListener('click', exportCSV);
    $('only-active').addEventListener('change', () => { if (currentResult) renderRuleExplorer(currentResult); });
    $('comparison-preset').addEventListener('change', () => { if (currentResult) renderComparison(currentResult); });
    $('see-all-rules').addEventListener('click', () => activateTab('rules', true));
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', () => activateTab(tabs[i].dataset.tab));
      tabs[i].addEventListener('keydown', (event) => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const j = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        activateTab(tabs[j].dataset.tab, true);
      });
    }
    renderParameters();
    applyPreset('balanced');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
