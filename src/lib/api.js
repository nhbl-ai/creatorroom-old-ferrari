let configuration;
let service;
let initialisation;

export async function initialiseAuth(config) {
  configuration = config;
  if (config.mode !== "tide") return;
  initialisation ??= (async () => {
    const { IAMService } = await import("@tidecloak/js");
    service = IAMService;
    let initError;
    service.on("initError", (_event, error) => {
      initError = error;
    });
    await service.initIAM({
      ...config.adapter,
      redirectUri: `${window.location.origin}/`,
      silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
      checkLoginIframe: false,
      responseMode: "query",
      useDPoP: { mode: "strict", alg: "ES256" },
    });
    if (initError)
      throw new Error(
        "TideCloak could not initialise. Check the server URL, client origin and realm enrollment.",
      );
  })();
  await initialisation;
  const returnTo = sessionStorage.getItem("creatorroom.returnTo");
  if (
    service.isLoggedIn() &&
    returnTo &&
    /^#\/(invite|project)\//.test(returnTo)
  ) {
    sessionStorage.removeItem("creatorroom.returnTo");
    window.location.hash = returnTo;
  }
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");
  const url = new URL(`/api${path}`, window.location.origin).href;
  const request = {
    ...options,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  };
  const response =
    configuration?.mode === "tide" && service?.isLoggedIn()
      ? await service.secureFetch(url, request)
      : await fetch(url, request);
  const result = await response
    .json()
    .catch(() => ({ error: "The server returned an unexpected response." }));
  if (!response.ok) {
    const error = new Error(result.error || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return result;
}

export function send(path, body, method = "POST") {
  return api(path, { method, body: JSON.stringify(body) });
}

export async function login() {
  if (!service) throw new Error("TideCloak is not configured.");
  if (/^#\/(invite|project)\//.test(window.location.hash))
    sessionStorage.setItem("creatorroom.returnTo", window.location.hash);
  return service.doLogin();
}

// Use the installed SDK registration route; never collect passwords in CreatorRoom.
export async function register() {
  if (!service) throw new Error("TideCloak is not configured.");
  if (/^#\/(invite|project)\//.test(window.location.hash))
    sessionStorage.setItem("creatorroom.returnTo", window.location.hash);
  return service.getTideCloakClient().register({
    redirectUri: `${window.location.origin}/`,
  });
}

export async function logout() {
  if (configuration?.mode === "tide") return service.doLogout();
  return send("/logout", {});
}

export function tideService() {
  if (!service?.isLoggedIn()) throw new Error("Sign in with TideCloak first.");
  return service;
}

export async function refreshSession() {
  if (configuration?.mode === "tide") await service.forceUpdateToken();
  return (await api("/me")).user;
}
