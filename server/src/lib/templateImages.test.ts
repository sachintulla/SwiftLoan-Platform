import { describe, it, expect } from 'vitest';
import { DEFAULT_TEMPLATE_IMAGES, headerImageFor, isImageUrl } from './templateImages.js';

describe('headerImageFor', () => {
  it('every shipped image is a public https address', () => {
    for (const url of Object.values(DEFAULT_TEMPLATE_IMAGES)) expect(isImageUrl(url)).toBe(true);
  });

  it('the image templates approved on 6 Nov 2026 all have one', () => {
    for (const name of ['no_offers_call', 'continue_application_link', 'continue_application_app', 'offers_ready_view_link', 'offers_ready_open_app', 'welcome_continue_app', 'no_offers_missed_call']) {
      expect(headerImageFor(name, undefined)).toMatch(/^https:\/\/swiftloan\.ai\/whatsapp-/);
    }
  });

  it('a text-only template gets no image', () => {
    expect(headerImageFor('dropoff_pending_step_app', undefined)).toBe('');
    expect(headerImageFor('dropoff_pending_step_app', {})).toBe('');
  });

  it("the address saved in Admin → Templates wins over the shipped one, and works for a template the code doesn't know", () => {
    const lib = {
      no_offers_call: { name: 'no_offers_call', headerImageUrl: 'https://cdn.example.com/new.png' },
      brand_new_image_template: { name: 'brand_new_image_template', headerImageUrl: ' https://cdn.example.com/b.jpg ' },
    };
    expect(headerImageFor('no_offers_call', lib)).toBe('https://cdn.example.com/new.png');
    expect(headerImageFor('brand_new_image_template', lib)).toBe('https://cdn.example.com/b.jpg');
  });

  it('a blank or unusable saved address falls back to the shipped image', () => {
    expect(headerImageFor('no_offers_call', { no_offers_call: { headerImageUrl: '' } })).toBe(DEFAULT_TEMPLATE_IMAGES.no_offers_call);
    expect(headerImageFor('no_offers_call', { no_offers_call: { headerImageUrl: 'http://insecure.example.com/a.png' } })).toBe(DEFAULT_TEMPLATE_IMAGES.no_offers_call);
    expect(headerImageFor('no_offers_call', { no_offers_call: 'not an object' })).toBe(DEFAULT_TEMPLATE_IMAGES.no_offers_call);
  });

  it('isImageUrl accepts https only', () => {
    expect(isImageUrl('https://a.b/c.png')).toBe(true);
    expect(isImageUrl('http://a.b/c.png')).toBe(false);
    expect(isImageUrl('not a url')).toBe(false);
    expect(isImageUrl('')).toBe(false);
  });
});
