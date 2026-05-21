// M;Y 安 — locales.js  (TX 다국어·DK 처방카드·MAX_HIST·trimmedHist)
/* 번역 */
const TX = {
  ko:{
    tagline:'마음의 영양을 처방합니다',
    ilchin: il=>`오늘의 일진 · ${CG[il.ci]}${JJ[il.ji]}(${CG_K[il.ci]}${JJ_K[il.ji]})일 · ${ON.ko[il.o]}`,
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
    revisit:'✦ 일진은 매일 바뀝니다. 내일 오시면 오늘과 다른 처방을 받으실 수 있습니다.',
    err:'잠시 기운이 엇갈렸습니다(시스템 오류). 토큰은 차감되지 않았으니 잠시 후 다시 시도해 주세요.',
    noLogin:'로그인이 필요합니다. 다시 로그인해 주세요.',
    errSafety:'질문이 기운 리딩의 범위를 벗어나 답변이 생성되지 않았습니다. 사주·오행·에너지 흐름에 관한 질문을 해주세요. (사용된 토큰은 차감되지 않고 안전하게 복구되었습니다.)',
    g1: il=>`오늘의 기운을 함께 살펴볼게요. ✨\n오늘은 ${CG[il.ci]}${JJ[il.ji]}(${CG_K[il.ci]}${JJ_K[il.ji]})일이에요 — ${ON.ko[il.o]}의 기운이 은은하게 흐르고 있는 날이네요.\n\n성함과 생년월일을 알려주시면, 이 기운이 오늘 나에게 어떻게 닿는지 풀어드릴게요. 태어난 시간도 알고 계시다면 함께 적어주세요.`,
    g2: il=>`두 분의 이야기를 함께 살펴볼게요. 🌿\n오늘은 ${CG[il.ci]}${JJ[il.ji]}(${CG_K[il.ci]}${JJ_K[il.ji]})일이에요 — ${ON.ko[il.o]}의 기운이 온화하게 머물고 있어요.\n\n두 분의 성함과 생년월일을 각각 알려주시면, 서로의 오행이 오늘 일진과 어떻게 어우러지는지 풀어드릴게요.`,
    sys:'반드시 한국어로 답변해 주세요.',
    sgTitle:'회원가입',
    sgHeadline:'회원가입하고\n더 섬세한 기운을\n받으세요.',
    sgSub:'한 번 등록하시면 매일 오실 때마다 더 정확하고 섬세한 기운 풀이를 받으실 수 있습니다.',
    sgLink:'✦ 회원가입하고 더 섬세한 기운 받기 →', sgName:'이름', sgEmail:'이메일', sgPhone:'전화번호', sgYear:'생년', sgMonth:'생월', sgDay:'생일',
    sgHour:'생시', sgGender:'성별', sgM:'남성', sgF:'여성', sgOpt:'(선택)', sgRegion:'거주지역',
    sgSubmit:'가입하기',
    sgNotice:'수집된 정보는 기운 풀이 개선 및 맞춤 처방 목적으로만 사용되며 제3자에게 제공되지 않습니다.',
    sgSuccTitle:'가입이 완료되었습니다', sgSuccDesc:'소중한 기운이 기록되었습니다.\n내일 오시면 더욱 섬세한 처방을 받으실 수 있습니다.',
    sgBack:'처음으로 →', sgErr:'저장 중 오류가 발생했습니다. 다시 시도해 주세요.', sgUnknown:'모름', sgOr:'또는 직접 입력',
    g1_auto: (il, u) => `${u.name}님, 다시 오셨네요. ☀️\n오늘은 ${CG[il.ci]}${JJ[il.ji]}(${CG_K[il.ci]}${JJ_K[il.ji]})일이에요 — ${ON.ko[il.o]}의 기운이 흐르고 있어요.\n\n사주 정보가 준비되어 있으니 오늘 기운 흐름이나 궁금한 게 있으시면 편하게 말씀해 주세요.`,
    mpLink:'마이페이지', mpTitle:'마이페이지', mpSection:'생년월일 수정',
    mpDetailSection:'상세 정보 입력',
    mpDetailNotice:'아래 정보를 추가하면 더욱 정밀한 사주 풀이를 받으실 수 있습니다. 모두 선택 사항입니다.',
    mpSave:'저장하기', mpSaved:'저장되었습니다 ✦',
    mpLogout:'로그아웃', mpWithdraw:'회원 탈퇴',
    mpLogoutQ:'다시 누르면 로그아웃됩니다', mpWithdrawQ:'다시 누르면 탈퇴됩니다',
    tkSection:'토큰 충전', tkUnit:'TOKENS',
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
    quickTokenTitle:'토큰 충전', quickTokenDesc:'대화권 충전하기',
    quickSupportTitle:'1대1 상담', quickSupportDesc:'이메일로 문의하기',
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
    sgLink:'✦ Sign up for a more refined reading →', sgName:'Name', sgEmail:'Email', sgPhone:'Phone', sgYear:'Birth Year', sgMonth:'Month', sgDay:'Day',
    sgHour:'Birth Hour', sgGender:'Gender', sgM:'Male', sgF:'Female', sgOpt:'(optional)', sgRegion:'Region',
    sgSubmit:'Sign Up',
    sgNotice:'Your information is used only to refine your readings and will not be shared with any third party.',
    sgSuccTitle:'Welcome', sgSuccDesc:'Your energy has been recorded.\nVisit tomorrow for a more refined prescription.',
    sgBack:'Back to Home →', sgErr:'An error occurred. Please try again.', sgUnknown:'Unknown', sgOr:'or fill in manually',
    g1_auto: (il, u) => `Welcome back, ${u.name}.\nToday is ${CG[il.ci]}${JJ[il.ji]} day — flowing with ${ON.en[il.o]} energy.\n\nYour saved profile is ready.\nFeel free to ask about today's energy or anything on your mind.`,
    mpLink:'My Page', mpTitle:'My Page', mpSection:'Date of Birth',
    mpDetailSection:'Additional Details',
    mpDetailNotice:'Adding the details below allows for a more precise energy reading. All fields are optional.',
    mpSave:'Save Changes', mpSaved:'Saved ✦',
    mpLogout:'Log Out', mpWithdraw:'Delete Account',
    mpLogoutQ:'Tap again to log out', mpWithdrawQ:'Tap again to delete account',
    tkSection:'Top Up Tokens', tkUnit:'TOKENS',
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
    sgLink:'✦ 注册，获取更精准的气运解读 →', sgName:'姓名', sgEmail:'邮箱', sgPhone:'电话', sgYear:'出生年', sgMonth:'出生月', sgDay:'出生日',
    sgHour:'出生时辰', sgGender:'性别', sgM:'男', sgF:'女', sgOpt:'(选填)', sgRegion:'居住地区',
    sgSubmit:'立即注册',
    sgNotice:'您的信息仅用于改善气运解读及提供个性化处方，不会提供给第三方。',
    sgSuccTitle:'注册完成', sgSuccDesc:'您的气运已被记录。\n明日再来，将获得更精准的处方。',
    sgBack:'返回首页 →', sgErr:'保存时出错，请稍后再试。', sgUnknown:'不知道', sgOr:'或手动填写',
    g1_auto: (il, u) => `欢迎回来，${u.name}。\n今日为${CG[il.ci]}${JJ[il.ji]}日，流动着${ON.zh[il.o]}的气运。\n\n您的四柱信息已准备就绪。\n请告诉我今日气运或您想了解的问题。`,
    mpLink:'个人页面', mpTitle:'个人页面', mpSection:'出生日期',
    mpDetailSection:'详细信息',
    mpDetailNotice:'补充以下信息可获得更精准的气运解读，全部为选填项。',
    mpSave:'保存', mpSaved:'已保存 ✦',
    mpLogout:'退出登录', mpWithdraw:'注销账号',
    mpLogoutQ:'再次点击确认退出', mpWithdrawQ:'再次点击确认注销',
    tkSection:'充值代币', tkUnit:'TOKENS',
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
    sgLink:'✦ 会員登録でより精密な気運リーディングを →', sgName:'お名前', sgEmail:'メールアドレス', sgPhone:'電話番号', sgYear:'生年', sgMonth:'生月', sgDay:'生日',
    sgHour:'生時', sgGender:'性別', sgM:'男性', sgF:'女性', sgOpt:'(任意)', sgRegion:'お住まいの地域',
    sgSubmit:'登録する',
    sgNotice:'ご提供いただいた情報は気運リーディング改善及び処方目的のみに使用し、第三者には提供いたしません。',
    sgSuccTitle:'登録完了', sgSuccDesc:'大切な気運が記録されました。\n明日またお越しいただくと、より精密な処方をお届けします。',
    sgBack:'ホームへ →', sgErr:'保存中にエラーが発生しました。もう一度お試しください。', sgUnknown:'不明', sgOr:'または手動で入力',
    g1_auto: (il, u) => `おかえりなさい、${u.name}様。\n今日は${CG[il.ci]}${JJ[il.ji]}日 — ${ON.ja[il.o]}の気運が流れる日です。\n\n登録された情報が準備できています。\n今日の気運やお気になることをお聞かせください。`,
    mpLink:'マイページ', mpTitle:'マイページ', mpSection:'生年月日',
    mpDetailSection:'詳細情報の入力',
    mpDetailNotice:'以下の情報を追加すると、より精密な気運リーディングをお届けします。すべて任意入力です。',
    mpSave:'保存する', mpSaved:'保存しました ✦',
    mpLogout:'ログアウト', mpWithdraw:'退会する',
    mpLogoutQ:'もう一度でログアウト', mpWithdrawQ:'もう一度で退会します',
    tkSection:'トークンチャージ', tkUnit:'TOKENS',
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
  },
};

const DK = {
  ko:{
    木:{icon:'🌱',name:'청몽 채움 에이드',desc:'청포도·매실·민트의 생동감. 목(木) 기운을 깨워 새로운 시작과 성장의 에너지를 북돋웁니다.'},
    火:{icon:'🔥',name:'태양의 안식 티',desc:'히비스커스·자몽·생강의 정화. 화(火) 기운을 다스려 열정 속 고요함을 선사합니다.'},
    土:{icon:'⛰️',name:'대지의 단잠 라떼',desc:'단호박·현미·귀리의 포근함. 토(土) 기운으로 흔들리는 중심을 잡아 안정감을 드립니다.'},
    金:{icon:'💎',name:'순백의 정화 밀크',desc:'코코넛·리치·백련의 투명함. 금(金) 기운으로 흐릿해진 감각을 맑게 정화합니다.'},
    水:{icon:'🌊',name:'심연의 고요 라떼',desc:'흑임자·흑미·아마씨의 깊이. 수(水) 기운으로 지친 몸과 마음에 진정한 휴식을 드립니다.'},
  },
  en:{
    木:{icon:'🌱',name:'Azure Dream Ade',desc:'Green grape, plum & mint. Awakens Wood energy to nurture new beginnings and growth.'},
    火:{icon:'🔥',name:'Solar Repose Tea',desc:'Hibiscus, grapefruit & ginger. Soothes Fire energy to find stillness within passion.'},
    土:{icon:'⛰️',name:"Earth's Slumber Latte",desc:'Pumpkin, brown rice & oat. Grounds Earth energy to restore deep stability.'},
    金:{icon:'💎',name:'Pure Clarity Milk',desc:'Coconut, lychee & lotus. Purifies Metal energy to sharpen and brighten the senses.'},
    水:{icon:'🌊',name:'Deep Stillness Latte',desc:'Black sesame, black rice & flaxseed. Channels Water energy for true rest.'},
  },
  zh:{
    木:{icon:'🌱',name:'青梦补气饮',desc:'青葡萄、梅子与薄荷。唤醒木气，滋养新的开始与成长。'},
    火:{icon:'🔥',name:'太阳安息茶',desc:'木槿、西柚与生姜。调和火气，在热情中寻得内心宁静。'},
    土:{icon:'⛰️',name:'大地安眠拿铁',desc:'南瓜、糙米与燕麦。稳固土气，恢复深层安定感。'},
    金:{icon:'💎',name:'纯白净化奶',desc:'椰子、荔枝与白莲。净化金气，使感官清晰明亮。'},
    水:{icon:'🌊',name:'深渊宁静拿铁',desc:'黑芝麻、黑米与亚麻籽。引导水气，赐予真正的休憩。'},
  },
  ja:{
    木:{icon:'🌱',name:'青夢の満ちるエード',desc:'青葡萄・梅・ミントの生命力。木の気を呼び覚まし、新たな始まりと成長のエネルギーを高めます。'},
    火:{icon:'🔥',name:'太陽の安息ティー',desc:'ハイビスカス・グレープフルーツ・生姜の浄化。火の気を整え、情熱の中に静けさをもたらします。'},
    土:{icon:'⛰️',name:'大地のうたた寝ラテ',desc:'かぼちゃ・玄米・オーツの温もり。土の気で揺れる心の軸を整え、深い安定感をもたらします。'},
    金:{icon:'💎',name:'純白の浄化ミルク',desc:'ココナッツ・ライチ・白蓮の透明感。金の気で曇った感覚を澄み渡らせます。'},
    水:{icon:'🌊',name:'深淵の静寂ラテ',desc:'黒ごま・黒米・アマニの深み。水の気で疲れた身体と心に真の休息をもたらします。'},
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
  // 마이페이지 버튼 텍스트 다국어 갱신
  const userBtn = document.getElementById('userBtn');
  if (userBtn && userBtn.style.display !== 'none') userBtn.textContent = t.mpLink;
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
  mode = m; hist = [];
  document.getElementById('screen-mode').style.display = 'none';
  document.getElementById('screen-chat').style.display = 'flex';
  document.getElementById('backBtn').style.display = 'flex';
  document.getElementById('chat-window').innerHTML = '';
  updateAllTokenDisplays();
  updateUserBtn(user);
  document.getElementById('signupLinkBtn').style.display = 'none';

  // ── 저장된 채팅 복원 ──
  try {
    const savedMode = localStorage.getItem('myan_chat_mode');
    const savedHist = localStorage.getItem('myan_chat_hist');
    const savedHtml = localStorage.getItem('myan_chat_html');
    if (savedMode === m && savedHist && savedHtml) {
      hist = JSON.parse(savedHist);
      document.getElementById('chat-window').innerHTML = savedHtml;
      document.getElementById('newChatBtn').style.display = 'inline-block';
      showNormalInput(); showSuggestChips();
      document.getElementById('chat-window').scrollTop = 99999;
      return; // 복원 완료 → 새 인사 메시지 생략
    }
  } catch(e) {}

  document.getElementById('newChatBtn').style.display = 'none';
  const il = ilchin();

  if (m === 'solo' && user?.birthYear) {
    // 프로필 있는 경우: 구조화 폼 불필요
    // (사주 정보는 첫 send() 시 질문과 결합하여 1개의 turn으로 전송 — Gemini 교대 규칙 준수)
    showNormalInput();
    hideSuggestChips();
    addBubble(TX[lang].g1_auto(il, user), 'ai');
  } else {
    const greet = m === 'solo' ? TX[lang].g1(il) : TX[lang].g2(il);
    addBubble(greet, 'ai');
    // Change 2: solo 모드에서 구조화 폼 표시
    if (m === 'solo') {
      showFirstInputForm();
      hideSuggestChips(); // 사주 입력 폼 활성 중엔 추천 칩 숨김
    } else {
      showNormalInput();
      document.getElementById('inp').focus();
      showSuggestChips();
    }
  }
}

// ── Change 2: 첫 입력 폼 토글 ──
function _buildFifYearOptions() {
  const sel = document.getElementById('fifYear');
  if (!sel || sel.options.length > 1) return;
  sel.innerHTML = '<option value="">년</option>';
  const cur = new Date().getFullYear();
  for (let y = cur; y >= 1920; y--) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y + '년'; sel.appendChild(o);
  }
}
function _buildFifDayOptions() {
  const sel = document.getElementById('fifDay');
  if (!sel || sel.options.length > 1) return;
  sel.innerHTML = '<option value="">일</option>';
  for (let d = 1; d <= 31; d++) {
    const o = document.createElement('option');
    o.value = d; o.textContent = d + '일'; sel.appendChild(o);
  }
}

function showFirstInputForm() {
  _buildFifYearOptions();
  _buildFifDayOptions();
  document.getElementById('firstInputForm').style.display = 'flex';
  document.getElementById('normalInputRow').style.display = 'none';
  document.getElementById('fifName').focus();
}
function showNormalInput() {
  document.getElementById('firstInputForm').style.display = 'none';
  document.getElementById('normalInputRow').style.display = 'flex';
}
function submitFirstForm() {
  const name = document.getElementById('fifName').value.trim();
  const year  = document.getElementById('fifYear').value;
  const month = document.getElementById('fifMonth').value;
  const day   = document.getElementById('fifDay').value;
  const time  = document.getElementById('fifTime').value;
  if (!name)  { document.getElementById('fifName').focus(); return; }
  if (!year)  { document.getElementById('fifYear').focus(); return; }
  if (!month) { document.getElementById('fifMonth').focus(); return; }
  if (!day)   { document.getElementById('fifDay').focus(); return; }
  let msg = `${name}, ${year}년 ${month}월 ${day}일생`;
  if (time) msg += `, ${time}`;
  showNormalInput();
  document.getElementById('inp').value = msg;
  send();
}

// ── Change 4: 추천 칩 토글 ──
function showSuggestChips() {
  const el = document.getElementById('suggestChips');
  if (el) el.style.display = 'flex';
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
  // 첫 번째 user 메시지(프로필)는 항상 보존
  const first = hist[0];
  const rest  = hist.slice(-(MAX_HIST - 1));
  return [first, ...rest];
}
