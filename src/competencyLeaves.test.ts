import { describe, it, expect } from 'vitest';
import { competencyLeafCodes, competencyLeafSkills, competencySkillField } from './competencyLeaves';

// Same shapes as lern's CompetencyFrameworkUtilParseSpec, so the editor offers exactly the skills
// lern credits, under the field lern reads.
describe('competencySkillField', () => {
  it('is the code of the last category by index, whatever it is named', () => {
    const shuffled = [
      { code: 'cuisine', index: 3, terms: [{ code: 'FR2' }] },
      { code: 'area', index: 1, terms: [{ code: 'a1' }] },
      { code: 'cluster', index: 2, terms: [{ code: 'k1' }] },
    ];
    expect(competencySkillField(shuffled)).toBe('cuisine');
  });

  it('falls back to position when categories carry no index', () => {
    expect(competencySkillField([{ code: 'competency' }, { code: 'skill' }])).toBe('skill');
  });

  it('is undefined for a framework with no categories', () => {
    expect(competencySkillField(undefined)).toBeUndefined();
    expect(competencySkillField([])).toBeUndefined();
  });
});

describe('competencyLeafCodes', () => {
  it('takes the terms of the last category, not the categories above it', () => {
    const categories = [
      { code: 'competencyarea', index: 1, terms: [{ identifier: 'a1', code: 'clinical', associations: [{ identifier: 'c1', category: 'competency' }] }] },
      { code: 'competency', index: 2, terms: [{ identifier: 'c1', code: 'infection-control', associations: [{ identifier: 's1', category: 'skill' }] }] },
      { code: 'skill', index: 3, terms: [{ identifier: 's1', code: 'sterile-field', category: 'skill' }, { code: 'ppe-use' }] },
    ];
    expect(competencyLeafCodes(categories)).toEqual(['ppe-use', 'sterile-field']);
  });

  it('keeps only leaves when terms nest by children inside the skill category', () => {
    const categories = [{
      code: 'competency',
      terms: [{
        identifier: 'c1', code: 'patient-care',
        children: [{ code: 'hand-hygiene' }, { code: 'ppe-use' }],
      }],
    }];
    expect(competencyLeafCodes(categories)).toEqual(['hand-hygiene', 'ppe-use']);
  });

  it('treats a parentCode list inside the skill category as a tree', () => {
    const categories = [{
      code: 'competency',
      terms: [
        { code: 'area' },
        { code: 'comp', parentCode: 'area' },
        { code: 'leaf-1', parentCode: 'comp' },
        { code: 'leaf-2', parents: [{ code: 'comp' }] },
      ],
    }];
    expect(competencyLeafCodes(categories)).toEqual(['leaf-1', 'leaf-2']);
  });

  it('ignores children nested in a category above the skills', () => {
    const categories = [
      { code: 'area', index: 1, terms: [{ code: 'a1', children: [{ code: 'hidden' }] }] },
      { code: 'cuisine', index: 2, terms: [{ code: 'FR2' }] },
    ];
    expect(competencyLeafCodes(categories)).toEqual(['FR2']);
  });

  it('returns nothing without categories', () => {
    expect(competencyLeafCodes(undefined)).toEqual([]);
    expect(competencyLeafCodes([{ code: 'skill', terms: [] }])).toEqual([]);
  });
});

describe('competencyLeafSkills', () => {
  it('pairs each skill with its authored name, sorted by name, falling back to the code', () => {
    const categories = [{
      code: 'competency',
      terms: [{
        identifier: 'c1', code: 'care',
        children: [
          { identifier: 'l1', code: 'ppe-use', name: 'PPE use' },
          { identifier: 'l2', code: 'hand-hygiene', name: 'Hand hygiene' },
          { identifier: 'l3', code: 'no-name' },
        ],
      }],
    }];
    expect(competencyLeafSkills(categories)).toEqual([
      { code: 'hand-hygiene', name: 'Hand hygiene' },
      { code: 'no-name', name: 'no-name' },
      { code: 'ppe-use', name: 'PPE use' },
    ]);
  });
});
