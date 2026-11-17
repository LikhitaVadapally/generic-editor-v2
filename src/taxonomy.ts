/** Framework taxonomy cascade helpers. */
import type { FormField, FrameworkCategory } from './types';

export interface TermOption {
  code: string;
  name: string;
}

/** Highest-index category code, same as the knowlg-publish job's resolveCategoryCode; undefined until categories load. */
export function deepestCategoryCode(categories: FrameworkCategory[]): string | undefined {
  if (!categories.length) return undefined;
  return categories.reduce((a, b) => ((b.index ?? 0) > (a.index ?? 0) ? b : a)).code;
}

/** All option names for a category. */
export function categoryTerms(categories: FrameworkCategory[], code: string): TermOption[] {
  const cat = categories.find((c) => c.code === code);
  return (cat?.terms ?? []).map((t) => ({ code: t.code ?? t.name, name: t.name }));
}

/**
 * Options for `code`, narrowed by currently-selected values in other categories
 * (via term associations). If no parent restricts it, all terms are returned.
 *
 * selected maps category code → selected term name(s).
 */
export function cascadedOptions(
  categories: FrameworkCategory[],
  code: string,
  selected: Record<string, string | string[] | undefined>,
): TermOption[] {
  const all = categoryTerms(categories, code);
  const allowed = new Set<string>();
  let restricted = false;

  for (const cat of categories) {
    if (cat.code === code) continue;
    const sel = selected[cat.code];
    const selNames = Array.isArray(sel) ? sel : sel ? [sel] : [];
    if (!selNames.length) continue;
    for (const term of cat.terms ?? []) {
      if (!selNames.includes(term.name)) continue;
      const assoc = (term.associations ?? []).filter((a) => a.category === code);
      if (assoc.length) {
        restricted = true;
        assoc.forEach((a) => allowed.add(a.name));
      }
    }
  }

  if (!restricted) return all;
  return all.filter((o) => allowed.has(o.name));
}

/** Category codes of the frameworks Sunbird ships (K-12 and USF), so a form field for one is known to be a taxonomy field. */
export const KNOWN_CATEGORY_CODES: ReadonlySet<string> = new Set([
  'board', 'medium', 'gradeLevel', 'subject', 'industry', 'domain', 'skill',
]);

/**
 * Fits the form's fields to the chosen framework, the way the course editor's adaptFrameworkFields does.
 *
 * The content form is shared by every framework (ed-dev serves one `*` form carrying USF's fields), so a
 * content switched to CBSE would otherwise show Industry/Domain/Skill and none of its own categories.
 * Form fields for a category the framework lacks are dropped (`knownCategoryCodes` says which form fields
 * are categories at all); each framework category with no form field gets one, in `index` order. The
 * first category is single-select and the rest multiselect, which is how both K-12 (board) and USF
 * (industry) store them. Until the categories load the fields are returned as they are.
 */
export function adaptFieldsToFramework(
  fields: FormField[],
  categories: FrameworkCategory[],
  knownCategoryCodes: ReadonlySet<string> = KNOWN_CATEGORY_CODES,
): FormField[] {
  if (!categories.length) return fields;
  const own = new Set(categories.map((c) => c.code));
  const kept = fields.filter((f) => own.has(f.code) || !knownCategoryCodes.has(f.code));
  const present = new Set(kept.map((f) => f.code));
  const ordered = [...categories].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const added: FormField[] = ordered
    .filter((c) => !present.has(c.code))
    .map((c) => ({
      code: c.code,
      label: c.name ?? c.code,
      inputType: c.code === ordered[0].code ? 'select' : 'multiSelect',
      visible: true,
      editable: true,
    }));
  return [...kept, ...added];
}
