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

  const key =
    ym(historyDate);

  return tx.filter(
    t =>
      date(t.date)
        .startsWith(key)
  );
}

function historyBaseItems() {
  let items =
    historyPeriodItems();

  if (filter !== '전체') {
    items =
      items.filter(
        t => t.kind === filter
      );
  }

  if (
    categoryFilter !== '전체'
  ) {
    items =
      items.filter(
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

    items =
      items.filter(t =>
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
  const count =
    items.length;

  if (!items.length) {
    return '0건';
  }

  if (filter === '저축') {
    const total =
      items.reduce(
        (s, t) =>
          s +
          Number(t.amount || 0),
        0
      );

    return (
      `${count}건　총 ` +
      `${won(total)}`
    );
  }

  if (filter === '수입') {
    const total =
      items.reduce(
        (s, t) =>
          s +
          Number(t.amount || 0),
        0
      );

    return (
      `${count}건　총 ` +
      `+${won(total)}`
    );
  }

  if (filter === '지출') {
    const total =
      items.reduce(
        (s, t) =>
          s +
          Number(t.amount || 0),
        0
      );

    return (
      `${count}건　총 ` +
      `−${won(total)}`
    );
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
    return (
      `${y}년 ${m}월 ${d}일`
    );
  }

  return `${y}년 ${m}월`;
}

function history() {
  const items =
    historyBaseItems();

  const categories =
    allCategoriesForKind(
      filter
    );

  return `
    <section class="history-toolbar">

      <div class="history-top-row">

        <div
          class="history-period-toggle"
        >

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

        <div
          class="history-search-wrap"
        >
          <input
            id="search"
            value="${esc(searchQuery)}"
            placeholder="이름, 카테고리, 메모 검색"
          >
        </div>

        <div
          class="history-period-nav"
        >
          <button id="prev">
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

          <button id="next">
            ›
          </button>
        </div>

      </div>

      <div
        class="history-bottom-row"
      >

        <div
          class="history-spacer"
        ></div>

        <div
          class="history-filter-row"
        >
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

        <div
          class="category-filter-wrap"
        >

          <button
            id="categoryButton"
            class="category-button"
          >

            <span
              class="category-button-icon"
            >
              ${svgIcon('tag')}
            </span>

            <span>
              ${
                categoryFilter ===
                '전체'
                  ? '카테고리'
                  : esc(
                      categoryFilter
                    )
              }
            </span>

            <span
              class="category-chevron"
            >
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
                categoryFilter ===
                '전체'
                  ? 'on'
                  : ''
              }"
            >
              <span class="menu-icon">
                ${svgIcon(
                  'plusCircle'
                )}
              </span>

              전체 카테고리
            </button>

            ${categories.map(
              category => `
                <button
                  data-category="${
                    esc(category)
                  }"
                  class="${
                    categoryFilter ===
                    category
                      ? 'on'
                      : ''
                  }"
                >
                  <span
                    class="menu-icon"
                  >
                    ${categoryIcon({
                      kind:
                        filter ===
                        '전체'
                          ? ''
                          : filter,
                      category
                    })}
                  </span>

                  ${esc(category)}
                </button>
              `
            ).join('')}

          </div>
        </div>
      </div>

      <div
        class="history-result-summary"
      >
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
  return ({
    수입: 'income',
    지출: 'expense',
    저축: 'saving',
    투자: 'investment'
  })[t.kind] || '';
}

function dailyCashflow(items) {
  return items.reduce(
    (total, t) =>
      total +
      signedValue(t),
    0
  );
}

function cashflowText(value) {
  if (value > 0) {
    return {
      className: 'positive',
      text: num(value)
    };
  }

  if (value < 0) {
    return {
      className: 'negative',
      text: num(
        Math.abs(value)
      )
    };
  }

  return {
    className: 'zero',
    text: '0'
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

  for (
    let i = 0;
    i < 42;
    i++
  ) {
    const dayNumber =
      i - firstDay + 1;

    let d;

    if (dayNumber < 1) {
      d =
        new Date(
          year,
          monthIndex - 1,
          previousMonthDays +
            dayNumber,
          12
        );
    } else if (
      dayNumber >
      currentMonthDays
    ) {
      d =
        new Date(
          year,
          monthIndex + 1,
          dayNumber -
            currentMonthDays,
          12
        );
    } else {
      d =
        new Date(
          year,
          monthIndex,
          dayNumber,
          12
        );
    }

    const key =
      date(d);

    const items =
      tx
        .filter(
          t =>
            date(t.date) === key
        )
        .sort(
          (a, b) =>
            new Date(
              a.created_at ||
              a.date
            ) -
            new Date(
              b.created_at ||
              b.date
            )
        );

    const flowInfo =
      cashflowText(
        dailyCashflow(items)
      );

    const isOther =
      d.getMonth() !==
      monthIndex;

    const isToday =
      key === todayKey;

    const visibleCount = 3;

    cells += `
      <div
        class="
          day
          ${isOther ? 'other' : ''}
          ${
            isToday
              ? 'today-cell'
              : ''
          }
        "
      >

        <div class="day-head">

          <button
            class="day-number"
            data-open-date="${key}"
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
                <span
                  class="day-flow-spacer"
                ></span>
              `
          }

          <button
            class="day-add"
            data-add-date="${key}"
          >
            ＋
          </button>

        </div>

        <div class="calendar-items">

          ${items
            .slice(
              0,
              visibleCount
            )
            .map(t => `
              <button
                class="
                  calendar-item
                  ${
                    calendarCardClass(
                      t
                    )
                  }
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
          items.length >
          visibleCount
            ? `
              <button
                class="more-count"
                data-open-date="${key}"
              >
                +${
                  items.length -
                  visibleCount
                }건
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
   통계
========================================================= */

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
  if (
    statKind === '생활수지'
  ) {
    if (t.kind === '수입') {
      return '수입';
    }

    if (t.kind === '지출') {
      return '지출';
    }

    return (
      t.category ||
      '투자'
    );
  }

  return (
    t.category ||
    '기타'
  );
}

function statCategoryValue(t) {
  const amount =
    Number(t.amount || 0);

  if (
    statKind === '생활수지'
  ) {
    return signedValue(t);
  }

  if (statKind === '투자') {
    return (
      inv(t) === 'buy'
        ? -amount
        : amount
    );
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
    let category =
      t.category ||
      '기타';

    if (
      kind === '생활수지'
    ) {
      if (t.kind === '수입') {
        category = '수입';
      } else if (
        t.kind === '지출'
      ) {
        category = '지출';
      }
    }

    let value =
      Number(t.amount || 0);

    if (
      kind === '생활수지'
    ) {
      value =
        signedValue(t);
    } else if (
      kind === '투자' &&
      inv(t) === 'buy'
    ) {
      value = -value;
    }

    totals[category] =
      (
        totals[category] ||
        0
      ) +
      value;
  });

  return totals;
}

const STAT_COLOR_COUNT = 24;

function statColorMap(
  categories
) {
  const map =
    new Map();

  [
    ...new Set(categories)
  ].forEach(
    (category, index) => {
      map.set(
        category,
        index %
          STAT_COLOR_COUNT
      );
    }
  );

  return map;
}

function monthlyStats(year) {
  const monthData = [];

  const categorySet =
    new Set();

  for (
    let m = 0;
    m < 12;
    m++
  ) {
    const items =
      tx.filter(t => {
        const d =
          toDate(t.date);

        return (
          d.getFullYear() ===
            year &&
          d.getMonth() === m
        );
      });

    const relevant =
      transactionsForStatKind(
        items,
        statKind
      );

    const data = {};

    relevant.forEach(t => {
      const category =
        statCategoryName(t);

      const value =
        statCategoryValue(t);

      data[category] =
        (
          data[category] ||
          0
        ) +
        value;

      categorySet.add(
        category
      );
    });

    monthData.push(data);
  }

  const categories =
    [...categorySet];

  const colors =
    statColorMap(
      categories
    );

  const activeCategories =
    categories.filter(
      category =>
        !hiddenStatCategories
          .has(category)
    );

  const monthTotals =
    monthData.map(
      data =>
        activeCategories.reduce(
          (total, category) =>
            total +
            Math.abs(
              data[category] ||
              0
            ),
          0
        )
    );

  const maxMonthTotal =
    Math.max(
      1,
      ...monthTotals
    );

  return `
    <section class="stat-section">

      <h2>
        월별 ${statKind}
      </h2>

      <div
        class="stat-horizontal-chart"
      >

        ${monthData.map(
          (
            data,
            monthIndex
          ) => {
            const total =
              monthTotals[
                monthIndex
              ];

            const barWidth =
              (
                total /
                maxMonthTotal
              ) * 100;

            return `
              <div
                class="
                  stat-horizontal-month
                "
              >

                <span
                  class="
                    stat-horizontal-label
                  "
                >
                  ${
                    monthIndex + 1
                  }월
                </span>

                <div
                  class="
                    stat-horizontal-track
                  "
                >

                  <div
                    class="
                      stat-horizontal-stack
                    "
                    style="
                      width:${barWidth}%
                    "
                  >

                    ${activeCategories
                      .map(category => {
                        const value =
                          Math.abs(
                            data[
                              category
                            ] ||
                            0
                          );

                        if (
                          !value ||
                          !total
                        ) {
                          return '';
                        }

                        const width =
                          (
                            value /
                            total
                          ) * 100;

                        return `
                          <i
                            class="
                              stat-horizontal-segment
                              stat-color-${
                                colors.get(
                                  category
                                )
                              }
                            "
                            style="
                              width:${width}%
                            "
                            title="${
                              esc(
                                category
                              )
                            } ${
                              won(
                                value
                              )
                            }"
                          ></i>
                        `;
                      })
                      .join('')}

                  </div>

                </div>

                <span
                  class="
                    stat-horizontal-total
                  "
                >
                  ${
                    total
                      ? num(total)
                      : ''
                  }
                </span>

              </div>
            `;
          }
        ).join('')}

      </div>

      ${
        categories.length
          ? `
            <div
              class="
                stat-legend
                stat-filter-legend
              "
            >

              ${categories.map(
                category => `
                  <button
                    type="button"
                    data-stat-category="${
                      esc(category)
                    }"
                    class="${
                      hiddenStatCategories
                        .has(category)
                        ? 'off'
                        : ''
                    }"
                  >

                    <i
                      class="
                        stat-color-${
                          colors.get(
                            category
                          )
                        }
                      "
                    ></i>

                    <span>
                      ${esc(category)}
                    </span>

                  </button>
                `
              ).join('')}

            </div>
          `
          : ''
      }

    </section>
  `;
}

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

  const colors =
    statColorMap(
      entries.map(
        ([category]) =>
          category
      )
    );

  const totalAbsolute =
    entries.reduce(
      (
        total,
        [, value]
      ) =>
        total +
        Math.abs(value),
      0
    );

  if (!entries.length) {
    return `
      <section
        class="stat-section"
      >
        <h2>
          항목별 ${statKind}
        </h2>

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

      <div
        class="category-stat-list"
      >

        ${entries.map(
          ([
            category,
            value
          ]) => {
            const ratio =
              totalAbsolute
                ? (
                    Math.abs(value) /
                    totalAbsolute
                  ) * 100
                : 0;

            return `
              <div
                class="
                  category-stat-row
                "
              >

                <div
                  class="
                    category-stat-head
                  "
                >

                  <div>

                    <i
                      class="
                        category-dot
                        stat-color-${
                          colors.get(
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
                      statKind ===
                        '생활수지' ||
                      statKind ===
                        '투자'
                        ? signedMoney(
                            value
                          )
                        : won(value)
                    }
                  </strong>

                </div>

                <div
                  class="
                    category-stat-track
                  "
                >
                  <i
                    class="
                      stat-color-${
                        colors.get(
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
  `;
}

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

      <div
        class="stat-mode-tabs"
      >

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
    content =
      settingsHTML();
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

function moveHistory(
  direction
) {
  if (
    historyMode === 'day'
  ) {
    historyDate =
      new Date(
        historyDate
          .getFullYear(),

        historyDate
          .getMonth(),

        historyDate
          .getDate() +
          direction,

        12
      );

    return;
  }

  if (
    historyMode === 'year'
  ) {
    historyDate =
      new Date(
        historyDate
          .getFullYear() +
          direction,

        historyDate
          .getMonth(),

        1,
        12
      );

    return;
  }

  historyDate =
    new Date(
      historyDate
        .getFullYear(),

      historyDate
        .getMonth() +
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
    .querySelectorAll(
      '[data-view]'
    )
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

  bindRows();

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

  root
    .querySelectorAll(
      '[data-open-date]'
    )
    .forEach(button => {
      button.onclick = e => {
        e.stopPropagation();

        historyDate =
          toDate(
            button.dataset
              .openDate
          );

        historyMode = 'day';
        filter = '전체';
        categoryFilter =
          '전체';
        searchQuery = '';
        view = '내역';

        render();
      };
    });

  root
    .querySelectorAll(
      '[data-history-mode]'
    )
    .forEach(button => {
      button.onclick = () => {
        historyMode =
          button.dataset
            .historyMode;

        render();
      };
    });

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

  root
    .querySelectorAll(
      '[data-stat]'
    )
    .forEach(button => {
      button.onclick = () => {
        statKind =
          button.dataset.stat;

        hiddenStatCategories
          .clear();

        render();
      };
    });

  root
    .querySelectorAll(
      '[data-stat-mode]'
    )
    .forEach(button => {
      button.onclick = () => {
        statMode =
          button.dataset
            .statMode;

        render();
      };
    });

  root
    .querySelectorAll(
      '[data-stat-category]'
    )
    .forEach(button => {
      button.onclick = () => {
        const category =
          button.dataset
            .statCategory;

        if (
          hiddenStatCategories
            .has(category)
        ) {
          hiddenStatCategories
            .delete(category);
        } else {
          hiddenStatCategories
            .add(category);
        }

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

        hiddenStatCategories
          .clear();

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

        hiddenStatCategories
          .clear();

        render();
      }
    );

  if (view === '설정') {
    bindSettings();
  }
}

function bindRows(
  container = root
) {
  container
    .querySelectorAll(
      '[data-id]'
    )
    .forEach(row => {
      row.onclick = e => {
        e.stopPropagation();

        const item =
          tx.find(
            t =>
              String(t.id) ===
              String(
                row.dataset.id
              )
          );

        if (item) {
          sheet(item);
        }
      };
    });
}

/* =========================================================
   카테고리 메뉴
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
    root.querySelector(
      '#search'
    );

  if (!input) {
    return;
  }

  input.oninput = () => {
    searchQuery =
      input.value;

    const items =
      historyBaseItems();

    const result =
      root.querySelector(
        '#result'
      );

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
   반복 거래 도우미
========================================================= */

function seriesFrom(t) {
  if (!t.repeat_series_id) {
    return [];
  }

  return tx
    .filter(
      item =>
        item.repeat_series_id ===
        t.repeat_series_id
    )
    .sort(
      (a, b) =>
        (
          Number(
            a.repeat_sequence ||
            0
          ) -
          Number(
            b.repeat_sequence ||
            0
          )
        ) ||
        (
          toDate(a.date) -
          toDate(b.date)
        )
    );
}

function seriesFutureFrom(t) {
  const sequence =
    Number(
      t.repeat_sequence ||
      0
    );

  return seriesFrom(t)
    .filter(
      item =>
        Number(
          item.repeat_sequence ||
          0
        ) >= sequence
    );
}

function choiceModal({
  title,
  text,
  choices
}) {
  return new Promise(
    resolve => {
      const modal =
        document
          .createElement('div');

      modal.className =
        'modal choice-modal';

      modal.innerHTML = `
        <div
          class="
            sheet
            choice-sheet
          "
        >

          <h2>
            ${esc(title)}
          </h2>

          ${
            text
              ? `
                <p
                  class="
                    repeat-description
                  "
                >
                  ${esc(text)}
                </p>
              `
              : ''
          }

          <div
            class="
              actions
              choice-actions
            "
          >

            ${choices.map(
              (
                choice,
                index
              ) => `
                <button
                  type="button"
                  class="${
                    choice.soft
                      ? 'soft'
                      : ''
                  }"
                  data-choice="${index}"
                >
                  ${esc(
                    choice.label
                  )}
                </button>
              `
            ).join('')}

          </div>

        </div>
      `;

      document.body
        .append(modal);

      const done =
        value => {
          modal.remove();
          resolve(value);
        };

      modal
        .querySelectorAll(
          '[data-choice]'
        )
        .forEach(button => {
          button.onclick =
            () => {
              done(
                choices[
                  Number(
                    button.dataset
                      .choice
                  )
                ].value
              );
            };
        });

      modal.onclick =
        e => {
          if (
            e.target === modal
          ) {
            done(null);
          }
        };
    }
  );
}

async function updateFutureSeries(
  t,
  payload
) {
  const future =
    seriesFutureFrom(t);

  if (!future.length) {
    return;
  }

  const dateChanged =
    date(payload.date) !==
    date(t.date);

  const newBase =
    toDate(payload.date);

  const oldSequence =
    Number(
      t.repeat_sequence ||
      0
    );

  const results =
    await Promise.all(
      future.map(item => {
        const sequence =
          Number(
            item.repeat_sequence ||
            0
          );

        const newDate =
          dateChanged
            ? addRepeatDate(
                newBase,
                t.repeat_frequency ||
                  'monthly',
                sequence -
                  oldSequence
              ).toISOString()
            : item.date;

        return db
          .from(
            'transactions'
          )
          .update({
            title:
              payload.title,

            kind:
              payload.kind,

            category:
              payload.category,

            amount:
              payload.amount,

            note:
              payload.note,

            date:
              newDate
          })
          .eq(
            'id',
            item.id
          );
      })
    );

  const failed =
    results.find(
      result =>
        result.error
    );

  if (failed) {
    throw failed.error;
  }
}

async function deleteFutureSeries(t) {
  const ids =
    seriesFutureFrom(t)
      .map(
        item => item.id
      );

  if (!ids.length) {
    return;
  }

  const { error } =
    await db
      .from(
        'transactions'
      )
      .delete()
      .in(
        'id',
        ids
      );

  if (error) {
    throw error;
  }
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
    t?.kind ||
    '지출';

  const el =
    document
      .createElement('div');

  el.className =
    'modal';

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
              : date(
                  new Date()
                )
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
              item ===
              initialKind
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
        value="${
          esc(
            t?.title || ''
          )
        }"
        required
      >

      <label>
        메모
      </label>

      <textarea
        name="note"
      >${
        esc(
          t?.note || ''
        )
      }</textarea>

      ${
        editing &&
        t.repeat_series_id
          ? `
            <p class="repeat-help">
              반복 거래 · ${
                frequencyLabel(
                  t.repeat_frequency
                )
              }
            </p>
          `
          : ''
      }

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
                ${
                  t.repeat_series_id
                    ? '반복 수정'
                    : '반복'
                }
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

  document.body
    .append(el);

  const form =
    el.querySelector('form');

  const kindInput =
    form.elements.kind;

  const categorySelect =
    form.elements.category;

  const amountInput =
    form.elements.amount;

  const preview =
    el.querySelector(
      '#preview'
    );

  function fillCategories() {
    const list =
      cats(
        kindInput.value
      );

    categorySelect.innerHTML =
      list.map(
        category => `
          <option
            value="${
              esc(category)
            }"
            ${
              category ===
              t?.category
                ? 'selected'
                : ''
            }
          >
            ${esc(category)}
          </option>
        `
      ).join('');
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
            item.classList
              .remove('on')
          );

        button.classList
          .add('on');

        kindInput.value =
          button.dataset.kind;

        fillCategories();
      };
    });

  amountInput.oninput =
    () => {
      const raw =
        amountInput.value
          .replace(/,/g, '');

      if (/^\d+$/.test(raw)) {
        amountInput.value =
          num(raw);

        preview.textContent =
          '';

        return;
      }

      try {
        if (
          /[+\-*/()]/.test(
            raw
          )
        ) {
          preview.textContent =
            `= ${num(
              calc(raw)
            )}`;
        } else {
          preview.textContent =
            '';
        }
      } catch {
        preview.textContent =
          '';
      }
    };

  amountInput.onblur =
    () => {
      try {
        const raw =
          amountInput.value;

        if (
          /[+\-*/()]/.test(
            raw
          )
        ) {
          amountInput.value =
            num(
              calc(raw)
            );

          preview.textContent =
            '';
        }
      } catch {
        /* 저장할 때 오류 표시 */
      }
    };

  el
    .querySelector(
      '.cancel'
    )
    .onclick =
    () => el.remove();

  el.onclick = e => {
    if (e.target === el) {
      el.remove();
    }
  };

  form.onsubmit =
    async e => {
      e.preventDefault();

      try {
        const data =
          new FormData(form);

        const payload = {
          user_id:
            user.id,

          title:
            String(
              data.get(
                'title'
              )
            ).trim(),

          date:
            makeISO(
              data.get(
                'date'
              )
            ),

          kind:
            data.get(
              'kind'
            ),

          category:
            data.get(
              'category'
            ),

          amount:
            calc(
              data.get(
                'amount'
              )
            ),

          note:
            String(
              data.get(
                'note'
              )
            ).trim()
        };

        if (
          editing &&
          t.repeat_series_id
        ) {
          const scope =
            await choiceModal({
              title:
                '반복 거래 수정',

              text:
                '수정 내용을 어디까지 적용할까요?',

              choices: [
                {
                  label:
                    '이번만 수정',
                  value: 'one',
                  soft: true
                },
                {
                  label:
                    '이후 반복 모두 수정',
                  value: 'future'
                },
                {
                  label: '취소',
                  value: null,
                  soft: true
                }
              ]
            });

          if (!scope) {
            return;
          }

          if (
            scope === 'future'
          ) {
            await updateFutureSeries(
              t,
              payload
            );
          } else {
            const { error } =
              await db
                .from(
                  'transactions'
                )
                .update(
                  payload
                )
                .eq(
                  'id',
                  t.id
                );

            if (error) {
              throw error;
            }
          }
        } else {
          const result =
            editing
              ? await db
                  .from(
                    'transactions'
                  )
                  .update(
                    payload
                  )
                  .eq(
                    'id',
                    t.id
                  )

              : await db
                  .from(
                    'transactions'
                  )
                  .insert(
                    payload
                  );

          if (result.error) {
            throw result.error;
          }
        }

        el.remove();

        await load();

      } catch (error) {
        el
          .querySelector(
            '#msg'
          )
          .textContent =
          error.message;
      }
    };

  if (!editing) {
    return;
  }

  el
    .querySelector(
      '.delete'
    )
    .onclick =
    async () => {
      try {
        if (
          t.repeat_series_id
        ) {
          const scope =
            await choiceModal({
              title:
                '반복 거래 삭제',

              text:
                '이 거래만 삭제하거나, 이 거래부터 이후 반복 거래를 모두 삭제할 수 있어요.',

              choices: [
                {
                  label:
                    '이번만 삭제',
                  value: 'one',
                  soft: true
                },
                {
                  label:
                    '이후 반복 모두 삭제',
                  value: 'future'
                },
                {
                  label: '취소',
                  value: null,
                  soft: true
                }
              ]
            });

          if (!scope) {
            return;
          }

          if (
            scope === 'future'
          ) {
            await deleteFutureSeries(
              t
            );
          } else {
            const { error } =
              await db
                .from(
                  'transactions'
                )
                .delete()
                .eq(
                  'id',
                  t.id
                );

            if (error) {
              throw error;
            }
          }
        } else {
          if (
            !confirm(
              '이 거래를 삭제할까요?'
            )
          ) {
            return;
          }

          const { error } =
            await db
              .from(
                'transactions'
              )
              .delete()
              .eq(
                'id',
                t.id
              );

          if (error) {
            throw error;
          }
        }

        el.remove();

        await load();

      } catch (error) {
        alert(
          error.message
        );
      }
    };

  el
    .querySelector(
      '.copy'
    )
    .onclick =
    () => {
      const copy = {
        ...t,

        id: null,

        date:
          new Date()
            .toISOString(),

        repeat_series_id:
          null,

        repeat_frequency:
          null,

        repeat_sequence:
          0,

        repeat_anchor_date:
          null
      };

      el.remove();

      sheet(copy);
    };

  el
    .querySelector(
      '.repeat'
    )
    .onclick =
    () => {
      openRepeatSheet(
        t,
        el
      );
    };
}

/* =========================================================
   반복 생성 / 반복 수정
========================================================= */

function openRepeatSheet(
  transaction,
  parentModal
) {
  const existing =
    Boolean(
      transaction
        .repeat_series_id
    );

  const currentSeries =
    existing
      ? seriesFutureFrom(
          transaction
        )
      : [];

  const currentFrequency =
    transaction
      .repeat_frequency ||
    'monthly';

  const currentCount =
    existing
      ? Math.max(
          1,
          currentSeries.length
        )
      : 12;

  const modal =
    document
      .createElement('div');

  modal.className =
    'modal repeat-modal';

  modal.innerHTML = `
    <form
      class="
        sheet
        repeat-sheet
      "
    >

      <h2>
        ${
          existing
            ? '반복 수정'
            : '반복 설정'
        }
      </h2>

      <p
        class="
          repeat-description
        "
      >
        ${esc(
          transaction.title
        )}
      </p>

      <label>
        반복 주기
      </label>

      <select
        name="frequency"
      >

        ${[
          [
            'daily',
            '매일'
          ],
          [
            'weekly',
            '매주'
          ],
          [
            'monthly',
            '매월'
          ],
          [
            'yearly',
            '매년'
          ]
        ].map(
          ([
            value,
            label
          ]) => `
            <option
              value="${value}"
              ${
                value ===
                currentFrequency
                  ? 'selected'
                  : ''
              }
            >
              ${label}
            </option>
          `
        ).join('')}

      </select>

      <label>
        ${
          existing
            ? '이 거래부터 반복 횟수'
            : '반복 횟수'
        }
      </label>

      <input
        name="count"
        type="number"
        min="1"
        max="120"
        value="${currentCount}"
        required
      >

      <p class="repeat-help">
        ${
          existing
            ? '선택한 거래를 1회차로 포함해 이후 일정을 다시 만듭니다.'
            : '현재 거래 다음 회차부터 생성합니다.'
        }
      </p>

      <p id="repeatMsg"></p>

      <div class="actions">

        <button
          type="button"
          class="
            soft
            cancel-repeat
          "
        >
          취소
        </button>

        <button type="submit">
          ${
            existing
              ? '반복 수정'
              : '반복 생성'
          }
        </button>

      </div>

    </form>
  `;

  document.body
    .append(modal);

  modal
    .querySelector(
      '.cancel-repeat'
    )
    .onclick =
    () => modal.remove();

  modal.onclick = e => {
    if (
      e.target === modal
    ) {
      modal.remove();
    }
  };

  modal
    .querySelector('form')
    .onsubmit =
    async e => {
      e.preventDefault();

      const formData =
        new FormData(
          e.currentTarget
        );

      const frequency =
        formData.get(
          'frequency'
        );

      const count =
        Math.max(
          1,
          Math.min(
            120,
            Number(
              formData.get(
                'count'
              )
            ) || 1
          )
        );

      try {
        if (existing) {
          const future =
            seriesFutureFrom(
              transaction
            );

          const laterIds =
            future
              .filter(
                item =>
                  String(
                    item.id
                  ) !==
                  String(
                    transaction.id
                  )
              )
              .map(
                item => item.id
              );

          if (
            laterIds.length
          ) {
            const {
              error
            } =
              await db
                .from(
                  'transactions'
                )
                .delete()
                .in(
                  'id',
                  laterIds
                );

            if (error) {
              throw error;
            }
          }

          const start =
            toDate(
              transaction.date
            );

          const startSequence =
            Number(
              transaction
                .repeat_sequence ||
              0
            );

          const seriesID =
            transaction
              .repeat_series_id;

          const {
            error:
              currentError
          } =
            await db
              .from(
                'transactions'
              )
              .update({
                repeat_frequency:
                  frequency,

                repeat_interval:
                  1,

                repeat_sequence:
                  startSequence,

                repeat_anchor_date:
                  start
                    .toISOString()
              })
              .eq(
                'id',
                transaction.id
              );

          if (currentError) {
            throw currentError;
          }

          const newRows = [];

          for (
            let i = 1;
            i < count;
            i++
          ) {
            const next =
              addRepeatDate(
                start,
                frequency,
                i
              );

            newRows.push({
              user_id:
                user.id,

              title:
                transaction.title,

              date:
                next
                  .toISOString(),

              kind:
                transaction.kind,

              category:
                transaction.category,

              amount:
                Number(
                  transaction.amount
                ),

              note:
                transaction.note ||
                '',

              repeat_series_id:
                seriesID,

              repeat_frequency:
                frequency,

              repeat_interval:
                1,

              repeat_sequence:
                startSequence + i,

              repeat_anchor_date:
                start
                  .toISOString()
            });
          }

          if (
            newRows.length
          ) {
            const {
              error
            } =
              await db
                .from(
                  'transactions'
                )
                .insert(
                  newRows
                );

            if (error) {
              throw error;
            }
          }

        } else {
          const seriesID =
            crypto.randomUUID();

          const anchor =
            toDate(
              transaction.date
            );

          const rowsToInsert =
            [];

          for (
            let i = 1;
            i <= count;
            i++
          ) {
            const next =
              addRepeatDate(
                anchor,
                frequency,
                i
              );

            rowsToInsert.push({
              user_id:
                user.id,

              title:
                transaction.title,

              date:
                next
                  .toISOString(),

              kind:
                transaction.kind,

              category:
                transaction.category,

              amount:
                Number(
                  transaction.amount
                ),

              note:
                transaction.note ||
                '',

              repeat_series_id:
                seriesID,

              repeat_frequency:
                frequency,

              repeat_interval:
                1,

              repeat_sequence:
                i,

              repeat_anchor_date:
                anchor
                  .toISOString()
            });
          }

          const {
            error:
              currentError
          } =
            await db
              .from(
                'transactions'
              )
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
                  anchor
                    .toISOString()
              })
              .eq(
                'id',
                transaction.id
              );

          if (currentError) {
            throw currentError;
          }

          const {
            error
          } =
            await db
              .from(
                'transactions'
              )
              .insert(
                rowsToInsert
              );

          if (error) {
            throw error;
          }
        }

        modal.remove();

        parentModal
          ?.remove();

        await load();

      } catch (error) {
        modal
          .querySelector(
            '#repeatMsg'
          )
          .textContent =
          error.message;
      }
    };
}

/* =========================================================
   설정 데이터
========================================================= */

function bindSettings() {
  root
    .querySelector(
      '#logout'
    )
    .onclick =
    () =>
      db.auth.signOut();

  const imp =
    root.querySelector(
      '#import'
    );

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
            .from(
              'transactions'
            )
            .delete()
            .eq(
              'user_id',
              user.id
            );

        if (
          removeResult.error
        ) {
          throw (
            removeResult.error
          );
        }

        const items =
          snap.transactions
            .map(t => ({
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
            }));

        for (
          let i = 0;
          i < items.length;
          i += 200
        ) {
          const { error } =
            await db
              .from(
                'transactions'
              )
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
            .from(
              'settings'
            )
            .upsert({
              user_id:
                user.id,

              custom_categories:
                snap
                  .customCategories ||
                [],

              monthly_budgets:
                [],

              savings_goals:
                snap
                  .savingsGoals ||
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
    .querySelector(
      '#export'
    )
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
              Number(
                t.amount
              ),

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
          settings
            .custom_categories ||
          [],

        savingsGoals:
          settings
            .savings_goals ||
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
        URL.createObjectURL(
          blob
        );

      const a =
        document
          .createElement('a');

      a.href = url;

      a.download =
        `JaehaBudget_${
          new Date()
            .toISOString()
            .slice(0, 10)
        }.json`;

      a.click();

      URL.revokeObjectURL(
        url
      );
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
          `DB 오류: ${
            esc(
              error.message
            )
          }`;
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
  await db.auth
    .getSession();

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
  navigator
    .serviceWorker
    .register('./sw.js')
    .catch(() => {});
}
