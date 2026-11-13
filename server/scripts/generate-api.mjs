import { readFile, writeFile } from "node:fs/promises";
import {
  AdminSessionCookieName,
  AdminSessionRenewal,
  AdminWriteOriginSchema,
  ApiErrorSchema,
  apiErrors,
  stageA,
  stageAInfo,
  stageB,
  stageBInfo,
  stageBErrors,
  StageBApiErrorSchema,
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

function needsOrigin(route) {
  return route.requireOrigin === true || (route.method !== "get" && route.path.startsWith("/api/admin/"));
}

function errorsFor(route, apiErrors) {
  const codes = new Set(route.errors);
  if (route.query || route.params || route.body || route.headers) codes.add("INVALID_REQUEST");
  if (needsOrigin(route)) codes.add("INVALID_ORIGIN");
  if (route.admin) codes.add("UNAUTHENTICATED");
  codes.add("INTERNAL_ERROR");
  return [...codes].sort((first, second) => apiErrors[first].status - apiErrors[second].status);
}

function errorResponses(route, apiErrors) {
  const byStatus = Object.groupBy(errorsFor(route, apiErrors), (code) => apiErrors[code].status);
  return Object.fromEntries(Object.entries(byStatus).map(([status, codes]) => {
    const examples = Object.fromEntries(codes.map((code) => [
      code,
      { value: { code, message: apiErrors[code].message, ...apiErrors[code].example } },
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

function successResponse(success, admin) {
  const { status, schema, mediaType = "application/json" } = success;
  const setCookie = success.setCookie ?? (admin ? AdminSessionRenewal : undefined);
  const response = { description: success.description ?? (status === 204 ? "操作成功，无响应体。" : "操作成功。") };
  if (schema) response.content = { [mediaType]: { schema: openApiSchema(schema, "output") } };
  const headers = Object.fromEntries(parameters(success.headers, "header").map(
    ({ name, in: location, ...header }) => [name, header],
  ));
  if (setCookie) {
    headers["Set-Cookie"] = { description: setCookie, schema: { type: "string" } };
  }
  if (Object.keys(headers).length) response.headers = headers;
  return response;
}

function generateStage(name, info, routes, apiErrors, errorSchema) {
  const paths = {};
  const rows = [];
  for (const [operationId, route] of Object.entries(routes)) {
    const params = [
      ...parameters(route.params, "path"),
      ...parameters(route.query, "query"),
      ...parameters(route.headers, "header"),
    ];
    if (needsOrigin(route)) {
      params.push({
        name: "Origin",
        in: "header",
        required: true,
        schema: openApiSchema(AdminWriteOriginSchema, "input"),
      });
    }

    const successes = [route.success, ...(route.additionalSuccess ?? [])];
    const operation = {
      operationId,
      tags: [route.tag],
      summary: route.summary,
      description: route.description,
      security: route.admin ? [{ adminSession: [] }] : [],
      responses: {
        ...Object.fromEntries(successes.map((success) => [success.status, successResponse(success, route.admin)])),
        ...errorResponses(route, apiErrors),
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
    rows.push(`| ${route.method.toUpperCase()} \`${route.path}\` | ${route.summary} | ${route.admin ? "需要" : "无需"} | ${successes.map(({ status }) => status).join(" / ")} |`);
  }

  const spec = {
    openapi: "3.1.1",
    info,
    paths,
    components: {
      securitySchemes: {
        adminSession: { type: "apiKey", in: "cookie", name: AdminSessionCookieName },
      },
      schemas: { ApiError: openApiSchema(errorSchema, "output") },
    },
  };

  const details = Object.values(routes).filter((route) => route.description).map(
    (route) => `- **${route.summary}**　${route.description}`,
  );

  const overview = [
    "<!-- 由 server/scripts/generate-api.mjs 生成。 -->",
    `# ${info.title}`,
    "",
    `版本 \`${info.version}\` · [OpenAPI 完整定义](./${name}.openapi.json)`,
    "",
    info.description,
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

  return [
    [`${name}.openapi.json`, `${JSON.stringify(spec, null, 2)}\n`],
    [`${name}.md`, overview],
  ];
}

const check = process.argv.includes("--check");
const outputs = [
  ...generateStage("stage-a", stageAInfo, stageA, apiErrors, ApiErrorSchema),
  ...generateStage("stage-b", stageBInfo, stageB, stageBErrors, StageBApiErrorSchema),
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
