import jsf from 'json-schema-faker';
import { faker as baseFaker } from '@faker-js/faker';
import { MockGenConfig } from './config.js';

const faker = baseFaker as any;

const smartKeys: Record<string, () => string> = {
  email: () => faker.internet.email(),
  name: () => (faker.person?.fullName ? faker.person.fullName() : faker.name?.findName?.() ?? faker.internet.userName()),
  firstName: () => (faker.person?.firstName ? faker.person.firstName() : faker.name?.firstName?.() ?? faker.internet.userName()),
  lastName: () => (faker.person?.lastName ? faker.person.lastName() : faker.name?.lastName?.() ?? faker.internet.userName()),
  phone: () => (faker.phone?.number ? faker.phone.number() : faker.phone?.phoneNumber?.() ?? faker.number.int().toString()),
  address: () => (faker.location?.streetAddress ? faker.location.streetAddress() : faker.address?.streetAddress?.() ?? faker.location?.street?.() ?? '123 Main St'),
  url: () => faker.internet.url(),
  uuid: () => (faker.string?.uuid ? faker.string.uuid() : faker.datatype?.uuid?.() ?? faker.string?.alphanumeric(16)),
  id: () => (faker.string?.uuid ? faker.string.uuid() : faker.datatype?.uuid?.() ?? faker.string?.alphanumeric(16)),
  date: () => faker.date.recent().toISOString(),
  dateTime: () => faker.date.recent().toISOString(),
  ipv4: () => faker.internet.ip(),
  ipv6: () => faker.internet.ipv6()
};

function matchSmartKey(key?: string) {
  if (!key) return undefined;
  const lower = key.toLowerCase();
  if (lower.includes('email')) return 'email';
  if (lower === 'id' || lower.endsWith('id') || lower.includes('_id')) return 'id';
  if (lower.includes('uuid')) return 'uuid';
  if (lower.includes('first') && lower.includes('name')) return 'firstName';
  if (lower.includes('last') && lower.includes('name')) return 'lastName';
  if (lower.includes('name')) return 'name';
  if (lower.includes('phone') || lower.includes('mobile')) return 'phone';
  if (lower.includes('address')) return 'address';
  if (lower.includes('url') || lower.includes('uri') || lower.includes('link')) return 'url';
  if (lower.includes('date')) return 'date';
  if (lower.includes('ip')) return 'ipv4';
  return undefined;
}

function applyFormatHints(format?: string) {
  if (!format) return undefined;
  const normalized = format.toLowerCase();
  if (normalized === 'email') return 'email';
  if (normalized === 'uuid') return 'uuid';
  if (normalized === 'date' || normalized === 'date-time') return 'dateTime';
  if (normalized === 'uri' || normalized === 'url') return 'url';
  if (normalized === 'ipv4') return 'ipv4';
  if (normalized === 'ipv6') return 'ipv6';
  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pickExample(schema: any): unknown | undefined {
  if (!schema) return undefined;
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) {
    return schema.examples[0];
  }
  return undefined;
}

function pickEnum(schema: any): unknown | undefined {
  if (schema?.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    return faker.helpers.arrayElement(schema.enum);
  }
  return undefined;
}

export class DataGenerator {
  private config: MockGenConfig;

  constructor(config: MockGenConfig) {
    this.config = config;
    if (config.data.seed !== undefined) {
      faker.seed(config.data.seed);
    }

    jsf.option({
      alwaysFakeOptionals: true,
      useExamplesValue: true,
      minItems: config.data.arrayMin,
      maxItems: config.data.arrayMax,
      fillProperties: true,
      requiredOnly: false,
      failOnInvalidTypes: false,
      failOnInvalidFormat: false
    });

    jsf.extend('faker', () => faker);
  }

  generate(schema: any, keyHint?: string): unknown {
    if (!schema) return null;

    const example = pickExample(schema);
    if (example !== undefined) return example;

    const enumValue = pickEnum(schema);
    if (enumValue !== undefined) return enumValue;

    let value: unknown;
    try {
      value = jsf.generate(schema);
    } catch (_error) {
      value = this.fallbackGenerate(schema, keyHint);
    }
    return this.applySmartFields(value, schema, keyHint);
  }

  private fallbackGenerate(schema: any, keyHint?: string): unknown {
    const type = schema?.type;
    if (type === 'string') {
      return this.smartString(keyHint, schema?.format) ?? faker.lorem.word();
    }
    if (type === 'integer') {
      return faker.number.int({ min: schema?.minimum ?? 0, max: schema?.maximum ?? 1000 });
    }
    if (type === 'number') {
      return faker.number.float({ min: schema?.minimum ?? 0, max: schema?.maximum ?? 1000 });
    }
    if (type === 'boolean') {
      return faker.datatype?.boolean ? faker.datatype.boolean() : faker.helpers.arrayElement([true, false]);
    }
    if (type === 'array') {
      const count = faker.number.int({ min: this.config.data.arrayMin, max: this.config.data.arrayMax });
      return Array.from({ length: count }, () => this.generate(schema.items, keyHint));
    }
    if (type === 'object' || schema?.properties) {
      const result: Record<string, unknown> = {};
      const props = schema?.properties ?? {};
      for (const [key, value] of Object.entries(props)) {
        result[key] = this.generate(value, key);
      }
      return result;
    }
    return null;
  }

  private smartString(keyHint?: string, format?: string): string | undefined {
    const formatKey = applyFormatHints(format);
    const key = formatKey ?? matchSmartKey(keyHint);
    if (!key) return undefined;
    const generator = smartKeys[key];
    return generator?.();
  }

  private applySmartFields(value: unknown, schema: any, keyHint?: string): unknown {
    if (value === null || value === undefined || schema === undefined) return value;

    if (schema.oneOf && Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
      return this.applySmartFields(value, schema.oneOf[0], keyHint);
    }
    if (schema.anyOf && Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
      return this.applySmartFields(value, schema.anyOf[0], keyHint);
    }
    if (schema.allOf && Array.isArray(schema.allOf) && schema.allOf.length > 0) {
      return this.applySmartFields(value, schema.allOf[0], keyHint);
    }

    if (Array.isArray(value)) {
      const itemSchema = schema.items ?? {};
      return value.map((item) => this.applySmartFields(item, itemSchema, keyHint));
    }

    if (isObject(value)) {
      const props = schema.properties ?? {};
      const output: Record<string, unknown> = { ...value };
      for (const [key, val] of Object.entries(output)) {
        output[key] = this.applySmartFields(val, props[key] ?? {}, key);
      }
      return output;
    }

    if (typeof value === 'string') {
      const smart = this.smartString(keyHint, schema?.format);
      return smart ?? value;
    }

    return value;
  }
}
