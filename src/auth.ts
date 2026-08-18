/**
 * Discovery API key resolution.
 *
 * The pi plugin read a stored `/login` credential first, then fell back to
 * `CLIPROXYAPI_API_KEY`. Under OMP, extension-registered providers have no
 * `/login` credential store (no `oauth` block is registered), and stored
 * credentials never override extension model headers — the config `apiKey`
 * (env-var name) resolved live at request time is the working auth path.
 * Discovery uses the same env var, exactly pi's fallback. Interactive
 * refresh commands additionally prefer the session's resolved provider key
 * via `ctx.modelRegistry.getApiKeyForProvider(providerName)`.
 */
export async function getDiscoveryApiKey(providerName: string, env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  return env.CLIPROXYAPI_API_KEY;
}