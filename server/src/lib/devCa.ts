import { existsSync, readFileSync } from 'node:fs';
import tls from 'node:tls';

/**
 * Local-dev only: make outbound `fetch` trust the extra CA in NODE_EXTRA_CA_CERTS.
 *
 * Behind a TLS-inspecting proxy (e.g. Sophos) every partner call (Aurix, Yubi,
 * Revasure) fails with SELF_SIGNED_CERT_IN_CHAIN unless Node trusts the proxy's CA.
 * Node only honours NODE_EXTRA_CA_CERTS when it is in the environment at process
 * START — a value loaded later from `.env` by dotenv is silently ignored, so
 * `npm start` from a plain shell broke while a launcher that exported it worked.
 * This installs a global fetch dispatcher with that CA added, so it works however
 * the server is started. A no-op in production, or when the variable/file is absent.
 */
export async function trustExtraCaForFetch(): Promise<boolean> {
  if (process.env.NODE_ENV === 'production') return false;
  const path = process.env.NODE_EXTRA_CA_CERTS;
  if (!path || !existsSync(path)) return false;
  try {
    const { Agent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new Agent({ connect: { ca: [...tls.rootCertificates, readFileSync(path, 'utf8')] } }));
    return true;
  } catch (e) {
    console.warn('[dev-ca] could not install the extra CA for fetch:', (e as Error)?.message);
    return false;
  }
}
