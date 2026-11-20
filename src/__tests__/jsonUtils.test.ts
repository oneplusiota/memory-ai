import { parseModelJson } from '@/utils/jsonUtils';

describe('parseModelJson', () => {
  it('parses plain JSON', () => {
    expect(parseModelJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips markdown fences', () => {
    expect(parseModelJson<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('extracts an object surrounded by prose', () => {
    expect(parseModelJson<{ a: number }>('Sure! Here you go: {"a":1} Hope that helps.')).toEqual({ a: 1 });
  });

  it('throws when there is no JSON', () => {
    expect(() => parseModelJson('no json here')).toThrow();
  });
});
