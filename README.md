# 재하 가계부 Web

Swift/iCloud 파일 동기화 대신 **GitHub Pages + Supabase**로 Mac/iPhone에서 같은 데이터를 사용하는 개인용 웹앱입니다.

## 1. Supabase 준비
1. Supabase에서 새 프로젝트를 만듭니다.
2. SQL Editor에서 `schema.sql` 전체를 실행합니다.
3. Project Settings/API에서 Project URL과 Publishable key(또는 legacy anon key)를 확인합니다.
4. `config.example.js`를 `config.js`로 복사하고 값을 입력합니다.

> `service_role`/secret key는 절대 넣지 마세요. 브라우저에는 publishable/anon key만 사용합니다.

## 2. 로컬 확인
정적 파일이라 간단한 서버로 확인할 수 있습니다.

```bash
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080` 접속 → 첫 계정 만들기 → 로그인.

## 3. 기존 데이터 이전
`private-import/JaehaBudget_Sync.json`은 업로드한 기존 앱에서 추출한 현재 백업입니다. **650건의 거래가 들어 있습니다.**

웹앱의 `설정 → JSON으로 덮어쓰기`에서 이 파일을 선택하면 웹 DB의 현재 내용을 지우고 기존 데이터를 가져옵니다.

`private-import/`는 `.gitignore`에 포함되어 있으므로 GitHub에 올리지 마세요.

## 4. GitHub Pages
이 저장소를 GitHub에 올린 뒤 Settings → Pages에서 배포합니다. 이 프로젝트는 빌드가 필요 없는 정적 웹앱입니다.

중요: GitHub Pages에 올라가는 프론트엔드 코드는 공개적으로 내려받을 수 있다고 가정하세요. 금융 데이터는 저장소에 넣지 않고 Supabase에만 저장합니다. `config.js`의 publishable/anon key는 클라이언트 공개용 키이며, 실제 데이터 접근은 `schema.sql`의 RLS가 로그인 사용자 단위로 제한합니다.

## 5. iPhone
Safari에서 Pages 주소 접속 → 공유 → **홈 화면에 추가**. 이후 일반 앱처럼 실행할 수 있습니다.

## 현재 구현
- 이메일/비밀번호 로그인 및 세션 유지
- 수입/지출/저축/투자 월별 요약
- 거래 추가/수정/삭제
- `400*2`, `12000+3500` 같은 금액 계산 입력
- 종류별 필터
- 월 예산
- 기존 `JaehaBudget_Sync.json` 전체 덮어쓰기 import
- JSON 백업 export
- PWA 홈 화면 설치
- 모바일/데스크톱 반응형

## 다음 확장 후보
기존 Swift 앱의 캘린더, 상세 통계, 반복거래 생성/편집, 사용자 카테고리 편집, 저축 목표 UI를 같은 DB 구조 위에 추가할 수 있습니다.
