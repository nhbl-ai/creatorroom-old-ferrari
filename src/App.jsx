import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  FileImage,
  Folder,
  FolderOpen,
  LayoutGrid,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  api,
  initialiseAuth,
  login,
  register,
  logout,
  send,
  refreshSession,
} from "./lib/api.js";
import {
  decryptPayload,
  encryptPayload,
  fromBase64,
  toBase64,
} from "./lib/crypto.js";
import { signInvitation } from "./lib/tide.js";
import { sampleFile } from "./lib/samples.js";
import {
  ProjectRoom,
  InvitationPage,
  Approvals,
} from "./components/Collaboration.jsx";
import { navigate, useRoute } from "./lib/routing.js";
import { ensureCryptoRoles } from "./lib/tide-admin.js";
import { ProfileOnboarding } from "./components/ProfileOnboarding.jsx";

const formatSize = (bytes) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const initials = (name) =>
  name
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("");
const dateLabel = (value) =>
  new Date(value).toLocaleDateString("en", { month: "short", day: "numeric" });
const timeLabel = (value) =>
  new Date(value).toLocaleTimeString("en", {
    hour: "numeric",
    minute: "2-digit",
  });

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <FolderOpen size={22} strokeWidth={1.8} />
      </span>
      CreatorRoom<span className="brand-dot">®</span>
    </div>
  );
}

function Modal({ title, children, onClose, wide = false }) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function Landing({ config, error, busy, onLogin, onRegister, onIdentity }) {
  return (
    <div className="landing">
      <header>
        <Brand />
        <span className="eyebrow">A LITTLE SPACE. A BIG IDEA.</span>
      </header>
      <main className="landing-main">
        <div className="landing-copy">
          <span className="pill">
            <LockKeyhole size={13} /> MADE FOR THE WORK IN PROGRESS
          </span>
          <h1>
            Keep the draft.
            <br />
            Share the <em>vision.</em>
          </h1>
          <p>
            A private room for your next big idea. Bring in your people, get
            thoughtful feedback, and keep unreleased work in your hands.
          </p>
          {config.mode === "demo" ? (
            <div className="identity-choices">
              <span className="eyebrow">EXPLORE THE LOCAL DEMO AS</span>
              {config.demoPeople.map((person) => (
                <button
                  disabled={busy}
                  key={person.id}
                  onClick={() => onIdentity(person.id)}
                  className="identity-choice"
                >
                  <span className={`avatar avatar-${person.role}`}>
                    {initials(person.name)}
                  </span>
                  <span>
                    <strong>{person.name}</strong>
                    <small>
                      {person.role === "creator"
                        ? "Creator · upload and invite"
                        : person.role === "reviewer"
                          ? "Reviewer · open and leave feedback"
                          : "Operator · inspect ciphertext"}
                    </small>
                  </span>
                  <ArrowRight size={18} />
                </button>
              ))}
              <p className="small-note">
                Local simulation with shared browser keys. Use one browser to
                switch identities. TideCloak is not active.
              </p>
            </div>
          ) : config.mode === "tide" ? (
            <div className="landing-auth-actions">
            <button
              className="button primary"
              disabled={
                busy ||
                Boolean(
                  config.sharedOrigin &&
                    window.location.origin === config.sharedOrigin &&
                    !config.sharedReady,
                )
              }
              onClick={onLogin}
            >
              <ShieldCheck size={17} /> Continue with TideCloak{" "}
              <ArrowRight size={17} />
            </button>
            <button
              className="button secondary"
              disabled={busy || Boolean(config.sharedOrigin && window.location.origin === config.sharedOrigin && !config.sharedReady)}
              onClick={onRegister}
            >Create account</button>
            </div>
          ) : (
            <div className="setup-box">
              <strong>Your studio is ready for setup.</strong>
              <p>
                To explore locally, run <code>npm run demo</code>. To connect
                TideCloak, follow <code>docs/TIDECLOAK.md</code> and restart
                this server.
              </p>
              <span className="small-note">
                The app will not substitute a demo login for a Tide session.
              </span>
            </div>
          )}
          {config.sharedOrigin &&
            window.location.origin === config.sharedOrigin &&
            !config.sharedReady && (
              <div className="setup-box">
                <strong>
                  Shared sign-in is waiting for the host approver.
                </strong>
                <p>
                  The host must enable this address in Approvals. No
                  installation is needed on your device.
                </p>
                <button
                  className="button secondary"
                  onClick={() => window.location.reload()}
                >
                  Check again
                </button>
              </div>
            )}
          {config.mode === "tide" && (
            <p className="small-note">
              New here? Create your account and link Tide in your browser.
              Nothing to install. Everyone can own projects and review invited drafts.
              If registration is unavailable, ask the host to finish account setup.
            </p>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="landing-art" aria-hidden="true">
          <div className="art-label">YOUR NEXT RELEASE, STILL YOURS.</div>
          <div className="cover cover-landing">
            <span>STUDIO NOTES / 026</span>
            <strong>
              Ideas
              <br />
              in good
              <br />
              <i>company.</i>
            </strong>
            <div className="cover-orbit" />
            <small>UNRELEASED / JUST BETWEEN US</small>
          </div>
          <div className="floating-tag">
            <ShieldCheck size={18} />
            <span>A room for the right people.</span>
          </div>
        </div>
      </main>
      <footer>
        BUILT BY OLD FERRARI <span>RMIT HACKATHON 2026 / CHALLENGE 2</span>
      </footer>
    </div>
  );
}

function ProjectArt({ color, index }) {
  return (
    <div className={`project-art art-${color}`} aria-hidden="true">
      <div className="art-no">
        CONCEPT / {String(index + 1).padStart(2, "0")}
      </div>
      <div className={`art-shape shape-${index % 3}`} />
      <div className="art-stamp">
        <LockKeyhole size={12} /> PRIVATE DRAFTS
      </div>
      <span className="art-caption">Good things take a little room.</span>
    </div>
  );
}

function CreateProject({ onClose, onCreate, busy, error }) {
  const [color, setColor] = useState("lavender");
  return (
    <Modal title="Make room for a new idea" onClose={onClose}>
      <p className="modal-intro">
        Give your project a name. You can add private drafts and invite
        reviewers next.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onCreate({
            title: form.get("title"),
            description: form.get("description"),
            color,
          });
        }}
      >
        <label>
          Project name
          <input
            name="title"
            placeholder="e.g. After Hours — visual identity"
            required
            maxLength={80}
            autoFocus
          />
        </label>
        <label>
          A little context
          <textarea
            name="description"
            placeholder="What are you making?"
            maxLength={200}
            rows={3}
          />
        </label>
        <label>Room colour</label>
        <div className="color-options">
          {["lavender", "peach", "mint", "blue"].map((value) => (
            <button
              type="button"
              aria-label={`${value} colour`}
              aria-pressed={color === value}
              className={`color-option art-${value}`}
              key={value}
              onClick={() => setColor(value)}
            >
              {color === value && <Check size={18} />}
            </button>
          ))}
        </div>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy} className="button primary">
            Create project <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UploadDraft({
  projects,
  onClose,
  onUpload,
  busy,
  message,
  error,
  resumeAsset,
}) {
  const [file, setFile] = useState(null);
  return (
    <Modal title="A new draft, kept private" onClose={onClose}>
      <p className="modal-intro">
        Your draft is encrypted in this browser before it reaches the workspace.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          if (file)
            onUpload({
              projectId: form.get("projectId"),
              title: form.get("title") || file.name,
              file,
              existingAsset: resumeAsset,
            });
        }}
      >
        <label>
          Project
          <select aria-label="Project" name="projectId" required>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Draft title
          <input
            name="title"
            defaultValue={resumeAsset?.title || ""}
            placeholder="e.g. Poster exploration — v01"
            required
            maxLength={100}
          />
        </label>
        <label className="file-drop">
          <Upload size={28} />
          <strong>{file ? file.name : "Choose a draft to share"}</strong>
          <span>
            {file
              ? formatSize(file.size)
              : "PNG, JPEG, WebP or TXT · up to 1 MB"}
          </span>
          <input
            aria-label="Draft file"
            type="file"
            accept="image/png,image/jpeg,image/webp,text/plain,.txt"
            required
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </label>
        {busy && (
          <p className="working-note" role="status">
            <LoaderCircle className="spin" size={15} />
            {message}
          </p>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy || !file}>
            <LockKeyhole size={16} /> Encrypt & upload
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AssetRoom({
  asset,
  user,
  config,
  people,
  onClose,
  onChanged,
  notify,
}) {
  const isOwner = asset.ownerId === user.id;
  const [tab, setTab] = useState("feedback");
  const [opened, setOpened] = useState(null);
  const [payload, setPayload] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [comments, setComments] = useState([]);
  const [grants, setGrants] = useState([]);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("Opening your draft…");
  const [recipientId, setRecipientId] = useState(people[0]?.id || "");
  const [hours, setHours] = useState("1");
  const [comment, setComment] = useState("");
  const mounted = useRef(true);
  const cryptoContext = useCallback(
    (policyBase64) => ({ mode: config.mode, recordId: asset.id, policyBase64 }),
    [config.mode, asset.id],
  );

  const readComments = useCallback(
    async (policyBase64) => {
      const { comments: rows } = await api(`/assets/${asset.id}/comments`);
      return Promise.all(
        rows.map(async (entry) => {
          try {
            const decoded = await decryptPayload(
              entry.envelope,
              cryptoContext(policyBase64),
            );
            if (
              decoded.kind !== "comment" ||
              decoded.noteId !== entry.id ||
              decoded.authorId !== entry.authorId ||
              typeof decoded.text !== "string"
            )
              throw new Error("Invalid feedback content.");
            return { ...entry, text: decoded.text };
          } catch {
            return {
              ...entry,
              text: "This feedback could not be decrypted.",
              unreadable: true,
            };
          }
        }),
      );
    },
    [asset.id, cryptoContext],
  );

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    (async () => {
      if (config.mode === "tide") await refreshSession();
      if (isOwner) {
        const result = await api(`/assets/${asset.id}/grants`);
        if (!cancelled) setGrants(result.grants);
      }
      const result = await api(`/assets/${asset.id}/open`);
      const decoded = await decryptPayload(
        result.envelope,
        cryptoContext(result.policyBase64),
      );
      if (
        decoded.kind !== "asset" ||
        decoded.mime !== asset.mime ||
        typeof decoded.base64 !== "string"
      )
        throw new Error("The decrypted file does not match this draft.");
      if (!cancelled) {
        setOpened(result);
        setPayload(decoded);
        setWorking("");
      }
      const notes = await readComments(result.policyBase64);
      if (!cancelled) setComments(notes);
    })().catch((failure) => {
      if (!cancelled) {
        setError(failure.message);
        setWorking("");
      }
    });
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [asset.id, asset.mime, isOwner, cryptoContext, readComments]);

  useEffect(() => {
    if (!payload || !payload.mime.startsWith("image/")) return;
    const url = URL.createObjectURL(
      new Blob([fromBase64(payload.base64)], { type: payload.mime }),
    );
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [payload]);

  async function execute(label, action) {
    setWorking(label);
    setError("");
    try {
      await action();
    } catch (failure) {
      if (mounted.current) setError(failure.message);
    } finally {
      if (mounted.current) setWorking("");
    }
  }

  async function invite(recipient) {
    await execute(
      config.mode === "tide"
        ? "Approve the invitation in the Tide window…"
        : "Sharing this draft…",
      async () => {
        if (config.mode === "tide") {
          const { approval } = await send(
            `/assets/${asset.id}/policy-requests`,
            { personId: recipient.id, hours: Number(hours) },
          );
          if (!user.canSign) {
            notify(
              "Access request sent. The approver will sign this invitation.",
            );
            onChanged();
            return;
          }
          await ensureCryptoRoles(config, recipient.id);
          const policyBase64 = await signInvitation({
            config,
            user,
            recipient,
            recordId: asset.id,
            hours: Number(hours),
          });
          await send(`/approvals/${approval.id}/approve`, { policyBase64 });
        } else {
          await send(`/assets/${asset.id}/grants`, {
            personId: recipient.id,
            policyBase64: null,
          });
        }
        const result = await api(`/assets/${asset.id}/grants`);
        if (!mounted.current) return;
        setGrants(result.grants);
        notify(`Invitation ready for ${recipient.name}.`);
        onChanged();
      },
    );
  }

  async function postComment(event) {
    event.preventDefault();
    if (!comment.trim() || !opened) return;
    await execute("Encrypting your feedback…", async () => {
      // Fetch again to enforce current app-level access before each new action.
      const current = await api(`/assets/${asset.id}/open`);
      const id = crypto.randomUUID();
      const envelope = await encryptPayload(
        {
          kind: "comment",
          noteId: id,
          authorId: user.id,
          text: comment.trim(),
        },
        cryptoContext(current.policyBase64),
      );
      await send(`/assets/${asset.id}/comments`, { id, envelope });
      const notes = await readComments(current.policyBase64);
      if (!mounted.current) return;
      setComments(notes);
      setComment("");
      onChanged();
    });
  }

  return (
    <Modal title={asset.title} onClose={onClose} wide>
      <div className="room-meta">
        <span>
          <LockKeyhole size={13} /> Encrypted draft
        </span>
        <span>{formatSize(asset.size)}</span>
        <span>
          {config.mode === "demo" ? "Local demo" : "Tide policy protected"}
        </span>
      </div>
      <div className="room-layout">
        <div className="draft-stage">
          {!payload && working ? (
            <div className="stage-state">
              <LoaderCircle size={30} className="spin" />
              <h3>Opening your private draft</h3>
              <p>{working}</p>
            </div>
          ) : !payload ? (
            <div className="stage-state denied">
              <LockKeyhole size={34} />
              <h3>Access denied</h3>
              <p>{error || "This draft has not been shared with you."}</p>
              <span className="pill">THE DRAFT STAYS PRIVATE</span>
            </div>
          ) : payload.mime === "text/plain" ? (
            <pre className="text-draft">
              {new TextDecoder().decode(fromBase64(payload.base64))}
            </pre>
          ) : (
            imageUrl && (
              <img
                className="decrypted-image"
                alt={`Private draft: ${asset.title}`}
                src={imageUrl}
              />
            )
          )}
          {payload && (
            <div className="stage-footer">
              <ShieldCheck size={14} /> Opened in your browser · original files
              stay encrypted on the server
            </div>
          )}
        </div>
        <aside className="room-sidebar">
          <div className="room-tabs">
            <button
              className={tab === "feedback" ? "active" : ""}
              onClick={() => setTab("feedback")}
            >
              Feedback <span>{comments.length}</span>
            </button>
            {isOwner && (
              <button
                className={tab === "access" ? "active" : ""}
                onClick={() => setTab("access")}
              >
                People & access
              </button>
            )}
          </div>
          {tab === "feedback" ? (
            <>
              <div className="comments-list">
                {comments.length ? (
                  comments.map((entry) => (
                    <div className="comment" key={entry.id}>
                      <span className="avatar avatar-small">
                        {initials(entry.authorName)}
                      </span>
                      <div>
                        <strong>
                          {entry.authorName}
                          <time>{timeLabel(entry.createdAt)}</time>
                        </strong>
                        <p>{entry.text}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="no-comments">
                    <MessageSquare size={25} />
                    <strong>A fresh pair of eyes helps.</strong>
                    <p>
                      {payload
                        ? "Start the conversation with thoughtful feedback."
                        : "Feedback is private to invited collaborators."}
                    </p>
                  </div>
                )}
              </div>
              <form className="comment-form" onSubmit={postComment}>
                <label className="sr-only" htmlFor="feedback">
                  Your feedback
                </label>
                <textarea
                  id="feedback"
                  placeholder="Leave a little feedback…"
                  maxLength={2000}
                  rows={3}
                  value={comment}
                  disabled={!payload || Boolean(working)}
                  onChange={(event) => setComment(event.target.value)}
                />
                <div>
                  <span>
                    <LockKeyhole size={12} /> Feedback is encrypted too
                  </span>
                  <button
                    className="icon-button send-button"
                    aria-label="Send feedback"
                    disabled={!payload || !comment.trim() || Boolean(working)}
                  >
                    <Send size={16} />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="access-panel">
              <h3>Good company. Your choice.</h3>
              <p>
                Invite a registered collaborator to this draft and its encrypted
                feedback.
              </p>
              <label>
                Reviewer
                <select
                  aria-label="Reviewer"
                  value={recipientId}
                  onChange={(event) => setRecipientId(event.target.value)}
                >
                  <option value="" disabled>
                    Choose a collaborator
                  </option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} · {person.id.slice(-8)}
                    </option>
                  ))}
                </select>
              </label>
              {!people.length && (
                <p className="small-note">
                  Ask your reviewer to sign in once, then reopen this draft.
                </p>
              )}
              {config.mode === "tide" && (
                <label>
                  Access duration
                  <select
                    value={hours}
                    onChange={(event) => setHours(event.target.value)}
                  >
                    <option value="1">1 hour</option>
                    <option value="24">24 hours</option>
                  </select>
                </label>
              )}
              <button
                className="button primary full-width"
                disabled={!recipientId || Boolean(working)}
                onClick={() =>
                  invite(people.find((person) => person.id === recipientId))
                }
              >
                <Users size={15} /> Invite reviewer
              </button>
              <div className="grant-list">
                <span className="eyebrow">IN THIS ROOM</span>
                {grants.map((grant) => (
                  <div className="grant" key={grant.personId}>
                    <span className="avatar avatar-small">
                      {initials(grant.name)}
                    </span>
                    <div>
                      <strong>{grant.name}</strong>
                      <small>
                        {grant.personId === user.id
                          ? "Creator"
                          : "Review access"}
                        {grant.expiresAt
                          ? ` · until ${timeLabel(grant.expiresAt)}`
                          : ""}
                      </small>
                    </div>
                    {grant.personId !== user.id && (
                      <button
                        className="icon-button"
                        disabled={Boolean(working)}
                        aria-label={`Remove ${grant.name}`}
                        onClick={() =>
                          execute("Removing the invitation…", async () => {
                            const result = await send(
                              `/assets/${asset.id}/grants/${encodeURIComponent(grant.personId)}`,
                              {},
                              "DELETE",
                            );
                            const next = await api(
                              `/assets/${asset.id}/grants`,
                            );
                            if (mounted.current) {
                              setGrants(next.grants);
                              notify(result.limitation);
                              onChanged();
                            }
                          })
                        }
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {config.mode === "tide" && (
                <>
                  <button
                    className="text-button"
                    disabled={Boolean(working)}
                    onClick={() => invite(user)}
                  >
                    Renew my access
                  </button>
                  <p className="small-note">
                    Removing an invitation blocks future API requests. A copied
                    Tide policy can remain usable until expiry. Content already
                    read cannot be withdrawn.
                  </p>
                </>
              )}
            </div>
          )}
          {payload && error && (
            <p className="error-message room-error" role="alert">
              {error}
            </p>
          )}
          {working && payload && (
            <p className="working-note" role="status">
              <LoaderCircle className="spin" size={13} />
              {working}
            </p>
          )}
        </aside>
      </div>
    </Modal>
  );
}

function StorageInspector({ records, onTryOpen }) {
  const [selected, setSelected] = useState(null);
  return (
    <section className="storage-section">
      <div className="section-heading">
        <div>
          <h2>Behind the curtain</h2>
          <p>
            The operator sees storage records. File contents and feedback arrive
            encrypted.
          </p>
        </div>
        <span className="pill">
          <Database size={13} /> CIPHERTEXT ONLY
        </span>
      </div>
      {!records.length ? (
        <div className="empty-state">
          <Database size={35} />
          <h3>No stored drafts yet</h3>
          <p>Upload a draft as the creator, then return here.</p>
        </div>
      ) : (
        <div className="storage-table">
          <div className="storage-row table-head">
            <span>STORED RECORD</span>
            <span>FORMAT</span>
            <span>SIZE</span>
            <span />
          </div>
          {records.map((record) => (
            <div className="storage-row" key={record.id}>
              <span className="storage-name">
                <span className="file-icon">
                  <LockKeyhole size={18} />
                </span>
                <span>
                  <strong>{record.title}</strong>
                  <small>
                    {record.kind} · {record.id.slice(0, 8)}
                  </small>
                </span>
              </span>
              <span className="tag">
                {record.scheme === "local-demo-v1"
                  ? "Demo AES-GCM"
                  : "Tide policy"}
              </span>
              <span>{formatSize(record.bytes)}</span>
              <button
                className="text-button"
                onClick={() => setSelected(record)}
              >
                Inspect <ArrowUpRight size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="operator-note">
        <ShieldCheck size={21} />
        <div>
          <strong>Administration does not grant file access.</strong>
          <p>
            The app operator has no draft-opening permission. Metadata, record
            counts and ciphertext remain visible.
          </p>
        </div>
      </div>
      {selected && (
        <Modal
          title="Inspect stored ciphertext"
          onClose={() => setSelected(null)}
        >
          <p className="modal-intro">
            {selected.title} · {formatSize(selected.bytes)}
          </p>
          <label>
            SHA-256 fingerprint
            <code className="code-block">{selected.sha256}</code>
          </label>
          <label>
            Ciphertext excerpt
            <pre className="code-block ciphertext">
              {selected.ciphertextPreview}…
            </pre>
          </label>
          <p className="small-note">
            No plaintext or decryption key is stored in this record. A preview
            is not proof of a fully verified Tide deployment.
          </p>
          {selected.kind === "draft" && (
            <button
              className="button secondary full-width"
              onClick={() => onTryOpen(selected.id)}
            >
              Test operator access <LockKeyhole size={15} />
            </button>
          )}
        </Modal>
      )}
    </section>
  );
}

export default function App() {
  const route = useRoute();
  const [resumeAsset, setResumeAsset] = useState(null);
  const [config, setConfig] = useState(null);
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [events, setEvents] = useState([]);
  const [people, setPeople] = useState([]);
  const [records, setRecords] = useState([]);
  const [view, setView] = useState("projects");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [booting, setBooting] = useState(true);
  const sessionEpoch = useRef(0);
  useEffect(() => {
    const section = route.slice(1);
    setView(
      ["shared", "activity", "storage", "approvals"].includes(section)
        ? section
        : "projects",
    );
    setSelectedAsset(null);
    setModal(null);
  }, [route]);

  const refresh = useCallback(
    async (person = user) => {
      if (!person) return;
      const epoch = sessionEpoch.current;
      const [workspace, activity, directory, storage] = await Promise.all([
        api("/projects"),
        api("/activity"),
        person.role !== "operator"
          ? api("/people")
          : Promise.resolve({ people: [] }),
        person.role === "operator"
          ? api("/storage")
          : Promise.resolve({ records: [] }),
      ]);
      if (epoch !== sessionEpoch.current) return;
      setProjects(workspace.projects);
      setEvents(activity.events);
      setPeople(directory.people);
      setRecords(storage.records);
    },
    [user],
  );

  useEffect(() => {
    (async () => {
      const result = await api("/config");
      setConfig(result);
      await initialiseAuth(result);
      try {
        const { user: person } = await api("/me");
        setUser(person);
        await refresh(person);
      } catch (failure) {
        if (![401, 503].includes(failure.status)) throw failure;
      }
    })()
      .catch((failure) => setError(failure.message))
      .finally(() => setBooting(false));
    // One bootstrap only: IAMService must not be initialised twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => refresh().catch(() => {}), 8000);
    return () => clearInterval(timer);
  }, [user?.id, refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function perform(label, action) {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  async function switchIdentity(personId) {
    await perform("Switching workspace…", async () => {
      sessionEpoch.current++;
      setSelectedAsset(null);
      setModal(null);
      setNotice(null);
      setProjects([]);
      setEvents([]);
      setPeople([]);
      setRecords([]);
      const { user: person } = await send("/demo/session", { personId });
      setUser(person);
      setView(person.role === "operator" ? "storage" : "projects");
      if (!route.startsWith("/invite/"))
        navigate(person.role === "operator" ? "/storage" : "/projects");
      await refresh(person);
    });
  }

  async function upload({ projectId, title, file, existingAsset }) {
    if (file.size < 1 || file.size > config.maxFileBytes)
      throw new Error("Choose a file between 1 byte and 1 MB.");
    const mime = file.type || (file.name.endsWith(".txt") ? "text/plain" : "");
    if (!["image/png", "image/jpeg", "image/webp", "text/plain"].includes(mime))
      throw new Error("Use a PNG, JPEG, WebP or TXT file.");
    if (
      existingAsset &&
      (existingAsset.mime !== mime || existingAsset.size !== file.size)
    )
      throw new Error(
        "Choose a file with the same type and size as the reserved draft, or discard it and create a new draft.",
      );
    const asset =
      existingAsset ||
      (
        await send(`/projects/${projectId}/assets`, {
          title,
          mime,
          size: file.size,
        })
      ).asset;
    try {
      let policyBase64 = null;
      if (config.mode === "tide") {
        const prior = await api(`/assets/${asset.id}/upload-policy`);
        policyBase64 = prior.policyBase64;
        if (prior.status !== "approved") {
          const { approval } = await send(
            `/assets/${asset.id}/policy-requests`,
            { hours: 24 },
          );
          if (!user.canSign) return { ...asset, pending: true };
          setBusy("Approve the draft policy in the Tide window…");
          await ensureCryptoRoles(config, user.id);
          policyBase64 = await signInvitation({
            config,
            user,
            recipient: user,
            recordId: asset.id,
            hours: 24,
          });
          await send(`/approvals/${approval.id}/approve`, { policyBase64 });
        }
      }
      setBusy("Encrypting in your browser…");
      if (config.mode === "tide") {
        const updated = await refreshSession();
        setUser(updated);
      }
      const envelope = await encryptPayload(
        {
          kind: "asset",
          mime,
          base64: toBase64(new Uint8Array(await file.arrayBuffer())),
        },
        {
          mode: config.mode,
          recordId: asset.id,
          policyBase64,
          createKey: true,
        },
      );
      await send(
        `/assets/${asset.id}/content`,
        { envelope, policyBase64 },
        "PUT",
      );
    } catch (failure) {
      await refresh().catch(() => {});
      throw failure;
    }
    return asset;
  }

  async function seedWorkspace() {
    await perform("Making a little room…", async () => {
      for (const [index, title, description, color] of [
        [
          0,
          "After Hours",
          "A visual identity for the hours that are yours.",
          "lavender",
        ],
        [
          1,
          "Quiet Forms",
          "An exploration in shape, balance and a slower pace.",
          "mint",
        ],
      ]) {
        const { project } = await send("/projects", {
          title,
          description,
          color,
        });
        const file = await sampleFile(index);
        await upload({
          projectId: project.id,
          title: index === 0 ? "Poster exploration — v01" : "Brand study — v01",
          file,
        });
      }
      await refresh();
      setNotice(
        "Two original sample projects are ready. Open a draft to invite your reviewer.",
      );
    });
  }

  if (booting || !config)
    return (
      <div className="boot">
        <Brand />
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="button secondary"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" size={26} />
            <p>Making a little room…</p>
          </>
        )}
      </div>
    );
  if (route.startsWith("/invite/"))
    return (
      <InvitationPage
        token={route.split("/")[2]}
        user={user}
        config={config}
        onIdentity={switchIdentity}
        onLogin={() => perform("Connecting…", login)}
        onRegister={() => perform("Opening registration…", register)}
      />
    );
  if (!user)
    return (
      <Landing
        config={config}
        error={error}
        busy={Boolean(busy)}
        onIdentity={switchIdentity}
        onLogin={() => perform("Connecting…", login)}
        onRegister={() => perform("Opening registration…", register)}
      />
    );

  const projectId = route.startsWith("/project/") ? route.split("/")[2] : null;
  const activeProject = projects.find((p) => p.id === projectId);
  function openAsset(asset) {
    if (!asset.hasContent && asset.ownerId === user.id) {
      setResumeAsset(asset);
      setModal("upload");
    } else setSelectedAsset(asset);
  }
  const assets = projects.flatMap((project) => project.assets);
  const ownedProjects = projects.filter(
    (project) => project.ownerId === user.id,
  );
  const accessibleCount = assets.filter(
    (asset) => asset.canRead && asset.hasContent,
  ).length;
  const shownProjects = projects.filter(
    (project) =>
      (view !== "shared" ||
        project.assets.some(
          (asset) => asset.canRead && asset.ownerId !== user.id,
        )) &&
      `${project.title} ${project.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const nav = [
    {
      id: "projects",
      name: "All projects",
      icon: LayoutGrid,
      count: projects.length,
    },
    { id: "shared", name: "Shared with me", icon: Users },
    { id: "activity", name: "Activity", icon: Clock3 },
    {
      id: "approvals",
      name: user.canSign ? "Approvals" : "My requests",
      icon: ShieldCheck,
    },
    ...(user.role === "operator"
      ? [{ id: "storage", name: "Storage inspector", icon: Database }]
      : []),
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-switch">
          <span className="workspace-icon">OF</span>
          <span>
            <strong>Old Ferrari</strong>
            <small>Creative workspace</small>
          </span>
          <ChevronDown size={15} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => {
                navigate(`/${item.id}`);
                setView(item.id);
                setQuery("");
              }}
            >
              <item.icon size={18} />
              {item.name}
              {item.count != null && <span>{item.count}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="mini-orbits">
            <span />
            <span />
            <span />
          </div>
          <strong>
            Some ideas need
            <br />a little privacy.
          </strong>
          <p>
            Make space for the work
            <br />
            you’re not ready to release.
          </p>
          <LockKeyhole size={17} />
        </div>
        <div className="sidebar-bottom">
          <a
            href="https://github.com/nhbl-ai/creatorroom-old-ferrari/blob/main/docs/TIDECLOAK.md"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelp size={17} /> Setup & help <ArrowUpRight size={13} />
          </a>
          <span className="sidebar-version">
            <span /> CreatorRoom · MVP 0.1
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <ChevronRight size={13} />
            <strong>{nav.find((item) => item.id === view)?.name}</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`mode-badge ${config.mode === "demo" ? "demo-badge" : ""}`}
            >
              <span />
              {config.mode === "demo" ? "LOCAL DEMO" : "TIDE CONNECTED"}
            </span>
            <button
              className="text-button refresh-session"
              disabled={Boolean(busy)}
              onClick={() =>
                perform("Refreshing permissions…", async () => {
                  const person = await refreshSession();
                  setUser(person);
                  await refresh(person);
                  setNotice("Session and access refreshed.");
                })
              }
            >
              Refresh access
            </button>
            {config.mode === "demo" ? (
              <label className="identity-switch">
                <span className="sr-only">Demo identity</span>
                <select
                  aria-label="Demo identity"
                  value={user.id}
                  disabled={Boolean(busy)}
                  onChange={(event) => switchIdentity(event.target.value)}
                >
                  {config.demoPeople.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} ·{" "}
                      {person.role === "operator" ? "operator" : "member"}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </label>
            ) : (
              <button
                className="profile-name"
                title="Edit display name"
                onClick={() => setModal("profile")}
              >
                {user.name}
              </button>
            )}
            <button
              className="text-button"
              aria-label="Edit profile"
              onClick={() => setModal("profile")}
            >
              Profile
            </button>
            <span className={`avatar avatar-${user.role}`}>
              {initials(user.name)}
            </span>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() =>
                perform("Signing out…", async () => {
                  sessionEpoch.current++;
                  setSelectedAsset(null);
                  await logout();
                  setUser(null);
                  setProjects([]);
                  setEvents([]);
                })
              }
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        {config.mode === "demo" && (
          <div className="demo-strip">
            <span>
              <Sparkles size={13} /> Local demo · identities are simulated, keys
              stay in this browser. TideCloak is not active.
            </span>
            <a
              href="https://github.com/nhbl-ai/creatorroom-old-ferrari/blob/main/docs/TIDECLOAK.md"
              target="_blank"
              rel="noreferrer"
            >
              Connect Tide <ArrowUpRight size={12} />
            </a>
          </div>
        )}
        <main className="workspace-main">
          <section className="page-heading">
            <div>
              <span className="eyebrow">A SPACE FOR WHAT’S NEXT</span>
              <h1>
                {view === "storage"
                  ? "The work stays private."
                  : view === "activity"
                    ? "A little studio history."
                    : view === "shared"
                      ? "You’re in good company."
                      : "Your creative workspace."}
              </h1>
              <p>
                {view === "storage"
                  ? "Manage the room, without holding the keys to every idea."
                  : view === "activity"
                    ? "Who did what, and when. No draft contents in the log."
                    : view === "shared"
                      ? "The drafts you’ve been invited to help shape."
                      : "Unreleased work. Thoughtful feedback. Just the right people."}
              </p>
            </div>
            {user.role !== "operator" && (
              <button
                className="button primary"
                disabled={Boolean(busy)}
                onClick={() => setModal("project")}
              >
                <Plus size={17} /> New project
              </button>
            )}
          </section>
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                aria-label="Dismiss error"
                className="icon-button"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="stats-row">
            <div>
              <span className="stat-icon purple">
                <Folder size={19} />
              </span>
              <span>
                <strong>{String(projects.length).padStart(2, "0")}</strong>
                <small>Creative projects</small>
              </span>
              <ArrowUpRight size={15} />
            </div>
            <div>
              <span className="stat-icon peach">
                <FileImage size={19} />
              </span>
              <span>
                <strong>
                  {String(
                    assets.filter((asset) => asset.hasContent).length,
                  ).padStart(2, "0")}
                </strong>
                <small>Encrypted drafts</small>
              </span>
              <span className="stat-detail">Kept under wraps</span>
            </div>
            <div>
              <span className="stat-icon mint">
                <ShieldCheck size={19} />
              </span>
              <span>
                <strong>{String(accessibleCount).padStart(2, "0")}</strong>
                <small>Drafts you can open</small>
              </span>
              <span className="stat-detail">By invitation</span>
            </div>
          </div>
          {projectId ? (
            activeProject ? (
              <ProjectRoom
                project={activeProject}
                user={user}
                busy={Boolean(busy)}
                onRefresh={refresh}
                onOpen={openAsset}
                onUpload={(asset) => {
                  setResumeAsset(asset || null);
                  setModal("upload");
                }}
                onEdit={async (values) => {
                  await send(`/projects/${activeProject.id}`, values, "PATCH");
                  await refresh();
                }}
              />
            ) : (
              <section className="empty-state">
                <h2>Project not available</h2>
                <p>
                  The project may no longer exist or has not been shared with
                  this account.
                </p>
                <button
                  className="button secondary"
                  onClick={() => navigate("/projects")}
                >
                  Back to projects
                </button>
              </section>
            )
          ) : view === "approvals" ? (
            <Approvals config={config} user={user} onChanged={refresh} />
          ) : view === "storage" ? (
            <StorageInspector
              records={records}
              onTryOpen={(id) =>
                perform("Checking operator access…", async () => {
                  try {
                    await api(`/assets/${id}/open`);
                    setError(
                      "Unexpected access: inspect this configuration before using it.",
                    );
                  } catch (failure) {
                    if (failure.status === 403) {
                      setNotice(
                        "Access denied (403). The operator cannot open this draft through the API.",
                      );
                      await refresh();
                    } else throw failure;
                  }
                })
              }
            />
          ) : view === "activity" ? (
            <section className="activity-full">
              <div className="section-heading">
                <h2>Workspace activity</h2>
                <button
                  className="button secondary"
                  onClick={() => perform("Refreshing…", refresh)}
                  disabled={Boolean(busy)}
                >
                  Refresh
                </button>
              </div>
              <ActivityList events={events} expanded />
            </section>
          ) : (
            <div className="workspace-columns">
              <section className="projects-section">
                <div className="section-heading">
                  <h2>
                    {view === "shared" ? "Shared drafts" : "Projects"}{" "}
                    <span className="count-label">{shownProjects.length}</span>
                  </h2>
                  <div className="section-tools">
                    <label className="search-box">
                      <Search size={15} />
                      <input
                        aria-label="Search projects"
                        placeholder="Find a project…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </label>
                    {user.role !== "operator" && ownedProjects.length > 0 && (
                      <button
                        className="button secondary upload-button"
                        disabled={Boolean(busy)}
                        onClick={() => {
                          setResumeAsset(null);
                          setModal("upload");
                        }}
                      >
                        <Upload size={15} /> Upload draft
                      </button>
                    )}
                  </div>
                </div>
                {shownProjects.length ? (
                  <div className="project-grid">
                    {shownProjects.map((project, index) => (
                      <article className="project-card" key={project.id}>
                        <ProjectArt color={project.color} index={index} />
                        <div className="project-content">
                          <div className="project-title-row">
                            <h3>{project.title}</h3>
                            <button
                              className="project-open project-menu"
                              aria-label={`Open project ${project.title}`}
                              onClick={() => navigate(`/project/${project.id}`)}
                            >
                              <Folder size={16} />
                            </button>
                          </div>
                          <p>
                            {project.description ||
                              "A little room for something new."}
                          </p>
                          <div className="project-file-list">
                            {project.assets.length ? (
                              project.assets.map((asset) => (
                                <button
                                  key={asset.id}
                                  aria-label={`Open ${asset.title}`}
                                  className="asset-row"
                                  onClick={() => openAsset(asset)}
                                >
                                  <span
                                    className={`asset-icon ${asset.canRead ? "available" : ""}`}
                                  >
                                    {asset.canRead ? (
                                      <FileImage size={16} />
                                    ) : (
                                      <LockKeyhole size={15} />
                                    )}
                                  </span>
                                  <span>
                                    <strong>{asset.title}</strong>
                                    <small>
                                      {asset.hasContent
                                        ? asset.canRead
                                          ? "Ready for your eyes"
                                          : "Invitation required"
                                        : "Upload unfinished"}
                                    </small>
                                  </span>
                                  <ArrowUpRight size={15} />
                                </button>
                              ))
                            ) : (
                              <div className="no-drafts">
                                Your next draft belongs here.
                              </div>
                            )}
                          </div>
                          <div className="project-bottom">
                            <span>
                              <span className="avatar avatar-tiny">
                                {initials(project.ownerName)}
                              </span>
                              {project.ownerName.split(" ")[0]}’s project
                            </span>
                            <span>{dateLabel(project.createdAt)}</span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-orbit">
                      <FolderOpen size={33} />
                    </div>
                    <h3>
                      {query
                        ? "No projects with that name."
                        : view === "shared"
                          ? "Your next invitation is on its way."
                          : "Every great idea starts somewhere."}
                    </h3>
                    <p>
                      {query
                        ? "Try another search."
                        : user.role !== "operator"
                          ? "Create a project, or start with two original sample designs."
                          : "Ask a creator to upload a draft and invite you."}
                    </p>
                    {!query && user.role !== "operator" && (
                      <button
                        className="button primary"
                        disabled={Boolean(busy)}
                        onClick={seedWorkspace}
                      >
                        <Sparkles size={16} /> Load sample workspace
                      </button>
                    )}
                  </div>
                )}
                <div className="privacy-footnote">
                  <LockKeyhole size={13} /> Project covers are decorative.
                  Original previews only appear after an authorised open.
                </div>
              </section>
              <aside className="workspace-rail">
                <section className="trust-card">
                  <span className="trust-icon">
                    <ShieldCheck size={23} />
                  </span>
                  <h3>
                    For your eyes.
                    <br />
                    And theirs.
                  </h3>
                  <p>
                    Your work is shared with people you choose. A workspace role
                    alone doesn’t open a draft.
                  </p>
                  <div className="trust-divider" />
                  <span>
                    <span className="status-dot" />{" "}
                    {config.mode === "demo"
                      ? "Tide integration ready for setup"
                      : "Per-draft Tide policies"}
                  </span>
                </section>
                <section className="activity-card">
                  <div className="section-heading">
                    <h3>Recent activity</h3>
                    <button
                      aria-label="View all activity"
                      className="icon-button"
                      onClick={() => setView("activity")}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <ActivityList events={events.slice(0, 5)} />
                  <button
                    className="text-button"
                    onClick={() => setView("activity")}
                  >
                    View all activity <ArrowRight size={14} />
                  </button>
                </section>
              </aside>
            </div>
          )}
          <footer className="workspace-footer">
            <span>MAKE SOMETHING WORTH KEEPING.</span>
            <span>Old Ferrari / RMIT SGS / 2026</span>
          </footer>
        </main>
      </div>
      {busy && !modal && (
        <div className="busy-indicator" role="status">
          <LoaderCircle size={16} className="spin" />
          {busy}
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <span className="toast-icon">
            <Check size={16} />
          </span>
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            className="icon-button"
            onClick={() => setNotice(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal === "project" && (
        <CreateProject
          busy={Boolean(busy)}
          error={error}
          onClose={() => setModal(null)}
          onCreate={(values) =>
            perform("Creating your room…", async () => {
              const { project } = await send("/projects", values);
              await refresh();
              navigate(`/project/${project.id}`);
              setModal(null);
              setNotice("Your project is ready. Add its first private draft.");
            })
          }
        />
      )}
      {modal === "upload" && (
        <UploadDraft
          projects={
            activeProject?.ownerId === user.id
              ? [activeProject]
              : resumeAsset
                ? ownedProjects.filter((p) => p.id === resumeAsset.projectId)
                : ownedProjects
          }
          resumeAsset={resumeAsset}
          busy={Boolean(busy)}
          message={busy}
          error={error}
          onClose={() => setModal(null)}
          onUpload={(values) =>
            perform("Preparing your draft…", async () => {
              const result = await upload(values);
              await refresh();
              setModal(null);
              setNotice(
                result.pending
                  ? "Request sent to the approver. Your file has not been uploaded. Return to this draft after approval and choose the file again."
                  : "Draft encrypted and uploaded. Open it to invite a reviewer.",
              );
            })
          }
        />
      )}
      {user && (
        <ProfileOnboarding
          config={config}
          user={user}
          forceOpen={modal === "profile"}
          onClose={() => setModal(null)}
          onSaved={setUser}
        />
      )}
      {selectedAsset && (
        <AssetRoom
          key={`${user.id}:${selectedAsset.id}`}
          asset={selectedAsset}
          user={user}
          config={config}
          people={people}
          onClose={() => {
            setSelectedAsset(null);
            refresh().catch((failure) => setError(failure.message));
          }}
          onChanged={() =>
            refresh().catch((failure) => setError(failure.message))
          }
          notify={setNotice}
        />
      )}
    </div>
  );
}

function ActivityList({ events, expanded = false }) {
  if (!events.length)
    return (
      <p className="no-activity">
        A quiet studio, for now.
        <br />
        Your activity will appear here.
      </p>
    );
  return (
    <div className={`activity-list ${expanded ? "expanded" : ""}`}>
      {events.map((event) => (
        <div className="activity-item" key={event.id}>
          <span
            className={`event-icon ${event.decision === "denied" ? "event-denied" : ""}`}
          >
            {event.decision === "denied" ? (
              <LockKeyhole size={14} />
            ) : event.action.includes("feedback") ? (
              <MessageSquare size={14} />
            ) : event.action.includes("invited") ? (
              <Users size={14} />
            ) : (
              <ArrowDownLeft size={14} />
            )}
          </span>
          <div>
            <strong>{event.action}</strong>
            <p>
              {event.actorName}
              {expanded && event.resourceId
                ? ` · ${event.resourceId.slice(0, 8)}`
                : ""}
            </p>
            <time>
              {dateLabel(event.at)} · {timeLabel(event.at)}
            </time>
          </div>
          {expanded && (
            <span
              className={`tag ${event.decision === "denied" ? "tag-denied" : ""}`}
            >
              {event.decision}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
