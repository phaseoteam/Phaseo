import assert from 'node:assert/strict';
import { buildEnumSnapshot } from './enumSnapshot';
const active = { routing_enabled: true, phaseo_status: 'enabled', access_scope: 'public', provider_availability_status: 'available' };
const snapshot = buildEnumSnapshot(new Map([
  ['v2_models', [{model_slug:'z'}, {model_slug:'a'}, {model_slug:'hidden',hidden:true}]],
  ['v2_model_provider_routes', [
    {...active,model_slug:'a'}, {...active,model_slug:'a'},
    {...active,model_slug:'hidden'}, {...active,model_slug:'missing'},
    {...active,model_slug:'z',is_stealth:true},
    {...active,model_slug:'z',effective_from:'2030-01-01'},
    {...active,model_slug:'z',effective_to:'2020-01-01'},
    {...active,model_slug:'z',access_scope:'private'},
    {...active,model_slug:'z',routing_enabled:false},
  ]],
  ['v2_labs',[{lab_slug:'b'},{lab_slug:'a'},{lab_slug:'b'}]],
  ['v2_benchmarks',[{benchmark_id:'b'}]],
]), Date.parse('2026-09-09'));
assert.deepEqual(snapshot, {models:['a','z'],callableModels:['a'],organisations:['a','b'],benchmarks:['b'],api_providers:[],subscription_plans:[]});
console.log('Database enum snapshot privacy, lifecycle and deterministic ordering passed.');
