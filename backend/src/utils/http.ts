import { RequestConfig } from '../types';

/**
 * API 错误类
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * HTTP 请求工具类
 * 用于发送 HTTP 请求并处理响应
 */
export class HttpClient {
  private static readonly DEFAULT_TIMEOUT = 30000; // 30秒超时
  private static readonly MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB 最大响应大小

  /**
   * 发送 HTTP 请求
   * @param url 请求 URL
   * @param config 请求配置
   * @returns Promise<any> 响应数据
   */
  static async request(url: string, config: RequestConfig): Promise<any> {
    try {
      // 验证 URL
      this.validateUrl(url);

      const headers = this.buildHeaders(config);
      this.assertJsonBody(config.body, headers);

      // 构建请求配置
      const requestConfig: RequestInit = {
        method: config.method,
        headers,
        ...(config.body && { body: config.body }),
      };

      // 设置超时
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        config.timeout || this.DEFAULT_TIMEOUT
      );

      try {
        const response = await fetch(url, {
          ...requestConfig,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // 检查响应状态
        if (!response.ok) {
          throw new ApiError(
            `HTTP ${response.status}: ${response.statusText}`,
            'HTTP_ERROR',
            response.status
          );
        }

        // 检查响应大小
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > this.MAX_RESPONSE_SIZE) {
          throw new ApiError(
            'Response too large',
            'RESPONSE_TOO_LARGE',
            413
          );
        }

        // 获取响应内容类型
        const contentType = response.headers.get('content-type') || '';
        
        // 根据内容类型解析响应
        if (contentType.includes('application/json')) {
          return await response.json();
        } else if (contentType.includes('text/')) {
          return await response.text();
        } else {
          // 对于其他类型，尝试作为 JSON 解析
          const text = await response.text();
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        }
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      console.error('HTTP request failed:', error);
      throw this.handleError(error);
    }
  }

  /**
   * 验证 URL 是否有效
   * @param url 要验证的 URL
   */
  private static validateUrl(url: string): void {
    try {
      const parsedUrl = new URL(url);
      
      // 只允许 HTTP 和 HTTPS 协议
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new ApiError(
          'Only HTTP and HTTPS protocols are allowed',
          'INVALID_PROTOCOL',
          400
        );
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        'Invalid URL format',
        'INVALID_URL',
        400
      );
    }
  }

  /**
   * 合并默认请求头。有请求体且调用方未指定 Content-Type 时按 JSON 发送。
   * @param config 请求配置
   * @returns 最终请求头
   */
  private static buildHeaders(config: RequestConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'QuickType/1.0.0',
      Accept: 'application/json, text/plain, */*',
      ...config.headers,
    };

    if (config.body && !this.headerValue(headers, 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

  /**
   * 在声明为 JSON 时提前拒绝非法请求体，避免把解析错误丢给目标接口。
   * @param body 请求体
   * @param headers 最终请求头
   */
  private static assertJsonBody(body: string | undefined, headers: Record<string, string>): void {
    if (!body) return;

    const contentType = this.headerValue(headers, 'content-type') ?? '';
    if (!contentType.includes('application/json')) return;

    try {
      JSON.parse(body);
    } catch {
      throw new ApiError('请求体不是合法的 JSON', 'INVALID_JSON', 400);
    }
  }

  /**
   * 按头名称不区分大小写取值
   * @param headers 请求头
   * @param name 头名称
   * @returns 头的值
   */
  private static headerValue(headers: Record<string, string>, name: string): string | undefined {
    const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
    return match?.[1];
  }

  /**
   * 处理错误
   * @param error 原始错误
   * @returns ApiError
   */
  private static handleError(error: any): ApiError {
    if (error instanceof ApiError) {
      return error;
    }

    if (error.name === 'AbortError') {
      return new ApiError(
        'Request timeout',
        'TIMEOUT',
        408
      );
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      return new ApiError(
        'Network error: Unable to connect to the server',
        'NETWORK_ERROR',
        503
      );
    }

    return new ApiError(
      error.message || 'Unknown error occurred',
      'UNKNOWN_ERROR',
      500
    );
  }
}
