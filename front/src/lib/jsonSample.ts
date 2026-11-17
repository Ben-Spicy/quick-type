export interface JsonRepairSuccess {
  ok: true;
  /** 解析后的值 */
  value: unknown;
  /** 整理后的标准 JSON 文本 */
  text: string;
  /** 是否做了自动修复 */
  repaired: boolean;
  /** 对用户展示的修复说明 */
  changes: string[];
}

export interface JsonRepairFailure {
  ok: false;
  /** 无法修复时的说明 */
  error: string;
}

export type JsonRepairResult = JsonRepairSuccess | JsonRepairFailure;

/**
 * 把粘贴内容解析成 JSON。标准 JSON 原样通过；常见的非标准写法会整理后再解析。
 * @param input 用户粘贴或输入的文本
 * @returns 整理结果。无法修复时 ok 为 false
 */
export function repairJsonSample(input: string): JsonRepairResult {
  const changes: string[] = [];
  let text = input.replace(/^\uFEFF/, '');
  if (text !== input) changes.push('去掉了文件头标记');

  text = text.trim();
  const unfenced = unwrapFence(text);
  if (unfenced !== text) {
    text = unfenced.trim();
    changes.push('去掉了 Markdown 代码块');
  }

  const direct = tryParse(text);
  if (direct.ok) {
    return {
      ok: true,
      value: direct.value,
      text: changes.length > 0 ? JSON.stringify(direct.value, null, 2) : text,
      repaired: changes.length > 0,
      changes,
    };
  }

  const loosened = loosen(text, changes);
  const parsed = tryParse(loosened);
  if (parsed.ok) {
    return {
      ok: true,
      value: parsed.value,
      text: JSON.stringify(parsed.value, null, 2),
      repaired: true,
      changes: unique(changes),
    };
  }

  const sliced = sliceBalanced(text);
  if (sliced && sliced !== text.trim()) {
    const sliceChanges = [...changes, '去掉了 JSON 前后的多余文字'];
    const loosenedSlice = loosen(sliced, sliceChanges);
    const slicedParsed = tryParse(loosenedSlice);
    if (slicedParsed.ok) {
      return {
        ok: true,
        value: slicedParsed.value,
        text: JSON.stringify(slicedParsed.value, null, 2),
        repaired: true,
        changes: unique(sliceChanges),
      };
    }
  }

  return { ok: false, error: describeParseFailure(text) };
}

/**
 * 去掉成对的 Markdown 代码围栏
 * @param text 原始文本
 * @returns 去掉围栏后的文本；没有围栏时原样返回
 */
function unwrapFence(text: string): string {
  const match = text.match(/^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1] ?? text;
}

/**
 * 把单引号、未加引号的键、注释、末尾逗号和 Python 字面量收成更接近 JSON 的文本
 * @param input 待整理文本
 * @param changes 修复说明，会就地追加
 * @returns 整理后的文本
 */
function loosen(input: string, changes: string[]): string {
  let output = '';
  let index = 0;
  let mode: 'code' | 'double' | 'single' | 'line' | 'block' = 'code';

  while (index < input.length) {
    const current = input[index] ?? '';
    const next = input[index + 1] ?? '';

    if (mode === 'line') {
      if (current === '\n') {
        mode = 'code';
        output += current;
      }
      index += 1;
      continue;
    }

    if (mode === 'block') {
      if (current === '*' && next === '/') {
        mode = 'code';
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (mode === 'double') {
      output += current;
      if (current === '\\') {
        output += next;
        index += 2;
        continue;
      }
      if (current === '"') mode = 'code';
      index += 1;
      continue;
    }

    if (mode === 'single') {
      if (current === '\\' && next === "'") {
        output += "'";
        index += 2;
        continue;
      }
      if (current === '\\') {
        output += current + next;
        index += 2;
        continue;
      }
      if (current === "'") {
        output += '"';
        mode = 'code';
        index += 1;
        continue;
      }
      if (current === '"') {
        output += '\\"';
        index += 1;
        continue;
      }
      if (current === '\n') {
        output += '\\n';
        index += 1;
        continue;
      }
      if (current === '\r') {
        output += '\\r';
        index += 1;
        continue;
      }
      if (current === '\t') {
        output += '\\t';
        index += 1;
        continue;
      }
      output += current;
      index += 1;
      continue;
    }

    if (current === '"') {
      mode = 'double';
      output += current;
      index += 1;
      continue;
    }

    if (current === "'") {
      mode = 'single';
      output += '"';
      changes.push('把单引号改成了双引号');
      index += 1;
      continue;
    }

    if (current === '/' && next === '/') {
      mode = 'line';
      changes.push('去掉了注释');
      index += 2;
      continue;
    }

    if (current === '/' && next === '*') {
      mode = 'block';
      changes.push('去掉了注释');
      index += 2;
      continue;
    }

    if ((current === '“' || current === '”')) {
      output += '"';
      changes.push('把弯引号改成了直引号');
      index += 1;
      continue;
    }

    if (current === ',') {
      let lookAhead = index + 1;
      while (lookAhead < input.length && /\s/u.test(input[lookAhead] ?? '')) lookAhead += 1;
      const follower = input[lookAhead];
      if (follower === '}' || follower === ']') {
        changes.push('去掉了末尾多余的逗号');
        index += 1;
        continue;
      }
    }

    if (isIdentStart(current)) {
      let end = index + 1;
      while (end < input.length && (isIdentPart(input[end] ?? '') || input[end] === '-')) end += 1;
      const word = input.slice(index, end);
      let after = end;
      while (after < input.length && /\s/u.test(input[after] ?? '')) after += 1;
      if (input[after] === ':') {
        output += JSON.stringify(word);
        changes.push('给字段名加了引号');
        index = end;
        continue;
      }

      const literal = jsonLiteral(word);
      if (literal) {
        output += literal;
        changes.push(word === 'undefined' ? '把 undefined 改成了 null' : '把 True、False、None 改成了 JSON');
        index = end;
        continue;
      }

      output += word;
      index = end;
      continue;
    }

    output += current;
    index += 1;
  }

  return output;
}

/**
 * 从第一处括号起截取配平的对象或数组
 * @param input 原始文本
 * @returns 截取出的片段；找不到时返回空字符串
 */
function sliceBalanced(input: string): string {
  const start = input.search(/[{[]/u);
  if (start < 0) return '';

  let depth = 0;
  let mode: 'code' | 'double' | 'single' = 'code';
  for (let index = start; index < input.length; index += 1) {
    const current = input[index] ?? '';
    const next = input[index + 1] ?? '';

    if (mode === 'double' || mode === 'single') {
      const quote = mode === 'double' ? '"' : "'";
      if (current === '\\') {
        index += 1;
        continue;
      }
      if (current === quote) mode = 'code';
      continue;
    }

    if (current === '"') {
      mode = 'double';
      continue;
    }
    if (current === "'") {
      mode = 'single';
      continue;
    }
    if (current === '/' && next === '/') {
      while (index < input.length && input[index] !== '\n') index += 1;
      continue;
    }
    if (current === '{' || current === '[') depth += 1;
    if (current === '}' || current === ']') {
      depth -= 1;
      if (depth === 0) return input.slice(start, index + 1);
    }
  }

  return '';
}

/**
 * @param word 标识符
 * @returns 对应的 JSON 字面量；不是可替换字面量时返回空字符串
 */
function jsonLiteral(word: string): string {
  if (word === 'True') return 'true';
  if (word === 'False') return 'false';
  if (word === 'None' || word === 'undefined') return 'null';
  return '';
}

/**
 * @param char 字符
 * @returns 能否作为未加引号字段名的开头
 */
function isIdentStart(char: string): boolean {
  return /[\p{L}_$]/u.test(char);
}

/**
 * @param char 字符
 * @returns 能否作为未加引号字段名的后续字符
 */
function isIdentPart(char: string): boolean {
  return /[\p{L}\p{N}_$]/u.test(char);
}

/**
 * @param text 待解析文本
 * @returns 解析成功时带上值，失败时带上错误
 */
function tryParse(text: string): { ok: true; value: unknown } | { ok: false; error: unknown } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * @param sample 用户看到的文本
 * @returns 说明修复失败的位置
 */
function describeParseFailure(sample: string): string {
  try {
    JSON.parse(sample);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const position = Number(message.match(/position (\d+)/u)?.[1]);
    if (Number.isInteger(position)) {
      const line = sample.slice(0, position).split('\n').length;
      return `无法自动修复，第 ${line} 行附近仍然不是合法 JSON`;
    }
  }
  return '无法自动修复，这段内容不是合法 JSON';
}

/**
 * @param items 可能重复的说明
 * @returns 去重后的说明
 */
function unique(items: string[]): string[] {
  return [...new Set(items)];
}
