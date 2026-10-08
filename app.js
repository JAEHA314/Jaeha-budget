import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* =========================================================
   기본 설정
========================================================= */

const cfg = window.JAEHA_BUDGET_CONFIG || {};
const root = document.querySelector('#app');

if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) {
  root.innerHTML = 'Supabase config 오류';
  throw new Error('config');
}

const db = createClient(
  cfg.supabaseUrl,
  cfg.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  }
);

let user = null;
let tx = [];

let settings = {
  custom_categories: [],
  savings_goals: []
};

let month = new Date();
month.setHours(12, 0, 0, 0);

let view = '홈';

/* 내역 */
let historyMode = 'month'; // day | month | year
let historyDate = new Date();
historyDate.setHours(12, 0, 0, 0);

let filter = '전체';
let categoryFilter = '전체';
let searchQuery = '';

/* 통계 */
let statKind = '지출';
let statMode = 'monthly'; // monthly | category

const kinds = ['수입', '지출', '저축', '투자'];

const defaults = {
  수입: [
    '급여',
    '부업',
    '용돈',
    '캐시백',
    '이자',
    '기타'
  ],

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

  저축: [
    '적금',
    '예금',
    '청약',
    '비상금',
    '기타'
  ],

  투자: [
    '매수',
    '매도',
    '배당',
    '배당금'
  ]
};

/* =========================================================
   기본 유틸
========================================================= */

const esc = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]
  );

const num = value =>
  new Intl.NumberFormat('ko-KR').format(
    Math.round(Number(value || 0))
  );

const won = value => `₩${num(value)}`;

function localDateKey(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

function toDate(value) {
  if (value instanceof Date) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      12
    );
  }

  const raw = String(value || '');

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  }

  const parsed = new Date(raw);

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
    12
  );
}

function date(value) {
  return localDateKey(toDate(value));
}

function makeISO(dateString) {
  const [y, m, d] =
    dateString.split('-').map(Number);

  return new Date(
    y,
    m - 1,
    d,
    12
  ).toISOString();
}

function ym(d) {
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, '0')}`
  );
}

function dateParts(value) {
  const d = toDate(value);

  const weekdays = [
    '일',
    '월',
    '화',
    '수',
    '목',
    '금',
    '토'
  ];

  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    weekday: weekdays[d.getDay()]
  };
}

function shortDate(value) {
  const p = dateParts(value);
  return `${p.month}/${p.day} ${p.weekday}`;
}

function sameDay(a, b) {
  return date(a) === date(b);
}

/* =========================================================
   거래 방향 / 금액
========================================================= */

function inv(t) {
  if (t.kind !== '투자') return null;

  const c = String(t.category || '');

  if (c.includes('매수')) {
    return 'buy';
  }

  if (
    c.includes('매도') ||
    c.includes('배당')
  ) {
    return 'plus';
  }

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

  if (t.kind === '수입') {
    return amount;
  }

  if (t.kind === '지출') {
    return -amount;
  }

  if (t.kind === '투자') {
    if (inv(t) === 'plus') {
      return amount;
    }

    if (inv(t) === 'buy') {
      return -amount;
    }
  }

  /* 저축은 생활수지에서 제외 */
  return 0;
}

function signedMoney(value) {
  const n = Number(value || 0);

  if (n > 0) {
    return `+${won(n)}`;
  }

  if (n < 0) {
    return `−${won(Math.abs(n))}`;
  }

  return won(0);
}

/* =========================================================
   안전한 금액 계산기
   + - * / ( )
========================================================= */

function tokenizeExpression(input) {
  const source =
    String(input)
      .replace(/,/g, '')
      .replace(/\s+/g, '');

  if (!source) {
    throw new Error('금액을 입력해주세요.');
  }

  if (!/^[0-9+\-*/().]+$/.test(source)) {
    throw new Error('금액을 확인해주세요.');
  }

  const tokens = [];
  let number = '';

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (
      (ch >= '0' && ch <= '9') ||
      ch === '.'
    ) {
      number += ch;
      continue;
    }

    if (number) {
      if ((number.match(/\./g) || []).length > 1) {
        throw new Error('금액을 확인해주세요.');
      }

      tokens.push(Number(number));
      number = '';
    }

    if ('+-*/()'.includes(ch)) {
      tokens.push(ch);
    } else {
      throw new Error('금액을 확인해주세요.');
    }
  }

  if (number) {
    if ((number.match(/\./g) || []).length > 1) {
      throw new Error('금액을 확인해주세요.');
    }

    tokens.push(Number(number));
  }

  return tokens;
}

function calc(input) {
  const tokens = tokenizeExpression(input);

  const output = [];
  const operators = [];

  const precedence = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2
  };

  let previous = null;

  tokens.forEach(token => {
    if (typeof token === 'number') {
      if (!Number.isFinite(token)) {
        throw new Error('금액을 확인해주세요.');
      }

      output.push(token);
      previous = 'number';
      return;
    }

    if (token === '(') {
      operators.push(token);
      previous = '(';
      return;
    }

    if (token === ')') {
      while (
        operators.length &&
        operators.at(-1) !== '('
      ) {
        output.push(operators.pop());
      }

      if (operators.pop() !== '(') {
        throw new Error('괄호를 확인해주세요.');
      }

      previous = ')';
      return;
    }

    if ('+-*/'.includes(token)) {
      /*
        단항 + / -
        예: -100, 100*-2
      */
      if (
        (token === '+' || token === '-') &&
        (
          previous === null ||
          previous === 'operator' ||
          previous === '('
        )
      ) {
        output.push(0);
      }

      while (
        operators.length &&
        operators.at(-1) !== '(' &&
        precedence[operators.at(-1)] >=
          precedence[token]
      ) {
        output.push(operators.pop());
      }

      operators.push(token);
      previous = 'operator';
    }
  });

  while (operators.length) {
    const op = operators.pop();

    if (op === '(' || op === ')') {
      throw new Error('괄호를 확인해주세요.');
    }

    output.push(op);
  }

  const stack = [];

  output.forEach(token => {
    if (typeof token === 'number') {
      stack.push(token);
      return;
    }

    if (stack.length < 2) {
      throw new Error('계산식을 확인해주세요.');
    }

    const b = stack.pop();
    const a = stack.pop();

    if (token === '+') stack.push(a + b);
    if (token === '-') stack.push(a - b);
    if (token === '*') stack.push(a * b);

    if (token === '/') {
      if (b === 0) {
        throw new Error('0으로 나눌 수 없습니다.');
      }

      stack.push(a / b);
    }
  });

  if (stack.length !== 1) {
    throw new Error('계산식을 확인해주세요.');
  }

  const result = stack[0];

  if (
    !Number.isFinite(result) ||
    result < 0
  ) {
    throw new Error('금액을 확인해주세요.');
  }

  return Math.round(result);
}

/* =========================================================
   합계
========================================================= */

function sum(items) {
  const kindTotal = kind =>
    items
      .filter(t => t.kind === kind)
      .reduce(
        (total, t) =>
          total + Number(t.amount || 0),
        0
      );

  const plus = items
    .filter(t => inv(t) === 'plus')
    .reduce(
      (total, t) =>
        total + Number(t.amount || 0),
      0
    );

  const buy = items
    .filter(t => inv(t) === 'buy')
    .reduce(
      (total, t) =>
        total + Number(t.amount || 0),
      0
    );

  const income = kindTotal('수입');
  const expense = kindTotal('지출');
  const saving = kindTotal('저축');

  return {
    income,
    expense,
    saving,
    plus,
    buy,

    /*
      생활수지 =
      수입 + 매도·배당 - 지출 - 매수

      저축 제외
    */
    balance:
      income +
      plus -
      expense -
      buy
  };
}

function monthly(d = month) {
  const key = ym(d);

  return tx.filter(t =>
    date(t.date).startsWith(key)
  );
}

function yearly(year = month.getFullYear()) {
  return tx.filter(
    t =>
      toDate(t.date).getFullYear() === year
  );
}

function daily(d = historyDate) {
  const key = date(d);

  return tx.filter(
    t => date(t.date) === key
  );
}

/* =========================================================
   카테고리
========================================================= */

function allCategoriesForKind(kind) {
  const custom =
    (settings.custom_categories || [])
      .filter(item => {
        const raw =
          item.kindRawValue ||
          item.kind ||
          item.type;

        return (
          !kind ||
          kind === '전체' ||
          raw === kind
        );
      })
      .map(item => item.name)
      .filter(Boolean);

  if (
    kind &&
    kind !== '전체'
  ) {
    const fromTransactions = tx
      .filter(t => t.kind === kind)
      .map(t => t.category)
      .filter(Boolean);

    return [
      ...new Set([
        ...(defaults[kind] || []),
        ...custom,
        ...fromTransactions
      ])
    ];
  }

  return [
    ...new Set([
      ...Object.values(defaults).flat(),
      ...custom,
      ...tx
        .map(t => t.category)
        .filter(Boolean)
    ])
  ];
}

function cats(kind) {
  return allCategoriesForKind(kind);
}

/* =========================================================
   SVG 아이콘
========================================================= */

function svgIcon(name) {
  const baseStart = `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
  `;

  const end = `</svg>`;

  const icons = {
    money: `
      <rect x="3" y="6" width="18" height="12" rx="2"/>
      <circle cx="12" cy="12" r="2.5"/>
      <path d="M6 9h.01M18 15h.01"/>
    `,

    briefcase: `
      <rect x="3" y="7" width="18" height="12" rx="2"/>
      <path d="M9 7V5h6v2"/>
      <path d="M3 11.5c5.5 3 12.5 3 18 0"/>
      <path d="M12 11v3"/>
    `,

    coin: `
      <circle cx="12" cy="12" r="8"/>
      <path d="M9.5 9.5c.8-.8 4.5-.8 5 1 .5 2-5.5 1-5 3 .5 1.8 4.2 1.8 5 1"/>
      <path d="M12 7.5v9"/>
    `,

    percent: `
      <circle cx="7" cy="7" r="2"/>
      <circle cx="17" cy="17" r="2"/>
      <path d="M18 6L6 18"/>
    `,

    plusCircle: `
      <circle cx="12" cy="12" r="8"/>
      <path d="M12 8v8M8 12h8"/>
    `,

    food: `
      <path d="M7 3v7M4.5 3v4.5A2.5 2.5 0 0 0 7 10v11"/>
      <path d="M9.5 3v4.5A2.5 2.5 0 0 1 7 10"/>
      <path d="M16 3c2.5 2.5 2.5 7 0 9v9"/>
      <path d="M16 3v9"/>
    `,

    heart: `
      <path d="M20.8 5.8a5 5 0 0 0-7.1 0L12 7.5l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.1a5 5 0 0 0 0-7.1z"/>
    `,

    subscription: `
      <rect x="4" y="5" width="16" height="14" rx="3"/>
      <path d="M8 9h8M8 13h5"/>
      <circle cx="16.5" cy="15.5" r="1.5"/>
    `,

    phone: `
      <rect x="7" y="2.5" width="10" height="19" rx="2"/>
      <path d="M10 5h4M11 18.5h2"/>
    `,

    bag: `
      <path d="M5 8h14l1 13H4L5 8z"/>
      <path d="M9 8V6a3 3 0 0 1 6 0v2"/>
    `,

    bus: `
      <rect x="5" y="3" width="14" height="16" rx="3"/>
      <path d="M7 8h10M8 19v2M16 19v2"/>
      <circle cx="8.5" cy="15.5" r="1"/>
      <circle cx="15.5" cy="15.5" r="1"/>
    `,

    medical: `
      <rect x="4" y="7" width="16" height="13" rx="2"/>
      <path d="M9 7V4h6v3"/>
      <path d="M12 10v6M9 13h6"/>
    `,

    ticket: `
      <path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V7z"/>
      <path d="M12 8.5v2M12 13.5v2M12 18v.5"/>
    `,

    bank: `
      <path d="M3 9l9-5 9 5"/>
      <path d="M5 10h14M5 19h14"/>
      <path d="M7 10v9M11 10v9M15 10v9M19 10v9"/>
      <path d="M3 21h18"/>
    `,

    tag: `
      <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z"/>
      <circle cx="8" cy="8" r="1.2"/>
    `,

    house: `
      <path d="M3 11l9-8 9 8"/>
      <path d="M5 10v11h14V10"/>
      <path d="M9 21v-6h6v6"/>
    `,

    shield: `
      <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z"/>
      <path d="M9 12l2 2 4-4"/>
    `,

    buy: `
      <circle cx="12" cy="12" r="8"/>
      <path d="M12 7v10M8 13l4 4 4-4"/>
    `,

    sell: `
      <circle cx="12" cy="12" r="8"/>
      <path d="M12 17V7M8 11l4-4 4 4"/>
    `,

    dividend: `
      <rect x="3" y="6" width="18" height="12" rx="2"/>
      <path d="M6 10h12M7 14h4"/>
      <circle cx="16" cy="14" r="2"/>
    `,

    saving: `
      <rect x="3" y="6" width="18" height="12" rx="2"/>
      <circle cx="12" cy="12" r="2.5"/>
      <path d="M6 9h.01M18 15h.01"/>
    `,

    investment: `
      <path d="M4 18l5-6 4 3 7-9"/>
      <path d="M15 6h5v5"/>
    `,

    income: `
      <path d="M5 6l14 12"/>
      <path d="M11 18h8v-8"/>
    `,

    expense: `
      <path d="M5 18L19 6"/>
      <path d="M11 6h8v8"/>
    `,

    calendar: `
      <rect x="3" y="5" width="18" height="16" rx="2"/>
      <path d="M8 3v4M16 3v4M3 10h18"/>
    `
  };

  return (
    baseStart +
    (icons[name] || icons.plusCircle) +
    end
  );
}

function categoryIcon(t) {
  const category =
    String(t.category || '');

  if (category.includes('급여')) {
    return svgIcon('money');
  }

  if (category.includes('부업')) {
    return svgIcon('briefcase');
  }

  if (category.includes('용돈')) {
    return svgIcon('money');
  }

  if (category.includes('캐시백')) {
    return svgIcon('coin');
  }

  if (category.includes('이자')) {
    return svgIcon('percent');
  }

  if (category.includes('식비')) {
    return svgIcon('food');
  }

  if (category.includes('데이트')) {
    return svgIcon('heart');
  }

  if (category.includes('구독')) {
    return svgIcon('subscription');
  }

  if (category.includes('통신')) {
    return svgIcon('phone');
  }

  if (category.includes('쇼핑')) {
    return svgIcon('bag');
  }

  if (category.includes('교통')) {
    return svgIcon('bus');
  }

  if (category.includes('의료')) {
    return svgIcon('medical');
  }

  if (category.includes('여가')) {
    return svgIcon('ticket');
  }

  if (category.includes('적금')) {
    return svgIcon('bank');
  }

  if (category.includes('예금')) {
    return svgIcon('tag');
  }

  if (category.includes('청약')) {
    return svgIcon('house');
  }

  if (category.includes('비상금')) {
    return svgIcon('shield');
  }

  if (category.includes('매수')) {
    return svgIcon('buy');
  }

  if (category.includes('매도')) {
    return svgIcon('sell');
  }

  if (category.includes('배당')) {
    return svgIcon('dividend');
  }

  return svgIcon('plusCircle');
}

/* =========================================================
   데이터 로드
========================================================= */

async function load() {
  const [
    transactionResult,
    settingResult
  ] = await Promise.all([
    db
      .from('transactions')
      .select('*')
      .order('date', {
        ascending: false
      }),

    db
      .from('settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
  ]);

  if (transactionResult.error) {
    throw transactionResult.error;
  }

  if (settingResult.error) {
    throw settingResult.error;
  }

  tx = transactionResult.data || [];

  settings =
    settingResult.data ||
    settings;

  render();
}

/* =========================================================
   로그인
========================================================= */

function auth(msg = '') {
  root.innerHTML = `
    <main class="auth">

      <h1>재하 가계부</h1>

      <form
        id="login"
        class="panel"
      >

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

          <button>
            로그인
          </button>

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

  const form =
    root.querySelector('#login');

  form.onsubmit = async e => {
    e.preventDefault();

    const data =
      new FormData(form);

    const { error } =
      await db.auth.signInWithPassword({
        email: data.get('email'),
        password: data.get('password')
      });

    if (error) {
      auth(error.message);
    }
  };

  root.querySelector('#signup').onclick =
    async () => {
      const data =
        new FormData(form);

      const { error } =
        await db.auth.signUp({
          email: data.get('email'),
          password: data.get('password')
        });

      auth(
        error
          ? error.message
          : '이메일 인증 후 로그인하세요.'
      );
    };
}

/* =========================================================
   공통 상단 메뉴
========================================================= */

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
        ].map(item => `
          <button
            data-view="${item}"
            class="${view === item ? 'on' : ''}"
          >
            ${item}
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

/* =========================================================
   월 이동 바
========================================================= */

function monthbar() {
  return `
    <div class="month">

      <button
        id="prev"
        aria-label="이전 달"
      >
        ‹
      </button>

      <div>

        <b>
          ${month.getFullYear()}년
          ${month.getMonth() + 1}월
        </b>

        <button id="today">
          오늘
        </button>

      </div>

      <button
        id="next"
        aria-label="다음 달"
      >
        ›
      </button>

    </div>
  `;
}

/* =========================================================
   홈
========================================================= */

function cards(s) {
  return `
    <section class="cards home-summary">
      <article class="summary-card summary-income">
        <div class="summary-label">수입</div>
        <b>+${won(s.income)}</b>
      </article>

      <article class="summary-card summary-expense">
        <div class="summary-label">지출</div>
        <b>−${won(s.expense)}</b>
      </article>

      <article class="summary-card summary-saving">
        <div class="summary-label">저축</div>
        <b>${won(s.saving)}</b>
      </article>

      <article class="summary-card summary-investment">
        <div class="summary-label">투자</div>

        <div class="investment-part">
          <span>매도·배당</span>
          <b>+${won(s.plus)}</b>
        </div>

        <div class="investment-divider"></div>

        <div class="investment-part">
          <span>매수·투자</span>
          <b>−${won(s.buy)}</b>
        </div>
      </article>
    </section>
  `;
}

function home() {
  const items = monthly();
  const s = sum(items);

  return `
    ${monthbar()}

    <section class="balance">
      <span>이번 달 생활수지</span>
      <b>${signedMoney(s.balance)}</b>
    </section>

    ${cards(s)}
  `;
}

/* =========================================================
   거래 목록
========================================================= */
/* =========================================================
   거래 목록
========================================================= */

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

              <span class="row-divider">
                ·
              </span>

              ${shortDate(t.date)}

              ${
                t.repeat_series_id
                  ? `
                    <span class="repeat-mark">
                      ↻
                    </span>
                  `
                  : ''
              }

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

/* =========================================================
   내역
========================================================= */

function historyPeriodItems() {
  if (historyMode === 'day') {
    return daily(historyDate);
  }

  if (historyMode === 'year') {
    return yearly(
      historyDate.getFullYear()
    );
  }

  const key = ym(historyDate);

  return tx.filter(t =>
    date(t.date).startsWith(key)
  );
}

function historyBaseItems() {
  let items =
    historyPeriodItems();

  if (filter !== '전체') {
    items = items.filter(
      t => t.kind === filter
    );
  }

  if (categoryFilter !== '전체') {
    items = items.filter(
      t =>
        t.category ===
        categoryFilter
    );
  }

  if (searchQuery.trim()) {
    const q =
      searchQuery
        .trim()
        .toLowerCase();

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

  if (!items.length) {
    return '0건';
  }

  if (filter === '저축') {
    const total =
      items.reduce(
        (s, t) =>
          s + Number(t.amount || 0),
        0
      );

    return `${count}건　총 ${won(total)}`;
  }

  if (filter === '수입') {
    const total =
      items.reduce(
        (s, t) =>
          s + Number(t.amount || 0),
        0
      );

    return `${count}건　총 +${won(total)}`;
  }

  if (filter === '지출') {
    const total =
      items.reduce(
        (s, t) =>
          s + Number(t.amount || 0),
        0
      );

    return `${count}건　총 −${won(total)}`;
  }

  const total =
    items.reduce(
      (s, t) =>
        s + signedValue(t),
      0
    );

  return (
    `${count}건　총 ` +
    `${signedMoney(total)}`
  );
}

function historyPeriodTitle() {
  const y =
    historyDate.getFullYear();

  const m =
    historyDate.getMonth() + 1;

  const d =
    historyDate.getDate();

  if (historyMode === 'year') {
    return `${y}년`;
  }

  if (historyMode === 'day') {
    return `${y}년 ${m}월 ${d}일`;
  }

  return `${y}년 ${m}월`;
}

function categoryOptions() {
  return allCategoriesForKind(filter);
}

function history() {
  const items =
    historyBaseItems();

  const categories =
    categoryOptions();

  return `
    <section class="history-toolbar">

      <div class="history-top-row">

        <div class="history-period-toggle">

          <button
            data-history-mode="month"
            class="${
              historyMode === 'month'
                ? 'on'
                : ''
            }"
          >
            월
          </button>

          <button
            data-history-mode="year"
            class="${
              historyMode === 'year'
                ? 'on'
                : ''
            }"
          >
            연
          </button>

          <button
            data-history-mode="day"
            class="${
              historyMode === 'day'
                ? 'on'
                : ''
            }"
          >
            일
          </button>

        </div>

        <div class="history-search-wrap">

          <input
            id="search"
            value="${esc(searchQuery)}"
            placeholder="이름, 카테고리, 메모 검색"
          >

        </div>

        <div class="history-period-nav">

          <button
            id="prev"
            aria-label="이전"
          >
            ‹
          </button>

          <b>
            ${historyPeriodTitle()}
          </b>

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

      </div>

      <div class="history-bottom-row">

        <div class="history-spacer"></div>

        <div class="history-filter-row">

          <div class="tabs">

            ${[
              '전체',
              ...kinds
            ].map(item => `
              <button
                data-filter="${item}"
                class="${
                  filter === item
                    ? 'on'
                    : ''
                }"
              >
                ${item}
              </button>
            `).join('')}

          </div>

        </div>

        <div class="category-filter-wrap">

          <button
            id="categoryButton"
            class="category-button"
          >

            <span class="category-button-icon">
              ${svgIcon('tag')}
            </span>

            <span>
              ${
                categoryFilter === '전체'
                  ? '카테고리'
                  : esc(categoryFilter)
              }
            </span>

            <span class="category-chevron">
              ⌄
            </span>

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

              <span class="menu-icon">
                ${svgIcon('plusCircle')}
              </span>

              전체 카테고리

            </button>

            ${categories.map(category => `
              <button
                data-category="${esc(category)}"
                class="${
                  categoryFilter === category
                    ? 'on'
                    : ''
                }"
              >

                <span class="menu-icon">
                  ${categoryIcon({
                    kind:
                      filter === '전체'
                        ? ''
                        : filter,
                    category
                  })}
                </span>

                ${esc(category)}

              </button>
            `).join('')}

          </div>

        </div>

      </div>

      <div class="history-result-summary">
        ${historySummary(items)}
      </div>

    </section>

    <div id="result">
      ${rows(items)}
    </div>
  `;
}

/* =========================================================
   캘린더
========================================================= */

function calendarCardClass(t) {
  if (t.kind === '수입') {
    return 'income';
  }

  if (t.kind === '지출') {
    return 'expense';
  }

  if (t.kind === '저축') {
    return 'saving';
  }

  if (t.kind === '투자') {
    return 'investment';
  }

  return '';
}

function dailyCashflow(items) {
  return items.reduce(
    (total, t) =>
      total + signedValue(t),
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
      text: `−${won(Math.abs(value))}`
    };
  }

  return {
    className: 'zero',
    text: won(0)
  };
}

function calendar() {
  const year =
    month.getFullYear();

  const monthIndex =
    month.getMonth();

  const firstDay =
    new Date(
      year,
      monthIndex,
      1,
      12
    ).getDay();

  const currentMonthDays =
    new Date(
      year,
      monthIndex + 1,
      0,
      12
    ).getDate();

  const previousMonthDays =
    new Date(
      year,
      monthIndex,
      0,
      12
    ).getDate();

  const todayKey =
    date(new Date());

  let cells = '';

  for (let i = 0; i < 42; i++) {
    const dayNumber =
      i - firstDay + 1;

    let d;

    if (dayNumber < 1) {
      d = new Date(
        year,
        monthIndex - 1,
        previousMonthDays + dayNumber,
        12
      );
    } else if (
      dayNumber >
      currentMonthDays
    ) {
      d = new Date(
        year,
        monthIndex + 1,
        dayNumber - currentMonthDays,
        12
      );
    } else {
      d = new Date(
        year,
        monthIndex,
        dayNumber,
        12
      );
    }

    const key = date(d);

    const items =
      tx
        .filter(t =>
          date(t.date) === key
        )
        .sort(
          (a, b) =>
            new Date(a.created_at || a.date) -
            new Date(b.created_at || b.date)
        );

    const flow =
      dailyCashflow(items);

    const flowInfo =
      cashflowText(flow);

    const isOther =
      d.getMonth() !== monthIndex;

    const isToday =
      key === todayKey;

    const visibleCount = 3;

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
                <button
                  class="
                    day-flow
                    ${flowInfo.className}
                  "
                  data-open-date="${key}"
                >
                  ${flowInfo.text}
                </button>
              `
              : `
                <span></span>
              `
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

          ${items
            .slice(0, visibleCount)
            .map(t => `
              <button
                class="
                  calendar-item
                  ${calendarCardClass(t)}
                "
                data-id="${t.id}"
              >

                <b>
                  ${esc(t.title)}
                </b>

                <strong>
                  ${money(t)}
                </strong>

                <small>
                  ${esc(t.category)}
                </small>

              </button>
            `)
            .join('')}

        </div>

        ${
          items.length > visibleCount
            ? `
              <button
                class="more-count"
                data-open-date="${key}"
              >
                +${items.length - visibleCount}건
              </button>
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
      ].map(day => `
        <span>
          ${day}
        </span>
      `).join('')}

    </div>

    <div class="calendar">
      ${cells}
    </div>
  `;
}

/* =========================================================
   통계 데이터
========================================================= */

function statValueForItems(items, kind) {
  const s = sum(items);

  if (kind === '수입') {
    return s.income;
  }

  if (kind === '지출') {
    return s.expense;
  }

  if (kind === '저축') {
    return s.saving;
  }

  if (kind === '투자') {
    return s.plus - s.buy;
  }

  return s.balance;
}

function statDisplayValue(value, kind) {
  if (kind === '수입') {
    return `+${won(value)}`;
  }

  if (kind === '지출') {
    return `−${won(Math.abs(value))}`;
  }

  if (kind === '저축') {
    return won(value);
  }

  return signedMoney(value);
}

function transactionsForStatKind(
  items,
  kind
) {
  if (kind === '생활수지') {
    return items.filter(
      t =>
        t.kind === '수입' ||
        t.kind === '지출' ||
        t.kind === '투자'
    );
  }

  return items.filter(
    t => t.kind === kind
  );
}

function statCategoryName(t) {
  if (statKind !== '생활수지') {
    if (statKind === '투자') {
      return inv(t) === 'buy'
        ? '매수'
        : '매도·배당';
    }

    return t.category || '기타';
  }

  if (t.kind === '수입') {
    return '수입';
  }

  if (t.kind === '지출') {
    return '지출';
  }

  if (t.kind === '투자') {
    return inv(t) === 'buy'
      ? '매수'
      : '매도·배당';
  }

  return '기타';
}

function statCategoryValue(t) {
  const amount =
    Number(t.amount || 0);

  if (statKind === '생활수지') {
    return signedValue(t);
  }

  if (statKind === '투자') {
    return inv(t) === 'buy'
      ? -amount
      : amount;
  }

  return amount;
}

function categoryTotalsForYear(
  year,
  kind = statKind
) {
  const items =
    transactionsForStatKind(
      yearly(year),
      kind
    );

  const totals = {};

  items.forEach(t => {
    let category;

    if (kind === '생활수지') {
      if (t.kind === '수입') {
        category = '수입';
      } else if (t.kind === '지출') {
        category = '지출';
      } else if (inv(t) === 'buy') {
        category = '매수';
      } else {
        category = '매도·배당';
      }
    } else if (kind === '투자') {
      category =
        inv(t) === 'buy'
          ? '매수'
          : '매도·배당';
    } else {
      category =
        t.category || '기타';
    }

    let value =
      Number(t.amount || 0);

    if (kind === '생활수지') {
      value = signedValue(t);
    }

    if (
      kind === '투자' &&
      inv(t) === 'buy'
    ) {
      value = -value;
    }

    totals[category] =
      (totals[category] || 0) +
      value;
  });

  return totals;
}

function categoryColorIndex(category) {
  let hash = 0;

  for (
    let i = 0;
    i < category.length;
    i++
  ) {
    hash =
      (
        hash * 31 +
        category.charCodeAt(i)
      ) >>> 0;
  }

  return hash % 12;
}

/* =========================================================
   통계 - 전년 대비
========================================================= */

function comparisonCard(year) {
  const current =
    statValueForItems(
      yearly(year),
      statKind
    );

  const previous =
    statValueForItems(
      yearly(year - 1),
      statKind
    );

  const difference =
    current - previous;

  let percent = null;

  if (previous !== 0) {
    percent =
      difference /
      Math.abs(previous) *
      100;
  }

  return `
    <section class="stat-comparison">

      <div class="stat-comparison-title">
        전년 대비
      </div>

      <div class="stat-comparison-main">

        <div>

          <small>
            ${year}년
          </small>

          <strong>
            ${statDisplayValue(
              current,
              statKind
            )}
          </strong>

        </div>

        <div class="stat-difference">

          <small>
            전년 대비
          </small>

          <strong>
            ${signedMoney(difference)}
          </strong>

          ${
            percent === null
              ? ''
              : `
                <span>
                  ${
                    percent >= 0
                      ? '+'
                      : ''
                  }${percent.toFixed(1)}%
                </span>
              `
          }

        </div>

      </div>

      <div class="stat-previous">
        ${year - 1}년
        ${statDisplayValue(
          previous,
          statKind
        )}
      </div>

    </section>
  `;
}

/* =========================================================
   통계 - 월별
========================================================= */

function monthlyStats(year) {
  const monthData = [];

  const categorySet =
    new Set();

  for (let m = 0; m < 12; m++) {
    const items =
      tx.filter(t => {
        const d = toDate(t.date);

        return (
          d.getFullYear() === year &&
          d.getMonth() === m
        );
      });

    const relevant =
      transactionsForStatKind(
        items,
        statKind
      );

    const categories = {};

    relevant.forEach(t => {
      const category =
        statCategoryName(t);

      const value =
        statCategoryValue(t);

      categories[category] =
        (categories[category] || 0) +
        value;

      categorySet.add(category);
    });

    monthData.push(categories);
  }

  const categories =
    [...categorySet];

  const allValues =
    monthData.flatMap(data =>
      Object.values(data)
    );

  const max =
    Math.max(
      1,
      ...allValues.map(value =>
        Math.abs(value)
      )
    );

  return `
    <section class="stat-section">

      <h2>
        월별 ${statKind}
      </h2>

      <div class="stat-chart-scroll">

        <div class="stat-month-chart">

          ${monthData.map(
            (data, monthIndex) => `
              <div class="stat-month-column">

                <div class="stat-bars">

                  ${categories.map(category => {
                    const value =
                      data[category] || 0;

                    const height =
                      value === 0
                        ? 0
                        : Math.max(
                            4,
                            Math.abs(value) /
                              max *
                              210
                          );

                    return `
                      <div
                        class="
                          stat-bar
                          stat-color-${
                            categoryColorIndex(
                              category
                            )
                          }
                        "
                        style="
                          height:${height}px
                        "
                        title="
                          ${esc(category)}
                          ${num(value)}
                        "
                      ></div>
                    `;
                  }).join('')}

                </div>

                <span>
                  ${monthIndex + 1}월
                </span>

              </div>
            `
          ).join('')}

        </div>

      </div>

      ${
        categories.length
          ? `
            <div class="stat-legend">

              ${categories.map(category => `
                <span>

                  <i
                    class="
                      stat-color-${
                        categoryColorIndex(
                          category
                        )
                      }
                    "
                  ></i>

                  ${esc(category)}

                </span>
              `).join('')}

            </div>
          `
          : ''
      }

    </section>

    ${categoryComparison(year)}
  `;
}

/* =========================================================
   통계 - 항목별
========================================================= */

function categoryStats(year) {
  const totals =
    categoryTotalsForYear(
      year,
      statKind
    );

  const entries =
    Object.entries(totals)
      .sort(
        (a, b) =>
          Math.abs(b[1]) -
          Math.abs(a[1])
      );

  const totalAbsolute =
    entries.reduce(
      (sumValue, [, value]) =>
        sumValue + Math.abs(value),
      0
    );

  if (!entries.length) {
    return `
      <section class="stat-section">
        <h2>항목별 ${statKind}</h2>
        <div class="empty">
          통계 데이터가 없어요.
        </div>
      </section>
    `;
  }

  return `
    <section class="stat-section">

      <h2>
        항목별 ${statKind}
      </h2>

      <div class="category-stat-list">

        ${entries.map(
          ([category, value]) => {
            const ratio =
              totalAbsolute
                ? (
                    Math.abs(value) /
                    totalAbsolute *
                    100
                  )
                : 0;

            return `
              <div class="category-stat-row">

                <div class="category-stat-head">

                  <div>

                    <i
                      class="
                        category-dot
                        stat-color-${
                          categoryColorIndex(
                            category
                          )
                        }
                      "
                    ></i>

                    <b>
                      ${esc(category)}
                    </b>

                  </div>

                  <strong>
                    ${
                      statKind === '생활수지' ||
                      statKind === '투자'
                        ? signedMoney(value)
                        : won(value)
                    }
                  </strong>

                </div>

                <div class="category-stat-track">

                  <i
                    class="
                      stat-color-${
                        categoryColorIndex(
                          category
                        )
                      }
                    "
                    style="
                      width:${ratio}%
                    "
                  ></i>

                </div>

                <small>
                  ${ratio.toFixed(1)}%
                </small>

              </div>
            `;
          }
        ).join('')}

      </div>

    </section>

    ${categoryComparison(year)}
  `;
}

/* =========================================================
   통계 - 카테고리 전년 증감
========================================================= */

function categoryComparison(year) {
  const current =
    categoryTotalsForYear(
      year,
      statKind
    );

  const previous =
    categoryTotalsForYear(
      year - 1,
      statKind
    );

  const categories =
    [
      ...new Set([
        ...Object.keys(current),
        ...Object.keys(previous)
      ])
    ];

  if (!categories.length) {
    return '';
  }

  categories.sort(
    (a, b) =>
      Math.abs(
        (current[b] || 0) -
        (previous[b] || 0)
      ) -
      Math.abs(
        (current[a] || 0) -
        (previous[a] || 0)
      )
  );

  return `
    <section class="stat-section stat-change-section">

      <h2>
        카테고리별 전년 증감
      </h2>

      <div class="stat-change-list">

        ${categories.map(category => {
          const now =
            current[category] || 0;

          const before =
            previous[category] || 0;

          const difference =
            now - before;

          return `
            <div class="stat-change-row">

              <div class="stat-change-name">

                <i
                  class="
                    category-dot
                    stat-color-${
                      categoryColorIndex(
                        category
                      )
                    }
                  "
                ></i>

                <span>
                  ${esc(category)}
                </span>

              </div>

              <div class="stat-change-values">

                <small>
                  ${year - 1}
                  ${won(Math.abs(before))}
                </small>

                <strong>
                  ${signedMoney(difference)}
                </strong>

              </div>

            </div>
          `;
        }).join('')}

      </div>

    </section>
  `;
}

/* =========================================================
   통계 화면
========================================================= */

function stats() {
  const year =
    month.getFullYear();

  return `
    <section class="stats-page">

      <div class="statTabs">

        ${[
          '수입',
          '지출',
          '저축',
          '투자',
          '생활수지'
        ].map(item => `
          <button
            data-stat="${item}"
            class="${
              statKind === item
                ? 'on'
                : ''
            }"
          >
            ${item}
          </button>
        `).join('')}

      </div>

      <div class="stat-mode-tabs">

        <button
          data-stat-mode="monthly"
          class="${
            statMode === 'monthly'
              ? 'on'
              : ''
          }"
        >
          월별
        </button>

        <button
          data-stat-mode="category"
          class="${
            statMode === 'category'
              ? 'on'
              : ''
          }"
        >
          항목별
        </button>

      </div>

      <div class="year">

        <button id="py">
          ‹
        </button>

        <b>
          ${year}년
        </b>

        <button id="ny">
          ›
        </button>

      </div>

      ${comparisonCard(year)}

      ${
        statMode === 'monthly'
          ? monthlyStats(year)
          : categoryStats(year)
      }

    </section>
  `;
}

/* =========================================================
   설정
========================================================= */

function settingsHTML() {
  return `
    <div class="settings">

      <h3>
        데이터
      </h3>

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

/* =========================================================
   렌더
========================================================= */

function render() {
  let content = '';

  if (view === '홈') {
    content = home();
  }

  if (view === '내역') {
    content = history();
  }

  if (view === '캘린더') {
    content = calendar();
  }

  if (view === '통계') {
    content = stats();
  }

  if (view === '설정') {
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

/* =========================================================
   내역 기간 이동
========================================================= */

function moveHistory(direction) {
  if (historyMode === 'day') {
    historyDate =
      new Date(
        historyDate.getFullYear(),
        historyDate.getMonth(),
        historyDate.getDate() +
          direction,
        12
      );

    return;
  }

  if (historyMode === 'year') {
    historyDate =
      new Date(
        historyDate.getFullYear() +
          direction,
        historyDate.getMonth(),
        1,
        12
      );

    return;
  }

  historyDate =
    new Date(
      historyDate.getFullYear(),
      historyDate.getMonth() +
        direction,
      1,
      12
    );
}

/* =========================================================
   공통 이벤트
========================================================= */

function bind() {
  root
    .querySelectorAll('[data-view]')
    .forEach(button => {
      button.onclick = () => {
        view =
          button.dataset.view;

        render();
      };
    });

  root
    .querySelector('#add')
    ?.addEventListener(
      'click',
      () => sheet()
    );

  /* 홈 / 캘린더 월 이동 */
  if (
    view === '홈' ||
    view === '캘린더'
  ) {
    root
      .querySelector('#prev')
      ?.addEventListener(
        'click',
        () => {
          month =
            new Date(
              month.getFullYear(),
              month.getMonth() - 1,
              1,
              12
            );

          render();
        }
      );

    root
      .querySelector('#next')
      ?.addEventListener(
        'click',
        () => {
          month =
            new Date(
              month.getFullYear(),
              month.getMonth() + 1,
              1,
              12
            );

          render();
        }
      );

    root
      .querySelector('#today')
      ?.addEventListener(
        'click',
        () => {
          month = new Date();
          month.setHours(
            12,
            0,
            0,
            0
          );

          render();
        }
      );
  }

  /* 내역 기간 이동 */
  if (view === '내역') {
    root
      .querySelector('#prev')
      ?.addEventListener(
        'click',
        () => {
          moveHistory(-1);
          render();
        }
      );

    root
      .querySelector('#next')
      ?.addEventListener(
        'click',
        () => {
          moveHistory(1);
          render();
        }
      );

    root
      .querySelector('#today')
      ?.addEventListener(
        'click',
        () => {
          historyDate =
            new Date();

          historyDate.setHours(
            12,
            0,
            0,
            0
          );

          render();
        }
      );
  }

  /* 거래 클릭 */
  bindRows();

  /* 캘린더 + */
  root
    .querySelectorAll(
      '[data-add-date]'
    )
    .forEach(button => {
      button.onclick = e => {
        e.stopPropagation();

        sheet(
          null,
          button.dataset.addDate
        );
      };
    });

  /* 캘린더 날짜 → 내역 일 */
  root
    .querySelectorAll(
      '[data-open-date]'
    )
    .forEach(button => {
      button.onclick = e => {
        e.stopPropagation();

        historyDate =
          toDate(
            button.dataset.openDate
          );

        historyMode = 'day';

        filter = '전체';
        categoryFilter = '전체';
        searchQuery = '';

        view = '내역';

        render();
      };
    });

  /* 월 / 연 / 일 */
  root
    .querySelectorAll(
      '[data-history-mode]'
    )
    .forEach(button => {
      button.onclick = () => {
        historyMode =
          button.dataset.historyMode;

        render();
      };
    });

  /* 거래 종류 필터 */
  root
    .querySelectorAll(
      '[data-filter]'
    )
    .forEach(button => {
      button.onclick = () => {
        filter =
          button.dataset.filter;

        categoryFilter =
          '전체';

        render();
      };
    });

  bindCategoryMenu();
  bindSearch();

  /* 통계 종류 */
  root
    .querySelectorAll(
      '[data-stat]'
    )
    .forEach(button => {
      button.onclick = () => {
        statKind =
          button.dataset.stat;

        render();
      };
    });

  /* 월별 / 항목별 */
  root
    .querySelectorAll(
      '[data-stat-mode]'
    )
    .forEach(button => {
      button.onclick = () => {
        statMode =
          button.dataset.statMode;

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
            1,
            12
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
            1,
            12
          );

        render();
      }
    );

  if (view === '설정') {
    bindSettings();
  }
}

function bindRows(container = root) {
  container
    .querySelectorAll('[data-id]')
    .forEach(row => {
      row.onclick = e => {
        e.stopPropagation();

        const item =
          tx.find(
            t =>
              String(t.id) ===
              String(row.dataset.id)
          );

        if (item) {
          sheet(item);
        }
      };
    });
}

/* =========================================================
   카테고리 메뉴 이벤트
========================================================= */

function bindCategoryMenu() {
  const button =
    root.querySelector(
      '#categoryButton'
    );

  const menu =
    root.querySelector(
      '#categoryMenu'
    );

  if (!button || !menu) {
    return;
  }

  button.onclick = e => {
    e.stopPropagation();

    menu.hidden =
      !menu.hidden;
  };

  menu
    .querySelectorAll(
      '[data-category]'
    )
    .forEach(item => {
      item.onclick = e => {
        e.stopPropagation();

        categoryFilter =
          item.dataset.category;

        render();
      };
    });

  document.onclick = () => {
    menu.hidden = true;
  };
}

/* =========================================================
   검색
========================================================= */

function bindSearch() {
  const input =
    root.querySelector('#search');

  if (!input) {
    return;
  }

  input.oninput = () => {
    searchQuery =
      input.value;

    const items =
      historyBaseItems();

    const result =
      root.querySelector('#result');

    if (result) {
      result.innerHTML =
        rows(items);

      bindRows(result);
    }

    const summary =
      root.querySelector(
        '.history-result-summary'
      );

    if (summary) {
      summary.textContent =
        historySummary(items);
    }
  };
}

/* =========================================================
   거래 추가 / 수정
========================================================= */

function sheet(
  t = null,
  preset = null
) {
  const editing =
    Boolean(t?.id);

  const initialKind =
    t?.kind || '지출';

  const el =
    document.createElement('div');

  el.className = 'modal';

  el.innerHTML = `
    <form class="sheet">

      <h2>
        ${
          editing
            ? '거래 수정'
            : '거래 추가'
        }
      </h2>

      <label>
        날짜
      </label>

      <input
        name="date"
        type="date"
        value="${
          preset ||
          (
            t
              ? date(t.date)
              : date(new Date())
          )
        }"
        required
      >

      <label>
        구분
      </label>

      <div class="kind">

        ${kinds.map(item => `
          <button
            type="button"
            data-kind="${item}"
            class="${
              item === initialKind
                ? 'on'
                : ''
            }"
          >
            ${item}
          </button>
        `).join('')}

      </div>

      <input
        name="kind"
        type="hidden"
        value="${initialKind}"
      >

      <label>
        카테고리
      </label>

      <select
        name="category"
      ></select>

      <label>
        금액
      </label>

      <input
        name="amount"
        inputmode="decimal"
        autocomplete="off"
        value="${
          t
            ? num(t.amount)
            : ''
        }"
        required
      >

      <small id="preview"></small>

      <label>
        이름
      </label>

      <input
        name="title"
        value="${esc(t?.title || '')}"
        required
      >

      <label>
        메모
      </label>

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

        <button type="submit">
          저장
        </button>

      </div>

    </form>
  `;

  document.body.append(el);

  const form =
    el.querySelector('form');

  const kindInput =
    form.elements.kind;

  const categorySelect =
    form.elements.category;

  const amountInput =
    form.elements.amount;

  const preview =
    el.querySelector('#preview');

  function fillCategories() {
    const list =
      cats(kindInput.value);

    categorySelect.innerHTML =
      list.map(category => `
        <option
          value="${esc(category)}"
          ${
            category === t?.category
              ? 'selected'
              : ''
          }
        >
          ${esc(category)}
        </option>
      `).join('');
  }

  fillCategories();

  el
    .querySelectorAll(
      '[data-kind]'
    )
    .forEach(button => {
      button.onclick = () => {
        el
          .querySelectorAll(
            '[data-kind]'
          )
          .forEach(item =>
            item.classList.remove(
              'on'
            )
          );

        button.classList.add('on');

        kindInput.value =
          button.dataset.kind;

        fillCategories();
      };
    });

  amountInput.oninput = () => {
    const raw =
      amountInput.value
        .replace(/,/g, '');

    /*
      순수 숫자라면 입력하면서
      천 단위 쉼표 적용
    */
    if (/^\d+$/.test(raw)) {
      amountInput.value =
        num(raw);

      preview.textContent = '';
      return;
    }

    /*
      계산식이면 결과 미리보기
    */
    try {
      if (/[+\-*/()]/.test(raw)) {
        preview.textContent =
          `= ${num(calc(raw))}`;
      } else {
        preview.textContent = '';
      }
    } catch {
      preview.textContent = '';
    }
  };

  amountInput.onblur = () => {
    try {
      const raw =
        amountInput.value;

      if (/[+\-*/()]/.test(raw)) {
        amountInput.value =
          num(calc(raw));

        preview.textContent = '';
      }
    } catch {
      /* 저장 시 오류 표시 */
    }
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

  form.onsubmit = async e => {
    e.preventDefault();

    try {
      const data =
        new FormData(form);

      const payload = {
        user_id:
          user.id,

        title:
          String(
            data.get('title')
          ).trim(),

        date:
          makeISO(
            data.get('date')
          ),

        kind:
          data.get('kind'),

        category:
          data.get('category'),

        amount:
          calc(
            data.get('amount')
          ),

        note:
          String(
            data.get('note')
          ).trim()
      };

      const result =
        editing
          ? await db
              .from('transactions')
              .update(payload)
              .eq('id', t.id)

          : await db
              .from('transactions')
              .insert(payload);

      if (result.error) {
        throw result.error;
      }

      el.remove();

      await load();

    } catch (error) {
      el.querySelector(
        '#msg'
      ).textContent =
        error.message;
    }
  };

  if (!editing) {
    return;
  }

  /* 삭제 */
  el
    .querySelector('.delete')
    .onclick =
    async () => {
      if (
        !confirm(
          '이 거래를 삭제할까요?'
        )
      ) {
        return;
      }

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

  /* 복사 */
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

  /* 반복 */
  el
    .querySelector('.repeat')
    .onclick =
    () => {
      openRepeatSheet(t, el);
    };
}

/* =========================================================
   반복 거래
========================================================= */

function openRepeatSheet(
  transaction,
  parentModal
) {
  const modal =
    document.createElement('div');

  modal.className =
    'modal repeat-modal';

  modal.innerHTML = `
    <form class="sheet repeat-sheet">

      <h2>
        반복 설정
      </h2>

      <p class="repeat-description">
        ${esc(transaction.title)}
      </p>

      <label>
        반복 주기
      </label>

      <select name="frequency">
        <option value="weekly">
          매주
        </option>
        <option
          value="monthly"
          selected
        >
          매월
        </option>
        <option value="yearly">
          매년
        </option>
      </select>

      <label>
        반복 횟수
      </label>

      <input
        name="count"
        type="number"
        min="1"
        max="120"
        value="12"
        required
      >

      <p class="repeat-help">
        현재 거래 다음 회차부터 생성합니다.
      </p>

      <p id="repeatMsg"></p>

      <div class="actions">

        <button
          type="button"
          class="soft cancel-repeat"
        >
          취소
        </button>

        <button type="submit">
          반복 생성
        </button>

      </div>

    </form>
  `;

  document.body.append(modal);

  modal
    .querySelector(
      '.cancel-repeat'
    )
    .onclick =
    () => modal.remove();

  modal.onclick = e => {
    if (e.target === modal) {
      modal.remove();
    }
  };

  modal
    .querySelector('form')
    .onsubmit =
    async e => {
      e.preventDefault();

      const form =
        new FormData(e.currentTarget);

      const frequency =
        form.get('frequency');

      const count =
        Math.max(
          1,
          Math.min(
            120,
            Number(
              form.get('count')
            ) || 1
          )
        );

      const seriesID =
        crypto.randomUUID();

      const anchor =
        toDate(
          transaction.date
        );

      const rowsToInsert = [];

      for (
        let i = 1;
        i <= count;
        i++
      ) {
        let next;

        if (frequency === 'weekly') {
          next =
            new Date(
              anchor.getFullYear(),
              anchor.getMonth(),
              anchor.getDate() +
                7 * i,
              12
            );
        } else if (
          frequency === 'yearly'
        ) {
          next =
            new Date(
              anchor.getFullYear() + i,
              anchor.getMonth(),
              anchor.getDate(),
              12
            );
        } else {
          /*
            월말 보정
          */
          const targetMonth =
            anchor.getMonth() + i;

          const targetYear =
            anchor.getFullYear() +
            Math.floor(
              targetMonth / 12
            );

          const normalizedMonth =
            (
              targetMonth % 12 +
              12
            ) % 12;

          const lastDay =
            new Date(
              targetYear,
              normalizedMonth + 1,
              0,
              12
            ).getDate();

          next =
            new Date(
              targetYear,
              normalizedMonth,
              Math.min(
                anchor.getDate(),
                lastDay
              ),
              12
            );
        }

        rowsToInsert.push({
          user_id:
            user.id,

          title:
            transaction.title,

          date:
            next.toISOString(),

          kind:
            transaction.kind,

          category:
            transaction.category,

          amount:
            Number(
              transaction.amount
            ),

          note:
            transaction.note || '',

          repeat_series_id:
            seriesID,

          repeat_frequency:
            frequency,

          repeat_interval:
            1,

          repeat_sequence:
            i,

          repeat_anchor_date:
            anchor.toISOString()
        });
      }

      try {
        /*
          현재 거래도 같은 시리즈로 표시
        */
        const currentUpdate =
          await db
            .from('transactions')
            .update({
              repeat_series_id:
                seriesID,

              repeat_frequency:
                frequency,

              repeat_interval:
                1,

              repeat_sequence:
                0,

              repeat_anchor_date:
                anchor.toISOString()
            })
            .eq(
              'id',
              transaction.id
            );

        if (currentUpdate.error) {
          throw currentUpdate.error;
        }

        const result =
          await db
            .from('transactions')
            .insert(
              rowsToInsert
            );

        if (result.error) {
          throw result.error;
        }

        modal.remove();
        parentModal?.remove();

        await load();

      } catch (error) {
        modal.querySelector(
          '#repeatMsg'
        ).textContent =
          error.message;
      }
    };
}

/* =========================================================
   설정 데이터
========================================================= */

function bindSettings() {
  root
    .querySelector('#logout')
    .onclick =
    () => db.auth.signOut();

  const imp =
    root.querySelector('#import');

  imp.onchange =
    async () => {
      const file =
        imp.files[0];

      if (!file) {
        return;
      }

      if (
        !confirm(
          '현재 데이터를 지우고 이 JSON으로 덮어쓸까요?'
        )
      ) {
        return;
      }

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

        const removeResult =
          await db
            .from('transactions')
            .delete()
            .eq(
              'user_id',
              user.id
            );

        if (removeResult.error) {
          throw removeResult.error;
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

          if (error) {
            throw error;
          }
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

              /*
                예산 기능은 사용하지 않음
              */
              monthly_budgets:
                [],

              savings_goals:
                snap.savingsGoals ||
                [],

              updated_at:
                new Date()
                  .toISOString()
            });

        if (error) {
          throw error;
        }

        msg.textContent =
          `완료: ${items.length}건`;

        await load();

      } catch (error) {
        msg.textContent =
          `실패: ${error.message}`;
      }
    };

  root
    .querySelector('#export')
    .onclick =
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

      const blob =
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
        );

      const url =
        URL.createObjectURL(blob);

      const a =
        document.createElement('a');

      a.href = url;

      a.download =
        `JaehaBudget_${
          new Date()
            .toISOString()
            .slice(0, 10)
        }.json`;

      a.click();

      URL.revokeObjectURL(url);
    };
}

/* =========================================================
   인증
========================================================= */

db.auth.onAuthStateChange(
  async (_, session) => {
    user =
      session?.user ||
      null;

    if (user) {
      try {
        await load();
      } catch (error) {
        root.innerHTML =
          `DB 오류: ${esc(error.message)}`;
      }
    } else {
      auth();
    }
  }
);

const {
  data: {
    session
  }
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

/* =========================================================
   Service Worker
========================================================= */

if (
  'serviceWorker' in navigator
) {
  navigator.serviceWorker
    .register('./sw.js')
    .catch(() => {});
}
