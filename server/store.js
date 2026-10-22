import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const emptyState = () => ({
  version: 1,
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
      if (
        state.version !== 1 ||
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
          await rename(temporary, filePath);
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
