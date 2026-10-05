(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TiltTrace = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TOTAL_TOLERANCE = 1e-7;
  const SCORE_TOLERANCE = 1e-9;
  const RAW_TOLERANCE = SCORE_TOLERANCE * 100;

  function record(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(`${label} must be an object`);
    }
  }

  function text(value, limit, label) {
    if (typeof value !== 'string') throw new TypeError(`${label} must be text`);
    const trimmed = value.trim();
    if (!trimmed.length || trimmed.length > limit) throw new RangeError(`${label} has an invalid length`);
    return trimmed;
  }

  function number(value, maximum, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) {
      throw new RangeError(`${label} must be a finite number from 0 to ${maximum}`);
    }
    return value;
  }

  function dimensions(value, label) {
    if (!Array.isArray(value) || value.length < 2 || value.length > 8) {
      throw new RangeError(`${label} must contain 2 to 8 entries`);
    }
  }

  function validateModel(raw) {
    record(raw, 'Model');
    if (raw.schemaVersion !== 1) throw new RangeError('Unsupported schema version');
    const title = text(raw.title, 120, 'Title');
    dimensions(raw.criteria, 'Criteria');
    dimensions(raw.options, 'Options');
    const criteria = Array.from(raw.criteria, (criterion) => {
      record(criterion, 'Criterion');
      if (typeof criterion.locked !== 'boolean') throw new TypeError('Locked must be a boolean');
      return {
        name: text(criterion.name, 60, 'Criterion name'),
        weight: number(criterion.weight, 100, 'Weight'),
        locked: criterion.locked
      };
    });
    const total = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
    if (Math.abs(total - 100) > TOTAL_TOLERANCE) throw new RangeError('Weights must sum to 100');
    const options = Array.from(raw.options, (option) => {
      record(option, 'Option');
      if (!Array.isArray(option.scores) || option.scores.length !== criteria.length) {
        throw new RangeError('Scores must match the number of criteria');
      }
      return {
        name: text(option.name, 60, 'Option name'),
        scores: Array.from(option.scores, (score) => number(score, 10, 'Score'))
      };
    });
    return { schemaVersion: 1, title, criteria, options };
  }

  function ranking(model) {
    return model.options.map((option, index) => ({
      index,
      name: option.name,
      score: option.scores.reduce((sum, score, criterionIndex) => sum + model.criteria[criterionIndex].weight * score, 0) / 100
    })).sort((first, second) => second.score - first.score || first.index - second.index);
  }

  function rank(raw) {
    return ranking(validateModel(raw));
  }

  function boundary(model, leader, challengerIndex) {
    const weights = model.criteria.map((criterion) => criterion.weight);
    const difference = model.options[challengerIndex].scores.map((score, index) => score - model.options[leader.index].scores[index]);
    let currentAdvantage = 0;
    let fixedAdvantage = 0;
    let movableTotal = 0;
    const movable = [];
    model.criteria.forEach((criterion, index) => {
      const contribution = criterion.weight * difference[index];
      currentAdvantage += contribution;
      if (criterion.locked) fixedAdvantage += contribution;
      else {
        movableTotal += criterion.weight;
        movable.push(index);
      }
    });
    const target = movable.reduce((best, index) => best === null || difference[index] > difference[best] ? index : best, null);
    const maximumAdvantage = fixedAdvantage + (target === null ? 0 : movableTotal * difference[target]);
    const margin = Math.abs(currentAdvantage) <= RAW_TOLERANCE ? 0 : Math.max(0, -currentAdvantage / 100);
    const canWin = maximumAdvantage > RAW_TOLERANCE;
    const unavailable = { challengerIndex, distance: null, witness: null, transfers: [], reachable: false, canWin, margin };

    if (currentAdvantage >= -RAW_TOLERANCE) {
      return { challengerIndex, distance: 0, witness: weights, transfers: [], reachable: true, canWin, margin };
    }
    if (maximumAdvantage < -RAW_TOLERANCE || target === null) return unavailable;

    // The best unlocked target can receive all movable mass. For minimum
    // L1/2 movement, exhaust the donors with greatest gain per point first.
    const donors = movable.slice().sort((first, second) => difference[first] - difference[second] || first - second);
    const transfers = [];
    let remaining = -currentAdvantage;
    let distance = 0;
    for (const from of donors) {
      const gain = difference[target] - difference[from];
      if (gain <= 0 || weights[from] <= 0) continue;
      const amount = Math.min(weights[from], Math.max(0, 100 - weights[target]), remaining / gain);
      if (amount <= 0) continue;
      weights[from] -= amount;
      weights[target] += amount;
      transfers.push({ from, to: target, amount });
      distance += amount;
      remaining -= amount * gain;
      if (remaining <= RAW_TOLERANCE) break;
    }
    if (remaining > RAW_TOLERANCE) return unavailable;
    return { challengerIndex, distance, witness: weights, transfers, reachable: true, canWin, margin };
  }

  function analyze(raw) {
    const model = validateModel(raw);
    const ranked = ranking(model);
    const leader = ranked[0];
    const boundaries = model.options.map((option, index) => index === leader.index ? null : boundary(model, leader, index))
      .filter((entry) => entry !== null)
      .sort((first, second) => {
        if (first.reachable !== second.reachable) return first.reachable ? -1 : 1;
        if (first.reachable) return first.distance - second.distance || first.challengerIndex - second.challengerIndex;
        return first.challengerIndex - second.challengerIndex;
      });
    return { ranking: ranked, leader, boundaries };
  }

  function setWeight(raw, index, value) {
    const model = validateModel(raw);
    if (!Number.isInteger(index) || index < 0 || index >= model.criteria.length) {
      throw new RangeError('Criterion index is out of range');
    }
    number(value, 100, 'Weight');
    const others = model.criteria.map((criterion, criterionIndex) => criterionIndex !== index && !criterion.locked ? criterionIndex : null)
      .filter((criterionIndex) => criterionIndex !== null);
    if (model.criteria[index].locked || !others.length) return model;

    const fixedTotal = model.criteria.reduce((sum, criterion) => sum + (criterion.locked ? criterion.weight : 0), 0);
    const budget = Math.max(0, 100 - fixedTotal);
    const requested = Math.min(value, budget);
    const remaining = budget - requested;
    const originalTotal = others.reduce((sum, criterionIndex) => sum + model.criteria[criterionIndex].weight, 0);
    model.criteria[index].weight = requested;
    let allocated = 0;
    others.forEach((criterionIndex, position) => {
      const share = originalTotal > 0 ? model.criteria[criterionIndex].weight / originalTotal : 1 / others.length;
      const weight = position === others.length - 1 ? remaining - allocated : Math.min(remaining - allocated, remaining * share);
      model.criteria[criterionIndex].weight = weight;
      allocated += weight;
    });
    return model;
  }

  return { validateModel, rank, analyze, setWeight };
});
