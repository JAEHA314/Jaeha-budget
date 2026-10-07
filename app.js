import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.JAEHA_BUDGET_CONFIG || {};
const root = document.querySelector('#app');

if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) {
  root.innerHTML = 'Supabase config 오류';
  throw new Error('config');
}

const db = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

let user = null;
let tx = [];
let settings = {
  custom_categories: [],
  savings_goals: []
};

let month = new Date();
let view = '홈';

/* 내역 화면 상태 */
let historyMode = 'month'; // month | year
let filter = '전체';
let categoryFilter = '전체';
let searchQuery = '';
let selectedDate = null;

/* 통계 */
let statKind = '지출';

const kinds = ['수입', '지출', '저축', '투자'];

const defaults = {
  수입: ['급여', '부업', '용돈', '캐시백', '이자', '기타'],
  지출: [
    '식비',
    '데이트비',
    '구독서비스',
    '통신요금',
    '쇼핑',
    '교통비',
    '의료비',
    '여가생활비',
    '기타'
  ],
  저축: ['적금', '예금', '청약', '비상금', '기타'],
  투자: ['매수', '매도', '배당', '배당금']
};

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

const num = n =>
  new Intl.NumberFormat('ko-KR').format(
    Math.round(Number(n || 0))
  );

const won = n => `₩${num(n)}`;

const ym = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

function date(iso) {
  const d = new Date(iso);

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

function dateParts(iso) {
  const d = new Date(iso);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    weekday: weekdays[d.getDay()]
  };
}

function shortDate(iso) {
  const p = dateParts(iso);
  return `${p.month}/${p.day} ${p.weekday}`;
}

function inv(t) {
  if (t.kind !== '투자') return null;

  const c = String(t.category || '');

  if (c.includes('매수')) return 'buy';

  if (
    c.includes('매도') ||
    c.includes('배당')
  ) return 'plus';

  return 'other';
}

function sign(t) {
  if (t.kind === '수입') return '+';
  if (t.kind === '지출') return '−';

  if (t.kind === '투자') {
    if (inv(t) === 'plus') return '+';
    if (inv(t) === 'buy') return '−';
  }

  return '';
}

function money(t) {
  return `${sign(t)}${won(t.amount)}`;
}

function signedValue(t) {
  const amount = Number(t.amount || 0);

  if (t.kind === '수입') return amount;
  if (t.kind === '지출') return -amount;

  if (t.kind === '투자') {
    if (inv(t) === 'plus') return amount;
    if (inv(t) === 'buy') return -amount;
  }

  /* 저축은 현금흐름 계산에서 제외 */
  return 0;
}

function calc(v) {
  const s = String(v)
    .replace(/,/g, '')
    .trim();

  if (!s) throw new Error('금액을 입력해주세요.');

  if (!/^[0-9+\-*/().\s]+$/.test(s)) {
    throw new Error('금액을 확인해주세요.');
  }

  const n = Function(
    `"use strict"; return (${s})`
  )();

  if (!Number.isFinite(n) || n < 0) {
    throw new Error('금액을 확인해주세요.');
  }

  return Math.round(n);
}

function sum(items) {
  const kindTotal = kind =>
    items
      .filter(t => t.kind === kind)
      .reduce((s, t) => s + Number(t.amount), 0);

  const plus = items
    .filter(t => inv(t) === 'plus')
    .reduce((s, t) => s + Number(t.amount), 0);

  const buy = items
    .filter(t => inv(t) === 'buy')
    .reduce((s, t) => s + Number(t.amount), 0);

  const income = kindTotal('수입');
  const expense = kindTotal('지출');
  const saving = kindTotal('저축');

  return {
    income,
    expense,
    saving,
    plus,
    buy,

    /* 저축 제외 */
    balance:
      income +
      plus -
      expense -
      buy
  };
}

function monthly() {
  return tx.filter(t =>
    date(t.date).startsWith(ym(month))
  );
}

function yearly() {
  const y = month.getFullYear();

  return tx.filter(t =>
    new Date(t.date).getFullYear() === y
  );
}

function allCategoriesForKind(kind) {
  const custom = (settings.custom_categories || [])
    .filter(x => {
      const raw =
        x.kindRawValue ||
        x.kind ||
        x.type;

      return !kind || raw === kind;
    })
    .map(x => x.name)
    .filter(Boolean);

  if (kind && kind !== '전체') {
    return [
      ...new Set([
        ...(defaults[kind] || []),
        ...custom
      ])
    ];
  }

  const fromDefaults =
    Object.values(defaults).flat();

  const fromTransactions =
    tx.map(t => t.category).filter(Boolean);

  return [
    ...new Set([
      ...fromDefaults,
      ...custom,
      ...fromTransactions
    ])
  ];
}

/* ---------------------------
   카테고리 아이콘
---------------------------- */

function categoryIcon(t) {
  const c = String(t.category || '').toLowerCase();

  if (c.includes('구독')) return '▰';
  if (c.includes('통신')) return '▯';
  if (c.includes('이자')) return '%';
  if (c.includes('부업')) return '▣';

  if (
    c.includes('적금') ||
    c.includes('예금')
  ) return '▥';

  if (c.includes('청약')) return '◆';

  if (
    c.includes('배당') ||
    c.includes('매도')
  ) return '▤';

  if (c.includes('매수')) return '↓';

  if (
    c.includes('급여') ||
    c.includes('용돈')
  ) return '✣';

  if (c.includes('캐시백')) return '◉';

  if (c.includes('교통')) return '●';
  if (c.includes('의료')) return '+';
  if (c.includes('쇼핑')) return '▱';
  if (c.includes('식비')) return '●';

  return '+';
}

/* ---------------------------
   데이터
---------------------------- */

async function load() {
  const [
    { data: a, error: e },
    { data: b, error: f }
  ] = await Promise.all([
    db
      .from('transactions')
      .select('*')
      .order('date', { ascending: false }),

    db
      .from('settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
  ]);

  if (e || f) throw (e || f);

  tx = a || [];
  settings = b || settings;

  render();
}

/* ---------------------------
   로그인
---------------------------- */

function auth(msg = '') {
  root.innerHTML = `
    <main class="auth">
      <h1>재하 가계부</h1>

      <form id="login" class="panel">
        <label>이메일</label>
        <input
          name="email"
          type="email"
          required
        >

        <label>비밀번호</label>
        <input
          name="password"
          type="password"
          required
        >

        <div class="actions">
          <button>로그인</button>

          <button
            type="button"
            class="soft"
            id="signup"
          >
            첫 계정 만들기
          </button>
        </div>

        <p>${esc(msg)}</p>
      </form>
    </main>
  `;

  const f = root.querySelector('#login');

  f.onsubmit = async e => {
    e.preventDefault();

    const x = new FormData(f);

    const { error } =
      await db.auth.signInWithPassword({
        email: x.get('email'),
        password: x.get('password')
      });

    if (error) auth(error.message);
  };

  root.querySelector('#signup').onclick =
    async () => {
      const x = new FormData(f);

      const { error } =
        await db.auth.signUp({
          email: x.get('email'),
          password: x.get('password')
        });

      auth(
        error
          ? error.message
          : '이메일 인증 후 로그인하세요.'
      );
    };
}

/* ---------------------------
   공통 상단
---------------------------- */

function nav() {
  return `
    <header class="nav">

      <div class="nav-capsule">
        ${[
          '홈',
          '내역',
          '캘린더',
          '통계',
          '설정'
        ].map(x => `
          <button
            data-view="${x}"
            class="${view === x ? 'on' : ''}"
          >
            ${x}
          </button>
        `).join('')}
      </div>

      <button
        id="add"
        class="add"
        aria-label="거래 추가"
      >
        ＋
      </button>

    </header>
  `;
}

function monthbar({
  yearlyMode = false
} = {}) {
  const title = yearlyMode
    ? `${month.getFullYear()}년`
    : `${month.getFullYear()}년 ${month.getMonth() + 1}월`;

  return `
    <div class="month">

      <button
        id="prev"
        aria-label="이전"
      >
        ‹
      </button>

      <div>
        <b>${title}</b>

        <button id="today">
          오늘
        </button>
      </div>

      <button
        id="next"
        aria-label="다음"
      >
        ›
      </button>

    </div>
  `;
}

/* ---------------------------
   홈
---------------------------- */

function cards(s) {
  return `
    <div class="cards">

      <article>
        <span>↙　수입</span>
        <b>+${won(s.income)}</b>
      </article>

      <article>
        <span>↗　지출</span>
        <b>−${won(s.expense)}</b>
      </article>

      <article>
        <span>▣　저축</span>
        <b>${won(s.saving)}</b>
      </article>

      <article>
        <span>⌁　투자</span>

        <div class="invest">
          <small>
            매도·배당
            <b>+${won(s.plus)}</b>
          </small>

          <small>
            매수
            <b>−${won(s.buy)}</b>
          </small>
        </div>
      </article>

    </div>
  `;
}

function home() {
  const items = monthly();
  const s = sum(items);

  let balanceText;

  if (s.balance > 0) {
    balanceText = `+${won(s.balance)}`;
  } else if (s.balance < 0) {
    balanceText =
      `−${won(Math.abs(s.balance))}`;
  } else {
    balanceText = won(0);
  }

  return `
    ${monthbar()}

    <section class="balance">
      <span>이번 달 생활수지</span>
      <b>${balanceText}</b>
    </section>

    ${cards(s)}

    <h3>
      저축 목표
      <small>＋ 추가</small>
    </h3>

    <div class="goal">
      ◎　목표를 만들어보세요
      <br>
      <small>
        목표 금액과 현재 금액을 기록해
        진행률을 볼 수 있어요.
      </small>
    </div>

    <h3>
      최근 내역
      <small>8건 표시</small>
    </h3>

    ${rows(items.slice(0, 8))}
  `;
}

/* ---------------------------
   거래 리스트
---------------------------- */

function rows(items) {
  if (!items.length) {
    return `
      <div class="empty">
        거래가 없어요.
      </div>
    `;
  }

  return `
    <div class="rows">

      ${items.map(t => `
        <div
          class="row"
          data-id="${t.id}"
        >

          <div class="row-icon">
            ${categoryIcon(t)}
          </div>

          <div class="row-copy">

            <b class="row-title">
              ${esc(t.title)}
            </b>

            <small class="row-meta">
              ${esc(t.category)}
              ·
              ${shortDate(t.date)}
            </small>

            ${
              String(t.note || '').trim()
                ? `
                  <small class="row-note">
                    ${esc(t.note)}
                  </small>
                `
                : ''
            }

          </div>

          <strong class="row-amount">
            ${money(t)}
          </strong>

        </div>
      `).join('')}

    </div>
  `;
}

/* ---------------------------
   내역
---------------------------- */

function historyBaseItems() {
  let items;

  if (selectedDate) {
    items = tx.filter(t =>
      date(t.date) === selectedDate
    );
  } else {
    items =
      historyMode === 'year'
        ? yearly()
        : monthly();
  }

  if (filter !== '전체') {
    items = items.filter(t =>
      t.kind === filter
    );
  }

  if (categoryFilter !== '전체') {
    items = items.filter(t =>
      t.category === categoryFilter
    );
  }

  if (searchQuery.trim()) {
    const q =
      searchQuery.trim().toLowerCase();

    items = items.filter(t =>
      [
        t.title,
        t.category,
        t.note
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }

  return items;
}

function historySummary(items) {
  const count = items.length;

  /*
    현재 필터 결과의 표시용 합계.
    저축만 선택된 경우에는 저축 총액을 그대로 표시.
    나머지는 현금흐름 부호를 적용.
  */

  let total;

  if (filter === '저축') {
    total = items.reduce(
      (s, t) =>
        s + Number(t.amount || 0),
      0
    );

    return `${count}건　총 ${won(total)}`;
  }

  if (filter === '투자') {
    total = items.reduce(
      (s, t) =>
        s + signedValue(t),
      0
    );
  } else if (filter === '수입') {
    total = items.reduce(
      (s, t) =>
        s + Number(t.amount || 0),
      0
    );
  } else if (filter === '지출') {
    total = -items.reduce(
      (s, t) =>
        s + Number(t.amount || 0),
      0
    );
  } else {
    total = items.reduce(
      (s, t) =>
        s + signedValue(t),
      0
    );
  }

  const text =
    total > 0
      ? `+${won(total)}`
      : total < 0
        ? `−${won(Math.abs(total))}`
        : won(0);

  return `${count}건　총 ${text}`;
}

function categoryOptions() {
  return allCategoriesForKind(filter);
}

function history() {
  const items = historyBaseItems();
  const categories = categoryOptions();

  let periodTitle;

  if (selectedDate) {
    const d =
      new Date(`${selectedDate}T12:00:00`);

    periodTitle =
      `${d.getFullYear()}년 ` +
      `${d.getMonth() + 1}월 ` +
      `${d.getDate()}일`;
  } else if (historyMode === 'year') {
    periodTitle =
      `${month.getFullYear()}년`;
  } else {
    periodTitle =
      `${month.getFullYear()}년 ` +
      `${month.getMonth() + 1}월`;
  }

  return `
    <section class="history-toolbar">

      <div class="history-period-toggle">
        <button
          data-history-mode="month"
          class="${historyMode === 'month' ? 'on' : ''}"
        >
          월
        </button>

        <button
          data-history-mode="year"
          class="${historyMode === 'year' ? 'on' : ''}"
        >
          연
        </button>
      </div>

      <div class="history-search-wrap">
        <input
          id="search"
          value="${esc(searchQuery)}"
          placeholder="⌕ 이름, 카테고리, 메모 검색"
        >
      </div>

      <div class="history-period-nav">

        <button
          id="prev"
          aria-label="이전"
        >
          ‹
        </button>

        <b>${periodTitle}</b>

        <button
          id="today"
          class="history-today"
        >
          오늘
        </button>

        <button
          id="next"
          aria-label="다음"
        >
          ›
        </button>

      </div>

      <div class="history-filter-row">

        <div class="tabs">
          ${[
            '전체',
            ...kinds
          ].map(x => `
            <button
              data-filter="${x}"
              class="${filter === x ? 'on' : ''}"
            >
              ${x}
            </button>
          `).join('')}
        </div>

        <div class="category-filter-wrap">

          <button
            id="categoryButton"
            class="category-button"
          >
            ◇
            ${
              categoryFilter === '전체'
                ? '카테고리'
                : esc(categoryFilter)
            }
           ⌄
          </button>

          <div
            id="categoryMenu"
            class="category-menu"
            hidden
          >

            <button
              data-category="전체"
              class="${
                categoryFilter === '전체'
                  ? 'on'
                  : ''
              }"
            >
              <span>⌘</span>
              전체 카테고리
            </button>

            ${categories.map(c => `
              <button
                data-category="${esc(c)}"
                class="${
                  categoryFilter === c
                    ? 'on'
                    : ''
                }"
              >
                <span>
                  ${categoryIcon({
                    kind: filter,
                    category: c
                  })}
                </span>

                ${esc(c)}
              </button>
            `).join('')}

          </div>

        </div>

      </div>

      <div class="history-result-summary">
        ${historySummary(items)}
      </div>

      ${
        selectedDate
          ? `
            <button
              id="clearDate"
              class="clear-date"
            >
              날짜 필터 해제
            </button>
          `
          : ''
      }

    </section>

    <div id="result">
      ${rows(items)}
    </div>
  `;
}

/* ---------------------------
   캘린더
---------------------------- */

function calendarCardClass(t) {
  if (t.kind === '수입') return 'income';
  if (t.kind === '지출') return 'expense';
  if (t.kind === '저축') return 'saving';
  if (t.kind === '투자') return 'investment';

  return '';
}

function dailyCashflow(items) {
  return items.reduce(
    (s, t) =>
      s + signedValue(t),
    0
  );
}

function cashflowText(value) {
  if (value > 0) {
    return {
      className: 'positive',
      text: `+${won(value)}`
    };
  }

  if (value < 0) {
    return {
      className: 'negative',
      text:
        `−${won(Math.abs(value))}`
    };
  }

  return {
    className: 'zero',
    text: won(0)
  };
}

function calendar() {
  const y = month.getFullYear();
  const m = month.getMonth();

  /* 일요일 시작 */
  const start =
    new Date(y, m, 1).getDay();

  const days =
    new Date(y, m + 1, 0).getDate();

  const prevDays =
    new Date(y, m, 0).getDate();

  let cells = '';

  for (let i = 0; i < 42; i++) {
    const n =
      i - start + 1;

    let d;

    if (n < 1) {
      d = new Date(
        y,
        m - 1,
        prevDays + n,
        12
      );
    } else if (n > days) {
      d = new Date(
        y,
        m + 1,
        n - days,
        12
      );
    } else {
      d = new Date(
        y,
        m,
        n,
        12
      );
    }

    const key =
      date(d.toISOString());

    const items =
      tx.filter(t =>
        date(t.date) === key
      );

    const flow =
      dailyCashflow(items);

    const flowInfo =
      cashflowText(flow);

    const isOther =
      d.getMonth() !== m;

    const todayKey =
      date(new Date().toISOString());

    const isToday =
      key === todayKey;

    cells += `
      <div
        class="
          day
          ${isOther ? 'other' : ''}
          ${isToday ? 'today-cell' : ''}
        "
      >

        <div class="day-head">

          <button
            class="day-number"
            data-open-date="${key}"
            title="이 날짜의 내역 보기"
          >
            ${d.getDate()}
          </button>

          ${
            items.length
              ? `
                <span
                  class="
                    day-flow
                    ${flowInfo.className}
                  "
                >
                  ${flowInfo.text}
                </span>
              `
              : ''
          }

          <button
            class="day-add"
            data-add-date="${key}"
            aria-label="${key} 거래 추가"
          >
            ＋
          </button>

        </div>

        <div class="calendar-items">

          ${items.slice(0, 3).map(t => `
            <button
              class="
                calendar-item
                ${calendarCardClass(t)}
              "
              data-id="${t.id}"
            >
              <b>${esc(t.title)}</b>

              <strong>
                ${money(t)}
              </strong>

              <small>
                ${esc(t.category)}
              </small>
            </button>
          `).join('')}

        </div>

        ${
          items.length > 3
            ? `
              <small class="more-count">
                +${items.length - 3}건
              </small>
            `
            : ''
        }

      </div>
    `;
  }

  return `
    ${monthbar()}

    <div class="week">
      ${[
        '일',
        '월',
        '화',
        '수',
        '목',
        '금',
        '토'
      ].map(x => `
        <span>${x}</span>
      `).join('')}
    </div>

    <div class="calendar">
      ${cells}
    </div>
  `;
}

/* ---------------------------
   통계
---------------------------- */

function stats() {
  const y =
    month.getFullYear();

  const values = [];

  for (let m = 0; m < 12; m++) {
    const s = sum(
      tx.filter(t => {
        const d = new Date(t.date);

        return (
          d.getFullYear() === y &&
          d.getMonth() === m
        );
      })
    );

    let value;

    if (statKind === '수입') {
      value = s.income;
    } else if (statKind === '지출') {
      value = s.expense;
    } else if (statKind === '저축') {
      value = s.saving;
    } else if (statKind === '투자') {
      value = s.plus - s.buy;
    } else {
      value = s.balance;
    }

    values.push(value);
  }

  const max =
    Math.max(
      1,
      ...values.map(Math.abs)
    );

  return `
    <div class="statTabs">

      ${[
        '수입',
        '지출',
        '저축',
        '투자',
        '생활수지'
      ].map(x => `
        <button
          data-stat="${x}"
          class="${statKind === x ? 'on' : ''}"
        >
          ${x}
        </button>
      `).join('')}

    </div>

    <div class="year">

      <button id="py">
        ‹
      </button>

      <b>${y}년</b>

      <button id="ny">
        ›
      </button>

    </div>

    <div class="chart">

      ${values.map((x, i) => `
        <div>

          <i
            style="
              height:
              ${Math.max(
                2,
                Math.abs(x) / max * 220
              )}px
            "
          ></i>

          <span>
            ${i + 1}월
          </span>

        </div>
      `).join('')}

    </div>
  `;
}

/* ---------------------------
   설정
---------------------------- */

function settingsHTML() {
  return `
    <div class="settings">

      <h3>데이터</h3>

      <p>
        기존 Swift 백업을 가져오거나
        현재 데이터를 백업합니다.
      </p>

      <div class="actions">

        <label class="button">
          JSON으로 덮어쓰기

          <input
            id="import"
            type="file"
            accept=".json"
            hidden
          >
        </label>

        <button
          class="soft"
          id="export"
        >
          JSON 백업
        </button>

      </div>

      <p id="datamsg"></p>

      <hr>

      <button
        class="soft"
        id="logout"
      >
        로그아웃
      </button>

    </div>
  `;
}

/* ---------------------------
   렌더
---------------------------- */

function render() {
  let content;

  if (view === '홈') {
    content = home();
  } else if (view === '내역') {
    content = history();
  } else if (view === '캘린더') {
    content = calendar();
  } else if (view === '통계') {
    content = stats();
  } else {
    content = settingsHTML();
  }

  root.innerHTML = `
    <div class="shell">
      ${nav()}

      <main>
        ${content}
      </main>
    </div>
  `;

  bind();
}

/* ---------------------------
   이벤트
---------------------------- */

function bind() {

  root
    .querySelectorAll('[data-view]')
    .forEach(b => {
      b.onclick = () => {
        view = b.dataset.view;

        if (view !== '내역') {
          selectedDate = null;
        }

        render();
      };
    });

  root
    .querySelector('#add')
    ?.addEventListener(
      'click',
      () => sheet()
    );

  root
    .querySelector('#prev')
    ?.addEventListener(
      'click',
      () => {
        selectedDate = null;

        if (
          view === '내역' &&
          historyMode === 'year'
        ) {
          month =
            new Date(
              month.getFullYear() - 1,
              month.getMonth(),
              1
            );
        } else {
          month =
            new Date(
              month.getFullYear(),
              month.getMonth() - 1,
              1
            );
        }

        render();
      }
    );

  root
    .querySelector('#next')
    ?.addEventListener(
      'click',
      () => {
        selectedDate = null;

        if (
          view === '내역' &&
          historyMode === 'year'
        ) {
          month =
            new Date(
              month.getFullYear() + 1,
              month.getMonth(),
              1
            );
        } else {
          month =
            new Date(
              month.getFullYear(),
              month.getMonth() + 1,
              1
            );
        }

        render();
      }
    );

  root
    .querySelector('#today')
    ?.addEventListener(
      'click',
      () => {
        month = new Date();
        selectedDate = null;
        render();
      }
    );

  root
    .querySelectorAll('[data-id]')
    .forEach(r => {
      r.onclick = e => {
        e.stopPropagation();

        const item =
          tx.find(
            t =>
              String(t.id) ===
              String(r.dataset.id)
          );

        if (item) sheet(item);
      };
    });

  /* 캘린더 + 버튼 */
  root
    .querySelectorAll('[data-add-date]')
    .forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        sheet(null, b.dataset.addDate);
      };
    });

  /* 캘린더 날짜 클릭 → 내역 */
  root
    .querySelectorAll('[data-open-date]')
    .forEach(b => {
      b.onclick = e => {
        e.stopPropagation();

        selectedDate =
          b.dataset.openDate;

        const d =
          new Date(
            `${selectedDate}T12:00:00`
          );

        month = new Date(
          d.getFullYear(),
          d.getMonth(),
          1
        );

        view = '내역';
        historyMode = 'month';
        filter = '전체';
        categoryFilter = '전체';
        searchQuery = '';

        render();
      };
    });

  /* 월 / 연 */
  root
    .querySelectorAll(
      '[data-history-mode]'
    )
    .forEach(b => {
      b.onclick = () => {
        historyMode =
          b.dataset.historyMode;

        selectedDate = null;
        render();
      };
    });

  /* 수입/지출/저축/투자 */
  root
    .querySelectorAll('[data-filter]')
    .forEach(b => {
      b.onclick = () => {
        filter =
          b.dataset.filter;

        /*
          거래 종류가 바뀌면 기존 카테고리
          필터는 초기화
        */
        categoryFilter = '전체';

        render();
      };
    });

  /* 카테고리 메뉴 */
  const categoryButton =
    root.querySelector(
      '#categoryButton'
    );

  const categoryMenu =
    root.querySelector(
      '#categoryMenu'
    );

  if (
    categoryButton &&
    categoryMenu
  ) {
    categoryButton.onclick = e => {
      e.stopPropagation();

      categoryMenu.hidden =
        !categoryMenu.hidden;
    };

    categoryMenu
      .querySelectorAll(
        '[data-category]'
      )
      .forEach(b => {
        b.onclick = e => {
          e.stopPropagation();

          categoryFilter =
            b.dataset.category;

          render();
        };
      });

    document.onclick = () => {
      if (categoryMenu) {
        categoryMenu.hidden = true;
      }
    };
  }

  /* 날짜 필터 해제 */
  root
    .querySelector('#clearDate')
    ?.addEventListener(
      'click',
      () => {
        selectedDate = null;
        render();
      }
    );

  /* 검색 */
  const q =
    root.querySelector('#search');

  if (q) {
    q.oninput = () => {
      searchQuery = q.value;

      const items =
        historyBaseItems();

      root.querySelector(
        '#result'
      ).innerHTML = rows(items);

      const summary =
        root.querySelector(
          '.history-result-summary'
        );

      if (summary) {
        summary.textContent =
          historySummary(items);
      }

      root
        .querySelectorAll(
          '#result [data-id]'
        )
        .forEach(r => {
          r.onclick = () => {
            const item =
              tx.find(
                t =>
                  String(t.id) ===
                  String(r.dataset.id)
              );

            if (item) sheet(item);
          };
        });
    };
  }

  /* 통계 */
  root
    .querySelectorAll('[data-stat]')
    .forEach(b => {
      b.onclick = () => {
        statKind =
          b.dataset.stat;

        render();
      };
    });

  root
    .querySelector('#py')
    ?.addEventListener(
      'click',
      () => {
        month =
          new Date(
            month.getFullYear() - 1,
            month.getMonth(),
            1
          );

        render();
      }
    );

  root
    .querySelector('#ny')
    ?.addEventListener(
      'click',
      () => {
        month =
          new Date(
            month.getFullYear() + 1,
            month.getMonth(),
            1
          );

        render();
      }
    );

  if (view === '설정') {
    bindSettings();
  }
}

/* ---------------------------
   카테고리
---------------------------- */

function cats(k) {
  const custom =
    (settings.custom_categories || [])
      .filter(x => {
        const raw =
          x.kindRawValue ||
          x.kind ||
          x.type;

        return raw === k;
      })
      .map(x => x.name)
      .filter(Boolean);

  const fromTransactions =
    tx
      .filter(t => t.kind === k)
      .map(t => t.category)
      .filter(Boolean);

  return [
    ...new Set([
      ...(defaults[k] || []),
      ...custom,
      ...fromTransactions
    ])
  ];
}

/* ---------------------------
   거래 추가/수정
---------------------------- */

function sheet(
  t = null,
  preset = null
) {
  const editing =
    !!t?.id;

  const initialKind =
    t?.kind || '지출';

  const el =
    document.createElement('div');

  el.className = 'modal';

  el.innerHTML = `
    <form class="sheet">

      <h2>
        ${editing ? '거래 수정' : '거래 추가'}
      </h2>

      <label>날짜</label>

      <input
        name="date"
        type="date"
        value="${
          preset ||
          (
            t
              ? date(t.date)
              : date(
                  new Date().toISOString()
                )
          )
        }"
        required
      >

      <label>구분</label>

      <div class="kind">

        ${kinds.map(x => `
          <button
            type="button"
            data-kind="${x}"
            class="${
              x === initialKind
                ? 'on'
                : ''
            }"
          >
            ${x}
          </button>
        `).join('')}

      </div>

      <input
        name="kind"
        type="hidden"
        value="${initialKind}"
      >

      <label>카테고리</label>

      <select
        name="category"
      ></select>

      <label>금액</label>

      <input
        name="amount"
        inputmode="decimal"
        value="${
          t
            ? num(t.amount)
            : ''
        }"
        required
      >

      <small id="preview"></small>

      <label>이름</label>

      <input
        name="title"
        value="${esc(t?.title || '')}"
        required
      >

      <label>메모</label>

      <textarea
        name="note"
      >${esc(t?.note || '')}</textarea>

      <p id="msg"></p>

      <div class="actions">

        ${
          editing
            ? `
              <button
                type="button"
                class="soft copy"
              >
                복사
              </button>

              <button
                type="button"
                class="soft repeat"
              >
                반복
              </button>

              <button
                type="button"
                class="soft delete"
              >
                삭제
              </button>
            `
            : ''
        }

        <button
          type="button"
          class="soft cancel"
        >
          취소
        </button>

        <button>
          저장
        </button>

      </div>

    </form>
  `;

  document.body.append(el);

  const f =
    el.querySelector('form');

  const kindInput =
    f.elements.kind;

  const categorySelect =
    f.elements.category;

  const amountInput =
    f.elements.amount;

  const preview =
    el.querySelector('#preview');

  function fillCategories() {
    const list =
      cats(kindInput.value);

    categorySelect.innerHTML =
      list.map(c => `
        <option
          value="${esc(c)}"
          ${
            c === t?.category
              ? 'selected'
              : ''
          }
        >
          ${esc(c)}
        </option>
      `).join('');
  }

  fillCategories();

  el
    .querySelectorAll('[data-kind]')
    .forEach(b => {
      b.onclick = () => {
        el
          .querySelectorAll(
            '[data-kind]'
          )
          .forEach(x =>
            x.classList.remove('on')
          );

        b.classList.add('on');

        kindInput.value =
          b.dataset.kind;

        fillCategories();
      };
    });

  amountInput.oninput = () => {
    const raw =
      amountInput.value
        .replace(/,/g, '');

    if (/^[0-9]+$/.test(raw)) {
      amountInput.value =
        num(raw);

      preview.textContent = '';
      return;
    }

    try {
      preview.textContent =
        /[+\-*/]/.test(raw)
          ? `= ${num(calc(raw))}`
          : '';
    } catch {
      preview.textContent = '';
    }
  };

  amountInput.onblur = () => {
    try {
      if (
        /[+\-*/]/.test(
          amountInput.value
        )
      ) {
        amountInput.value =
          num(
            calc(
              amountInput.value
            )
          );

        preview.textContent = '';
      }
    } catch {}
  };

  el
    .querySelector('.cancel')
    .onclick =
    () => el.remove();

  el.onclick = e => {
    if (e.target === el) {
      el.remove();
    }
  };

  f.onsubmit = async e => {
    e.preventDefault();

    try {
      const d =
        new FormData(f);

      const payload = {
        user_id: user.id,

        title:
          String(
            d.get('title')
          ).trim(),

        date:
          new Date(
            `${d.get('date')}T12:00:00`
          ).toISOString(),

        kind:
          d.get('kind'),

        category:
          d.get('category'),

        amount:
          calc(
            d.get('amount')
          ),

        note:
          String(
            d.get('note')
          ).trim()
      };

      const { error } =
        editing
          ? await db
              .from('transactions')
              .update(payload)
              .eq('id', t.id)

          : await db
              .from('transactions')
              .insert(payload);

      if (error) throw error;

      el.remove();
      await load();

    } catch (e) {
      el.querySelector(
        '#msg'
      ).textContent =
        e.message;
    }
  };

  if (editing) {

    el
      .querySelector('.delete')
      .onclick =
      async () => {

        if (
          !confirm(
            '이 거래를 삭제할까요?'
          )
        ) return;

        const { error } =
          await db
            .from('transactions')
            .delete()
            .eq('id', t.id);

        if (error) {
          alert(error.message);
          return;
        }

        el.remove();
        await load();
      };

    el
      .querySelector('.copy')
      .onclick =
      () => {
        const copy = {
          ...t,
          id: null,
          date:
            new Date()
              .toISOString()
        };

        el.remove();
        sheet(copy);
      };

    el
      .querySelector('.repeat')
      .onclick =
      () => {
        alert(
          '반복 기능의 세부 설정 화면은 다음 단계에서 기존 앱 방식으로 복원할게요.'
        );
      };
  }
}

/* ---------------------------
   설정 데이터
---------------------------- */

function bindSettings() {
  root.querySelector(
    '#logout'
  ).onclick =
    () => db.auth.signOut();

  const imp =
    root.querySelector('#import');

  imp.onchange =
    async () => {
      const file =
        imp.files[0];

      if (!file) return;

      if (
        !confirm(
          '현재 데이터를 지우고 이 JSON으로 덮어쓸까요?'
        )
      ) return;

      const msg =
        root.querySelector(
          '#datamsg'
        );

      try {
        const snap =
          JSON.parse(
            await file.text()
          );

        if (
          !Array.isArray(
            snap.transactions
          )
        ) {
          throw new Error(
            '지원하지 않는 파일'
          );
        }

        let r =
          await db
            .from('transactions')
            .delete()
            .eq(
              'user_id',
              user.id
            );

        if (r.error) {
          throw r.error;
        }

        const items =
          snap.transactions.map(
            t => ({
              user_id:
                user.id,

              title:
                t.title,

              date:
                t.date,

              kind:
                t.kindRawValue ||
                t.kind,

              category:
                t.category,

              amount:
                t.amount,

              note:
                t.note || '',

              created_at:
                t.createdAt ||
                new Date()
                  .toISOString(),

              repeat_series_id:
                t.repeatSeriesID ||
                null,

              repeat_frequency:
                t.repeatFrequencyRawValue ||
                null,

              repeat_interval:
                t.repeatInterval ||
                1,

              repeat_sequence:
                t.repeatSequence ||
                0,

              repeat_anchor_date:
                t.repeatAnchorDate ||
                null
            })
          );

        for (
          let i = 0;
          i < items.length;
          i += 200
        ) {
          const { error } =
            await db
              .from('transactions')
              .insert(
                items.slice(
                  i,
                  i + 200
                )
              );

          if (error) throw error;
        }

        const { error } =
          await db
            .from('settings')
            .upsert({
              user_id:
                user.id,

              custom_categories:
                snap.customCategories ||
                [],

              monthly_budgets:
                [],

              savings_goals:
                snap.savingsGoals ||
                [],

              updated_at:
                new Date()
                  .toISOString()
            });

        if (error) throw error;

        msg.textContent =
          `완료: ${items.length}건`;

        await load();

      } catch (e) {
        msg.textContent =
          `실패: ${e.message}`;
      }
    };

  root.querySelector(
    '#export'
  ).onclick =
    () => {
      const snap = {
        formatVersion: 1,

        exportedAt:
          new Date()
            .toISOString(),

        transactions:
          tx.map(t => ({
            title:
              t.title,

            date:
              t.date,

            kindRawValue:
              t.kind,

            category:
              t.category,

            amount:
              Number(t.amount),

            note:
              t.note,

            createdAt:
              t.created_at,

            repeatSeriesID:
              t.repeat_series_id,

            repeatFrequencyRawValue:
              t.repeat_frequency,

            repeatInterval:
              t.repeat_interval,

            repeatSequence:
              t.repeat_sequence,

            repeatAnchorDate:
              t.repeat_anchor_date
          })),

        customCategories:
          settings.custom_categories ||
          [],

        savingsGoals:
          settings.savings_goals ||
          []
      };

      const a =
        document.createElement('a');

      a.href =
        URL.createObjectURL(
          new Blob(
            [
              JSON.stringify(
                snap,
                null,
                2
              )
            ],
            {
              type:
                'application/json'
            }
          )
        );

      a.download =
        `JaehaBudget_${
          new Date()
            .toISOString()
            .slice(0, 10)
        }.json`;

      a.click();

      URL.revokeObjectURL(
        a.href
      );
    };
}

/* ---------------------------
   인증 시작
---------------------------- */

db.auth.onAuthStateChange(
  async (_, session) => {
    user =
      session?.user ||
      null;

    if (user) {
      try {
        await load();
      } catch (e) {
        root.innerHTML =
          `DB 오류: ${esc(e.message)}`;
      }
    } else {
      auth();
    }
  }
);

const {
  data: { session }
} =
  await db.auth.getSession();

user =
  session?.user ||
  null;

if (user) {
  await load();
} else {
  auth();
}

if (
  'serviceWorker' in navigator
) {
  navigator.serviceWorker
    .register('./sw.js')
    .catch(() => {});
}
