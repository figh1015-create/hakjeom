/* ─────────────────────────────────────────────────────────
   학점설계소 - Main Frontend JavaScript
   ───────────────────────────────────────────────────────── */

// ─── Mobile Menu ───────────────────────────────────────
function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  if (menu) menu.classList.toggle('hidden');
}

// ─── Quick Calculator (Home Page) ──────────────────────
async function quickCalculate() {
  const degree = document.getElementById('quickDegree')?.value;
  const education = document.getElementById('quickEducation')?.value;
  const credits = document.getElementById('quickCredits')?.value || '0';
  const period = document.getElementById('quickPeriod')?.value;

  if (!degree || !education) {
    alert('목표 학위와 최종 학력을 선택해주세요.');
    return;
  }

  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        degreeType: degree,
        education: education,
        currentCredits: parseInt(credits) || 0,
        period: period,
        certificates: [],
        hasDoksak: false,
      })
    });

    const data = await res.json();
    displayQuickResult(data);
  } catch (err) {
    console.error(err);
    // Fallback client-side calculation
    const data = clientCalculate(degree, education, parseInt(credits) || 0, parseInt(period) || 24);
    displayQuickResult(data);
  }
}

function clientCalculate(degreeType, education, currentCredits, period) {
  const required = {
    bachelor:   { total: 140, major: 60, culture: 30, general: 50 },
    associate2: { total: 80,  major: 45, culture: 15, general: 20 },
    associate3: { total: 120, major: 54, culture: 21, general: 45 },
  };
  const req = required[degreeType] || required['bachelor'];

  let transferCredits = 0;
  if (education === 'college2' || education === 'college3') transferCredits = Math.min(80, currentCredits);
  else if (education === 'university') transferCredits = Math.min(140, currentCredits);
  else if (education === 'university_dropout') transferCredits = Math.min(currentCredits, 60);

  const shortfall = Math.max(0, req.total - transferCredits);
  const semestersNeeded = Math.ceil(shortfall / 24);
  const yearsNeeded = (semestersNeeded / 2).toFixed(1);
  const possibleInPeriod = (semestersNeeded * 6) <= period;
  const subjectsNeeded = Math.ceil(shortfall / 3);

  return {
    required: req, heldCredits: transferCredits, transferCredits,
    certCredits: 0, doksakCredits: 0, shortfall,
    semestersNeeded, yearsNeeded, possibleInPeriod,
    creditsPerSemester: Math.min(24, Math.ceil(shortfall / (semestersNeeded || 1))),
    subjectsNeeded, estimatedCost: subjectsNeeded * 120000,
    message: possibleInPeriod
      ? `희망 기간(${period}개월) 내 학위 취득이 가능합니다.`
      : `희망 기간보다 약 ${(semestersNeeded * 6) - period}개월 더 필요합니다.`,
  };
}

function displayQuickResult(data) {
  const el = document.getElementById('quickResult');
  if (!el) return;

  const fmt = (n) => n.toLocaleString('ko-KR') + '원';
  const isPossible = data.possibleInPeriod;

  el.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
      <div class="text-center p-3 bg-white rounded-xl shadow-sm">
        <div class="text-2xl font-bold text-blue-600">${data.shortfall}</div>
        <div class="text-xs text-gray-500 mt-1">부족 학점</div>
      </div>
      <div class="text-center p-3 bg-white rounded-xl shadow-sm">
        <div class="text-2xl font-bold text-green-600">${data.semestersNeeded}</div>
        <div class="text-xs text-gray-500 mt-1">필요 학기</div>
      </div>
      <div class="text-center p-3 bg-white rounded-xl shadow-sm">
        <div class="text-2xl font-bold text-purple-600">${data.yearsNeeded}</div>
        <div class="text-xs text-gray-500 mt-1">최소 기간(년)</div>
      </div>
      <div class="text-center p-3 bg-white rounded-xl shadow-sm">
        <div class="text-lg font-bold text-orange-600">${fmt(data.estimatedCost)}</div>
        <div class="text-xs text-gray-500 mt-1">예상 비용</div>
      </div>
    </div>
    
    <div class="flex items-start space-x-3 p-4 ${isPossible ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'} rounded-xl">
      <i class="fas ${isPossible ? 'fa-check-circle text-green-500' : 'fa-exclamation-triangle text-orange-500'} text-lg flex-shrink-0 mt-0.5"></i>
      <div>
        <p class="font-semibold text-gray-900 text-sm">${data.message}</p>
        <p class="text-xs text-gray-600 mt-1">
          학기당 <strong>${data.creditsPerSemester}학점</strong> 이수,
          총 <strong>${data.subjectsNeeded}과목</strong> 수강 예상
        </p>
      </div>
    </div>
    
    <div class="mt-4 text-center">
      <a href="/simulator" class="text-sm text-blue-600 hover:underline font-medium">
        <i class="fas fa-arrow-right mr-1"></i>자격증·독학사 포함 상세 설계 →
      </a>
    </div>
  `;
  el.classList.remove('hidden');
}

// ─── Simulator ─────────────────────────────────────────
let currentStep = 1;
const totalSteps = 5;
const simulatorData = {
  education: null,
  currentCredits: 0,
  degreeType: null,
  major: '',
  period: null,
  certificates: [],
  hasDoksak: false,
  hasKmooc: false,
};

function selectOption(input, field) {
  simulatorData[field] = input.value;

  // Update UI
  document.querySelectorAll(`[id^="opt-${field}-"]`).forEach(el => {
    el.classList.remove('option-selected', 'border-blue-500', 'bg-blue-50');
    el.style.borderColor = '';
  });

  const target = document.getElementById(`opt-${field}-${input.value}`);
  if (target) {
    target.classList.add('option-selected');
    target.style.borderColor = '#2563EB';
    target.style.backgroundColor = '#EFF6FF';
  }

  // Show credits input for education step
  if (field === 'education') {
    const creditsInput = document.getElementById('creditsInput');
    if (creditsInput) {
      if (['college2', 'college3', 'university', 'university_dropout'].includes(input.value)) {
        creditsInput.classList.remove('hidden');
      } else {
        creditsInput.classList.add('hidden');
      }
    }
  }
}

// Certificate toggle
const selectedCerts = new Set();
function toggleCert(certId) {
  const card = document.getElementById(`cert-${certId}`);
  const check = document.getElementById(`cert-check-${certId}`);

  if (selectedCerts.has(certId)) {
    selectedCerts.delete(certId);
    if (card) { card.style.borderColor = ''; card.style.backgroundColor = ''; }
    if (check) { check.style.backgroundColor = ''; check.style.borderColor = ''; check.innerHTML = ''; }
  } else {
    selectedCerts.add(certId);
    if (card) { card.style.borderColor = '#2563EB'; card.style.backgroundColor = '#EFF6FF'; }
    if (check) {
      check.style.backgroundColor = '#2563EB';
      check.style.borderColor = '#2563EB';
      check.innerHTML = '<i class="fas fa-check text-white text-xs"></i>';
    }
  }

  simulatorData.certificates = Array.from(selectedCerts);
  updateCertStats();
}

const certCreditMap = {
  'information_processing': 20, 'computer_specialist': 12, 'social_worker1': 20,
  'bookkeeping': 18, 'word_processor': 14, 'beauty': 20, 'cosmetology': 20,
  'cook': 16, 'nurse_assistant': 14, 'sports_instructor': 20, 'fire_safety': 18,
  'electrical_engineer': 20, 'civil_service': 6, 'mechanic': 18,
};

function updateCertStats() {
  const count = document.getElementById('selectedCertCount');
  const credits = document.getElementById('selectedCertCredits');
  if (count) count.textContent = selectedCerts.size;
  if (credits) {
    let total = 0;
    selectedCerts.forEach(c => total += (certCreditMap[c] || 0));
    credits.textContent = total;
  }
}

function toggleOption(field) {
  simulatorData[field] = !simulatorData[field];
  const toggle = document.getElementById(`toggle-${field}`);
  if (toggle) toggle.classList.toggle('active', simulatorData[field]);
  const card = document.getElementById(field === 'hasDoksak' ? 'doksakToggle' : 'kmoocToggle');
  if (card) {
    if (simulatorData[field]) {
      card.style.borderColor = '#2563EB';
      card.style.backgroundColor = '#EFF6FF';
    } else {
      card.style.borderColor = '';
      card.style.backgroundColor = '';
    }
  }
}

function nextStep() {
  // Validation
  if (currentStep === 1 && !simulatorData.education) {
    showToast('최종 학력을 선택해주세요.', 'error'); return;
  }
  if (currentStep === 2 && !simulatorData.degreeType) {
    showToast('목표 학위를 선택해주세요.', 'error'); return;
  }
  if (currentStep === 2 && !simulatorData.period) {
    showToast('희망 기간을 선택해주세요.', 'error'); return;
  }

  if (currentStep === 2) {
    simulatorData.major = document.getElementById('major')?.value || '';
  }
  if (currentStep === 1) {
    simulatorData.currentCredits = parseInt(document.getElementById('currentCredits')?.value || '0') || 0;
  }

  if (currentStep < totalSteps) {
    document.getElementById(`step${currentStep}`)?.classList.add('hidden');
    currentStep++;
    document.getElementById(`step${currentStep}`)?.classList.remove('hidden');
    updateStepUI();

    if (currentStep === totalSteps) {
      runSimulation();
    }
  }
}

function prevStep() {
  if (currentStep > 1) {
    document.getElementById(`step${currentStep}`)?.classList.add('hidden');
    currentStep--;
    document.getElementById(`step${currentStep}`)?.classList.remove('hidden');
    updateStepUI();
  }
}

function updateStepUI() {
  const progress = (currentStep / totalSteps) * 100;
  const bar = document.getElementById('progressBar');
  if (bar) bar.style.width = progress + '%';

  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  if (prevBtn) prevBtn.classList.toggle('hidden', currentStep === 1);
  if (nextBtn) {
    nextBtn.innerHTML = currentStep === totalSteps
      ? '<i class="fas fa-redo mr-2"></i>다시 설계하기'
      : `다음 <i class="fas fa-arrow-right ml-2"></i>`;
    if (currentStep === totalSteps) {
      nextBtn.onclick = resetSimulator;
    }
  }

  // Update step indicators
  for (let i = 1; i <= totalSteps; i++) {
    const circle = document.getElementById(`step-circle-${i}`);
    const ind = document.getElementById(`step-ind-${i}`);
    if (circle) {
      circle.classList.remove('active', 'completed');
      if (i < currentStep) {
        circle.classList.add('completed');
        circle.innerHTML = '<i class="fas fa-check text-xs"></i>';
      } else if (i === currentStep) {
        circle.classList.add('active');
        circle.textContent = i;
      } else {
        circle.textContent = i;
      }
    }
    if (ind) {
      ind.style.color = i <= currentStep ? '#2563EB' : '#9CA3AF';
    }
  }
}

async function runSimulation() {
  const resultEl = document.getElementById('simulatorResult');
  if (!resultEl) return;

  resultEl.innerHTML = `
    <div class="text-center py-12">
      <div class="animate-spin text-5xl text-blue-500 mb-4">⚙️</div>
      <p class="text-gray-600">학습 경로를 분석하는 중...</p>
    </div>`;

  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(simulatorData),
    });
    const data = await res.json();
    displaySimulatorResult(data);
  } catch (err) {
    const data = clientCalculate(
      simulatorData.degreeType || 'bachelor',
      simulatorData.education || 'high',
      simulatorData.currentCredits,
      parseInt(simulatorData.period) || 24
    );
    displaySimulatorResult(data);
  }
}

function displaySimulatorResult(data) {
  const el = document.getElementById('simulatorResult');
  if (!el) return;

  const fmt = (n) => n.toLocaleString('ko-KR') + '원';
  const isPossible = data.possibleInPeriod;

  const degreeNames = {
    bachelor: '학사학위 (140학점)',
    associate2: '전문학사 2년제 (80학점)',
    associate3: '전문학사 3년제 (120학점)',
  };

  el.innerHTML = `
    <!-- Status Banner -->
    <div class="p-5 ${isPossible ? 'bg-green-500' : 'bg-orange-500'} text-white rounded-xl mb-6 flex items-center space-x-4">
      <i class="fas ${isPossible ? 'fa-check-circle' : 'fa-clock'} text-3xl"></i>
      <div>
        <p class="font-bold text-lg">${data.message}</p>
        <p class="text-white/80 text-sm mt-0.5">
          ${degreeNames[simulatorData.degreeType] || '학사학위'} 취득까지의 맞춤 로드맵
        </p>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      ${[
        { label: '총 필요학점', val: data.required?.total || 140, unit: '학점', color: 'blue' },
        { label: '현재 보유학점', val: data.heldCredits, unit: '학점', color: 'green' },
        { label: '부족 학점', val: data.shortfall, unit: '학점', color: 'red' },
        { label: '예상 소요기간', val: data.yearsNeeded, unit: '년', color: 'purple' },
      ].map(s => `
        <div class="bg-${s.color}-50 border border-${s.color}-200 rounded-xl p-4 text-center">
          <div class="text-2xl font-bold text-${s.color}-600">${s.val}</div>
          <div class="text-xs text-gray-500 mt-1">${s.label}</div>
        </div>
      `).join('')}
    </div>

    <!-- Credit Breakdown -->
    <div class="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <h3 class="font-bold text-gray-900 mb-4">학점 구성 분석</h3>
      <div class="space-y-3">
        ${[
          { label: '전적대 인정학점', val: data.transferCredits, total: data.required?.total || 140, color: 'blue' },
          { label: '자격증 인정학점', val: data.certCredits, total: data.required?.total || 140, color: 'yellow' },
          { label: '독학사 예정학점', val: data.doksakCredits, total: data.required?.total || 140, color: 'green' },
          { label: '교육원 이수 필요', val: data.shortfall, total: data.required?.total || 140, color: 'red' },
        ].map(item => `
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="text-gray-600">${item.label}</span>
              <span class="font-bold text-gray-900">${item.val}학점</span>
            </div>
            <div class="bg-gray-100 rounded-full h-2">
              <div class="bg-${item.color}-500 h-2 rounded-full" style="width: ${Math.min(100, (item.val / item.total) * 100)}%"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Semester Plan -->
    <div class="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <h3 class="font-bold text-gray-900 mb-4">
        <i class="fas fa-calendar text-primary mr-2"></i>학기별 이수 계획 (권장)
      </h3>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50">
              <th class="p-2 text-left text-gray-600 font-medium">학기</th>
              <th class="p-2 text-center text-gray-600 font-medium">이수 학점</th>
              <th class="p-2 text-center text-gray-600 font-medium">과목 수</th>
              <th class="p-2 text-center text-gray-600 font-medium">예상 비용</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${Array(Math.min(data.semestersNeeded, 6)).fill(0).map((_, i) => {
              const remaining = data.shortfall - (i * data.creditsPerSemester);
              const thisCredits = Math.min(data.creditsPerSemester, Math.max(0, remaining));
              const subjects = Math.ceil(thisCredits / 3);
              return `
                <tr>
                  <td class="p-2 font-medium text-gray-900">${Math.floor(i/2)+1}학년 ${i%2===0 ? '1' : '2'}학기</td>
                  <td class="p-2 text-center">${thisCredits}학점</td>
                  <td class="p-2 text-center">${subjects}과목</td>
                  <td class="p-2 text-center text-blue-600 font-medium">${(subjects * 120000).toLocaleString('ko-KR')}원</td>
                </tr>
              `;
            }).join('')}
            ${data.semestersNeeded > 6 ? `
              <tr class="bg-gray-50">
                <td colspan="4" class="p-2 text-center text-sm text-gray-500">... ${data.semestersNeeded}학기 이상 계속</td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Cost Summary -->
    <div class="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
      <h3 class="font-bold text-gray-900 mb-3">💰 총 비용 예상 (온라인 교육원 기준)</h3>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-600">수강료 (${data.subjectsNeeded}과목 × 120,000원)</span>
          <span class="font-bold">${fmt(data.subjectsNeeded * 120000)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">학습자 등록비</span>
          <span>4,000원</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">학점인정 신청비</span>
          <span>${(data.shortfall * 1000).toLocaleString('ko-KR')}원</span>
        </div>
        <div class="border-t border-blue-200 pt-2 flex justify-between text-lg">
          <span class="font-bold text-gray-900">총 예상 비용</span>
          <span class="font-bold text-blue-600">${fmt(data.estimatedCost + 4000 + data.shortfall * 1000)}</span>
        </div>
      </div>
    </div>

    <!-- Next Steps -->
    <div class="bg-green-50 border border-green-200 rounded-xl p-5">
      <h3 class="font-bold text-gray-900 mb-3">
        <i class="fas fa-shoe-prints text-green-600 mr-2"></i>다음 단계
      </h3>
      <ol class="space-y-2 text-sm text-gray-700">
        <li class="flex items-start space-x-2">
          <span class="bg-green-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
          <span>국가평생교육진흥원에서 <a href="https://www.cb.or.kr" target="_blank" class="text-blue-600 hover:underline">학습자 등록</a> (4,000원)</span>
        </li>
        <li class="flex items-start space-x-2">
          <span class="bg-green-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
          <span>교육원 수강 신청 (전공필수 과목 우선 이수)</span>
        </li>
        <li class="flex items-start space-x-2">
          <span class="bg-green-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
          <span>학점인정 신청 (학기별 수강 완료 후)</span>
        </li>
        <li class="flex items-start space-x-2">
          <span class="bg-green-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
          <span>학위 요건 충족 후 학위 신청 (매년 12월)</span>
        </li>
      </ol>
    </div>
    
    <div class="flex flex-wrap gap-3 mt-6">
      <a href="/calculator" class="btn-primary text-sm">
        <i class="fas fa-calculator mr-1"></i>비용 상세 계산
      </a>
      <a href="/majors" class="btn-secondary text-sm">
        <i class="fas fa-book mr-1"></i>전공 가이드 보기
      </a>
    </div>
  `;
}

function resetSimulator() {
  currentStep = 1;
  simulatorData.education = null;
  simulatorData.currentCredits = 0;
  simulatorData.degreeType = null;
  simulatorData.major = '';
  simulatorData.period = null;
  simulatorData.certificates = [];
  simulatorData.hasDoksak = false;
  selectedCerts.clear();

  for (let i = 1; i <= totalSteps; i++) {
    const step = document.getElementById(`step${i}`);
    if (step) step.classList.toggle('hidden', i !== 1);
  }
  updateStepUI();
  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) {
    nextBtn.innerHTML = '다음 <i class="fas fa-arrow-right ml-2"></i>';
    nextBtn.onclick = nextStep;
  }
}

// ─── Cost Calculator ────────────────────────────────────
function updateCostCalc() {
  const slider = document.getElementById('creditsSlider');
  const display = document.getElementById('creditsDisplay');
  if (!slider) return;

  const credits = parseInt(slider.value) || 0;
  if (display) display.textContent = credits;

  const instType = document.querySelector('input[name="instType"]:checked')?.value || 'online';

  const prices = { online: 120000, offline: 170000, university: 250000, doksak: 20000 };
  const price = prices[instType] || 120000;
  const subjects = Math.ceil(credits / 3);
  const tuition = subjects * price;
  const regFee = 4000;
  const creditFee = credits * 1000;
  const grand = tuition + regFee + creditFee;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('subjectCount', subjects);
  set('pricePerSubject', price.toLocaleString('ko-KR'));
  set('tuitionTotal', tuition.toLocaleString('ko-KR') + '원');
  set('creditFeeCredits', credits);
  set('creditFee', creditFee.toLocaleString('ko-KR') + '원');
  set('grandTotal', grand.toLocaleString('ko-KR') + '원');

  // Update institution type UI
  ['online', 'offline', 'university', 'doksak'].forEach(type => {
    const card = document.getElementById(`inst-${type}`);
    if (card) {
      if (type === instType) {
        card.style.borderColor = '#2563EB';
        card.style.backgroundColor = '#EFF6FF';
      } else {
        card.style.borderColor = '';
        card.style.backgroundColor = '';
      }
    }
  });
}

// ─── Certificate Search & Filter ───────────────────────
function filterCerts() {
  const query = document.getElementById('certSearch')?.value.toLowerCase() || '';
  const filter = document.getElementById('certFilter')?.value || '';

  document.querySelectorAll('.cert-category').forEach(cat => {
    const catName = cat.getAttribute('data-category') || '';
    let catVisible = false;

    cat.querySelectorAll('.cert-item').forEach(item => {
      const name = item.getAttribute('data-name')?.toLowerCase() || '';
      const major = item.getAttribute('data-major')?.toLowerCase() || '';
      const category = item.getAttribute('data-category') || '';

      const matchesQuery = !query || name.includes(query) || major.includes(query);
      const matchesFilter = !filter || category === filter;

      if (matchesQuery && matchesFilter) {
        item.style.display = '';
        catVisible = true;
      } else {
        item.style.display = 'none';
      }
    });

    cat.style.display = catVisible ? '' : 'none';
  });
}

// ─── FAQ Toggle ─────────────────────────────────────────
function toggleFAQ(btn) {
  const answer = btn.nextElementSibling;
  const icon = btn.querySelector('.fa-chevron-down');

  if (answer?.classList.contains('hidden')) {
    answer.classList.remove('hidden');
    if (icon) icon.style.transform = 'rotate(180deg)';
  } else {
    answer?.classList.add('hidden');
    if (icon) icon.style.transform = '';
  }
}

function filterFAQ() {
  const query = document.getElementById('faqSearch')?.value.toLowerCase() || '';

  document.querySelectorAll('.faq-category').forEach(cat => {
    let catVisible = false;

    cat.querySelectorAll('.faq-item').forEach(item => {
      const q = item.getAttribute('data-q')?.toLowerCase() || '';
      const matches = !query || q.includes(query);
      item.style.display = matches ? '' : 'none';
      if (matches) catVisible = true;
    });

    cat.style.display = catVisible ? '' : 'none';
  });
}

// ─── Toast Notification ─────────────────────────────────
function showToast(msg, type = 'info') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const colors = {
    error: 'bg-red-500',
    success: 'bg-green-500',
    info: 'bg-blue-500',
  };

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = `fixed top-20 left-1/2 -translate-x-1/2 z-50 ${colors[type] || colors.info} text-white px-6 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center space-x-2`;
  toast.innerHTML = `
    <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i>
    <span>${msg}</span>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ─── Init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Initialize step UI if on simulator page
  if (document.getElementById('step1')) {
    updateStepUI();
  }

  // Initialize cost calculator
  if (document.getElementById('creditsSlider')) {
    // Set first institution type as selected
    const firstInst = document.querySelector('input[name="instType"]');
    if (firstInst) firstInst.checked = true;
    updateCostCalc();

    // Listen for institution type changes
    document.querySelectorAll('input[name="instType"]').forEach(radio => {
      radio.addEventListener('change', updateCostCalc);
    });
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Close mobile menu on outside click
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('mobileMenu');
    const btn = e.target.closest('button[onclick="toggleMobileMenu()"]');
    if (menu && !btn && !menu.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });
});
