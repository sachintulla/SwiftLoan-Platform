/**
 * Local MOCK of the Aurix APIs, for testing the PAN-first flow end to end
 * without calling (or paying for) the real UAT. Never used in dev/prod.
 *
 *   npx tsx scripts/mock-aurix.ts            # listens on :4010
 *
 * Point the backend at it (see docs in the file footer / PR notes):
 *   AURIX_AUTH_BASE_URL=http://localhost:4010 AURIX_OFFERS_BASE_URL=http://localhost:4010
 *
 * pan_comprehensive scenario is chosen by the PAN entered:
 *   AAAPA1111A  success — full details (name, DOB, gender, address)
 *   AAAPB2222B  success — partial details (name only)
 *   AAAPC3333C  success envelope but PanStatus "Invalid"          → invalid
 *   AAAPD4444D  Meta.Success false, "No record found"             → invalid (cached 24h)
 *   AAAPE5555E  HTTP 500                                          → 502, not cached
 *   AAAPF6666F  hangs 25s (backend times out at 20s)              → 502, not cached
 *   AAAPG7777G  HTTP 401 token rejected                           → 502, not cached
 *   AAAPH8888H  success, but eligible_offers returns no offers
 *   anything else  success — generic details
 *
 * eligible_offers returns two offers (none for AAAPH8888H or when the
 * request's PanVerificationDTO.Verified is false) and logs the DTO it got,
 * so you can confirm the real verification result is being sent.
 */
import http from 'node:http';

const PORT = parseInt(process.env.MOCK_AURIX_PORT || '4010', 10);
const calls: Record<string, number> = {};

const meta = (success: boolean, message: string, code = success ? '200' : '400') => ({
  Timestamp: new Date().toISOString(), Success: success, StatusCode: code, CustomErrorCode: null, Message: message,
});

// Same structure as the live UAT response (values are made up).
function panOk(person: Record<string, unknown>, pan: string): Reply {
  return {
    status: 200,
    body: {
      Data: { PanNumber: pan, Data: person, Message: 'Success', Status: 1, Success: true, Error: false, ErrorResponse: null },
      Meta: meta(true, 'PAN details fetched successfully.'),
    },
  };
}
const PERSON = {
  AadhaarLinked: true, Category: 'person', DateOfBirth: '15-08-1990', DateOfBirthCheck: false, DateOfBirthVerified: false,
  EmailId: 'ravi.test@example.com', FullName: 'RAVI KUMAR SHARMA', FullNameSplit: ['RAVI', 'KUMAR', 'SHARMA'], Gender: 'M',
  MaskedAadhaar: '12XXXXXXXX34', PhoneNumber: '', LessInfo: true,
  FullAddress: '12-3-45 BANJARA HILLS ROAD NO 2 Hyderabad Telangana India 500034',
  AddressLine1: '12-3-45 BANJARA HILLS', AddressLine2: 'ROAD NO 2', StreetName: 'ROAD NO 2',
  State: 'Telangana', City: 'Hyderabad', Country: 'India', PinCode: '500034',
};

type Reply = { status: number; body: unknown; delayMs?: number };

function panScenario(pan: string): Reply {
  switch (pan) {
    case 'AAAPA1111A': return panOk(PERSON, pan);
    case 'AAAPB2222B': return panOk({ AadhaarLinked: false, Category: 'person', FullName: 'PRIYA REDDY', FullNameSplit: ['PRIYA', 'REDDY'], EmailId: '', LessInfo: true }, pan);
    case 'AAAPC3333C': return panOk({ Category: 'person', PanStatus: 'Invalid', FullName: '' }, pan);
    case 'AAAPD4444D': return { status: 200, body: { Data: { PanNumber: pan, Data: null, Message: 'No record found for the given PAN.', Status: 0, Success: false, Error: true, ErrorResponse: null }, Meta: meta(false, 'No record found for the given PAN.', '404') } };
    case 'AAAPE5555E': return { status: 500, body: { Meta: meta(false, 'Internal server error', '500') } };
    case 'AAAPF6666F': return { status: 200, body: { Meta: meta(true, 'late') }, delayMs: 25_000 };
    case 'AAAPG7777G': return { status: 401, body: { Meta: meta(false, 'Invalid token', '401') } };
    default: return panOk({ ...PERSON, EmailId: '', FullName: 'TEST USER', FullNameSplit: ['TEST', 'USER'] }, pan);
  }
}

function offers(amount: number) {
  const mk = (code: string, lender: string, roi: number, tenure: number) => ({
    OfferCode: code, OfferType: 'PL', LoanAmount: amount, ROI: roi, Tenure: tenure, EMI: 0, ProcessingFee: 2,
    OfferLikelihood: '1', OfferRedirectionUrl: `https://example.com/mock-lender/${code}`,
    Lender: { Id: code, DisplayName: lender, LenderLogo: null },
  });
  return [mk('MOCK-A', 'Mock Lender Alpha', 14.5, 24), mk('MOCK-B', 'Mock Lender Beta', 16, 36)];
}

function route(path: string, body: any): Reply {
  if (path === '/api/generate_token') {
    return { status: 200, body: { Data: { Token: `mock-token-${Date.now()}`, TokenValidTill: new Date(Date.now() + 30 * 86400_000).toISOString() }, Meta: meta(true, 'Audience secret code verified successfully.') } };
  }
  if (path === '/api/pan_comprehensive') {
    const pan = String(body?.PanNumber ?? '').toUpperCase();
    calls[pan] = (calls[pan] ?? 0) + 1;
    console.log(`[mock-aurix] pan_comprehensive PAN=${pan} PartnerCustomerId=${body?.PartnerCustomerId}  (call #${calls[pan]} for this PAN — should stay 1 when cached)`);
    return panScenario(pan);
  }
  if (path === '/api/eligible_offers') {
    const dto = body?.PanVerificationDTO;
    console.log('[mock-aurix] eligible_offers PanVerificationDTO =', JSON.stringify(dto));
    if (dto?.PanNumber === 'AAAPH8888H' || dto?.Verified === false) {
      return { status: 200, body: { Result: { Meta: meta(false, 'No data found'), Data: { Offers: [] } } } };
    }
    return { status: 200, body: { Result: { Meta: meta(true, 'Offers fetched'), Data: { Offers: offers(body?.ProductDetails?.RequestedAmount ?? 300000) } } } };
  }
  if (path === '/api/utm_generation') return { status: 200, body: { Meta: meta(true, 'ok') } };
  return { status: 404, body: { Meta: meta(false, `mock-aurix: no handler for ${path}`, '404') } };
}

http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    let body: any = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
    const path = (req.url || '').split('?')[0]!;
    const reply = route(path, body);
    setTimeout(() => {
      if (res.writableEnded || res.destroyed) return; // client gave up (timeout scenario)
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply.body));
    }, reply.delayMs ?? 150);
  });
}).listen(PORT, () => {
  console.log(`[mock-aurix] listening on http://localhost:${PORT} — test PANs: AAAPA1111A (full) AAAPB2222B (partial) AAAPC3333C (invalid status) AAAPD4444D (not found) AAAPE5555E (500) AAAPF6666F (timeout) AAAPG7777G (401) AAAPH8888H (no offers)`);
});
