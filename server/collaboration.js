import { randomBytes, randomUUID, createHash } from "node:crypto";
import { requireThat, text, onlyFields } from "./errors.js";
import { audit } from "./store.js";
import { validatePolicy } from "./policies.js";

const now = () => new Date().toISOString();
const digest = (token) => createHash("sha256").update(token).digest("hex");
const member = (user) =>
  requireThat(
    user.role !== "operator",
    403,
    "Operators cannot create projects or accept review invitations.",
  );
const byToken = (state, token) =>
  state.invitations.find((i) => i.tokenHash === digest(token));
const ownerProject = (state, id, user) => {
  const project = state.projects.find((p) => p.id === id);
  requireThat(project, 404, "Project not found.");
  requireThat(
    project.ownerId === user.id,
    403,
    "Only the project owner can do this.",
  );
  return project;
};
function invitationSummary(state, invitation) {
  const project = state.projects.find((p) => p.id === invitation.projectId);
  return {
    id: invitation.id,
    projectId: invitation.projectId,
    projectTitle: project?.title || "Project",
    ownerId: invitation.ownerId,
    ownerName:
      state.people.find((p) => p.id === invitation.ownerId)?.name || "Creator",
    assetIds: invitation.assetIds,
    titles: invitation.assetIds.map(
      (id) => state.assets.find((a) => a.id === id)?.title || "Draft",
    ),
    status:
      ["open", "claimed"].includes(invitation.status) && Date.parse(invitation.expiresAt) <= Date.now()
        ? "expired"
        : invitation.status,
    expiresAt: invitation.expiresAt,
    recipientId: invitation.recipientId || null,
    recipientName:
      state.people.find((p) => p.id === invitation.recipientId)?.name || null,
  };
}
export function installPublicInvitations(app, { store }) {
  app.get("/api/invitations/token/:token", (req, res) => {
    requireThat(
      /^[A-Za-z0-9_-]{43}$/.test(req.params.token),
      404,
      "Invitation not found.",
    );
    const state = store.read();
    const invite = byToken(state, req.params.token);
    requireThat(invite, 404, "Invitation not found.");
    const expired = Date.parse(invite.expiresAt) <= Date.now();
    res.json({
      invitation: {
        ...invitationSummary(state, invite),
        status: expired && invite.status === "open" ? "expired" : invite.status,
        recipientId: undefined,
        recipientName: undefined,
        assetIds: undefined,
      },
    });
  });
}
export function installCollaboration(app, { config, store }) {
  function approvalSummary(state, row) {
    return {
      ...row,
      policyBase64: undefined,
      recipientKey: undefined,
      assetTitle:
        state.assets.find((a) => a.id === row.assetId)?.title || "Draft",
      requesterName:
        state.people.find((p) => p.id === row.requesterId)?.name || "Creator",
      recipient: state.people.find((p) => p.id === row.personId) || null,
    };
  }
  function enqueue(
    state,
    assetId,
    personId,
    requesterId,
    hours,
    invitationId = null,
  ) {
    const prior = state.approvals.find(
      (a) =>
        a.assetId === assetId &&
        a.personId === personId &&
        a.status === "pending" &&
        a.invitationId === invitationId &&
        Date.parse(a.expiresAt) > Date.now(),
    );
    if (prior) return prior;
    const person = state.people.find((p) => p.id === personId);
    requireThat(
      person && person.role !== "operator",
      400,
      "The recipient must sign in first.",
    );
    requireThat(
      config.mode === "demo" || person.tideUserKey,
      409,
      "The recipient's Tide identity is not linked yet. Sign in again after enrollment.",
    );
    requireThat(
      state.approvals.length < 2000,
      409,
      "Approval history limit reached.",
    );
    const row = {
      id: randomUUID(),
      assetId,
      personId,
      requesterId,
      hours,
      invitationId,
      recipientKey: person.tideUserKey,
      status: "pending",
      createdAt: now(),
      expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
    };
    state.approvals.push(row);
    audit(
      state,
      {
        id: requesterId,
        name: state.people.find((p) => p.id === requesterId)?.name || "Creator",
      },
      "Approval requested",
      assetId,
    );
    return row;
  }
  app.patch("/api/profile", async (req, res) => {
    onlyFields(req.body, ["displayName"]);
    const name = text(req.body.displayName, "Display name", 80);
    requireThat(
      !/[\u0000-\u001f\u007f]/.test(name),
      400,
      "Use a display name without control characters.",
    );
    await store.mutate((state) => {
      state.profiles = state.profiles.filter((p) => p.id !== req.user.id);
      state.profiles.push({ id: req.user.id, displayName: name });
      const person = state.people.find((p) => p.id === req.user.id);
      if (person) person.name = name;
    });
    res.json({ user: { ...req.user, name, hasDisplayName: true } });
  });
  app.patch("/api/projects/:id", async (req, res) => {
    onlyFields(req.body, ["title", "description", "color"]);
    await store.mutate((state) => {
      const p = ownerProject(state, req.params.id, req.user);
      p.title = text(req.body.title, "Project title", 80);
      p.description =
        typeof req.body.description === "string"
          ? req.body.description.trim().slice(0, 200)
          : "";
      if (["lavender", "peach", "mint", "blue"].includes(req.body.color))
        p.color = req.body.color;
      audit(state, req.user, "Project updated", p.id);
    });
    res.json({ ok: true });
  });
  app.post("/api/assets/:id/policy-requests", async (req, res) => {
    member(req.user);
    onlyFields(req.body, ["personId", "hours"]);
    const row = await store.mutate((state) => {
      const asset = state.assets.find((a) => a.id === req.params.id);
      requireThat(asset, 404, "Draft not found.");
      ownerProject(state, asset.projectId, req.user);
      const personId = req.body.personId || req.user.id;
      requireThat(
        personId === req.user.id || asset.envelope,
        409,
        "Upload the draft before inviting others.",
      );
      const hours = Number(req.body.hours || 24);
      requireThat([1, 24].includes(hours), 400, "Choose 1 or 24 hours.");
      return enqueue(state, asset.id, personId, req.user.id, hours);
    });
    res.status(201).json({ approval: approvalSummary(store.read(), row) });
  });
  app.get("/api/assets/:id/upload-policy", (req, res) => {
    const state = store.read();
    const asset = state.assets.find((a) => a.id === req.params.id);
    requireThat(asset, 404, "Draft not found.");
    ownerProject(state, asset.projectId, req.user);
    const grant = state.grants.find(
      (g) =>
        g.assetId === asset.id &&
        g.personId === req.user.id &&
        (!g.expiresAt || Date.parse(g.expiresAt) > Date.now()),
    );
    res.json({
      status: grant ? "approved" : "pending",
      policyBase64: grant?.policyBase64 ?? null,
    });
  });
  app.get("/api/approvals", (req, res) => {
    const state = store.read();
    res.json({
      approvals: state.approvals
        .filter(
          (a) =>
            req.user.canSign ||
            a.requesterId === req.user.id ||
            a.personId === req.user.id,
        )
        .slice(-200)
        .reverse()
        .map((a) => approvalSummary(state, a)),
    });
  });
  app.post("/api/approvals/:id/approve", async (req, res) => {
    requireThat(
      req.user.canSign,
      403,
      "Only a Tide approver can approve access.",
    );
    onlyFields(req.body, ["policyBase64"]);
    const state = store.read();
    const row = state.approvals.find((a) => a.id === req.params.id);
    requireThat(
      row && row.status === "pending",
      409,
      "This request is no longer pending.",
    );
    requireThat(
      Date.parse(row.expiresAt) > Date.now(),
      409,
      "Request expired. The owner must submit a new request.",
    );
    const person = state.people.find((p) => p.id === row.personId);
    requireThat(
      person?.tideUserKey === row.recipientKey,
      409,
      "Recipient identity changed; request access again.",
    );
    const policy = await validatePolicy(req.body.policyBase64, {
      mode: config.mode,
      assetId: row.assetId,
      person,
      vendorId: config.adapter?.vendorId,
    });
    requireThat(
      !policy.expiresAt || Date.parse(policy.expiresAt) <= Date.now() + row.hours * 3600000 + 60000,
      400,
      "Policy lifetime exceeds the requested access duration.",
    );
    await store.mutate((next) => {
      const currentPerson = next.people.find((p) => p.id === row.personId);
      requireThat(
        currentPerson && currentPerson.role !== "operator" && currentPerson.tideUserKey === row.recipientKey,
        409,
        "Recipient identity changed; request access again.",
      );
      const request = next.approvals.find((a) => a.id === row.id);
      requireThat(
        request?.status === "pending",
        409,
        "Request is no longer pending.",
      );
      const asset = next.assets.find((a) => a.id === row.assetId);
      requireThat(asset, 409, "Draft no longer exists.");
      const project = next.projects.find((p) => p.id === asset.projectId);
      requireThat(
        project?.ownerId === row.requesterId,
        409,
        "Project owner changed.",
      );
      requireThat(
        Date.parse(request.expiresAt) > Date.now(),
        409,
        "Request expired.",
      );
      if (row.invitationId) {
        const i = next.invitations.find((i) => i.id === row.invitationId);
        requireThat(
          i?.status === "pending-approval",
          409,
          "Invitation was cancelled.",
        );
      }
      next.grants = next.grants.filter(
        (g) => !(g.assetId === row.assetId && g.personId === row.personId),
      );
      next.grants.push({
        assetId: row.assetId,
        personId: row.personId,
        invitationId: row.invitationId,
        ...policy,
        createdAt: now(),
      });
      request.status = "approved";
      request.approvedBy = req.user.id;
      request.approvedAt = now();
      if (
        row.invitationId &&
        next.approvals
          .filter((a) => a.invitationId === row.invitationId)
          .every((a) => a.status === "approved")
      ) {
        next.invitations.find((i) => i.id === row.invitationId).status =
          "granted";
      }
      audit(next, req.user, "Access approved", row.assetId);
    });
    res.json({ ok: true });
  });
  app.post("/api/approvals/:id/reject", async (req, res) => {
    requireThat(
      req.user.canSign,
      403,
      "Only an approver can reject a request.",
    );
    onlyFields(req.body, []);
    await store.mutate((state) => {
      const row = state.approvals.find((a) => a.id === req.params.id);
      requireThat(
        row?.status === "pending",
        409,
        "Request is no longer pending.",
      );
      row.status = "rejected";
      if (row.invitationId) {
        const invitation = state.invitations.find((i) => i.id === row.invitationId);
        if (invitation) invitation.status = "rejected";
        for (const other of state.approvals.filter(
          (a) => a.invitationId === row.invitationId && a.status === "pending",
        )) other.status = "cancelled";
        state.grants = state.grants.filter((g) => g.invitationId !== row.invitationId);
      }
      audit(state, req.user, "Access request rejected", row.assetId);
    });
    res.json({ ok: true });
  });
  app.post("/api/projects/:id/invitations", async (req, res) => {
    member(req.user);
    onlyFields(req.body, ["assetIds"]);
    const token = randomBytes(32).toString("base64url");
    const row = await store.mutate((state) => {
      ownerProject(state, req.params.id, req.user);
      const ids = req.body.assetIds;
      requireThat(
        Array.isArray(ids) &&
          ids.length > 0 &&
          ids.length <= 10 &&
          new Set(ids).size === ids.length,
        400,
        "Choose between 1 and 10 different drafts.",
      );
      requireThat(
        ids.every((id) =>
          state.assets.some(
            (a) => a.id === id && a.projectId === req.params.id && a.envelope,
          ),
        ),
        400,
        "Only finished drafts in this project can be shared.",
      );
      requireThat(
        state.invitations.length < 1000,
        409,
        "Invitation limit reached.",
      );
      const invitation = {
        id: randomUUID(),
        tokenHash: digest(token),
        ownerId: req.user.id,
        projectId: req.params.id,
        assetIds: ids,
        status: "open",
        createdAt: now(),
        expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
      };
      state.invitations.push(invitation);
      audit(state, req.user, "Invitation link created", req.params.id);
      return invitation;
    });
    res.status(201).json({
      invitation: invitationSummary(store.read(), row),
      url: `${config.origin}/#/invite/${token}`,
    });
  });
  app.get("/api/invitations", (req, res) => {
    const state = store.read();
    res.json({
      invitations: state.invitations
        .filter(
          (i) => i.ownerId === req.user.id || i.recipientId === req.user.id,
        )
        .map((i) => invitationSummary(state, i)),
    });
  });
  app.post("/api/invitations/token/:token/accept", async (req, res) => {
    member(req.user);
    onlyFields(req.body, []);
    requireThat(
      /^[A-Za-z0-9_-]{43}$/.test(req.params.token),
      404,
      "Invitation not found.",
    );
    const row = await store.mutate((state) => {
      const i = byToken(state, req.params.token);
      requireThat(i, 404, "Invitation not found.");
      requireThat(
        i.ownerId !== req.user.id,
        400,
        "Share this link with another person; owners already control their drafts.",
      );
      if (
        i.recipientId === req.user.id &&
        ["claimed", "pending-approval", "granted"].includes(i.status)
      )
        return i;
      requireThat(
        i.status === "open",
        409,
        "This invitation has already been used or cancelled.",
      );
      requireThat(
        Date.parse(i.expiresAt) > Date.now(),
        410,
        "This invitation has expired.",
      );
      i.recipientId = req.user.id;
      i.claimedAt = now();
      i.status = "claimed";
      audit(
        state,
        req.user,
        "Invitation accepted; awaiting owner confirmation",
        i.projectId,
      );
      return i;
    });
    res.json({ invitation: invitationSummary(store.read(), row) });
  });
  app.post("/api/invitations/:id/confirm", async (req, res) => {
    onlyFields(req.body, []);
    await store.mutate((state) => {
      const i = state.invitations.find((i) => i.id === req.params.id);
      requireThat(
        i?.ownerId === req.user.id,
        403,
        "Only the owner can confirm the recipient.",
      );
      requireThat(
        i.status === "claimed",
        409,
        "This invitation is not waiting for confirmation.",
      );
      requireThat(
        Date.parse(i.expiresAt) > Date.now(),
        410,
        "Invitation expired; create a new link.",
      );
      for (const assetId of i.assetIds)
        enqueue(state, assetId, i.recipientId, req.user.id, 24, i.id);
      i.status = "pending-approval";
      audit(state, req.user, "Recipient confirmed", i.projectId);
    });
    res.json({ ok: true });
  });
  app.delete("/api/invitations/:id", async (req, res) => {
    onlyFields(req.body, []);
    await store.mutate((state) => {
      const i = state.invitations.find((i) => i.id === req.params.id);
      requireThat(
        i?.ownerId === req.user.id,
        403,
        "Only the owner can cancel this invitation.",
      );
      i.status = "cancelled";
      for (const a of state.approvals.filter(
        (a) => a.invitationId === i.id && a.status === "pending",
      ))
        a.status = "cancelled";
      state.grants = state.grants.filter((g) => g.invitationId !== i.id);
      audit(state, req.user, "Invitation cancelled", i.projectId);
    });
    res.json({
      ok: true,
      limitation:
        "Future API access is blocked. A copied policy can work until expiry; already-read content cannot be withdrawn.",
    });
  });
}
