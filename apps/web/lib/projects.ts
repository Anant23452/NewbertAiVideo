import { api, ApiError } from "./api";
export type Brief = {
  topic: string;
  language: "Hindi" | "Hinglish";
  audience: "school" | "college" | "curious";
  mode: "guided" | "automatic";
  targetSeconds?: number;
};
export type Content = {
  schemaVersion: 1;
  brief: Brief;
  voice: null | { catalogVoiceId: string; providerConnectionId: string | null };
  style: { preset: "standard" | "black_glow" | "dark_light"; accentColor?: string };
  scenes: unknown[];
  pronunciationOverrides: unknown[];
  captionOverrides: unknown[];
};
export type Project = {
  id: string;
  title: string;
  status: "active" | "archived";
  revision: number;
  createdAt: string;
  updatedAt: string;
  latestOutputArtifactId: string | null;
};
export type Draft = {
  projectId: string;
  revision: number;
  content: Content;
  updatedAt: string;
};
export type Version = {
  id: string;
  number: number;
  sourceDraftRevision: number;
  content: Content;
  inputHash: string;
  createdAt: string;
};
export type Job = {
  id: string;
  revision: number;
  projectId: string;
  versionId: string;
  state: "queued" | "running" | "paused" | "succeeded" | "failed" | "cancelled";
  pauseReason: string | null;
  cancelRequestedAt: string | null;
  error: { code: string; detail: string } | null;
};
export type Page<T> = { items: T[]; nextCursor: string | null };
export type Usage = {
  allowanceTimezone: "UTC";
  platformCapacity: string;
  resources: {
    resource: string;
    limit: number;
    used: number;
    reserved: number;
    remaining: number;
    resetsAt: string | null;
  }[];
};
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
export const projectTag = (p: Project) => `"project:${p.id}:${p.revision}"`;
export const draftTag = (d: Draft) => `"draft:${d.projectId}:${d.revision}"`;
export const jobTag = (j: Job) => `"job:${j.id}:${j.revision}"`;
// Keep an uncertain command's key through reload, without storing its content.
// A confirmed response clears it so a later intentional action is a new command.
export async function mutate<T>(
  path: string,
  body: unknown,
  csrf: string,
  etag?: string,
  method = "POST",
) {
  const fingerprint = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify({ path, body, etag, method })),
      ),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const storage = "newbert-command:" + fingerprint;
  const key = sessionStorage.getItem(storage) || crypto.randomUUID();
  sessionStorage.setItem(storage, key);
  try {
    const data = await api<T>(
      path,
      body,
      {
        "X-CSRF-Token": csrf,
        "Idempotency-Key": key,
        ...(etag ? { "If-Match": etag } : {}),
      },
      method,
    );
    sessionStorage.removeItem(storage);
    return data;
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500)
      sessionStorage.removeItem(storage);
    throw e;
  }
}
