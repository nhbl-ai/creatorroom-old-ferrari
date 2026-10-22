import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("creator uploads encrypted drafts, reviewer leaves encrypted feedback, operator is denied", async ({
  page,
}) => {
  const clientErrors = [];
  const outboundWrites = [];
  page.on("pageerror", (error) => clientErrors.push(error.message));
  page.on("request", (request) => {
    if (
      /\/api\/assets\/[^/]+\/(content|comments)$/.test(request.url()) &&
      ["PUT", "POST"].includes(request.method())
    ) {
      outboundWrites.push(request.postDataJSON());
    }
  });
  await page.goto("/");
  if (await page.getByRole("button", { name: /Alex Morgan/ }).isVisible()) {
    await page.getByRole("button", { name: /Alex Morgan/ }).click();
  } else {
    await page.getByLabel("Demo identity").selectOption("demo-creator");
  }
  await expect(
    page.getByRole("heading", { name: "Your creative workspace." }),
  ).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Load sample workspace" })
      .isVisible()
  ) {
    await page.getByRole("button", { name: "Load sample workspace" }).click();
  }
  await expect(
    page.getByRole("heading", { name: "After Hours", exact: true }).first(),
  ).toBeVisible();
  await mkdir(".cache/screenshots", { recursive: true });
  await page.screenshot({
    path: ".cache/screenshots/creator-workspace.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open Poster exploration — v01", exact: true })
    .first()
    .click();
  await expect(
    page.getByAltText("Private draft: Poster exploration — v01"),
  ).toBeVisible();
  await page.getByRole("button", { name: "People & access" }).click();
  await page
    .getByLabel("Reviewer", { exact: true })
    .selectOption("demo-reviewer");
  await page
    .getByRole("button", { name: "Invite reviewer", exact: true })
    .click();
  await expect(
    page.getByText("Invitation ready for Jamie Chen."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  const workspace = await (await page.request.get("/api/projects")).json();
  const assetA = workspace.projects.find(
    (project) => project.title === "After Hours",
  ).assets[0];
  const assetB = workspace.projects.find(
    (project) => project.title === "Quiet Forms",
  ).assets[0];

  await page.getByLabel("Demo identity").selectOption("demo-reviewer");
  await expect(
    page
      .getByRole("button", {
        name: "Open Poster exploration — v01",
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open Poster exploration — v01", exact: true })
    .first()
    .click();
  await expect(
    page.getByAltText("Private draft: Poster exploration — v01"),
  ).toBeVisible();
  const feedback = `The title spacing feels great. Browser check ${Date.now()}.`;
  await page.getByLabel("Your feedback").fill(feedback);
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText(feedback, { exact: true })).toBeVisible();
  await page.screenshot({
    path: ".cache/screenshots/reviewer-room.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Open Brand study — v01", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Access denied" }),
  ).toBeVisible();
  expect(
    (await page.request.get(`/api/assets/${assetB.id}/open`)).status(),
  ).toBe(403);
  await page.getByRole("button", { name: "Close dialog" }).click();

  await page.getByLabel("Demo identity").selectOption("demo-operator");
  await expect(
    page.getByRole("heading", { name: "Behind the curtain" }),
  ).toBeVisible();
  expect(
    (await page.request.get(`/api/assets/${assetA.id}/open`)).status(),
  ).toBe(403);
  const storage = await (await page.request.get("/api/storage")).json();
  expect(storage.records.length).toBeGreaterThanOrEqual(3);
  expect(JSON.stringify(storage)).not.toContain(feedback);
  for (const body of outboundWrites) {
    expect(body.envelope.ciphertext).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain(feedback);
    expect(body.envelope.key).toBeUndefined();
  }
  await page
    .getByRole("button", { name: "Inspect", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Inspect stored ciphertext" }),
  ).toBeVisible();
  await page.screenshot({
    path: ".cache/screenshots/operator-inspector.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close dialog" }).click();

  await page.getByLabel("Demo identity").selectOption("demo-creator");
  await page
    .getByRole("button", { name: "Open Poster exploration — v01", exact: true })
    .first()
    .click();
  await expect(page.getByText(feedback, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "People & access" }).click();
  await page
    .getByRole("button", { name: "Remove Jamie Chen", exact: true })
    .click();
  await expect(
    page.getByText("API access ends now.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Demo identity").selectOption("demo-reviewer");
  expect(
    (await page.request.get(`/api/assets/${assetA.id}/open`)).status(),
  ).toBe(403);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Your creative workspace." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".cache/screenshots/mobile-workspace.png",
    fullPage: true,
  });
  expect(clientErrors).toEqual([]);
});

test("project and upload forms encrypt a custom text draft before sending it", async ({
  page,
}) => {
  const secret = `Unreleased text draft ${Date.now()}`;
  const title = `Script treatment ${Date.now()}`;
  const projectName = `Film concept ${Date.now()}`;
  let uploadBody;
  page.on("request", (request) => {
    if (
      /\/api\/assets\/[^/]+\/content$/.test(request.url()) &&
      request.method() === "PUT"
    )
      uploadBody = request.postDataJSON();
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Alex Morgan/ }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByRole("textbox", { name: "Project name" }).fill(projectName);
  await page
    .getByRole("textbox", { name: "A little context" })
    .fill("A new short film, still in progress.");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: projectName, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Upload draft", exact: true }).click();
  await page
    .getByLabel("Project", { exact: true })
    .selectOption({ label: projectName });
  await page.getByRole("textbox", { name: "Draft title" }).fill(title);
  await page.getByLabel("Draft file").setInputFiles({
    name: "treatment.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(secret),
  });
  await page
    .getByRole("button", { name: "Encrypt & upload", exact: true })
    .click();
  await expect(
    page.getByText(
      "Draft encrypted and uploaded. Open it to invite a reviewer.",
    ),
  ).toBeVisible();
  expect(uploadBody.envelope.scheme).toBe("local-demo-v1");
  expect(JSON.stringify(uploadBody)).not.toContain(secret);
  expect(JSON.stringify(uploadBody)).not.toContain(
    Buffer.from(secret).toString("base64"),
  );
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(page.getByText(secret, { exact: true })).toBeVisible();
});

test("members edit profiles, open projects and accept one-use review invitations through approval", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const suffix = Date.now(),
    name = `Owner ${suffix}`,
    title = `Private treatment ${suffix}`,
    project = `Project room ${suffix}`;
  await page.goto("/");
  await page.getByRole("button", { name: /Alex Morgan/ }).click();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Save display name", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Welcome to CreatorRoom" }),
  ).toHaveCount(0);
  expect((await (await page.request.get("/api/me")).json()).user.name).toBe(
    name,
  );
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill(project);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/project\//);
  const projectUrl = page.url();
  await expect(
    page.getByRole("button", { name: "Upload first draft", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await page.getByLabel("Edit project name").fill(project + " revised");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: project + " revised", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Upload draft", exact: true }).click();
  await page.getByLabel("Draft title", { exact: true }).fill(title);
  await page
    .getByLabel("Draft file")
    .setInputFiles({
      name: "private.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("An original unreleased script, kept private."),
    });
  await page
    .getByRole("button", { name: "Encrypt & upload", exact: true })
    .click();
  await expect(
    page.getByText(
      "Draft encrypted and uploaded. Open it to invite a reviewer.",
    ),
  ).toBeVisible();
  await page.getByLabel(`Select ${title} for invitation`).check();
  await page.getByRole("button", { name: /Create invitation link/ }).click();
  const inviteInput = page.getByLabel("Invitation link", { exact: true });
  await expect(inviteInput).toBeVisible();
  const inviteUrl = await inviteInput.inputValue();
  await page
    .getByRole("button", { name: "Back to projects", exact: false })
    .click();
  await page
    .getByRole("button", {
      name: `Open project ${project} revised`,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(projectUrl);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: project + " revised", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Demo identity").selectOption("demo-reviewer");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill(`Reviewer's own project ${suffix}`);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `Reviewer's own project ${suffix}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(inviteUrl);
  await page
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("owner will confirm");
  await page
    .getByRole("button", { name: "Go to my workspace", exact: true })
    .click();
  await page.getByLabel("Demo identity").selectOption("demo-creator");
  await page.goto(projectUrl);
  await page
    .getByRole("button", { name: "Confirm Jamie Chen", exact: true })
    .click();
  await expect(
    page.getByText("Waiting for approver", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approvals", exact: true }).click();
  const row = page.locator(".approval-row").filter({ hasText: title });
  await row
    .getByRole("button", { name: "Approve access", exact: true })
    .click();
  await expect(row.getByText("Approved", { exact: true })).toBeVisible();
  await page.getByLabel("Demo identity").selectOption("demo-reviewer");
  await page.goto(inviteUrl);
  await page
    .getByRole("button", { name: "Open shared project", exact: true })
    .click({ timeout: 15000 });
  await expect(
    page.getByRole("button", { name: "Edit project", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(
    page.getByText("An original unreleased script, kept private.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".cache/screenshots/project-room.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
