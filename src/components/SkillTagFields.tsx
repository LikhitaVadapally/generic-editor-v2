import React from 'react';
import MultiSelect from './MultiSelect';
import { ChevronDown } from '../icons';
import { t } from '../i18n/i18n';
import type { CompetencySkill } from '../competencyLeaves';

/**
 * "Skill framework" + "Skills": tags a content with a skill (competency) framework's skills. The
 * skills are saved as codes under that framework's own field (its last category's code), as lern
 * reads them.
 */
const SkillTagFields: React.FC<{
  lang: string;
  frameworks: Array<{ identifier: string; name: string }>;
  frameworkId: string;
  skills: CompetencySkill[];
  /** The framework's skill field; undefined until the framework loads. */
  skillField: string | undefined;
  values: string[];
  onFrameworkChange: (frameworkId: string) => void;
  onSkillsChange: (codes: string[]) => void;
}> = ({ lang, frameworks, frameworkId, skills, skillField, values, onFrameworkChange, onSkillsChange }) => {
  if (!frameworks.length && !frameworkId) return null;
  // The saved framework stays selectable even if it is no longer Live.
  const fwList = frameworkId && !frameworks.some((f) => f.identifier === frameworkId)
    ? [{ identifier: frameworkId, name: frameworkId }, ...frameworks]
    : frameworks;
  // A saved skill the framework no longer has stays visible, so it isn't dropped silently.
  const options = [
    ...skills.map((s) => ({ code: s.code, name: s.name })),
    ...values.filter((c) => !skills.some((s) => s.code === c)).map((c) => ({ code: c, name: c })),
  ];
  return (
    <div className="ce-taxo-grid" data-testid="skill-tag-fields">
      <div>
        <label className="ce-label-sm" htmlFor="ce-skill-framework-picker">{t(lang, 'SKILL_FRAMEWORK')}</label>
        <div className="ce-select-wrap" style={{ maxWidth: 'none' }}>
          <select
            id="ce-skill-framework-picker"
            className="ce-select ce-select-sm"
            value={frameworkId}
            onChange={(e) => onFrameworkChange(e.target.value)}
          >
            <option value="" disabled={!!frameworkId}>{t(lang, 'SELECT_SKILL_FRAMEWORK')}</option>
            {fwList.map((f) => <option key={f.identifier} value={f.identifier}>{f.name}</option>)}
          </select>
          <span className="ce-select-chevron"><ChevronDown size={12} /></span>
        </div>
      </div>
      <MultiSelect
        lang={lang}
        label={t(lang, 'SKILLS')}
        placeholder={frameworkId ? t(lang, 'SELECT_SKILLS') : t(lang, 'SELECT_SKILL_FRAMEWORK_FIRST')}
        disabled={!skillField}
        values={values}
        options={skillField ? options : []}
        valueKey="code"
        onChange={onSkillsChange}
      />
    </div>
  );
};

export default SkillTagFields;
