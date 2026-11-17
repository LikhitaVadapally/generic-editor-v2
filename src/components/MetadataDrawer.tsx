import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import Drawer from './Drawer';
import MultiSelect from './MultiSelect';
import SkillTagFields from './SkillTagFields';
import { SKILL_FRAMEWORK_FIELD, asCodes, useSkillFramework } from '../skillTagging';
import type { EditorController } from '../useEditor';
import type { FormField, FrameworkCategory } from '../types';
import { t, tf } from '../i18n/i18n';
import { KNOWN_CATEGORY_CODES, adaptFieldsToFramework, cascadedOptions, deepestCategoryCode, taxonomyFrameworkOptions } from '../taxonomy';
import { PencilIcon, ChevronDown, ImageIcon, CheckIcon } from '../icons';
import { type DifficultyTarget, toDifficultyTarget, serializeDifficultyTarget } from '../difficultyTarget';
import { dynamicAssessSettings, needsGeneration } from '../dynamicAssessDraw';
import { planPool } from '../poolPlan';

/**
 * Multi-value field? Driven by the form definition, not a hardcoded list — a field
 * is an array if the form marks it multiselect (or dataType 'list'), so any custom
 * taxonomy category the framework returns is handled dynamically.
 */
function isMultiField(f: FormField, dynamicAssess = false): boolean {
  if (dynamicAssess && isSkillField(f)) return true;
  const it = (f.inputType ?? '').toLowerCase();
  if (it.includes('multi')) return true;
  const dt = (f.dataType ?? '').toLowerCase();
  return dt === 'list';
}

/** difficultyTarget is matched by code: the form definition has no inputType for three named number fields. */
function isDifficultyTargetField(f: FormField): boolean {
  return f.code?.toLowerCase() === 'difficultytarget';
}

/** Dynamic Assess skill is always a list bound to the framework's deepest category, matching question-set editor-v2's isSkillField. */
function isSkillField(f: FormField): boolean {
  return f.code?.toLowerCase() === 'skill';
}


const DifficultyTargetInput: React.FC<{
  lang: string; label: string; required?: boolean; disabled?: boolean;
  value: DifficultyTarget; onChange: (v: DifficultyTarget) => void;
}> = ({ lang, label, required, disabled, value, onChange }) => {
  const rows: Array<{ key: keyof DifficultyTarget; text: string }> = [
    { key: 'E', text: t(lang, 'DIFFICULTY_EASY') },
    { key: 'M', text: t(lang, 'DIFFICULTY_MEDIUM') },
    { key: 'D', text: t(lang, 'DIFFICULTY_DIFFICULT') },
  ];
  const labelId = useId();
  return (
    <div className="ce-field-full" role="group" aria-labelledby={labelId}>
      <label id={labelId} className="ce-label-sm">{label}{required && <span className="ce-required-star">*</span>}</label>
      <div style={{ display: 'flex', gap: 12 }}>
        {rows.map(({ key, text }) => (
          <div key={key} style={{ flex: 1 }}>
            <span className="ce-label-sm" style={{ fontWeight: 400 }} aria-hidden="true">{text}</span>
            <input
              type="number"
              min={0}
              step={1}
              className="ce-input ce-input-sm"
              aria-label={text}
              value={value[key] ?? 0}
              disabled={disabled}
              onChange={(e) => {
                const n = e.target.value === '' ? 0 : Math.max(0, Math.floor(Number(e.target.value)) || 0);
                onChange({ ...value, [key]: n });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

/** Live pool counts the job allocates from: per skill x level, and per skill overall (knowlg-service's floor). */
export interface PoolCounts { buckets: Record<string, Record<'E' | 'M' | 'D', number>>; skillCounts: Record<string, number> }

/** Why the job couldn't generate these settings (the first problem, in the order Save reports them), or null; shared by Save's check and the panel's example. */
export function poolProblem(
  lang: string, skills: string[], target: DifficultyTarget, counts: PoolCounts, minCriteria: number, multiplier: number,
): string | null {
  const { buckets, skillCounts } = counts;
  const plan = planPool(skills, target, (s, l) => buckets[s]?.[l] ?? 0, minCriteria, multiplier);
  if (plan.infeasible) {
    return tf(lang, 'ERROR_TOO_MANY_SKILLS', { count: skills.length, needed: skills.length * minCriteria, min: minCriteria });
  }
  if (plan.uncovered.length) {
    const levelKey = { E: 'DIFFICULTY_EASY', M: 'DIFFICULTY_MEDIUM', D: 'DIFFICULTY_DIFFICULT' } as const;
    const lines = plan.uncovered.map(({ level, covered, target: requested }) =>
      tf(lang, 'ERROR_POOL_SHORTFALL', { level: t(lang, levelKey[level]), requested, needed: requested * multiplier, available: covered * multiplier }));
    return `${t(lang, 'ERROR_POOL_INSUFFICIENT')}: ${lines.join('; ')}`;
  }
  // A skill that can't get its own minimum would be left out of the pool, and the settings would then never match the questions.
  if (plan.shortSkills.length) return tf(lang, 'ERROR_SKILL_LEVELS_SHORT', { skills: plan.shortSkills.join(', ') });
  // Same per-skill floor knowlg-service enforces at Generate, so it fails here, translated, instead of after a successful save.
  const perSkill = minCriteria * multiplier;
  const shortSkills = skills.filter((s) => (skillCounts[s] ?? 0) < perSkill);
  return shortSkills.length ? tf(lang, 'ERROR_SKILL_POOL_TOO_SMALL', { needed: perSkill, skills: shortSkills.join(', ') }) : null;
}

/** Dynamic Assess: shows the per-skill minimum against the live Difficulty Target, so a too-small total is visible before Save rejects it; "See an example" explains the rule with a fixed example. */
export const MinimumPerSkillPanel: React.FC<{
  lang: string; minCriteria: number; skillCount: number; target: DifficultyTarget;
}> = ({ lang, minCriteria, skillCount, target }) => {
  const [expanded, setExpanded] = useState(false);
  const total = (target.E ?? 0) + (target.M ?? 0) + (target.D ?? 0);
  const minimum = minCriteria * skillCount;
  const short = total < minimum;
  // Fixed example (2 skills, n per level), independent of what the creator entered; only the system's minCriteria feeds it.
  const n = Math.max(minCriteria, 1);
  return (
    <div className={`ce-min-skill${short ? ' ce-min-skill--short' : ''}`} role="status">
      <p className="ce-min-skill-title">{t(lang, 'MIN_PER_SKILL_TITLE')}</p>
      <p className="ce-min-skill-sub">{tf(lang, short ? 'MIN_PER_SKILL_SHORT' : 'MIN_PER_SKILL_OK', { min: minCriteria, minimum })}</p>
      {expanded && (
        <div className="ce-min-skill-example">
          <p>{tf(lang, 'MIN_PER_SKILL_EX_INTRO', { n })}</p>
          <ul>
            <li>{tf(lang, 'MIN_PER_SKILL_EX_TOTAL', { total: 3 * n })}</li>
            <li>{tf(lang, 'MIN_PER_SKILL_EX_EACH', { min: minCriteria })}</li>
          </ul>
        </div>
      )}
      <div className="ce-min-skill-foot">
        <span>{tf(lang, 'MIN_PER_SKILL_TOTALS', { total, minimum })}</span>
        <span className="ce-min-skill-actions">
          {short && <span className="ce-min-skill-badge">{t(lang, 'MIN_PER_SKILL_NEEDS_ADJUSTMENT')}</span>}
          <button type="button" className="ce-min-skill-toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            {expanded ? `${t(lang, 'MIN_PER_SKILL_HIDE_EXAMPLE')} ▴` : `${t(lang, 'MIN_PER_SKILL_SEE_EXAMPLE')} ▾`}
          </button>
        </span>
      </div>
    </div>
  );
};

/** Fallback field set when form/read returns nothing (keeps the drawer usable). */
const FALLBACK_FIELDS: FormField[] = [
  { code: 'appicon', inputType: 'file', label: 'Thumbnail', index: 1, visible: true, editable: true },
  { code: 'name', inputType: 'text', label: 'Title', index: 2, required: true, visible: true, editable: true },
  { code: 'description', inputType: 'textarea', label: 'Description', index: 3, visible: true, editable: true },
  { code: 'board', inputType: 'select', label: 'Board / Syllabus', index: 4, visible: true, editable: true },
  { code: 'medium', inputType: 'multiselect', label: 'Medium', index: 5, visible: true, editable: true },
  { code: 'gradeLevel', inputType: 'multiselect', label: 'Class', index: 6, visible: true, editable: true },
  { code: 'subject', inputType: 'multiselect', label: 'Subject', index: 7, visible: true, editable: true },
];

const Select: React.FC<{
  label: string; placeholder: string; value: string; required?: boolean; disabled?: boolean;
  options: { code: string; name: string }[]; onChange: (v: string) => void;
}> = ({ label, placeholder, value, required, disabled, options, onChange }) => (
  <div>
    <label className="ce-label-sm">{label}{required && <span className="ce-required-star">*</span>}</label>
    <div className="ce-select-wrap" style={{ maxWidth: 'none' }}>
      <select
        className="ce-select ce-select-sm"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.code} value={o.name}>{o.name}</option>)}
      </select>
      <span className="ce-select-chevron"><ChevronDown size={12} /></span>
    </div>
  </div>
);

const MetadataDrawer: React.FC<{ ed: EditorController }> = ({ ed }) => {
  const {
    lang, content, drawer, setDrawer, saveMetadata, saveMetadataAndSubmit, service, framework, busy, busyAction,
    showToast, reviewErrors, setReviewErrors, reviewSubmitMode, setReviewSubmitMode,
  } = ed;
  const saving = busyAction === 'save-metadata' || busyAction === 'save-submit';
  const open = drawer === 'metadata';

  /* Single-value fields (name, description, board). */
  const [values, setValues] = useState<Record<string, string>>({});
  /* Multi-value taxonomy fields (medium, gradeLevel, subject) — real arrays. */
  const [multiVals, setMultiVals] = useState<Record<string, string[]>>({});
  /* Dynamic Assess difficultyTarget fields — object-shaped {E,M,D}, keyed by code. */
  const [diffTargets, setDiffTargets] = useState<Record<string, DifficultyTarget>>({});
  const [appIcon, setAppIcon] = useState<string | undefined>();
  const [categories, setCategories] = useState<FrameworkCategory[]>([]);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const loadedFw = useRef<string | null>(null);
  const loadedFormKey = useRef<string | null>(null);
  /** Content id already seeded this open-session — prevents an async form load re-seeding over edits. */
  const seededRef = useRef<string | null>(null);
  /** Separate seed guard for difficultyTarget: it only appears once the async form loads, after seededRef has already fired. */
  const diffSeededRef = useRef<string | null>(null);
  /* The content's taxonomy framework, picked by the author (Dynamic Assess also takes its skill options from its deepest category). */
  const [selectedFw, setSelectedFw] = useState('');
  /** Category codes of frameworks switched away from this session (code -> was multiselect); saved empty so their terms don't linger. */
  const [staleCategories, setStaleCategories] = useState<Record<string, boolean>>({});
  /** Every category code seen this session, so a form field for any of them is known to be a taxonomy field. */
  const seenCategoryCodes = useRef<Set<string>>(new Set(KNOWN_CATEGORY_CODES));
  /** Field codes already seeded from the content this session; fields a framework adds later are seeded once, then left to the author. */
  const seededCodes = useRef<Set<string>>(new Set());
  // True while the pool searches run before a generating save, so a second click can't save twice.
  const [checking, setChecking] = useState(false);
  const [fwOptions, setFwOptions] = useState<Array<{ identifier: string; name: string }>>([]);
  const contentChannel = (content as Record<string, unknown> | null)?.channel as string | undefined;
  const contentCategory = String((content as Record<string, unknown> | null)?.primaryCategory ?? '');
  /* Skill tagging (not Dynamic Assess, whose skill picker means something else): the skill framework and its picked skill codes. */
  const tagsSkills = !ed.isDynamicAssess;
  const [skillFw, setSkillFw] = useState('');
  const [skillFwOptions, setSkillFwOptions] = useState<Array<{ identifier: string; name: string }>>([]);
  /** null until seeded from the content's skill field, which is known once its framework loads. */
  const [skillCodes, setSkillCodes] = useState<string[] | null>(null);
  const [skillDirty, setSkillDirty] = useState(false);
  /** Skill fields of frameworks switched away from this session; saved empty so the old skills don't linger. */
  const [staleSkillFields, setStaleSkillFields] = useState<string[]>([]);
  const { skills: fwSkills, skillField } = useSkillFramework(service, tagsSkills ? skillFw : '');

  // Bumped on every open/close, so a save still awaiting its pool check after the drawer closed is dropped.
  const sessionRef = useRef(0);
  useEffect(() => {
    sessionRef.current += 1;
    if (open) {
      setSelectedFw(String(content?.framework || framework || ''));
      setStaleCategories({});
    }
    if (open) {
      setSkillFw(String((content as Record<string, unknown> | null)?.[SKILL_FRAMEWORK_FIELD] ?? ''));
      setSkillCodes(null);
      setSkillDirty(false);
      setStaleSkillFields([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, content?.identifier]);

  useEffect(() => {
    if (!open) return;
    const channel = contentChannel ?? ed.context.channel;
    // Dynamic Assess keeps its system-default list. Other content gets the list a course's "Course Type" shows: the
    // channel's frameworks narrowed to the types its category allows (orgFWType). Content categories rarely declare
    // any, so Course's types stand in; without that the channel's competency frameworks would be offered too.
    const category = contentCategory;
    const allowedTypes = async (): Promise<string[]> => {
      const own = category ? await service.readOrgFrameworkTypes(category, 'Content', channel).catch(() => []) : [];
      return own.length ? own : service.readOrgFrameworkTypes('Course', 'Collection', channel).catch(() => []);
    };
    const loadTaxonomy = async () => {
      const [list, types] = await Promise.all([service.readChannelFrameworks(channel).catch(() => []), allowedTypes()]);
      const channelTypes = new Set(list.map((f) => f.type).filter(Boolean));
      const missing = types.filter((t) => !channelTypes.has(t));
      const typed = missing.length ? await service.searchFrameworksByType(missing, channel).catch(() => []) : [];
      const opts = taxonomyFrameworkOptions(list, types, typed);
      return opts.length ? opts : service.searchFrameworks(channel);
    };
    const load = ed.isDynamicAssess ? service.searchFrameworks(channel) : loadTaxonomy();
    load.then(setFwOptions).catch(() => setFwOptions([]));
  }, [open, ed.isDynamicAssess, service, contentChannel, ed.context.channel, contentCategory]);

  useEffect(() => {
    if (!open || !tagsSkills) return;
    service.searchCompetencyFrameworks(contentChannel ?? ed.context.channel).then(setSkillFwOptions).catch(() => setSkillFwOptions([]));
  }, [open, tagsSkills, service, contentChannel, ed.context.channel]);

  /* Seeds the picked skills from the content once its skill framework (and so its skill field) has loaded. */
  useEffect(() => {
    if (!open || skillCodes !== null || !skillField) return;
    setSkillCodes(asCodes((content as Record<string, unknown> | null)?.[skillField]));
  }, [open, skillCodes, skillField, content]);

  /** A new skill framework has different skills, so the old picks are cleared, here and on save. */
  const onSkillFrameworkChange = (fw: string) => {
    if (fw === skillFw) return;
    if (skillField) setStaleSkillFields((s) => (s.includes(skillField) ? s : [...s, skillField]));
    setSkillFw(fw);
    setSkillCodes([]);
    setSkillDirty(true);
  };

  /* Framework categories for taxonomy cascade. */
  useEffect(() => {
    // Follows the picker alone, so choosing Dynamic Assess's placeholder leaves Skill without options.
    const fw = selectedFw;
    if (!open || !fw || loadedFw.current === fw) return;
    loadedFw.current = fw;
    // Only the latest requested framework may apply, since a slower earlier read can resolve after it.
    service.readFramework(fw)
      .then((c) => {
        if (loadedFw.current !== fw) return;
        for (const cat of c) seenCategoryCodes.current.add(cat.code);
        setCategories(c);
      })
      .catch(() => { if (loadedFw.current === fw) setCategories([]); });
  }, [open, service, selectedFw]);

  /* Form/read field definitions — save form for Edit Details, review form for
   * Submit-for-review. Keyed on subtype+action (+ the picked framework, which the
   * form is read for) so switching mode or framework refetches while the drawer stays open. */
  // Dynamic Assess keeps reading the form of the content's saved framework, as before.
  const formFw = ed.isDynamicAssess ? (content?.framework ?? framework) : (selectedFw || content?.framework || framework);
  useEffect(() => {
    const subtype = content?.primaryCategory ?? content?.contentType ?? '';
    const action: 'save' | 'review' = reviewSubmitMode ? 'review' : 'save';
    const key = `${subtype}:${action}:${formFw ?? ''}`;
    if (!open || !subtype || loadedFormKey.current === key) return;
    loadedFormKey.current = key;
    service
      .readFormFields(subtype, action, {
        framework: formFw,
        rootOrgId: ed.rootOrgId ?? ed.context.channel,
      })
      .then((f) => setFormFields(f.length ? f : FALLBACK_FIELDS))
      .catch(() => setFormFields(FALLBACK_FIELDS));
  }, [open, content, reviewSubmitMode, service, formFw, ed.rootOrgId, ed.context.channel]);

  /* Visible, render-ordered fields, fitted to the picked framework's categories (Dynamic Assess keeps its own form as is). */
  const fields = useMemo(() => {
    const src = (formFields.length ? formFields : FALLBACK_FIELDS).filter((f) => f.visible !== false);
    return ed.isDynamicAssess ? src : adaptFieldsToFramework(src, categories, seenCategoryCodes.current);
  }, [formFields, categories, ed.isDynamicAssess]);

  /* Taxonomy category codes come from the framework, not a hardcoded list. */
  const taxoCodes = useMemo(() => new Set(categories.map((c) => c.code)), [categories]);
  /* Cascade order: parents first (framework index), so we can reset dependents. */
  const orderedTaxoCodes = useMemo(
    () => [...categories].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((c) => c.code),
    [categories],
  );
  const skillCategoryCode = useMemo(() => deepestCategoryCode(categories), [categories]);
  // Dynamic Assess: the selection is the framework's deepest category, so the picker carries that category's name.
  const skillCategoryLabel = ed.isDynamicAssess ? categories.find((c) => c.code === skillCategoryCode)?.name : undefined;
  /** A form field for the deepest category itself, which the Dynamic skill picker already edits. */
  const isReplacedBySkillPicker = (f: FormField) => ed.isDynamicAssess && !!skillCategoryCode && f.code === skillCategoryCode && !isSkillField(f);
  const skillPickerCode = ed.isDynamicAssess ? fields.find(isSkillField)?.code : undefined;
  // This content's own rules (knowlg-service stores them at create), so the panel and pool check match what the job enforces.
  const { minCriteria, multiplier } = dynamicAssessSettings(content as Record<string, unknown> | null);
  /** Content as this save would leave it, with the picker's terms as the in-memory selection. */
  const withSelection = (out: Record<string, unknown>) => ({
    ...(content ?? {}),
    ...out,
    ...(skillPickerCode ? { dynamicSkills: multiVals[skillPickerCode] ?? [] } : {}),
  });

  const setVal = (code: string, v: string) => setValues((s) => ({ ...s, [code]: v }));
  const setMulti = (code: string, v: string[]) => setMultiVals((s) => ({ ...s, [code]: v }));

  /* Seed values from content once the field set is known — string fields into
     `values`, multiselect fields into `multiVals`, driven by the form definition. */
  useEffect(() => {
    if (!open) { seededRef.current = null; seededCodes.current = new Set(); return; } // reset so the next open re-seeds
    if (!content) return;
    // Seed once per open-session; a later async form-fields load must not clobber user typing.
    if (seededRef.current === content.identifier) return;
    seededRef.current = content.identifier;
    seededCodes.current = new Set(fields.map((f) => f.code));
    const vals: Record<string, string> = {
      name: content.name ?? '',
      description: content.description ?? '',
    };
    const multi: Record<string, string[]> = {};
    for (const f of fields) {
      if (f.code === 'name' || f.code === 'description') continue;
      if (f.code === 'appicon' || f.code === 'appIcon') continue;
      if (isDifficultyTargetField(f)) continue; // seeded separately below — see diffSeededRef
      // The Dynamic skill picker shows the selection read from the framework's skill field, not a field named "skill".
      const cv = ed.isDynamicAssess && isSkillField(f) ? content.dynamicSkills : (content as Record<string, unknown>)[f.code];
      if (isMultiField(f, ed.isDynamicAssess)) {
        multi[f.code] = Array.isArray(cv) ? cv.map(String) : cv != null && cv !== '' ? [String(cv)] : [];
      } else {
        vals[f.code] = cv != null ? String(cv) : '';
      }
    }
    setValues(vals);
    setMultiVals(multi);
    setAppIcon(content.appIcon);
  }, [open, content, fields]);

  /* Seeds the category fields a framework adds after the first seed (its categories load later, or the author
     switched framework) from the content, once each; values already in play are left alone. */
  useEffect(() => {
    if (!open || !content || seededRef.current !== content.identifier || ed.isDynamicAssess) return;
    const fresh = fields.filter((f) => taxoCodes.has(f.code) && !seededCodes.current.has(f.code));
    if (!fresh.length) return;
    const vals: Record<string, string> = {};
    const multi: Record<string, string[]> = {};
    for (const f of fresh) {
      seededCodes.current.add(f.code);
      const cv = (content as Record<string, unknown>)[f.code];
      if (isMultiField(f)) multi[f.code] = Array.isArray(cv) ? cv.map(String) : cv != null && cv !== '' ? [String(cv)] : [];
      else vals[f.code] = Array.isArray(cv) ? String(cv[0] ?? '') : cv != null ? String(cv) : '';
    }
    setValues((s) => ({ ...vals, ...s }));
    setMultiVals((s) => ({ ...multi, ...s }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, content, fields]);

  /* Seeds difficultyTarget and skill once they appear (form-only fields, absent from FALLBACK_FIELDS); safe since neither is rendered before then. */
  useEffect(() => {
    if (!open) { diffSeededRef.current = null; return; }
    if (!content) return;
    const dtFields = fields.filter(isDifficultyTargetField);
    if (dtFields.length === 0) return;
    if (diffSeededRef.current === content.identifier) return;
    diffSeededRef.current = content.identifier;
    const diff: Record<string, DifficultyTarget> = {};
    for (const f of dtFields) {
      diff[f.code] = toDifficultyTarget((content as Record<string, unknown>)[f.code]);
    }
    setDiffTargets((s) => ({ ...s, ...diff }));
    const skill: Record<string, string[]> = {};
    for (const f of ed.isDynamicAssess ? fields.filter(isSkillField) : []) {
      skill[f.code] = content.dynamicSkills ?? [];
    }
    setMultiVals((s) => ({ ...s, ...skill }));
  }, [open, content, fields]);

  const appIconField = fields.find((f) => f.code === 'appicon' || f.code === 'appIcon');
  const hasAppIcon = !!appIconField;
  const appIconLabel = appIconField?.label ?? appIconField?.name ?? t(lang, 'THUMBNAIL');
  const appIconAddText = appIconField?.placeholder ?? t(lang, 'ADD_IMAGE');

  /* Selected taxonomy values keyed by category code (for the cascade). */
  const selectedTaxo = useMemo(() => {
    const sel: Record<string, string | string[]> = {};
    for (const code of taxoCodes) sel[code] = multiVals[code] ?? values[code] ?? '';
    return sel;
  }, [taxoCodes, multiVals, values]);

  /* Reset every category that depends on `changedCode` (later in cascade order). */
  const resetDependents = (changedCode: string) => {
    const idx = orderedTaxoCodes.indexOf(changedCode);
    if (idx < 0) return;
    for (const code of orderedTaxoCodes.slice(idx + 1)) {
      setMulti(code, []);
      setVal(code, '');
    }
    // The Dynamic skill picker holds the deepest category's terms under its own code, so it resets with that category.
    if (ed.isDynamicAssess && skillPickerCode && skillCategoryCode && orderedTaxoCodes.slice(idx + 1).includes(skillCategoryCode)) setMulti(skillPickerCode, []);
  };

  /** A new framework means different category terms, so clear skill and every category value picked under the old one. */
  const onFrameworkChange = (fw: string) => {
    if (fw === selectedFw) return;
    const codes = [...categories.map((c) => c.code), 'skill'];
    if (!ed.isDynamicAssess) {
      // The old framework's terms are written empty on save (unless the new one shares the category), so they don't linger.
      const multiOf = new Map(fields.map((f) => [f.code, isMultiField(f)]));
      setStaleCategories((s) => ({
        ...s,
        ...Object.fromEntries(categories.map((c) => [c.code, multiOf.get(c.code) ?? true])),
      }));
    }
    setSelectedFw(fw);
    setCategories([]);
    loadedFw.current = null; // otherwise re-picking the original framework (or the placeholder) never reloads its categories
    // Only fields already held as multiselects; an empty array for a single-select would mask its later value in selectedTaxo.
    setMultiVals((s) => ({ ...s, ...Object.fromEntries(codes.filter((c) => c in s || c === skillPickerCode).map((c) => [c, []])) }));
    setValues((s) => ({ ...s, ...Object.fromEntries(codes.filter((c) => c in s).map((c) => [c, ''])) }));
  };

  /** Labels of required, editable, visible fields left empty (any inputType). */
  const missingRequired = (): string[] => {
    const miss: string[] = [];
    for (const f of fields) {
      if (!f.required || f.editable === false || f.visible === false) continue;
      if (isReplacedBySkillPicker(f)) continue;
      const code = f.code;
      let empty: boolean;
      if (code === 'appicon' || code === 'appIcon') empty = !appIcon;
      else if (isDifficultyTargetField(f)) {
        const dt = diffTargets[code] ?? {};
        empty = (dt.E ?? 0) + (dt.M ?? 0) + (dt.D ?? 0) <= 0;
      }
      else if (isMultiField(f, ed.isDynamicAssess)) empty = (multiVals[code] ?? []).length === 0;
      else empty = !((values[code] ?? '').trim());
      if (empty) miss.push(f.label ?? f.name ?? code);
    }
    return miss;
  };

  /** The fields this save would write; the Save label and onSave both read it, so they never disagree. */
  const buildOut = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.editable === false) continue;
      const code = f.code === 'appIcon' ? 'appIcon' : f.code;
      if (code === 'appicon' || code === 'appIcon') continue; // handled below
      if (isDifficultyTargetField(f)) {
        out[f.code] = serializeDifficultyTarget(diffTargets[f.code] ?? { E: 0, M: 0, D: 0 });
        continue;
      }
      if (isReplacedBySkillPicker(f)) continue;
      if (ed.isDynamicAssess && isSkillField(f)) {
        // Saved in the framework's deepest category field, where the backend reads the selection; left out until that field is known.
        const arr = multiVals[f.code];
        // An empty array, not undefined, so removing the last skill clears it on the server too; an unseeded picker writes nothing.
        if (skillCategoryCode && arr) out[skillCategoryCode] = arr;
        continue;
      }
      if (isMultiField(f, ed.isDynamicAssess)) {
        const arr = multiVals[f.code] ?? [];
        out[f.code] = arr.length ? arr : undefined;
        continue;
      }
      const raw = values[f.code];
      if (raw == null) continue;
      out[f.code] = raw || undefined;
    }
    if (appIcon) out.appIcon = appIcon;
    if (ed.isDynamicAssess && selectedFw) out.framework = selectedFw;
    else if (selectedFw && selectedFw !== content?.framework) {
      out.framework = selectedFw;
      // Categories of a framework switched away from, that the picked one doesn't have: list fields as [], single ones removed.
      for (const [code, multi] of Object.entries(staleCategories)) {
        if (!taxoCodes.has(code) && !(code in out)) out[code] = multi ? [] : null;
      }
    }
    // Skill tags are only written once the creator touches them, so other edits never rewrite them.
    if (tagsSkills && skillDirty && skillFw) {
      out[SKILL_FRAMEWORK_FIELD] = skillFw;
      for (const f of staleSkillFields) if (f !== skillField) out[f] = [];
      if (skillField) out[skillField] = skillCodes ?? [];
    }
    out.name = (values.name ?? '').trim();
    return out;
  };

  /** Blocks the save unless the job could generate these settings (its own allocation rules) and knowlg-service would accept every skill; returns true to proceed. */
  /** Live pool counts for these skills, from the same searches the job allocates from. */
  const loadPoolCounts = async (skills: string[]): Promise<PoolCounts> => {
    const channel = (content as Record<string, unknown> | null)?.channel as string | undefined;
    const [buckets, skillCounts] = await Promise.all([
      service.searchAssessmentItemBucketCounts(skills, channel ?? ed.context.channel, skillCategoryCode ?? 'skill'),
      service.searchSkillPoolCounts(skills, skillCategoryCode ?? 'skill'),
    ]);
    return { buckets, skillCounts };
  };

  const checkPoolSufficiency = async (candidate: Record<string, unknown>): Promise<boolean> => {
    const target = toDifficultyTarget(candidate.difficultyTarget);
    const skillValues = Array.isArray(candidate.dynamicSkills) ? candidate.dynamicSkills.map(String) : [];
    let counts: PoolCounts;
    try {
      counts = await loadPoolCounts(skillValues);
    } catch {
      showToast(t(lang, 'ERROR_POOL_CHECK_FAILED'), 'error');
      return false;
    }
    const problem = poolProblem(lang, skillValues, target, counts, minCriteria, multiplier);
    if (problem) {
      showToast(problem, 'error');
      return false;
    }
    return true;
  };

  const onSave = async () => {
    if (checking || busy) return; // a second click during the pool searches would save and generate twice
    if (ed.dynamicAssessRefreshing) return; // a save now would skip generating, since only one generation runs at a time
    const nameField = fields.find((f) => f.code === 'name');
    if (nameField?.required !== false && !(values.name ?? '').trim()) {
      showToast(t(lang, 'ERROR_TITLE_REQUIRED'), 'error');
      return;
    }
    // On the submit-for-review path, enforce every required field the form marks (not just name).
    if (reviewSubmitMode) {
      const miss = missingRequired();
      if (miss.length) { setReviewErrors(miss); return; }
    }
    const out = buildOut();
    const generates = needsGeneration(withSelection(out), content?.framework ?? '');
    // Submitting can't also generate, so changed settings must be saved (and generated) first.
    if (reviewSubmitMode && generates) {
      showToast(t(lang, 'ERROR_DYNAMIC_ASSESS_SUBMIT_STALE'), 'error');
      return;
    }
    if (generates) {
      const session = sessionRef.current;
      setChecking(true);
      try {
        // The pool is only checked when this save will generate, so other edits cost no extra searches.
        if (!(await checkPoolSufficiency(withSelection(out)))) return;
      } finally {
        setChecking(false);
      }
      if (sessionRef.current !== session) return; // the drawer closed or switched content during the check
    }
    setReviewErrors([]);
    // Only a Dynamic save names the skill field it wrote; other content keeps the plain call.
    const args: [Record<string, unknown>, { skillField?: string }?] = ed.isDynamicAssess ? [out, { skillField: skillCategoryCode }] : [out];
    if (reviewSubmitMode) saveMetadataAndSubmit(...args);
    else saveMetadata(...args);
  };

  const onClose = () => { setReviewErrors([]); setReviewSubmitMode(false); setDrawer(null); };

  /* Renders a single form field by its inputType. */
  /** The taxonomy framework picker; the current framework stays selectable even if it isn't in the fetched list. */
  const renderFrameworkPicker = (disabled = false) => {
    const fwList = selectedFw && !fwOptions.some((o) => o.identifier === selectedFw)
      ? [{ identifier: selectedFw, name: selectedFw }, ...fwOptions]
      : fwOptions;
    return (
      <div className="ce-field-full">
        <label className="ce-label-sm" htmlFor="ce-framework-picker">{t(lang, 'DYNAMIC_ASSESS_FRAMEWORK')}</label>
        <div className="ce-select-wrap" style={{ maxWidth: 'none' }}>
          <select
            id="ce-framework-picker"
            className="ce-select ce-select-sm"
            value={selectedFw}
            disabled={disabled}
            onChange={(e) => onFrameworkChange(e.target.value)}
          >
            {/* Only Dynamic Assess may go back to no framework; other content always has one. */}
            <option value="" disabled={!ed.isDynamicAssess && !!selectedFw}>{t(lang, 'DYNAMIC_ASSESS_SELECT_FRAMEWORK')}</option>
            {fwList.map((o) => <option key={o.identifier} value={o.identifier}>{o.name}</option>)}
          </select>
          <span className="ce-select-chevron"><ChevronDown size={12} /></span>
        </div>
      </div>
    );
  };

  const renderField = (f: FormField) => {
    const code = f.code;
    const label = f.label ?? f.name ?? code;
    const placeholder = f.placeholder ?? '';
    const disabled = f.editable === false;
    const required = !!f.required;

    if (code === 'appicon' || code === 'appIcon') return null; // rendered in the top block

    if (isDifficultyTargetField(f)) {
      const target = diffTargets[code] ?? { E: 0, M: 0, D: 0 };
      const selectedSkills = skillPickerCode ? (multiVals[skillPickerCode] ?? []) : [];
      return (
        <React.Fragment key={code}>
          <DifficultyTargetInput
            lang={lang}
            label={label}
            required={required}
            disabled={disabled}
            value={target}
            onChange={(v) => setDiffTargets((s) => ({ ...s, [code]: v }))}
          />
          {ed.isDynamicAssess && selectedSkills.length > 0 && (
            <MinimumPerSkillPanel
              lang={lang} minCriteria={minCriteria} skillCount={selectedSkills.length} target={target}
            />
          )}
        </React.Fragment>
      );
    }

    if (ed.isDynamicAssess && isSkillField(f)) {
      return (
        <React.Fragment key={code}>
          {renderFrameworkPicker(disabled)}
          <MultiSelect
            label={skillCategoryLabel ?? label}
            placeholder={skillCategoryCode ? (placeholder || `Select ${skillCategoryLabel ?? label}`) : t(lang, 'DYNAMIC_ASSESS_SELECT_FRAMEWORK_FIRST')}
            required={required}
            disabled={disabled || !skillCategoryCode}
            values={multiVals[code] ?? []}
            options={skillCategoryCode ? cascadedOptions(categories, skillCategoryCode, selectedTaxo) : []}
            onChange={(vals) => setMulti(code, vals)}
          />
        </React.Fragment>
      );
    }

    if (taxoCodes.has(code)) {
      const options = cascadedOptions(categories, code, selectedTaxo);
      // Multi vs single is decided by the form definition, not the field name.
      if (isMultiField(f, ed.isDynamicAssess)) {
        return (
          <MultiSelect
            key={code}
            label={label}
            placeholder={placeholder || `Select ${label}`}
            required={required}
            disabled={disabled}
            values={multiVals[code] ?? []}
            options={options}
            onChange={(vals) => {
              setMulti(code, vals);
              resetDependents(code); // clear categories that depend on this one
            }}
          />
        );
      }
      return (
        <Select
          key={code}
          label={label}
          placeholder={placeholder || `Select ${label}`}
          required={required}
          disabled={disabled}
          value={values[code] ?? ''}
          options={options}
          onChange={(v) => {
            setVal(code, v);
            resetDependents(code);
          }}
        />
      );
    }

    if (f.inputType === 'textarea') {
      return (
        <div key={code} className="ce-field-full">
          <label className="ce-label-sm">{label}{required && <span className="ce-required-star">*</span>}</label>
          <textarea
            className="ce-textarea ce-textarea-sm"
            value={values[code] ?? ''}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => setVal(code, e.target.value)}
          />
        </div>
      );
    }

    // default: text / number / url → text input
    return (
      <div key={code} className="ce-field-full">
        <label className="ce-label-sm">{label}{required && <span className="ce-required-star">*</span>}</label>
        <input
          className="ce-input ce-input-sm"
          value={values[code] ?? ''}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setVal(code, e.target.value)}
        />
      </div>
    );
  };

  // Live label: tells the author when Save will also generate questions.
  // needsGeneration parses the ECML body, so it reruns only when skill, target, framework or content change, not on every keystroke in other fields.
  const saveGenerates = useMemo(
    () => ed.isDynamicAssess && open && needsGeneration(withSelection(buildOut()), content?.framework ?? ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ed.isDynamicAssess, open, content, fields, multiVals, diffTargets, selectedFw, skillCategoryCode, skillPickerCode],
  );

  // Skill always renders with the other fields (under its framework picker), even when a framework names a category 'skill'.
  const taxoFields = fields.filter((f) => taxoCodes.has(f.code) && !(ed.isDynamicAssess && isSkillField(f)) && !isReplacedBySkillPicker(f));
  const nonTaxoFields = fields.filter(
    (f) => (!taxoCodes.has(f.code) || (ed.isDynamicAssess && isSkillField(f))) && f.code !== 'appicon' && f.code !== 'appIcon',
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      titleIcon={<PencilIcon size={18} />}
      title={t(lang, 'EDIT_CONTENT_DETAILS')}
      closeLabel={t(lang, 'CLOSE')}
      footer={
        <>
          <button type="button" className="ce-btn ce-btn--ghost" onClick={onClose}>
            {t(lang, 'CANCEL')}
          </button>
          <button type="button" className="ce-btn ce-btn--primary" onClick={() => void onSave()} disabled={busy || checking || ed.dynamicAssessRefreshing}>
            {saving || checking
              ? <><span className="ce-spinner ce-spinner--xs" /> {t(lang, 'SAVING')}</>
              : <><CheckIcon size={13} /> {reviewSubmitMode ? t(lang, 'SAVE_AND_SUBMIT') : t(lang, saveGenerates ? 'SAVE_AND_GENERATE' : 'SAVE_CHANGES')}</>}
          </button>
        </>
      }
    >
      {reviewErrors.length > 0 && (
        <div className="ce-validation" style={{ marginBottom: 16 }}>
          <p className="ce-validation-title">{t(lang, 'REVIEW_VALIDATION')}</p>
          <ul>{reviewErrors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <div className="ce-meta-top">
        {hasAppIcon && (
          <div>
            <label className="ce-label-sm">
              {appIconLabel}
              {appIconField?.required && <span className="ce-required-star">*</span>}
            </label>
            <div className="ce-thumb" onClick={() => ed.openAssetPicker(setAppIcon)} role="button" tabIndex={0}>
              {appIcon ? (
                <img src={appIcon} alt="" />
              ) : (
                <>
                  <div className="ce-thumb-ic"><ImageIcon size={16} /></div>
                  <span className="ce-thumb-text">{appIconAddText}</span>
                </>
              )}
            </div>
            {appIcon && (
              <button type="button" className="ce-link-btn" onClick={() => ed.openAssetPicker(setAppIcon)}>
                {t(lang, 'CHANGE_IMAGE')}
              </button>
            )}
          </div>
        )}
        <div className="ce-meta-fields">
          {nonTaxoFields.map(renderField)}
        </div>
      </div>

      {!ed.isDynamicAssess && renderFrameworkPicker()}

      {taxoFields.length > 0 && (
        <div className="ce-taxo-grid">
          {taxoFields.map(renderField)}
        </div>
      )}

      {tagsSkills && (
        <SkillTagFields
          lang={lang}
          frameworks={skillFwOptions}
          frameworkId={skillFw}
          skills={fwSkills}
          skillField={skillField}
          values={skillCodes ?? []}
          onFrameworkChange={onSkillFrameworkChange}
          onSkillsChange={(codes) => { setSkillCodes(codes); setSkillDirty(true); }}
        />
      )}
    </Drawer>
  );
};

export default MetadataDrawer;
