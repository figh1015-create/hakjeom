const homeFieldMap={
  business:{image:'/static/images/field-business.jpg',tag:'학위 · 편입 · 진학'},
  care:{image:'/static/images/field-care.jpg',tag:'자격 · 실습 · 현장'},
  psychology:{image:'/static/images/field-psychology.jpg',tag:'상담 · 진학 · 전문성'},
  technology:{image:'/static/images/field-technology.jpg',tag:'학위 · 자격 · 커리어'},
  practical:{image:'/static/images/field-practical.jpg',tag:'현장경력 · 학위 · 면허'}
};

const homeCourseGroups={
  business:'business',theology:'business','english-literature':'business',korean:'business','library-science':'business','liberal-arts':'business','private-certificates':'business',
  'social-welfare':'care','social-worker':'care',childhood:'care',childcare:'care',youth:'care','healthy-family':'care',practicum:'care',
  psychology:'psychology',counseling:'psychology',
  'computer-science':'technology','information-processing':'technology','electrical-engineering':'technology','electronic-engineering':'technology','fire-safety':'technology','police-administration':'technology',
  'physical-education':'practical',beauty:'practical','beauty-license':'practical'
};

const heroWrap=document.querySelector('.hero .wrap');
if(heroWrap){
  const copy=document.createElement('div');
  copy.className='hero-copy';
  const movable=[...heroWrap.children].filter(child=>!child.classList.contains('quick'));
  movable.forEach(child=>copy.appendChild(child));
  heroWrap.prepend(copy);
  copy.insertAdjacentHTML('afterend',`
    <figure class="hero-visual">
      <img src="/static/images/hero-guidance.jpg" alt="전담 담당자와 학습계획을 확인하는 성인 학습자" width="1200" height="800">
      <figcaption><span>전담 학습관리</span><strong>혼자 고민하는 시간을 줄이고<br>해야 할 일에 집중하세요</strong></figcaption>
    </figure>`);
}

document.querySelectorAll('a.card[href^="/course/"]').forEach(card=>{
  const slug=(card.getAttribute('href')||'').split('/').pop().replace('.html','');
  const field=homeFieldMap[homeCourseGroups[slug]||'business'];
  const title=card.querySelector('h3')?.textContent||'학점은행제 과정';
  card.classList.add('course-card');
  card.insertAdjacentHTML('afterbegin',`<div class="course-card-media"><img src="${field.image}" alt="${title} 분야 이미지" width="900" height="600" loading="lazy"><span>${field.tag}</span></div>`);
});

const degreeSection=document.querySelector('#degree');
if(degreeSection){
  degreeSection.insertAdjacentHTML('beforebegin',`
    <section class="section reason-section" aria-labelledby="reason-title">
      <div class="wrap">
        <div class="reason-heading">
          <div><span class="kicker">학점설계소를 선택해야 하는 이유</span><h2 id="reason-title">좋은 과정도 관리가 없으면<br>끝까지 가기 어렵습니다</h2></div>
          <p>학점은행제는 과목을 고르는 것보다 내 학력과 목표에 맞게 순서를 정하고, 학기마다 빠짐없이 완료하는 일이 더 중요합니다. 그래서 상담부터 마지막 행정신청까지 한 흐름으로 관리합니다.</p>
        </div>
        <div class="reason-grid">
          <article class="reason-card featured">
            <img src="/static/images/field-care.jpg" alt="학습자와 함께 일정을 점검하는 교육 담당자" width="1200" height="800" loading="lazy">
            <div><span>01</span><h3>담당자가 바뀌지 않는 1:1 관리</h3><p>매번 처음부터 설명하지 않도록 내 목표와 진행상황을 아는 전담 담당자가 계속 함께합니다.</p></div>
          </article>
          <article class="reason-card"><div><span>02</span><h3>지금 가능한 과정으로 설계</h3><p>이론상 가능한 과목이 아니라 실제 개설 일정과 실습·대면 조건을 반영해 시작할 수 있는 계획을 만듭니다.</p></div></article>
          <article class="reason-card"><div><span>03</span><h3>중간에 막힐 때 바로 해결</h3><p>출석, 과제, 시험, 행정신청에서 문제가 생기면 평일·주말 구분 없이 확인해 다음 행동을 알려드립니다.</p></div></article>
        </div>
      </div>
    </section>`);
}
