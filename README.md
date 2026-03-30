# 학점설계소 (學點設計所)

> 공공데이터 기반 학점은행제 올인원 학습설계 플랫폼

## 프로젝트 개요

학점은행제 학습자를 위한 데이터 기반 올인원 플랫폼입니다. 기존 시장의 정보 파편화, 불투명한 비용, 과도한 영업 문제를 해결하기 위해 국가평생교육진흥원 공공데이터 122건+를 기반으로 제작되었습니다.

**핵심 경쟁력:**
- ✅ 공식 데이터 신뢰성 (법령·통계·고시 기반)
- ✅ 무료 자동 학습경로 설계 도구
- ✅ 투명한 비용 계산기
- ✅ 전공별·자격증별 완전 가이드

## 주요 기능

| 기능 | 경로 | 설명 |
|------|------|------|
| 홈 (빠른 설계) | `/` | 30초 빠른 학습 경로 계산 |
| 학습설계 시뮬레이터 | `/simulator` | 5단계 맞춤형 학습경로 자동 설계 |
| 비용 계산기 | `/calculator` | 교육원 유형별 총 비용 계산 + 비교표 |
| 자격증 로드맵 DB | `/certificates` | 학점인정 자격증 전체 목록 및 학점 확인 |
| 전공별 완전 가이드 | `/majors` | 6대 인기 전공 이수요건·로드맵 제공 |
| 공식 자료 아카이브 | `/archive` | 법령·통계·연구자료 122건+ 정리 |
| FAQ | `/faq` | 자주 묻는 질문 32개 답변 |

## API 엔드포인트

### POST `/api/simulate`
학습경로 자동 계산

**Request:**
```json
{
  "degreeType": "bachelor",        // bachelor | associate2 | associate3
  "education": "high",             // high | college2 | college3 | university_dropout | university
  "currentCredits": 0,             // 보유학점
  "period": "24",                  // 희망기간(개월)
  "certificates": ["information_processing"],  // 자격증 코드 배열
  "hasDoksak": false               // 독학사 병행 여부
}
```

**Response:**
```json
{
  "required": { "total": 140, "major": 60, "culture": 30, "general": 50 },
  "heldCredits": 80,
  "shortfall": 60,
  "semestersNeeded": 3,
  "yearsNeeded": "1.5",
  "estimatedCost": 2400000,
  "message": "희망 기간 내 취득 가능합니다."
}
```

### POST `/api/calculate-cost`
비용 계산

**Request:**
```json
{
  "credits": 80,
  "institutionType": "online"      // online | offline | university | doksak
}
```

## 데이터 구조

### 학위별 이수 요건
| 구분 | 총학점 | 전공 | 교양 | 일반 |
|------|--------|------|------|------|
| 학사 | 140 | 60 | 30 | 50 |
| 전문학사(2년) | 80 | 45 | 15 | 20 |
| 전문학사(3년) | 120 | 54 | 21 | 45 |

### 교육기관 유형별 수강료
| 유형 | 과목당 비용 | 특징 |
|------|------------|------|
| 온라인 교육원 | 9~15만원 | 접근성 최고, 시간 유연 |
| 오프라인 교육원 | 15~20만원 | 이론+실습 균형 |
| 대학부설 평생교육원 | 20~30만원 | 커리큘럼 수준 최고 |
| 독학학위제 | ~2만원 | 최저 비용, 자학 필요 |

### 주요 인정 자격증 (일부)
| 자격증 | 인정학점 | 연계전공 |
|--------|----------|----------|
| 정보처리기사 | 20학점 | 컴퓨터공학 |
| 사회복지사 1급 | 20학점 | 사회복지학 |
| 전기기사 | 20학점 | 전기공학 |
| 미용사(일반) | 20학점 | 미용학 |
| 컴퓨터활용능력 1급 | 12학점 | 경영학·IT |

## 기술 스택

- **Backend**: Hono (TypeScript) + Cloudflare Workers
- **Frontend**: Vanilla JS + Tailwind CSS (CDN) + Font Awesome
- **Build**: Vite + @hono/vite-cloudflare-pages
- **배포**: Cloudflare Pages
- **개발환경**: Wrangler Pages Dev + PM2

## 로컬 개발 환경 설정

```bash
# 의존성 설치
npm install

# 빌드
npm run build

# 개발 서버 시작 (PM2)
pm2 start ecosystem.config.cjs

# 테스트
curl http://localhost:3000
```

## 프로젝트 구조

```
webapp/
├── src/
│   └── index.tsx          # Hono 메인 앱 (모든 라우트 + 페이지 렌더링)
├── public/
│   ├── static/
│   │   ├── styles.css     # 커스텀 CSS
│   │   └── app.js         # 프론트엔드 JavaScript
│   └── favicon.ico
├── dist/                  # 빌드 결과물 (자동 생성)
├── ecosystem.config.cjs   # PM2 설정
├── vite.config.mjs        # Vite 빌드 설정
├── wrangler.jsonc         # Cloudflare 설정
└── package.json
```

## 배포 (Cloudflare Pages)

```bash
# Cloudflare API 키 설정 후
npm run build
npx wrangler pages deploy dist --project-name hakjeom-seolgyeso
```

## 데이터 출처

- 국가평생교육진흥원 학점은행제: https://www.cb.or.kr
- 학점은행 알리미 공시정보: https://www.cbinfo.or.kr
- 교육부 자격학점인정기준 고시
- 학점인정 등에 관한 법률 (1997)
- 연도별 학점은행제 현황통계

## 현재 구현된 기능

- [x] 메인 페이지 (30초 빠른 설계 위젯)
- [x] 학습설계 시뮬레이터 (5단계 스텝)
- [x] 비용 계산기 (교육원 유형별 비교)
- [x] 자격증 로드맵 DB (6개 카테고리, 30+종)
- [x] 전공별 완전 가이드 (6대 인기 전공)
- [x] 공식 자료 아카이브 (법령·통계·연구·가이드)
- [x] FAQ (4개 카테고리, 16개 질문)
- [x] REST API (시뮬레이터, 비용계산)
- [x] 반응형 디자인 (모바일 최적화)
- [x] 검색·필터 기능 (자격증, FAQ)

## 추후 개선 예정

- [ ] 학사일정 알림 기능 (이메일/푸시)
- [ ] 교육원 실시간 수강료 API 연동
- [ ] 사용자 학습 계획 저장 기능 (DB 연동)
- [ ] 커뮤니티 리뷰 시스템
- [ ] 전공별 필수/선택 과목 상세 DB 확장 (231개 전공)
- [ ] K-MOOC 강좌 연계 정보

---

© 2024 학점설계소 | 공공데이터 기반 학점은행제 올인원 플랫폼
