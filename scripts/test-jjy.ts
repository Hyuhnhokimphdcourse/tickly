import { decodeJjy, jjyFrame } from '../src/lib/jjy.ts';
let fail = 0;
const check = (name: string, ok: boolean, info = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); };
// 2026-10-19 22:37 KST (= 13:37 UTC), Monday, day 292
const f = jjyFrame(Date.UTC(2026, 9, 19, 13, 37, 25));
const d = decodeJjy(f);
check('fields', d.minute === 37 && d.hour === 22 && d.doy === 292 && d.year === 26 && d.weekday === 1, JSON.stringify(d));
check('markers', [0, 9, 19, 29, 39, 49, 59].every(s => f[s] === 'M') && f.filter(x => x === 'M').length === 7);
const ones = (a: number, b: number) => f.slice(a, b).filter(x => x === 1).length;
check('parity hour', (ones(12, 19) + (f[36] as number)) % 2 === 0);
check('parity minute', (ones(1, 9) + (f[37] as number)) % 2 === 0);
// year boundary in JST: 2026-12-31 15:00 UTC = 2027-01-01 00:00 JST
const g = decodeJjy(jjyFrame(Date.UTC(2026, 11, 31, 15, 0, 5)));
check('new year JST', g.year === 27 && g.doy === 1 && g.hour === 0 && g.minute === 0, JSON.stringify(g));
const leap = decodeJjy(jjyFrame(Date.UTC(2028, 11, 31, 3, 59, 0)));
check('leap year doy 366', leap.doy === 366, JSON.stringify(leap));
console.log(fail ? `${fail} failing` : 'all jjy cases pass');
process.exit(fail ? 1 : 0);
