/** Skill tagging: a content names a skill (competency) framework and carries that framework's skills, as lern reads them. */
import { useEffect, useState } from 'react';
import type { ContentEditorService } from './services/ContentEditorService';
import { competencyLeafSkills, competencySkillField, type CompetencySkill } from './competencyLeaves';

/** The metadata field a content names its skill framework in. */
export const SKILL_FRAMEWORK_FIELD = 'competencyFramework';

export interface SkillFramework {
  skills: CompetencySkill[];
  /** The field the skills are saved in: the framework's last category's code (`skill`, `cuisine`, ...). */
  skillField: string | undefined;
}

const cache = new Map<string, Promise<SkillFramework>>();

/** One skill framework's skills and skill field; cached, and a failed read is dropped so the next call retries. */
export function loadSkillFramework(service: ContentEditorService, frameworkId: string): Promise<SkillFramework> {
  let entry = cache.get(frameworkId);
  if (!entry) {
    entry = service.readCompetencyFramework(frameworkId).then((categories) => ({
      skills: competencyLeafSkills(categories),
      skillField: competencySkillField(categories),
    }));
    entry.catch(() => cache.delete(frameworkId));
    cache.set(frameworkId, entry);
  }
  return entry;
}

/** Test hook: forget cached frameworks. */
export function clearSkillFrameworkCache(): void {
  cache.clear();
}

const EMPTY: SkillFramework = { skills: [], skillField: undefined };

/** The skills of `frameworkId` (empty until it loads, or when none is chosen). */
export function useSkillFramework(service: ContentEditorService, frameworkId: string): SkillFramework {
  const [state, setState] = useState<{ id: string; fw: SkillFramework }>({ id: '', fw: EMPTY });
  useEffect(() => {
    if (!frameworkId) return;
    let live = true;
    loadSkillFramework(service, frameworkId)
      .then((fw) => { if (live) setState({ id: frameworkId, fw }); })
      .catch(() => { if (live) setState({ id: frameworkId, fw: EMPTY }); });
    return () => { live = false; };
  }, [service, frameworkId]);
  return frameworkId && state.id === frameworkId ? state.fw : EMPTY;
}

/** A stored value as a list of codes. */
export function asCodes(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return v != null && v !== '' ? [String(v)] : [];
}
