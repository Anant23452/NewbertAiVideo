import { readFileSync } from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { hash } from "../projects/core.js";
export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
];
export function instagramConfig(
  origin: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  let key = env.INSTAGRAM_TOKEN_KEY || "";
  if (
    !key &&
    env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname)
  )
    try {
      key = readFileSync(".local/instagram-token.key", "utf8").trim();
    } catch {}
  const appId = env.INSTAGRAM_APP_ID || "",
    appSecret = env.INSTAGRAM_APP_SECRET || "",
    version = env.INSTAGRAM_API_VERSION || "";
  const redirect =
    env.INSTAGRAM_REDIRECT_URI || origin + "/api/v1/instagram/callback";
  let validRedirect = false;
  try {
    const u = new URL(redirect);
    validRedirect =
      u.origin === origin &&
      u.pathname === "/api/v1/instagram/callback" &&
      !u.search &&
      !u.hash &&
      !u.username &&
      !u.password &&
      (u.protocol === "https:" ||
        (env.NODE_ENV !== "production" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)));
  } catch {}
  const missing = [
    !/^\d{5,40}$/.test(appId) && "app_id",
    !appSecret && "app_secret",
    !/^v\d{2}\.0$/.test(version) && "api_version",
    !validRedirect && "redirect_uri",
    !/^[a-f0-9]{64}$/i.test(key) && "token_encryption_key",
  ].filter(Boolean) as string[];
  return {
    appId,
    appSecret,
    version,
    redirect,
    key,
    configured: missing.length === 0,
    missing,
    fingerprint: hash({
      appId,
      appSecret,
      version,
      redirect,
      keyId: hash(key),
    }),
  };
}
export type InstagramConfig = ReturnType<typeof instagramConfig>;
export function sealToken(token: string, key: string, context: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return {
    v: 1,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    ciphertext: encrypted.toString("base64"),
  };
}
export function openToken(envelope: any, key: string, context: string) {
  if (envelope?.v !== 1) throw Error("Invalid token envelope");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(envelope.iv, "hex"),
  );
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(envelope.tag, "hex"));
  return Buffer.concat([
    cipher.update(Buffer.from(envelope.ciphertext, "base64")),
    cipher.final(),
  ]).toString("utf8");
}
export const tokenContext = (
  workspace: string,
  connection: string,
  secret: string,
) => "newbert:instagram:v1:" + workspace + ":" + connection + ":" + secret;
