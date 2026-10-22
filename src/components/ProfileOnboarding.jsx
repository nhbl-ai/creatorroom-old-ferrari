// Optional CreatorRoom profile, linked to the authenticated subject by the API.
// Does not depend on Keycloak profile/email requirements,
// optional display name only, no invented email and no admin credentials.
import { useEffect, useState } from "react";
import { send } from "../lib/api.js";

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
  const dismissKey = `creatorroom.profile:${config.adapter?.realm || "demo"}:${user.id}`;
  useEffect(() => {
    setName(user.hasDisplayName ? user.name : "");
    if (
      forceOpen ||
      (config.mode === "tide" &&
        !user.hasDisplayName &&
        localStorage.getItem(dismissKey) !== "1")
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
      const { user: updated } = await send(
        "/profile",
        { displayName: name.trim() },
        "PATCH",
      );
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
