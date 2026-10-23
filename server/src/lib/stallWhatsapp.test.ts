import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cfgs: Record<string, any> = {
  voxvalley: {
    enabled: true,
    settings: {
      baseUrl: 'https://cpaas.example.test/',
      sendPath: '/api/v1/whatsapp/send',
      projectId: 'PRJ123',
      sender: '+91 98765 43210',
      defaultLanguage: 'en',
      messageCategory: 'UTILITY',
    },
    secrets: { authToken: 'tok_test' },
  },
  meta_whatsapp: {
    enabled: false,
    settings: { baseUrl: 'https://graph.example.test', apiVersion: 'v21.0', phoneNumberId: '555', defaultLanguage: 'en' },
    secrets: { accessToken: 'meta_tok' },
  },
};

vi.mock('./integrations.js', () => ({
  DEFAULT_SETTINGS: { voxvalley: { stallTemplates: {} } },
  getProviderConfig: vi.fn(async (provider: string) => cfgs[provider]),
}));

import { interpolate, buildPlaceholders, templateFor } from './stallWhatsapp.js';
import { sendWhatsAppTemplate, sendWhatsAppText } from './whatsapp.js';

describe('stall template helpers', () => {
  it('fills tokens and refuses to send a blank', () => {
    expect(interpolate('{siteUrl}/apply/offers', { siteUrl: 'https://x.test' })).toBe('https://x.test/apply/offers');
    expect(interpolate('Ref {ref}', { ref: undefined })).toBeNull();
    expect(interpolate('Ref {ref}', { ref: '  ' })).toBeNull();
    expect(interpolate('no tokens', {})).toBe('no tokens');
  });

  it('builds ordered placeholders, or null if any is unfillable', () => {
    const vars = { name: 'Rahul', offerCount: 3, ref: 'SL-1' };
    expect(buildPlaceholders(['{name}', '{offerCount}', '{ref}'], vars)).toEqual(['Rahul', '3', 'SL-1']);
    expect(buildPlaceholders(['{name}', '{ref}'], { name: 'Rahul' })).toBeNull();
    expect(buildPlaceholders(undefined, vars)).toEqual([]);
  });

  it('looks up the template by the stage the customer is stuck at', () => {
    const map = { kyc_started: { template: 'document_request' }, blank: { template: ' ' } };
    expect(templateFor(map, 'kyc_started')?.template).toBe('document_request');
    expect(templateFor(map, 'blank')).toBeNull();
    expect(templateFor(map, 'otp_requested')).toBeNull();
    expect(templateFor(undefined, 'kyc_started')).toBeNull();
  });
});

describe('Voxvalley sender', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
  afterEach(() => vi.unstubAllGlobals());

  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('posts a template with Bearer auth, projectid and body parameters', async () => {
    fetchMock.mockResolvedValue(ok({ status: 'Success', code: 200, gtrid: 'G1', id: 'WCA1', message: 'queued' }));
    const r = await sendWhatsAppTemplate({
      phone: '9812345678', templateName: 'offers_ready', placeholders: ['Rahul', '3'], referenceId: 'ref-1',
    });
    expect(r).toMatchObject({ ok: true, messageId: 'WCA1', providerStatus: 'Success' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://cpaas.example.test/api/v1/whatsapp/send');
    expect(init.headers.Authorization).toBe('Bearer tok_test');
    expect(JSON.parse(init.body)).toEqual({
      projectid: 'PRJ123',
      from: '919876543210',
      to: '+919812345678',
      messageCategory: 'UTILITY',
      referenceId: 'ref-1',
      type: 'template',
      template: {
        name: 'offers_ready',
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Rahul' }, { type: 'text', text: '3' }] }],
      },
    });
  });

  it('reads the message id from a Meta-style response too', async () => {
    fetchMock.mockResolvedValue(ok({ messaging_product: 'whatsapp', contacts: [{ wa_id: '+919812345678' }], messages: [{ id: 'wamid.X1' }] }));
    expect(await sendWhatsAppTemplate({ phone: '9812345678', templateName: 't' }))
      .toMatchObject({ ok: true, messageId: 'wamid.X1' });
  });

  it('omits components for a template with no variables', async () => {
    fetchMock.mockResolvedValue(ok({ status: 'Success', id: 'X' }));
    await sendWhatsAppTemplate({ phone: '9812345678', templateName: 'plain' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).template.components).toBeUndefined();
  });

  it('treats HTTP 400 and a FAILED status as failures with the provider message', async () => {
    fetchMock.mockResolvedValueOnce(ok({ status: 'FAILED', message: 'Invalid parameters' }, 400));
    expect(await sendWhatsAppTemplate({ phone: '9812345678', templateName: 't' }))
      .toMatchObject({ ok: false, status: 400, error: 'Invalid parameters' });

    fetchMock.mockResolvedValueOnce(ok({ status: 'FAILED', message: 'Template not approved' }, 200));
    expect(await sendWhatsAppTemplate({ phone: '9812345678', templateName: 't' }))
      .toMatchObject({ ok: false, error: 'Template not approved' });
  });

  it('reports a network failure instead of throwing', async () => {
    fetchMock.mockRejectedValue(new Error('SELF_SIGNED_CERT_IN_CHAIN'));
    expect(await sendWhatsAppText({ phone: '9812345678', text: 'hi' }))
      .toMatchObject({ ok: false, status: 0, error: 'SELF_SIGNED_CERT_IN_CHAIN' });
  });

  it('requires a template name when none is configured', async () => {
    expect(await sendWhatsAppTemplate({ phone: '9812345678' }))
      .toMatchObject({ ok: false, error: 'No WhatsApp template name configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Meta Cloud API backend', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    cfgs.meta_whatsapp.enabled = true;
  });
  afterEach(() => { cfgs.meta_whatsapp.enabled = false; vi.unstubAllGlobals(); });

  it('sends the template straight to Graph API with the phone number id', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      messaging_product: 'whatsapp', contacts: [{ wa_id: '919812345678' }], messages: [{ id: 'wamid.ABC' }],
    }), { status: 200 }));
    const r = await sendWhatsAppTemplate({ phone: '9812345678', templateName: 'offers_ready', placeholders: ['Rahul'], referenceId: 'ref-9' });
    expect(r).toMatchObject({ ok: true, messageId: 'wamid.ABC' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.example.test/v21.0/555/messages');
    expect(init.headers.Authorization).toBe('Bearer meta_tok');
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '919812345678',
      biz_opaque_callback_data: 'ref-9',
      type: 'template',
      template: {
        name: 'offers_ready',
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Rahul' }] }],
      },
    });
  });

  it("surfaces Meta's error message", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token.', code: 190 } }), { status: 401 }));
    expect(await sendWhatsAppTemplate({ phone: '9812345678', templateName: 't' }))
      .toMatchObject({ ok: false, status: 401, error: 'Invalid OAuth access token.' });
  });

  it('reports what is missing instead of calling Meta', async () => {
    cfgs.meta_whatsapp.settings.phoneNumberId = '';
    expect(await sendWhatsAppTemplate({ phone: '9812345678', templateName: 't' }))
      .toMatchObject({ ok: false, error: 'Meta WhatsApp phoneNumberId is not configured' });
    cfgs.meta_whatsapp.settings.phoneNumberId = '555';
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
