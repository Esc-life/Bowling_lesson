import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages 프로젝트 페이지(esc-life.github.io/Bowling_lesson/)는
  // 루트가 아니라 저장소 이름의 하위 경로에서 서빙된다.
  base: '/Bowling_lesson/',
  server: { port: 5173 },
  build: { target: 'es2022' },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
