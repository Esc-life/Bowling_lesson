/**
 * 교사 계정 전용 — 자신이 register_student로 만든 학생들의 진행률을 본다.
 *
 * 교사 인증 코드는 로그인할 때(PlayerPicker) 이미 확인해 `players.current`에
 * 저장돼 있다 — 여기서 또 묻지 않고 그 값으로 열자마자 바로 불러온다.
 */

import { listStudents, type StudentRecord } from '../net/PlayerSync';
import { players } from '../players/PlayerStore';
import { allLessons } from '../tutorial/curriculum';
import { TutorialFlow } from '../tutorial/TutorialFlow';
import { escapeHtml } from '../util/html';

function lessonCountOf(progress: StudentRecord['progress']): { done: number; total: number } {
  const flow = new TutorialFlow(progress);
  const total = allLessons().length;
  const done = allLessons().filter((l) => flow.isCompleted(l.lessonId)).length;
  return { done, total };
}

function quizAverage(progress: StudentRecord['progress']): string {
  const scores = Object.values(progress.quizScores);
  if (scores.length === 0) return '퀴즈 기록 없음';
  const ratio = scores.reduce((sum, s) => sum + s.correct / s.total, 0) / scores.length;
  return `퀴즈 평균 ${Math.round(ratio * 100)}%`;
}

function formatUpdatedAt(iso: string): string {
  if (iso.length === 0) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 셀 안에 쉼표·줄바꿈·따옴표가 있어도 스프레드시트가 한 칸으로 읽도록 감싼다 */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(students: readonly StudentRecord[]): string {
  const header = ['이름', '코드', '손', '배운 레슨', '퀴즈 평균', '최근 갱신'];
  const rows = students.map((s) => {
    const { done, total } = lessonCountOf(s.progress);
    return [
      s.name,
      s.code,
      s.handedness === 'left' ? '왼손' : '오른손',
      `${done}/${total}`,
      quizAverage(s.progress),
      formatUpdatedAt(s.updatedAt),
    ];
  });
  // 엑셀이 한글을 깨진 글자로 읽지 않도록 UTF-8 BOM을 앞에 붙인다.
  return '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; students: StudentRecord[] };

export class TeacherDashboard {
  readonly element: HTMLElement;
  private state: State = { kind: 'loading' };

  constructor(private readonly onClose: () => void) {
    this.element = document.createElement('div');
    this.element.className = 'overlay teacher-dashboard';
    this.element.hidden = true;
    this.element.addEventListener('click', (e) => this.handleClick(e));
    this.render();
  }

  show(): void {
    this.state = { kind: 'loading' };
    this.element.hidden = false;
    this.render();
    void this.load();
  }

  hide(): void {
    this.element.hidden = true;
  }

  private render(): void {
    this.element.innerHTML =
      this.state.kind === 'ok'
        ? this.listHtml(this.state.students)
        : this.state.kind === 'error'
          ? this.errorHtml(this.state.message)
          : this.loadingHtml();
  }

  private loadingHtml(): string {
    return `
      <div class="panel">
        <h1>학생 기록</h1>
        <p class="lead">불러오는 중…</p>
      </div>
    `;
  }

  private errorHtml(message: string): string {
    return `
      <div class="panel">
        <h1>학생 기록</h1>
        <p class="form-error" role="alert">${escapeHtml(message)}</p>
        <div class="row-buttons">
          <button type="button" class="text-btn" data-close="1">닫기</button>
        </div>
      </div>
    `;
  }

  private listHtml(students: StudentRecord[]): string {
    const rows =
      students.length === 0
        ? '<p class="note">아직 등록한 학생이 없어요.</p>'
        : `<ul class="student-list">${students
            .map((s) => {
              const { done, total } = lessonCountOf(s.progress);
              const handLabel = s.handedness === 'left' ? '왼손' : '오른손';
              const updated = formatUpdatedAt(s.updatedAt);
              return `
                <li class="student-row">
                  <div class="student-row-top">
                    <span class="student-name">${escapeHtml(s.name)}</span>
                    <span class="register-code">${escapeHtml(s.code)}</span>
                  </div>
                  <span class="student-meta">
                    ${handLabel} · ${done}/${total} 배움 · ${escapeHtml(quizAverage(s.progress))}
                    ${updated.length > 0 ? `· ${escapeHtml(updated)} 갱신` : ''}
                  </span>
                </li>
              `;
            })
            .join('')}</ul>`;

    return `
      <div class="panel">
        <div class="dashboard-head">
          <h1>학생 기록</h1>
          <span class="dashboard-count">총 ${students.length}명</span>
        </div>
        ${rows}
        <div class="row-buttons">
          ${
            students.length > 0
              ? '<button type="button" class="text-btn" data-download-csv="1">⬇ 명단 다운로드 (.csv)</button>'
              : ''
          }
          <button type="button" class="text-btn" data-close="1">닫기</button>
        </div>
      </div>
    `;
  }

  private handleClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-close],[data-download-csv]');
    if (el === null) return;
    const d = el.dataset;

    if (d['downloadCsv'] !== undefined) {
      if (this.state.kind !== 'ok') return;
      const teacherName = players.current?.name ?? '학생';
      const today = new Date().toISOString().slice(0, 10);
      downloadCsv(`학생명단_${teacherName}_${today}.csv`, toCsv(this.state.students));
      return;
    }
    this.onClose();
  }

  private async load(): Promise<void> {
    const teacher = players.current;
    if (teacher === null || teacher.isMaster !== true || teacher.teacherCode === undefined) {
      this.state = { kind: 'error', message: '선생님 계정으로 다시 들어와 주세요.' };
      this.render();
      return;
    }

    const result = await listStudents(teacher.teacherCode, teacher.name);
    if (result.kind === 'offline') {
      this.state = { kind: 'error', message: '지금은 확인할 수 없어요. 인터넷 연결을 확인해 주세요.' };
      this.render();
      return;
    }
    if (result.kind === 'auth_failed') {
      this.state = { kind: 'error', message: '인증 코드가 달라요. 선생님 계정으로 다시 들어와 주세요.' };
      this.render();
      return;
    }
    this.state = { kind: 'ok', students: result.students };
    this.render();
  }
}
