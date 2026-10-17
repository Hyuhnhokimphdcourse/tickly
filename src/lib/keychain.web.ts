// Web (development only): browser storage instead of the iOS Keychain.
const K = 'tickly.anthropic_api_key';
export async function getApiKey(): Promise<string | null> {
  try { return localStorage.getItem(K); } catch { return null; }
}
export async function setApiKey(v: string): Promise<void> {
  try { if (v) localStorage.setItem(K, v); else localStorage.removeItem(K); } catch { /* ignore */ }
}
