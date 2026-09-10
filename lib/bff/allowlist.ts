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
  { methods: ["GET"], path: /^creators(?:\/[^/]+)?$/, capability: DAILY },
  { methods: ["GET"], path: /^users(?:\/[^/]+)?$/, capability: DAILY },
  { methods: ["GET"], path: /^users\/[^/]+\/wallet$/, capability: DAILY },
  { methods: ["PATCH"], path: /^users\/[^/]+\/membership$/, capability: "membership.manage" },
  { methods: ["PATCH"], path: /^characters\/[^/]+\/rating$/, capability: DAILY },
  // 测试期人工充值：Operator 与 Admin 均可操作，后端负责幂等、账户边界与原子审计。
  { methods: ["POST"], path: /^users\/[^/]+\/wallet\/grants$/, capability: DAILY },
  { methods: ["GET"], path: /^moderation\/backlog$/, capability: DAILY },
  { methods: ["GET"], path: /^moderation\/reviews(?:\/[^/]+)?$/, capability: DAILY },
  // 三处置与认领都只要 operations.access：purge 不额外限制 admin，是已拍板的产品决定。
  { methods: ["POST"], path: /^moderation\/reviews\/[^/]+\/(?:claim|decision)$/, capability: DAILY },
  // 角色批量导入。复用 operations.access：与复核三处置同一道闸门，是已拍板的产品决定。
  { methods: ["GET"], path: /^imports(?:\/[^/]+)?$/, capability: DAILY },
  { methods: ["GET"], path: /^imports\/characters\/schema$/, capability: DAILY },
  { methods: ["POST"], path: /^imports\/characters(?:\/preflight)?$/, capability: DAILY },
  { methods: ["POST"], path: /^imports\/media\/uploads$/, capability: DAILY },
  { methods: ["POST"], path: /^imports\/media\/uploads\/[^/]+\/complete$/, capability: DAILY },
  { methods: ["POST"], path: /^imports\/media\/image-sets$/, capability: DAILY },
  { methods: ["GET"], path: /^imports\/media\/image-sets\/[^/]+$/, capability: DAILY },
  // 角色工厂。候选、草稿、修改预览和测试对话均复用日常运营权限。
  { methods: ["POST"], path: /^character-factory\/runs$/, capability: DAILY },
  { methods: ["GET"], path: /^character-factory\/runs\/[^/]+$/, capability: DAILY },
  { methods: ["GET"], path: /^character-factory\/runs\/[^/]+\/costs$/, capability: DAILY },
  { methods: ["POST"], path: /^character-factory\/runs\/[^/]+\/(?:start|generate|preflight|submit)$/, capability: DAILY },
  { methods: ["PATCH"], path: /^character-factory\/runs\/[^/]+\/candidates\/[^/]+$/, capability: DAILY },
  { methods: ["GET", "PATCH"], path: /^character-factory\/candidates\/[^/]+\/draft$/, capability: DAILY },
  { methods: ["GET"], path: /^character-factory\/candidates\/[^/]+\/draft\/portrait$/, capability: DAILY },
  { methods: ["POST"], path: /^character-factory\/candidates\/[^/]+\/(?:agent-revisions|preview-turns)$/, capability: DAILY },
  { methods: ["GET"], path: /^character-factory\/candidates\/[^/]+\/agent-revisions\/[^/]+\/preview-image\/(?:before|after)$/, capability: DAILY },
  { methods: ["POST"], path: /^character-factory\/candidates\/[^/]+\/agent-revisions\/[^/]+\/apply$/, capability: DAILY },
  { methods: ["POST"], path: /^character-factory\/tasks\/[^/]+\/retry$/, capability: DAILY },
  // 操作审计只给 admin：审计里有操作者、资源 id 与操作原因，是「谁动过什么」的完整账本。
  { methods: ["GET"], path: /^audit-events$/, capability: "audit.read" },
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
