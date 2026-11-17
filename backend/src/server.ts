import { createApp } from './app';

/**
 * 启动服务器
 */
function startServer(): void {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 8787;
  const HOST = process.env.HOST || '0.0.0.0';

  app.listen(PORT, HOST, () => {
    console.log(`🚀 服务器运行在 http://${HOST}:${PORT}`);
    console.log(`📊 健康检查: http://${HOST}:${PORT}/health`);
  });
}

// 启动服务器
startServer();
