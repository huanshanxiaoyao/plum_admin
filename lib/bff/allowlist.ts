import type { Capability } from "../auth/capabilities.ts";

type AllowRule = {
  methods: readonly string[];
  path: RegExp;
  capability: Capability;
};

const DAILY = "operations.access" satisfies Capability;
const UNSAFE_PATH_CHARACTERS = /[\\/\\\\\u0000-\u001f\u007f]/;

const RULES: readonly AllowRule[] = [
  { methods: ["GET"], path: /^overview$/, capability: DAILY },
  { methods: ["GET"], path: /^characters(?:\/[^/]+(?:\/versions)?)?$/, capability: DAILY },
  { methods: ["GET"], path: /^works(?:\/[^/]+)?$/, capability: DAILY },
  { methods: ["POST"], path: /^official\/media\/uploads$/, capability: DAILY },
  { methods: ["POST"], path: /^official\/works$/, capability: DAILY },
  { methods: ["PATCH"], path: /^official\/works\/[^/]+$/, capability: DAILY },
  { methods: ["POST"], path: /^official\/works\/[^/]+\/submit$/, capability: DAILY },
  { methods: ["POST"], path: /^characters\/[^/]+\/takedown$/, capability: DAILY },
  { methods: ["POST"], path: /^characters\/[^/]+\/restore$/, capability: "character.restore" },
  { methods: ["GET"], path: /^creators(?:\/[^/]+)?$/, capability: DAILY },
  { methods: ["PATCH"], path: /^creators\/[^/]+\/control$/, capability: DAILY },
  { methods: ["GET"], path: /^users(?:\/[^/]+)?$/, capability: DAILY },
  {
    methods: ["POST"],
    path: /^users\/[^/]+\/membership\/(?:disable|enable)$/,
    capability: "membership.manage",
  },
  { methods: ["GET"], path: /^subscriptions$/, capability: DAILY },
  { methods: ["GET"], path: /^audit-events$/, capability: DAILY },
  { methods: ["GET"], path: /^admin-users$/, capability: "staff.manage" },
  { methods: ["PATCH"], path: /^admin-users\/[^/]+$/, capability: "staff.manage" },
];

export function requiredCapability(method: string, path: string): Capability | null {
  const normalizedPath = path.replace(/^\/+|\/+$/g, "");
  return (
    RULES.find((rule) => rule.methods.includes(method.toUpperCase()) && rule.path.test(normalizedPath))
      ?.capability ?? null
  );
}

export function encodeBackendPath(segments: readonly string[]): string | null {
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        UNSAFE_PATH_CHARACTERS.test(segment),
    )
  ) {
    return null;
  }

  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}
