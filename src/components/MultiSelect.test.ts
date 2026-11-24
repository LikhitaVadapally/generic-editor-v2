import { describe, it, expect } from 'vitest';
import { filterByName } from './MultiSelect';

const skills = [
  { code: 'fe_sk_promises', name: 'Use Promises' },
  { code: 'fe_sk_await', name: 'Use Async Await' },
  { code: 'fe_sk_fetch', name: 'Call a REST API' },
];

describe('filterByName', () => {
  it('returns every option for an empty or blank query', () => {
    expect(filterByName(skills, '')).toEqual(skills);
    expect(filterByName(skills, '  ')).toEqual(skills);
  });

  it('matches anywhere in the name, ignoring case and surrounding spaces', () => {
    expect(filterByName(skills, ' ASYNC ').map((o) => o.code)).toEqual(['fe_sk_await']);
    expect(filterByName(skills, 'use').map((o) => o.code)).toEqual(['fe_sk_promises', 'fe_sk_await']);
  });

  it('matches the name, not the code', () => {
    expect(filterByName(skills, 'fe_sk')).toEqual([]);
  });
});
