import { Request, Response } from 'express';
import { GenerateTypesRequest, GenerateTypesResponse, SaveTypesRequest } from '../types';
import { HttpClient } from '../utils/http';
import { TypeGenerator } from '../utils/quicktype';
import { FileManager } from '../utils/fileManager';
import { repairJsonSample } from '../utils/jsonSample';
/**
 * 类型生成控制器
 */
export class TypeController {
  /**
   * 生成 TypeScript 类型定义
   */
  static async generateTypes(req: Request, res: Response): Promise<void> {
    try {
      const requestData: GenerateTypesRequest = req.body;

      // 验证请求数据
      const hasJson = typeof requestData?.json === 'string' && requestData.json.trim().length > 0;
      if (!requestData || (!requestData.url && !hasJson)) {
        res.status(400).json({
          success: false,
          error: '请提供 URL 或 JSON 样本',
        });
        return;
      }

      // 处理请求
      const result = await TypeController.processRequest(requestData);
      res.json(result);

    } catch (error) {
      console.error('API error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * 把已经生成的类型写入磁盘，不再请求目标 URL
   * @param req 包含 types、fileName、savePath
   * @param res JSON 响应
   */
  static async saveTypes(req: Request, res: Response): Promise<void> {
    const requestData = req.body as SaveTypesRequest | undefined;
    const types = requestData?.types;
    const fileName = requestData?.fileName;

    if (typeof types !== 'string' || !types.trim()) {
      res.status(400).json({ success: false, error: '没有可保存的类型定义' });
      return;
    }

    if (types.length > 1_000_000) {
      res.status(400).json({ success: false, error: '类型定义过大' });
      return;
    }

    if (typeof fileName !== 'string' || !fileName.trim()) {
      res.status(400).json({ success: false, error: '请填写文件名' });
      return;
    }

    const saveResult = await FileManager.saveTypeFile(
      types,
      fileName.trim(),
      typeof requestData?.savePath === 'string' ? requestData.savePath : undefined
    );

    if (!saveResult.success) {
      res.status(400).json({
        success: false,
        error: saveResult.error || '保存失败',
      });
      return;
    }

    res.json({
      success: true,
      fileInfo: {
        saved: true,
        fileName,
        filePath: saveResult.filePath,
      },
    });
  }

  /**
   * 取 JSON 样本。有粘贴内容时不再请求 URL
   * @param requestData 生成请求
   * @returns 解析后的 JSON
   * @throws 样本过大、JSON 非法或请求失败时抛出
   */
  private static async loadSample(requestData: GenerateTypesRequest): Promise<unknown> {
    const pasted = requestData.json?.trim();
    if (pasted) {
      if (pasted.length > 1_000_000) {
        throw new Error('JSON 样本过大');
      }
      const repaired = repairJsonSample(pasted);
      if (!repaired.ok) {
        throw new Error(repaired.error);
      }
      return repaired.value;
    }

    if (!requestData.url) {
      throw new Error('请提供 URL 或 JSON 样本');
    }

    return HttpClient.request(requestData.url, {
      method: requestData.method || 'GET',
      headers: requestData.headers || {},
      ...(requestData.body ? { body: requestData.body } : {}),
    });
  }

  /**
   * 处理生成类型的请求
   */
  private static async processRequest(requestData: GenerateTypesRequest): Promise<GenerateTypesResponse> {
    try {
      const responseData = await TypeController.loadSample(requestData);
      if (!TypeGenerator.isValidJsonData(responseData)) {
        return {
          success: false,
          error: '样本不是合法的 JSON',
          ...(requestData.url ? { requestedUrl: requestData.url } : {}),
        };
      }

      const rootName = requestData.rootTypeName
        || (requestData.url ? TypeGenerator.getSuggestedRootName(requestData.url) : 'ApiResponse');

      // 生成 TypeScript 类型定义
      const types = await TypeGenerator.generateTypes(responseData, rootName);

      const result: GenerateTypesResponse = {
        success: true,
        types,
        originalData: responseData,
        ...(requestData.url ? { requestedUrl: requestData.url } : {}),
      };

      if (requestData.saveToFile) {
        const fileName = requestData.fileName
          || FileManager.getSuggestedFileName(requestData.url || '', rootName);
        const saveResult = await FileManager.saveTypeFile(types, fileName, requestData.savePath);

        result.fileInfo = {
          saved: saveResult.success,
          fileName,
          ...(saveResult.filePath ? { filePath: saveResult.filePath } : {}),
          ...(saveResult.error ? { error: saveResult.error } : {}),
        };
      }

      return result;

    } catch (error) {
      console.error('Process request error:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        ...(requestData.url ? { requestedUrl: requestData.url } : {}),
      };
    }
  }
}
