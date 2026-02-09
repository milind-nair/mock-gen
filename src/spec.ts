import SwaggerParser from '@apidevtools/swagger-parser';

export type OpenApiDocument = any;

export interface ResponseSpec {
  status: number;
  schema?: any;
  example?: any;
}

export interface RequestBodySpec {
  schema?: any;
}

export interface OperationSpec {
  path: string;
  method: string;
  operation: any;
  response?: ResponseSpec;
  requestBody?: RequestBodySpec;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

export async function loadSpec(specPath: string): Promise<OpenApiDocument> {
  return SwaggerParser.dereference(specPath);
}

export function listOperations(doc: OpenApiDocument): OperationSpec[] {
  const operations: OperationSpec[] = [];
  const paths = doc?.paths ?? {};
  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[method];
      if (!operation) continue;
      const response = pickResponse(operation);
      const requestBody = pickRequestBody(operation);
      operations.push({
        path,
        method,
        operation,
        response,
        requestBody
      });
    }
  }
  return operations;
}

function pickResponse(operation: any): ResponseSpec | undefined {
  const responses = operation?.responses ?? {};
  const keys = Object.keys(responses);
  if (keys.length === 0) return undefined;

  const statusCandidates = keys
    .map((status) => ({
      raw: status,
      numeric: status === 'default' ? 999 : Number.parseInt(status, 10)
    }))
    .filter((item) => Number.isFinite(item.numeric))
    .sort((a, b) => a.numeric - b.numeric);

  let chosen = statusCandidates.find((item) => item.raw.startsWith('2'))?.raw;
  if (!chosen) {
    chosen = statusCandidates.find((item) => item.raw === 'default')?.raw ?? statusCandidates[0]?.raw;
  }

  if (!chosen) return undefined;

  const response = responses[chosen];
  const content = response?.content ?? {};
  const mediaType = content['application/json'] ?? Object.values(content)[0];
  const schema = mediaType?.schema;
  const example = mediaType?.example ?? pickExampleFromExamples(mediaType?.examples);

  return {
    status: Number.parseInt(chosen === 'default' ? '200' : chosen, 10),
    schema,
    example
  };
}

function pickRequestBody(operation: any): RequestBodySpec | undefined {
  const requestBody = operation?.requestBody;
  if (!requestBody) return undefined;
  const content = requestBody?.content ?? {};
  const mediaType = content['application/json'] ?? Object.values(content)[0];
  const schema = mediaType?.schema;
  return { schema };
}

function pickExampleFromExamples(examples: any): any {
  if (!examples) return undefined;
  const first = Object.values(examples)[0] as any;
  if (!first) return undefined;
  if (first.value !== undefined) return first.value;
  return undefined;
}
