import { describe, it, expect } from 'vitest';
import { adaptFieldsToFramework, cascadedOptions, categoryTerms, deepestCategoryCode, taxonomyFrameworkOptions } from './taxonomy';
import type { FormField, FrameworkCategory } from './types';

const categories: FrameworkCategory[] = [
  {
    code: 'board',
    name: 'Board',
    terms: [
      {
        code: 'cbse', name: 'CBSE',
        associations: [
          { name: 'English', category: 'medium' },
          { name: 'Hindi', category: 'medium' },
          { name: 'Class 1', category: 'gradeLevel' },
        ],
      },
      { code: 'icse', name: 'ICSE', associations: [{ name: 'English', category: 'medium' }] },
    ],
  },
  {
    code: 'medium',
    name: 'Medium',
    terms: [
      { code: 'en', name: 'English' },
      { code: 'hi', name: 'Hindi' },
      { code: 'ta', name: 'Tamil' },
    ],
  },
  { code: 'gradeLevel', name: 'Class', terms: [{ code: 'c1', name: 'Class 1' }, { code: 'c2', name: 'Class 2' }] },
];

describe('taxonomy', () => {
  it('returns all terms when no parent is selected', () => {
    expect(cascadedOptions(categories, 'medium', {}).map((o) => o.name)).toEqual(['English', 'Hindi', 'Tamil']);
  });

  it('narrows child options by selected-parent associations', () => {
    const opts = cascadedOptions(categories, 'medium', { board: 'CBSE' });
    expect(opts.map((o) => o.name)).toEqual(['English', 'Hindi']);
  });

  it('restricts gradeLevel by board association', () => {
    const opts = cascadedOptions(categories, 'gradeLevel', { board: 'CBSE' });
    expect(opts.map((o) => o.name)).toEqual(['Class 1']);
  });

  it('returns all terms when selected parent has no association for the category', () => {
    // ICSE has no gradeLevel association → unrestricted
    const opts = cascadedOptions(categories, 'gradeLevel', { board: 'ICSE' });
    expect(opts.map((o) => o.name)).toEqual(['Class 1', 'Class 2']);
  });

  it('categoryTerms lists every term', () => {
    expect(categoryTerms(categories, 'board').map((o) => o.name)).toEqual(['CBSE', 'ICSE']);
  });
});

describe('deepestCategoryCode', () => {
  it('picks the highest-index category regardless of array order or name (positive)', () => {
    const cats = [
      { code: 'topic', name: 'Topic', index: 3, terms: [] },
      { code: 'board', name: 'Board', index: 1, terms: [] },
      { code: 'subject', name: 'Subject', index: 2, terms: [] },
    ] as FrameworkCategory[];
    expect(deepestCategoryCode(cats)).toBe('topic');
  });

  it('is undefined before the framework has loaded (negative)', () => {
    expect(deepestCategoryCode([])).toBeUndefined();
  });
});

describe('adaptFieldsToFramework', () => {
  const form: FormField[] = [
    { code: 'name', inputType: 'text' },
    { code: 'industry', inputType: 'select' },
    { code: 'domain', inputType: 'multiSelect' },
  ];
  const ncf: FrameworkCategory[] = [
    { code: 'subject', name: 'Subject', index: 2, terms: [] },
    { code: 'board', name: 'Board', index: 1, terms: [] },
  ];

  it('drops the categories the framework lacks and adds its own, the first single-select (positive)', () => {
    const out = adaptFieldsToFramework(form, ncf);
    expect(out.map((f) => f.code)).toEqual(['name', 'board', 'subject']);
    expect(out.find((f) => f.code === 'board')).toMatchObject({ inputType: 'select', label: 'Board', editable: true });
    expect(out.find((f) => f.code === 'subject')).toMatchObject({ inputType: 'multiSelect', label: 'Subject' });
  });

  it('keeps the form\'s own field for a category the framework has (positive)', () => {
    const usf: FrameworkCategory[] = [
      { code: 'industry', name: 'Industry', index: 1, terms: [] },
      { code: 'domain', name: 'Domain', index: 2, terms: [] },
    ];
    expect(adaptFieldsToFramework(form, usf)).toEqual(form);
  });

  it('leaves the fields alone until the categories load (negative)', () => {
    expect(adaptFieldsToFramework(form, [])).toBe(form);
  });

  it('keeps form fields that aren\'t categories at all (negative)', () => {
    const withLicense: FormField[] = [...form, { code: 'license', inputType: 'select' }];
    expect(adaptFieldsToFramework(withLicense, ncf).map((f) => f.code)).toContain('license');
  });
});

describe('taxonomyFrameworkOptions', () => {
  const channel = [
    { identifier: 'NCF', name: 'CBSE' },
    { identifier: 'USF', name: 'USF' },
    { identifier: 'fw_health_competency7', name: 'HC7' },
  ];

  it('offers the channel list unchanged when no types are allowed (negative)', () => {
    expect(taxonomyFrameworkOptions(channel, [], [])).toEqual(channel);
  });

  it('takes the allowed types from the system-default search when the channel list carries no types (positive)', () => {
    const typed = [{ identifier: 'NCF', name: 'CBSE', type: 'K-12' }, { identifier: 'TPD', name: 'TPD', type: 'TPD' }];
    expect(taxonomyFrameworkOptions(channel, ['K-12', 'TPD'], typed).map((f) => f.identifier)).toEqual(['NCF', 'TPD']);
  });

  it('keeps typed channel frameworks of an allowed type and drops the rest (positive)', () => {
    const typedChannel = [
      { identifier: 'NCF', name: 'CBSE', type: 'K-12' },
      { identifier: 'fw_health_competency7', name: 'HC7', type: 'Competency' },
    ];
    const typed = [{ identifier: 'TPD', name: 'TPD', type: 'TPD' }, { identifier: 'USF', name: 'USF', type: 'K-12' }];
    // K-12 is covered by the channel, so only TPD comes from the search.
    expect(taxonomyFrameworkOptions(typedChannel, ['K-12', 'TPD'], typed).map((f) => f.identifier)).toEqual(['TPD', 'NCF']);
  });

  it('lists a framework once even if both sources have it (negative)', () => {
    const typedChannel = [{ identifier: 'NCF', name: 'CBSE', type: 'K-12' }];
    const typed = [{ identifier: 'NCF', name: 'CBSE', type: 'TPD' }];
    expect(taxonomyFrameworkOptions(typedChannel, ['K-12', 'TPD'], typed).map((f) => f.identifier)).toEqual(['NCF']);
  });
});
