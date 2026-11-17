import { CorsOptions } from 'cors';

/**
 * CORS 配置
 */
export const corsOptions: CorsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost',
    'https://1996tsk.com',
    'https://1996tsk.top',
    'http://localhost:8080',
    'https://quicktype.vercel.app',
    'https://quicktype.netlify.app',
  ],
  credentials: true,
};
