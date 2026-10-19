import { mergeData } from '../src/lib/cloud/merge.ts';

const S = { apiKeySet: false, aiModel: 'm', defaultLiftAngle: 52, standardSeconds: 30, longSeconds: 60 };
const W = (id: string, model: string, updatedAt: number, order = 0) => ({
  id, brand: 'B', model, ref: '', caliber: '', movement: 'auto', bph: null, liftAngle: null, photo: null, acquired: '', lastService: '',
  notes: '', favorite: false, archived: false, createdAt: 1, order, spec: { accMin: null, accMax: null, powerReserveH: null, jewels: null, serviceYears: null, src: '', sources: [] },
  prMeasured: null, updatedAt,
});
const R = (id: string, watchId: string, at: number) => ({ id, watchId, at, position: null, rate: 1, beatError: null, amplitude: null, bph: 28800, liftAngle: 52, quality: 1, beats: 100, seconds: 30 });
const base = (o: any) => ({ version: 1, watches: [], readings: [], cycles: [], wear: {}, settings: S, ...o });

let fail = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) fail++; };

// 1. union of readings from two devices
let m = mergeData(base({ watches: [W('w1', 'A', 5)], readings: [R('r1', 'w1', 10)] }) as any, base({ watches: [W('w1', 'A', 5)], readings: [R('r2', 'w1', 20)] }) as any);
check('readings from both copies are kept', m.readings.map(r => r.id).join() === 'r1,r2');

// 2. newer watch edit wins
m = mergeData(base({ watches: [W('w1', 'old', 5)] }) as any, base({ watches: [W('w1', 'new', 9)] }) as any);
check('newer watch edit wins', m.watches[0].model === 'new');

// 3. deletion propagates and is not resurrected
m = mergeData(base({ watches: [], readings: [], tombstones: { w1: 50, r1: 50 } }) as any, base({ watches: [W('w1', 'A', 5)], readings: [R('r1', 'w1', 10), R('r2', 'w1', 11)] }) as any);
check('deleted watch and its readings stay deleted', m.watches.length === 0 && m.readings.length === 0);

// 4. cycle entries union, deleted entry stays deleted
const C = (entries: number[], updatedAt: number) => ({ id: 'c1', watchId: 'w1', startedAt: 1, endedAt: null, note: '', entries: entries.map(t => ({ t, off: t / 100 })), updatedAt });
m = mergeData(base({ watches: [W('w1', 'A', 5)], cycles: [C([100, 300], 9)], tombstones: { 'c1:200': 8 } }) as any, base({ watches: [W('w1', 'A', 5)], cycles: [C([100, 200, 400], 7)] }) as any);
check('cycle entries are unioned minus deleted', m.cycles[0].entries.map(e => e.t).join() === '100,300,400');

// 5. wear: later edited day wins
m = mergeData(base({ wear: { '2026-10-19': ['w1'] }, wearAt: { '2026-10-19': 5 } }) as any, base({ wear: {}, wearAt: { '2026-10-19': 9 } }) as any);
check('wear day removed later on the other device stays removed', !m.wear['2026-10-19']);

// 6. null remote returns local
const loc = base({ watches: [W('w1', 'A', 5)] }) as any;
check('first sync (no remote file) keeps local', mergeData(loc, null) === loc);

console.log(fail ? `\n${fail} failing` : '\nall merge cases pass');
process.exit(fail ? 1 : 0);
