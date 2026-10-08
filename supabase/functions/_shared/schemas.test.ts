import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { createLlm, mockAnswer, type LlmMessage } from './llm.ts';
import { LLM_PURPOSES, SCHEMAS, type JsonSchema } from './schemas.ts';

/** Keywords structured outputs reject (or that we keep out on purpose). */
const FORBIDDEN = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minItems',
  'maxItems',
  'uniqueItems',
  'contains',
  'minContains',
  'maxContains',
  'minProperties',
  'maxProperties',
  'patternProperties',
  'propertyNames',
  'dependentRequired',
  'dependentSchemas',
  'if',
  'then',
  'else',
  'not',
  'oneOf',
  '$ref',
  'default',
];

function nodes(schema: JsonSchema, path = '$'): { path: string; node: JsonSchema }[] {
  const out = [{ path, node: schema }];
  for (const [k, v] of Object.entries(schema.properties ?? {}))
    out.push(...nodes(v, `${path}.${k}`));
  if (schema.items) out.push(...nodes(schema.items, `${path}[]`));
  (schema.anyOf ?? []).forEach((s, i) => out.push(...nodes(s, `${path}|${i}`)));
  return out;
}

const NOW = new Date('2026-10-16T05:00:00Z');
const textOnly: LlmMessage[] = [
  { role: 'user', content: 'Наряд №12, шифр Г-01. Работы: заменил кольцо уплотнительное.' },
];
const withPhoto: LlmMessage[] = [
  {
    role: 'user',
    content: [
      { type: 'text', text: 'Наряд №12, шифр Г-01.' },
      { type: 'image', media_type: 'image/jpeg', data: 'AAAA' },
    ],
  },
];

describe('schemas', () => {
  it.each(LLM_PURPOSES)(
    '%s: every object closes additionalProperties and requires all keys',
    (purpose) => {
      for (const { path, node } of nodes(SCHEMAS[purpose])) {
        if (node.type !== 'object') continue;
        expect(node.additionalProperties, path).toBe(false);
        expect(node.properties, path).toBeDefined();
        expect([...(node.required ?? [])].sort(), path).toEqual(
          Object.keys(node.properties ?? {}).sort(),
        );
      }
    },
  );

  it.each(LLM_PURPOSES)('%s: no unsupported keywords', (purpose) => {
    for (const { path, node } of nodes(SCHEMAS[purpose])) {
      for (const key of Object.keys(node))
        expect(FORBIDDEN, `${path} uses ${key}`).not.toContain(key);
      expect(node.type !== undefined || node.anyOf !== undefined, `${path} has a type`).toBe(true);
    }
  });

  it.each(LLM_PURPOSES)('%s: the top level is an object', (purpose) => {
    expect(SCHEMAS[purpose].type).toBe('object');
  });

  it.each(LLM_PURPOSES)('%s: ajv compiles it in strict mode', (purpose) => {
    const ajv = new Ajv({ strict: true, allErrors: true });
    expect(() => ajv.compile(SCHEMAS[purpose])).not.toThrow();
  });
});

describe('mock answers validate', () => {
  const ajv = new Ajv({ strict: true, allErrors: true });

  it.each(LLM_PURPOSES)('%s', (purpose) => {
    const validate = ajv.compile(SCHEMAS[purpose]);
    for (const messages of [textOnly, withPhoto]) {
      const answer = mockAnswer(purpose, messages, NOW);
      expect(validate(answer), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it('verify follows the photo and the fault code', () => {
    expect(mockAnswer('verify', textOnly, NOW).photo.after_present).toBe(false);
    expect(mockAnswer('verify', withPhoto, NOW).photo.after_present).toBe(true);
    expect(mockAnswer('verify', textOnly, NOW).suggested_code).toBe('Г-01');
  });

  it('parse_query reads the area and the period', () => {
    const answer = mockAnswer(
      'parse_query',
      [{ role: 'user', content: 'покажи проблемы участка дробления за месяц' }],
      NOW,
    );
    expect(answer.area_id).toBe(2);
    expect(answer.to).toBe('2026-10-16T10:00:00+05:00');
    expect(answer.from).toBe('2026-09-16T10:00:00+05:00');
    const validate = ajv.compile(SCHEMAS.parse_query);
    expect(validate(answer)).toBe(true);
  });

  it('the mock provider goes through call() with zero cost', async () => {
    const llm = createLlm({ provider: 'mock' });
    const r = await llm.call({
      purpose: 'smoke',
      messages: [{ role: 'user', content: 'Ответь JSON' }],
    });
    expect(r.data).toEqual({ ok: true, echo: 'Рота готова' });
    expect(r.costUsd).toBe(0);
    expect(r.model).toBe('mock');
  });
});
