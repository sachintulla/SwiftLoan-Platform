import { describe, expect, it } from 'vitest';
import {
  buildDigitapRequest, chooseName, digitapConfig, incomeRangeMax, mapDigitapResponse, parseTestNames,
  rawForStorage, toEmployment, toIsoDate,
} from './digitap.js';

const UAT = { DIGITAP_BASE_URL: 'https://svcdemo.digitap.work', DIGITAP_CLIENT_ID: 'id', DIGITAP_CLIENT_SECRET: 'secret' };
const PROD = { ...UAT, DIGITAP_BASE_URL: 'https://svc.digitap.ai' };

// The success sample from Digitap's API doc (v1.4), trimmed.
const SAMPLE = {
  http_response_code: 200, client_ref_num: 'test_1', request_id: 'req-1', result_code: 101, message: 'success',
  result: {
    name: 'JOHN DOE', dob: '19-09-2001', age: '23', gender: 'Male', pan: 'CXXPD1234H', email: 'John.Doe@gmail.com',
    official_documents: [{ document: 'PAN', document_id: 'CXXPD1234H' }, { document: 'Voter_ID', document_id: 'XXXXXX8398' }],
    alternate_emails: ['john.doe@gmail.com'],
    alternate_mobile_numbers: ['9649112345', '9836412345', '9513312345'],
    address: [
      { first_line_of_address: '7, DOE STREET', second_line_of_address: 'MARATHAHALLI', third_line_of_address: 'BANGALORE', city: null, state: 'KARNATAKA', postal_code: '560048', reported_date: '30-03-2023' },
      { first_line_of_address: '301, SUNRISE TOWER, AIROLI', second_line_of_address: 'NAVI MUMBAI', third_line_of_address: 'AIROLI NAVI MUMBAI MAHARASHTRA', city: null, state: 'MAHARASHTRA', postal_code: '400708', reported_date: '15-04-2025' },
    ],
    score: '800',
    additional_details: {
      employment_details: { income_range: '4,00,001 - 6,00,000', occupation: 'SALARIED' },
      alternate_emails: [{ email: 'john.doe@gmail.com', reported_date: '31-03-2026' }],
      alternate_mobile_numbers: [
        { mobile_number: '9649112345', reported_date: '30-06-2025' },
        { mobile_number: '9836412345', reported_date: '10-01-2024' },
      ],
    },
  },
};

describe('digitapConfig', () => {
  it('is off unless address, client ID and secret are all set', () => {
    expect(digitapConfig({})).toBeNull();
    expect(digitapConfig({ ...UAT, DIGITAP_CLIENT_SECRET: '' })).toBeNull();
    expect(digitapConfig(UAT)?.url).toBe('https://svcdemo.digitap.work/mobile_prefill/request');
  });
  it('accepts the full endpoint as the address and refuses plain http', () => {
    expect(digitapConfig({ ...UAT, DIGITAP_BASE_URL: 'https://svcdemo.digitap.work/mobile_prefill/request' })?.url).toBe('https://svcdemo.digitap.work/mobile_prefill/request');
    expect(digitapConfig({ ...UAT, DIGITAP_BASE_URL: 'http://svcdemo.digitap.work' })).toBeNull();
  });
  it('honours the test-names list on the UAT host only', () => {
    const names = { DIGITAP_TEST_NAMES: 'Asha Rao, Vikram Singh Rathore' };
    expect(digitapConfig({ ...UAT, ...names })?.testNames).toHaveLength(2);
    expect(digitapConfig({ ...PROD, ...names })?.testNames).toEqual([]);
    expect(digitapConfig({ ...UAT, DIGITAP_BASE_URL: 'https://svcdemo.digitap.work.evil.io', ...names })?.testNames).toEqual([]);
  });
});

describe('names', () => {
  it('parses "First Last" pairs and drops anything else', () => {
    expect(parseTestNames('Asha Rao,  Vikram Singh Rathore ;Solo, 123 Bad,')).toEqual([
      { first: 'Asha', last: 'Rao' }, { first: 'Vikram', last: 'Singh Rathore' },
    ]);
  });
  const uat = digitapConfig({ ...UAT, DIGITAP_TEST_NAMES: 'Asha Rao,Vikram Singh' })!;
  const prod = digitapConfig({ ...PROD, DIGITAP_TEST_NAMES: 'Asha Rao,Vikram Singh' })!;
  it("sends the person's own name when we have one", () => {
    expect(chooseName(uat, { firstName: 'Ravi', lastName: 'Sharma' })).toEqual({ first: 'Ravi', last: 'Sharma', source: 'profile' });
    expect(chooseName(prod, { fullName: 'Ravi Kumar Sharma' })).toEqual({ first: 'Ravi', last: 'Kumar Sharma', source: 'profile' });
  });
  it('on UAT with no name on record, picks a random test name', () => {
    expect(chooseName(uat, {}, () => 0)).toEqual({ first: 'Asha', last: 'Rao', source: 'test_list' });
    expect(chooseName(uat, {}, () => 0.99)).toEqual({ first: 'Vikram', last: 'Singh', source: 'test_list' });
  });
  it('outside UAT with no name on record, sends none (name lookup)', () => {
    expect(chooseName(prod, {})).toBeNull();
    expect(chooseName(prod, { firstName: 'Ravi' })).toBeNull();
  });
});

describe('buildDigitapRequest', () => {
  it('sends a name with name_lookup 0, and no name with name_lookup 1', () => {
    const withName = buildDigitapRequest({ phone: '+91 98765 43210', name: { first: 'Asha', last: 'Rao', source: 'test_list' }, nameFallback: 0, withOptions: true });
    expect(withName).toMatchObject({ mobile_no: '9876543210', name_lookup: 0, first_name: 'Asha', last_name: 'Rao', name_fallback: 0, options: ['alternate_mobile_numbers', 'additional_details'] });
    const lookup = buildDigitapRequest({ phone: '9876543210', name: null, nameFallback: 1, withOptions: false });
    expect(lookup.name_lookup).toBe(1);
    expect(lookup).not.toHaveProperty('first_name');
    expect(lookup).not.toHaveProperty('name_fallback');
    expect(lookup).not.toHaveProperty('options');
  });
  it('makes a client_ref_num Digitap accepts (max 45, [a-zA-Z0-9_-]) and never asks for documents', () => {
    const b = buildDigitapRequest({ phone: '9876543210', name: null, nameFallback: 0, withOptions: true });
    expect(b.client_ref_num).toMatch(/^[a-zA-Z0-9_-]{1,45}$/);
    expect(b.options).not.toContain('official_documents');
    expect(b.options).not.toContain('alternate_emails');
  });
});

describe('small mappers', () => {
  it('reads dates', () => {
    expect(toIsoDate('19-09-2001')).toBe('2001-09-19');
    expect(toIsoDate('19/09/2001')).toBe('2001-09-19');
    expect(toIsoDate('2001-09-19')).toBe('2001-09-19');
    expect(toIsoDate('31-02-2001')).toBeUndefined();
    expect(toIsoDate('soon')).toBeUndefined();
  });
  it('takes the highest number of an income range', () => {
    expect(incomeRangeMax('4,00,001 - 6,00,000')).toBe(600000);
    expect(incomeRangeMax('Above 10,00,000')).toBe(1000000);
    expect(incomeRangeMax('25000-50000')).toBe(50000);
    expect(incomeRangeMax('NA')).toBeUndefined();
    expect(incomeRangeMax(null)).toBeUndefined();
  });
  it('maps the occupation onto our employment types', () => {
    expect(toEmployment('SALARIED')).toBe('salaried');
    expect(toEmployment('Self Employed')).toBe('self_employed');
    expect(toEmployment('SELF-EMPLOYED PROFESSIONAL')).toBe('self_employed');
    expect(toEmployment('Business')).toBe('business_owner');
    expect(toEmployment('OTHERS')).toBeUndefined();
  });
});

describe('mapDigitapResponse', () => {
  it('maps the documented success answer', () => {
    const out = mapDigitapResponse(200, SAMPLE, '9000000000');
    expect(out.status).toBe('found');
    if (out.status !== 'found') return;
    expect(out.requestId).toBe('req-1');
    expect(out.details).toEqual({
      pan: 'CXXPD1234H', fullName: 'JOHN DOE', firstName: 'JOHN', lastName: 'DOE', dob: '2001-09-19', age: 23, gender: 'male',
      email: 'john.doe@gmail.com',
      addressLine1: '301, SUNRISE TOWER, AIROLI', addressLine2: 'NAVI MUMBAI, AIROLI NAVI MUMBAI MAHARASHTRA', state: 'MAHARASHTRA', pincode: '400708',
      alternateMobile: '9649112345', occupation: 'SALARIED', employment: 'salaried',
      incomeRange: '4,00,001 - 6,00,000', incomeMax: 600000, creditScore: 800,
    });
  });
  it('never offers the login number as the alternate number', () => {
    const out = mapDigitapResponse(200, SAMPLE, '+919649112345');
    expect(out.status === 'found' && out.details.alternateMobile).toBe('9836412345');
  });
  it('works without the optional extras', () => {
    const { additional_details: _a, alternate_mobile_numbers: _m, ...result } = SAMPLE.result;
    const out = mapDigitapResponse(200, { ...SAMPLE, result });
    expect(out.status === 'found' && out.details.pan).toBe('CXXPD1234H');
    expect(out.status === 'found' && out.details).not.toHaveProperty('incomeMax');
    expect(out.status === 'found' && out.details).not.toHaveProperty('alternateMobile');
  });
  it('drops a malformed PAN and a non-score', () => {
    const out = mapDigitapResponse(200, { ...SAMPLE, result: { ...SAMPLE.result, pan: 'ABC', score: '-1' } });
    expect(out.status === 'found' && out.details).not.toHaveProperty('pan');
    expect(out.status === 'found' && out.details).not.toHaveProperty('creditScore');
  });
  it('reads "no record" and "name not found" as not found (not billed)', () => {
    expect(mapDigitapResponse(200, { result_code: 102, message: 'no record found', result: null, request_id: 'r' })).toEqual({ status: 'not_found', requestId: 'r', reason: 'no_record' });
    expect(mapDigitapResponse(200, { result_code: 103, message: 'name not found', result: null })).toMatchObject({ status: 'not_found', reason: 'name_not_found' });
  });
  it('never retries a 503 source error, may retry a timeout, and spots "option not enabled"', () => {
    expect(mapDigitapResponse(503, { message: 'source error' })).toMatchObject({ status: 'error', retryable: false });
    expect(mapDigitapResponse(0, null)).toMatchObject({ status: 'error', retryable: true });
    expect(mapDigitapResponse(500, { message: 'internal server error' })).toMatchObject({ status: 'error', retryable: true });
    expect(mapDigitapResponse(401, { message: 'client authentication failed' })).toMatchObject({ status: 'error', retryable: false, optionsNotEnabled: false });
    expect(mapDigitapResponse(403, { message: 'The following service(s) are not enabled for this client: alternate_mobile_numbers' })).toMatchObject({ status: 'error', optionsNotEnabled: true });
  });
  it('survives garbage', () => {
    expect(mapDigitapResponse(200, 'oops').status).toBe('error');
    expect(mapDigitapResponse(200, { result_code: 101, result: {} }).status).toBe('not_found');
  });
});

describe('rawForStorage', () => {
  it('keeps the answer but drops other identity documents and alternate emails', () => {
    const kept = rawForStorage(SAMPLE) as any;
    expect(kept.result).not.toHaveProperty('official_documents');
    expect(kept.result).not.toHaveProperty('alternate_emails');
    expect(kept.result.additional_details).not.toHaveProperty('alternate_emails');
    expect(kept.result.pan).toBe('CXXPD1234H');
    expect(kept.result.additional_details.employment_details.income_range).toBe('4,00,001 - 6,00,000');
    expect(SAMPLE.result.official_documents).toHaveLength(2); // the input is not mutated
  });
});
