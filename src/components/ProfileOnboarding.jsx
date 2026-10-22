// Adapted from Tide Agent Pack onboarding-modal: the user's own Account API,
// optional display name only, no invented email and no admin credentials.
import { useEffect, useState } from "react";
import { tideService, api } from "../lib/api.js";

export function ProfileOnboarding({
  config,
  user,
  forceOpen,
  onClose,
  onSaved,
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dismissKey = `creatorroom.profile:${config.adapter.realm}:${user.id}`;
  useEffect(() => {
    const service = tideService();
    const existing = service.getValueFromToken("given_name") || "";
    setName(existing === "Admin" ? "" : String(existing));
    const placeholder =
      existing === "Admin" &&
      service.getValueFromToken("family_name") === "User";
    if (
      forceOpen ||
      ((!existing || placeholder) && localStorage.getItem(dismissKey) !== "1")
    )
      setOpen(true);
  }, [dismissKey, forceOpen]);
  if (!open) return null;
  function close() {
    localStorage.setItem(dismissKey, "1");
    setOpen(false);
    onClose();
  }
  async function save(event) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const service = tideService();
      const base = config.adapter["auth-server-url"].replace(/\/+$/, "");
      const url = `${base}/realms/${encodeURIComponent(config.adapter.realm)}/account/`;
      const response = await service.secureFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: name.trim() }),
      });
      if (response.status === 202)
        throw new Error(
          "Your profile is pending approval; it has not been saved yet.",
        );
      if (!response.ok)
        throw new Error(
          `Could not save your display name (${response.status}).`,
        );
      await service.forceUpdateToken();
      const { user: updated } = await api("/me");
      onSaved(updated);
      close();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="profile-backdrop">
      <section
        className="profile-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
      >
        <h2 id="profile-title">Welcome to CreatorRoom</h2>
        <p>
          What should your collaborators call you? A display name is optional.
        </p>
        <form onSubmit={save}>
          <label htmlFor="display-name">Display name</label>
          <input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="nickname"
            autoFocus
          />
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="profile-actions">
            <button
              className="button"
              type="button"
              onClick={close}
              disabled={busy}
            >
              Not now
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={busy || !name.trim()}
            >
              {busy ? "Saving…" : "Save display name"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
