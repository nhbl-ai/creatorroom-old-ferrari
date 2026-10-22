import { randomBytes } from "node:crypto";
import { verifyTideCloakToken } from "@tidecloak/verify";
import { APP_ROLES } from "./config.js";
import { HttpError } from "./errors.js";

export const DEMO_PEOPLE = [
  {
    id: "demo-creator",
    name: "Alex Morgan",
    role: "creator",
    canSign: true,
    tideUserKey: "demo-only-creator",
  },
  {
    id: "demo-reviewer",
    name: "Jamie Chen",
    role: "reviewer",
    canSign: false,
    tideUserKey: "demo-only-reviewer",
  },
  {
    id: "demo-operator",
    name: "Platform operator",
    role: "operator",
    canSign: false,
    tideUserKey: "",
  },
];

export function createAuthenticator(config, verify = verifyTideCloakToken) {
  const sessions = new Map();
  const cookieName = "creatorroom_demo";
  function cookieToken(req) {
    return req.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
  }
  return {
    demoLogin(req, res, id) {
      if (config.mode !== "demo") throw new HttpError(404, "Not found.");
      const person = DEMO_PEOPLE.find((candidate) => candidate.id === id);
      if (!person)
        throw new HttpError(400, "Choose one of the listed demo identities.");
      sessions.delete(cookieToken(req));
      // Expire old entries rather than growing an unbounded local session map.
      for (const [key, session] of sessions)
        if (session.expires <= Date.now()) sessions.delete(key);
      const token = randomBytes(32).toString("hex");
      sessions.set(token, { person, expires: Date.now() + 8 * 60 * 60 * 1000 });
      res.cookie(cookieName, token, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 8 * 60 * 60 * 1000,
      });
      return person;
    },
    logout(req, res) {
      sessions.delete(cookieToken(req));
      res.clearCookie(cookieName, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
      });
    },
    async authenticate(req) {
      if (config.mode === "demo") {
        const session = sessions.get(cookieToken(req));
        if (!session || session.expires <= Date.now())
          throw new HttpError(401, "Choose a demo identity to continue.");
        return { ...session.person };
      }
      if (config.mode !== "tide")
        throw new HttpError(
          503,
          "Configure TideCloak or explicitly start npm run demo.",
        );
      const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || "");
      if (!match) throw new HttpError(401, "Sign in with TideCloak.");
      const payload = await verify(config.adapter, match[1]);
      if (
        !payload ||
        typeof payload.sub !== "string" ||
        !Number.isFinite(payload.exp) ||
        payload.exp * 1000 <= Date.now()
      ) {
        throw new HttpError(
          401,
          "The session is invalid or expired. Sign in again.",
        );
      }
      // This MVP supports ordinary bearer tokens, not sender-constrained DPoP.
      // A bound token must never be silently accepted as an unbound bearer.
      if (payload.cnf)
        throw new HttpError(
          401,
          "DPoP-bound tokens are not supported by this API. Use the documented bearer client configuration.",
        );
      const realmRoles = payload.realm_access?.roles || [];
      const governanceRoles =
        payload.resource_access?.["realm-management"]?.roles || [];
      const roles = new Set([
        ...realmRoles,
        ...(payload.resource_access?.[config.adapter.resource]?.roles || []),
      ]);
      // Keep the operator persona separate, even if misconfigured with app roles.
      const role = roles.has(APP_ROLES.operator)
        ? "operator"
        : roles.has(APP_ROLES.creator)
          ? "creator"
          : roles.has(APP_ROLES.reviewer)
            ? "reviewer"
            : null;
      if (!role)
        throw new HttpError(403, "Your account needs a CreatorRoom role.");
      return {
        id: payload.sub,
        name: String(
          payload.name || payload.preferred_username || "Collaborator",
        ).slice(0, 100),
        role,
        canSign:
          role === "creator" && governanceRoles.includes("tide-realm-admin"),
        tideUserKey:
          typeof payload.tideuserkey === "string" ? payload.tideuserkey : "",
      };
    },
  };
}
