'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const engine = require('../engine.js');

function model(weights = [60, 40], scores = [[10, 0], [0, 10]], locks = []) {
  return {
    schemaVersion: 1,
    title: 'Decision',
    criteria: weights.map((weight, index) => ({ name: `Criterion ${index + 1}`, weight, locked: Boolean(locks[index]) })),
    options: scores.map((values, index) => ({ name: `Option ${index + 1}`, scores: values.slice() }))
  };
}

function requireFunction(name) {
  assert.equal(typeof engine[name], 'function', `${name} must be exported`);
}

function near(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

function boundaryFor(raw, challengerIndex) {
  return engine.analyze(raw).boundaries.find((boundary) => boundary.challengerIndex === challengerIndex);
}

function checkWitness(raw, boundary, leaderIndex) {
  if (!boundary.reachable) {
    assert.equal(boundary.distance, null);
    assert.equal(boundary.witness, null);
    assert.deepEqual(boundary.transfers, []);
    return;
  }
  const replay = raw.criteria.map((criterion) => criterion.weight);
  for (const transfer of boundary.transfers) {
    assert.ok(transfer.amount > 0);
    assert.equal(raw.criteria[transfer.from].locked, false);
    assert.equal(raw.criteria[transfer.to].locked, false);
    replay[transfer.from] -= transfer.amount;
    replay[transfer.to] += transfer.amount;
  }
  near(boundary.witness.reduce((sum, weight) => sum + weight, 0), 100);
  boundary.witness.forEach((weight, index) => {
    assert.ok(weight >= -1e-8 && weight <= 100 + 1e-8);
    near(replay[index], weight);
    if (raw.criteria[index].locked) assert.equal(weight, raw.criteria[index].weight);
  });
  near(boundary.witness.reduce((sum, weight, index) => sum + Math.abs(weight - raw.criteria[index].weight), 0) / 2, boundary.distance);
  near(boundary.transfers.reduce((sum, transfer) => sum + transfer.amount, 0), boundary.distance);
  const advantage = boundary.witness.reduce((sum, weight, index) => sum + weight * (raw.options[boundary.challengerIndex].scores[index] - raw.options[leaderIndex].scores[index]), 0);
  near(advantage, 0, 1e-7);
}

// Enumerate the integer simplex directly. This oracle knows no donor ordering
// or marginal-gain transport rule used by the production implementation.
function integerGridOracle(raw, leaderIndex, challengerIndex) {
  let distance = Infinity;
  let maxAdvantage = -Infinity;
  const candidate = [];
  function visit(index, remaining) {
    if (index === raw.criteria.length) {
      if (remaining !== 0) return;
      let advantage = 0;
      let movement = 0;
      candidate.forEach((weight, criterionIndex) => {
        advantage += weight * (raw.options[challengerIndex].scores[criterionIndex] - raw.options[leaderIndex].scores[criterionIndex]);
        movement += Math.abs(weight - raw.criteria[criterionIndex].weight);
      });
      maxAdvantage = Math.max(maxAdvantage, advantage);
      if (advantage >= 0) distance = Math.min(distance, movement / 2);
      return;
    }
    if (raw.criteria[index].locked) {
      const weight = raw.criteria[index].weight;
      if (weight > remaining) return;
      candidate[index] = weight;
      visit(index + 1, remaining - weight);
    } else if (index === raw.criteria.length - 1) {
      candidate[index] = remaining;
      visit(index + 1, 0);
    } else {
      for (let weight = 0; weight <= remaining; weight++) {
        candidate[index] = weight;
        visit(index + 1, remaining - weight);
      }
    }
  }
  visit(0, 100);
  return { reachable: Number.isFinite(distance), distance, canWin: maxAdvantage > 0 };
}

test('validateModel trims names and returns only known fields in an independent copy', () => {
  requireFunction('validateModel');
  const raw = model();
  raw.title = '  Decision  ';
  raw.criteria[0].name = '  Quality  ';
  raw.options[0].name = '  First  ';
  raw.unknown = 'discard';
  raw.criteria[0].unknown = 'discard';
  raw.options[0].unknown = 'discard';
  const validated = engine.validateModel(raw);
  assert.deepEqual(validated, {
    schemaVersion: 1,
    title: 'Decision',
    criteria: [
      { name: 'Quality', weight: 60, locked: false },
      { name: 'Criterion 2', weight: 40, locked: false }
    ],
    options: [
      { name: 'First', scores: [10, 0] },
      { name: 'Option 2', scores: [0, 10] }
    ]
  });
  validated.criteria[0].weight = 10;
  validated.options[0].scores[0] = 2;
  assert.equal(raw.criteria[0].weight, 60);
  assert.equal(raw.options[0].scores[0], 10);
});

test('validateModel accepts valid minimum and maximum dimensions plus roundoff tolerance', () => {
  requireFunction('validateModel');
  assert.equal(engine.validateModel(model()).criteria.length, 2);
  const maximum = model(Array(8).fill(12.5), Array.from({ length: 8 }, () => Array(8).fill(5)));
  assert.equal(engine.validateModel(maximum).options.length, 8);
  const roundoff = model([60, 40 + 5e-8]);
  assert.doesNotThrow(() => engine.validateModel(roundoff));
});

test('validateModel rejects unknown schema versions and non-object records', () => {
  requireFunction('validateModel');
  for (const raw of [null, [], {}, { ...model(), schemaVersion: 2 }, { ...model(), schemaVersion: '1' }]) {
    assert.throws(() => engine.validateModel(raw));
  }
});

test('validateModel rejects blank or overlong titles and names', () => {
  requireFunction('validateModel');
  for (const field of ['title', 'criterion', 'option']) {
    for (const value of ['   ', 7, 'x'.repeat(field === 'title' ? 121 : 61)]) {
      const raw = model();
      if (field === 'title') raw.title = value;
      else if (field === 'criterion') raw.criteria[0].name = value;
      else raw.options[0].name = value;
      assert.throws(() => engine.validateModel(raw));
    }
  }
});

test('validateModel rejects dimensions outside two through eight and mismatched scores', () => {
  requireFunction('validateModel');
  for (const count of [0, 1, 9]) {
    assert.throws(() => engine.validateModel(model(Array(count).fill(count ? 100 / count : 0), [[5], [5]])));
    assert.throws(() => engine.validateModel(model([60, 40], Array.from({ length: count }, () => [5, 5]))));
  }
  const short = model();
  short.options[0].scores.pop();
  assert.throws(() => engine.validateModel(short));
  const extra = model();
  extra.options[0].scores.push(3);
  assert.throws(() => engine.validateModel(extra));
});

test('validateModel rejects non-finite, non-numeric and out-of-range weights or scores', () => {
  requireFunction('validateModel');
  for (const weight of [NaN, Infinity, -Infinity, '60', -1, 101, null]) {
    const raw = model();
    raw.criteria[0].weight = weight;
    assert.throws(() => engine.validateModel(raw));
  }
  for (const score of [NaN, Infinity, -Infinity, '5', -0.1, 10.1, null]) {
    const raw = model();
    raw.options[0].scores[0] = score;
    assert.throws(() => engine.validateModel(raw));
  }
});

test('validateModel rejects invalid lock values and incorrect weight totals', () => {
  requireFunction('validateModel');
  for (const locked of [undefined, null, 0, 'false']) {
    const raw = model();
    raw.criteria[0].locked = locked;
    assert.throws(() => engine.validateModel(raw));
  }
  for (const weights of [[60, 39], [60, 40.000001]]) {
    assert.throws(() => engine.validateModel(model(weights)));
  }
});

test('rank computes weighted average scores and keeps original order for exact ties', () => {
  requireFunction('rank');
  const raw = model([60, 40], [[0, 10], [10, 0], [10, 0], [5, 5]]);
  raw.options[1].name = '  Best  ';
  assert.deepEqual(engine.rank(raw), [
    { index: 1, name: 'Best', score: 6 },
    { index: 2, name: 'Option 3', score: 6 },
    { index: 3, name: 'Option 4', score: 5 },
    { index: 0, name: 'Option 1', score: 4 }
  ]);
});

test('rank and analyze reject malformed input instead of producing NaN results', () => {
  requireFunction('rank');
  requireFunction('analyze');
  const raw = model([59, 40]);
  assert.throws(() => engine.rank(raw));
  assert.throws(() => engine.analyze(raw));
});

test('analyze returns a hand-calculated two-criterion minimum transfer and ranking leader object', () => {
  requireFunction('analyze');
  const raw = model();
  const result = engine.analyze(raw);
  assert.equal(result.leader, result.ranking[0]);
  assert.deepEqual(result.leader, { index: 0, name: 'Option 1', score: 6 });
  assert.equal(result.boundaries.length, 1);
  const boundary = result.boundaries[0];
  assert.equal(boundary.margin, 2);
  assert.equal(boundary.distance, 10);
  assert.equal(boundary.canWin, true);
  assert.equal(boundary.reachable, true);
  assert.deepEqual(boundary.witness, [50, 50]);
  assert.deepEqual(boundary.transfers, [{ from: 0, to: 1, amount: 10 }]);
  checkWitness(raw, boundary, result.leader.index);
});

test('analyze exhausts the best donor before using a weaker donor in the exact minimum', () => {
  requireFunction('analyze');
  // Deficit 210. First move 10 points at gain 15, then 60/7 at gain 7.
  const raw = model([10, 80, 10], [[10, 7, 0], [0, 5, 5]]);
  const boundary = boundaryFor(raw, 1);
  near(boundary.margin, 2.1);
  near(boundary.distance, 130 / 7);
  assert.equal(boundary.transfers.length, 2);
  assert.deepEqual(boundary.transfers[0], { from: 0, to: 2, amount: 10 });
  assert.equal(boundary.transfers[1].from, 1);
  assert.equal(boundary.transfers[1].to, 2);
  near(boundary.transfers[1].amount, 60 / 7);
  boundary.witness.forEach((weight, index) => near(weight, [0, 500 / 7, 200 / 7][index]));
  checkWitness(raw, boundary, 0);
});

test('analyze keeps multiple locked weights unchanged when a boundary is reachable', () => {
  requireFunction('analyze');
  const raw = model([30, 20, 40, 10], [[8, 6, 9, 1], [6, 9, 1, 9]], [true, true, false, false]);
  const boundary = boundaryFor(raw, 1);
  near(boundary.margin, 2.4);
  assert.equal(boundary.distance, 15);
  assert.deepEqual(boundary.witness, [30, 20, 25, 25]);
  assert.equal(boundary.canWin, true);
  checkWitness(raw, boundary, 0);
});

test('analyze marks boundaries blocked by locks as unreachable without a false witness', () => {
  requireFunction('analyze');
  const fixtures = [
    model([60, 20, 20], [[10, 10, 0], [0, 0, 10]], [true, false, false]),
    model([60, 40], [[10, 0], [0, 10]], [true, false]),
    model([60, 40], [[10, 0], [0, 10]], [true, true])
  ];
  for (const raw of fixtures) {
    const boundary = boundaryFor(raw, 1);
    assert.equal(boundary.reachable, false);
    assert.equal(boundary.canWin, false);
    checkWitness(raw, boundary, 0);
  }
});

test('analyze distinguishes strict dominance from a boundary that can only tie', () => {
  requireFunction('analyze');
  const raw = model([60, 40], [[10, 5], [5, 5], [5, 4]]);
  const tieOnly = boundaryFor(raw, 1);
  assert.equal(tieOnly.reachable, true);
  assert.equal(tieOnly.canWin, false);
  assert.equal(tieOnly.distance, 60);
  assert.deepEqual(tieOnly.witness, [0, 100]);
  checkWitness(raw, tieOnly, 0);
  const dominated = boundaryFor(raw, 2);
  assert.equal(dominated.reachable, false);
  assert.equal(dominated.canWin, false);
  checkWitness(raw, dominated, 0);
});

test('analyze gives current ties zero distance and separately tests if they can ever win', () => {
  requireFunction('analyze');
  const raw = model([50, 50], [[10, 0], [0, 10], [10, 0]]);
  const movable = boundaryFor(raw, 1);
  assert.equal(movable.distance, 0);
  assert.equal(movable.margin, 0);
  assert.equal(movable.canWin, true);
  assert.deepEqual(movable.transfers, []);
  checkWitness(raw, movable, 0);
  const identical = boundaryFor(raw, 2);
  assert.equal(identical.distance, 0);
  assert.equal(identical.canWin, false);
  checkWitness(raw, identical, 0);
  const fixed = model([50, 50], [[10, 0], [0, 10]], [true, true]);
  const fixedTie = boundaryFor(fixed, 1);
  assert.equal(fixedTie.distance, 0);
  assert.equal(fixedTie.canWin, false);
  checkWitness(fixed, fixedTie, 0);
});

test('analyze sorts reachable boundaries by distance before unreachable options', () => {
  requireFunction('analyze');
  const raw = model([60, 40], [[10, 2], [0, 10], [9, 3], [8, 1], [10, 2]]);
  const result = engine.analyze(raw);
  assert.deepEqual(result.boundaries.map((boundary) => boundary.challengerIndex), [4, 2, 1, 3]);
  for (const boundary of result.boundaries) assert.ok(boundary.margin >= 0);
  near(boundaryFor(raw, 2).margin, 0.2);
});

test('analyze agrees with exhaustive integer-simplex enumeration across weights and locks', () => {
  requireFunction('analyze');
  let checked = 0;
  for (let first = 0; first <= 100; first += 20) {
    for (let second = 0; second <= 100 - first; second += 20) {
      const weights = [first, second, 100 - first - second];
      for (const locks of [[false, false, false], [true, false, false], [false, true, false], [false, false, true]]) {
        const raw = model(weights, [[7, 5, 3], [5, 5, 5]], locks);
        const firstScore = 7 * weights[0] + 5 * weights[1] + 3 * weights[2];
        const leaderIndex = firstScore >= 500 ? 0 : 1;
        const challengerIndex = 1 - leaderIndex;
        const expected = integerGridOracle(raw, leaderIndex, challengerIndex);
        const result = engine.analyze(raw);
        assert.equal(result.leader.index, leaderIndex);
        const boundary = result.boundaries[0];
        assert.equal(boundary.reachable, expected.reachable, JSON.stringify({ weights, locks }));
        assert.equal(boundary.canWin, expected.canWin, JSON.stringify({ weights, locks }));
        if (expected.reachable) near(boundary.distance, expected.distance);
        checkWitness(raw, boundary, leaderIndex);
        checked++;
      }
    }
  }
  assert.equal(checked, 84);
});

test('rank and analyze accept deeply frozen inputs and return detached data', () => {
  requireFunction('rank');
  requireFunction('analyze');
  const raw = freeze(model());
  assert.doesNotThrow(() => engine.rank(raw));
  const result = engine.analyze(raw);
  result.boundaries[0].witness[0] = 0;
  result.ranking[0].name = 'Changed';
  assert.equal(raw.criteria[0].weight, 60);
  assert.equal(raw.options[0].name, 'Option 1');
});

test('setWeight preserves locked weights and redistributes only other unlocked weights proportionally', () => {
  requireFunction('setWeight');
  const raw = model([40, 30, 20, 10], [[5, 5, 5, 5], [4, 4, 4, 4]], [false, true, false, false]);
  const updated = engine.setWeight(raw, 0, 55);
  assert.deepEqual(updated.criteria.map((criterion) => criterion.weight), [55, 30, 10, 5]);
  assert.deepEqual(raw.criteria.map((criterion) => criterion.weight), [40, 30, 20, 10]);
  assert.deepEqual(updated.options, raw.options);
  assert.notEqual(updated.options, raw.options);
});

test('setWeight caps the requested weight at the available unlocked budget', () => {
  requireFunction('setWeight');
  const raw = model([40, 30, 20, 10], [[5, 5, 5, 5], [4, 4, 4, 4]], [false, true, false, false]);
  assert.deepEqual(engine.setWeight(raw, 0, 90).criteria.map((criterion) => criterion.weight), [70, 30, 0, 0]);
  const zero = engine.setWeight(raw, 0, 0);
  assert.equal(zero.criteria[0].weight, 0);
  assert.equal(zero.criteria[1].weight, 30);
  near(zero.criteria[2].weight, 140 / 3);
  near(zero.criteria[3].weight, 70 / 3);
});

test('setWeight divides the remaining weight equally when all other unlocked weights are zero', () => {
  requireFunction('setWeight');
  const raw = model([100, 0, 0], [[5, 5, 5], [4, 4, 4]]);
  assert.deepEqual(engine.setWeight(raw, 0, 40).criteria.map((criterion) => criterion.weight), [40, 30, 30]);
});

test('setWeight returns unchanged independent data for locked or sole unlocked targets', () => {
  requireFunction('setWeight');
  for (const locks of [[true, false], [false, true], [true, true]]) {
    const raw = freeze(model([60, 40], [[10, 0], [0, 10]], locks));
    const updated = engine.setWeight(raw, 0, 20);
    assert.deepEqual(updated, raw);
    assert.notEqual(updated, raw);
    assert.notEqual(updated.criteria, raw.criteria);
  }
});

test('setWeight rejects invalid indices, non-finite values and out-of-range requests', () => {
  requireFunction('setWeight');
  for (const index of [-1, 2, 0.5, NaN, Infinity, '0']) assert.throws(() => engine.setWeight(model(), index, 50));
  for (const value of [NaN, Infinity, -Infinity, '50', null, -1, 101]) assert.throws(() => engine.setWeight(model(), 0, value));
  assert.throws(() => engine.setWeight(model([50, 40]), 0, 40));
});

test('setWeight preserves valid totals and finite ranges through repeated fractional adjustments', () => {
  requireFunction('setWeight');
  let raw = model([25, 25, 25, 25], [[8, 5, 9, 2], [6, 7, 4, 8]], [true, false, false, false]);
  for (let step = 0; step < 100; step++) {
    const frozen = freeze(raw);
    raw = engine.setWeight(frozen, 1 + step % 3, (step * 17.3) % 100);
    assert.equal(raw.criteria[0].weight, 25);
    near(raw.criteria.reduce((sum, criterion) => sum + criterion.weight, 0), 100, 1e-10);
    for (const criterion of raw.criteria) assert.ok(Number.isFinite(criterion.weight) && criterion.weight >= 0 && criterion.weight <= 100);
    assert.doesNotThrow(() => engine.validateModel(raw));
  }
});

test('the UMD engine works as a browser global without require or module dependencies', () => {
  requireFunction('setWeight');
  const source = fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8');
  const browser = {};
  vm.runInNewContext(source, browser);
  for (const name of ['validateModel', 'rank', 'analyze', 'setWeight']) assert.equal(typeof browser.TiltTrace[name], 'function');
  const result = browser.TiltTrace.analyze(model());
  assert.equal(result.leader.score, 6);
  assert.equal(result.boundaries[0].distance, 10);
  const updated = browser.TiltTrace.setWeight(model(), 0, 70);
  assert.equal(updated.criteria[0].weight, 70);
  assert.equal(updated.criteria[1].weight, 30);
});
