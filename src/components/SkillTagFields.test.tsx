import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MetadataDrawer from './MetadataDrawer';
import { makeEd, mockContent, mockService } from '../test/mockEd';
import { clearSkillFrameworkCache } from '../skillTagging';

// Two skill frameworks whose skills live in different fields: lern reads the last category's code.
const FRAMEWORKS: Record<string, unknown[]> = {
  fw_agro: [
    { code: 'domain', index: 1, terms: [{ code: 'd1', name: 'Farming' }] },
    { code: 'cuisine', index: 2, terms: [{ code: 'c_soil', name: 'Soil testing' }, { code: 'c_seed', name: 'Seed selection' }] },
  ],
  fw_skill: [
    { code: 'skill', index: 1, terms: [{ code: 's_bake', name: 'Baking' }] },
  ],
};

const service = () => mockService({
  searchCompetencyFrameworks: vi.fn().mockResolvedValue([
    { identifier: 'fw_agro', name: 'Agro' },
    { identifier: 'fw_skill', name: 'Bakery' },
  ]),
  readCompetencyFramework: vi.fn().mockImplementation(async (id: string) => FRAMEWORKS[id] ?? []),
});

const save = () => fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

describe('skill tagging in <MetadataDrawer />', () => {
  beforeEach(() => clearSkillFrameworkCache());

  it('saves the skill framework and the picked skill codes under its own field', async () => {
    const saveMetadata = vi.fn();
    render(<MetadataDrawer ed={makeEd({ drawer: 'metadata', service: service(), saveMetadata })} />);
    const picker = await screen.findByLabelText('Skill framework');
    await screen.findByRole('option', { name: 'Agro' });
    fireEvent.change(picker, { target: { value: 'fw_agro' } });
    const skills = await screen.findByRole('button', { name: 'Select skills' });
    await waitFor(() => expect(skills).not.toBeDisabled());
    fireEvent.click(skills);
    fireEvent.click(screen.getByLabelText('Soil testing'));
    save();
    await waitFor(() => expect(saveMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ competencyFramework: 'fw_agro', cuisine: ['c_soil'] }),
    ));
    // Only the skill category's terms are skills.
    expect(saveMetadata.mock.calls[0][0]).not.toHaveProperty('domain');
  });

  it('shows saved skills by name and leaves them out of a save that did not touch them', async () => {
    const saveMetadata = vi.fn();
    const content = { ...mockContent, competencyFramework: 'fw_agro', cuisine: ['c_seed'] };
    render(<MetadataDrawer ed={makeEd({ drawer: 'metadata', service: service(), content, saveMetadata })} />);
    expect(await screen.findByRole('button', { name: 'Seed selection' })).toBeInTheDocument();
    save();
    await waitFor(() => expect(saveMetadata).toHaveBeenCalled());
    const out = saveMetadata.mock.calls[0][0];
    expect(out).not.toHaveProperty('competencyFramework');
    expect(out).not.toHaveProperty('cuisine');
  });

  it("clears the old framework's skills when the framework changes", async () => {
    const saveMetadata = vi.fn();
    const content = { ...mockContent, competencyFramework: 'fw_agro', cuisine: ['c_seed'] };
    render(<MetadataDrawer ed={makeEd({ drawer: 'metadata', service: service(), content, saveMetadata })} />);
    await screen.findByRole('button', { name: 'Seed selection' });
    fireEvent.change(screen.getByLabelText('Skill framework'), { target: { value: 'fw_skill' } });
    const skills = await screen.findByRole('button', { name: 'Select skills' });
    await waitFor(() => expect(skills).not.toBeDisabled());
    fireEvent.click(skills);
    fireEvent.click(screen.getByLabelText('Baking'));
    save();
    await waitFor(() => expect(saveMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ competencyFramework: 'fw_skill', skill: ['s_bake'], cuisine: [] }),
    ));
  });

  it('keeps a saved skill the framework no longer has (negative)', async () => {
    const content = { ...mockContent, competencyFramework: 'fw_agro', cuisine: ['c_gone'] };
    render(<MetadataDrawer ed={makeEd({ drawer: 'metadata', service: service(), content })} />);
    expect(await screen.findByRole('button', { name: 'c_gone' })).toBeInTheDocument();
  });

  it('is hidden when the channel has no skill frameworks (negative)', async () => {
    const svc = mockService();
    render(<MetadataDrawer ed={makeEd({ drawer: 'metadata', service: svc })} />);
    await waitFor(() => expect(svc.searchCompetencyFrameworks).toHaveBeenCalled());
    expect(screen.queryByTestId('skill-tag-fields')).toBeNull();
  });

  it('is not offered on Dynamic Assess content (negative)', async () => {
    const svc = service();
    render(<MetadataDrawer ed={makeEd({ drawer: 'metadata', service: svc, isDynamicAssess: true })} />);
    await screen.findByRole('heading', { name: 'Edit Content Details' });
    expect(svc.searchCompetencyFrameworks).not.toHaveBeenCalled();
    expect(screen.queryByTestId('skill-tag-fields')).toBeNull();
  });
});
