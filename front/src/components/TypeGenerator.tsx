import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HeaderEditor } from './HeaderEditor';
import { ApiService } from '@/services/api';
import { repairJsonSample } from '@/lib/jsonSample';
import { GenerateTypesRequest, HeaderItem, SystemInfo } from '@/types/api';
import { Loader2, Copy, Check, AlertCircle, Code, Globe, Download } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const EXAMPLE_URL = 'https://jsonplaceholder.typicode.com/users';
const EXAMPLE_JSON = `[
  { "id": 1, "user_name": "Ada", "nickname": null },
  { "id": 2, "user_name": "Grace", "nickname": "grace", "email": "grace@example.com" }
]`;

type HttpMethod = (typeof HTTP_METHODS)[number];
type SourceMode = 'url' | 'json';

/**
 * 用 URL 最后一段路径生成根类型名
 * @param url 目标 API 地址
 * @returns 以字母开头的名称加 Response；无法推断时返回空字符串
 */
function suggestRootName(url: string): string {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? '';
    const name = last
      .split(/[-_]/)
      .filter((word: string) => /[a-zA-Z]/.test(word))
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
      .replace(/[^A-Za-z0-9]/g, '');

    if (!name || !/^[A-Za-z]/.test(name)) return '';
    return `${name}Response`;
  } catch {
    return '';
  }
}

interface PathShortcutsProps {
  homeDir?: string;
  defaultPath?: string;
  onSelect: (path: string) => void;
}

/**
 * 主目录下的几个常用保存位置
 */
function PathShortcuts({ homeDir, defaultPath, onSelect }: PathShortcutsProps) {
  const options = [
    { label: '桌面', path: homeDir ? `${homeDir}/Desktop` : '' },
    { label: '文档', path: homeDir ? `${homeDir}/Documents` : '' },
    { label: '下载', path: homeDir ? `${homeDir}/Downloads` : '' },
    { label: '推荐路径', path: defaultPath ?? '' },
  ];

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">常用路径</p>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            disabled={!option.path}
            onClick={() => onSelect(option.path)}
            className="rounded border border-input bg-secondary px-2 py-1 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 类型生成器主组件
 * 处理用户输入和类型生成逻辑
 */
export const TypeGenerator: React.FC = () => {
  const [url, setUrl] = useState('');
  const [source, setSource] = useState<SourceMode>('url');
  const [sampleJson, setSampleJson] = useState('');
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [headers, setHeaders] = useState<HeaderItem[]>([]);
  const [body, setBody] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState('');
  const [originalJson, setOriginalJson] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saveError, setSaveError] = useState('');
  const [copied, setCopied] = useState(false);
  const [rootTypeName, setRootTypeName] = useState('');
  const [rootNameTouched, setRootNameTouched] = useState(false);
  const [saveToFile, setSaveToFile] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileNameTouched, setFileNameTouched] = useState(false);
  const [savePath, setSavePath] = useState('');
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [tempFileName, setTempFileName] = useState('');
  const [tempSavePath, setTempSavePath] = useState('');

  const urlRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const sampleRef = useRef<HTMLTextAreaElement>(null);
  const saveDialogRef = useRef<HTMLDialogElement>(null);
  const noticeDialogRef = useRef<HTMLDialogElement>(null);
  const pendingRepairRef = useRef('');

  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const info = await ApiService.getSystemInfo();
        setSystemInfo(info);
        setSavePath(info.defaultSavePath);
      } catch (fetchError) {
        console.error('Failed to get system info:', fetchError);
      }
    };
    fetchSystemInfo();
  }, []);

  useEffect(() => {
    const suggested = suggestRootName(url);
    if (!suggested) return;
    if (!rootNameTouched) setRootTypeName(suggested);
    if (!fileNameTouched) setFileName(`${suggested.replace(/Response$/, '')}Types`);
  }, [url, rootNameTouched, fileNameTouched]);

  useEffect(() => {
    const dialog = noticeDialogRef.current;
    if (!dialog || !notice || dialog.open) return;
    dialog.showModal();
  }, [notice]);

  useEffect(() => {
    if ('closedBy' in HTMLDialogElement.prototype) return;
    const dialogs = [saveDialogRef.current, noticeDialogRef.current].filter(
      (dialog): dialog is HTMLDialogElement => dialog !== null
    );

    const cleanups = dialogs.map((dialog) => {
      let pressedOutside = false;
      const outside = (event: PointerEvent) => {
        const rect = dialog.getBoundingClientRect();
        return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      };
      const onPointerDown = (event: PointerEvent) => {
        pressedOutside = outside(event);
      };
      const onPointerUp = (event: PointerEvent) => {
        if (pressedOutside && outside(event)) dialog.close();
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      return () => {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  const needsBody = source === 'url' && (method === 'POST' || method === 'PUT' || method === 'PATCH');

  const collectHeaders = (): Record<string, string> | string => {
    const requestHeaders: Record<string, string> = {};
    headers
      .filter((header) => header.enabled && header.key.trim() && header.value.trim())
      .forEach((header) => {
        requestHeaders[header.key.trim()] = header.value.trim();
      });

    return ApiService.validateHeaders(requestHeaders) ?? requestHeaders;
  };

  const handleGenerate = async () => {
    let repairNote = '';
    let jsonText = sampleJson.trim();

    if (source === 'json') {
      if (!jsonText) {
        setNotice('');
        setError('请粘贴 JSON 样本');
        sampleRef.current?.focus();
        return;
      }
      const repaired = repairJsonSample(sampleJson);
      if (!repaired.ok) {
        setNotice('');
        setError(repaired.error);
        sampleRef.current?.focus();
        return;
      }
      jsonText = repaired.text;
      if (repaired.repaired) {
        setSampleJson(repaired.text);
        repairNote = `已把样本整理为标准 JSON：${repaired.changes.join('，')}`;
        pendingRepairRef.current = '';
      } else if (pendingRepairRef.current) {
        repairNote = pendingRepairRef.current;
      }
    } else if (!url.trim() || !ApiService.isValidUrl(url) || !/^https?:\/\//i.test(url.trim())) {
      setNotice('');
      setError('请输入有效的 http 或 https 地址');
      urlRef.current?.focus();
      return;
    }

    let bodyText = body.trim();
    if (needsBody && bodyText) {
      const repairedBody = repairJsonSample(body);
      if (!repairedBody.ok) {
        setNotice('');
        setError(repairedBody.error.replace(/^无法自动修复/u, '请求体无法自动修复'));
        bodyRef.current?.focus();
        return;
      }
      bodyText = repairedBody.text;
      if (repairedBody.repaired) {
        setBody(repairedBody.text);
        repairNote = repairNote
          ? `${repairNote}。请求体也已整理为标准 JSON`
          : `已把请求体整理为标准 JSON：${repairedBody.changes.join('，')}`;
      }
    }

    if (saveToFile && !savePath.trim()) {
      setNotice('');
      setError('请填写保存路径');
      return;
    }

    const headerResult = source === 'url' ? collectHeaders() : {};
    if (typeof headerResult === 'string') {
      setNotice('');
      setError(headerResult);
      return;
    }

    setIsLoading(true);
    setError('');
    setNotice('');
    setResult('');
    setOriginalJson('');

    try {
      const request: GenerateTypesRequest = source === 'json'
        ? {
            json: jsonText,
            rootTypeName: rootTypeName || undefined,
            saveToFile,
            fileName: saveToFile ? fileName : undefined,
            savePath: saveToFile ? savePath : undefined,
          }
        : {
            url: url.trim(),
            method,
            headers: Object.keys(headerResult).length > 0 ? headerResult : undefined,
            body: needsBody && bodyText ? bodyText : undefined,
            rootTypeName: rootTypeName || undefined,
            saveToFile,
            fileName: saveToFile ? fileName : undefined,
            savePath: saveToFile ? savePath : undefined,
          };

      const response = await ApiService.generateTypes(request);

      if (response.success && response.types) {
        setResult(response.types);
        setOriginalJson(
          response.originalData === undefined ? '' : JSON.stringify(response.originalData, null, 2)
        );
        let message = repairNote;
        if (response.fileInfo?.saved && response.fileInfo.filePath) {
          const saved = `已保存到 ${response.fileInfo.filePath}`;
          message = message ? `${message}。${saved}` : saved;
        } else if (response.fileInfo && !response.fileInfo.saved) {
          setError(response.fileInfo.error || '类型已生成，但文件保存失败');
        }
        if (message) {
          pendingRepairRef.current = '';
          setNotice(message);
        }
      } else {
        setError(response.error || '生成类型定义失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生未知错误');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;

    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
      setError('复制失败，请手动选择类型定义');
    }
  };

  const openSaveDialog = () => {
    setTempFileName(fileName || 'ApiTypes');
    setTempSavePath(savePath || systemInfo?.defaultSavePath || '');
    setSaveError('');
    const dialog = saveDialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>('#tempFileName')?.focus();
  };

  const confirmSaveToFile = async () => {
    if (!result || !tempFileName.trim() || !tempSavePath.trim()) {
      setSaveError('请填写文件名和保存路径');
      return;
    }

    try {
      setIsSaving(true);
      setSaveError('');

      const response = await ApiService.saveTypes({
        types: result,
        fileName: tempFileName.trim(),
        savePath: tempSavePath.trim(),
      });

      setFileName(tempFileName.trim());
      setSavePath(tempSavePath.trim());
      setNotice(response.fileInfo?.filePath ? `已保存到 ${response.fileInfo.filePath}` : '文件已保存');
      saveDialogRef.current?.close();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    setUrl('');
    setSampleJson('');
    setHeaders([]);
    setBody('');
    setResult('');
    setOriginalJson('');
    setError('');
    setNotice('');
    pendingRepairRef.current = '';
    setRootTypeName('');
    setRootNameTouched(false);
    setFileName('');
    setFileNameTouched(false);
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="space-y-2 text-center">
        <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl font-bold text-transparent">
          Quick Type
        </h1>
        <p className="text-lg text-muted-foreground">
          将 API URL 转换为 TypeScript 类型定义
        </p>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div role="alert">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">错误</span>
              </div>
              <p className="mt-2 text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle id="request-config-title" className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                API 请求配置
              </CardTitle>
              <CardDescription>输入 API URL 和请求参数</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                aria-labelledby="request-config-title"
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleGenerate();
                }}
              >
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium leading-none">样本来源</legend>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ['url', '请求 URL'],
                      ['json', '粘贴 JSON'],
                    ] as const).map(([value, label]) => (
                      <div key={value}>
                        <input
                          id={`source-${value}`}
                          className="peer sr-only"
                          type="radio"
                          name="source"
                          value={value}
                          checked={source === value}
                          onChange={() => {
                            setSource(value);
                            setError('');
                          }}
                        />
                        <label
                          htmlFor={`source-${value}`}
                          className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-input px-3 text-sm peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
                        >
                          {label}
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>

                {source === 'json' ? (
                  <div className="space-y-2">
                    <Label htmlFor="sampleJson">
                      JSON 样本 <span aria-hidden="true">*</span>
                    </Label>
                    <Textarea
                      ref={sampleRef}
                      id="sampleJson"
                      name="sampleJson"
                      required
                      spellCheck={false}
                      placeholder='[{"id": 1, "user_name": "Ada"}]'
                      value={sampleJson}
                      aria-invalid={error.includes('JSON') ? true : undefined}
                      className="min-h-[160px] font-mono"
                      onInvalid={(event) => {
                        event.currentTarget.setCustomValidity('请粘贴合法的 JSON');
                      }}
                      onChange={(event) => {
                        event.currentTarget.setCustomValidity('');
                        setSampleJson(event.target.value);
                        setError('');
                        pendingRepairRef.current = '';
                      }}
                      onPaste={(event) => {
                        const pasted = event.clipboardData.getData('text');
                        const start = event.currentTarget.selectionStart ?? 0;
                        const end = event.currentTarget.selectionEnd ?? start;
                        const next = `${event.currentTarget.value.slice(0, start)}${pasted}${event.currentTarget.value.slice(end)}`;
                        const repaired = repairJsonSample(next);
                        if (!repaired.ok || !repaired.repaired) return;
                        event.preventDefault();
                        setSampleJson(repaired.text);
                        setError('');
                        pendingRepairRef.current = `已把样本整理为标准 JSON：${repaired.changes.join('，')}`;
                      }}
                    />
                    <button
                      type="button"
                      className="text-sm text-primary underline-offset-4 hover:underline"
                      onClick={() => {
                        setSampleJson(EXAMPLE_JSON);
                        setError('');
                        if (!rootNameTouched) setRootTypeName('SampleResponse');
                        if (!fileNameTouched) setFileName('SampleTypes');
                      }}
                    >
                      填入示例：null、可选字段和原字段名
                    </button>
                    <p className="text-sm text-muted-foreground">
                      单引号、注释、末尾逗号和未加引号的字段名会自动整理成标准 JSON。
                    </p>
                  </div>
                ) : (
                  <>
                <div className="space-y-2">
                  <Label htmlFor="url">
                    API URL <span aria-hidden="true">*</span>
                  </Label>
                  <Input
                    ref={urlRef}
                    id="url"
                    name="url"
                    type="url"
                    required
                    inputMode="url"
                    autoComplete="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    placeholder="https://api.example.com/users"
                    value={url}
                    aria-invalid={error.includes('URL') || error.includes('地址') ? true : undefined}
                    className="font-mono"
                    onInvalid={(event) => {
                      event.currentTarget.setCustomValidity('请输入有效的 URL，例如 https://api.example.com/users');
                    }}
                    onChange={(event) => {
                      event.currentTarget.setCustomValidity('');
                      setUrl(event.target.value);
                      setError('');
                    }}
                  />
                  <button
                    type="button"
                    className="text-sm text-primary underline-offset-4 hover:underline"
                    onClick={() => setUrl(EXAMPLE_URL)}
                  >
                    填入示例：jsonplaceholder /users
                  </button>
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium leading-none">HTTP 方法</legend>
                  <div className="flex flex-wrap gap-2">
                    {HTTP_METHODS.map((item) => (
                      <div key={item}>
                        <input
                          id={`method-${item}`}
                          className="peer sr-only"
                          type="radio"
                          name="method"
                          value={item}
                          checked={method === item}
                          onChange={() => setMethod(item)}
                        />
                        <label
                          htmlFor={`method-${item}`}
                          className="inline-flex h-10 min-w-16 cursor-pointer items-center justify-center rounded-md border border-input px-3 text-sm peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
                        >
                          {item}
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>

                {needsBody && (
                  <div className="space-y-2">
                    <Label htmlFor="body">请求体 (JSON)</Label>
                    <Textarea
                      ref={bodyRef}
                      id="body"
                      name="body"
                      placeholder='{"key": "value"}'
                      value={body}
                      spellCheck={false}
                      aria-invalid={error.includes('JSON') ? true : undefined}
                      className="min-h-[100px] font-mono"
                      onChange={(event) => {
                        setBody(event.target.value);
                        setError('');
                      }}
                    />
                  </div>
                )}
                  </>
                )}

                <div className="space-y-4 border-t pt-4">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Code className="h-5 w-5" />
                    类型生成配置
                  </h2>

                  <div className="space-y-2">
                    <Label htmlFor="rootTypeName">根类型名称</Label>
                    <Input
                      id="rootTypeName"
                      name="rootTypeName"
                      placeholder="ApiResponse"
                      value={rootTypeName}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      onChange={(event) => {
                        setRootNameTouched(true);
                        setRootTypeName(event.target.value);
                      }}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        id="saveToFile"
                        name="saveToFile"
                        type="checkbox"
                        checked={saveToFile}
                        onChange={(event) => setSaveToFile(event.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                      <Label htmlFor="saveToFile" className="flex items-center gap-2">
                        <Download className="h-4 w-4" />
                        生成时保存到文件
                      </Label>
                    </div>

                    {saveToFile && (
                      <div className="space-y-3 border-l-2 border-border pl-6">
                        <div className="space-y-2">
                          <Label htmlFor="fileName">文件名</Label>
                          <Input
                            id="fileName"
                            name="fileName"
                            placeholder="UsersTypes.ts"
                            value={fileName}
                            spellCheck={false}
                            onChange={(event) => {
                              setFileNameTouched(true);
                              setFileName(event.target.value);
                            }}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="savePath">保存路径</Label>
                          <Input
                            id="savePath"
                            name="savePath"
                            placeholder={systemInfo?.defaultSavePath || '~/quick-type-types'}
                            value={savePath}
                            spellCheck={false}
                            onChange={(event) => setSavePath(event.target.value)}
                          />
                          <PathShortcuts
                            homeDir={systemInfo?.homeDir}
                            defaultPath={systemInfo?.defaultSavePath}
                            onSelect={setSavePath}
                          />
                          {systemInfo && (
                            <p className="text-sm text-muted-foreground">
                              默认路径: {systemInfo.defaultSavePath}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={isLoading} className="flex-1">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        生成中...
                      </>
                    ) : (
                      <>
                        <Code className="mr-2 h-4 w-4" />
                        生成类型
                      </>
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleClear} disabled={isLoading}>
                    清空
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {source === 'url' && (
          <HeaderEditor headers={headers} onHeadersChange={setHeaders} />
          )}
        </div>

        <div className="space-y-6 md:sticky md:top-6 md:self-start">
          {result && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    生成的 TypeScript 类型
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                      {copied ? (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          已复制
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-4 w-4" />
                          复制
                        </>
                      )}
                    </Button>
                    <Button type="button" size="sm" onClick={openSaveDialog}>
                      <Download className="mr-2 h-4 w-4" />
                      保存到文件
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  复制类型定义，或保存到本机主目录下的文件
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="quicktype-code overflow-hidden rounded-md">
                  <SyntaxHighlighter
                    language="typescript"
                    style={oneDark}
                    customStyle={{
                      margin: 0,
                      fontSize: '0.875rem',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}
                    codeTagProps={{
                      style: {
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      },
                    }}
                    showLineNumbers
                    wrapLongLines
                  >
                    {result}
                  </SyntaxHighlighter>
                </div>
                {originalJson && (
                  <details className="rounded-md border border-input">
                    <summary className="min-h-12 cursor-pointer px-3 py-3 text-sm font-medium">
                      原始响应
                    </summary>
                    <div className="quicktype-code border-t border-input">
                      <SyntaxHighlighter
                        language="json"
                        style={oneDark}
                        customStyle={{
                          margin: 0,
                          fontSize: '0.875rem',
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                        }}
                        codeTagProps={{
                          style: {
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'anywhere',
                          },
                        }}
                        showLineNumbers
                        wrapLongLines
                      >
                        {originalJson}
                      </SyntaxHighlighter>
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          )}

          {!result && !error && (
            <Card>
              <CardHeader>
                <CardTitle>使用说明</CardTitle>
                <CardDescription>如何快速生成 TypeScript 类型定义</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="space-y-2">
                  <h3 className="font-medium">1. 输入 API URL</h3>
                  <p className="text-muted-foreground">输入 API 地址，或切换到「粘贴 JSON」直接生成</p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-medium">2. 选择请求方法</h3>
                  <p className="text-muted-foreground">GET 直接读取响应；POST、PUT、PATCH 可以附带 JSON 请求体</p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-medium">3. 添加请求头（可选）</h3>
                  <p className="text-muted-foreground">需要认证时，展开下方面板添加 Authorization 等请求头</p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-medium">4. 生成类型定义</h3>
                  <p className="text-muted-foreground">生成后可以复制，或保存到主目录下的 .ts 文件</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <dialog
        ref={noticeDialogRef}
        aria-labelledby="notice-dialog-title"
        aria-describedby="notice-dialog-body"
        className="!m-auto w-[min(36rem,calc(100%-2rem))] rounded-lg border bg-background p-6 text-foreground shadow-lg"
        onClose={() => setNotice('')}
        {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      >
        <h2 id="notice-dialog-title" className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Check className="h-5 w-5" />
          提示
        </h2>
        <p id="notice-dialog-body" className="text-sm leading-6 [overflow-wrap:anywhere]">{notice}</p>
        <form method="dialog" className="mt-6">
          <Button type="submit" className="w-full">知道了</Button>
        </form>
      </dialog>

      <dialog
        ref={saveDialogRef}
        aria-labelledby="save-dialog-title"
        className="!m-auto w-[min(28rem,calc(100%-2rem))] rounded-lg border bg-background p-6 text-foreground shadow-lg"
        {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      >
        <h2 id="save-dialog-title" className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Download className="h-5 w-5" />
          保存到文件
        </h2>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void confirmSaveToFile();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="tempFileName">文件名</Label>
              <Input
              id="tempFileName"
              name="fileName"
              required
              placeholder="UsersTypes.ts"
              value={tempFileName}
              spellCheck={false}
              onInvalid={(event) => event.currentTarget.setCustomValidity('请填写文件名')}
              onChange={(event) => {
                event.currentTarget.setCustomValidity('');
                setTempFileName(event.target.value);
                setSaveError('');
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tempSavePath">保存路径</Label>
            <Input
              id="tempSavePath"
              name="savePath"
              required
              placeholder={systemInfo?.defaultSavePath || '~/quick-type-types'}
              value={tempSavePath}
              spellCheck={false}
              onInvalid={(event) => event.currentTarget.setCustomValidity('请填写保存路径')}
              onChange={(event) => {
                event.currentTarget.setCustomValidity('');
                setTempSavePath(event.target.value);
                setSaveError('');
              }}
            />
            <PathShortcuts
              homeDir={systemInfo?.homeDir}
              defaultPath={systemInfo?.defaultSavePath}
              onSelect={setTempSavePath}
            />
          </div>
          {saveError && (
            <p role="alert" className="text-sm text-destructive">{saveError}</p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  保存
                </>
              )}
            </Button>
          </div>
        </form>
        <form method="dialog" className="mt-2">
          <Button type="submit" variant="outline" className="w-full" disabled={isSaving}>
            取消
          </Button>
        </form>
      </dialog>
    </main>
  );
};
