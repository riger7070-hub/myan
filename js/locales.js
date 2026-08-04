// M;Y 安 — locales.js  (TX 다국어·DK 처방카드·MAX_HIST·trimmedHist)
/* 번역 */
const TX = {
  ko:{
    tagline:'마음의 영양을 처방합니다',
    ilchin: il=>`오늘의 일진 · ${CG_K[il.ci]}${JJ_K[il.ji]}(${CG[il.ci]}${JJ[il.ji]})일 · ${ON.ko[il.o]}`,
    back:'처음으로',
    eyebrow:'오늘의 기운',
    headline:'어떤 리딩을\n받으시겠습니까',
    desc:'내 사주와 오늘 일진이 만나는 방식을 풀이해 드립니다.\n일진은 매일 바뀌므로 처방도 매일 달라집니다.',
    s1:'나만의 리딩',
    d1:'내 사주와 오늘 일진의 흐름을 분석해\n오늘 나에게 꼭 맞는 처방을 받습니다.',
    s2:'우리의 조화',
    d2:'두 사람의 오행과 오늘 일진을 함께 풀이해\n관계의 흐름과 처방을 함께 받습니다.',
    note:'※ 본 서비스는 명리학 이론 기반 문화 체험 콘텐츠입니다.\n의학·법적 조언을 대체하지 않으며 모든 풀이는 참고용입니다.',
    ph:'메시지를 입력하세요…',
    rxlbl: o=>`오늘의 처방 · ${ON.ko[o]}`,
    kiLabel:'오늘의 강한 기운',
    actLabel:'오늘 하면 좋은 것',
    revisit:'✦ 일진은 매일 바뀝니다. 내일 오시면 오늘과 다른 처방을 받으실 수 있습니다.',
    err:'잠시 기운이 엇갈렸습니다(시스템 오류). 토큰은 차감되지 않았으니 잠시 후 다시 시도해 주세요.',
    noLogin:'로그인이 필요합니다. 다시 로그인해 주세요.',
    errSafety:'질문이 기운 리딩의 범위를 벗어나 답변이 생성되지 않았습니다. 사주·오행·에너지 흐름에 관한 질문을 해주세요. (사용된 토큰은 차감되지 않고 안전하게 복구되었습니다.)',
    g1: il=>`오늘의 기운을 함께 살펴볼게요. ✨\n오늘은 ${CG_K[il.ci]}${JJ_K[il.ji]}(${CG[il.ci]}${JJ[il.ji]})일이에요 — ${ON.ko[il.o]}의 기운이 은은하게 흐르고 있는 날이네요.\n\n성함과 생년월일을 알려주시면, 이 기운이 오늘 나에게 어떻게 닿는지 풀어드릴게요. 태어난 시간도 알고 계시다면 함께 적어주세요.`,
    g2: il=>`두 분의 이야기를 함께 살펴볼게요. 🌿\n오늘은 ${CG_K[il.ci]}${JJ_K[il.ji]}(${CG[il.ci]}${JJ[il.ji]})일이에요 — ${ON.ko[il.o]}의 기운이 온화하게 머물고 있어요.\n\n두 분의 성함과 생년월일을 각각 알려주시면, 서로의 오행이 오늘 일진과 어떻게 어우러지는지 풀어드릴게요.`,
    sys:'반드시 한국어로 답변해 주세요.',
    sgTitle:'회원가입',
    sgHeadline:'회원가입하고\n더 섬세한 기운을\n받으세요.',
    sgSub:'한 번 등록하시면 매일 오실 때마다 더 정확하고 섬세한 기운 풀이를 받으실 수 있습니다.',
    sgLink:'✦ 회원가입하고 더 섬세한 기운 받기 →',
    guestName:'체험해보기',
    guestDesc:'로그인 없이 1회 무료 체험',
    guestTitle:'M;Y 安 체험하기',
    guestSubtitle:'생년월일을 입력하시면 오늘의 기운을 간단히 확인해 드립니다.',
    guestBirthPlaceholder:'예: 1990-01-01',
    guestSubmitBtn:'AI 풀이 받기',
    guestLimitTitle:'오늘의 체험 완료',
    guestLimitMsg:'게스트 체험은 하루 1회만 가능합니다.',
    guestLimitReset:'다음 체험까지:',
    guestResultTitle:'체험 결과',
    guestLoading:'AI가 분석 중입니다...',
    sgName:'이름', sgEmail:'이메일', sgPhone:'전화번호', sgYear:'생년', sgMonth:'생월', sgDay:'생일',
    sgHour:'생시', sgGender:'성별', sgM:'남성', sgF:'여성', sgOpt:'(선택)', sgRegion:'거주지역',
    sgSubmit:'가입하기',
    sgNotice:'수집된 정보는 기운 풀이 개선 및 맞춤 처방 목적으로만 사용되며 제3자에게 제공되지 않습니다.',
    sgSuccTitle:'가입이 완료되었습니다', sgSuccDesc:'소중한 기운이 기록되었습니다.\n내일 오시면 더욱 섬세한 처방을 받으실 수 있습니다.',
    sgBack:'처음으로 →', sgErr:'저장 중 오류가 발생했습니다. 다시 시도해 주세요.', sgUnknown:'모름', sgOr:'또는 직접 입력',
    sgPfHeadline:'환영합니다! 🎉', sgPfSub:'정확한 사주 풀이를 위해 생년월일을 입력해 주세요.',
    sgPfSave:'저장하기', sgPfSkip:'나중에 입력할게요', sgPfErrBirth:'생년월일을 올바르게 입력해 주세요.',
    g1_auto: (il, u) => `${u.name}님, 다시 오셨네요. ☀️\n오늘은 ${CG_K[il.ci]}${JJ_K[il.ji]}(${CG[il.ci]}${JJ[il.ji]})일이에요 — ${ON.ko[il.o]}의 기운이 흐르고 있어요.\n\n사주 정보가 준비되어 있으니 오늘 기운 흐름이나 궁금한 게 있으시면 편하게 말씀해 주세요.`,
    mpLink:'마이페이지', mpTitle:'마이페이지', mpSection:'생년월일 수정',
    mpDetailSection:'상세 정보 입력',
    mpDetailNotice:'아래 정보를 추가하면 더욱 정밀한 사주 풀이를 받으실 수 있습니다. 모두 선택 사항입니다.',
    mpSave:'저장하기', mpSaved:'저장되었습니다 ✦',
    mpLogout:'로그아웃', mpWithdraw:'회원 탈퇴',
    mpLogoutQ:'다시 누르면 로그아웃됩니다', mpWithdrawQ:'다시 누르면 탈퇴됩니다',
    shareBtn:'공유', shareCopied:'클립보드에 복사됨!',
    shareTitle:'M;Y 安 오늘의 운세', shareMsg:'오늘({d})의 오행 기운은 {o}입니다! M;Y 安에서 확인하세요.',
    previewLabel:'오늘의 운세', previewCta:'채팅으로 물어보기 →', previewSub:'지금 확인하기',
    notifOn:'알림 켜기', notifOff:'알림 해제됨', notifOff2:'알림 끄기', savingImage:'이미지 저장 중...', imageSaved:'이미지가 저장되었습니다! 📸', notifEnabled:'알림이 설정되었습니다! 🌟', notifDenied:'알림 권한이 필요합니다.',
    detailTitle:'상세 풀이', detailSub:'AI 심층 분석', detailLoading:'AI가 상세 분석 중... (약 10초)',
    oracleEnter:'어서 오십시오, 손님.\n먼 길 오시느라 수고 많으셨습니다.', oracleFlip:'만세력을 넘깁니다…', oraclePillars:'사주 네 기둥을 세웁니다…', oracleExit:'기운이 도착했습니다.',
    detailCardTitle:{health:'건강운',wealth:'재물운',love:'연애운',career:'직장·사업운'},
    tokenUnit:'잔여 토큰',
    streakTitle:'출석 스트릭', streakCurrent:'현재', streakMax:'최고', streakTotal:'총 출석',
    streakCheckin:'오늘 출석 체크', streakDone:'오늘 출석 완료 ✓', streakBonus:'🎉 7일 보너스! +5 토큰', streakDay:'일',
    heatmapTitle:'90일 오행 기록',
    luckyTitle:'오늘의 행운', luckyColor:'행운색', luckyNumber:'행운숫자', luckyDir:'행운방향', luckyStone:'행운석',
    feedbackLabel:'이 운세가 맞았나요?', feedbackYes:'맞아요', feedbackNo:'달라요',
    referralTitle:'친구 초대', referralGenerate:'내 초대 코드 생성', referralCopy:'복사',
    referralDesc:'친구가 코드를 입력하면 양쪽 모두 +3 토큰!',
    referralInputPlaceholder:'초대 코드 입력', referralClaimBtn:'적용',
    referralUsed:'초대 성공: {n}명', referralClaimed:'🎉 코드 적용! +{n} 토큰',
    profileShareText:'M;Y 安에서 {s}일 연속 운세 확인 중! (총 {t}회) myan.riger7070.workers.dev',
    ohiLabel:'오늘의 기운', ohiActive:'오늘의 기운',
    shareCancel:'취소', shareCopyBtn:'링크 복사',
    instaToast:'텍스트 복사 완료! Instagram 앱에서 붙여넣기 하세요 📸',
    wdSessionExpired:'세션이 만료됐습니다. 다시 로그인 후 탈퇴해 주세요.',
    tkSection:'잔여 토큰', tkUnit:'TOKENS',
    noToken:'토큰이 부족합니다.\n마이페이지에서 충전 후 이용해 주세요.',
    tkPkgS:'소', tkPkgM:'중', tkPkgL:'대', tkSub:'구독형', tkUnlimited:'무제한',
    tkPayBtn:'Toss로 결제하기',
    tkAfterPay:'결제 완료 후 운영자에게 받은 바우처 코드를 아래에 입력해 주세요.',
    tkVoucher:'바우처 코드', tkVoucherPh:'코드를 입력하세요', tkRedeem:'적용',
    tkRedeemOk: n=>`✦ ${n} 토큰이 충전되었습니다!`,
    tkRedeemFail:'유효하지 않거나 이미 사용된 코드입니다.',
    loginTitle:'다시 찾아주셨네요.\n어서 오세요.',
    loginId:'아이디', loginPw:'비밀번호', loginBtn:'로그인',
    sgUsername:'아이디', sgPassword:'비밀번호', sgConfirmPw:'비밀번호 확인',
    pwMismatch:'비밀번호가 일치하지 않습니다.', pwTooShort:'비밀번호는 6자 이상이어야 합니다.',
    loginFail:'아이디 또는 비밀번호가 올바르지 않습니다.',
    mpSupport:'✉ 1:1 고객센터',
    quickFortuneTitle:'오늘의 행운', quickFortuneDesc:'포춘쿠키 메시지 보기',
    quickTokenTitle:'토큰 충전', quickTokenDesc:'대화권 충전하기',
    quickSupportTitle:'1대1 상담', quickSupportDesc:'카카오로 바로 상담',
    tmNote:'정상적으로 리딩 답변이 완료될 때만 1토큰이 차감됩니다.\n신규 가입 시 3토큰이 무료 지급됩니다.',
    guideSkip:'오늘 하루 보지 않기',
    guideTitle:'M;Y 安 이용 안내',
    guideItems:[
      '✦  M;Y 安은 사주 오행(五行) 이론에 기반한 AI 기운 해석 서비스입니다.',
      '✦  리딩 답변이 정상적으로 완료될 때만 토큰 1개가 사용됩니다. 시스템 오류나 가이드라인 차단으로 답변을 받지 못하신 경우 토큰은 차감되지 않고 안전하게 보존됩니다.',
      '✦  토큰이 소진되면 마이페이지에서 충전할 수 있습니다.',
      '✦  본 서비스는 의료·법률·금융 상담을 대체하지 않습니다.',
      '✦  일진은 매일 자정에 갱신되어 새로운 기운 처방이 제공됩니다.',
    ],
    guideBtn:'확인, 시작합니다',
    // 드로어 메뉴 다국어
    drNav:'바로가기', drLangLabel:'언어', drThemeLabel:'화면', drAccountLabel:'계정',
    drHome:'처음으로', drHomeSub:'메인 화면으로 돌아가기',
    drSoloTitle:'나만의 리딩', drSoloSub:'오늘 나의 오행 기운 풀이',
    drCoupleTitle:'우리의 조화', drCoupleSub:'두 사람의 오행 궁합 풀이',
    drMypageTitle:'마이페이지', drMypageSub:'토큰 · 생년월일 · 설정',
    drCalTitle:'나의 기운 캘린더', drCalSub:'리딩 기록 · 오행 색 달력',
    drTarotTitle:'오늘의 타로', drTarotSub:'재미로 보는 카드 한 장 (토큰 1)',
    tarotTitle:'오늘의 타로', tarotShuffling:'카드를 섞는 중...', tarotReversed:'역방향', tarotPickCard:'마음에 드는 카드를 한 장 골라보세요',
    drZodiacTitle:'띠·별자리 운세', drZodiacSub:'오늘의 띠·별자리 운세 (토큰 1)',
    zodiacTitle:'띠·별자리 운세', zodiacLoading:'운세를 계산하는 중...', zodiacNeedBirth:'먼저 마이페이지에서 생년월일을 등록해 주세요.',
    drLuckyTitle:'오늘의 럭키 아이템', drLuckySub:'럭키 컬러·음식·노래 추천 (토큰 1)',
    luckyTitle:'오늘의 럭키 아이템', luckyLoading:'오늘의 행운을 찾는 중...', luckyColor:'럭키 컬러', luckyFood:'럭키 음식', luckySong:'럭키 무드',
    drTypeTitle:'오행 유형·궁합 테스트', drTypeSub:'나의 유형 찾고 궁합 보기 (토큰 1)',
    typeTitle:'오행 유형 테스트', typeProgress:'{n} / {total}', typeResultTitle:'당신의 유형은',
    typePickPartner:'궁합 볼 상대의 유형을 골라주세요', typeCompatLoading:'궁합을 분석하는 중...', typeRetake:'다시 하기',
    typeQ: [
      { q:'이상적인 주말은?', opts:['새로운 거 배우기','친구들과 파티','집에서 뒹굴뒹굴','밀린 정리정돈','혼자 산책'] },
      { q:'스트레스 풀 땐?', opts:['몸 움직이기','수다 떨기','맛있는 거 먹기','원인 분석하기','조용히 생각정리'] },
      { q:'무리에서 나는?', opts:['아이디어 뱅크','분위기 메이커','다 챙기는 맏이','계획 담당','조용한 리스너'] },
      { q:'일하는 스타일은?', opts:['일단 저지르기','열정적으로 몰입','꾸준하고 성실히','완벽하게 마무리','유연하게 맞추기'] },
      { q:'나를 색으로 표현하면?', opts:['초록','빨강','노랑','하양·은색','파랑·검정'] },
    ],
    typeDesc: {
      木:'성장과 도전을 좋아하는 리더형이에요. 늘 새로운 걸 시도하고 앞장서는 타입!',
      火:'열정 넘치고 표현력이 풍부한 분위기메이커예요. 있는 곳마다 활기가 넘쳐요!',
      土:'든든하고 다정한 살림꾼 타입이에요. 주변을 편안하게 챙기는 사람!',
      金:'원칙적이고 완벽을 추구하는 계획형이에요. 맡은 일은 확실하게 끝내는 타입!',
      水:'차분하고 유연한 지혜형이에요. 상황을 조용히 관찰하고 현명하게 대처해요!',
    },
    drThemeTitle:'테마', drDark:'🌙 다크', drLight:'☀️ 라이트',
    drSupportTitle:'1:1 카카오 상담', drLogoutTitle:'로그아웃',
    // 첫 입력 폼
    fifLblName:'성함', fifLblYear:'태어난 해', fifLblMonth:'월', fifLblDay:'일',
    fifLblTime:'태어난 시간', fifTimeOpt:'(선택)', fifTimeUnknown:'모름 / 선택 안 함',
    fifOptNote:'시간을 모르시면 비워두셔도 됩니다',
    fifSubmitBtn:'기운 리딩 시작하기 ›',
    fifNamePh:'홍길동',
    // 추천 칩
    suggestChips:['오늘 재물운','이직해도 될까요?','오늘 피해야 할 것','지금 연애운','오늘 하루 총운'],
    suggestChipsDuo:['우리 궁합 어때요?','요즘 사이가 멀어진 것 같아요','언제 결혼하면 좋을까요?','싸움이 잦아요, 왜일까요?','서로 잘 맞는 부분이 있을까요?'],
    // 마이페이지 하단
    mpZeroNote:'토큰이 없습니다. 아래에서 충전하시면 리딩을 계속하실 수 있어요 ✦',
    mpBotCharge:'토큰 충전', mpBotChargeDesc:'잔여 토큰 충전하기',
    mpBotSupport:'1:1 카카오 상담', mpBotSupportDesc:'궁금한 점을 바로 물어보세요',
    // 멤버십 구독
    subSecTitle:'멤버십 구독 · 매월 토큰 자동 지급',
    subTokenLabel:'월 구독',
    subBasicName:'베이직', subPremName:'프리미엄',
    subBasicPrice:'월 9,900원', subPremPrice:'월 19,900원',
    subSubscribeBtn:'구독하기', subPremBest:'BEST',
    subPlanNames:{ basic:'베이직 멤버십', premium:'프리미엄 멤버십' },
    subTokensPerMonth:'매월 {n} 토큰', subNextBilling:'다음 결제일: {date}',
    subCancelBtn:'구독 해지',
    subCancelConfirm:'정말 구독을 해지하시겠어요? 다음 결제일부터 자동 결제가 중단됩니다.',
    subCanceledToast:'구독이 해지되었습니다.',
    subStartedMsg:'✦ 구독이 시작되었습니다! 매월 토큰이 자동 지급됩니다.',
    subFailMsg:'구독 처리에 실패했습니다.',

  },
  en:{
    tagline:'Prescribing nourishment for the soul',
    ilchin: il=>`Today · ${CG[il.ci]}${JJ[il.ji]} (${CG_P[il.ci]}-${JJ_P[il.ji]}) · ${ON.en[il.o]}`,
    back:'Back',
    eyebrow:"Today's Energy",
    headline:'Which reading\nwould you like?',
    desc:"We interpret your Four Pillars and today's Ilchin.\nThe Ilchin changes daily — so does your prescription.",
    s1:'My Reading',
    d1:'Analyze your Saju and today\'s Ilchin to\nreceive a prescription tailored just for today.',
    s2:'Our Harmony',
    d2:"Interpret two people's Ohaeng and today's\nIlchin to receive a shared prescription.",
    note:'※ This is a cultural experience based on Four Pillars theory.\nNot a substitute for medical or legal advice.',
    ph:'Type your message…',
    rxlbl: o=>`Today's Prescription · ${ON.en[o]}`,
    kiLabel:"Today's Energy",
    actLabel:'Good to do today',
    revisit:"✦ The Ilchin changes daily. Visit tomorrow for a different prescription.",
    err:'Energy crossed for a moment. Please try again.',
    noLogin:'Please sign in to continue.',
    errSafety:'This question falls outside the scope of energy reading. Please ask about Saju, Ohaeng, or energy flow.',
    g1: il=>`Welcome.\nToday is ${CG[il.ci]}${JJ[il.ji]} day — flowing with ${ON.en[il.o]} energy.\n\nPlease share your name and date of birth.\nI will read the flow of your Ohaeng and today's Ilchin.`,
    g2: il=>`Welcome.\nToday is ${CG[il.ci]}${JJ[il.ji]} day — flowing with ${ON.en[il.o]} energy.\n\nPlease share both names and dates of birth.\nI will read your Ohaeng harmony and today's Ilchin together.`,
    sys:'Please respond in English.',
    sgTitle:'Sign Up',
    sgHeadline:'Sign up and receive\na more refined\nenergy reading.',
    sgSub:'Register once to receive a more precise and personalised reading every day.',
    sgLink:'✦ Sign up for a more refined reading →',
    guestName:'Try Guest Mode',
    guestDesc:'One free reading without login',
    guestTitle:'Try M;Y 安',
    guestSubtitle:'Enter your birth date to receive today\'s energy reading.',
    guestBirthPlaceholder:'e.g., 1990-01-01',
    guestSubmitBtn:'Get AI Reading',
    guestLimitTitle:'Today\'s Trial Complete',
    guestLimitMsg:'Guest mode is limited to once per day.',
    guestLimitReset:'Next trial available in:',
    guestResultTitle:'Your Reading',
    guestLoading:'AI is analyzing...',
    sgName:'Name', sgEmail:'Email', sgPhone:'Phone', sgYear:'Birth Year', sgMonth:'Month', sgDay:'Day',
    sgHour:'Birth Hour', sgGender:'Gender', sgM:'Male', sgF:'Female', sgOpt:'(optional)', sgRegion:'Region',
    sgSubmit:'Sign Up',
    sgNotice:'Your information is used only to refine your readings and will not be shared with any third party.',
    sgSuccTitle:'Welcome', sgSuccDesc:'Your energy has been recorded.\nVisit tomorrow for a more refined prescription.',
    sgBack:'Back to Home →', sgErr:'An error occurred. Please try again.', sgUnknown:'Unknown', sgOr:'or fill in manually',
    sgPfHeadline:'Welcome! 🎉', sgPfSub:'Enter your date of birth for accurate saju readings.',
    sgPfSave:'Save', sgPfSkip:"I'll do it later", sgPfErrBirth:'Please enter a valid date of birth.',
    g1_auto: (il, u) => `Welcome back, ${u.name}.\nToday is ${CG[il.ci]}${JJ[il.ji]} day — flowing with ${ON.en[il.o]} energy.\n\nYour saved profile is ready.\nFeel free to ask about today's energy or anything on your mind.`,
    mpLink:'My Page', mpTitle:'My Page', mpSection:'Date of Birth',
    mpDetailSection:'Additional Details',
    mpDetailNotice:'Adding the details below allows for a more precise energy reading. All fields are optional.',
    mpSave:'Save Changes', mpSaved:'Saved ✦',
    mpLogout:'Log Out', mpWithdraw:'Delete Account',
    mpLogoutQ:'Tap again to log out', mpWithdrawQ:'Tap again to delete account',
    shareBtn:'Share', shareCopied:'Copied to clipboard!',
    shareTitle:"M;Y 安 Today's Fortune", shareMsg:"Today({d})'s energy is {o}! Check it on M;Y 安.",
    previewLabel:"Today's Fortune", previewCta:'Ask in chat →', previewSub:'Check now',
    notifOn:'Enable Notifications', notifOff:'Notifications off', notifOff2:'Turn Off', savingImage:'Saving image...', imageSaved:'Image saved! 📸', notifEnabled:'Notifications enabled! 🌟', notifDenied:'Notification permission required.',
    detailTitle:'Detailed Reading', detailSub:'AI Deep Analysis', detailLoading:'AI analyzing... (~10 sec)',
    oracleEnter:'Welcome, dear guest.\nYou must have had a long journey.', oracleFlip:'Turning the pages of the almanac…', oraclePillars:'Raising the Four Pillars…', oracleExit:'Your reading has arrived.',
    detailCardTitle:{health:'Health',wealth:'Wealth',love:'Love',career:'Career'},
    tokenUnit:'Remaining Tokens',
    streakTitle:'Attendance Streak', streakCurrent:'Current', streakMax:'Best', streakTotal:'Total',
    streakCheckin:'Check In Today', streakDone:'Checked In ✓', streakBonus:'🎉 7-day bonus! +5 tokens', streakDay:'days',
    heatmapTitle:'90-Day Energy Log',
    luckyTitle:"Today's Lucky", luckyColor:'Lucky Color', luckyNumber:'Lucky Number', luckyDir:'Lucky Direction', luckyStone:'Lucky Stone',
    feedbackLabel:'Was this accurate?', feedbackYes:'Yes!', feedbackNo:'Not quite',
    referralTitle:'Invite Friends', referralGenerate:'Generate My Code', referralCopy:'Copy',
    referralDesc:'Both you and your friend get +3 tokens when they use your code!',
    referralInputPlaceholder:'Enter invite code', referralClaimBtn:'Apply',
    referralUsed:'Successful invites: {n}', referralClaimed:'🎉 Code applied! +{n} tokens',
    profileShareText:'On a {s}-day streak on M;Y 安! ({t} total check-ins) myan.riger7070.workers.dev',
    ohiLabel:"Today's Energy", ohiActive:"Today's Energy",
    shareCancel:'Cancel', shareCopyBtn:'Copy Link',
    instaToast:'Text copied! Paste it in the Instagram app 📸',
    wdSessionExpired:'Your session has expired. Please log in again before deleting your account.',
    tkSection:'Remaining Tokens', tkUnit:'TOKENS',
    noToken:'Not enough tokens.\nPlease top up in My Page.',
    tkPkgS:'Small', tkPkgM:'Medium', tkPkgL:'Large', tkSub:'Subscription', tkUnlimited:'Unlimited',
    tkPayBtn:'Pay with Toss',
    tkAfterPay:'After payment, enter the voucher code you receive from the operator below.',
    tkVoucher:'Voucher Code', tkVoucherPh:'Enter your code', tkRedeem:'Apply',
    tkRedeemOk: n=>`✦ ${n} tokens added!`,
    tkRedeemFail:'Invalid or already used code.',
    loginTitle:'Welcome back.',
    loginId:'Username', loginPw:'Password', loginBtn:'Log In',
    sgUsername:'Username', sgPassword:'Password', sgConfirmPw:'Confirm Password',
    pwMismatch:'Passwords do not match.', pwTooShort:'Password must be at least 6 characters.',
    loginFail:'Incorrect username or password.',
    mpSupport:'✉ Customer Support',
    quickTokenTitle:'Top Up', quickTokenDesc:'Recharge your tokens',
    quickSupportTitle:'Support', quickSupportDesc:'Contact us by email',
    tmNote:'1 token per conversation\n3 free tokens for new members',
    guideSkip:'Don\'t show today',
    guideTitle:'How to Use M;Y 安',
    guideItems:[
      '✦  M;Y 安 interprets your energy based on Four Pillars (Saju) and Ohaeng theory.',
      '✦  Each conversation uses 1 token. New members receive 3 free tokens on sign-up.',
      '✦  When tokens run out, you can top up in My Page.',
      '✦  This service does not replace medical, legal, or financial advice.',
      '✦  The daily Ilchin refreshes at midnight, bringing a new energy prescription each day.',
    ],
    guideBtn:'Got it — Let\'s start',
    // Drawer menu translations
    drNav:'Quick Access', drLangLabel:'Language', drThemeLabel:'Display', drAccountLabel:'Account',
    drHome:'Home', drHomeSub:'Back to main screen',
    drSoloTitle:'My Reading', drSoloSub:"Today's Ohaeng energy reading",
    drCoupleTitle:'Our Harmony', drCoupleSub:"Two people's Ohaeng compatibility",
    drMypageTitle:'My Page', drMypageSub:'Tokens · Profile · Settings',
    drCalTitle:'Energy Calendar', drCalSub:'Reading history · Calendar',
    drTarotTitle:"Today's Tarot", drTarotSub:'A fun card pull (1 token)',
    tarotTitle:"Today's Tarot", tarotShuffling:'Shuffling the cards...', tarotReversed:'Reversed', tarotPickCard:'Pick the card that speaks to you',
    drZodiacTitle:'Zodiac Fortune', drZodiacSub:"Today's animal & star sign fortune (1 token)",
    zodiacTitle:'Zodiac Fortune', zodiacLoading:'Calculating your fortune...', zodiacNeedBirth:'Please add your birth date in My Page first.',
    drLuckyTitle:"Today's Lucky Picks", drLuckySub:'Lucky color · food · mood (1 token)',
    luckyTitle:"Today's Lucky Picks", luckyLoading:'Finding your luck...', luckyColor:'Lucky Color', luckyFood:'Lucky Food', luckySong:'Lucky Mood',
    drTypeTitle:'Five-Element Type & Match Test', drTypeSub:'Find your type & check compatibility (1 token)',
    typeTitle:'Five-Element Type Test', typeProgress:'{n} / {total}', typeResultTitle:'Your type is',
    typePickPartner:"Pick your partner's type to check compatibility", typeCompatLoading:'Analyzing compatibility...', typeRetake:'Retake',
    typeQ: [
      { q:'Your ideal weekend?', opts:['Learn something new','Party with friends','Cozy at home','Organize everything','Solo walk & think'] },
      { q:'How do you destress?', opts:['Get moving','Talk it out','Comfort food','Analyze the cause','Quiet reflection'] },
      { q:"In a group, you're the...", opts:['Idea person','Life of the party','Caring big sibling','The planner','Quiet listener'] },
      { q:'Your work style?', opts:['Jump right in','Passionate & immersed','Steady & diligent','Perfectionist finisher','Flexible & adaptive'] },
      { q:'If you were a color?', opts:['Green','Red','Yellow','White/Silver','Blue/Black'] },
    ],
    typeDesc: {
      木:'A growth-driven leader who loves new challenges and takes charge!',
      火:'A passionate, expressive life-of-the-party who brings energy everywhere!',
      土:'A dependable, caring homebody type who looks after everyone around them!',
      金:'A principled perfectionist planner who always finishes what they start!',
      水:'A calm, adaptable sage who quietly observes and handles things wisely!',
    },
    drThemeTitle:'Theme', drDark:'🌙 Dark', drLight:'☀️ Light',
    drSupportTitle:'1:1 KakaoTalk Chat', drLogoutTitle:'Log out',
    // First input form
    fifLblName:'Your Name', fifLblYear:'Birth Year', fifLblMonth:'Month', fifLblDay:'Day',
    fifLblTime:'Birth Time', fifTimeOpt:'(optional)', fifTimeUnknown:'Unknown / Skip',
    fifOptNote:'You may leave the time blank if you are unsure',
    fifSubmitBtn:'Start My Reading ›',
    fifNamePh:'Jane Doe',
    // Suggest chips
    suggestChips:['Wealth today','Should I change jobs?','What to avoid today','Love fortune','Daily outlook'],
    suggestChipsDuo:['How is our compatibility?','We feel distant lately','Best time to get married?','Why do we argue so often?','What do we have in common?'],
    // Mypage bottom
    mpZeroNote:'No tokens left. Charge below to continue your reading ✦',
    mpBotCharge:'Buy Tokens', mpBotChargeDesc:'Top up to continue readings',
    mpBotSupport:'KakaoTalk Support', mpBotSupportDesc:'Ask us anything, anytime',
    // Membership subscription
    subSecTitle:'Membership · monthly tokens auto-credited',
    subTokenLabel:'Monthly',
    subBasicName:'Basic', subPremName:'Premium',
    subBasicPrice:'₩9,900 / mo', subPremPrice:'₩19,900 / mo',
    subSubscribeBtn:'Subscribe', subPremBest:'BEST',
    subPlanNames:{ basic:'Basic Membership', premium:'Premium Membership' },
    subTokensPerMonth:'{n} tokens / month', subNextBilling:'Next billing: {date}',
    subCancelBtn:'Cancel',
    subCancelConfirm:'Cancel your subscription? Auto-renewal will stop from the next billing date.',
    subCanceledToast:'Subscription canceled.',
    subStartedMsg:'✦ Subscription started! Tokens will be credited every month.',
    subFailMsg:'Subscription failed.',

  },
  zh:{
    tagline:'为心灵开具营养处方',
    ilchin: il=>`今日日辰 · ${CG[il.ci]}${JJ[il.ji]}日 · ${ON.zh[il.o]}`,
    back:'返回',
    eyebrow:'今日气运',
    headline:'请选择\n您的解读方式',
    desc:'我们将解读您的四柱与今日日辰的交汇方式。\n日辰每日更替，处方也因此每日不同。',
    s1:'个人解读',
    d1:'分析您的四柱与今日日辰，\n为您量身定制今日处方。',
    s2:'二人调和',
    d2:'共同解读两人的五行与今日日辰，\n揭示关系流动并开具共享处方。',
    note:'※ 本服务为基于命理学理论的文化体验内容。\n不替代医疗或法律建议，仅供参考。',
    ph:'请输入消息…',
    rxlbl: o=>`今日处方 · ${ON.zh[o]}`,
    kiLabel:'今日强势气场',
    actLabel:'今日宜',
    revisit:'✦ 日辰每日更替。明日再来，将获得不同气运的全新处方。',
    err:'气运暂时交错，请再试一次。',
    noLogin:'请重新登录后继续。',
    errSafety:'此问题超出气运解读范围。请提问关于四柱、五行或能量流动的内容。',
    g1: il=>`欢迎光临。\n今日为${CG[il.ci]}${JJ[il.ji]}日，流动着${ON.zh[il.o]}的气运。\n\n请告知您的姓名与出生年月日，若知晓出生时辰更佳。\n我将为您解读四柱与今日日辰的流动。`,
    g2: il=>`欢迎光临。\n今日为${CG[il.ci]}${JJ[il.ji]}日，流动着${ON.zh[il.o]}的气运。\n\n请分别告知两位的姓名与出生年月日。\n我将共同解读二人的五行调和与今日日辰。`,
    sys:'请用简体中文回答。',
    sgTitle:'会员注册',
    sgHeadline:'注册，享受\n更精准的\n气运解读。',
    sgSub:'注册一次，即可每日享受更精准、更个性化的气运解读。',
    sgLink:'✦ 注册，获取更精准的气运解读 →',
    guestName:'免费体验',
    guestDesc:'无需登录，免费体验1次',
    guestTitle:'M;Y 安 体验',
    guestSubtitle:'输入您的出生日期，获取今日运势解读。',
    guestBirthPlaceholder:'例如：1990-01-01',
    guestSubmitBtn:'获取AI解读',
    guestLimitTitle:'今日体验已完成',
    guestLimitMsg:'访客模式每天限用一次。',
    guestLimitReset:'下次体验时间：',
    guestResultTitle:'解读结果',
    guestLoading:'AI正在分析中...',
    sgName:'姓名', sgEmail:'邮箱', sgPhone:'电话', sgYear:'出生年', sgMonth:'出生月', sgDay:'出生日',
    sgHour:'出生时辰', sgGender:'性别', sgM:'男', sgF:'女', sgOpt:'(选填)', sgRegion:'居住地区',
    sgSubmit:'立即注册',
    sgNotice:'您的信息仅用于改善气运解读及提供个性化处方，不会提供给第三方。',
    sgSuccTitle:'注册完成', sgSuccDesc:'您的气运已被记录。\n明日再来，将获得更精准的处方。',
    sgBack:'返回首页 →', sgErr:'保存时出错，请稍后再试。', sgUnknown:'不知道', sgOr:'或手动填写',
    sgPfHeadline:'欢迎！🎉', sgPfSub:'为了准确的四柱解读，请输入您的出生日期。',
    sgPfSave:'保存', sgPfSkip:'以后再填', sgPfErrBirth:'请输入有效的出生日期。',
    g1_auto: (il, u) => `欢迎回来，${u.name}。\n今日为${CG[il.ci]}${JJ[il.ji]}日，流动着${ON.zh[il.o]}的气运。\n\n您的四柱信息已准备就绪。\n请告诉我今日气运或您想了解的问题。`,
    mpLink:'个人页面', mpTitle:'个人页面', mpSection:'出生日期',
    mpDetailSection:'详细信息',
    mpDetailNotice:'补充以下信息可获得更精准的气运解读，全部为选填项。',
    mpSave:'保存', mpSaved:'已保存 ✦',
    mpLogout:'退出登录', mpWithdraw:'注销账号',
    mpLogoutQ:'再次点击确认退出', mpWithdrawQ:'再次点击确认注销',
    shareBtn:'分享', shareCopied:'已复制到剪贴板!',
    shareTitle:'M;Y 安 今日运势', shareMsg:'今天({d})的五行之气是{o}！快来M;Y 安查看吧。',
    previewLabel:'今日运势', previewCta:'在聊天中询问 →', previewSub:'立即查看',
    notifOn:'开启通知', notifOff:'已关闭通知', notifOff2:'关闭通知', savingImage:'正在保存图片...', imageSaved:'图片已保存！📸', notifEnabled:'通知已设置！🌟', notifDenied:'需要通知权限。',
    detailTitle:'详细解读', detailSub:'AI深度分析', detailLoading:'AI分析中...（约10秒）',
    oracleEnter:'欢迎光临，客人。\n路途辛苦了。', oracleFlip:'翻阅万年历…', oraclePillars:'排列四柱…', oracleExit:'解读已送达。',
    detailCardTitle:{health:'健康运',wealth:'财运',love:'恋爱运',career:'事业运'},
    tokenUnit:'剩余代币',
    streakTitle:'出勤连续记录', streakCurrent:'当前', streakMax:'最高', streakTotal:'总计',
    streakCheckin:'今日签到', streakDone:'今日已签到 ✓', streakBonus:'🎉 7天奖励！+5代币', streakDay:'天',
    heatmapTitle:'90天五行记录',
    luckyTitle:'今日幸运', luckyColor:'幸运色', luckyNumber:'幸运数字', luckyDir:'幸运方向', luckyStone:'幸运石',
    feedbackLabel:'运势准确吗？', feedbackYes:'准确', feedbackNo:'不太准',
    referralTitle:'邀请好友', referralGenerate:'生成我的邀请码', referralCopy:'复制',
    referralDesc:'好友使用您的邀请码后，双方各得+3代币！',
    referralInputPlaceholder:'输入邀请码', referralClaimBtn:'应用',
    referralUsed:'成功邀请：{n}人', referralClaimed:'🎉 代码已应用！+{n}代币',
    profileShareText:'在M;Y 安连续{s}天查看运势！（共{t}次）myan.riger7070.workers.dev',
    ohiLabel:'今日气运', ohiActive:'今日气运',
    shareCancel:'取消', shareCopyBtn:'复制链接',
    instaToast:'文字已复制！请在Instagram应用中粘贴 📸',
    wdSessionExpired:'会话已过期，请重新登录后再注销账号。',
    tkSection:'剩余代币', tkUnit:'TOKENS',
    noToken:'代币不足。\n请前往个人页面充值。',
    tkPkgS:'小', tkPkgM:'中', tkPkgL:'大', tkSub:'订阅制', tkUnlimited:'无限制',
    tkPayBtn:'Toss付款',
    tkAfterPay:'付款完成后，请在下方输入运营商提供的兑换码。',
    tkVoucher:'兑换码', tkVoucherPh:'请输入兑换码', tkRedeem:'确认',
    tkRedeemOk: n=>`✦ 已充值 ${n} 代币！`,
    tkRedeemFail:'无效或已使用的兑换码。',
    loginTitle:'欢迎回来。',
    loginId:'用户名', loginPw:'密码', loginBtn:'登录',
    sgUsername:'用户名', sgPassword:'密码', sgConfirmPw:'确认密码',
    pwMismatch:'密码不一致。', pwTooShort:'密码至少需要6个字符。',
    loginFail:'用户名或密码不正确。',
    mpSupport:'✉ 客服中心',
    quickTokenTitle:'充值代币', quickTokenDesc:'充值对话次数',
    quickSupportTitle:'1对1咨询', quickSupportDesc:'发送邮件联系我们',
    tmNote:'每次对话消耗1代币\n新会员注册赠送3代币',
    guideSkip:'今天不再显示',
    guideTitle:'M;Y 安 使用指南',
    guideItems:[
      '✦  M;Y 安 是基于四柱五行理论的AI气运解读服务。',
      '✦  每次对话消耗1个代币。新会员注册时赠送3个免费代币。',
      '✦  代币用完后，可在个人页面充值。',
      '✦  本服务不能替代医疗、法律或财务建议。',
      '✦  日辰每天午夜更新，每天提供全新的气运处方。',
    ],
    guideBtn:'明白了，开始吧',
    // 抽屉菜单翻译
    drNav:'快捷导航', drLangLabel:'语言', drThemeLabel:'显示', drAccountLabel:'账户',
    drHome:'首页', drHomeSub:'返回主界面',
    drSoloTitle:'个人解读', drSoloSub:'今日五行气运解析',
    drCoupleTitle:'缘分和谐', drCoupleSub:'两人五行宫合解析',
    drMypageTitle:'我的页面', drMypageSub:'代币 · 生日 · 设置',
    drCalTitle:'气运日历', drCalSub:'解读记录 · 五行色彩日历',
    drTarotTitle:'今日塔罗', drTarotSub:'趣味抽卡一张（1代币）',
    tarotTitle:'今日塔罗', tarotShuffling:'正在洗牌...', tarotReversed:'逆位', tarotPickCard:'请选择一张让你有感觉的卡牌',
    drZodiacTitle:'生肖·星座运势', drZodiacSub:'今日生肖·星座运势（1代币）',
    zodiacTitle:'生肖·星座运势', zodiacLoading:'正在计算运势...', zodiacNeedBirth:'请先在个人主页登记出生日期。',
    drLuckyTitle:'今日幸运单品', drLuckySub:'幸运颜色·食物·音乐推荐（1代币）',
    luckyTitle:'今日幸运单品', luckyLoading:'正在寻找今日好运...', luckyColor:'幸运颜色', luckyFood:'幸运食物', luckySong:'幸运情绪',
    drTypeTitle:'五行类型·配对测试', drTypeSub:'找到我的类型并查看配对（1代币）',
    typeTitle:'五行类型测试', typeProgress:'{n} / {total}', typeResultTitle:'你的类型是',
    typePickPartner:'请选择对方的类型来查看配对', typeCompatLoading:'正在分析配对...', typeRetake:'重新测试',
    typeQ: [
      { q:'理想的周末是？', opts:['学点新东西','和朋友聚会','在家舒服躺着','整理收纳','独自散步思考'] },
      { q:'怎么缓解压力？', opts:['动一动身体','找人倾诉','吃点好吃的','分析原因','安静地整理思绪'] },
      { q:'在朋友圈里你是？', opts:['点子王','气氛担当','照顾大家的大姐大哥','计划担当','安静的倾听者'] },
      { q:'你的工作风格？', opts:['先做了再说','充满热情投入','稳扎稳打','追求完美收尾','灵活应变'] },
      { q:'如果用颜色代表你？', opts:['绿色','红色','黄色','白色/银色','蓝色/黑色'] },
    ],
    typeDesc: {
      木:'喜欢成长和挑战的领导型，总是敢于尝试、勇往直前！',
      火:'热情洋溢、表达力十足的气氛担当，走到哪里都充满活力！',
      土:'可靠又温暖的居家型，总是把身边人照顾得妥妥当当！',
      金:'原则性强、追求完美的计划型，交代的事一定漂亮完成！',
      水:'沉稳灵活的智慧型，静静观察局势、从容应对！',
    },
    drThemeTitle:'主题', drDark:'🌙 深色', drLight:'☀️ 浅色',
    drSupportTitle:'1:1 客服咨询', drLogoutTitle:'退出登录',
    // 首次输入表单
    fifLblName:'姓名', fifLblYear:'出生年', fifLblMonth:'月', fifLblDay:'日',
    fifLblTime:'出生时辰', fifTimeOpt:'(可选)', fifTimeUnknown:'不知道 / 跳过',
    fifOptNote:'不知道出生时辰可以留空',
    fifSubmitBtn:'开始气运解读 ›',
    fifNamePh:'张三',
    // 推荐话题
    suggestChips:['今日财运','可以换工作吗？','今日应避之事','爱情运势','今日总运'],
    suggestChipsDuo:['我们的缘分如何？','最近感觉有些疏远','何时结婚比较好？','为什么我们经常吵架？','我们有哪些共同点？'],
    // 我的页面底部
    mpZeroNote:'代币不足，请在下方充值后继续解读 ✦',
    mpBotCharge:'充值代币', mpBotChargeDesc:'充值后继续解读',
    mpBotSupport:'1:1 客服咨询', mpBotSupportDesc:'随时欢迎咨询',
    // 会员订阅
    subSecTitle:'会员订阅 · 每月自动赠送代币',
    subTokenLabel:'月订阅',
    subBasicName:'基础', subPremName:'高级',
    subBasicPrice:'每月 9,900韩元', subPremPrice:'每月 19,900韩元',
    subSubscribeBtn:'订阅', subPremBest:'BEST',
    subPlanNames:{ basic:'基础会员', premium:'高级会员' },
    subTokensPerMonth:'每月 {n} 代币', subNextBilling:'下次扣款日: {date}',
    subCancelBtn:'取消订阅',
    subCancelConfirm:'确定要取消订阅吗？将从下次扣款日起停止自动续费。',
    subCanceledToast:'订阅已取消。',
    subStartedMsg:'✦ 订阅已开始！每月将自动赠送代币。',
    subFailMsg:'订阅处理失败。',

  },
  ja:{
    tagline:'心の栄養を処方します',
    ilchin: il=>`今日の日辰 · ${CG[il.ci]}${JJ[il.ji]}日 · ${ON.ja[il.o]}`,
    back:'戻る',
    eyebrow:'今日の気運',
    headline:'どのリーディングを\nご希望ですか',
    desc:'あなたの四柱と今日の日辰が出会う方式を読み解きます。\n日辰は毎日変わるため、処方も毎日異なります。',
    s1:'私のリーディング',
    d1:'あなたの四柱と今日の日辰の流れを分析し、\n今日だけの処方をお届けします。',
    s2:'二人の調和',
    d2:'二人の五行と今日の日辰を共に読み解き、\n関係の流れと処方を共にお届けします。',
    note:'※ 本サービスは命理学理論に基づく文化体験コンテンツです。\n医療・法的アドバイスの代替ではなく、参考用としてご活用ください。',
    ph:'メッセージを入力してください…',
    rxlbl: o=>`本日の処方 · ${ON.ja[o]}`,
    kiLabel:'今日の強い気',
    actLabel:'今日おすすめ',
    revisit:'✦ 日辰は毎日変わります。明日またお越しいただくと、異なる気運の処方をお届けします。',
    err:'少々気運が交錯しました。もう一度お試しください。',
    noLogin:'再度ログインしてからご利用ください。',
    errSafety:'このご質問は気運リーディングの範囲外です。四柱・五行・エネルギーの流れに関するご質問をお願いします。',
    g1: il=>`ようこそ。\n今日は${CG[il.ci]}${JJ[il.ji]}日 — ${ON.ja[il.o]}の気運が流れる日です。\n\nお名前と生年月日をお教えください。\n出生時刻もご存知でしたら、合わせてお知らせください。`,
    g2: il=>`ようこそ。\n今日は${CG[il.ci]}${JJ[il.ji]}日 — ${ON.ja[il.o]}の気運が流れる日です。\n\nお二人のお名前と生年月日をそれぞれお教えください。\n五行の調和と今日の日辰の流れを共に読み解きます。`,
    sys:'必ず日本語でお答えください。',
    sgTitle:'会員登録',
    sgHeadline:'会員登録して\nより精密な気運\nリーディングを。',
    sgSub:'一度ご登録いただくと、毎日より精密でパーソナルな気運リーディングをお届けします。',
    sgLink:'✦ 会員登録でより精密な気運リーディングを →',
    guestName:'無料体験',
    guestDesc:'ログインなしで1回無料',
    guestTitle:'M;Y 安 体験',
    guestSubtitle:'生年月日を入力すると、今日の運気を簡単に確認できます。',
    guestBirthPlaceholder:'例：1990-01-01',
    guestSubmitBtn:'AI診断を受ける',
    guestLimitTitle:'本日の体験完了',
    guestLimitMsg:'ゲストモードは1日1回限定です。',
    guestLimitReset:'次回体験まで：',
    guestResultTitle:'診断結果',
    guestLoading:'AIが分析中です...',
    sgName:'お名前', sgEmail:'メールアドレス', sgPhone:'電話番号', sgYear:'生年', sgMonth:'生月', sgDay:'生日',
    sgHour:'生時', sgGender:'性別', sgM:'男性', sgF:'女性', sgOpt:'(任意)', sgRegion:'お住まいの地域',
    sgSubmit:'登録する',
    sgNotice:'ご提供いただいた情報は気運リーディング改善及び処方目的のみに使用し、第三者には提供いたしません。',
    sgSuccTitle:'登録完了', sgSuccDesc:'大切な気運が記録されました。\n明日またお越しいただくと、より精密な処方をお届けします。',
    sgBack:'ホームへ →', sgErr:'保存中にエラーが発生しました。もう一度お試しください。', sgUnknown:'不明', sgOr:'または手動で入力',
    sgPfHeadline:'ようこそ！🎉', sgPfSub:'正確な四柱占いのために生年月日を入力してください。',
    sgPfSave:'保存する', sgPfSkip:'あとで入力する', sgPfErrBirth:'正しい生年月日を入力してください。',
    g1_auto: (il, u) => `おかえりなさい、${u.name}様。\n今日は${CG[il.ci]}${JJ[il.ji]}日 — ${ON.ja[il.o]}の気運が流れる日です。\n\n登録された情報が準備できています。\n今日の気運やお気になることをお聞かせください。`,
    mpLink:'マイページ', mpTitle:'マイページ', mpSection:'生年月日',
    mpDetailSection:'詳細情報の入力',
    mpDetailNotice:'以下の情報を追加すると、より精密な気運リーディングをお届けします。すべて任意入力です。',
    mpSave:'保存する', mpSaved:'保存しました ✦',
    mpLogout:'ログアウト', mpWithdraw:'退会する',
    mpLogoutQ:'もう一度でログアウト', mpWithdrawQ:'もう一度で退会します',
    shareBtn:'シェア', shareCopied:'クリップボードにコピーしました!',
    shareTitle:'M;Y 安 今日の運勢', shareMsg:'今日({d})の五行の気は{o}です！M;Y 安でチェック。',
    previewLabel:'今日の運勢', previewCta:'チャットで聞く →', previewSub:'今すぐ確認',
    notifOn:'通知をオンにする', notifOff:'通知をオフにしました', notifOff2:'通知をオフ', savingImage:'画像を保存中...', imageSaved:'画像が保存されました！📸', notifEnabled:'通知が設定されました！🌟', notifDenied:'通知の許可が必要です。',
    detailTitle:'詳細リーディング', detailSub:'AI精密分析', detailLoading:'AI分析中...（約10秒）',
    oracleEnter:'ようこそ、お客様。\n遠路はるばるお疲れ様でした。', oracleFlip:'万歳暦をめくります…', oraclePillars:'四柱を立てます…', oracleExit:'鑑定が届きました。',
    detailCardTitle:{health:'健康運',wealth:'金運',love:'恋愛運',career:'仕事運'},
    tokenUnit:'残りトークン',
    streakTitle:'連続出席', streakCurrent:'現在', streakMax:'最高', streakTotal:'合計',
    streakCheckin:'今日の出席チェック', streakDone:'本日出席済み ✓', streakBonus:'🎉 7日ボーナス！+5トークン', streakDay:'日',
    heatmapTitle:'90日間の五行記録',
    luckyTitle:'今日のラッキー', luckyColor:'ラッキーカラー', luckyNumber:'ラッキーナンバー', luckyDir:'ラッキー方向', luckyStone:'ラッキーストーン',
    feedbackLabel:'この運勢は当たりましたか？', feedbackYes:'当たった', feedbackNo:'ちょっと違う',
    referralTitle:'友達を招待', referralGenerate:'招待コードを生成', referralCopy:'コピー',
    referralDesc:'友達がコードを入力すると、双方に+3トークン！',
    referralInputPlaceholder:'招待コードを入力', referralClaimBtn:'適用',
    referralUsed:'招待成功：{n}人', referralClaimed:'🎉 コード適用！+{n}トークン',
    profileShareText:'M;Y 安で{s}日連続運勢チェック中！（計{t}回）myan.riger7070.workers.dev',
    ohiLabel:'今日の気運', ohiActive:'今日の気運',
    shareCancel:'キャンセル', shareCopyBtn:'リンクをコピー',
    instaToast:'テキストをコピーしました！Instagramアプリに貼り付けてください 📸',
    wdSessionExpired:'セッションが期限切れです。再度ログインしてから退会してください。',
    tkSection:'残りトークン', tkUnit:'TOKENS',
    noToken:'トークンが不足しています。\nマイページでチャージしてください。',
    tkPkgS:'小', tkPkgM:'中', tkPkgL:'大', tkSub:'サブスク', tkUnlimited:'無制限',
    tkPayBtn:'Tossで決済',
    tkAfterPay:'決済完了後、運営者から受け取ったバウチャーコードを下に入力してください。',
    tkVoucher:'バウチャーコード', tkVoucherPh:'コードを入力', tkRedeem:'適用',
    tkRedeemOk: n=>`✦ ${n} トークンがチャージされました！`,
    tkRedeemFail:'無効またはすでに使用されたコードです。',
    loginTitle:'おかえりなさい。',
    loginId:'ユーザー名', loginPw:'パスワード', loginBtn:'ログイン',
    sgUsername:'ユーザー名', sgPassword:'パスワード', sgConfirmPw:'パスワード確認',
    pwMismatch:'パスワードが一致しません。', pwTooShort:'パスワードは6文字以上が必要です。',
    loginFail:'ユーザー名またはパスワードが正しくありません。',
    mpSupport:'✉ カスタマーサポート',
    quickTokenTitle:'トークン充電', quickTokenDesc:'会話券をチャージ',
    quickSupportTitle:'1対1相談', quickSupportDesc:'メールでお問い合わせ',
    tmNote:'会話1回 = トークン1個\n新規登録で3トークン無料',
    guideSkip:'今日は表示しない',
    guideTitle:'M;Y 安 ご利用ガイド',
    guideItems:[
      '✦  M;Y 安は四柱五行理論に基づくAI気運リーディングサービスです。',
      '✦  会話1回につきトークン1個を消費します。新規登録で3トークンを無料進呈。',
      '✦  トークンがなくなったら、マイページでチャージできます。',
      '✦  本サービスは医療・法律・金融アドバイスの代替ではありません。',
      '✦  日辰は毎日深夜に更新され、毎日新しい気運処方をお届けします。',
    ],
    guideBtn:'確認、はじめる',
    // ドロワーメニュー翻訳
    drNav:'ナビゲーション', drLangLabel:'言語', drThemeLabel:'表示', drAccountLabel:'アカウント',
    drHome:'ホーム', drHomeSub:'メイン画面に戻る',
    drSoloTitle:'マイリーディング', drSoloSub:'今日の五行エネルギー解読',
    drCoupleTitle:'ふたりの調和', drCoupleSub:'二人の五行相性解読',
    drMypageTitle:'マイページ', drMypageSub:'トークン · 生年月日 · 設定',
    drCalTitle:'エネルギーカレンダー', drCalSub:'リーディング履歴 · 五行カレンダー',
    drTarotTitle:'今日のタロット', drTarotSub:'お楽しみカード1枚（トークン1）',
    tarotTitle:'今日のタロット', tarotShuffling:'カードをシャッフル中...', tarotReversed:'逆位置', tarotPickCard:'気になるカードを1枚選んでください',
    drZodiacTitle:'干支・星座占い', drZodiacSub:'今日の干支・星座占い（トークン1）',
    zodiacTitle:'干支・星座占い', zodiacLoading:'占いを計算中...', zodiacNeedBirth:'先にマイページで生年月日を登録してください。',
    drLuckyTitle:'今日のラッキーアイテム', drLuckySub:'ラッキーカラー・フード・ムード（トークン1）',
    luckyTitle:'今日のラッキーアイテム', luckyLoading:'今日の運を探しています...', luckyColor:'ラッキーカラー', luckyFood:'ラッキーフード', luckySong:'ラッキームード',
    drTypeTitle:'五行タイプ・相性診断', drTypeSub:'タイプを見つけて相性チェック（トークン1）',
    typeTitle:'五行タイプ診断', typeProgress:'{n} / {total}', typeResultTitle:'あなたのタイプは',
    typePickPartner:'相性を見たい相手のタイプを選んでください', typeCompatLoading:'相性を分析中...', typeRetake:'もう一度',
    typeQ: [
      { q:'理想の週末は？', opts:['新しいことを学ぶ','友達とパーティー','家でごろごろ','整理整頓','一人で散歩・思索'] },
      { q:'ストレス解消法は？', opts:['体を動かす','誰かに話す','美味しいものを食べる','原因を分析する','静かに考えを整理'] },
      { q:'グループの中での自分は？', opts:['アイデアマン','ムードメーカー','面倒見のいいお姉さん/お兄さん','計画担当','静かな聞き役'] },
      { q:'仕事のスタイルは？', opts:['とりあえずやってみる','情熱的に没頭する','コツコツ真面目に','完璧に仕上げる','柔軟に合わせる'] },
      { q:'自分を色で表すと？', opts:['緑','赤','黄色','白・銀','青・黒'] },
    ],
    typeDesc: {
      木:'成長と挑戦が大好きなリーダータイプ！いつも新しいことに挑戦して先頭に立つ！',
      火:'情熱的で表現力豊かなムードメーカー！どこにいても場を盛り上げる！',
      土:'頼れる優しい世話焼きタイプ！周りをほっとさせる存在！',
      金:'原則を大事にする完璧主義の計画派！任されたことは確実にやり遂げる！',
      水:'落ち着いて柔軟な知恵者タイプ！静かに状況を見極めて賢く対処する！',
    },
    drThemeTitle:'テーマ', drDark:'🌙 ダーク', drLight:'☀️ ライト',
    drSupportTitle:'1:1 カカオ相談', drLogoutTitle:'ログアウト',
    fifLblName:'お名前', fifLblYear:'生まれ年', fifLblMonth:'月', fifLblDay:'日',
    fifLblTime:'生まれ時刻', fifTimeOpt:'(任意)', fifTimeUnknown:'不明 / スキップ',
    fifOptNote:'時刻が不明な場合は空白のままで構いません',
    fifSubmitBtn:'リーディングを始める ›',
    fifNamePh:'山田太郎',
    suggestChips:['今日の金運','転職すべきか？','今日避けること','恋愛運','今日の総合運'],
    suggestChipsDuo:['二人の相性はどうですか？','最近距離を感じます','いつ結婚するといいですか？','なぜよく喧嘩するのですか？','共通点はありますか？'],
    mpZeroNote:'トークンがありません。以下から充電してリーディングを続けましょう ✦',
    mpBotCharge:'トークン充電', mpBotChargeDesc:'続けるために充電する',
    mpBotSupport:'1:1 カカオ相談', mpBotSupportDesc:'いつでもお気軽にどうぞ',
    // メンバーシップ定期購読
    subSecTitle:'メンバーシップ · 毎月トークン自動付与',
    subTokenLabel:'月額',
    subBasicName:'ベーシック', subPremName:'プレミアム',
    subBasicPrice:'月 9,900ウォン', subPremPrice:'月 19,900ウォン',
    subSubscribeBtn:'購読する', subPremBest:'BEST',
    subPlanNames:{ basic:'ベーシック会員', premium:'プレミアム会員' },
    subTokensPerMonth:'毎月 {n} トークン', subNextBilling:'次回決済日: {date}',
    subCancelBtn:'解約',
    subCancelConfirm:'定期購読を解約しますか？次回決済日から自動決済が停止されます。',
    subCanceledToast:'定期購読を解約しました。',
    subStartedMsg:'✦ 購読を開始しました！毎月トークンが自動付与されます。',
    subFailMsg:'購読処理に失敗しました。',

  },
};

const DK = {
  ko:{
    木:{icon:'🌿',name:'새벽 산책',desc:'이른 아침 바깥 공기를 마시며 천천히 걸어보세요. 목기운이 새로운 시작을 열어줍니다.'},
    火:{icon:'🕯️',name:'마음 나누기',desc:'소중한 사람과 따뜻한 대화를 나눠보세요. 화기운이 관계를 환히 밝혀줍니다.'},
    土:{icon:'🪴',name:'규칙적인 식사',desc:'제때 식사하고 잠시 눈을 감아 쉬어보세요. 토기운이 하루의 중심을 잡아줍니다.'},
    金:{icon:'✨',name:'정리·계획',desc:'책상이나 공간을 정돈하고 내일 할 일을 적어보세요. 금기운이 명확함을 줍니다.'},
    水:{icon:'🌙',name:'충분한 휴식',desc:'무리하지 말고 일찍 쉬세요. 수기운이 내일을 위한 지혜와 회복을 채워줍니다.'},
  },
  en:{
    木:{icon:'🌿',name:'Morning Walk',desc:'Step outside early and breathe the fresh air. Wood energy opens new beginnings for the day.'},
    火:{icon:'🕯️',name:'Connect & Share',desc:'Have a warm conversation with someone close. Fire energy brightens every bond it touches.'},
    土:{icon:'🪴',name:'Regular Meals',desc:'Eat on time and take a quiet break. Earth energy centers and steadies your whole day.'},
    金:{icon:'✨',name:'Tidy & Plan',desc:'Clear your space and write tomorrow\'s goals. Metal energy sharpens focus and brings clarity.'},
    水:{icon:'🌙',name:'Rest Well',desc:'Take it easy and sleep early tonight. Water energy replenishes wisdom and vitality for tomorrow.'},
  },
  zh:{
    木:{icon:'🌿',name:'晨间散步',desc:'清晨外出，呼吸新鲜空气，慢慢行走。木气为新的开始注入活力。'},
    火:{icon:'🕯️',name:'温暖交流',desc:'与亲近的人进行一次温馨对话。火气照亮彼此的关系。'},
    土:{icon:'🪴',name:'规律饮食',desc:'按时用餐，稍作休息。土气稳固中心，让一天更有根基。'},
    金:{icon:'✨',name:'整理与计划',desc:'整理桌面，写下明日计划。金气带来清晰与条理。'},
    水:{icon:'🌙',name:'充足休息',desc:'不要勉强，早些休息。水气为明天积蓄智慧与恢复力。'},
  },
  ja:{
    木:{icon:'🌿',name:'朝の散歩',desc:'早朝に外の空気を吸いながらゆっくり歩きましょう。木の気が新たな始まりを開きます。'},
    火:{icon:'🕯️',name:'心の交流',desc:'大切な人と温かい会話を交わしましょう。火の気が関係を明るく照らします。'},
    土:{icon:'🪴',name:'規則正しい食事',desc:'時間通りに食事をとり、少し目を閉じて休みましょう。土の気が一日の軸を整えます。'},
    金:{icon:'✨',name:'整理・計画',desc:'身の回りを整え、明日のやることを書き出しましょう。金の気が明晰さをもたらします。'},
    水:{icon:'🌙',name:'十分な休息',desc:'無理せず早めに休みましょう。水の気が明日への知恵と回復を満たします。'},
  },
};

/* UI 렌더 */
function render() {
  const t   = TX[lang];
  const il  = ilchin();
  const col = OC[il.o];
  const now = new Date();
  const dateStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;

  document.getElementById('tagline').textContent    = t.tagline;
  document.getElementById('backLabel').textContent  = t.back;
  document.getElementById('eyebrow').textContent    = t.eyebrow;
  document.getElementById('headline').textContent   = t.headline;
  document.getElementById('subdesc').textContent    = t.desc;
  document.getElementById('soloName').textContent   = t.s1;
  document.getElementById('soloDesc').textContent   = t.d1;
  document.getElementById('coupleName').textContent = t.s2;
  document.getElementById('coupleDesc').textContent = t.d2;
  document.getElementById('guestName').textContent  = t.guestName;
  document.getElementById('guestDesc').textContent  = t.guestDesc;
  // 게스트 화면 다국어
  const guestTitleText = document.getElementById('guestTitleText');
  const guestSubtitleText = document.getElementById('guestSubtitleText');
  const guestBirthLabel = document.getElementById('guestBirthLabel');
  const guestNameLabel = document.getElementById('guestNameLabel');
  const guestSubmitBtn = document.getElementById('guestSubmitBtn');
  const guestResultTitleText = document.getElementById('guestResultTitleText');
  if (guestTitleText) guestTitleText.textContent = t.guestTitle || '🔓 체험해보기';
  if (guestSubtitleText) guestSubtitleText.textContent = t.guestSubtitle || '로그인 없이 AI 사주 풀이를 무료로 1회 체험해보세요';
  if (guestBirthLabel) guestBirthLabel.textContent = (lang === 'ko' ? '생년월일 *' : lang === 'en' ? 'Birth Date *' : lang === 'zh' ? '出生日期 *' : '生年月日 *');
  if (guestNameLabel) guestNameLabel.textContent = (lang === 'ko' ? '이름 (선택)' : lang === 'en' ? 'Name (optional)' : lang === 'zh' ? '姓名（可选）' : '名前（任意）');
  if (guestSubmitBtn) guestSubmitBtn.textContent = t.guestSubmitBtn || 'AI 풀이 받기';
  if (guestResultTitleText) guestResultTitleText.textContent = t.guestResultTitle || '✨ AI 풀이 결과';
  document.getElementById('disclaimer').textContent = t.note;
  document.getElementById('inp').placeholder        = t.ph;
  document.getElementById('ilchinDate').textContent = dateStr;
  document.getElementById('ilchinText').innerHTML =
    t.ilchin(il).replace(ON[lang][il.o], `<b style="color:${col}">${ON[lang][il.o]}</b>`);
  document.getElementById('signupLinkText').textContent = t.sgLink;
  // 퀵액세스 박스 텍스트
  const qtt = document.getElementById('quickTokenTitle');
  const qtd = document.getElementById('quickTokenDesc');
  const qst = document.getElementById('quickSupportTitle');
  const qsd = document.getElementById('quickSupportDesc');
  if (qtt) qtt.textContent = t.quickTokenTitle   || '토큰 충전';
  if (qtd) qtd.textContent = t.quickTokenDesc    || '대화권 충전하기';
  if (qst) qst.textContent = t.quickSupportTitle || '1대1 상담';
  if (qsd) qsd.textContent = t.quickSupportDesc  || '이메일로 문의하기';
  if (document.getElementById('screen-signup').style.display === 'flex') renderSignup();
  if (document.getElementById('screen-login').style.display  === 'flex') renderLogin();
  if (document.getElementById('screen-mypage').style.display === 'flex') renderMyPage();
  if (document.getElementById('token-modal')?.style.display  !== 'none') _renderTokenModal();
  // 마이페이지 버튼 텍스트 다국어 갱신
  const userBtn = document.getElementById('userBtn');
  if (userBtn && userBtn.style.display !== 'none') userBtn.textContent = t.mpLink;
}

// ── token-modal 라벨 다국어 렌더 ──
function _renderTokenModal() {
  const t = TX[lang] || TX.ko;
  const _s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  _s('tmTitle',      t.tkSection || '토큰 충전');
  _s('tmBalanceLbl', t.tkUnit    || 'TOKENS');
  _s('tmBadge0',     t.tkPkgS   || '소');
  _s('tmBadge1',     t.tkPkgM   || '중');
  _s('tmBadge2',     t.tkPkgL   || '대');
  _s('tmBtn0',       t.tkPayBtn || 'Toss로 결제하기');
  _s('tmBtn1',       t.tkPayBtn || 'Toss로 결제하기');
  _s('tmBtn2',       t.tkPayBtn || 'Toss로 결제하기');
  const noteEl = document.getElementById('tmNote');
  if (noteEl) noteEl.innerHTML = (t.tmNote || '').replace(/\n/g, '<br>');
  // 멤버십 구독 라벨
  _s('subSecTitle',  t.subSecTitle    || '멤버십 구독');
  _s('subBasicLabel',t.subTokenLabel  || '월 구독');
  _s('subPremLabel', t.subTokenLabel  || '월 구독');
  _s('subBasicName', t.subBasicName   || '베이직');
  _s('subPremName',  t.subPremName    || '프리미엄');
  _s('subBasicPrice',t.subBasicPrice  || '월 9,900원');
  _s('subPremPrice', t.subPremPrice   || '월 19,900원');
  _s('subBasicBtn',  t.subSubscribeBtn|| '구독하기');
  _s('subPremBtn',   t.subSubscribeBtn|| '구독하기');
  _s('subPremBest',  t.subPremBest    || 'BEST');
  // 활성 구독 상태 영역은 refreshSubscription()이 갱신
  if (typeof refreshSubscription === 'function') refreshSubscription();
}

/* 자정 자동 갱신 */
function schedMidnightRefresh() {
  const now  = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0, 0, 5);
  setTimeout(() => { render(); schedMidnightRefresh(); }, next - now);
}

function setLang(l) {
  lang = l;
  // 드로어 언어 버튼 동기화
  if (typeof _syncDrawerLangs === 'function') _syncDrawerLangs();
  render();
}

// ── 다크 / 라이트 모드 ──
function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const next = isLight ? 'dark' : 'light';
  applyTheme(next);
  localStorage.setItem('myan_theme', next);
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  // 테마 관련 UI 동기화
  if (typeof syncThemeColorMeta === 'function') syncThemeColorMeta();
  if (typeof _syncDrawerTheme === 'function') _syncDrawerTheme();
}

// 저장된 테마 적용
(function initTheme() {
  const saved = localStorage.getItem('myan_theme') || 'dark';
  applyTheme(saved);
})();

/* 모드 시작 — 미가입 시 회원가입 화면으로 */
let pendingMode = null; // 가입 후 진입할 모드 저장

function startMode(m) {
  const user = getUser();

  // 1. 미가입자 → 회원가입 게이트
  if (!user) {
    pendingMode = m;
    goSignup();
    return;
  }

  // 2. 이메일/비밀번호 가입자인데 로그아웃 상태 → 로그인 게이트
  if (user.passwordHash && !isLoggedIn()) {
    pendingMode = m;
    showLogin();
    return;
  }

  // 3. 구글 가입자인데 로그아웃 상태 또는 토큰 유실 → 즉시 로그인 게이트
  if (!user.passwordHash && (!isLoggedIn() || !getGoogleIdToken())) {
    pendingMode = m;
    showLogin();
    return;
  }

  // 이용 안내 모달 — 하루 스킵이 아니면 매번 표시
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('myan_guide_skip_date') !== today) {
    pendingMode = m;
    openGuideModal();
    return;
  }

  pendingMode = null;
  // 대기 중인 프로모 코드 처리
  if (typeof _processPendingPromo === 'function') _processPendingPromo();
  _enterMode(m, user);
}

/* ── 이용 안내 모달 ── */
function openGuideModal() {
  const t = TX[lang];
  document.getElementById('guideTitle').textContent      = t.guideTitle;
  document.getElementById('guideConfirmBtn').textContent = t.guideBtn;
  document.getElementById('guideSkipLabel').textContent  = t.guideSkip || '오늘 하루 보지 않기';
  document.getElementById('guideSkipToday').checked      = false;
  const itemsEl = document.getElementById('guideItems');
  itemsEl.innerHTML = (t.guideItems || []).map(
    txt => `<div class="guide-item">${txt}</div>`
  ).join('');
  document.getElementById('guide-modal').style.display = 'flex';
}

function closeGuideModal() {
  // 체크박스가 선택된 경우만 오늘 날짜 저장 (내일 다시 표시)
  if (document.getElementById('guideSkipToday').checked) {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem('myan_guide_skip_date', today);
  }
  document.getElementById('guide-modal').style.display = 'none';
  if (pendingMode) {
    const m = pendingMode; pendingMode = null;
    const user = getUser();
    _enterMode(m, user);
  }
}

function _enterMode(m, user) {
  // 토큰 충전 모달 특수 처리
  if (m === '_token') {
    openTokenModal();
    return;
  }
  mode = m;

  // 모드 선택 트래킹
  if (typeof Analytics !== 'undefined') {
    Analytics.trackModeSelect(m);
  }

  document.getElementById('screen-mode').style.display = 'none';
  document.getElementById('screen-chat').style.display = 'flex';
  document.getElementById('backBtn').style.display = 'flex';
  document.getElementById('chat-window').innerHTML = '';
  updateAllTokenDisplays();
  updateUserBtn(user);
  document.getElementById('signupLinkBtn').style.display = 'none';

  // ── 대화 방식 제거 ── 항상 생년월일·생시 입력 → 간단 풀이(로컬·무료) → 상세풀이(AI)
  hideSuggestChips();
  const _nir = document.getElementById('normalInputRow'); if (_nir) _nir.style.display = 'none';
  const _fif = document.getElementById('firstInputForm'); if (_fif) _fif.style.display = 'none';
  const _ncb = document.getElementById('newChatBtn'); if (_ncb) _ncb.style.display = 'none';

  showSajuInput(m); // app.js — 생년월일·생시 입력 폼 렌더
}

// ── Change 2: 첫 입력 폼 토글 ──
function showFirstInputForm() {
  document.getElementById('firstInputForm').style.display = 'flex';
  document.getElementById('normalInputRow').style.display = 'none';
  // number input에서 Enter 키 → 폼 제출
  ['fifName','fifYear','fifMonth','fifDay'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._fifEnter) {
      el._fifEnter = true;
      el.addEventListener('keydown', e => { if (e.key === 'Enter') submitFirstForm(); });
    }
  });
  document.getElementById('fifName').focus();
}
function showNormalInput() {
  document.getElementById('firstInputForm').style.display = 'none';
  document.getElementById('normalInputRow').style.display = 'flex';
}
function submitFirstForm() {
  const name  = document.getElementById('fifName').value.trim();
  const yearV = parseInt(document.getElementById('fifYear').value, 10);
  const monV  = parseInt(document.getElementById('fifMonth').value, 10);
  const dayV  = parseInt(document.getElementById('fifDay').value, 10);
  const time  = document.getElementById('fifTime').value;

  // ── 유효성 검증 ──
  const curYear = new Date().getFullYear();
  if (!name) { document.getElementById('fifName').focus(); return; }
  if (!yearV || yearV < 1920 || yearV > curYear) {
    document.getElementById('fifYear').focus();
    document.getElementById('fifYear').select();
    return;
  }
  if (!monV || monV < 1 || monV > 12) {
    document.getElementById('fifMonth').focus();
    document.getElementById('fifMonth').select();
    return;
  }
  if (!dayV || dayV < 1 || dayV > 31) {
    document.getElementById('fifDay').focus();
    document.getElementById('fifDay').select();
    return;
  }

  let msg = `${name}, ${yearV}년 ${monV}월 ${dayV}일생`;
  if (time) msg += `, ${time}`;
  // 입력 필드 초기화 (재진입 시 이전 값 잔류 방지)
  document.getElementById('fifName').value  = '';
  document.getElementById('fifYear').value  = '';
  document.getElementById('fifMonth').value = '';
  document.getElementById('fifDay').value   = '';
  document.getElementById('fifTime').value  = '';
  showNormalInput();
  document.getElementById('inp').value = msg;
  send();
}

// ── Change 4: 추천 칩 토글 ──
function showSuggestChips() {
  const el = document.getElementById('suggestChips');
  if (!el) return;
  // 모드에 따라 칩 내용 교체
  const t = TX[lang] || TX.ko;
  const chips = (mode === 'duo' ? t.suggestChipsDuo : t.suggestChips) || t.suggestChips || [];
  const spanEls = el.querySelectorAll('.suggest-chip');
  spanEls.forEach((span, i) => {
    if (chips[i] !== undefined) span.textContent = chips[i];
  });
  el.style.display = 'flex';
}
function hideSuggestChips() {
  const el = document.getElementById('suggestChips');
  if (el) el.style.display = 'none';
}
function useSuggest(el) {
  const txt = el.textContent;
  showNormalInput();
  document.getElementById('inp').value = txt;
  send();
}

function buildUserProfile(u) {
  const gMap = { ko:{M:'남성',F:'여성'}, en:{M:'Male',F:'Female'}, zh:{M:'男',F:'女'}, ja:{M:'男性',F:'女性'} };
  // 언어별 생년월일 형식
  const bFmt = {
    ko: `${u.birthYear}년 ${u.birthMonth}월 ${u.birthDay}일생`,
    en: `born ${u.birthYear}-${String(u.birthMonth).padStart(2,'0')}-${String(u.birthDay).padStart(2,'0')}`,
    zh: `${u.birthYear}年${u.birthMonth}月${u.birthDay}日生`,
    ja: `${u.birthYear}年${u.birthMonth}月${u.birthDay}日生`,
  };
  // 언어별 시간 표기
  const hMap = {
    ko:{'子':'자시(23-01)','丑':'축시(01-03)','寅':'인시(03-05)','卯':'묘시(05-07)','辰':'진시(07-09)','巳':'사시(09-11)','午':'오시(11-13)','未':'미시(13-15)','申':'신시(15-17)','酉':'유시(17-19)','戌':'술시(19-21)','亥':'해시(21-23)'},
    en:{'子':'Rat hour (23-01)','丑':'Ox hour (01-03)','寅':'Tiger hour (03-05)','卯':'Rabbit hour (05-07)','辰':'Dragon hour (07-09)','巳':'Snake hour (09-11)','午':'Horse hour (11-13)','未':'Goat hour (13-15)','申':'Monkey hour (15-17)','酉':'Rooster hour (17-19)','戌':'Dog hour (19-21)','亥':'Pig hour (21-23)'},
    zh:{'子':'子时(23-01)','丑':'丑时(01-03)','寅':'寅时(03-05)','卯':'卯时(05-07)','辰':'辰时(07-09)','巳':'巳时(09-11)','午':'午时(11-13)','未':'未时(13-15)','申':'申时(15-17)','酉':'酉时(17-19)','戌':'戌时(19-21)','亥':'亥时(21-23)'},
    ja:{'子':'子の刻(23-01)','丑':'丑の刻(01-03)','寅':'寅の刻(03-05)','卯':'卯の刻(05-07)','辰':'辰の刻(07-09)','巳':'巳の刻(09-11)','午':'午の刻(11-13)','未':'未の刻(13-15)','申':'申の刻(15-17)','酉':'酉の刻(17-19)','戌':'戌の刻(19-21)','亥':'亥の刻(21-23)'},
  };
  const regSuffix = {ko:' 거주', en:', ', zh:'居住', ja:'在住'}[lang] || '';
  let s = `${u.name}, ${(bFmt[lang] || bFmt.ko)}`;
  if (u.birthHour) s += `, ${(hMap[lang]||hMap.ko)[u.birthHour] || u.birthHour}`;
  if (u.gender)    s += `, ${(gMap[lang]||gMap.ko)[u.gender]}`;
  if (u.region)    s += `, ${u.region}${regSuffix}`;
  return s;
}

// 대화 기록 최대 유지 수 (turn 기준 — user+model 쌍 8개 = 16개 메시지)
const MAX_HIST = 16;
function trimmedHist() {
  if (hist.length <= MAX_HIST) return hist;
  // 첫 2개(인사) 보존 + 최신 (MAX_HIST-2)개
  return [...hist.slice(0, 2), ...hist.slice(-(MAX_HIST - 2))];
}

// ── 초기화: 페이지 로드 시 render() 호출 ──
(function initLocales() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      render();
      schedMidnightRefresh();
    });
  } else {
    render();
    schedMidnightRefresh();
  }
})();
