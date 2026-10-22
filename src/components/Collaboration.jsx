import { useEffect, useState } from "react";
import { api, send } from "../lib/api.js";
import { navigate } from "../lib/routing.js";
import { prepareMemberEnrollment } from "../lib/enrollment.js";
import { signInvitation } from "../lib/tide.js";
import {
  adminRequest,
  approveGovernance,
  ensureCryptoRoles,
  configureSharedAccess,
} from "../lib/tide-admin.js";

const statusLabel = {
  open: "Link ready",
  claimed: "Confirm recipient",
  "pending-approval": "Waiting for approver",
  granted: "Access granted",
  cancelled: "Cancelled",
  expired: "Expired",
  pending: "Waiting for approver",
  approved: "Approved",
  rejected: "Rejected",
};
function Notice({ error }) {
  return error ? (
    <p className="error-message" role="alert">
      {error}
    </p>
  ) : null;
}

export function ProjectRoom({
  project,
  user,
  onUpload,
  onOpen,
  onEdit,
  onRefresh,
  busy,
}) {
  const own = project.ownerId === user.id;
  const [invitations, setInvitations] = useState([]);
  const [selected, setSelected] = useState([]);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState(false);
  async function load() {
    const data = await api("/invitations");
    setInvitations(data.invitations.filter((i) => i.projectId === project.id));
  }
  useEffect(() => {
    let active = true;
    const tick = () =>
      api("/invitations")
        .then((data) => {
          if (active)
            setInvitations(
              data.invitations.filter((i) => i.projectId === project.id),
            );
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    tick();
    const timer = setInterval(tick, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [project.id]);
  async function run(action) {
    setWorking(true);
    setError("");
    try {
      await action();
      await load();
      await onRefresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <section className="project-room">
      <button className="text-button" onClick={() => navigate("/projects")}>
        ← Back to projects
      </button>
      <div className="project-room-heading">
        <div>
          <span className="eyebrow">
            {own ? "YOUR PROJECT" : "REVIEW WORKSPACE"}
          </span>
          <h2>{project.title}</h2>
          <p>{project.description || "Make space for your next idea."}</p>
          <small>Created by {project.ownerName}</small>
        </div>
        {own && (
          <div className="project-room-actions">
            <button
              className="button secondary"
              onClick={() => setEditing(!editing)}
            >
              Edit project
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => onUpload()}
            >
              Upload draft
            </button>
          </div>
        )}
      </div>
      {editing && own && (
        <form
          className="project-edit"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            run(async () => {
              await onEdit({
                title: form.get("title"),
                description: form.get("description"),
                color: project.color,
              });
              setEditing(false);
            });
          }}
        >
          <label>
            Project name
            <input
              name="title"
              aria-label="Edit project name"
              defaultValue={project.title}
              required
              maxLength={80}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              defaultValue={project.description}
              maxLength={200}
            />
          </label>
          <button className="button primary" disabled={working}>
            Save project
          </button>
        </form>
      )}
      <Notice error={error} />
      <div className="draft-list">
        <h3>
          Drafts <span className="count-label">{project.assets.length}</span>
        </h3>
        {project.assets.length ? (
          project.assets.map((asset) => (
            <div className="project-draft" key={asset.id}>
              {own && asset.hasContent && (
                <input
                  type="checkbox"
                  aria-label={`Select ${asset.title} for invitation`}
                  checked={selected.includes(asset.id)}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked
                        ? [...ids, asset.id]
                        : ids.filter((id) => id !== asset.id),
                    )
                  }
                />
              )}
              <button
                className="asset-row"
                aria-label={`Open ${asset.title}`}
                onClick={() => onOpen(asset)}
              >
                <span className="asset-icon">{asset.canRead ? "◇" : "⌑"}</span>
                <span>
                  <strong>{asset.title}</strong>
                  <small>
                    {asset.hasContent
                      ? asset.canRead
                        ? "Ready for your eyes"
                        : "Invitation required"
                      : asset.uploadStatus === "pending"
                        ? "Waiting for approver — file stays on your device"
                        : asset.uploadStatus === "ready"
                          ? "Approved — choose your file to finish uploading"
                          : "Upload unfinished — continue or discard"}
                  </small>
                </span>
                <span>→</span>
              </button>
              {own && !asset.hasContent && (
                <>
                  <button
                    className="button secondary"
                    disabled={working || busy}
                    onClick={() => onUpload(asset)}
                  >
                    Continue upload
                  </button>
                  <button
                    className="text-button"
                    disabled={working}
                    onClick={() =>
                      run(() => send(`/assets/${asset.id}`, {}, "DELETE"))
                    }
                  >
                    Discard
                  </button>
                </>
              )}
            </div>
          ))
        ) : (
          <div className="empty-state project-empty">
            <h3>Your first draft belongs here.</h3>
            <p>
              {own
                ? "Upload a design or text file. It is encrypted before leaving your browser."
                : "No drafts are available here yet."}
            </p>
            {own && (
              <button className="button primary" onClick={() => onUpload()}>
                Upload first draft
              </button>
            )}
          </div>
        )}
      </div>
      {own && (
        <section className="project-sharing">
          <h3>Invite a fresh pair of eyes</h3>
          <p>
            Select the finished drafts above and create a one-use link. Your
            reviewer signs in using their browser; no installation is needed.
            New drafts are not automatically shared.
          </p>
          <button
            className="button primary"
            disabled={!selected.length || working}
            onClick={() =>
              run(async () => {
                const result = await send(
                  `/projects/${project.id}/invitations`,
                  { assetIds: selected },
                );
                setLink(result.url);
              })
            }
          >
            Create invitation link
            {selected.length ? ` (${selected.length})` : ""}
          </button>
          {link && (
            <div className="invite-link-box">
              <label>
                Invitation link
                <input
                  aria-label="Invitation link"
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                  } catch {
                    setError("Select and copy the link above.");
                  }
                }}
              >
                Copy link
              </button>
              <small>
                Valid for 24 hours. Shown once; create a new link if you lose
                it.
              </small>
            </div>
          )}
          <div className="invitation-list">
            {invitations.map((i) => (
              <div className="invitation-row" key={i.id}>
                <div>
                  <strong>{i.recipientName || "Waiting for recipient"}</strong>
                  {i.recipientId && (
                    <small>Recipient account: {i.recipientId.slice(-8)}</small>
                  )}
                  <p>{i.titles.join(", ")}</p>
                  <small>
                    {statusLabel[i.status] || i.status} · link expires{" "}
                    {new Date(i.expiresAt).toLocaleString()}
                  </small>
                </div>
                {i.status === "claimed" && (
                  <button
                    className="button primary"
                    disabled={working}
                    onClick={() =>
                      run(() => send(`/invitations/${i.id}/confirm`, {}))
                    }
                  >
                    Confirm {i.recipientName}
                  </button>
                )}
                {i.status !== "cancelled" && (
                  <button
                    className="text-button"
                    disabled={working}
                    onClick={() =>
                      run(() => send(`/invitations/${i.id}`, {}, "DELETE"))
                    }
                  >
                    Cancel invitation
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

export function InvitationPage({
  token,
  user,
  onLogin,
  onRegister,
  config,
  onIdentity,
}) {
  const [invitation, setInvitation] = useState(null),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  useEffect(() => {
    let active = true;
    api(`/invitations/token/${encodeURIComponent(token)}`)
      .then((data) => {
        if (active) setInvitation(data.invitation);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const poll = () =>
      api("/invitations")
        .then((data) => {
          const row = data.invitations.find((i) => i.id === invitation?.id);
          if (active && row) setInvitation(row);
        })
        .catch(() => {});
    const timer = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user?.id, invitation?.id]);
  async function accept() {
    setWorking(true);
    setError("");
    try {
      const data = await send(
        `/invitations/token/${encodeURIComponent(token)}/accept`,
        {},
      );
      setInvitation(data.invitation);
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  const claimedByMe = invitation?.recipientId === user?.id;
  return (
    <main className="invitation-page">
      <div className="invitation-card">
        <span className="eyebrow">CREATORROOM · PRIVATE REVIEW</span>
        <h1>A fresh pair of eyes.</h1>
        <Notice error={error} />
        {invitation ? (
          <>
            <h2>{invitation.projectTitle}</h2>
            <p>
              {invitation.ownerName} invited you to review{" "}
              {invitation.titles.length} draft(s).
            </p>
            <ul>
              {invitation.titles.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            {!user ? (
              <>
                <p>
                  Sign in, or create an account and link Tide in your browser.
                  Nothing to install.
                </p>
                {config.mode === "demo" ? (
                  config.demoPeople
                    .filter((p) => p.role !== "operator")
                    .map((p) => (
                      <button
                        key={p.id}
                        className="button secondary"
                        onClick={() => onIdentity(p.id)}
                      >
                        Continue as {p.name}
                      </button>
                    ))
                ) : (
                  <div className="landing-auth-actions">
                    <button className="button primary" onClick={onLogin}>
                      Sign in
                    </button>
                    <button className="button secondary" onClick={onRegister}>
                      Create account
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                {invitation.status === "open" && (
                  <button
                    className="button primary"
                    disabled={working}
                    onClick={accept}
                  >
                    Accept invitation
                  </button>
                )}
                {invitation.status !== "open" && (
                  <p role="status">
                    {statusLabel[invitation.status] || invitation.status}
                    {claimedByMe && invitation.status === "claimed"
                      ? " — the owner will confirm your identity."
                      : ""}
                  </p>
                )}
                {invitation.status === "granted" && claimedByMe && (
                  <button
                    className="button primary"
                    onClick={() => navigate(`/project/${invitation.projectId}`)}
                  >
                    Open shared project
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() => navigate("/projects")}
                >
                  Go to my workspace
                </button>
              </>
            )}
          </>
        ) : (
          !error && <p>Loading invitation…</p>
        )}
        <small>
          Accepting the link does not reveal files. Access follows owner
          confirmation and a signed Tide policy.
        </small>
      </div>
    </main>
  );
}

export function Approvals({ config, user, onChanged }) {
  const [rows, setRows] = useState([]),
    [governance, setGovernance] = useState([]),
    [unlinked, setUnlinked] = useState([]),
    [enrollment, setEnrollment] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  async function load() {
    const data = await api("/approvals");
    setRows(data.approvals);
    if (user.canSign && config.mode === "tide") {
      const changes = await adminRequest(
        config,
        "/iga/change-requests?status=PENDING",
      );
      setGovernance(changes);
      const people = await adminRequest(config, "/users?first=0&max=100");
      setUnlinked(
        // Keep disabled accounts: a pending CREATE_USER/ADOPT_USER disables the
        // member until it is committed, and the admin must still approve it.
        people.filter(
          (p) =>
            !p.serviceAccountClientId &&
            !p.username?.startsWith("service-account-") &&
            !p.attributes?.tideUserKey?.[0] &&
            !p.attributes?.tideuserkey?.[0],
        ),
      );
    }
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    const timer = setInterval(() => load().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, [user.id]);
  async function run(id, fn) {
    setBusy(id);
    setError("");
    try {
      await fn();
      await load();
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  async function approve(row) {
    await ensureCryptoRoles(config, row.personId);
    const policyBase64 = await signInvitation({
      config,
      user,
      recipient: row.recipient,
      recordId: row.assetId,
      hours: row.hours,
    });
    await send(`/approvals/${row.id}/approve`, { policyBase64 });
  }
  return (
    <section className="approvals-panel">
      <div className="section-heading">
        <div>
          <h2>{user.canSign ? "Access approvals" : "My access requests"}</h2>
          <p>
            {user.canSign
              ? "Approve only the recipient and draft shown. Tide signs in your browser; approving does not give you file access."
              : "Your drafts stay on your device until the approver signs their policy."}
          </p>
        </div>
        <button
          className="button secondary"
          disabled={!!busy}
          onClick={() => run("refresh", load)}
        >
          Refresh requests
        </button>
      </div>
      {user.canSign && config.sharedOrigin && (
        <section className="shared-setup">
          <h3>Shared HTTPS workspace</h3>
          <p>
            Members can use the public link after you approve its sign-in
            origin. Approve here from localhost on the host machine; Tide admin
            APIs remain private.
          </p>
          <p>
            <a href={config.sharedOrigin} target="_blank" rel="noreferrer">
              {config.sharedOrigin}
            </a>
          </p>
          <button
            className="button primary"
            disabled={!!busy}
            onClick={() =>
              run("shared", async () => {
                await configureSharedAccess(config);
                window.location.reload();
              })
            }
          >
            Enable shared sign-in in Tide
          </button>
        </section>
      )}
      <Notice error={error} />
      {busy && (
        <p className="working-note" role="status">
          Complete any Tide approval window, then return here…
        </p>
      )}
      {user.canSign && config.mode === "tide" && (
        <section className="governance-panel">
          <h3>Member account linking</h3>
          <p>
            New registrations must be approved for Tide linking before they can
            upload. Prepare a link for the exact member shown; this grants no
            administrator or draft access.
          </p>
          {!unlinked.length && (
            <p>No unlinked members in the first 100 accounts.</p>
          )}
          {unlinked.map((person) => (
            <div className="approval-row" key={person.id}>
              <div>
                <strong>{person.username}</strong>
                <small>
                  Account: {person.id.slice(-8)} ·{" "}
                  {person.enabled
                    ? "Tide not linked"
                    : "Waiting for admin approval"}
                </small>
              </div>
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={() =>
                  run(`enroll-${person.id}`, async () => {
                    setEnrollment(null);
                    const url = await prepareMemberEnrollment(
                      config,
                      person.id,
                    );
                    setEnrollment({ username: person.username, url });
                  })
                }
              >
                {person.enabled ? "Prepare Tide link" : "Approve & prepare link"}
              </button>
            </div>
          ))}
          {enrollment && (
            <div className="invite-link-box">
              <strong>Tide link for {enrollment.username}</strong>
              <p>
                Open this link in that member’s browser profile. Finish Tide
                linking there, then return to CreatorRoom and Sign in. Do not
                open it in the administrator’s profile.
              </p>
              <label>
                Private enrollment link
                <input
                  aria-label="Private enrollment link"
                  readOnly
                  value={enrollment.url}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(enrollment.url);
                  } catch {
                    setError("Select and copy the private link above.");
                  }
                }}
              >
                Copy Tide link
              </button>
              <small>
                Requested lifetime: 30 minutes. Keep this link private. This is
                account linking, separate from an invitation to review a draft.
              </small>
              <button
                className="text-button"
                onClick={() => setEnrollment(null)}
              >
                Hide link
              </button>
            </div>
          )}
        </section>
      )}
      {!rows.length && (
        <div className="empty-state">
          <h3>No access requests yet.</h3>
          <p>Upload a draft or confirm an invitation to request a policy.</p>
        </div>
      )}
      {rows.map((row) => (
        <article className="approval-row" key={row.id}>
          <div>
            <strong>{row.assetTitle}</strong>
            <p>
              {row.requesterName} → {row.recipient?.name || "Collaborator"} ·{" "}
              {row.hours} hour(s)
            </p>
            <small>{statusLabel[row.status] || row.status}</small>
          </div>
          {user.canSign && row.status === "pending" && (
            <div className="project-room-actions">
              <button
                className="button primary"
                disabled={!!busy}
                onClick={() => run(row.id, () => approve(row))}
              >
                Approve access
              </button>
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={() =>
                  run(row.id, () => send(`/approvals/${row.id}/reject`, {}))
                }
              >
                Reject
              </button>
            </div>
          )}
        </article>
      ))}
      {user.canSign && config.mode === "tide" && (
        <section className="governance-panel">
          <h3>Tide governance</h3>
          <p>
            Realm changes require your own Tide signature. Review each change in
            the enclave before approving. For first-time member registration,
            finish the pending realm configuration that enables
            registrationAllowed, then check the Create account flow. New users
            must link their Tide account.
          </p>
          {!governance.length && <p>No pending governance changes.</p>}
          {governance.map((row) => (
            <div className="approval-row" key={row.id}>
              <div>
                <strong>{row.actionType}</strong>
                {row.entityType === "USER" && row.entityId && (
                    <p>
                      Member:{" "}
                      {unlinked.find((p) => p.id === row.entityId)?.username ||
                        row.rows?.[0]?.USERNAME ||
                        row.entityId.slice(-8)}
                    </p>
                  )}
                {row.rows?.some(
                  (r) =>
                    (r.key ?? r.KEY) === "setRegistrationAllowed" &&
                    String(r.value ?? r.VALUE) === "true",
                ) && <p>Enable browser account registration</p>}
                <small>
                  {row.entityType} · {row.authorizationCount ?? "?"}/
                  {row.threshold} signed
                </small>
              </div>
              {!["DISABLE_IGA", "DELETE_REALM", "OFFBOARD_REALM"].includes(
                row.actionType,
              ) && (
                <button
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() =>
                    run(row.id, () => approveGovernance(config, row.id))
                  }
                >
                  Review in Tide
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
