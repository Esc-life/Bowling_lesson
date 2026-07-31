import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages 프로젝트 페이지는 /Bowling_lesson/ 하위에서, Vercel은 루트(/)에서
  // 서빙된다. 상대경로를 쓰면 문서 위치 기준으로 풀려서 양쪽 모두 동작한다.
  base: './',
  server: { port: 5173 },
  build: { target: 'es2022' },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
