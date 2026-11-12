const finite = Number.isFinite;

export function compareWaterPlans(a, b, input, areaM2) {
  const maps = [a, b].map(plan => new Map(plan.days.map(day => [day.date, day])));
  const dates = [...maps[0].keys()].filter(date => maps[1].has(date)).sort();
  const rainfall = new Map((input?.days || []).map(day => [day.date, day.effectiveRainMm]));
  const rows = dates.map(date => ({ date, days: maps.map(map => map.get(date)), rain: rainfall.get(date) }));
  const changed = rows.find(({ days: [left, right] }) => ["depletionMm", "grossIrrigationMm", "stressFactor"]
    .some(key => finite(left[key]) && finite(right[key]) && Math.abs(left[key] - right[key]) > 1e-6));
  const totals = [a, b].map((plan, index) => {
    if (!rows.length || plan.days.length === dates.length) {
      return [plan.stressDays, plan.volumeM3, finite(plan.costMinor) ? plan.costMinor / 100 : null];
    }
    const days = rows.map(row => row.days[index]);
    const stress = days.every(day => finite(day.actualEtMm) && finite(day.potentialEtMm))
      ? days.filter(day => day.actualEtMm + 1e-9 < day.potentialEtMm).length : null;
    const volume = finite(areaM2) && days.every(day => finite(day.grossIrrigationMm))
      ? days.reduce((total, day) => total + day.grossIrrigationMm, 0) * areaM2 / 1000 : null;
    const cost = finite(volume) && finite(input?.waterCostMinorPerM3)
      ? Math.round(volume * input.waterCostMinorPerM3) / 100 : null;
    return [stress, volume, cost];
  });
  return { rows, changed: changed?.date, totals };
}
