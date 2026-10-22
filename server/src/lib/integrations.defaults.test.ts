import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows = new Map<string, any>();

vi.mock('./prisma.js', () => ({
  prisma: {
    integrationConfig: {
      findUnique: vi.fn(async ({ where }: any) => rows.get(where.provider) ?? null),
    },
  },
}));

import { DEFAULT_SETTINGS, getProviderConfig } from './integrations.js';

describe('voxvalley install-reminder defaults', () => {
  beforeEach(() => rows.clear());

  it('ships the approved WhatsApp template and leaves SMS blank', () => {
    const d = DEFAULT_SETTINGS.voxvalley;
    expect(d.installWhatsapp).toEqual({
      template: 'install_app_resume_step',
      language: 'en',
      placeholders: ['{name}', '{step}', '{link}'],
    });
    expect(d.installSmsTemplateId).toBe('');
    expect(d.installSmsBody).toBe('');
    expect(d.installStepLabels).toEqual({});
  });

  it('applies the defaults when nothing was saved', async () => {
    const cfg = await getProviderConfig('voxvalley');
    expect(cfg.enabled).toBe(false);
    expect(cfg.settings.installWhatsapp.template).toBe('install_app_resume_step');
    expect(cfg.settings.installSmsTemplateId).toBe('');
  });

  it('applies the defaults to an environment that saved other settings', async () => {
    rows.set('voxvalley', { enabled: true, settings: { projectId: 'PRJ1' }, secrets: {} });
    const cfg = await getProviderConfig('voxvalley');
    expect(cfg.settings.projectId).toBe('PRJ1');
    expect(cfg.settings.installWhatsapp.template).toBe('install_app_resume_step');
  });

  it('lets saved values win over the defaults', async () => {
    rows.set('voxvalley', {
      enabled: true,
      settings: {
        installWhatsapp: { template: 'custom_tpl', language: 'hi', placeholders: ['{link}'] },
        installSmsTemplateId: 'T-123',
        installSmsBody: 'Open {link}',
        installStepLabels: { otp_only: 'sign-in' },
      },
      secrets: {},
    });
    const { settings } = await getProviderConfig('voxvalley');
    expect(settings.installWhatsapp).toEqual({ template: 'custom_tpl', language: 'hi', placeholders: ['{link}'] });
    expect(settings.installSmsTemplateId).toBe('T-123');
    expect(settings.installSmsBody).toBe('Open {link}');
    expect(settings.installStepLabels).toEqual({ otp_only: 'sign-in' });
  });

  it('keeps a saved blank WhatsApp template blank (admin opt-out)', async () => {
    rows.set('voxvalley', { enabled: true, settings: { installWhatsapp: { template: '' } }, secrets: {} });
    const { settings } = await getProviderConfig('voxvalley');
    expect(settings.installWhatsapp.template).toBe('');
  });
});
