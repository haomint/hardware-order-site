import { readFile, writeFile } from "node:fs/promises";
import {
  AdminSessionCookieName,
  AdminSessionRenewal,
  AdminWriteOriginSchema,
  ApiErrorSchema,
  apiErrors,
  stageA,
  stageAInfo,
} from "../../shared/index.ts";

function openApiSchema(schema, io) {
  const { $schema, ...definition } = schema.toJSONSchema({ io });
  return definition;
}

function parameters(schema, location) {
  if (!schema) return [];
  const { properties = {}, required = [] } = openApiSchema(schema, "input");
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    required: required.includes(name),
    description: property.description,
    schema: property,
  }));
}

function errorsFor(route) {
  const codes = new Set(route.errors);
  if (route.query || route.params || route.body) codes.add("INVALID_REQUEST");
  if (route.method !== "get") codes.add("INVALID_ORIGIN");
  if (route.admin) codes.add("UNAUTHENTICATED");
  codes.add("INTERNAL_ERROR");
  return [...codes].sort((first, second) => apiErrors[first].status - apiErrors[second].status);
}

function errorResponses(route) {
  const byStatus = Object.groupBy(errorsFor(route), (code) => apiErrors[code].status);
  return Object.fromEntries(Object.entries(byStatus).map(([status, codes]) => {
    const examples = Object.fromEntries(codes.map((code) => [
      code,
      { value: { code, message: apiErrors[code].message } },
    ]));
    return [status, {
      description: codes.map((code) => apiErrors[code].message).join(" "),
      content: {
        "application/json": {
          schema: {
            allOf: [
              { $ref: "#/components/schemas/ApiError" },
              { properties: { code: { enum: codes } } },
            ],
          },
          examples,
        },
      },
    }];
  }));
}

function successResponse(route) {
  const { status, schema } = route.success;
  const setCookie = route.success.setCookie ?? (route.admin ? AdminSessionRenewal : undefined);
  const response = { description: status === 204 ? "操作成功，无响应体。" : "操作成功。" };
  if (schema) response.content = { "application/json": { schema: openApiSchema(schema, "output") } };
  if (setCookie) {
    response.headers = { "Set-Cookie": { description: setCookie, schema: { type: "string" } } };
  }
  return response;
}

const paths = {};
const rows = [];
for (const [operationId, route] of Object.entries(stageA)) {
  const params = [
    ...parameters(route.params, "path"),
    ...parameters(route.query, "query"),
  ];
  if (route.method !== "get") {
    params.push({
      name: "Origin",
      in: "header",
      required: true,
      schema: openApiSchema(AdminWriteOriginSchema, "input"),
    });
  }

  const operation = {
    operationId,
    tags: [route.tag],
    summary: route.summary,
    description: route.description,
    security: route.admin ? [{ adminSession: [] }] : [],
    responses: {
      [route.success.status]: successResponse(route),
      ...errorResponses(route),
    },
  };
  if (params.length) operation.parameters = params;
  if (route.body) {
    operation.requestBody = {
      required: true,
      content: {
        [route.body.mediaType ?? "application/json"]: {
          schema: openApiSchema(route.body.schema, "input"),
        },
      },
    };
  }
  (paths[route.path] ??= {})[route.method] = operation;
  rows.push(`| ${route.method.toUpperCase()} \`${route.path}\` | ${route.summary} | ${route.admin ? "需要" : "无需"} | ${route.success.status} |`);
}

const spec = {
  openapi: "3.1.1",
  info: stageAInfo,
  paths,
  components: {
    securitySchemes: {
      adminSession: { type: "apiKey", in: "cookie", name: AdminSessionCookieName },
    },
    schemas: { ApiError: openApiSchema(ApiErrorSchema, "output") },
  },
};

const details = Object.values(stageA).filter((route) => route.description).map(
  (route) => `- **${route.summary}**　${route.description}`,
);

const overview = [
  "<!-- 由 server/scripts/generate-api.mjs 生成。 -->",
  `# ${stageAInfo.title}`,
  "",
  `版本 \`${stageAInfo.version}\` · [OpenAPI 完整定义](./stage-a.openapi.json)`,
  "",
  stageAInfo.description,
  "",
  "## 接口一览",
  "",
  "| 接口 | 用途 | 登录 | 成功状态 |",
  "| --- | --- | --- | --- |",
  ...rows,
  "",
  "## 行为约定",
  "",
  ...details,
  "",
  "## 错误码",
  "",
  "错误响应使用 `{ code, message }`。接口可能返回的错误码见 OpenAPI 中的对应响应。",
  "",
  "| HTTP 状态 | code | 提示示例 |",
  "| --- | --- | --- |",
  ...Object.entries(apiErrors).map(
    ([code, { status, message }]) => `| ${status} | \`${code}\` | ${message} |`,
  ),
  "",
].join("\n");

const check = process.argv.includes("--check");
const outputs = [
  ["stage-a.openapi.json", `${JSON.stringify(spec, null, 2)}\n`],
  ["stage-a.md", overview],
];

for (const [file, content] of outputs) {
  const target = new URL(`../../docs/api/${file}`, import.meta.url);
  if (check) {
    const existing = await readFile(target, "utf8");
    if (existing.replaceAll("\r\n", "\n") !== content) {
      console.error(`${file} 已过期，请运行 npm --prefix shared run docs。`);
      process.exitCode = 1;
    }
  } else {
    await writeFile(target, content, "utf8");
  }
}
