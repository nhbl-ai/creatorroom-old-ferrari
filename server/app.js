import express from "express";
import {
  resolveDpopAuthRequest,
  expectationsFromConfig,
  DPOP_AUTH_HTML,
  dpopAuthHeaders,
} from "@tidecloak/js/dpop-server";
import { randomUUID, createHash } from "node:crypto";
import { createAuthenticator, DEMO_PEOPLE } from "./auth.js";
import { publicAdapter } from "./config.js";
import { audit } from "./store.js";
import { HttpError, requireThat, text, onlyFields } from "./errors.js";
import { validateEnvelope, validatePolicy } from "./policies.js";

const MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "text/plain"];
const COLORS = ["lavender", "peach", "mint", "blue"];
const now = () => new Date().toISOString();
const safePerson = ({ id, name, role, tideUserKey }) => ({
  id,
  name,
  role,
  tideUserKey,
});

export function createApp({ config, store, verifyToken }) {
  const app = express();
  const auth = createAuthenticator(config, verifyToken);
  app.disable("x-powered-by");
  const { issuer, client } = expectationsFromConfig(config.adapter || {});
  app.use((req, res, next) => {
    const relay =
      req.path === "/tide_dpop_auth.html"
        ? { status: 200, headers: dpopAuthHeaders(), body: DPOP_AUTH_HTML }
        : resolveDpopAuthRequest({
            pathname: req.path,
            method: req.method,
            expectedIssuer: issuer,
            expectedClient: client,
          });
    if (relay) {
      res.status(relay.status).set(relay.headers).send(relay.body);
      return;
    }
    if (req.path.startsWith("/tide_dpop/")) return res.sendStatus(404);
    res.set("Content-Security-Policy", "frame-src 'self' *");
    next();
  });
  app.use("/api", (req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    });
    // With no CORS and JSON-only writes, a different site cannot use demo cookies
    // to mutate state. Enforce Origin as well, including login/logout endpoints.
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("Origin");
      if (origin && origin !== config.origin)
        return next(
          new HttpError(
            403,
            "Requests must come from the configured app origin.",
          ),
        );
      if (!req.is("application/json"))
        return next(new HttpError(415, "Send application/json."));
    }
    next();
  });
  app.use("/api", express.json({ limit: "4mb" }));

  app.get("/api/config", (_req, res) =>
    res.json({
      mode: config.mode,
      adapter: config.mode === "tide" ? publicAdapter(config.adapter) : null,
      demoPeople: config.mode === "demo" ? DEMO_PEOPLE.map(safePerson) : [],
      maxFileBytes: 1_000_000,
    }),
  );
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, mode: config.mode }),
  );
  app.post("/api/demo/session", (req, res) => {
    onlyFields(req.body, ["personId"]);
    res.json({ user: auth.demoLogin(req, res, req.body.personId) });
  });
  app.post("/api/logout", (req, res) => {
    auth.logout(req, res);
    res.json({ ok: true });
  });

  app.use("/api", async (req, _res, next) => {
    req.user = await auth.authenticate(req);
    const state = store.read();
    const prior = state.people.find((person) => person.id === req.user.id);
    if (
      !prior ||
      JSON.stringify(prior) !== JSON.stringify(safePerson(req.user))
    ) {
      await store.mutate((nextState) => {
        nextState.people = nextState.people.filter(
          (person) => person.id !== req.user.id,
        );
        nextState.people.push(safePerson(req.user));
      });
    }
    next();
  });

  function creator(user) {
    requireThat(user.role === "creator", 403, "Only a creator can do this.");
  }
  function findAsset(state, id) {
    const asset = state.assets.find((entry) => entry.id === id);
    requireThat(asset, 404, "Draft not found.");
    return asset;
  }
  function owner(state, user, asset) {
    creator(user);
    const project = state.projects.find(
      (entry) => entry.id === asset.projectId,
    );
    requireThat(
      project?.ownerId === user.id,
      403,
      "Only the project owner can change this draft.",
    );
  }
  function activeGrant(state, user, asset) {
    if (user.role === "operator") return null;
    return state.grants.find(
      (grant) =>
        grant.assetId === asset.id &&
        grant.personId === user.id &&
        (!grant.expiresAt || Date.parse(grant.expiresAt) > Date.now()),
    );
  }
  async function readable(user, assetId) {
    const state = store.read();
    const asset = findAsset(state, assetId);
    const grant = activeGrant(state, user, asset);
    if (!grant) {
      await store.mutate((next) =>
        audit(next, user, "Access refused", assetId, "denied"),
      );
      throw new HttpError(
        403,
        "This draft is private. Ask its creator for an invitation.",
      );
    }
    return { state, asset, grant };
  }
  const publicAsset = (state, user, asset) => ({
    id: asset.id,
    projectId: asset.projectId,
    title: asset.title,
    mime: asset.mime,
    size: asset.size,
    createdAt: asset.createdAt,
    hasContent: Boolean(asset.envelope),
    canRead: Boolean(activeGrant(state, user, asset)),
    ownerId: state.projects.find((project) => project.id === asset.projectId)
      ?.ownerId,
    commentCount: state.comments.filter(
      (comment) => comment.assetId === asset.id,
    ).length,
  });

  app.get("/api/me", (req, res) => res.json({ user: req.user }));
  app.get("/api/people", (req, res) => {
    creator(req.user);
    const people = config.mode === "demo" ? DEMO_PEOPLE : store.read().people;
    res.json({
      people: people
        .filter(
          (person) => person.role !== "operator" && person.id !== req.user.id,
        )
        .map(safePerson),
    });
  });

  // Project titles, colours, asset names and activity metadata are discoverable
  // by signed-in teammates. Protected file bytes and feedback are never included.
  app.get("/api/projects", (req, res) => {
    const state = store.read();
    res.json({
      projects: state.projects.map((project) => ({
        ...project,
        assets: state.assets
          .filter((asset) => asset.projectId === project.id)
          .map((asset) => publicAsset(state, req.user, asset)),
        ownerName:
          state.people.find((person) => person.id === project.ownerId)?.name ||
          "Creator",
      })),
    });
  });
  app.post("/api/projects", async (req, res) => {
    creator(req.user);
    onlyFields(req.body, ["title", "description", "color"]);
    const project = {
      id: randomUUID(),
      title: text(req.body.title, "Project title", 80),
      description:
        typeof req.body.description === "string"
          ? req.body.description.trim().slice(0, 200)
          : "",
      color: COLORS.includes(req.body.color) ? req.body.color : "lavender",
      ownerId: req.user.id,
      createdAt: now(),
    };
    await store.mutate((state) => {
      requireThat(
        state.projects.length < 100,
        409,
        "The MVP supports up to 100 projects.",
      );
      state.projects.push(project);
      audit(state, req.user, "Project created", project.id);
    });
    res.status(201).json({ project });
  });
  app.post("/api/projects/:id/assets", async (req, res) => {
    creator(req.user);
    requireThat(
      config.mode === "demo" || req.user.canSign,
      403,
      "The MVP creator also needs tide-realm-admin to approve per-person Tide policies. See the setup guide.",
    );
    onlyFields(req.body, ["title", "mime", "size"]);
    requireThat(
      MIME_TYPES.includes(req.body.mime),
      400,
      "Use a PNG, JPEG, WebP or plain-text draft.",
    );
    requireThat(
      Number.isInteger(req.body.size) &&
        req.body.size > 0 &&
        req.body.size <= 1_000_000,
      400,
      "Drafts must be between 1 byte and 1 MB.",
    );
    const asset = {
      id: randomUUID(),
      projectId: req.params.id,
      title: text(req.body.title, "Draft title", 100),
      mime: req.body.mime,
      size: req.body.size,
      createdAt: now(),
      envelope: null,
    };
    await store.mutate((state) => {
      requireThat(
        state.projects.some(
          (project) =>
            project.id === req.params.id && project.ownerId === req.user.id,
        ),
        403,
        "Only the project owner can upload drafts.",
      );
      requireThat(
        state.assets.length < 300,
        409,
        "The MVP supports up to 300 drafts.",
      );
      state.assets.push(asset);
    });
    res.status(201).json({ asset: { ...asset, envelope: undefined } });
  });
  app.put("/api/assets/:id/content", async (req, res) => {
    onlyFields(req.body, ["envelope", "policyBase64"]);
    const state = store.read();
    const asset = findAsset(state, req.params.id);
    owner(state, req.user, asset);
    requireThat(
      config.mode === "demo" || req.user.canSign,
      403,
      "A Tide realm admin must approve the draft policy.",
    );
    requireThat(
      !asset.envelope,
      409,
      "Upload a new draft version instead of replacing an existing ciphertext.",
    );
    const envelope = validateEnvelope(req.body.envelope, config.mode);
    const policy = await validatePolicy(req.body.policyBase64, {
      mode: config.mode,
      assetId: asset.id,
      person: req.user,
      vendorId: config.adapter?.vendorId,
    });
    await store.mutate((next) => {
      const target = findAsset(next, asset.id);
      requireThat(!target.envelope, 409, "This draft already has content.");
      target.envelope = envelope;
      next.grants.push({
        assetId: asset.id,
        personId: req.user.id,
        ...policy,
        createdAt: now(),
      });
      audit(next, req.user, "Encrypted draft uploaded", asset.id);
    });
    res.json({ ok: true });
  });
  app.delete("/api/assets/:id", async (req, res) => {
    await store.mutate((state) => {
      const asset = findAsset(state, req.params.id);
      owner(state, req.user, asset);
      requireThat(
        !asset.envelope,
        409,
        "Only unfinished uploads can be discarded.",
      );
      state.assets = state.assets.filter((entry) => entry.id !== asset.id);
    });
    res.json({ ok: true });
  });
  app.get("/api/assets/:id/open", async (req, res) => {
    const { asset, grant } = await readable(req.user, req.params.id);
    requireThat(asset.envelope, 409, "This draft has not finished uploading.");
    await store.mutate((state) =>
      audit(state, req.user, "Encrypted draft retrieved", asset.id),
    );
    res.json({
      asset: { id: asset.id, title: asset.title, mime: asset.mime },
      envelope: asset.envelope,
      policyBase64: grant.policyBase64,
      expiresAt: grant.expiresAt,
    });
  });
  app.get("/api/assets/:id/grants", (req, res) => {
    const state = store.read();
    owner(state, req.user, findAsset(state, req.params.id));
    const people = config.mode === "demo" ? DEMO_PEOPLE : state.people;
    res.json({
      grants: state.grants
        .filter((grant) => grant.assetId === req.params.id)
        .map(({ personId, createdAt, expiresAt }) => ({
          personId,
          createdAt,
          expiresAt,
          name:
            people.find((person) => person.id === personId)?.name ||
            "Collaborator",
        })),
    });
  });
  app.post("/api/assets/:id/grants", async (req, res) => {
    onlyFields(req.body, ["personId", "policyBase64"]);
    const state = store.read();
    const asset = findAsset(state, req.params.id);
    owner(state, req.user, asset);
    requireThat(asset.envelope, 409, "Finish uploading this draft first.");
    requireThat(
      config.mode === "demo" || req.user.canSign,
      403,
      "A Tide realm admin must approve the signed invitation.",
    );
    const people = config.mode === "demo" ? DEMO_PEOPLE : state.people;
    const person = people.find(
      (entry) => entry.id === req.body.personId && entry.role !== "operator",
    );
    requireThat(
      person,
      400,
      "Choose a registered collaborator. They must sign in once first.",
    );
    const policy = await validatePolicy(req.body.policyBase64, {
      mode: config.mode,
      assetId: asset.id,
      person,
      vendorId: config.adapter?.vendorId,
    });
    await store.mutate((next) => {
      next.grants = next.grants.filter(
        (grant) =>
          !(grant.assetId === asset.id && grant.personId === person.id),
      );
      next.grants.push({
        assetId: asset.id,
        personId: person.id,
        ...policy,
        createdAt: now(),
      });
      audit(next, req.user, "Reviewer invited", asset.id);
    });
    res.status(201).json({ ok: true, expiresAt: policy.expiresAt });
  });
  app.delete("/api/assets/:id/grants/:personId", async (req, res) => {
    await store.mutate((state) => {
      owner(state, req.user, findAsset(state, req.params.id));
      requireThat(
        req.params.personId !== req.user.id,
        400,
        "You cannot remove your own invitation.",
      );
      state.grants = state.grants.filter(
        (grant) =>
          !(
            grant.assetId === req.params.id &&
            grant.personId === req.params.personId
          ),
      );
      audit(state, req.user, "Invitation removed", req.params.id);
    });
    res.json({
      ok: true,
      limitation:
        "API access ends now. A copied Tide policy may remain usable until its expiry; already-read plaintext cannot be withdrawn.",
    });
  });
  app.get("/api/assets/:id/comments", async (req, res) => {
    const { state } = await readable(req.user, req.params.id);
    res.json({
      comments: state.comments.filter(
        (comment) => comment.assetId === req.params.id,
      ),
    });
  });
  app.post("/api/assets/:id/comments", async (req, res) => {
    onlyFields(req.body, ["id", "envelope"]);
    await readable(req.user, req.params.id);
    requireThat(
      typeof req.body.id === "string" && /^[0-9a-f-]{36}$/i.test(req.body.id),
      400,
      "A comment ID is required.",
    );
    const envelope = validateEnvelope(req.body.envelope, config.mode);
    const comment = {
      id: req.body.id,
      assetId: req.params.id,
      authorId: req.user.id,
      authorName: req.user.name,
      createdAt: now(),
      envelope,
    };
    await store.mutate((state) => {
      requireThat(
        activeGrant(state, req.user, findAsset(state, req.params.id)),
        403,
        "Your invitation is no longer active.",
      );
      requireThat(
        !state.comments.some((entry) => entry.id === comment.id),
        409,
        "This comment was already submitted.",
      );
      requireThat(
        state.comments.length < 2000,
        409,
        "The MVP comment limit has been reached.",
      );
      state.comments.push(comment);
      audit(state, req.user, "Encrypted feedback added", req.params.id);
    });
    res.status(201).json({ comment });
  });
  app.get("/api/activity", (req, res) => {
    const state = store.read();
    const ownedProjects = state.projects
      .filter((project) => project.ownerId === req.user.id)
      .map((project) => project.id);
    const ownedAssets = state.assets
      .filter((asset) => ownedProjects.includes(asset.projectId))
      .map((asset) => asset.id);
    res.json({
      events: state.events
        .filter(
          (event) =>
            req.user.role === "operator" ||
            event.actorId === req.user.id ||
            ownedProjects.includes(event.resourceId) ||
            ownedAssets.includes(event.resourceId),
        )
        .slice(0, 100),
    });
  });
  app.get("/api/storage", (req, res) => {
    requireThat(
      req.user.role === "operator",
      403,
      "Storage inspection is reserved for the operator.",
    );
    const state = store.read();
    const records = [
      ...state.assets
        .filter((asset) => asset.envelope)
        .map((asset) => ({
          id: asset.id,
          kind: "draft",
          title: asset.title,
          envelope: asset.envelope,
        })),
      ...state.comments.map((comment) => ({
        id: comment.id,
        kind: "feedback",
        title: "Encrypted feedback",
        envelope: comment.envelope,
      })),
    ];
    res.json({
      records: records.map((record) => ({
        id: record.id,
        kind: record.kind,
        title: record.title,
        scheme: record.envelope.scheme,
        bytes: Buffer.from(record.envelope.ciphertext, "base64").length,
        sha256: createHash("sha256")
          .update(record.envelope.ciphertext)
          .digest("hex"),
        ciphertextPreview: record.envelope.ciphertext.slice(0, 512),
      })),
    });
  });
  app.get("/api/tide/admin-policy", async (req, res) => {
    requireThat(
      config.mode === "tide" && req.user.canSign,
      403,
      "This operation needs the creator’s Tide realm-admin session.",
    );
    const url = new URL(
      `${config.adapter["auth-server-url"].replace(/\/$/, "")}/admin/realms/${encodeURIComponent(config.adapter.realm)}/iga/role-policies/name/tide-realm-admin`,
    );
    const upstream = await fetch(url, {
      headers: { Authorization: req.headers.authorization },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    requireThat(
      upstream.ok,
      502,
      "Cannot load the signed Tide admin policy. Check realm enrollment and governance setup.",
    );
    const result = await upstream.json();
    requireThat(
      typeof result.policy === "string" && result.policy.length > 0,
      502,
      "The realm has no signed admin policy yet.",
    );
    res.json({ policyBase64: result.policy });
  });
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "API route not found.")),
  );
  app.use("/api", (error, _req, res, _next) => {
    const status =
      error.type === "entity.too.large"
        ? 413
        : error.type === "entity.parse.failed"
          ? 400
          : error.status || 500;
    if (status >= 500)
      console.error(
        `[CreatorRoom] API error (${status}); no request body or token logged.`,
      );
    res.status(status).json({
      error:
        status === 500
          ? "Something went wrong. Please try again."
          : error.message,
    });
  });
  return app;
}
