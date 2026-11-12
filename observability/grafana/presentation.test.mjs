import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboards } from './definitions.mjs';
import { allPanels } from './presentation.mjs';
import { freeAllowances } from './free-tier.mjs';

function checkGrid(panels) {
  for (const [index, panel] of panels.entries()) {
    const a = panel.gridPos;
    assert.ok(a.x >= 0 && a.y >= 0 && a.w > 0 && a.h > 0 && a.x + a.w <= 24);
    for (const other of panels.slice(index + 1)) {
      const b = other.gridPos;
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${panel.title} overlaps ${other.title}`);
    }
    if (panel.panels?.length) {
      assert.equal(panel.type, 'row');
      assert.equal(panel.collapsed, true);
      assert.ok(panel.panels.every(child => child.gridPos.y > panel.gridPos.y));
      checkGrid(panel.panels);
    }
  }
}

test('native layouts keep trends first, records expandable and IDs unique', () => {
  for (const dashboard of dashboards()) {
    const panels = allPanels(dashboard.panels);
    assert.equal(new Set(panels.map(panel => panel.id)).size, panels.length);
    checkGrid(dashboard.panels);
    const records = panels.filter(panel => panel.targets?.some(target => target.maxLines));
    assert.ok(records.every(panel => panel.targets.every(target => target.datasource.type === 'loki' && target.queryType === 'range')));
    if (dashboard.uid === 'phaseo-free-tier') continue;
    const charts = dashboard.panels.filter(panel => panel.type === 'timeseries');
    assert.ok(charts.length >= 4);
    assert.ok(charts[0].gridPos.y <= 6, 'first chart is near the top');
    assert.ok(dashboard.panels.some(panel => panel.type === 'row' && panel.collapsed && panel.panels.some(child => child.targets?.some(target => target.maxLines))));
    assert.ok(dashboard.templating.list.filter(variable => variable.type === 'datasource').every(variable => variable.hide === 2));
  }
  const overview = dashboards()[0];
  assert.equal(overview.panels.filter(panel => panel.type === 'stat' && panel.gridPos.y <= 3).length, 6);
  assert.ok(overview.panels.find(panel => panel.title === 'Traffic · per interval').gridPos.y < overview.panels.find(panel => panel.title === 'Service request health').gridPos.y);
});

test('budget bars keep actual units, fixed Free maxima and unknown usage', () => {
  const free = dashboards().find(dashboard => dashboard.uid === 'phaseo-free-tier');
  const bars = free.panels.filter(panel => panel.type === 'bargauge');
  assert.equal(bars.length, 6);
  for (const [index, maximum] of Object.values(freeAllowances).entries()) {
    assert.equal(bars[index].fieldConfig.defaults.max, maximum);
    assert.equal(bars[index].fieldConfig.defaults.noValue, 'Unavailable');
    assert.equal(bars[index].targets[0].instant, true);
    assert.ok(!bars[index].targets[0].expr.includes('vector(0)'));
  }
  assert.equal(bars[1].fieldConfig.defaults.unit, 'suffix: GB');
});
