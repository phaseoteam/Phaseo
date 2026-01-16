import fs from 'fs';
import path from 'path';
import { checkPricingEntrySafety } from '@/data/validate';

// Small helpers -----------------------------------------------------------
const ROOT = path.join(process.cwd(), 'src/data');
const readJson = (p: string): any => JSON.parse(fs.readFileSync(p, 'utf-8'));
const listDirs = (p: string) => fs.existsSync(p) ? fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) : [];
const exists = (p: string) => fs.existsSync(p);
const listPricingFiles = (root: string) => {
  const files: string[] = [];
  if (!fs.existsSync(root)) return files;
  const providers = listDirs(root);
  for (const provider of providers) {
    const providerRoot = path.join(root, provider);
    for (const levelOne of listDirs(providerRoot)) {
      const levelOneRoot = path.join(providerRoot, levelOne);
      for (const levelTwo of listDirs(levelOneRoot)) {
        const filePath = path.join(levelOneRoot, levelTwo, 'pricing.json');
        if (exists(filePath)) files.push(filePath);
      }
    }
  }
  return files;
};

// Collect references up-front -------------------------------------------
const organisationsDir = path.join(ROOT, 'organisations');
const familiesDir = path.join(ROOT, 'families');
const benchmarksDir = path.join(ROOT, 'benchmarks');
const modelsDir = path.join(ROOT, 'models');
const aliasesDir = path.join(ROOT, 'aliases');
const apiProvidersDir = path.join(ROOT, 'api_providers');
const pricingDir = path.join(ROOT, 'pricing');
const plansDir = path.join(ROOT, 'subscription_plans');

const organisationIds = new Set<string>();
for (const org of listDirs(organisationsDir)) {
  const p = path.join(organisationsDir, org, 'organisation.json');
  if (exists(p)) {
    try { organisationIds.add(readJson(p).organisation_id); } catch {}
  }
}

const familyIds = new Set<string>();
const familyOrg = new Map<string, string>();
for (const fam of listDirs(familiesDir)) {
  const p = path.join(familiesDir, fam, 'family.json');
  if (exists(p)) {
    try {
      const j = readJson(p);
      familyIds.add(j.family_id);
      if (j.organisation_id) familyOrg.set(j.family_id, j.organisation_id);
    } catch {}
  }
}

const benchmarkIds = new Set<string>();
for (const b of listDirs(benchmarksDir)) {
  const p = path.join(benchmarksDir, b, 'benchmark.json');
  if (exists(p)) {
    try { benchmarkIds.add(readJson(p).benchmark_id); } catch {}
  }
}

type ModelIndex = {
  model_id: string;
  organisation_id: string;
  family_id?: string | null;
  previous_model_id?: string | null;
  filePath: string;
  benchmark_ids: string[];
};

const models: ModelIndex[] = [];
const modelIds = new Set<string>();
for (const org of listDirs(modelsDir)) {
  const orgDir = path.join(modelsDir, org);
  for (const m of listDirs(orgDir)) {
    const p = path.join(orgDir, m, 'model.json');
    if (!exists(p)) continue;
    try {
      const j = readJson(p);
      modelIds.add(j.model_id);
      models.push({
        model_id: j.model_id,
        organisation_id: j.organisation_id,
        family_id: j.family_id ?? null,
        previous_model_id: j.previous_model_id ?? null,
        filePath: p,
        benchmark_ids: Array.isArray(j.benchmarks) ? j.benchmarks.map((x: any) => x.benchmark_id) : [],
      });
    } catch {}
  }
}

const apiProviderIds = new Set<string>();
for (const ap of listDirs(apiProvidersDir)) {
  const p = path.join(apiProvidersDir, ap, 'api_provider.json');
  if (exists(p)) {
    try { apiProviderIds.add(readJson(p).provider_id); } catch {}
  }
}

// Pretty print helpers for CLI-like output ------------------------------
const ok = (msg: string) => `✅ ${msg}`;
const fail = (msg: string) => `❌ ${msg}`;

// Organisations ----------------------------------------------------------
describe('Organisations', () => {
  const dirs = listDirs(organisationsDir);
  test(ok(`found ${dirs.length} organisations`), () => {
    expect(dirs.length).toBeGreaterThan(0);
  });
  for (const org of dirs) {
    const p = path.join(organisationsDir, org, 'organisation.json');
    test(`${org} shape`, () => {
      const j = readJson(p);
      expect(typeof j.organisation_id).toBe('string');
      expect(j.organisation_id.length).toBeGreaterThan(0);
      expect(typeof j.name).toBe('string');
    });
  }
});

// Families ---------------------------------------------------------------
describe('Families', () => {
  const dirs = listDirs(familiesDir);
  for (const fam of dirs) {
    const p = path.join(familiesDir, fam, 'family.json');
    test(`${fam} shape + org exists`, () => {
      const j = readJson(p);
      expect(typeof j.family_id).toBe('string');
      if (j.organisation_id) {
        expect(organisationIds.has(j.organisation_id)).toBe(true);
      }
    });
  }
});

// Benchmarks -------------------------------------------------------------
describe('Benchmarks', () => {
  const dirs = listDirs(benchmarksDir);
  for (const b of dirs) {
    const p = path.join(benchmarksDir, b, 'benchmark.json');
    test(`${b} shape`, () => {
      const j = readJson(p);
      expect(typeof j.benchmark_id).toBe('string');
      expect(typeof j.name).toBe('string');
    });
  }
});

// Models -----------------------------------------------------------------
describe('Models', () => {
  test(ok(`found ${models.length} models`), () => {
    expect(models.length).toBeGreaterThan(0);
  });
  for (const m of models) {
    test(`${m.model_id} base fields`, () => {
      const j = readJson(m.filePath);
      expect(typeof j.model_id).toBe('string');
      expect(typeof j.name).toBe('string');
      expect(organisationIds.has(j.organisation_id)).toBe(true);
    });
    test(`${m.model_id} previous_model_id reference`, () => {
      const j = readJson(m.filePath);
      const rawPrev = j.previous_model_id ?? null;
      const prev = rawPrev === '-' || rawPrev === '' ? null : rawPrev;
      if (prev) expect(modelIds.has(prev)).toBe(true);
    });
    test(`${m.model_id} family reference`, () => {
      const j = readJson(m.filePath);
      if (j.family_id) expect(familyIds.has(j.family_id)).toBe(true);
    });
    test(`${m.model_id} benchmark references`, () => {
      const j = readJson(m.filePath);
      const arr = Array.isArray(j.benchmarks) ? j.benchmarks : [];
      for (const br of arr) {
        expect(benchmarkIds.has(br.benchmark_id)).toBe(true);
        const t = typeof br.score;
        expect(t === 'number' || t === 'string').toBe(true);
        const isrType = typeof br.is_self_reported;
        expect(isrType === 'boolean' || isrType === 'number').toBe(true);
      }
    });
  }
});

// Aliases ----------------------------------------------------------------
describe('Aliases', () => {
  const dirs = listDirs(aliasesDir);
  for (const a of dirs) {
    const p = path.join(aliasesDir, a, 'alias.json');
    if (!exists(p)) continue;
    test(`${a} resolves to a model`, () => {
      const j = readJson(p);
      expect(typeof j.alias_slug).toBe('string');
      expect(typeof j.resolved_model_id).toBe('string');
      expect(modelIds.has(j.resolved_model_id)).toBe(true);
    });
  }
});

// API Providers ----------------------------------------------------------
describe('API Providers', () => {
  const dirs = listDirs(apiProvidersDir);
  for (const ap of dirs) {
    const p = path.join(apiProvidersDir, ap, 'api_provider.json');
    if (!exists(p)) continue;
    test(`${ap} shape + model refs`, () => {
      const j = readJson(p);
      expect(typeof j.provider_id).toBe('string');
      const modelsList = Array.isArray(j.models) ? j.models : [];
      for (const mid of modelsList) {
        expect(typeof mid).toBe('string');
      }
      const ebm = j.endpoints_by_model || {};
      for (const [mid, endpoints] of Object.entries(ebm)) {
        expect(typeof mid).toBe('string');
        if (Array.isArray(endpoints)) {
          for (const e of endpoints) expect(typeof e).toBe('string');
        }
      }
    });
  }
});

// Pricing ----------------------------------------------------------------
describe('Pricing', () => {
  const pricingFiles = listPricingFiles(pricingDir);
  for (const prPath of pricingFiles) {
    test(`${path.relative(pricingDir, prPath)} pricing safety`, () => {
      const j = readJson(prPath);
      const errs = checkPricingEntrySafety(j);
      // check relationships too
      if (j.api_provider_id) expect(apiProviderIds.has(j.api_provider_id)).toBe(true);
      if (j.model_id) expect(modelIds.has(j.model_id)).toBe(true);
      expect(errs).toEqual([]);
    });
  }
});

// Subscription Plans -----------------------------------------------------
describe('Subscription Plans', () => {
  const dirs = listDirs(plansDir);
  for (const plan of dirs) {
    const p = path.join(plansDir, plan, 'plan.json');
    if (!exists(p)) continue;
    test(`${plan} shape + refs`, () => {
      const j = readJson(p);
      expect(typeof j.plan_id).toBe('string');
      expect(typeof j.name).toBe('string');
      // Provider here refers to an organisation (consumer subscription provider like OpenAI/Anthropic)
      if (j.provider_id) expect(organisationIds.has(j.provider_id)).toBe(true);
      const modelsList = Array.isArray(j.models) ? j.models : [];
      for (const m of modelsList) {
        expect(modelIds.has(m.model_id)).toBe(true);
      }
    });
  }
});
