/*
 * FuzzyLab: Mamdani Student Performance Evaluator
 * Vanilla JavaScript port of the supplied Python fuzzy_engine.py.
 * No external dependencies, no network calls. Node/CommonJS compatible for tests.
 *
 * Crisp inputs -> fuzzy memberships -> 18 rule strengths (AND=min) ->
 * min-clipped output sets -> maximum aggregation -> discrete centroid.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FuzzyEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PERCENT_SETS = Object.freeze({
    Low: ['trap', [0, 0, 30, 50]],
    Medium: ['tri', [30, 55, 80]],
    High: ['trap', [60, 80, 100, 100]],
  });
  const PARTICIPATION_SETS = Object.freeze({
    Low: ['trap', [0, 0, 3, 5]],
    Medium: ['tri', [3, 5.5, 8]],
    High: ['trap', [6, 8, 10, 10]],
  });
  const OUTPUT_SETS = Object.freeze({
    Poor: ['trap', [0, 0, 20, 40]],
    Average: ['tri', [25, 45, 65]],
    Good: ['tri', [50, 70, 85]],
    Excellent: ['trap', [70, 85, 100, 100]],
  });
  const INPUT_VARS = Object.freeze({
    attendance: { min: 0, max: 100, name: 'Attendance', sets: PERCENT_SETS },
    assignment: { min: 0, max: 100, name: 'Assignment', sets: PERCENT_SETS },
    exam: { min: 0, max: 100, name: 'Exam', sets: PERCENT_SETS },
    participation: { min: 0, max: 10, name: 'Participation', sets: PARTICIPATION_SETS },
  });
  const OUTPUT_NAMES = Object.keys(OUTPUT_SETS);

  // Exactly the same 18 IF-THEN rules and ordering as the supplied Python source.
  const RAW_RULES = [
    [[['exam', 'High'], ['assignment', 'High'], ['attendance', 'High']], 'AND', 'Excellent'],
    [[['exam', 'High'], ['assignment', 'High'], ['participation', 'High']], 'AND', 'Excellent'],
    [[['exam', 'Medium'], ['assignment', 'High'], ['attendance', 'High']], 'AND', 'Good'],
    [[['exam', 'Medium'], ['assignment', 'Medium'], ['attendance', 'Medium']], 'AND', 'Good'],
    [[['exam', 'Low'], ['assignment', 'Low']], 'AND', 'Poor'],
    [[['exam', 'Low'], ['attendance', 'Low']], 'AND', 'Poor'],
    [[['exam', 'High'], ['attendance', 'Low']], 'AND', 'Average'],
    [[['exam', 'Medium'], ['assignment', 'Low']], 'AND', 'Average'],
    [[['exam', 'High'], ['assignment', 'High'], ['attendance', 'Medium']], 'AND', 'Good'],
    [[['exam', 'High'], ['assignment', 'Medium']], 'AND', 'Good'],
    [[['exam', 'High'], ['assignment', 'Low']], 'AND', 'Average'],
    [[['exam', 'Medium'], ['assignment', 'High']], 'AND', 'Good'],
    [[['exam', 'Medium'], ['assignment', 'Medium']], 'AND', 'Average'],
    [[['exam', 'Medium'], ['attendance', 'Low']], 'AND', 'Average'],
    [[['exam', 'Low'], ['assignment', 'Medium']], 'AND', 'Poor'],
    [[['exam', 'Low'], ['assignment', 'High']], 'AND', 'Average'],
    [[['exam', 'Low'], ['participation', 'Low']], 'AND', 'Poor'],
    [[['exam', 'Medium'], ['assignment', 'Medium'], ['participation', 'High']], 'AND', 'Good'],
  ];
  const RULES = RAW_RULES.map(([conditions, operator, output], index) => ({
    id: index + 1,
    conditions,
    operator,
    output,
    text: `IF ${conditions.map(([variable, set]) => `${INPUT_VARS[variable].name} is ${set}`).join(` ${operator} `)} THEN Performance is ${output}`,
  }));

  function clamp(value, low, high) {
    return Math.max(low, Math.min(value, high));
  }

  function triangular(x, a, b, c) {
    if (x < a || x > c) return 0;
    if (x === b) return 1;
    if (x < b) return b === a ? 1 : clamp((x - a) / (b - a), 0, 1);
    return c === b ? 1 : clamp((c - x) / (c - b), 0, 1);
  }

  function trapezoidal(x, a, b, c, d) {
    if (x < a || x > d) return 0;
    if (x >= b && x <= c) return 1;
    if (x < b) return b === a ? 1 : clamp((x - a) / (b - a), 0, 1);
    return d === c ? 1 : clamp((d - x) / (d - c), 0, 1);
  }

  function membership(shapeParams, x) {
    const [shape, p] = shapeParams;
    return shape === 'tri' ? triangular(x, ...p) : trapezoidal(x, ...p);
  }

  function getMembership(variable, set, x) {
    const variableSets = variable === 'output' ? OUTPUT_SETS : INPUT_VARS[variable]?.sets;
    if (!variableSets || !Object.hasOwn(variableSets, set)) {
      throw new RangeError(`Unknown fuzzy set: ${variable}.${set}`);
    }
    return membership(variableSets[set], x);
  }

  function validateInputs(inputs) {
    if (!inputs || typeof inputs !== 'object') throw new TypeError('A student input object is required.');
    const validated = {};
    for (const [variable, cfg] of Object.entries(INPUT_VARS)) {
      const value = inputs[variable];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < cfg.min || value > cfg.max) {
        throw new RangeError(`${cfg.name} must be a finite number from ${cfg.min} to ${cfg.max}.`);
      }
      validated[variable] = value;
    }
    return validated;
  }

  function evaluate(rawInputs) {
    const inputs = validateInputs(rawInputs);
    const memberships = {};
    for (const [variable, cfg] of Object.entries(INPUT_VARS)) {
      memberships[variable] = {};
      for (const setName of Object.keys(cfg.sets)) {
        memberships[variable][setName] = getMembership(variable, setName, inputs[variable]);
      }
    }

    const rules = RULES.map((rule) => {
      const degrees = rule.conditions.map(([variable, set]) => memberships[variable][set]);
      const strength = rule.operator === 'AND' ? Math.min(...degrees) : Math.max(...degrees);
      return { ...rule, degrees, strength };
    });
    const outputStrengths = {};
    for (const name of OUTPUT_NAMES) {
      outputStrengths[name] = Math.max(0, ...rules.filter((r) => r.output === name).map((r) => r.strength));
    }

    // Inclusive 0.0 to 100.0 in 0.1 increments, matching NumPy linspace(0,100,1001).
    const universe = Array.from({ length: 1001 }, (_, i) => i * 0.1);
    const clipped = Object.fromEntries(OUTPUT_NAMES.map((name) => [name, []]));
    const aggregated = [];
    let numerator = 0;
    let denominator = 0;
    for (const x of universe) {
      let combined = 0;
      for (const name of OUTPUT_NAMES) {
        const mu = Math.min(outputStrengths[name], getMembership('output', name, x));
        clipped[name].push(mu);
        combined = Math.max(combined, mu);
      }
      aggregated.push(combined);
      numerator += x * combined;
      denominator += combined;
    }
    if (denominator <= 0) {
      throw new Error('No fuzzy rules were activated for these inputs.');
    }
    const score = numerator / denominator;
    const outputDegrees = Object.fromEntries(OUTPUT_NAMES.map((name) => [name, getMembership('output', name, score)]));
    // Ties resolve in the original Poor, Average, Good, Excellent order.
    const level = OUTPUT_NAMES.reduce((best, name) => outputDegrees[name] > outputDegrees[best] ? name : best);
    return {
      inputs, score, level, memberships, rules, outputStrengths,
      clipped, aggregated, universe, outputDegrees,
      firedRules: rules.filter((r) => r.strength > 0).sort((a, b) => b.strength - a.strength || a.id - b.id),
      centroidNumerator: numerator, centroidDenominator: denominator,
    };
  }

  const PRESETS = Object.freeze({
    balanced: { title: 'Balanced student', attendance: 75, assignment: 70, exam: 65, participation: 6 },
    excellent: { title: 'Strong all round', attendance: 92, assignment: 90, exam: 94, participation: 9 },
    support: { title: 'Needs support', attendance: 38, assignment: 30, exam: 28, participation: 3 },
    attendance: { title: 'Attendance challenge', attendance: 25, assignment: 88, exam: 91, participation: 6 },
  });

  return Object.freeze({ INPUT_VARS, OUTPUT_SETS, RULES, PRESETS, triangular, trapezoidal, getMembership, evaluate });
});
