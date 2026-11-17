import { InputData, jsonInputForTargetLanguage, quicktype } from 'quicktype-core';

/**
 * TypeScript 类型生成工具
 * 用 quicktype-core 从整份 JSON 推断类型，包括数组里的每一项和 null
 */
export class TypeGenerator {
  /**
   * 将 JSON 数据转换为 TypeScript 类型定义
   * @param jsonData JSON 对象或 JSON 字符串
   * @param rootName 根类型名称
   * @returns 生成的 TypeScript 源码
   * @throws JSON 无法解析或 quicktype 生成失败时抛出
   */
  static async generateTypes(jsonData: unknown, rootName: string = 'ApiResponse'): Promise<string> {
    const sample = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);
    if (!sample || !sample.trim()) {
      throw new Error('没有可用于生成类型的 JSON');
    }

    try {
      JSON.parse(sample);
    } catch {
      throw new Error('JSON 样本不是合法的 JSON');
    }

    const parsed: unknown = JSON.parse(sample);
    const isArray = Array.isArray(parsed);
    if (isArray && parsed.length === 0) {
      return TypeGenerator.withHeader(`export type ${TypeGenerator.toIdentifier(rootName)} = unknown[];`);
    }

    const name = TypeGenerator.toIdentifier(rootName);
    // quicktype 会把顶层数组拆成多条样本。这里单独命名元素，再把根类型声明成数组。
    const elementName = isArray ? `${name}Item` : name;
    const samples = isArray
      ? parsed.map((item) => JSON.stringify(item))
      : [sample];

    const jsonInput = jsonInputForTargetLanguage('typescript');
    await jsonInput.addSource({ name: elementName, samples });

    const inputData = new InputData();
    inputData.addInput(jsonInput);

    try {
      const { lines } = await quicktype({
        lang: 'typescript',
        inputData,
        leadingComments: [
          '自动生成的 TypeScript 类型定义',
          '由 Quick Type 工具生成',
          '字段名保持 JSON 原样，接口名使用大驼峰',
        ],
        rendererOptions: {
          'just-types': true,
          'nice-property-names': false,
        },
      });

      const source = lines.join('\n');
      if (!isArray) return source;
      return `${source}\n\nexport type ${name} = ${elementName}[];\n`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to generate types: ${message}`);
    }
  }

  /**
   * 验证数据是对象、数组或可解析的 JSON 字符串
   * @param data 待检查的数据
   * @returns 是否可作为类型样本
   */
  static isValidJsonData(data: unknown): boolean {
    if (typeof data === 'string') {
      try {
        JSON.parse(data);
        return true;
      } catch {
        return false;
      }
    }

    return typeof data === 'object' && data !== null;
  }

  /**
   * 从 URL 最后一段路径建议根类型名
   * @param url API 地址
   * @returns PascalCase 名称加 Response
   */
  static getSuggestedRootName(url: string): string {
    try {
      const segments = new URL(url).pathname.split('/').filter((segment) => segment.length > 0);
      const lastSegment = segments[segments.length - 1];
      if (!lastSegment) return 'ApiResponse';

      const name = TypeGenerator.toIdentifier(lastSegment);
      return name === 'Unknown' ? 'ApiResponse' : `${name}Response`;
    } catch {
      return 'ApiResponse';
    }
  }

  /**
   * 把任意文字收成可作为 TypeScript 类型名的大驼峰
   * @param value 用户输入或路径片段
   * @returns 以字母开头的标识符
   */
  private static toIdentifier(value: string): string {
    const name = value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');

    if (!name || !/^[A-Za-z]/.test(name)) return 'ApiResponse';
    return name;
  }

  /**
   * 给只有一行类型声明的结果补上和 quicktype 相同的文件头
   * @param declaration 类型声明
   * @returns 带注释的源码
   */
  private static withHeader(declaration: string): string {
    return [
      '// 自动生成的 TypeScript 类型定义',
      '// 由 Quick Type 工具生成',
      '// 字段名保持 JSON 原样，接口名使用大驼峰',
      '',
      declaration,
      '',
    ].join('\n');
  }
}
