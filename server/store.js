import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

async function replaceFile(temporary, target) {
  // Windows scanners can briefly hold an existing JSON file open. Keep atomic
  // replacement and retry only sharing/access errors; never unlink the target.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temporary, target);
      return;
    } catch (error) {
      if (process.platform !== "win32" || !["EPERM", "EBUSY", "EACCES"].includes(error.code) || attempt >= 5)
        throw error;
      await delay(15 * 2 ** attempt);
    }
  }
}

const emptyState = () => ({
  version: 2,
  profiles: [],
  invitations: [],
  approvals: [],
  people: [],
  projects: [],
  assets: [],
  grants: [],
  comments: [],
  events: [],
});

// One process, serialised mutations, atomic file replacement. This is a small
// hackathon store, not a database for multiple server instances.
export async function createStore(filePath) {
  let state = emptyState();
  if (filePath) {
    try {
      state = JSON.parse(await readFile(filePath, "utf8"));
      if (state.version === 1)
        state = { ...emptyState(), ...state, version: 2 };
      if (
        state.version !== 2 ||
        Object.keys(emptyState()).some((key) => !(key in state))
      ) {
        throw new Error("Unsupported CreatorRoom data file.");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  let queue = Promise.resolve();
  return {
    read() {
      return structuredClone(state);
    },
    mutate(fn) {
      const operation = queue.then(async () => {
        const next = structuredClone(state);
        const result = await fn(next);
        if (filePath) {
          await mkdir(dirname(filePath), { recursive: true });
          const temporary = `${filePath}.${randomUUID()}.tmp`;
          await writeFile(temporary, JSON.stringify(next, null, 2), {
            mode: 0o600,
          });
          try {
            await replaceFile(temporary, filePath);
          } catch (error) {
            await unlink(temporary).catch(() => {});
            throw error;
          }
        }
        state = next;
        return result;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}

export function audit(
  state,
  user,
  action,
  resourceId = null,
  decision = "allowed",
) {
  state.events.unshift({
    id: randomUUID(),
    actorId: user.id,
    actorName: user.name,
    action,
    resourceId,
    decision,
    at: new Date().toISOString(),
  });
  state.events = state.events.slice(0, 500);
}
