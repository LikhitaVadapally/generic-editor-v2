/**
 * Skills of a `CompetencyFramework` (Knowlg `/competency-framework/v3/read`), worked out the way
 * lern-service does it (`CompetencyFrameworkUtil.parseTree` / `parseSkillField`), so a course is
 * only ever tagged with skills lern can credit, under the field lern reads them from.
 *
 * The skill category is the framework's LAST category by `index` (falling back to its position in
 * the response), whatever the adopter names it. Its code is the content field skill tags are
 * stored in (`skill` for one framework, `cuisine` for another), and its terms are the skills.
 * Inside it, terms may still nest by `children` or name a `parentCode`/`parents` in the same
 * category; then only a term nobody descends from is a skill. Categories above it are navigation
 * only and never offered.
 */

export interface CompetencyTermWire {
  identifier?: string;
  code?: string;
  name?: string;
  category?: string;
  status?: string;
  children?: CompetencyTermWire[];
  associations?: Array<{ identifier?: string; category?: string }>;
  parentCode?: string;
  parents?: Array<{ code?: string }>;
}

export interface CompetencyCategoryWire {
  code?: string;
  index?: number;
  terms?: CompetencyTermWire[];
}

export interface CompetencySkill {
  code: string;
  name: string;
}

/** The skill category: the last one by `index`, position breaking the tie for a missing index. */
function skillCategory(categories: CompetencyCategoryWire[] | undefined): CompetencyCategoryWire | undefined {
  const ordered = (categories ?? [])
    .map((c, pos) => ({ c, key: typeof c.index === 'number' ? c.index : pos }))
    .sort((a, b) => a.key - b.key);
  return ordered[ordered.length - 1]?.c;
}

/** The content field a course's skill tags live in: the skill category's code. */
export function competencySkillField(categories: CompetencyCategoryWire[] | undefined): string | undefined {
  return skillCategory(categories)?.code || undefined;
}

function flatten(terms: CompetencyTermWire[]): CompetencyTermWire[] {
  return terms.flatMap((t) => [t, ...flatten(t.children ?? [])]);
}

/** Skill codes, sorted. Empty when the framework has no categories or its last one has no terms. */
export function competencyLeafCodes(categories: CompetencyCategoryWire[] | undefined): string[] {
  const all = flatten(skillCategory(categories)?.terms ?? []);
  const codes = new Set(all.map((t) => t.code).filter((c): c is string => Boolean(c)));
  const parents = new Set(
    all
      .map((t) => t.parentCode ?? t.parents?.find((p) => p.code)?.code)
      .filter((p): p is string => Boolean(p) && codes.has(p as string)),
  );
  const leaves = all
    .filter((t) => t.code && !(t.children?.length) && !parents.has(t.code))
    .map((t) => t.code as string);
  return [...new Set(leaves)].sort();
}

/** Skills with their authored names, sorted by name. */
export function competencyLeafSkills(categories: CompetencyCategoryWire[] | undefined): CompetencySkill[] {
  const names = new Map<string, string>();
  flatten(skillCategory(categories)?.terms ?? []).forEach((t) => {
    if (t.code && t.name && !names.has(t.code)) names.set(t.code, t.name);
  });
  return competencyLeafCodes(categories)
    .map((code) => ({ code, name: names.get(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
