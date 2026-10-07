import axios from "axios";

/**
 * Shared axios client for the whole app.
 *
 * Laravel's session auth needs the request's cookies (`withCredentials`) and,
 * for state-changing requests, the `X-XSRF-TOKEN` header echoed back from the
 * `XSRF-TOKEN` cookie it sets — axios does this automatically via
 * `xsrfCookieName`/`xsrfHeaderName`, which is exactly what most views in this
 * app were doing by hand (reading `document.cookie` and setting the header
 * themselves). Using this instance removes that boilerplate.
 */
const api = axios.create({
  baseURL: "/",
  withCredentials: true,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  headers: {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  },
});

// Session expired / CSRF mismatch -> bounce back to the login screen, same
// behavior every view previously duplicated inside its own fetch() calls.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    // Background, best-effort requests (e.g. the content-translations preload) opt out so a 401
    // can never wipe the session or redirect the page.
    if ((status === 401 || status === 419) && !(error?.config as any)?.skipAuthRedirect) {
      try {
        localStorage.removeItem("user");
        localStorage.removeItem("isAuthenticated");
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("isAuthenticated");
      } catch {
        // ignore storage errors (e.g. private mode)
      }
      if (typeof window !== "undefined" && window.location.pathname !== "/") {
        window.location.href = "/";
      }
    }
    return Promise.reject(error);
  }
);

export default api;

/** Small helper so callers don't need to reach into axios error internals. */
export function apiErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.message || anyErr?.message || fallback;
}
