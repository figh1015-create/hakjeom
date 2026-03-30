import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

// Static files
app.use('/static/*', serveStatic({ root: './public' }))
app.use('/favicon.ico', serveStatic({ root: './public', path: './public/favicon.ico' }))

// ─── Main Page ───────────────────────────────────────────
app.get('/', (c) => {
  return c.html(renderLayout('home', '학점설계소 - 학점은행제 올인원 플랫폼', renderHomePage()))
})

// ─── Simulator Page ──────────────────────────────────────
app.get('/simulator', (c) => {
  return c.html(renderLayout('simulator', '학습설계 시뮬레이터 | 학점설계소', renderSimulatorPage()))
})

// ─── Cost Calculator Page ─────────────────────────────────
app.get('/calculator', (c) => {
  return c.html(renderLayout('calculator', '비용 계산기 & 교육원 비교 | 학점설계소', renderCalculatorPage()))
})

// ─── Certificate Roadmap Page ─────────────────────────────
app.get('/certificates', (c) => {
  return c.html(renderLayout('certificates', '자격증 로드맵 DB | 학점설계소', renderCertificatesPage()))
})

// ─── Major Guide Page ─────────────────────────────────────
app.get('/majors', (c) => {
  return c.html(renderLayout('majors', '전공별 완전 가이드 | 학점설계소', renderMajorsPage()))
})

// ─── Archive Page ─────────────────────────────────────────
app.get('/archive', (c) => {
  return c.html(renderLayout('archive', '공식 자료 아카이브 | 학점설계소', renderArchivePage()))
})

// ─── FAQ Page ─────────────────────────────────────────────
app.get('/faq', (c) => {
  return c.html(renderLayout('faq', 'FAQ | 학점설계소', renderFaqPage()))
})

// ─── API: Simulator Calculate ─────────────────────────────
app.post('/api/simulate', async (c) => {
  const body = await c.req.json()
  const result = calculateLearningPath(body)
  return c.json(result)
})

// ─── API: Cost Calculate ──────────────────────────────────
app.post('/api/calculate-cost', async (c) => {
  const body = await c.req.json()
  const result = calculateCost(body)
  return c.json(result)
})

// ─────────────────────────────────────────────────────────
// Helper: Learning Path Calculator
// ─────────────────────────────────────────────────────────
function calculateLearningPath(input: any) {
  const {
    education,      // 최종학력: 'high', 'college2', 'college3', 'university', 'university_dropout'
    degreeType,     // 목표학위: 'bachelor', 'associate2', 'associate3'
    currentCredits, // 보유학점
    certificates,   // 자격증 (배열)
    major,          // 전공
    period,         // 희망기간(개월)
    hasDoksak,      // 독학사 병행여부
  } = input

  // 학위별 총 필요학점
  const required: Record<string, { total: number; major: number; culture: number; general: number }> = {
    bachelor:    { total: 140, major: 60, culture: 30, general: 50 },
    associate2:  { total: 80,  major: 45, culture: 15, general: 20 },
    associate3:  { total: 120, major: 54, culture: 21, general: 45 },
  }

  const req = required[degreeType] || required['bachelor']

  // 전적대 인정학점
  let transferCredits = 0
  if (education === 'college2')           transferCredits = Math.min(80, currentCredits || 0)
  else if (education === 'college3')      transferCredits = Math.min(80, currentCredits || 0)
  else if (education === 'university')    transferCredits = Math.min(140, currentCredits || 0)
  else if (education === 'university_dropout') transferCredits = Math.min(currentCredits || 0, 60)

  // 자격증 인정학점 (최대 3개, 학사; 최대 2개, 전문학사)
  const certCreditMap: Record<string, number> = {
    'information_processing': 20,
    'social_worker1':         20,
    'social_worker2':         0,  // 과목이수 방식
    'childcare_teacher2':     0,
    'korean_teacher2':        0,
    'computer_specialist':    12,
    'word_processor':         14,
    'bookkeeping':            18,
    'civil_service':          6,
    'cook':                   16,
    'beauty':                 20,
    'cosmetology':            20,
    'nurse_assistant':        14,
    'sports_instructor':      20,
    'fire_safety':            18,
    'electrical_engineer':    20,
    'mechanic':               18,
  }

  const maxCerts = degreeType === 'bachelor' ? 3 : 2
  let certCredits = 0
  if (Array.isArray(certificates)) {
    certificates.slice(0, maxCerts).forEach((cert: string) => {
      certCredits += (certCreditMap[cert] || 0)
    })
  }

  // 독학사 학점 (병행 시 최대 30학점)
  const doksakCredits = hasDoksak ? 30 : 0

  // 현재 보유 총 학점
  const heldCredits = transferCredits + certCredits + doksakCredits

  // 부족 학점
  const shortfall = Math.max(0, req.total - heldCredits)

  // 연간 이수제한: 42학점 / 학기당 24학점
  const semestersNeeded = Math.ceil(shortfall / 24)
  const yearsNeeded = (semestersNeeded / 2).toFixed(1)

  // 희망기간 내 이수 가능 여부
  const periodMonths = parseInt(period) || 24
  const possibleInPeriod = (semestersNeeded * 6) <= periodMonths

  // 학기별 추천 학점
  const creditsPerSemester = Math.min(24, Math.ceil(shortfall / semestersNeeded || 1))

  // 비용 추산 (온라인 교육원 기준: 과목당 평균 12만원, 3학점)
  const subjectsNeeded = Math.ceil(shortfall / 3)
  const estimatedCost = subjectsNeeded * 120000

  return {
    required: req,
    heldCredits,
    transferCredits,
    certCredits,
    doksakCredits,
    shortfall,
    semestersNeeded,
    yearsNeeded,
    possibleInPeriod,
    creditsPerSemester,
    subjectsNeeded,
    estimatedCost,
    message: possibleInPeriod
      ? `희망 기간(${periodMonths}개월) 내 학위 취득이 가능합니다.`
      : `희망 기간보다 약 ${(semestersNeeded * 6) - periodMonths}개월 더 필요합니다.`,
  }
}

// ─────────────────────────────────────────────────────────
// Helper: Cost Calculator
// ─────────────────────────────────────────────────────────
function calculateCost(input: any) {
  const { credits, institutionType } = input

  const pricePerSubject: Record<string, number> = {
    online:      120000,
    offline:     170000,
    university:  250000,
    doksak:      20000,
  }

  const price = pricePerSubject[institutionType] || 120000
  const subjects = Math.ceil((parseInt(credits) || 0) / 3)
  const total = subjects * price

  return {
    subjects,
    pricePerSubject: price,
    total,
    registrationFee: 4000,
    creditRecognitionFee: (parseInt(credits) || 0) * 1000,
    grandTotal: total + 4000 + (parseInt(credits) || 0) * 1000,
  }
}

// ─────────────────────────────────────────────────────────
// Layout Template
// ─────────────────────────────────────────────────────────
function renderLayout(page: string, title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="학점은행제 학습설계 시뮬레이터, 비용 계산기, 자격증 로드맵, 전공별 완전 가이드를 제공하는 데이터 기반 올인원 플랫폼">
  <meta name="keywords" content="학점은행제, 학점설계, 학습플래너, 사회복지사2급, 비용계산기, 자격증, 독학사">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/static/styles.css" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: { DEFAULT: '#2563EB', light: '#3B82F6', dark: '#1D4ED8' },
            secondary: { DEFAULT: '#10B981', light: '#34D399', dark: '#059669' },
            accent: { DEFAULT: '#F59E0B', light: '#FCD34D', dark: '#D97706' },
          }
        }
      }
    }
  </script>
</head>
<body class="bg-gray-50 font-sans">

<!-- Header -->
<header class="bg-white shadow-sm sticky top-0 z-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center h-16">
      <a href="/" class="flex items-center space-x-2">
        <div class="bg-primary rounded-lg p-2">
          <i class="fas fa-graduation-cap text-white text-lg"></i>
        </div>
        <div>
          <span class="text-xl font-bold text-gray-900">학점설계소</span>
          <span class="text-xs text-gray-500 block leading-none">學點設計所</span>
        </div>
      </a>
      
      <!-- Desktop Nav -->
      <nav class="hidden md:flex items-center space-x-1">
        <a href="/simulator" class="nav-link ${page === 'simulator' ? 'nav-active' : ''}">
          <i class="fas fa-route mr-1"></i>학습설계
        </a>
        <a href="/calculator" class="nav-link ${page === 'calculator' ? 'nav-active' : ''}">
          <i class="fas fa-calculator mr-1"></i>비용계산기
        </a>
        <a href="/certificates" class="nav-link ${page === 'certificates' ? 'nav-active' : ''}">
          <i class="fas fa-certificate mr-1"></i>자격증DB
        </a>
        <a href="/majors" class="nav-link ${page === 'majors' ? 'nav-active' : ''}">
          <i class="fas fa-book mr-1"></i>전공가이드
        </a>
        <a href="/archive" class="nav-link ${page === 'archive' ? 'nav-active' : ''}">
          <i class="fas fa-archive mr-1"></i>자료아카이브
        </a>
        <a href="/faq" class="nav-link ${page === 'faq' ? 'nav-active' : ''}">
          <i class="fas fa-question-circle mr-1"></i>FAQ
        </a>
      </nav>

      <!-- Mobile menu button -->
      <button onclick="toggleMobileMenu()" class="md:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100">
        <i class="fas fa-bars text-xl"></i>
      </button>
    </div>
  </div>
  
  <!-- Mobile Nav -->
  <div id="mobileMenu" class="hidden md:hidden bg-white border-t">
    <div class="px-4 py-3 space-y-1">
      <a href="/simulator" class="mobile-nav-link">🗺️ 학습설계 시뮬레이터</a>
      <a href="/calculator" class="mobile-nav-link">🧮 비용 계산기</a>
      <a href="/certificates" class="mobile-nav-link">🏅 자격증 로드맵 DB</a>
      <a href="/majors" class="mobile-nav-link">📚 전공별 완전 가이드</a>
      <a href="/archive" class="mobile-nav-link">🗂️ 공식 자료 아카이브</a>
      <a href="/faq" class="mobile-nav-link">❓ FAQ</a>
    </div>
  </div>
</header>

<!-- Main Content -->
<main>
${content}
</main>

<!-- Footer -->
<footer class="bg-gray-900 text-gray-300 py-12 mt-16">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
      <div class="col-span-1 md:col-span-2">
        <div class="flex items-center space-x-2 mb-4">
          <div class="bg-primary rounded-lg p-2">
            <i class="fas fa-graduation-cap text-white"></i>
          </div>
          <div>
            <span class="text-white font-bold text-lg">학점설계소</span>
            <span class="text-xs text-gray-400 block">學點設計所</span>
          </div>
        </div>
        <p class="text-sm text-gray-400 mb-4">
          공공데이터 기반 학점은행제 올인원 플랫폼.<br>
          122건+ 공식 자료를 바탕으로 신뢰성 있는 학습 설계를 도와드립니다.
        </p>
        <div class="flex space-x-4">
          <a href="https://www.cb.or.kr" target="_blank" class="text-xs text-gray-400 hover:text-white transition">
            <i class="fas fa-external-link-alt mr-1"></i>국가평생교육진흥원
          </a>
          <a href="https://www.cbinfo.or.kr" target="_blank" class="text-xs text-gray-400 hover:text-white transition">
            <i class="fas fa-external-link-alt mr-1"></i>학점은행 알리미
          </a>
        </div>
      </div>
      <div>
        <h4 class="text-white font-semibold mb-3">주요 기능</h4>
        <ul class="space-y-2 text-sm">
          <li><a href="/simulator" class="hover:text-white transition">학습설계 시뮬레이터</a></li>
          <li><a href="/calculator" class="hover:text-white transition">비용 계산기</a></li>
          <li><a href="/certificates" class="hover:text-white transition">자격증 로드맵 DB</a></li>
          <li><a href="/majors" class="hover:text-white transition">전공별 완전 가이드</a></li>
        </ul>
      </div>
      <div>
        <h4 class="text-white font-semibold mb-3">정보 자료</h4>
        <ul class="space-y-2 text-sm">
          <li><a href="/archive" class="hover:text-white transition">공식 자료 아카이브</a></li>
          <li><a href="/faq" class="hover:text-white transition">자주 묻는 질문</a></li>
          <li><a href="https://www.cb.or.kr" target="_blank" class="hover:text-white transition">학점은행제 공식 사이트</a></li>
        </ul>
      </div>
    </div>
    <div class="border-t border-gray-700 mt-8 pt-6 text-center text-xs text-gray-500">
      <p>본 사이트는 국가평생교육진흥원 공공데이터를 기반으로 제작된 정보 제공 플랫폼입니다.</p>
      <p class="mt-1">학점인정 기준은 변경될 수 있으니 정확한 사항은 <a href="https://www.cb.or.kr" target="_blank" class="text-primary hover:underline">학점은행제 공식 사이트</a>에서 확인하세요.</p>
      <p class="mt-2">© 2024 학점설계소 학점은행제 올인원 플랫폼</p>
    </div>
  </div>
</footer>

<script src="/static/app.js"></script>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────
// Home Page
// ─────────────────────────────────────────────────────────
function renderHomePage(): string {
  return `
<!-- Hero Section -->
<section class="hero-gradient text-white py-20 px-4">
  <div class="max-w-7xl mx-auto text-center">
    <div class="inline-flex items-center bg-white/20 rounded-full px-4 py-2 text-sm mb-6">
      <i class="fas fa-database mr-2"></i>
      122건+ 공식 데이터 기반 · 누적 학습자 262만 명 지원
    </div>
    <h1 class="text-4xl md:text-6xl font-bold mb-6 leading-tight">
      학점은행제<br>
      <span class="text-yellow-300">완전 정복</span>의 시작
    </h1>
    <p class="text-xl md:text-2xl text-blue-100 mb-8 max-w-3xl mx-auto">
      내 상황에 맞는 최적 학습 경로를 자동으로 설계해드립니다.<br>
      비용, 기간, 자격증까지 한 번에 확인하세요.
    </p>
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a href="/simulator" class="btn-hero-primary">
        <i class="fas fa-route mr-2"></i>
        무료 학습설계 시작하기
      </a>
      <a href="/calculator" class="btn-hero-secondary">
        <i class="fas fa-calculator mr-2"></i>
        비용 계산해보기
      </a>
    </div>
  </div>
</section>

<!-- Stats Section -->
<section class="bg-white py-12 border-b">
  <div class="max-w-7xl mx-auto px-4">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
      <div class="stat-card">
        <div class="text-3xl font-bold text-primary mb-1">262만+</div>
        <div class="text-gray-500 text-sm">누적 학습자 등록</div>
      </div>
      <div class="stat-card">
        <div class="text-3xl font-bold text-secondary mb-1">113만+</div>
        <div class="text-gray-500 text-sm">누적 학위 취득자</div>
      </div>
      <div class="stat-card">
        <div class="text-3xl font-bold text-accent mb-1">407개</div>
        <div class="text-gray-500 text-sm">인정 교육기관</div>
      </div>
      <div class="stat-card">
        <div class="text-3xl font-bold text-purple-600 mb-1">231개</div>
        <div class="text-gray-500 text-sm">인정 전공 수</div>
      </div>
    </div>
  </div>
</section>

<!-- Quick Simulator (Simplified) -->
<section class="py-16 px-4 bg-gray-50">
  <div class="max-w-4xl mx-auto">
    <div class="text-center mb-10">
      <h2 class="text-3xl font-bold text-gray-900 mb-3">
        <i class="fas fa-magic text-primary mr-2"></i>
        30초 빠른 학습 설계
      </h2>
      <p class="text-gray-600">기본 정보만 입력하면 학위 취득까지 필요한 학점과 기간을 바로 알 수 있어요</p>
    </div>
    
    <div class="bg-white rounded-2xl shadow-lg p-8">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label class="label-text">목표 학위</label>
          <select id="quickDegree" class="select-field">
            <option value="bachelor">학사 (4년제, 140학점)</option>
            <option value="associate2">전문학사 2년제 (80학점)</option>
            <option value="associate3">전문학사 3년제 (120학점)</option>
          </select>
        </div>
        <div>
          <label class="label-text">최종 학력</label>
          <select id="quickEducation" class="select-field">
            <option value="high">고졸 / 검정고시</option>
            <option value="college2">전문대 졸업</option>
            <option value="college3">3년제 전문대 졸업</option>
            <option value="university_dropout">4년제 대학 중퇴</option>
            <option value="university">4년제 대학 졸업</option>
          </select>
        </div>
        <div>
          <label class="label-text">현재 보유 학점</label>
          <input type="number" id="quickCredits" placeholder="0" min="0" max="200" class="input-field">
        </div>
        <div>
          <label class="label-text">희망 기간</label>
          <select id="quickPeriod" class="select-field">
            <option value="12">1년 이내</option>
            <option value="18" selected>1년 6개월</option>
            <option value="24">2년</option>
            <option value="36">3년</option>
          </select>
        </div>
      </div>
      
      <button onclick="quickCalculate()" class="w-full btn-primary py-4 text-lg">
        <i class="fas fa-calculator mr-2"></i>
        학습 경로 계산하기
      </button>
      
      <div id="quickResult" class="hidden mt-6 p-6 bg-blue-50 rounded-xl border border-blue-200">
        <!-- Result will be inserted here -->
      </div>
    </div>
    
    <div class="text-center mt-6">
      <a href="/simulator" class="text-primary hover:underline text-sm">
        <i class="fas fa-arrow-right mr-1"></i>
        자격증, 독학사까지 포함한 상세 설계 하러가기
      </a>
    </div>
  </div>
</section>

<!-- Features Section -->
<section class="py-16 px-4 bg-white">
  <div class="max-w-7xl mx-auto">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold text-gray-900 mb-3">학점설계소가 특별한 이유</h2>
      <p class="text-gray-600">정보 파편화, 불투명한 비용 문제를 해결합니다</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div class="feature-card">
        <div class="feature-icon bg-blue-100 text-primary">
          <i class="fas fa-shield-alt text-2xl"></i>
        </div>
        <h3 class="text-xl font-bold text-gray-900 mb-2">공식 데이터 기반 신뢰성</h3>
        <p class="text-gray-600 text-sm">국가평생교육진흥원 공공데이터 122건+를 직접 분석하여 정확한 정보를 제공합니다.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon bg-green-100 text-secondary">
          <i class="fas fa-route text-2xl"></i>
        </div>
        <h3 class="text-xl font-bold text-gray-900 mb-2">자동 최적 경로 설계</h3>
        <p class="text-gray-600 text-sm">내 최종학력, 자격증, 희망 기간을 입력하면 AI가 최적의 학습 경로를 자동 설계합니다.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon bg-yellow-100 text-accent">
          <i class="fas fa-coins text-2xl"></i>
        </div>
        <h3 class="text-xl font-bold text-gray-900 mb-2">투명한 비용 공개</h3>
        <p class="text-gray-600 text-sm">온라인·오프라인·대학부설 교육원 수강료를 비교하고 총 비용을 투명하게 계산합니다.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon bg-purple-100 text-purple-600">
          <i class="fas fa-certificate text-2xl"></i>
        </div>
        <h3 class="text-xl font-bold text-gray-900 mb-2">자격증 학점인정 DB</h3>
        <p class="text-gray-600 text-sm">학점은행제에서 인정되는 자격증 목록과 전공별 인정 학점을 한눈에 확인하세요.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon bg-red-100 text-red-600">
          <i class="fas fa-book-open text-2xl"></i>
        </div>
        <h3 class="text-xl font-bold text-gray-900 mb-2">전공별 완전 가이드</h3>
        <p class="text-gray-600 text-sm">경영학, 사회복지학, 컴퓨터공학 등 6대 인기 전공의 이수 요건과 로드맵을 제공합니다.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon bg-teal-100 text-teal-600">
          <i class="fas fa-calendar-check text-2xl"></i>
        </div>
        <h3 class="text-xl font-bold text-gray-900 mb-2">학사 일정 안내</h3>
        <p class="text-gray-600 text-sm">학습자 등록, 학점인정 신청, 학위 수여식 등 주요 일정을 미리 확인하세요.</p>
      </div>
    </div>
  </div>
</section>

<!-- Popular Majors Quick View -->
<section class="py-16 px-4 bg-gray-50">
  <div class="max-w-7xl mx-auto">
    <div class="text-center mb-10">
      <h2 class="text-3xl font-bold text-gray-900 mb-3">인기 전공 빠른 확인</h2>
      <p class="text-gray-600">가장 많이 찾는 전공의 핵심 정보를 바로 확인하세요</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      ${renderMajorCard('사회복지학', 'fa-hands-helping', 'bg-blue-500', '학사 140학점', '사회복지사 2급 취득 가능', '월 평균 학습자 수 1위', '/majors#social-welfare')}
      ${renderMajorCard('경영학', 'fa-chart-line', 'bg-green-500', '학사 140학점', '전공필수 18학점 이수', '취업 연계 최다 전공', '/majors#business')}
      ${renderMajorCard('컴퓨터공학', 'fa-laptop-code', 'bg-purple-500', '학사 140학점', '정보처리기사 20학점 인정', 'IT 취업 선호 전공', '/majors#computer')}
      ${renderMajorCard('유아교육학', 'fa-child', 'bg-yellow-500', '학사 140학점', '보육교사 2급 연계', '사회복지학과 함께 인기', '/majors#child-edu')}
      ${renderMajorCard('심리학', 'fa-brain', 'bg-red-500', '학사 140학점', '상담 자격증 연계', '최근 수요 급증 전공', '/majors#psychology')}
      ${renderMajorCard('간호학', 'fa-heartbeat', 'bg-teal-500', '학사 140학점', '간호조무사 14학점 인정', '의료 분야 취업 연계', '/majors#nursing')}
    </div>
    <div class="text-center mt-8">
      <a href="/majors" class="btn-secondary">
        <i class="fas fa-th-list mr-2"></i>
        전체 231개 전공 보기
      </a>
    </div>
  </div>
</section>

<!-- CTA Section -->
<section class="bg-primary py-16 px-4 text-white text-center">
  <div class="max-w-3xl mx-auto">
    <i class="fas fa-graduation-cap text-5xl mb-6 text-blue-200"></i>
    <h2 class="text-3xl font-bold mb-4">지금 바로 학습 경로를 설계해보세요</h2>
    <p class="text-blue-100 mb-8 text-lg">무료로 제공되는 학습설계 시뮬레이터로 나에게 맞는 최적의 경로를 찾아보세요</p>
    <a href="/simulator" class="bg-white text-primary font-bold px-8 py-4 rounded-xl hover:bg-blue-50 transition text-lg inline-flex items-center">
      <i class="fas fa-play mr-2"></i>
      무료 시뮬레이터 시작하기
    </a>
  </div>
</section>
`
}

function renderMajorCard(name: string, icon: string, bg: string, requirement: string, feature1: string, feature2: string, link: string): string {
  return `
  <a href="${link}" class="bg-white rounded-xl shadow-sm hover:shadow-md transition p-6 flex items-start space-x-4 group">
    <div class="${bg} rounded-xl p-3 text-white flex-shrink-0 group-hover:scale-110 transition">
      <i class="fas ${icon} text-xl"></i>
    </div>
    <div>
      <h3 class="font-bold text-gray-900 mb-1">${name}</h3>
      <p class="text-xs text-gray-500 mb-2">${requirement}</p>
      <div class="space-y-1">
        <div class="text-xs text-gray-600 flex items-center"><i class="fas fa-check text-green-500 mr-1 text-xs"></i>${feature1}</div>
        <div class="text-xs text-gray-600 flex items-center"><i class="fas fa-check text-green-500 mr-1 text-xs"></i>${feature2}</div>
      </div>
    </div>
  </a>`
}

// ─────────────────────────────────────────────────────────
// Simulator Page
// ─────────────────────────────────────────────────────────
function renderSimulatorPage(): string {
  return `
<div class="max-w-5xl mx-auto px-4 py-12">
  <div class="text-center mb-10">
    <h1 class="text-4xl font-bold text-gray-900 mb-3">
      <i class="fas fa-route text-primary mr-2"></i>
      학습설계 시뮬레이터
    </h1>
    <p class="text-gray-600 text-lg">내 상황을 입력하면 최적의 학습 경로를 자동으로 설계해 드립니다</p>
  </div>

  <div class="bg-white rounded-2xl shadow-lg overflow-hidden">
    <!-- Progress Bar -->
    <div class="bg-gray-100 h-2">
      <div id="progressBar" class="bg-primary h-2 transition-all duration-500" style="width: 20%"></div>
    </div>

    <!-- Step Indicators -->
    <div class="flex justify-between px-8 py-4 border-b">
      ${[
        { n: 1, label: '학력정보' },
        { n: 2, label: '목표설정' },
        { n: 3, label: '자격증' },
        { n: 4, label: '추가옵션' },
        { n: 5, label: '결과확인' },
      ].map(s => `
        <div class="step-indicator" id="step-ind-${s.n}">
          <div class="step-circle" id="step-circle-${s.n}">${s.n}</div>
          <span class="text-xs mt-1 hidden sm:block">${s.label}</span>
        </div>
      `).join('')}
    </div>

    <div class="p-8">
      <!-- Step 1: Education Background -->
      <div id="step1" class="step-content">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">📚 현재 학력을 선택해주세요</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${[
            { v: 'high', label: '고졸 / 검정고시', desc: '고등학교 졸업 또는 검정고시 합격', icon: 'fa-school' },
            { v: 'college2', label: '전문대 졸업 (2년)', desc: '2년제 전문대학 졸업 (최대 80학점 인정)', icon: 'fa-university' },
            { v: 'college3', label: '전문대 졸업 (3년)', desc: '3년제 전문대학 졸업 (최대 80학점 인정)', icon: 'fa-university' },
            { v: 'university_dropout', label: '4년제 대학 중퇴', desc: '4년제 대학 재학/중퇴 (취득학점 인정)', icon: 'fa-graduation-cap' },
            { v: 'university', label: '4년제 대학 졸업', desc: '4년제 대학 졸업 (타전공 학위 취득 가능)', icon: 'fa-user-graduate' },
          ].map(e => `
            <label class="option-card cursor-pointer">
              <input type="radio" name="education" value="${e.v}" class="sr-only" onchange="selectOption(this, 'education')">
              <div class="flex items-center space-x-4 p-4 border-2 rounded-xl hover:border-primary hover:bg-blue-50 transition" id="opt-education-${e.v}">
                <div class="bg-blue-100 text-primary rounded-lg p-3 flex-shrink-0">
                  <i class="fas ${e.icon} text-xl"></i>
                </div>
                <div>
                  <div class="font-semibold text-gray-900">${e.label}</div>
                  <div class="text-sm text-gray-500">${e.desc}</div>
                </div>
              </div>
            </label>
          `).join('')}
        </div>
        
        <div id="creditsInput" class="hidden mt-6">
          <label class="label-text">취득/이수한 학점 수</label>
          <input type="number" id="currentCredits" placeholder="예: 60" min="0" max="200" class="input-field max-w-xs">
          <p class="text-sm text-gray-500 mt-1">전적대에서 이수한 학점 수를 입력하세요 (모르면 0 입력)</p>
        </div>
      </div>

      <!-- Step 2: Degree Goal -->
      <div id="step2" class="step-content hidden">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">🎓 목표 학위와 전공을 선택하세요</h2>
        <div class="mb-6">
          <label class="label-text">목표 학위</label>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
            ${[
              { v: 'bachelor', label: '학사학위', sub: '총 140학점 (4년제)', icon: 'fa-graduation-cap', color: 'blue' },
              { v: 'associate2', label: '전문학사 (2년)', sub: '총 80학점', icon: 'fa-award', color: 'green' },
              { v: 'associate3', label: '전문학사 (3년)', sub: '총 120학점', icon: 'fa-award', color: 'purple' },
            ].map(d => `
              <label class="cursor-pointer">
                <input type="radio" name="degreeType" value="${d.v}" class="sr-only" onchange="selectOption(this, 'degreeType')">
                <div class="degree-card border-2 rounded-xl p-4 text-center hover:border-primary hover:bg-blue-50 transition" id="opt-degreeType-${d.v}">
                  <i class="fas ${d.icon} text-3xl text-${d.color}-500 mb-2"></i>
                  <div class="font-bold text-gray-900">${d.label}</div>
                  <div class="text-xs text-gray-500">${d.sub}</div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>
        
        <div class="mb-6">
          <label class="label-text">희망 전공</label>
          <select id="major" class="select-field">
            <option value="">전공을 선택하세요</option>
            <optgroup label="인문·사회">
              <option value="social_welfare">사회복지학</option>
              <option value="business">경영학</option>
              <option value="psychology">심리학</option>
              <option value="korean_language">한국어교육학</option>
              <option value="law">법학</option>
            </optgroup>
            <optgroup label="이공계">
              <option value="computer">컴퓨터공학</option>
              <option value="information_security">정보보호학</option>
              <option value="mechanical">기계공학</option>
              <option value="electrical">전기공학</option>
            </optgroup>
            <optgroup label="교육·복지">
              <option value="child_edu">유아교육학</option>
              <option value="elementary_edu">초등교육학</option>
              <option value="lifelong_edu">평생교육학</option>
            </optgroup>
            <optgroup label="의료·보건">
              <option value="nursing">간호학</option>
              <option value="health">보건학</option>
              <option value="dental">치위생학</option>
            </optgroup>
            <optgroup label="예술·체육">
              <option value="sports">스포츠학</option>
              <option value="arts">미술학</option>
              <option value="music">음악학</option>
            </optgroup>
          </select>
        </div>
        
        <div>
          <label class="label-text">희망 취득 기간</label>
          <div class="flex flex-wrap gap-3 mt-2">
            ${['6개월', '1년', '1년 6개월', '2년', '3년', '상관없음'].map((p, i) => {
              const vals = ['6', '12', '18', '24', '36', '48']
              return `
              <label class="cursor-pointer">
                <input type="radio" name="period" value="${vals[i]}" class="sr-only" onchange="selectOption(this, 'period')">
                <div class="period-chip px-4 py-2 border-2 rounded-full text-sm font-medium hover:border-primary hover:bg-blue-50 transition cursor-pointer" id="opt-period-${vals[i]}">${p}</div>
              </label>`
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Step 3: Certificates -->
      <div id="step3" class="step-content hidden">
        <h2 class="text-2xl font-bold text-gray-900 mb-2">🏅 보유하거나 취득 예정인 자격증을 선택하세요</h2>
        <p class="text-gray-500 mb-6 text-sm">학사과정 최대 3개, 전문학사 최대 2개까지 학점으로 인정됩니다</p>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3" id="certGrid">
          ${[
            { v: 'information_processing', label: '정보처리기사', credits: 20, dept: '컴퓨터공학', level: '기사' },
            { v: 'computer_specialist', label: '컴퓨터활용능력 1급', credits: 12, dept: '경영학·IT', level: '국가기술' },
            { v: 'social_worker1', label: '사회복지사 1급', credits: 20, dept: '사회복지학', level: '1급' },
            { v: 'bookkeeping', label: '전산세무·회계 1급', credits: 18, dept: '경영학', level: '민간' },
            { v: 'word_processor', label: '워드프로세서', credits: 14, dept: '사무행정', level: '국가기술' },
            { v: 'beauty', label: '미용사(일반)', credits: 20, dept: '미용학', level: '기사' },
            { v: 'cosmetology', label: '피부미용사', credits: 20, dept: '미용학', level: '기사' },
            { v: 'cook', label: '조리기능사', credits: 16, dept: '식품조리', level: '기능사' },
            { v: 'nurse_assistant', label: '간호조무사', credits: 14, dept: '간호학', level: '국가자격' },
            { v: 'sports_instructor', label: '생활스포츠지도사', credits: 20, dept: '스포츠학', level: '국가자격' },
            { v: 'fire_safety', label: '소방설비기사', credits: 18, dept: '소방방재학', level: '기사' },
            { v: 'electrical_engineer', label: '전기기사', credits: 20, dept: '전기공학', level: '기사' },
            { v: 'civil_service', label: '공인중개사', credits: 6, dept: '법학·부동산', level: '국가자격' },
            { v: 'mechanic', label: '자동차정비기사', credits: 18, dept: '기계공학', level: '기사' },
          ].map(cert => `
            <label class="cursor-pointer">
              <div class="cert-card flex items-center justify-between p-4 border-2 rounded-xl hover:border-primary hover:bg-blue-50 transition" 
                   id="cert-${cert.v}" onclick="toggleCert('${cert.v}')">
                <div class="flex items-center space-x-3">
                  <div class="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i class="fas fa-certificate text-yellow-600"></i>
                  </div>
                  <div>
                    <div class="font-semibold text-gray-900 text-sm">${cert.label}</div>
                    <div class="text-xs text-gray-500">${cert.dept} · ${cert.level}</div>
                  </div>
                </div>
                <div class="flex items-center space-x-2 flex-shrink-0">
                  <span class="bg-blue-100 text-primary text-xs font-bold px-2 py-1 rounded-full">${cert.credits}학점</span>
                  <div class="w-5 h-5 rounded border-2 border-gray-300 flex items-center justify-center" id="cert-check-${cert.v}"></div>
                </div>
              </div>
            </label>
          `).join('')}
        </div>
        
        <div class="mt-4 p-4 bg-gray-50 rounded-xl">
          <p class="text-sm text-gray-600">
            <i class="fas fa-info-circle text-primary mr-1"></i>
            선택된 자격증: <span id="selectedCertCount" class="font-bold text-primary">0</span>개
            / 인정 학점: <span id="selectedCertCredits" class="font-bold text-green-600">0</span>학점
          </p>
        </div>
      </div>

      <!-- Step 4: Additional Options -->
      <div id="step4" class="step-content hidden">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">⚙️ 추가 옵션을 선택하세요</h2>
        
        <div class="space-y-4">
          <div class="option-toggle-card p-6 border-2 rounded-xl cursor-pointer hover:border-primary transition" 
               id="doksakToggle" onclick="toggleOption('hasDoksak')">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-4">
                <div class="bg-orange-100 text-orange-600 rounded-lg p-3">
                  <i class="fas fa-book text-2xl"></i>
                </div>
                <div>
                  <h3 class="font-bold text-gray-900">독학학위제 병행</h3>
                  <p class="text-sm text-gray-500">독학사 시험으로 최대 30학점 추가 인정 (과목당 ~2만원)</p>
                </div>
              </div>
              <div class="toggle-switch" id="toggle-hasDoksak">
                <div class="toggle-knob"></div>
              </div>
            </div>
          </div>
          
          <div class="option-toggle-card p-6 border-2 rounded-xl cursor-pointer hover:border-primary transition"
               id="kmoocToggle" onclick="toggleOption('hasKmooc')">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-4">
                <div class="bg-teal-100 text-teal-600 rounded-lg p-3">
                  <i class="fas fa-desktop text-2xl"></i>
                </div>
                <div>
                  <h3 class="font-bold text-gray-900">K-MOOC 활용</h3>
                  <p class="text-sm text-gray-500">무료 온라인 강좌로 일부 학점 인정 가능 (학교별 상이)</p>
                </div>
              </div>
              <div class="toggle-switch" id="toggle-hasKmooc">
                <div class="toggle-knob"></div>
              </div>
            </div>
          </div>
          
          <div class="p-6 bg-blue-50 rounded-xl border border-blue-200">
            <h3 class="font-bold text-gray-900 mb-3">
              <i class="fas fa-lightbulb text-yellow-500 mr-2"></i>
              학점인정 주요 제한사항
            </h3>
            <ul class="space-y-2 text-sm text-gray-700">
              <li class="flex items-start">
                <i class="fas fa-exclamation-triangle text-orange-500 mr-2 mt-0.5 flex-shrink-0"></i>
                연간 최대 이수 인정학점: <strong class="mx-1">42학점</strong> (1학기 최대 24학점)
              </li>
              <li class="flex items-start">
                <i class="fas fa-exclamation-triangle text-orange-500 mr-2 mt-0.5 flex-shrink-0"></i>
                의무 이수학점: 평가인정과목 또는 시간제등록으로 <strong class="mx-1">18학점 이상</strong> 필수
              </li>
              <li class="flex items-start">
                <i class="fas fa-exclamation-triangle text-orange-500 mr-2 mt-0.5 flex-shrink-0"></i>
                자격증 인정: 학사 최대 <strong class="mx-1">3개</strong>, 전문학사 최대 <strong class="mx-1">2개</strong>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Step 5: Results -->
      <div id="step5" class="step-content hidden">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">
          <i class="fas fa-chart-bar text-primary mr-2"></i>
          나의 맞춤형 학습 설계 결과
        </h2>
        <div id="simulatorResult">
          <!-- Results populated by JS -->
        </div>
      </div>

      <!-- Navigation Buttons -->
      <div class="flex justify-between mt-8 pt-6 border-t">
        <button onclick="prevStep()" id="prevBtn" class="hidden px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition font-medium">
          <i class="fas fa-arrow-left mr-2"></i>이전
        </button>
        <div></div>
        <button onclick="nextStep()" id="nextBtn" class="px-8 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition font-medium shadow-md">
          다음 <i class="fas fa-arrow-right ml-2"></i>
        </button>
      </div>
    </div>
  </div>
</div>
`
}

// ─────────────────────────────────────────────────────────
// Calculator Page
// ─────────────────────────────────────────────────────────
function renderCalculatorPage(): string {
  return `
<div class="max-w-6xl mx-auto px-4 py-12">
  <div class="text-center mb-10">
    <h1 class="text-4xl font-bold text-gray-900 mb-3">
      <i class="fas fa-calculator text-primary mr-2"></i>
      비용 계산기 & 교육원 비교
    </h1>
    <p class="text-gray-600 text-lg">학위 취득까지 필요한 총 비용을 투명하게 계산해보세요</p>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <!-- Calculator -->
    <div class="bg-white rounded-2xl shadow-lg p-8">
      <h2 class="text-xl font-bold text-gray-900 mb-6">
        <i class="fas fa-coins text-accent mr-2"></i>
        총 비용 계산기
      </h2>
      
      <div class="space-y-5">
        <div>
          <label class="label-text">취득해야 할 학점 수</label>
          <div class="flex items-center space-x-3">
            <input type="range" id="creditsSlider" min="0" max="140" value="80" class="flex-1 accent-primary"
                   oninput="updateCostCalc()">
            <div class="bg-primary text-white font-bold px-4 py-2 rounded-lg min-w-[60px] text-center" id="creditsDisplay">80</div>
          </div>
        </div>
        
        <div>
          <label class="label-text">교육기관 유형</label>
          <div class="grid grid-cols-2 gap-3 mt-2">
            ${[
              { v: 'online', label: '온라인 교육원', price: '과목당 9~15만원', icon: 'fa-wifi', color: 'blue' },
              { v: 'offline', label: '오프라인 교육원', price: '과목당 15~20만원', icon: 'fa-building', color: 'green' },
              { v: 'university', label: '대학부설 평생교육원', price: '과목당 20~30만원', icon: 'fa-university', color: 'purple' },
              { v: 'doksak', label: '독학학위제', price: '과목당 약 2만원', icon: 'fa-book', color: 'orange' },
            ].map((t, i) => `
              <label class="cursor-pointer">
                <input type="radio" name="instType" value="${t.v}" class="sr-only" ${i === 0 ? 'checked' : ''} onchange="updateCostCalc()">
                <div class="inst-type-card border-2 rounded-xl p-3 text-center hover:border-primary transition text-sm" id="inst-${t.v}">
                  <i class="fas ${t.icon} text-${t.color}-500 text-lg mb-1 block"></i>
                  <div class="font-semibold text-gray-900 text-xs">${t.label}</div>
                  <div class="text-gray-500 text-xs mt-0.5">${t.price}</div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>
        
        <!-- Cost Breakdown -->
        <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6" id="costBreakdown">
          <h3 class="font-bold text-gray-900 mb-4">비용 내역</h3>
          <div class="space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">수강료 <span id="subjectCount">27</span>과목 × <span id="pricePerSubject">120,000</span>원</span>
              <span class="font-bold text-gray-900" id="tuitionTotal">3,240,000원</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">학습자 등록비</span>
              <span class="font-medium" id="regFee">4,000원</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">학점인정 신청비 (<span id="creditFeeCredits">80</span>학점 × 1,000원)</span>
              <span class="font-medium" id="creditFee">80,000원</span>
            </div>
            <div class="border-t border-blue-200 pt-3 flex justify-between">
              <span class="font-bold text-gray-900 text-lg">총 예상 비용</span>
              <span class="font-bold text-primary text-xl" id="grandTotal">3,324,000원</span>
            </div>
          </div>
        </div>

        <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p class="text-xs text-yellow-800">
            <i class="fas fa-info-circle mr-1"></i>
            위 금액은 추정치입니다. 교육원별로 실제 수강료가 다를 수 있으며, 정확한 금액은 각 교육기관에 문의하세요.
          </p>
        </div>
      </div>
    </div>

    <!-- Institution Comparison Table -->
    <div class="bg-white rounded-2xl shadow-lg p-8">
      <h2 class="text-xl font-bold text-gray-900 mb-6">
        <i class="fas fa-balance-scale text-secondary mr-2"></i>
        교육기관 유형별 비교
      </h2>
      
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50">
              <th class="text-left p-3 rounded-l-lg font-semibold text-gray-700">구분</th>
              <th class="text-center p-3 font-semibold text-blue-600">온라인</th>
              <th class="text-center p-3 font-semibold text-green-600">오프라인</th>
              <th class="text-center p-3 rounded-r-lg font-semibold text-purple-600">대학부설</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr>
              <td class="p-3 font-medium text-gray-700">과목당 비용</td>
              <td class="p-3 text-center text-blue-600 font-bold">9~15만원</td>
              <td class="p-3 text-center text-green-600 font-bold">15~20만원</td>
              <td class="p-3 text-center text-purple-600 font-bold">20~30만원</td>
            </tr>
            <tr class="bg-gray-50">
              <td class="p-3 font-medium text-gray-700">접근성/편의성</td>
              <td class="p-3 text-center">${renderStars(5)}</td>
              <td class="p-3 text-center">${renderStars(3)}</td>
              <td class="p-3 text-center">${renderStars(3)}</td>
            </tr>
            <tr>
              <td class="p-3 font-medium text-gray-700">커리큘럼 수준</td>
              <td class="p-3 text-center">${renderStars(3)}</td>
              <td class="p-3 text-center">${renderStars(4)}</td>
              <td class="p-3 text-center">${renderStars(5)}</td>
            </tr>
            <tr class="bg-gray-50">
              <td class="p-3 font-medium text-gray-700">시간 유연성</td>
              <td class="p-3 text-center">${renderStars(5)}</td>
              <td class="p-3 text-center">${renderStars(2)}</td>
              <td class="p-3 text-center">${renderStars(2)}</td>
            </tr>
            <tr>
              <td class="p-3 font-medium text-gray-700">취업/네트워크</td>
              <td class="p-3 text-center">${renderStars(2)}</td>
              <td class="p-3 text-center">${renderStars(3)}</td>
              <td class="p-3 text-center">${renderStars(5)}</td>
            </tr>
            <tr class="bg-gray-50">
              <td class="p-3 font-medium text-gray-700">전용 추천 상황</td>
              <td class="p-3 text-center text-xs text-gray-600">직장인·<br>최단기간</td>
              <td class="p-3 text-center text-xs text-gray-600">이론+실습<br>균형</td>
              <td class="p-3 text-center text-xs text-gray-600">취업·<br>대학원 진학</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Recommended Institutions -->
      <div class="mt-6">
        <h3 class="font-bold text-gray-900 mb-3">
          <i class="fas fa-star text-yellow-400 mr-1"></i>
          주요 온라인 교육기관
        </h3>
        <div class="space-y-3">
          ${[
            { name: '에듀윌 평생교육원', features: ['사회복지·경영·교육', '24시간 수강 가능', '할인 이벤트 다수'], url: 'https://www.eduwill.net' },
            { name: '휴넷 사이버평생교육원', features: ['IT·경영·자격증 특화', '모바일 앱 지원', '빠른 학점인정'], url: 'https://www.hunet.co.kr' },
            { name: '에듀피디 평생교육원', features: ['사회복지 전문', '낮은 수강료', '합격률 높음'], url: 'https://www.edufd.com' },
          ].map(inst => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div class="font-semibold text-gray-900 text-sm">${inst.name}</div>
                <div class="flex flex-wrap gap-1 mt-1">
                  ${inst.features.map(f => `<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">${f}</span>`).join('')}
                </div>
              </div>
              <a href="${inst.url}" target="_blank" class="text-xs text-primary hover:underline flex-shrink-0 ml-2">
                방문 <i class="fas fa-external-link-alt ml-0.5"></i>
              </a>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  </div>
  
  <!-- Annual Schedule -->
  <div class="mt-8 bg-white rounded-2xl shadow-lg p-8">
    <h2 class="text-xl font-bold text-gray-900 mb-6">
      <i class="fas fa-calendar-alt text-primary mr-2"></i>
      2024~2025 학점은행제 주요 학사 일정
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      ${[
        { period: '1~2월', items: ['학위수여식 (2월)', '1학기 학습자 등록'] },
        { period: '3~5월', items: ['1학기 수강 시작', '자격증 학점인정 신청'] },
        { period: '6~8월', items: ['1학기 학점인정 신청 마감', '2학기 학습자 등록'] },
        { period: '9~12월', items: ['2학기 수강 시작', '학위신청 (12월)'] },
      ].map(s => `
        <div class="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <div class="font-bold text-primary mb-3 text-sm">${s.period}</div>
          <ul class="space-y-2">
            ${s.items.map(i => `
              <li class="text-xs text-gray-700 flex items-start">
                <i class="fas fa-circle text-primary text-xs mr-2 mt-1 flex-shrink-0"></i>
                ${i}
              </li>
            `).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
    <p class="text-xs text-gray-500 mt-4">
      <i class="fas fa-info-circle mr-1"></i>
      정확한 일정은 국가평생교육진흥원 학점은행제 공식 사이트에서 확인하세요.
      <a href="https://www.cb.or.kr" target="_blank" class="text-primary hover:underline ml-1">바로가기 →</a>
    </p>
  </div>
</div>
`
}

function renderStars(count: number): string {
  return Array(5).fill(0).map((_, i) =>
    `<i class="fas fa-star text-xs ${i < count ? 'text-yellow-400' : 'text-gray-200'}"></i>`
  ).join('')
}

// ─────────────────────────────────────────────────────────
// Certificates Page
// ─────────────────────────────────────────────────────────
function renderCertificatesPage(): string {
  const categories = [
    {
      name: '정보·통신',
      icon: 'fa-laptop',
      color: 'blue',
      certs: [
        { name: '정보처리기사', credits: 20, major: '컴퓨터공학', level: '기사', issuer: 'HRD Korea', difficulty: '상', note: '컴퓨터공학 전공 최고 인정 자격증' },
        { name: '컴퓨터활용능력 1급', credits: 12, major: '경영학·IT', level: '국가기술', issuer: '대한상공회의소', difficulty: '중', note: '취업 필수 자격증' },
        { name: '정보보안기사', credits: 20, major: '정보보호학', level: '기사', issuer: 'KISA', difficulty: '상', note: '보안 전문가 필수' },
        { name: '네트워크관리사 2급', credits: 16, major: '컴퓨터공학', level: '민간', issuer: 'ICQA', difficulty: '중', note: '네트워크 분야 필수' },
      ]
    },
    {
      name: '복지·상담',
      icon: 'fa-hands-helping',
      color: 'green',
      certs: [
        { name: '사회복지사 1급', credits: 20, major: '사회복지학', level: '1급 국가', issuer: '보건복지부', difficulty: '상', note: '사회복지사 2급 취득 후 경력 1년 이상 필요' },
        { name: '사회복지사 2급', credits: 0, major: '사회복지학', level: '2급 국가', issuer: '보건복지부', difficulty: '하', note: '과목 이수 방식 (학점은행제로 취득 가능)' },
        { name: '청소년상담사 3급', credits: 18, major: '심리·상담학', level: '국가자격', issuer: '여성가족부', difficulty: '중', note: '청소년 분야 필수 자격증' },
        { name: '상담심리사 2급', credits: 16, major: '심리학', level: '민간', issuer: '한국상담학회', difficulty: '중', note: '상담 분야 활용도 높음' },
      ]
    },
    {
      name: '경영·회계',
      icon: 'fa-chart-bar',
      color: 'purple',
      certs: [
        { name: '전산세무 1급', credits: 18, major: '경영·회계학', level: '민간', issuer: '한국세무사회', difficulty: '상', note: '세무 분야 취업 우대' },
        { name: '공인중개사', credits: 6, major: '법학·부동산', level: '국가자격', issuer: '국토교통부', difficulty: '상', note: '부동산학 전공 인정' },
        { name: '경영지도사', credits: 20, major: '경영학', level: '국가자격', issuer: '중소벤처기업부', difficulty: '상', note: '경영학 최고 인정 자격증' },
        { name: '유통관리사 2급', credits: 14, major: '경영·유통', level: '국가자격', issuer: '대한상공회의소', difficulty: '중', note: '유통·마케팅 분야 필수' },
      ]
    },
    {
      name: '의료·보건',
      icon: 'fa-heartbeat',
      color: 'red',
      certs: [
        { name: '간호조무사', credits: 14, major: '간호학', level: '국가자격', issuer: '보건복지부', difficulty: '중', note: '간호학 전공에서 인정' },
        { name: '응급구조사 2급', credits: 20, major: '응급구조학', level: '국가자격', issuer: '보건복지부', difficulty: '상', note: '응급구조학 전공 필수' },
        { name: '요양보호사', credits: 14, major: '사회복지·노인학', level: '국가자격', issuer: '보건복지부', difficulty: '하', note: '노인복지 분야 취업 연계' },
      ]
    },
    {
      name: '교육·보육',
      icon: 'fa-child',
      color: 'yellow',
      certs: [
        { name: '보육교사 2급', credits: 0, major: '유아교육·아동학', level: '국가자격', issuer: '보건복지부', difficulty: '하', note: '과목 이수 방식' },
        { name: '한국어교원 2급', credits: 0, major: '한국어교육학', level: '국가자격', issuer: '문화체육관광부', difficulty: '중', note: '과목 이수 방식' },
        { name: '스포츠지도사 2급', credits: 20, major: '스포츠학', level: '국가자격', issuer: '문화체육관광부', difficulty: '중', note: '스포츠·체육학 전공 인정' },
      ]
    },
    {
      name: '기술·기능',
      icon: 'fa-tools',
      color: 'gray',
      certs: [
        { name: '전기기사', credits: 20, major: '전기공학', level: '기사', issuer: 'HRD Korea', difficulty: '상', note: '전기공학 최고 인정 자격증' },
        { name: '자동차정비기사', credits: 18, major: '기계공학', level: '기사', issuer: 'HRD Korea', difficulty: '상', note: '기계공학 전공 인정' },
        { name: '소방설비기사', credits: 18, major: '소방방재학', level: '기사', issuer: 'HRD Korea', difficulty: '상', note: '소방 분야 필수 자격증' },
        { name: '미용사(일반)', credits: 20, major: '미용학', level: '기사', issuer: 'HRD Korea', difficulty: '중', note: '미용학 전공 최고 학점' },
        { name: '조리기능사', credits: 16, major: '식품조리학', level: '기능사', issuer: 'HRD Korea', difficulty: '하', note: '조리 분야 기초 자격증' },
      ]
    },
  ]

  return `
<div class="max-w-7xl mx-auto px-4 py-12">
  <div class="text-center mb-10">
    <h1 class="text-4xl font-bold text-gray-900 mb-3">
      <i class="fas fa-certificate text-primary mr-2"></i>
      자격증 학점인정 로드맵 DB
    </h1>
    <p class="text-gray-600 text-lg">학점은행제에서 학점으로 인정되는 자격증 목록과 인정 학점을 확인하세요</p>
  </div>

  <!-- Key Info Box -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
    <div class="bg-blue-50 border border-blue-200 rounded-xl p-5">
      <div class="flex items-center space-x-3 mb-2">
        <i class="fas fa-graduation-cap text-blue-600 text-xl"></i>
        <h3 class="font-bold text-gray-900">학사 과정</h3>
      </div>
      <p class="text-sm text-gray-600">자격증 최대 <strong class="text-primary">3개</strong>까지 인정<br>
      (전공 무관 자격증은 최대 1개)</p>
    </div>
    <div class="bg-green-50 border border-green-200 rounded-xl p-5">
      <div class="flex items-center space-x-3 mb-2">
        <i class="fas fa-award text-green-600 text-xl"></i>
        <h3 class="font-bold text-gray-900">전문학사 과정</h3>
      </div>
      <p class="text-sm text-gray-600">자격증 최대 <strong class="text-secondary">2개</strong>까지 인정<br>
      (전공 무관 자격증은 최대 1개)</p>
    </div>
    <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
      <div class="flex items-center space-x-3 mb-2">
        <i class="fas fa-exclamation-circle text-yellow-600 text-xl"></i>
        <h3 class="font-bold text-gray-900">필수 조건</h3>
      </div>
      <p class="text-sm text-gray-600">자격증만으로 졸업 불가<br>
      교육원 수업 <strong class="text-orange-600">18학점 이상</strong> 필수</p>
    </div>
  </div>

  <!-- Search Bar -->
  <div class="bg-white rounded-xl shadow-sm p-4 mb-8 flex gap-3">
    <div class="flex-1 relative">
      <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
      <input type="text" id="certSearch" placeholder="자격증명, 전공명으로 검색..." 
             class="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-primary text-sm"
             oninput="filterCerts()">
    </div>
    <select id="certFilter" class="border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary" onchange="filterCerts()">
      <option value="">전체 분야</option>
      <option value="정보·통신">정보·통신</option>
      <option value="복지·상담">복지·상담</option>
      <option value="경영·회계">경영·회계</option>
      <option value="의료·보건">의료·보건</option>
      <option value="교육·보육">교육·보육</option>
      <option value="기술·기능">기술·기능</option>
    </select>
  </div>

  <!-- Certificate Categories -->
  <div id="certContainer">
    ${categories.map(cat => `
      <div class="cert-category mb-8" data-category="${cat.name}">
        <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <div class="bg-${cat.color}-100 text-${cat.color}-600 rounded-lg p-2 mr-3">
            <i class="fas ${cat.icon}"></i>
          </div>
          ${cat.name}
          <span class="ml-2 text-sm font-normal text-gray-500">(${cat.certs.length}개)</span>
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${cat.certs.map(cert => `
            <div class="cert-item bg-white rounded-xl shadow-sm hover:shadow-md transition p-5 border border-gray-100"
                 data-name="${cert.name}" data-major="${cert.major}" data-category="${cat.name}">
              <div class="flex items-start justify-between mb-3">
                <h3 class="font-bold text-gray-900">${cert.name}</h3>
                <span class="bg-${cert.credits > 0 ? 'blue' : 'gray'}-100 text-${cert.credits > 0 ? 'blue' : 'gray'}-700 text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ml-2">
                  ${cert.credits > 0 ? cert.credits + '학점' : '과목이수'}
                </span>
              </div>
              <div class="space-y-1.5 text-xs text-gray-600">
                <div class="flex items-center">
                  <i class="fas fa-graduation-cap text-gray-400 mr-2 w-4"></i>
                  <span>전공: <strong>${cert.major}</strong></span>
                </div>
                <div class="flex items-center">
                  <i class="fas fa-id-card text-gray-400 mr-2 w-4"></i>
                  <span>등급: ${cert.level}</span>
                </div>
                <div class="flex items-center">
                  <i class="fas fa-building text-gray-400 mr-2 w-4"></i>
                  <span>발급: ${cert.issuer}</span>
                </div>
                <div class="flex items-center">
                  <i class="fas fa-chart-bar text-gray-400 mr-2 w-4"></i>
                  <span>취득 난이도: 
                    <span class="${cert.difficulty === '상' ? 'text-red-600' : cert.difficulty === '중' ? 'text-yellow-600' : 'text-green-600'} font-bold">${cert.difficulty}</span>
                  </span>
                </div>
              </div>
              <div class="mt-3 p-2 bg-blue-50 rounded-lg">
                <p class="text-xs text-blue-700">
                  <i class="fas fa-lightbulb mr-1"></i>${cert.note}
                </p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  </div>

  <div class="mt-8 bg-gray-50 rounded-xl p-6 border border-gray-200">
    <h3 class="font-bold text-gray-900 mb-3">
      <i class="fas fa-external-link-alt text-primary mr-2"></i>
      공식 자격 조회
    </h3>
    <p class="text-sm text-gray-600 mb-3">정확한 자격증 학점 인정 여부와 인정 학점은 학점은행제 공식 사이트에서 확인하세요.</p>
    <a href="https://www.cb.or.kr/creditbank/eduIntro/nEduIntro2_4_3_List.do" target="_blank"
       class="inline-flex items-center text-primary hover:underline text-sm font-medium">
      <i class="fas fa-arrow-right mr-1"></i>
      전공별 자격 연계 검색하기 (학점은행제 공식)
    </a>
  </div>
</div>
`
}

// ─────────────────────────────────────────────────────────
// Majors Page
// ─────────────────────────────────────────────────────────
function renderMajorsPage(): string {
  const majors = [
    {
      id: 'social-welfare',
      name: '사회복지학',
      icon: 'fa-hands-helping',
      color: 'blue',
      totalCredits: 140,
      majorCredits: 60,
      required: ['사회복지개론(3)', '사회복지법제(3)', '사회복지실천론(3)', '사회복지실천기술론(3)', '사회복지행정론(3)', '사회복지조사론(3)'],
      linkedCerts: ['사회복지사 2급 (과목이수)', '사회복지사 1급 (20학점)'],
      period: '최소 12개월~18개월',
      cost: '약 200만~400만원',
      jobFields: ['사회복지사', '의료사회복지사', '정신보건사회복지사', '학교사회복지사', '노인복지시설'],
      highlight: '사회복지사 2급 자격증을 동시에 취득할 수 있어 가장 인기 있는 전공입니다. 필수 10과목 30학점을 반드시 이수해야 합니다.',
      tip: '사회복지현장실습(160시간)이 필수입니다. 현장실습 기관 섭외를 미리 준비하세요.',
    },
    {
      id: 'business',
      name: '경영학',
      icon: 'fa-chart-line',
      color: 'green',
      totalCredits: 140,
      majorCredits: 60,
      required: ['경영학원론(3)', '마케팅원론(3)', '재무관리(3)', '회계원리(3)', '경영정보시스템(3)', '인적자원관리(3)'],
      linkedCerts: ['경영지도사 (20학점)', '유통관리사 2급 (14학점)', '전산세무 1급 (18학점)'],
      period: '최소 12개월~24개월',
      cost: '약 200만~450만원',
      jobFields: ['경영 컨설턴트', '마케터', '재무분석가', '인사담당자', '창업'],
      highlight: '취업 연계가 가장 넓은 전공으로 다양한 자격증 학점인정이 가능합니다.',
      tip: '학사편입이나 대학원 진학을 목표로 한다면 대학부설 교육원을 추천합니다.',
    },
    {
      id: 'computer',
      name: '컴퓨터공학',
      icon: 'fa-laptop-code',
      color: 'purple',
      totalCredits: 140,
      majorCredits: 60,
      required: ['데이터베이스(3)', '알고리즘(3)', '자료구조(3)', '운영체제(3)', '컴퓨터구조(3)', '소프트웨어공학(3)'],
      linkedCerts: ['정보처리기사 (20학점)', '정보보안기사 (20학점)', '네트워크관리사 2급 (16학점)'],
      period: '최소 18개월~24개월',
      cost: '약 250만~500만원',
      jobFields: ['소프트웨어 개발자', '데이터 분석가', '보안 전문가', 'AI 엔지니어', 'IT 컨설턴트'],
      highlight: '정보처리기사(20학점) 취득으로 상당한 학점을 단축할 수 있습니다. IT 취업 선호 전공 1위.',
      tip: '전공필수 6과목(데이터베이스, 알고리즘 등 18학점)은 반드시 이수해야 합니다.',
    },
    {
      id: 'child-edu',
      name: '유아교육학',
      icon: 'fa-child',
      color: 'yellow',
      totalCredits: 140,
      majorCredits: 60,
      required: ['아동발달(3)', '유아교육개론(3)', '유아언어교육(3)', '유아수학교육(3)', '유아음악교육(3)', '유아과학교육(3)'],
      linkedCerts: ['보육교사 2급 (과목이수)', '유치원정교사 2급 (학사학위 필요)'],
      period: '최소 18개월~24개월',
      cost: '약 250만~450만원',
      jobFields: ['어린이집 교사', '유치원 교사', '아동 상담사', '놀이치료사'],
      highlight: '보육교사 2급 자격증 취득을 위한 필수 과목들을 이수하면 자격증도 동시에 취득 가능합니다.',
      tip: '보육실습 240시간이 필수입니다. 실습 기관을 미리 확보하세요.',
    },
    {
      id: 'psychology',
      name: '심리학',
      icon: 'fa-brain',
      color: 'red',
      totalCredits: 140,
      majorCredits: 60,
      required: ['심리학개론(3)', '발달심리학(3)', '상담심리학(3)', '이상심리학(3)', '인지심리학(3)', '사회심리학(3)'],
      linkedCerts: ['청소년상담사 3급 (18학점)', '상담심리사 2급 (16학점)'],
      period: '최소 18개월~24개월',
      cost: '약 250만~450만원',
      jobFields: ['상담사', '임상심리사', '학교상담교사', '인사 담당자', '연구원'],
      highlight: '최근 정신건강 관심 증가로 취업 수요가 급증하고 있는 전공입니다.',
      tip: '자격증 취득 후 상담 경험(수련시간)을 별도로 쌓아야 취업에 유리합니다.',
    },
    {
      id: 'nursing',
      name: '보건학',
      icon: 'fa-heartbeat',
      color: 'teal',
      totalCredits: 140,
      majorCredits: 60,
      required: ['보건학개론(3)', '역학(3)', '보건통계학(3)', '환경보건학(3)', '보건의사소통(3)', '만성질환관리(3)'],
      linkedCerts: ['간호조무사 (14학점)', '요양보호사 (14학점)'],
      period: '최소 18개월~24개월',
      cost: '약 250만~450만원',
      jobFields: ['보건소 직원', '의료기관 행정', '산업보건 담당자', '연구원'],
      highlight: '의료·보건 분야 취업을 원하지만 간호학 학위가 필요 없는 분들에게 적합합니다.',
      tip: '간호조무사 자격증이 있다면 14학점을 추가로 인정받을 수 있습니다.',
    },
  ]

  return `
<div class="max-w-7xl mx-auto px-4 py-12">
  <div class="text-center mb-10">
    <h1 class="text-4xl font-bold text-gray-900 mb-3">
      <i class="fas fa-book text-primary mr-2"></i>
      전공별 완전 가이드
    </h1>
    <p class="text-gray-600 text-lg">인기 전공의 이수 요건, 자격증 연계, 취업 분야를 한눈에 확인하세요</p>
  </div>

  <!-- Major Navigation -->
  <div class="flex flex-wrap gap-2 mb-8 justify-center">
    ${majors.map(m => `
      <a href="#${m.id}" class="px-4 py-2 bg-${m.color}-100 text-${m.color}-700 rounded-full text-sm font-medium hover:bg-${m.color}-200 transition">
        <i class="fas ${m.icon} mr-1"></i>${m.name}
      </a>
    `).join('')}
    <a href="https://www.cb.or.kr/creditbank/stdPro/nStdPro1_1.do" target="_blank"
       class="px-4 py-2 bg-gray-100 text-gray-600 rounded-full text-sm font-medium hover:bg-gray-200 transition">
      + 전체 231개 전공 보기 →
    </a>
  </div>

  <!-- Major Cards -->
  <div class="space-y-12">
    ${majors.map(m => `
      <div id="${m.id}" class="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div class="bg-${m.color}-500 p-6 text-white">
          <div class="flex items-center space-x-4">
            <div class="bg-white/20 rounded-xl p-3">
              <i class="fas ${m.icon} text-3xl"></i>
            </div>
            <div>
              <h2 class="text-2xl font-bold">${m.name}</h2>
              <div class="flex flex-wrap gap-3 mt-1 text-sm text-white/80">
                <span><i class="fas fa-clock mr-1"></i>${m.period}</span>
                <span><i class="fas fa-won-sign mr-1"></i>${m.cost}</span>
                <span><i class="fas fa-book mr-1"></i>총 ${m.totalCredits}학점</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Left Column -->
          <div class="space-y-5">
            <div class="p-4 bg-yellow-50 rounded-xl border border-yellow-100">
              <p class="text-sm text-yellow-800">
                <i class="fas fa-lightbulb text-yellow-500 mr-1"></i>
                ${m.highlight}
              </p>
            </div>
            
            <div>
              <h3 class="font-bold text-gray-900 mb-3 flex items-center">
                <i class="fas fa-list-check text-primary mr-2"></i>
                학위 취득 요건
              </h3>
              <div class="grid grid-cols-3 gap-3 text-center">
                <div class="bg-blue-50 rounded-lg p-3">
                  <div class="text-2xl font-bold text-primary">${m.totalCredits}</div>
                  <div class="text-xs text-gray-500">총 학점</div>
                </div>
                <div class="bg-green-50 rounded-lg p-3">
                  <div class="text-2xl font-bold text-secondary">${m.majorCredits}</div>
                  <div class="text-xs text-gray-500">전공 학점</div>
                </div>
                <div class="bg-purple-50 rounded-lg p-3">
                  <div class="text-2xl font-bold text-purple-600">30</div>
                  <div class="text-xs text-gray-500">교양 학점</div>
                </div>
              </div>
            </div>
            
            <div>
              <h3 class="font-bold text-gray-900 mb-3 flex items-center">
                <i class="fas fa-star text-yellow-400 mr-2"></i>
                전공필수 과목 (예시)
              </h3>
              <div class="flex flex-wrap gap-2">
                ${m.required.map(r => `
                  <span class="bg-blue-100 text-blue-700 text-xs px-3 py-1 rounded-full">${r}</span>
                `).join('')}
              </div>
            </div>

            <div class="p-4 bg-orange-50 rounded-xl border border-orange-100">
              <h3 class="font-bold text-gray-900 mb-2 text-sm flex items-center">
                <i class="fas fa-exclamation-circle text-orange-500 mr-1"></i>
                핵심 주의사항
              </h3>
              <p class="text-xs text-orange-800">${m.tip}</p>
            </div>
          </div>
          
          <!-- Right Column -->
          <div class="space-y-5">
            <div>
              <h3 class="font-bold text-gray-900 mb-3 flex items-center">
                <i class="fas fa-certificate text-yellow-500 mr-2"></i>
                연계 자격증
              </h3>
              <div class="space-y-2">
                ${m.linkedCerts.map(cert => `
                  <div class="flex items-center p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                    <i class="fas fa-check-circle text-green-500 mr-2 flex-shrink-0"></i>
                    <span class="text-sm text-gray-700 font-medium">${cert}</span>
                  </div>
                `).join('')}
              </div>
            </div>
            
            <div>
              <h3 class="font-bold text-gray-900 mb-3 flex items-center">
                <i class="fas fa-briefcase text-gray-500 mr-2"></i>
                주요 취업 분야
              </h3>
              <div class="flex flex-wrap gap-2">
                ${m.jobFields.map(j => `
                  <span class="bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-full hover:bg-gray-200 transition">${j}</span>
                `).join('')}
              </div>
            </div>
            
            <div>
              <h3 class="font-bold text-gray-900 mb-3 flex items-center">
                <i class="fas fa-road text-primary mr-2"></i>
                권장 학습 로드맵
              </h3>
              <div class="space-y-2">
                ${['1단계: 학습자 등록 + 전공필수 과목 이수 시작', '2단계: 자격증 취득 + 학점 인정 신청', '3단계: 잔여 학점 이수 (교양·일반선택)', '4단계: 학위 신청 (매년 12월)'].map((step, i) => `
                  <div class="flex items-start space-x-3">
                    <div class="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">${i + 1}</div>
                    <p class="text-sm text-gray-700 pt-0.5">${step.replace(/^\d단계: /, '')}</p>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
        
        <div class="px-6 pb-6">
          <a href="/simulator" class="inline-flex items-center bg-${m.color}-500 text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition text-sm font-medium">
            <i class="fas fa-route mr-2"></i>
            ${m.name} 맞춤 학습설계 시작하기
          </a>
        </div>
      </div>
    `).join('')}
  </div>
</div>
`
}

// ─────────────────────────────────────────────────────────
// Archive Page
// ─────────────────────────────────────────────────────────
function renderArchivePage(): string {
  const resources = [
    {
      category: '법률·규정',
      icon: 'fa-gavel',
      color: 'blue',
      items: [
        { title: '학점인정 등에 관한 법률', desc: '학점은행제의 법적 근거 (제정 1997년)', url: 'https://www.law.go.kr/lsInfoP.do?lsiSeq=233027', type: '법령' },
        { title: '학점인정 등에 관한 법률 시행령', desc: '세부 학점인정 기준 및 절차', url: 'https://www.law.go.kr/lsInfoP.do?lsiSeq=237456', type: '시행령' },
        { title: '자격학점인정기준 고시', desc: '자격증별 인정 학점 연도별 고시 (교육부)', url: 'https://www.cb.or.kr', type: '고시' },
        { title: '표준교육과정 고시', desc: '전공별 교육과정 기준 (교육부장관 고시)', url: 'https://www.cb.or.kr/creditbank/stdPro/nStdPro1_1.do', type: '고시' },
      ]
    },
    {
      category: '공식 통계',
      icon: 'fa-chart-bar',
      color: 'green',
      items: [
        { title: '2023 학점은행제 연차보고서', desc: '연도별 학습자·학위취득자 현황 통계', url: 'https://www.nile.or.kr', type: '보고서' },
        { title: '학점은행 현황통계 (국가평생교육진흥원)', desc: '연도별 학습자 등록 및 학위 취득 현황', url: 'https://www.cb.or.kr', type: '통계' },
        { title: '평생교육통계 자료집', desc: '교육기관 현황, 학습자 분포 등 종합 통계', url: 'https://www.nile.or.kr', type: '통계' },
        { title: '학점은행제 알리미 공시정보', desc: '407개 교육기관별 정보 공시 데이터', url: 'https://www.cbinfo.or.kr', type: '공시' },
      ]
    },
    {
      category: '학술 연구',
      icon: 'fa-flask',
      color: 'purple',
      items: [
        { title: '학점은행제 학습자 특성 및 학습 동기 연구', desc: '한국평생교육학회 논문', url: 'https://scholar.google.com', type: '논문' },
        { title: '학점은행제 활성화 방안에 관한 연구', desc: '한국교육개발원 연구보고서', url: 'https://www.kedi.re.kr', type: '연구' },
        { title: '비형식교육과 학점은행제의 연계 방안', desc: '평생교육학 관련 학술지 게재', url: 'https://scholar.google.com', type: '논문' },
        { title: '학점은행제 참여자의 학습 만족도 분석', desc: '대학교육연구 학술지', url: 'https://scholar.google.com', type: '논문' },
      ]
    },
    {
      category: '공식 가이드',
      icon: 'fa-file-alt',
      color: 'yellow',
      items: [
        { title: '학점은행제 학습자 안내서', desc: '학습자 등록부터 학위취득까지 공식 가이드', url: 'https://www.cb.or.kr', type: '가이드' },
        { title: '교육훈련기관 평가인정 안내', desc: '교육기관 평가인정 절차 및 기준', url: 'https://www.cb.or.kr', type: '가이드' },
        { title: '독학학위제 안내서', desc: '독학사 시험 절차 및 학점인정 방법', url: 'https://www.nile.or.kr', type: '가이드' },
        { title: '시간제등록 안내서', desc: '대학(원) 시간제등록 학점인정 방법', url: 'https://www.cb.or.kr', type: '가이드' },
      ]
    },
  ]

  return `
<div class="max-w-7xl mx-auto px-4 py-12">
  <div class="text-center mb-10">
    <h1 class="text-4xl font-bold text-gray-900 mb-3">
      <i class="fas fa-archive text-primary mr-2"></i>
      공식 자료 아카이브
    </h1>
    <p class="text-gray-600 text-lg">법률, 통계, 연구자료 등 122건+ 공식 데이터를 체계적으로 정리했습니다</p>
  </div>

  <div class="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-8 flex items-start space-x-3">
    <i class="fas fa-info-circle text-blue-500 text-xl flex-shrink-0 mt-0.5"></i>
    <div>
      <p class="font-semibold text-blue-900 mb-1">데이터 신뢰성 안내</p>
      <p class="text-sm text-blue-700">본 아카이브는 국가평생교육진흥원, 교육부, 한국직업능력연구원 등 공신력 있는 기관의 공개 자료만을 수집·정리했습니다. 모든 자료는 원문 출처 링크를 제공합니다.</p>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    ${resources.map(r => `
      <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div class="bg-${r.color}-500 px-6 py-4 text-white flex items-center space-x-3">
          <i class="fas ${r.icon} text-xl"></i>
          <h2 class="text-lg font-bold">${r.category}</h2>
          <span class="ml-auto text-${r.color}-200 text-sm">${r.items.length}개 자료</span>
        </div>
        <div class="p-4 space-y-3">
          ${r.items.map(item => `
            <a href="${item.url}" target="_blank" class="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition group">
              <div class="bg-${r.color}-100 text-${r.color}-600 px-2 py-1 rounded text-xs font-bold flex-shrink-0 mt-0.5">${item.type}</div>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-gray-900 text-sm group-hover:text-primary transition truncate">${item.title}</div>
                <div class="text-xs text-gray-500 mt-0.5">${item.desc}</div>
              </div>
              <i class="fas fa-external-link-alt text-gray-400 group-hover:text-primary transition flex-shrink-0 mt-1 text-xs"></i>
            </a>
          `).join('')}
        </div>
      </div>
    `).join('')}
  </div>

  <!-- Key Public Data Sources -->
  <div class="mt-10 bg-white rounded-2xl shadow-sm p-8">
    <h2 class="text-xl font-bold text-gray-900 mb-6">
      <i class="fas fa-database text-primary mr-2"></i>
      주요 공공데이터 출처
    </h2>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      ${[
        { name: '국가평생교육진흥원', url: 'https://www.nile.or.kr', desc: '학점은행제 주관기관' },
        { name: '학점은행제 공식', url: 'https://www.cb.or.kr', desc: '학점인정·학위신청' },
        { name: '학점은행 알리미', url: 'https://www.cbinfo.or.kr', desc: '교육기관 공시정보' },
        { name: '한국직업능력연구원', url: 'https://www.krivet.re.kr', desc: '직업교육 연구자료' },
      ].map(s => `
        <a href="${s.url}" target="_blank" class="text-center p-4 border border-gray-200 rounded-xl hover:border-primary hover:bg-blue-50 transition">
          <i class="fas fa-external-link-alt text-primary text-lg mb-2 block"></i>
          <div class="font-semibold text-gray-900 text-sm">${s.name}</div>
          <div class="text-xs text-gray-500 mt-1">${s.desc}</div>
        </a>
      `).join('')}
    </div>
  </div>
</div>
`
}

// ─────────────────────────────────────────────────────────
// FAQ Page
// ─────────────────────────────────────────────────────────
function renderFaqPage(): string {
  const faqs = [
    {
      category: '기본 제도',
      icon: 'fa-question-circle',
      color: 'blue',
      items: [
        { q: '학점은행제란 무엇인가요?', a: '학점은행제는 「학점인정 등에 관한 법률」에 의거하여 학교 밖에서 이루어지는 다양한 형태의 학습과 자격을 학점으로 인정하고, 학점이 누적되어 일정 기준을 충족하면 교육부장관 명의의 학위를 수여하는 제도입니다. 1998년부터 시행되어 현재까지 누적 학위취득자 113만 명을 배출했습니다.' },
        { q: '학점은행제로 취득한 학위는 대학 학위와 동등한가요?', a: '네, 교육부장관 명의로 수여되는 학위로 대학 졸업 학위와 동등한 효력을 가집니다. 취업 및 공무원 시험 응시, 대학원 진학 등에 활용할 수 있습니다. 단, 일부 특수 분야(의사, 법조인 등)는 별도 자격 요건이 필요합니다.' },
        { q: '누가 학점은행제를 이용할 수 있나요?', a: '고등학교 졸업자 또는 동등 이상의 학력을 가진 사람이라면 누구나 이용 가능합니다. 직장인, 주부, 고령자 등 연령 제한 없이 누구나 학습자 등록을 할 수 있습니다.' },
      ]
    },
    {
      category: '학점 인정',
      icon: 'fa-check-circle',
      color: 'green',
      items: [
        { q: '1년에 최대 몇 학점까지 인정받을 수 있나요?', a: '수업을 통해 이수한 학점은 1년에 최대 42학점, 한 학기에 최대 24학점까지 인정받을 수 있습니다. 단, 자격증 취득 학점, 독학사 학점 등 수업 외 학점원은 이 제한에 포함되지 않습니다.' },
        { q: '전적대 학점은 얼마나 인정받을 수 있나요?', a: '2년제 전문대학 졸업자는 최대 80학점, 3년제 전문대학 졸업자도 최대 80학점까지 인정됩니다. 4년제 대학 졸업자는 타전공 학위 취득 시 전공학점을 별도로 이수해야 합니다. 4년제 대학 중퇴자는 취득한 학점을 그대로 인정받을 수 있습니다.' },
        { q: '자격증은 학점으로 인정되나요?', a: '네, 교육부장관이 고시하는 자격증은 학점으로 인정됩니다. 학사과정은 최대 3개(전공 무관 1개), 전문학사는 최대 2개까지 인정되며, 자격증 취득 후 국가평생교육진흥원에 학점인정 신청을 해야 합니다.' },
        { q: '의무 18학점이란 무엇인가요?', a: '학위 취득을 위해 반드시 평가인정 학습과목 또는 시간제등록을 통해 18학점 이상을 이수해야 하는 요건입니다. 자격증 학점이나 독학사 학점만으로는 학위를 취득할 수 없으며, 교육원 수강 또는 대학 시간제 수강이 필수입니다.' },
      ]
    },
    {
      category: '비용·절차',
      icon: 'fa-coins',
      color: 'yellow',
      items: [
        { q: '학점은행제 총 비용은 얼마나 드나요?', a: '온라인 교육원 기준 과목당 9~15만원이며, 학사 140학점 기준 수강료는 약 200~450만원 수준입니다. 여기에 학습자 등록비(4,000원), 학점인정 신청비(1학점당 1,000원)가 추가됩니다. 독학사를 병행하면 비용을 크게 줄일 수 있습니다.' },
        { q: '학점은행제 절차는 어떻게 되나요?', a: '① 학습자 등록(국가평생교육진흥원) → ② 교육기관 수강 또는 자격증 취득 → ③ 학점인정 신청 → ④ 학위 요건 충족 확인 → ⑤ 학위 신청(매년 12월) → ⑥ 학위 수여(2월)' },
        { q: '교육비 세액공제가 되나요?', a: '본인이 직접 수강하는 경우 교육비 전액 세액공제(15%) 대상입니다. 가족의 경우 1인당 연 900만원 한도 내에서 공제 가능합니다. 단, 학점은행제 공식 평가인정 기관에서 이수한 경우에 한합니다.' },
      ]
    },
    {
      category: '자격증·취업',
      icon: 'fa-briefcase',
      color: 'purple',
      items: [
        { q: '사회복지사 2급을 학점은행제로 취득할 수 있나요?', a: '가능합니다. 사회복지학 전공으로 학점은행제 학위를 취득하면 사회복지사 2급 자격이 자동으로 부여됩니다. 필수 10과목(30학점)과 현장실습 160시간을 이수해야 합니다. 2020년부터 교육과정이 변경되었으니 최신 기준을 확인하세요.' },
        { q: '학점은행제 학위로 공무원 시험을 볼 수 있나요?', a: '네, 학점은행제를 통해 취득한 학사 학위는 공무원 시험 응시에 완전히 동등하게 인정됩니다. 다만 일부 전문직 공무원(의사, 변호사 등)은 별도의 전문 자격이 필요합니다.' },
        { q: '대학원 진학도 가능한가요?', a: '학점은행제 학사 학위로 대학원 진학이 가능합니다. 단, 각 대학원마다 입학 요건이 다를 수 있으므로 목표 대학원의 입학 기준을 사전에 확인하는 것이 좋습니다.' },
      ]
    },
  ]

  return `
<div class="max-w-4xl mx-auto px-4 py-12">
  <div class="text-center mb-10">
    <h1 class="text-4xl font-bold text-gray-900 mb-3">
      <i class="fas fa-question-circle text-primary mr-2"></i>
      자주 묻는 질문 (FAQ)
    </h1>
    <p class="text-gray-600 text-lg">학점은행제에 대한 궁금증을 해결해드립니다</p>
  </div>

  <!-- Search Bar -->
  <div class="relative mb-8">
    <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
    <input type="text" id="faqSearch" placeholder="궁금한 내용을 검색하세요..." 
           class="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary text-sm"
           oninput="filterFAQ()">
  </div>

  <div id="faqContainer" class="space-y-8">
    ${faqs.map(cat => `
      <div class="faq-category" data-category="${cat.category}">
        <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center">
          <div class="bg-${cat.color}-100 text-${cat.color}-600 rounded-lg p-2 mr-3">
            <i class="fas ${cat.icon}"></i>
          </div>
          ${cat.category}
        </h2>
        <div class="space-y-3">
          ${cat.items.map((item, i) => `
            <div class="faq-item bg-white rounded-xl shadow-sm overflow-hidden" data-q="${item.q}">
              <button class="w-full text-left p-5 flex items-start justify-between hover:bg-gray-50 transition"
                      onclick="toggleFAQ(this)">
                <span class="font-semibold text-gray-900 pr-4 text-sm leading-relaxed">Q. ${item.q}</span>
                <i class="fas fa-chevron-down text-gray-400 flex-shrink-0 mt-0.5 transition-transform"></i>
              </button>
              <div class="faq-answer hidden px-5 pb-5">
                <div class="pt-3 border-t border-gray-100">
                  <p class="text-sm text-gray-700 leading-relaxed">${item.a}</p>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  </div>

  <!-- Contact CTA -->
  <div class="mt-10 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-2xl p-8 text-center">
    <i class="fas fa-headset text-4xl mb-4 text-blue-200"></i>
    <h2 class="text-xl font-bold mb-2">더 궁금한 점이 있으신가요?</h2>
    <p class="text-blue-100 mb-6 text-sm">학점은행제 공식 사이트에서 1:1 상담을 받아보세요</p>
    <div class="flex flex-col sm:flex-row gap-3 justify-center">
      <a href="https://www.cb.or.kr" target="_blank"
         class="bg-white text-primary font-bold px-6 py-3 rounded-xl hover:bg-blue-50 transition text-sm">
        <i class="fas fa-external-link-alt mr-1"></i>
        학점은행제 공식 상담
      </a>
      <a href="/simulator" class="bg-blue-400 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-300 transition text-sm">
        <i class="fas fa-route mr-1"></i>
        학습 경로 설계하기
      </a>
    </div>
  </div>
</div>
`
}

export default app
