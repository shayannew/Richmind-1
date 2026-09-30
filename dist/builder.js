(() => {
  const app = document.querySelector('.builder-app');
  if (!app) return;

  /* V108 — parity defaults: the editor used to seed new headings/text with
     smaller sizes than the published renderer assumed (28 vs 40, etc.). These
     are now the canonical defaults for BOTH editor preview and published page,
     so a fresh element looks the same on the canvas and live. */
  const SHARED_DEFAULTS={
    heading:{size:40,weight:800,line:1.15,align:'right'},
    text:{size:18,weight:400,line:1.9,align:'right'}
  };

  const canvas = document.getElementById('canvas');
  const frame = document.getElementById('canvasFrame');
  const inspector = document.getElementById('inspector');
  const layers = document.getElementById('layers');
  const groups = document.getElementById('elementGroups');
  const selectedName = document.getElementById('selectedName');
  const saveStatus = document.getElementById('saveStatus');
  const toast = document.getElementById('toast');
  const labels = {latestElements:'محصولات و مقالات',section:'Section',columns:'Columns',anywhereSection:'Anywhere Section',spacer:'Spacer',divider:'Divider',heading:'Heading',text:'Text',button:'Button',buyButton:'Button',image:'Image',video:'Video',audio:'Audio',logo:'Logo',badge:'Badge',icon:'Icon',scrollPoint:'Scroll Point',quote:'Quote',list:'List',card:'Card',feature:'Feature',rating:'Rating',testimonial:'Testimonial',faq:'FAQ',form:'Form',pricing:'Pricing',stats:'Stats',announcement:'CTA Banner',embed:'Embed',countdown:'Countdown',social:'Social Links',latestProducts:'آخرین محصولات',latestPosts:'آخرین مقاله‌ها',carousel:'Image Carousel',stickyCta:'Sticky CTA',stickyWidget:'Sticky Widget',stickyButton:'Sticky Widget · دکمه',stickySection:'Sticky Widget · سکشن',stickyColumn:'Sticky Widget · ستون',custom:'Custom',marquee:'Marquee',logoCloud:'Logo Cloud',progress:'Progress Bar',comparison:'Before / After',group:'Group',trustBar:'Trust Bar',iconGrid:'Icon Grid',steps:'Steps',timeline:'Timeline',ctaSplit:'CTA Split',buttonGroup:'Button Group',guarantee:'Guarantee',leadMagnet:'Lead Magnet',featureCompare:'Feature Comparison',avatarStack:'Avatar Stack',videoHero:'Video Hero',offerBox:'Offer Box',logoWall:'Logo Wall',caseStudy:'Case Study',popupSection:'Pop Up',mediaMarquee:'Marquee',productShowcase:'Product Showcase',roadmap:'Roadmap',forWho:'برای کیست / نیست',bonusStack:'Bonus Stack',beforeAfter:'Before / After',curriculum:'Curriculum',instructor:'Instructor',upsellBox:'Upsell',offerCard:'Offer Card',countdownOffer:'Countdown Offer',stickyBuyBar:'Sticky Buy Bar',testiMarquee:'Testimonials Marquee',header:'هدر',footer:'فوتر'};

  // NOTE: these two must be declared before normalizeState() is called below —
  // normalizeState() -> normalizeNode() reads both. They are `const`, so calling
  // normalizeState() first threw "Cannot access 'CONTAINER_TYPES' before
  // initialization" (TDZ) whenever state.blocks was non-empty. That was the root
  // cause of the "Builder dead-shell" bug (fixed here, not just papered over by
  // the V89 recovery watchdog).
  const CONTAINER_TYPES = new Set(['section','columns','group','stickySection','stickyColumn','popupSection','anywhereSection']); /* V146 — safe container */
  const REPEATER_TYPES = {
    faq:'items', form:'fields', stats:'items', list:'items', social:'items', carousel:'slides',
    trustBar:'items', iconGrid:'items', steps:'items', timeline:'items', logoCloud:'items', buttonGroup:'buttons', featureCompare:'items', avatarStack:'items', roadmap:'items', forWho:'', bonusStack:'items', curriculum:'modules', instructor:'', mediaMarquee:'items'
  };

  let state = structuredClone(window.INITIAL || {});
  state.blocks = state.blocks || [];
  state.landing = state.landing || {bg:'#FFFFFF',fg:'#101828',accent:'#175CD3',radius:28,backgroundType:'solid',gradient1:'#FFFFFF',gradient2:'#EEF4FF',gradientDir:'135deg',backgroundImage:'',backgroundSize:'cover',backgroundPosition:'center',backgroundRepeat:'no-repeat',backgroundPatternId:'',fullBleed:true,contentMaxWidth:1240,pageGutter:22,overlay:'#000000',overlayOpacity:0,elementGap:10,sectionGap:0,pagePadTop:0,pagePadBottom:0,spacingPreset:'balanced',defaultFontFamily:'system-ui'};
  state.landing={bg:'#FFFFFF',fg:'#101828',accent:'#175CD3',radius:28,backgroundType:'solid',gradient1:'#FFFFFF',gradient2:'#EEF4FF',gradientDir:'135deg',backgroundImage:'',backgroundSize:'cover',backgroundPosition:'center',backgroundRepeat:'no-repeat',backgroundPatternId:'',fullBleed:true,contentMaxWidth:1240,pageGutter:22,overlay:'#000000',overlayOpacity:0,elementGap:10,sectionGap:0,pagePadTop:0,pagePadBottom:0,spacingPreset:'balanced',defaultFontFamily:'system-ui',...state.landing};
  state.landing.defaultFontFamily = state.landing.defaultFontFamily || 'system-ui';
  normalizeState();
  let selectedId = null;
  let selectedIds = new Set();
  let activeTab = 'content';
  let zoom = 1;
  let history = [structuredClone(state)];
  let future = [];
  let saveTimer = null;
  let dragState = null;
  let renderQueued = false;
  let isRenderingCanvas = false;
  let clipboardBlock = null;
  let lastSnapshotToken = null;

  function normalizeNode(node, used=new Set()){
    if(!node || typeof node!=='object') return null;
    if(!node.id || used.has(node.id)) node.id=uid();
    used.add(node.id);
    node.type=node.type||'group';
    /* V114 — Icon Row merged into Icon: any legacy iconRow block silently
       becomes an Icon block with the same icons array (same renderer, same
       design tab). Nothing is lost — the strip renders identically. */
    if(node.type==='iconRow'){ node.type='icon'; if(!Array.isArray(node.icons)||!node.icons.length) node.icons=[{icon:node.icon||'🔥'},{icon:'⭐'},{icon:'⚡'}]; }
    if(node.type==='icon' && Array.isArray(node.icons) && node.icons.length) node.icons=node.icons.map(x=>(x&&typeof x==='object')?x:{icon:String(x||'✦')});
    /* V140 — Icon = list of icon cards (1..N). A classic single icon becomes one card,
       its element link moves onto the card. The renderer still reads old data as-is. */
    if(node.type==='icon') iconEnsureCards(node);
    /* V137 — عنصر «Popup» قدیمی حذف شد. بلوک‌های قدیمی از بین نمی‌روند: به Pop Up جدید
       (یک سکشن شناور) تبدیل می‌شوند و عنوان/متن/دکمه‌شان عنصرهای داخل آن می‌شوند. */
    if(node.type==='popup'){ const old=node; node=Object.assign(defaultBlock('popupSection'),{id:old.id,backgroundColor:old.bg||'#101828',bg:old.bg||'#101828',radius:n(old.radius,24),popupDelay:Math.max(1,Math.min(120,n(old.delay,8)))}); node.blocks=[{...defaultBlock('text'),text:old.title||'',html:'<p><strong>'+esc(old.title||'')+'</strong></p>',size:22,weight:800,color:old.fg||'#FFFFFF',align:'center'},{...defaultBlock('text'),text:old.text||'',html:'<p>'+esc(old.text||'')+'</p>',color:old.fg||'#FFFFFF',align:'center'},{...defaultBlock('button'),label:old.button||'دریافت',url:old.url||'#',linkKind:'custom',bg:old.accent||'#F79009',border:old.accent||'#F79009',align:'center'}]; }
    /* V200 — Spacer داخل Divider ادغام شد: Spacer = Divider با الگوی «بدون خط». */
    if(node.type==='spacer'){ node.type='divider'; node.pattern='none'; node.spaceHeight=Math.max(0,n(node.height,48)); delete node.height; }
    /* V200 — Anywhere Section حذف شد: بلوک‌های قدیمی به یک Section معمولی با همان محتوا تبدیل می‌شوند. */
    if(node.type==='anywhereSection'){ node.type='section'; ['width','height','offsetX','offsetY'].forEach(k=>delete node[k]); if(node.bg&&!node.backgroundColor)node.backgroundColor=node.bg; }
    if(node.blocks && !Array.isArray(node.blocks)) node.blocks=[];
    if(CONTAINER_TYPES.has(node.type) && !Array.isArray(node.blocks)) node.blocks=[];
    if(node.type==='columns'){
      if(!Array.isArray(node.items)) node.items=[];
      const count=Math.max(1,Math.min(6,Number(node.count)||node.items.length||2));
      while(node.items.length<count) node.items.push({id:uid(),width:100/count,blocks:[]});
      if(node.items.length>count) node.items=node.items.slice(0,count);
      node.items.forEach((col)=>{if(!col.id)col.id=uid();if(!Array.isArray(col.blocks))col.blocks=[];});
      normalizeColumnWidths(node,true);
    }
    const arrKey=REPEATER_TYPES[node.type];
    if(arrKey && !Array.isArray(node[arrKey])) node[arrKey]=[];
    const objectRepeaters=new Set(['faq','form','stats','social','carousel','trustBar','iconGrid','steps','timeline','logoCloud','buttonGroup','featureCompare','avatarStack','mediaMarquee']);
    if(arrKey && objectRepeaters.has(node.type)) node[arrKey]=node[arrKey].filter(x=>x!=null).map(x=>typeof x==='object'?x:{});
    if(Array.isArray(node.items)) node.items.forEach((x)=>{if(x && typeof x==='object' && !x.id)x.id=uid();});
    if(Array.isArray(node.slides)) node.slides.forEach((x)=>{if(x && typeof x==='object' && !x.id)x.id=uid();});
    if(Array.isArray(node.blocks)) node.blocks=node.blocks.map(child=>normalizeNode(child,used)).filter(Boolean);
    if(node.type==='columns') node.items.forEach(col=>{col.blocks=col.blocks.map(child=>normalizeNode(child,used)).filter(Boolean);});
    node.align=node.align||'center';
    node.marginTop=n(node.marginTop,0); node.marginRight=n(node.marginRight,0); node.marginBottom=n(node.marginBottom,0); node.marginLeft=n(node.marginLeft,0);
    return node;
  }

  function normalizeState(){
    state.blocks=Array.isArray(state.blocks)?state.blocks.map(b=>normalizeNode(b,new Set())).filter(Boolean):[];
    state.landing=state.landing||{};
    state.landing={bg:'#FFFFFF',fg:'#101828',accent:'#175CD3',radius:28,backgroundType:'solid',gradient1:'#FFFFFF',gradient2:'#EEF4FF',gradientDir:'135deg',backgroundImage:'',backgroundSize:'cover',backgroundPosition:'center',backgroundRepeat:'no-repeat',backgroundPatternId:'',patternColor:'',patternSize:28,patternOpacity:'',patternBase:'',patternCount:3,fullBleed:true,contentMaxWidth:1240,pageGutter:22,overlay:'#000000',overlayOpacity:0,elementGap:10,sectionGap:0,pagePadTop:0,pagePadBottom:0,spacingPreset:'balanced',defaultFontFamily:'system-ui',...state.landing};
    state.landing.defaultFontFamily=state.landing.defaultFontFamily||'system-ui';
    /* V124 — صفحه پیش‌فرض بج ندارد؛ اگر صفحه‌ای از نسخه‌های قبل تیکش را روشن گذاشته بود،
       همان مقدار ذخیره‌شده حفظ می‌شود تا انتشار سایت ناگهان عوض نشود. */
    if(state.showHeroBadge===true) state.showHeroBadge=false;
    if(state.landing.badges===undefined) state.landing.badges=[];
    if(!state.title) state.title='Page';
    /* V147 migration: older records were materialized with these presentation
       toggles on, so merely changing the undefined defaults would not fix an
       already-saved page. Make the new clean-canvas defaults explicit once. */
    if(state._v147CleanCanvasDefaults!==true){
      state.showHeader=false;
      state.showFooter=false;
      state._v147CleanCanvasDefaults=true;
      if(window.BUILDER_KIND==='product'){
        state.showHeroTitle=false;
        state.showHeroDescription=false;
        state.showHeroImage=false;
        state.showBuyCard=false;
        state.stickyBuyCard=false;
        state.mobileBuyBar=false;
      }
    }
    /* V147 — page chrome is opt-in. The old defaults injected a header/footer
       before the first real block, which looked like unexplained top spacing. */
    if(state.showHeader===undefined) state.showHeader=false;
    if(state.showFooter===undefined) state.showFooter=false;
    if(window.BUILDER_KIND==='product'){
      if(state.showHeroTitle===undefined) state.showHeroTitle=false;
      if(state.showHeroDescription===undefined) state.showHeroDescription=false;
      if(state.showHeroImage===undefined) state.showHeroImage=false;
      if(state.showBuyCard===undefined) state.showBuyCard=false;
      if(state.stickyBuyCard===undefined) state.stickyBuyCard=false;
      if(state.mobileBuyBar===undefined) state.mobileBuyBar=false;
    }
  }


  function uid(){ return crypto?.randomUUID ? crypto.randomUUID() : 'b-'+Date.now()+'-'+Math.random().toString(16).slice(2); }
  function esc(v=''){ return String(v).replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m])); }
  function attr(v=''){ return esc(v).replace(/`/g,'&#96;'); }
          function defaultBlock(type){
    const base = {id:uid(),type,align:'center',marginTop:0,marginRight:0,marginBottom:0,marginLeft:0,padX:0,padY:0,padRight:0,padBottom:0,padLeft:0,maxWidth:100,edgeToEdge:false};
    const map = {
      heading:{text:'عنوان جدید',tag:'h2',size:28,weight:800,line:1.2,color:'#101828',letter:0,fontFamily:'system-ui',italic:false,decoration:'none',transform:'none'},
      text:{text:'متن جدید',html:'<p>متن جدید</p>',headingLevel:'',size:15,weight:400,line:1.9,color:'#101828',letter:0,fontFamily:'system-ui',italic:false,decoration:'none',transform:'none'},
      audio:{title:'',url:'',controls:true,autoplay:false,loop:false,bg:'#F8FAFC',borderColor:'#EAECF0',radius:16,padX:16,padY:14,titleSize:15,titleColor:'#101828'},
      button:{label:'دکمه جدید',labelHtml:'',url:'#',variant:'solid',bg:'#175CD3',fg:'#FFFFFF',border:'#175CD3',borderWidth:0,borderStyle:'solid',gradient:false,gradient2:'#7F56D9',gradientDir:'135deg',radius:14,padX:20,padY:16,size:15,weight:800,shadow:'sm',uppercase:false,align:'center',innerPadX:20,innerPadY:16,fullWidth:false},
      buyButton:{label:'همین حالا خرید کن',target:'checkout',url:'#buy',bg:'#175CD3',gradient:true,gradient2:'#7F56D9',gradientDir:'135deg',variant:'solid',fg:'#FFFFFF',border:'#175CD3',borderWidth:0,borderStyle:'solid',radius:14,pill:false,padX:28,padY:17,size:16,weight:800,shadow:'md',uppercase:false,align:'center',showIcon:true,icon:'⚡',fullWidth:false,hoverScale:true,marginTop:18,marginBottom:18,note:'پرداخت امن — فعال‌سازی فوری',noteColor:'#667085',showBadge:false,badgeText:'٪۲۰ تخفیف',badgeBg:'#F79009',subpage:''},
      upsellBox:{eyebrow:'★ پیشنهاد ویژه',title:'ارتقای خرید خودت',subtitle:'این‌ها را هم به سفارش اضافه کن و بیشتر بگیر.',cardBg:'#F8FAFC',itemBg:'#FFFFFF',borderColor:'#EAECF0',accent:'#175CD3',fg:'#101828',fg2:'#FFFFFF',muted:'#667085',bg:'#175CD3',basePrice:'49',btnLabel:'ثبت سفارش',btnSize:16,itemsTitle:'به خرید اضافه کن',saveNote:'تا ۶۰٪ سود',firstRequired:true,items:[{title:'باندل قالب‌های پریمیوم',desc:'۱۰۰+ قالب آماده',price:'19',comparePrice:'39',image:''},{title:'جلسه خصوصی ۱ به ۱',desc:'راهنمایی اختصاصی',price:'79',comparePrice:'149',image:''}],titleSize:24,radius:24,padX:20,padY:26,color:'#101828',align:'center',fontFamily:'system-ui'},
      offerCard:{badge:'٪۵۰ تخفیف',badgeBg:'#F79009',image:'',imageHeight:180,eyebrow:'پیشنهاد محدود',title:'عنوان پیشنهاد',desc:'یک توضیح کوتاه جذاب.',currency:'$',price:'49',comparePrice:'99',priceColor:'',priceSize:30,target:'checkout',url:'#buy',subpage:'',btnLabel:'همین حالا بگیر',btnBg:'',btnFg:'#FFFFFF',btnRadius:14,btnSize:15,bg:'#FFFFFF',itemBg:'#FFFFFF',borderColor:'#EAECF0',accent:'#175CD3',fg:'#101828',muted:'#667085',radius:18,titleSize:22,color:'#101828',align:'center',fontFamily:'system-ui'},
      countdownOffer:{title:'٪۲۰ تخفیف تا پایان',minutes:60,note:'بعد از پایان، قیمت برمی‌گردد',bg:'#101828',fg:'#FFFFFF',digitBg:'#FFFFFF14',digitColor:'#FFFFFF',digitSize:24,ctaLabel:'همین حالا خرید کن',btnBg:'',btnFg:'#FFFFFF',btnRadius:12,btnSize:15,titleSize:18,accent:'#F79009',color:'#FFFFFF',align:'center',fontFamily:'system-ui'},
      stickyBuyBar:{title:'نام محصول',currency:'$',price:'49',comparePrice:'',image:'',target:'checkout',url:'#buy',subpage:'',btnLabel:'خرید',btnBg:'',btnFg:'#FFFFFF',btnRadius:12,btnSize:14,bg:'#FFFFFF',borderColor:'#EAECF0',accent:'#175CD3',fg:'#101828',radius:16,titleSize:14,color:'#101828',align:'right',fontFamily:'system-ui'},
      image:{src:'',alt:'تصویر',caption:'',captionPosition:'bottom',captionSize:14,captionColor:'#475467',width:100,radius:18,objectFit:'cover',shadow:'none',edgeToEdge:false,border:'#00000000',borderWidth:0},
      video:{title:'ویدیو',poster:'',url:'',aspect:'16/9',radius:18,shadow:'none',border:'#00000000',borderWidth:0,controls:true,autoplay:false,muted:true},
      latestProducts:{kicker:'PRODUCTS',title:'آخرین محصولات',description:'محصولات جدید و منتخب را به‌صورت خودکار نمایش بده.',limit:3,sort:'latest',showLink:true,linkText:'همه محصولات ←',cardLinkText:'مشاهده محصول ←',showPrice:true,showExcerpt:true},
      latestPosts:{kicker:'FROM BLOG',title:'آخرین مقاله‌ها',description:'جدیدترین نوشته‌های منتشرشده را خودکار نمایش بده.',limit:3,sort:'latest',showLink:true,linkText:'مشاهده بلاگ ←',cardLinkText:'خواندن مقاله ←',showExcerpt:true},
      rating:{value:5,max:5,label:'5.0',color:'#F79009',icon:'★',emptyIcon:'☆',size:20,gap:2},
      testimonial:{quote:'<p>تجربه فوق‌العاده‌ای بود.</p>',name:'<strong>نام مشتری</strong>',role:'سمت',showAvatar:false,showName:true,showRole:true,showQuote:true,showRating:true,rating:5,maxRating:5,ratingColor:'#F79009',ratingSize:22,ratingGap:2,avatar:'',avatarShape:'circle',avatarSize:48,bg:'#F8FAFC',border:'#EAECF0',radius:18,padding:24,showEmoji:false,emoji:'✨',shadow:'sm'},
      faq:{title:'سوالات متداول',items:[{q:'سوال اول؟',a:'پاسخ سوال اول.'}],openFirst:true},
      form:{title:'با ما در تماس باشید',description:'اطلاعات خودتان را وارد کنید.',action:'',method:'post',submit:'ارسال',successUrl:'',storeSubmissions:false,fields:[{name:'name',label:'نام',type:'text',placeholder:'نام شما',required:true},{name:'email',label:'ایمیل',type:'email',placeholder:'email@example.com',required:true}]},
      embed:{code:'<div style="padding:24px;border:1px solid #EAECF0;border-radius:16px">Embed code</div>',height:220,embedHeightMode:'auto',embedHeight:420},
      divider:{color:'#98A2B3',width:2,style:'solid',margin:28,pattern:'line',edgeToEdge:false,spaceHeight:48},
      custom:{label:'Custom',html:'<div class="box">\n  <h3>Custom element</h3>\n  <p>HTML، CSS و JS خودت را بنویس.</p>\n</div>',css:'.box{padding:24px;border-radius:16px;background:#F8FAFC;border:1px solid #EAECF0;text-align:center}\n.box h3{margin:0 0 6px;font-size:20px}\n.box p{margin:0;color:#667085}',js:''},
      spacer:{height:48},
      stats:{items:[{value:'<strong>95%</strong>',label:'رضایت',icon:'✓',iconUrl:'',iconSize:28,iconBg:'#EEF4FF',iconColor:'#175CD3',valueSize:22,valueWeight:800,valueColor:'#101828',labelSize:12,labelWeight:400,labelColor:'#667085'} ,{value:'<strong>2K+</strong>',label:'دانشجو',icon:'👥',iconUrl:'',iconSize:28,iconBg:'#EEF4FF',iconColor:'#175CD3',valueSize:22,valueWeight:800,valueColor:'#101828',labelSize:12,labelWeight:400,labelColor:'#667085'} ,{value:'<strong>4.9/5</strong>',label:'امتیاز',icon:'★',iconUrl:'',iconSize:28,iconBg:'#FFF7E6',iconColor:'#F79009',valueSize:22,valueWeight:800,valueColor:'#101828',labelSize:12,labelWeight:400,labelColor:'#667085'}],perRow:3,gap:12},
      icon:{icon:'✦',iconUrl:'',url:'',target:'_self',icons:[{icon:'✦',url:'',strokeWidth:1.5}],size:24,box:54,bg:'#EEF4FF',color:'#175CD3',border:'transparent',borderWidth:0,shape:'circle',circle:true,opacity:100,rotate:0,frameMode:'plain'},
      /* V114 — Icon Row merged into Icon: an Icon block with an `icons` array renders as the strip.
         scrollPoint: editor-only anchor — invisible on the published page. */
      scrollPoint:{anchorLabel:'',height:0},
      badge:{text:'جدید',bg:'#EEF4FF',color:'#175CD3',border:'#D1E0FF',radius:999},
      pricing:{kicker:'PRO',title:'Pro',price:'79$',note:'دسترسی کامل',bg:'#101828',fg:'#FFFFFF',radius:22,button:'خرید',buttonBg:'#FFFFFF',buttonColor:'#101828',url:'#'},
      columns:{count:2,gap:18,gapMobile:12,columnInnerGap:0,stackMobile:'stack',valign:'stretch',colBorderWidth:0,colBg:'#FFFFFF',width:100,height:0,pctMobile:true,_v148:true,items:[{id:uid(),width:50,height:null,blocks:[]},{id:uid(),width:50,height:null,blocks:[]}]},
      anywhereSection:{label:'Anywhere Section',width:320,height:180,offsetX:0,offsetY:0,padX:16,padY:16,radius:14,bg:'#FFFFFF',border:'#D0D5DD',borderWidth:1,shadow:'sm',blocks:[]},
      announcement:{text:'پیشنهاد ویژه این هفته',button:'مشاهده',url:'#',bg:'#101828',fg:'#FFFFFF'},
      countdown:{days:3,hours:12,minutes:40,seconds:18,language:'fa',showBoxes:true},
      social:{items:[{name:'Instagram',url:'#',icon:'◎',iconUrl:'',shape:'circle',bg:'#fff',color:'#101828',border:'#EAECF0',borderWidth:1},{name:'YouTube',url:'#',icon:'▶',iconUrl:'',shape:'circle',bg:'#fff',color:'#101828',border:'#EAECF0',borderWidth:1},{name:'Telegram',url:'#',icon:'➤',iconUrl:'',shape:'circle',bg:'#fff',color:'#101828',border:'#EAECF0',borderWidth:1}],perRow:3,perRowMobile:1,gap:10,showOnMobile:true,showOnDesktop:true},
      logo:{text:'RAVA',color:'#175CD3',size:28},
      feature:{title:'یک مزیت مهم',titleHtml:'<p>یک مزیت مهم</p>',text:'توضیح کوتاه',html:'<p>توضیح کوتاه</p>',icon:'✓',icons:[{icon:'✓',iconUrl:'',url:'',target:'_self',color:'#175CD3'}],iconBg:'#FFFFFF00',iconColor:'#175CD3',iconSize:40,box:54,size:24,bg:'',color:'#175CD3',shape:'rounded',opacity:100,rotate:0},
      section:{bg:'#FFFFFF',padX:24,padY:28,radius:20,blocks:[],shadow:'none',backgroundType:'solid',backgroundColor:'#FFFFFF',gradient1:'#FFFFFF',gradient2:'#EEF4FF',gradientDir:'180deg',backgroundImage:'',backgroundVideo:'',overlay:'#000000',overlayOpacity:0,minHeight:0,width:100,maxWidth:100,fullBleed:false,sectionHeight:'auto',height:0,maxHeight:0,border:'#00000000',borderWidth:0,borderStyle:'solid'},
      stickySection:{label:'Sticky section',text:'',position:'bottom',offset:0,bg:'#FFFFFF',fg:'#101828',border:'#EAECF0',borderWidth:1,radius:0,padX:18,padY:14,shadow:'lg',showOnMobile:true,closeable:false,blocks:[]},
      stickyColumn:{label:'Sticky column',position:'top',offset:18,width:100,minHeight:160,bg:'#FFFFFF',fg:'#101828',border:'#EAECF0',borderWidth:1,radius:18,padX:18,padY:18,shadow:'md',showOnMobile:true,blocks:[]},
      carousel:{slides:[{src:'',alt:'Slide 1',caption:''},{src:'',alt:'Slide 2',caption:''}],showArrows:true,showDots:true,radius:18,shadow:'sm',aspect:'16/9',autoplay:false,interval:4},
      /* V138 — Sticky Button: همان دکمهٔ خرید، ثابت در گوشهٔ پایین صفحه (همیشه آخرین بلوک ریشه) */
      stickyButton:{label:'همین حالا خرید کن',target:'checkout',url:'https://',subpage:'',stickyPos:'bottom-right',offsetX:16,offsetY:16,mobileFull:false,bg:'#175CD3',gradient:true,gradient2:'#7F56D9',gradientDir:'135deg',variant:'solid',fg:'#FFFFFF',border:'#175CD3',borderWidth:0,borderStyle:'solid',radius:999,pill:true,padX:24,padY:14,size:15,weight:800,shadow:'lg',uppercase:false,showIcon:true,icon:'⚡',hoverScale:true,showBadge:false,badgeText:'٪۲۰ تخفیف',badgeBg:'#F79009',note:''},
      stickyCta:{label:'همین حالا شروع کن',url:'#',text:'',position:'bottom-right',offsetX:18,offsetY:18,bg:'#175CD3',fg:'#FFFFFF',radius:999,padX:18,padY:12,size:15,weight:800,shadow:'lg',showOnMobile:true},
      /* V137 — Marquee تصویری (عناصر اصلی): نوار بی‌انتهای لوگو/تصویر. speed ۱ تا ۱۰۰ (تندتر = بیشتر) */
      mediaMarquee:{title:'',titleSize:14,titleWeight:700,titleColor:'#667085',titleGap:18,items:[{src:'',alt:'',link:''},{src:'',alt:'',link:''},{src:'',alt:'',link:''},{src:'',alt:'',link:''},{src:'',alt:'',link:''}],speed:40,direction:'rtl',pauseOnHover:true,logoHeight:48,mobileLogoHeight:36,gap:56,itemOpacity:100,grayscale:false,itemRadius:0,fadeEdges:true,fadeWidth:8,bg:'#00000000',bandPadY:0,radius:0,marqueeBackground:''},
      /* V137 — Pop Up (عناصر دیگر): کپی Section + تنظیمات پنجرهٔ شناور. همیشه پایین‌ترین بخش صفحه است */
      popupSection:{label:'Pop Up',bg:'#FFFFFF',padX:28,padY:32,radius:20,shadow:'xl',backgroundType:'solid',backgroundColor:'#FFFFFF',gradient1:'#FFFFFF',gradient2:'#EEF4FF',gradientDir:'180deg',backgroundImage:'',backgroundVideo:'',overlay:'#000000',overlayOpacity:0,minHeight:0,width:100,maxWidth:100,fullBleed:false,sectionHeight:'auto',height:0,innerMaxWidth:1200,innerGap:12,border:'#00000000',borderWidth:0,borderStyle:'solid',popupDelay:5,popupFrequency:'always',popupWidth:560,popupPosition:'center',backdropColor:'#0B1220',backdropOpacity:60,closeOnBackdrop:true,showClose:true,closeBg:'#FFFFFF',closeColor:'#101828',lockScroll:true,blocks:[
        {id:uid(),type:'text',text:'یک پیشنهاد ویژه برای شما 🎁',html:'<p><strong>یک پیشنهاد ویژه برای شما 🎁</strong></p>',headingLevel:'',size:26,weight:800,line:1.5,color:'#101828',align:'center',marginTop:0,marginRight:0,marginBottom:0,marginLeft:0,maxWidth:100},
        {id:uid(),type:'text',text:'ایمیلت را بگذار تا کد تخفیف برایت ارسال شود.',html:'<p>ایمیلت را بگذار تا کد تخفیف برایت ارسال شود.</p>',headingLevel:'',size:15,weight:400,line:1.9,color:'#475467',align:'center',marginTop:0,marginRight:0,marginBottom:0,marginLeft:0,maxWidth:100},
        {id:uid(),type:'button',label:'دریافت کد تخفیف',labelHtml:'',url:'#',linkKind:'none',variant:'solid',bg:'#175CD3',fg:'#FFFFFF',border:'#175CD3',borderWidth:0,borderStyle:'solid',radius:14,padX:22,padY:14,size:15,weight:800,shadow:'sm',align:'center',marginTop:0,marginRight:0,marginBottom:0,marginLeft:0,maxWidth:100}
      ]},
      marquee:{text:'خبر ویژه • تخفیف • شروع دوره',speed:18,color:'#101828',bg:'#FFFFFF',size:16},
      logoCloud:{items:[{url:'',alt:'Logo',link:'',size:72}],perRow:4,gap:14,align:'center'},
      progress:{label:'پیشرفت',value:70,bar:'#175CD3',track:'#EEF2F6',height:10,radius:999,labelSize:14},
      comparison:{before:'',after:'',height:360,start:50,radius:18},
      group:{label:'Group',blocks:[],align:'center',maxWidth:100,marginTop:0,marginRight:0,marginBottom:0,marginLeft:0,padX:0,padY:0,bg:'transparent',radius:0,shadow:'none'},
      trustBar:{items:[{icon:'✓',title:'امن و مطمئن',text:'خرید امن'},{icon:'⚡',title:'دسترسی سریع',text:'فوری'},{icon:'★',title:'امتیاز بالا',text:'رضایت کاربران'}],perRow:3,gap:14,iconSize:24,iconColor:'#175CD3',iconBg:'#EEF4FF',titleSize:15,titleWeight:800,textSize:12,textColor:'#667085'},
      iconGrid:{title:'مزایا',items:[{icon:'✓',title:'ویژگی اول',text:'توضیح کوتاه'},{icon:'✦',title:'ویژگی دوم',text:'توضیح کوتاه'},{icon:'⚡',title:'ویژگی سوم',text:'توضیح کوتاه'}],perRow:3,gap:18,iconSize:24,iconBg:'#EEF4FF',iconColor:'#175CD3',titleSize:16,textSize:13},
      steps:{items:[{number:'01',title:'شروع',text:'اول این کار را انجام بده.'},{number:'02',title:'ادامه',text:'مرحله بعدی را انجام بده.'},{number:'03',title:'نتیجه',text:'به نتیجه برس.'}],perRow:3,gap:22,numberBg:'#175CD3',numberColor:'#fff',titleSize:17,textSize:13},
      timeline:{items:[{title:'مرحله اول',text:'توضیح مرحله اول'},{title:'مرحله دوم',text:'توضیح مرحله دوم'},{title:'مرحله سوم',text:'توضیح مرحله سوم'}],line:'#D0D5DD',dot:'#175CD3',bg:'#FFFFFF',itemBg:'#FFFFFF',titleColor:'#101828',textColor:'#667085',titleSize:16,titleWeight:800,textSize:13,textWeight:400,radioSize:12,lineWidth:2,itemRadius:14,itemPadding:16,gap:18},
      ctaSplit:{title:'آماده شروعی؟',text:'یک توضیح کوتاه برای CTA',button:'شروع کنید',url:'#',image:'',bg:'#101828',fg:'#fff',accent:'#175CD3',radius:24,pad:28},
      videoHero:{kicker:'VIDEO',title:'با ویدیو معرفی کن',text:'یک ویدیوی کوتاه که ارزش پیشنهاد را در ۳۰ ثانیه نشان می‌دهد.',videoUrl:'',poster:'',cta:'شروع کن',ctaUrl:'#',bg:'#101828',fg:'#FFFFFF',accent:'#175CD3',radius:28,padY:44,padX:28,aspect:'16/9'},
      offerBox:{kicker:'پیشنهاد ویژه',title:'پکیج کامل + بونوس‌ها',oldPrice:'۱۹۹$',price:'۱۴۹$',note:'تا پایان هفته — ۳ جای باقی مانده',items:['دسترسی کامل به همه درس‌ها','بونوس: فایل‌های تمرین','پشتیبانی مستقیم'],cta:'همین حالا بگیر',ctaUrl:'#',bg:'#FFFFFF',fg:'#101828',accent:'#F79009',badge:'٪۲۵ تخفیف',badgeBg:'#F79009',badgeColor:'#fff',radius:24,padY:26,padX:26,shadow:'lg',border:'#FEE4C2',borderWidth:2},
      logoWall:{title:'مورد اعتماد این شرکت‌ها',items:[{text:'Company 1'},{text:'Company 2'},{text:'Company 3'},{text:'Company 4'}],color:'#98A2B3',size:17,gap:16,opacity:80,align:'center'},
      caseStudy:{kicker:'CASE STUDY',title:'چطور ۳ برابر فروش گرفتیم؟',text:'شرح کوتاه داستان موفقیت مشتری و نتیجه‌ای که گرفت.',image:'',metrics:[{value:'۳×',label:'رشد فروش'},{value:'۹۰ روز',label:'بازه زمانی'},{value:'۲۴۰٪',label:'بازگشت سرمایه'}],cta:'مطالعه کامل',ctaUrl:'#',bg:'#F8FAFC',fg:'#101828',accent:'#175CD3',radius:24,padY:28,padX:28,metricColor:'#175CD3'},
      productShowcase:{title:'محصول را از نزدیک ببین',images:[{src:'',alt:'نمای اول'},{src:'',alt:'نمای دوم'}],perRow:3,gap:14,radius:18,shadow:'sm',showCta:true,cta:'مشاهده و خرید',ctaUrl:'#',bg:'#FFFFFF',border:'#EAECF0',padY:24,padX:20},
      buttonGroup:{buttons:[{label:'شروع کنید',url:'#',variant:'solid',bg:'#175CD3',fg:'#fff'},{label:'بیشتر بدان',url:'#',variant:'outline',bg:'transparent',fg:'#175CD3'}],gap:10,align:'center',wrap:true},
      guarantee:{kicker:'GUARANTEE',title:'با خیال راحت شروع کن',text:'اگر این پیشنهاد مناسب تو نبود، مسیر بازگشت مشخصی داری.',icon:'✓',iconBg:'#ECFDF3',iconColor:'#067647',bg:'#F8FAFC',border:'#D0D5DD',radius:20,padding:24},
      leadMagnet:{kicker:'رایگان',title:'راهنمای رایگان را بگیر',text:'ایمیلت را وارد کن تا فایل رایگان برایت ارسال شود.',button:'دریافت رایگان',url:'#',bg:'#EEF4FF',accent:'#175CD3',fg:'#101828',radius:20,padding:24},
      featureCompare:{title:'مقایسه امکانات',columns:['پلن پایه','پلن حرفه‌ای'],items:[{label:'دسترسی کامل',values:['✓','✓']},{label:'پشتیبانی',values:['—','✓']},{label:'به‌روزرسانی',values:['—','✓']}],bg:'#FFFFFF',border:'#EAECF0',radius:18,headerBg:'#F8FAFC',accent:'#175CD3',padding:0},
      avatarStack:{items:[{src:'',alt:'',name:'کاربر ۱'},{src:'',alt:'',name:'کاربر ۲'},{src:'',alt:'',name:'کاربر ۳'}],max:5,size:42,border:'#FFFFFF',overlap:12,showNames:false,caption:'بیش از ۲۰۰۰ کاربر'},
      roadmap:{title:'',items:[{icon:'🎯',title:'تعیین هدف',text:'اول هدف نهایی را مشخص کن.',status:'done',tag:'انجام شد',meta:'هفته ۱'},{icon:'🚀',title:'شروع مسیر',text:'اولین قدم عملی را بردار.',status:'current',tag:'در حال انجام',meta:'همین هفته'},{icon:'🏆',title:'رسیدن به نتیجه',text:'به هدف نهایی می‌رسی.',status:'next',tag:'پیش رو',meta:'هفته ۴'}],gap:16,itemBg:'#FFFFFF',line:'#EAECF0',accent:'#175CD3',titleColor:'#101828',textColor:'#475467',titleSize:16,titleWeight:800,textSize:14,itemRadius:16,itemPadding:16,iconSize:18},
      testiMarquee:{mode:'auto',variant:'testi',items:[{quote:'کیفیت دوره واقعاً بالاتر از انتظارم بود.',name:'سارا محمدی',role:'دانشجوی دوره',avatar:''},{quote:'بعد از دو هفته اولین نتیجه را گرفتم.',name:'امیر رضایی',role:'کارآفرین',avatar:''},{quote:'پشتیبانی و مسیر یادگیری عالی بود.',name:'نگار کریمی',role:'فریلنسر',avatar:''}],speed:26,gap:16,cardWidth:300,radius:18,cardPad:18,cardBg:'#FFFFFF',cardBorder:'#EAECF0',textSize:14,textColor:'#344054',nameSize:14,titleColor:'#101828',roleColor:'#667085',stars:5,starColor:'#F79009',showStars:true,direction:'rtl',pauseOnHover:true},
      forWho:{yesTitle:'این دوره برای توست اگر…',yesItems:['می‌خواهی سریع نتیجه بگیری','آماده تمرین عملی هستی'],noTitle:'برای تو نیست اگر…',noItems:['دنبال راه میان‌بر بدون کار هستی'],yesBg:'#F0FDF4',yesBorder:'#ABEFC6',yesIconBg:'#DCFAE6',yesColor:'#067647',noBg:'#FEF3F2',noBorder:'#FECDCA',noIconBg:'#FEE4E2',noColor:'#B42318',titleColor:'#101828',textColor:'#475467',titleSize:17,textSize:14,radius:20,padding:22,gap:16},
      bonusStack:{kicker:'فقط تا پایان هفته',title:'ثبت‌نام امروز، این بونوس‌ها رایگان',items:[{icon:'🎁',title:'فایل‌های تمرین',text:'همه قالب‌های آماده',value:'۹۷'},{icon:'🎥',title:'جلسه پرسش‌وپاسخ زنده',text:'با مدرس دوره',value:'۱۵۰'}],showTotal:true,cta:'همین حالا ثبت‌نام کن',ctaUrl:'#',bg:'#FFFFFF',border:'#EAAA08',itemBg:'#FFFCF5',itemBorder:'#FEDF89',accent:'#B54708',titleColor:'#101828',textColor:'#101828',textSize:15,titleSize:22,gap:12,radius:24,padY:26,padX:24},
      beforeAfter:{beforeLabel:'قبل',beforeText:'وضعیت فعلی مخاطب را اینجا بنویس.',afterLabel:'بعد',afterText:'وضعیت مطلوب بعد از محصول را توصیف کن.',note:'',beforeBg:'#FEF3F2',beforeBorder:'#FECDCA',beforeColor:'#B42318',afterBg:'#F0FDF4',afterBorder:'#ABEFC6',afterColor:'#067647',textColor:'#475467',textSize:14,gap:14,radius:18,padding:20},
      curriculum:{title:'سرفصل‌های دوره',modules:[{title:'شروع و پایه‌ها',meta:'۴ درس',lessons:['معرفی دوره','ابزارهای لازم','اولین پروژه','تکلیف هفته']},{title:'بحث‌های اصلی',meta:'۳ درس',lessons:['تکنیک‌های پیشرفته','نمونه‌کار واقعی','بازخورد'],locked:true}],openFirst:true,bg:'#FFFFFF',border:'#EAECF0',moduleBg:'#F8FAFC',moduleBorder:'#EAECF0',accent:'#175CD3',titleColor:'#101828',textColor:'#101828',textSize:15,titleSize:20,gap:10,radius:22,padY:22,padX:20},
      instructor:{name:'نام مدرس',role:'متخصص و مدرس دوره',bio:'معرفی کوتاه مدرس: تجربه، سوابق و اینکه چرا برای تدریس این موضوع مناسب است.',creds:['۱۰+ سال تجربه','۱٬۲۰۰+ دانشجو','مشاور برندها'],kicker:'مدرس دوره',avatar:'',bg:'#F8FAFC',border:'#EAECF0',accent:'#175CD3',titleColor:'#101828',textColor:'#475467',textSize:14,nameSize:20,radius:24,padY:26,padX:24},
      /* V133 — هدر و فوتر سایت؛ جای‌گذاری در رندر، بالای/پایین صفحه است نه جریان بلاک‌ها */
      header:{enabled:true,layout:'logo-start',logoType:'text',logoText:'RAVA',logoUrl:'',logoSize:22,headerHeight:64,bgMode:'solid',bg:'#FFFFFF',bgOpacity:100,blur:10,fg:'#101828',linkColor:'#101828',linkHoverColor:'#175CD3',linkActiveColor:'#175CD3',linkSize:14,linkWeight:600,gap:26,padX:24,padY:12,innerPadY:12,ctaEnabled:true,ctaLabel:'Start',ctaUrl:'#buy',ctaBg:'#175CD3',ctaFg:'#FFFFFF',ctaRadius:12,searchEnabled:false,cartEnabled:false,langEnabled:false,langLabel:'EN',mobileMenu:'drawer',stickyMode:'normal',scrollShrink:false,glassOnScroll:false,offsetTop:0,zIndex:50,hideDesktop:false,hideTablet:false,hideMobile:false,items:[],nav:[{id:'n1',label:'Home',icon:'',url:'#'},{id:'n2',label:'Products',icon:'',url:'/products'},{id:'n3',label:'Contact',icon:'',url:'#'}]},
      footer:{enabled:true,brandName:'RAVA',brandDesc:'Short brand description',logoUrl:'',footerHeight:'auto',bgMode:'solid',bgType:'solid',bg:'#101828',bg2:'#1E293B',bgGradient2:'#1E293B',bgGradientDir:'180deg',bgImage:'',bgPatternId:'',patternColor:'',patternSize:28,patternOpacity:'',fg:'#E2E8F0',linkColor:'#CBD5E1',linkHoverColor:'#FFFFFF',mutedColor:'#94A3B8',columns:3,colsLayout:'auto',divider:true,dividerColor:'#334155',copyright:'© {year} RAVA — All rights reserved.',newsletterEnabled:false,newsletterLabel:'Join the newsletter',newsletterPlaceholder:'Your email',newsletterButton:'Subscribe',socialEnabled:true,socials:[{id:'s1',label:'Instagram',icon:'instagram',url:'#'},{id:'s2',label:'Telegram',icon:'telegram',url:'#'}],groups:[{id:'g1',title:'Products',links:[{id:'l1',label:'All products',url:'/products'},{id:'l2',label:'Latest',url:'#'}]},{id:'g2',title:'Company',links:[{id:'l3',label:'About us',url:'/about'},{id:'l4',label:'Contact',url:'#'}]}],bottomLinks:[{id:'b1',label:'Privacy',url:'#'},{id:'b2',label:'Terms',url:'#'}],footerAccordionMobile:true,padX:24,padY:32,innerPadY:32,hideDesktop:false,hideTablet:false,hideMobile:false},
    };
    /* V132 — پیش‌فرض‌های انیمیشن برای همهٔ عناصر، بعد از merge نوع‌خاص تا بازنویسی نشوند */
    return {animationType:'none',animationDuration:1,animationIntensity:'normal',animationDelay:0,animationThreshold:'normal',animationReplayable:true,...base,...(map[type]||{})};
  }

  function allEntries(list=state.blocks, parent=null, path=[]){
    const out=[];
    list.forEach((b,index)=>{
      out.push({b,parent,index,path:[...path,index],container:list});
      if (Array.isArray(b.blocks)) out.push(...allEntries(b.blocks,b,[...path,index]));
      if (b.type==='columns' && Array.isArray(b.items)) b.items.forEach((col,ci)=>{
        if(!Array.isArray(col.blocks)) col.blocks=[];
        out.push(...allEntries(col.blocks,b,[...path,index,'columns',ci]));
      });
    });
    return out;
  }
  function find(id){ return allEntries().find(x=>x.b.id===id); }
  function getContainer(entry){ return entry?.container || state.blocks; }
  function snapshot(){ history.push(structuredClone(state)); if(history.length>50) history.shift(); future=[]; scheduleSave(); }
  function saveChip(state){ if(saveStatus){ saveStatus.dataset.state=state; } }
  function scheduleSave(){ saveStatus.textContent='تغییر ذخیره‌نشده'; saveChip('dirty'); window.__RAVA_BUILDER_DIRTY__=true; window.__RAVA_BUILDER_SAVE_STATE__='dirty'; clearTimeout(saveTimer); saveTimer=setTimeout(save,1400); }
  function restore(obj){ state=structuredClone(obj); normalizeState(); if(selectedId && !find(selectedId)) selectedId=null; renderAll(); }
  function undo(){
    /* V122.1 — دو الگوی رایج هر دو باید با اولین Ctrl+Z جواب بدهند:
       (الف) snapshot بعد از تغییر: بالای پشته با state یکی است → همان را دور بریز و از پلهٔ قبل بازیابی کن؛
       (ب) snapshot قبل از تغییر: بالای پشته قبلی است → همان الگوی کلاسیک pop/restore.
       نسخهٔ قبلی بعد از دور ریختنِ عضو یکسان، به‌خاطر length<=1 بی‌کار برمی‌گشت
       (یا در پشتهٔ ۳ عضوی دو قدم به عقب می‌پرید). */
    if(!history.length)return;
    try{
      if(JSON.stringify(history[history.length-1])===JSON.stringify(state)){
        history.pop();
        if(!history.length){ history=[structuredClone(state)]; return; }
        future.unshift(structuredClone(state));
        restore(history[history.length-1]);
        return;
      }
    }catch(_){}
    if(history.length<=1)return;
    future.unshift(structuredClone(state));
    restore(history[history.length-1]);
    history.pop();
  }
  function redo(){
    if(!future.length)return;
    const next=future.shift();
    history.push(structuredClone(next));
    restore(next);
  }

  function surfaceStyle(b){
    const bgType=b.backgroundType || (b.gradient ? 'gradient' : 'solid');
    let background=b.bg || '#FFFFFF';
    if(bgType==='gradient') background=`linear-gradient(${b.gradientDir||'135deg'},${b.gradient1||b.bg||'#FFFFFF'},${b.gradient2||'#EEF4FF'})`;
    if(bgType==='image' && b.backgroundImage){ const pos=b.backgroundPosition||'center'; const size=b.backgroundSize||'cover'; const rep=b.backgroundRepeat||'no-repeat'; background=`url("${attr(b.backgroundImage)}") ${pos} / ${size} ${rep}`; }
    if(bgType==='solid') background=(b.backgroundColor ?? b.bg ?? '#FFFFFF');
    if(bgType==='radial') background=`radial-gradient(circle at ${b.gradientPosition||'30% 20%'}, ${b.gradient1||'#EEF4FF'}, ${b.gradient2||'#FFFFFF'} 65%)`;
    if(bgType==='blob') background=`radial-gradient(circle at 15% 20%, ${b.gradient1||'#EEF4FF'} 0 25%, transparent 26%),radial-gradient(circle at 88% 10%, ${b.gradient2||'#D1E9FF'} 0 22%, transparent 23%),${b.backgroundColor||b.bg||'#FFFFFF'}`;
    return background;
  }
  function n(v,d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
    function richField(label,key,value,extra=''){
    const id='rf_'+Math.random().toString(36).slice(2,9);
    /* V122 — فونت کامل + اندازهٔ دلخواه px اینجا هم مثل ویرایشگر اصلی */
    return `<div class="rich-field rte2 rte2-nested" data-rich-wrap="${id}"><div class="field-head"><label>${esc(label)}</label><span class="rich-state" data-rich-state="${id}">ویرایشگر متن</span></div><div class="rich-toolbar rte2-bar rich-toolbar--pro" data-rich-toolbar="${id}">
      <button type="button" class="rte2-btn" data-rich-cmd="bold" data-rich-id="${id}" title="Bold"><b>B</b></button>
      <button type="button" class="rte2-btn" data-rich-cmd="italic" data-rich-id="${id}" title="Italic"><i>I</i></button>
      <button type="button" class="rte2-btn" data-rich-cmd="underline" data-rich-id="${id}" title="Underline"><u>U</u></button>
      <button type="button" class="rte2-btn" data-rich-cmd="strikeThrough" data-rich-id="${id}" title="Strikethrough"><s>S</s></button>
      <button type="button" data-rich-cmd="subscript" data-rich-id="${id}" title="Subscript">x<sub>2</sub></button>
      <button type="button" data-rich-cmd="superscript" data-rich-id="${id}" title="Superscript">x<sup>2</sup></button>
      <select class="rte2-select rich-select" data-rich-font="${id}" title="فونت">${fontOptionsHtml('')}</select>
      <input type="number" class="rte2-select rich-select rich-select--size" data-rich-px="${id}" min="6" max="300" step="1" value="16" title="اندازه (px) — Enter = اعمال">
      <label class="rich-color rich-color--compact" title="رنگ متن">A<input type="color" data-rich-color="${id}" value="#101828"></label>
      <label class="rich-color rich-color--compact rich-color--bg" title="هایلایت">▰<input type="color" data-rich-highlight="${id}" value="#FFF2A8"></label>
      <button type="button" class="rte2-btn" data-rich-cmd="justifyLeft" data-rich-id="${id}" title="چپ">L</button>
      <button type="button" class="rte2-btn" data-rich-cmd="justifyCenter" data-rich-id="${id}" title="وسط">C</button>
      <button type="button" class="rte2-btn" data-rich-cmd="justifyRight" data-rich-id="${id}" title="راست">R</button>
      <button type="button" class="rte2-btn" data-rich-cmd="createLink" data-rich-id="${id}" title="لینک">🔗</button>
      <button type="button" class="rte2-btn" data-rich-cmd="removeFormat" data-rich-id="${id}" title="پاک کردن فرمت">Tx</button>
    </div><div class="rich-editor rich-editor--small" contenteditable="true" spellcheck="true" data-rich-id="${id}" data-rich-path="${attr(key)}">${value||''}</div>${extra}</div>`;
  }

  function readArrayValue(path, fallback=''){ const f=find(selectedId)?.b; if(!f)return fallback; const m=path.match(/^([^.]*)\.(\d+)\.(.+)$/); if(m&&Array.isArray(f[m[1]])&&f[m[1]][Number(m[2])]) return f[m[1]][Number(m[2])][m[3]]??fallback; return fallback; }
  function canvasPadX(){ const cs=getComputedStyle(canvas); return Math.max(0,parseFloat(cs.paddingLeft)||0); }
        function renderCanvas(){
    if(isRenderingCanvas) return;
    isRenderingCanvas=true;
    const scroll=document.querySelector('.stage-scroll');
    const prevTop=scroll?.scrollTop||0, prevLeft=scroll?.scrollLeft||0;
    // V91: every re-render used to force the frame back to 390px / 980px, which
    // silently killed the tablet preset and any custom viewport. Widths now come
    // from the active device class, and #canvas is a query container so the
    // preview really reflows like the target device instead of following the
    // browser window.
    const deviceWidths = { mobile:'390px', tablet:'820px', desktop:'min(1200px, 100%)', preview:'min(1200px, 100%)' };
    const activeDevice = ['mobile','tablet','desktop','preview'].find(d=>frame.classList.contains(d)) || 'desktop';
    if(!frame.classList.contains('v64-custom-viewport')) frame.style.width = deviceWidths[activeDevice];
    frame.dataset.device = activeDevice;
    applyCanvasBackground();
    /* V147 — the canvas mirrors the published page box model: same text
       direction as the live site, the page gutter published as --rv-pl/--rv-pr
       (Edge-to-edge children escape it), --rv-cq-extra lets Full bleed reach
       the real screen edges, and --rv-root-gap is the page element gap. */
    try{
      canvas.setAttribute('dir',(window.BUILDER_SITE_DIR==='rtl')?'rtl':'ltr');
      const gut=Math.max(0,n((state.landing||{}).pageGutter,22));
      frame.style.setProperty('--page-gutter',gut+'px');
      canvas.style.setProperty('--rv-pl',gut+'px'); canvas.style.setProperty('--rv-pr',gut+'px');
      canvas.style.setProperty('--rv-cq-extra',(gut*2)+'px');
      canvas.style.setProperty('--rv-root-gap',Math.max(0,n((state.landing||{}).elementGap,10))+'px');
    }catch(_){}
    const temp=document.createElement('div');
    temp.className='canvas-buffer';
    try{
      if(frame.classList.contains('preview')){
        const l=state.landing||{};
        const heroParts=[];
        /* V124 — تیک‌های کارت «صفحه» (عنوان/توضیح/تصویر هرو) در همهٔ حالت‌های نمایش
           (موبایل، تبلت، دسکتاپ، پیش‌نمایش) واقعاً اعمال می‌شوند؛ بج هم دیگر پیش‌فرض نیست. */
        if(state.showHeroTitle===true) heroParts.push(`<h1 style="font-size:clamp(34px,7vw,64px);line-height:1.12;margin:16px 0 10px;color:${esc(l.fg||'#101828')}">${esc(state.hero||state.title||'عنوان صفحه')}</h1>`);
        if(state.showHeroDescription===true && state.excerpt) heroParts.push(`<p style="font-size:18px;line-height:1.85;color:${esc(l.fg||'#475467')};max-width:760px;margin:0 auto">${esc(state.excerpt)}</p>`);
        if(state.showHeroImage===true && state.heroImage) heroParts.push(`<img src="${attr(state.heroImage)}" alt="" style="display:block;max-width:100%;width:100%;height:auto;border-radius:18px;margin:20px auto 0;object-fit:cover" loading="lazy">`);
        const intro=heroParts.length?`<section style="padding:18px 0 34px;text-align:center">${heroParts.join('')}</section>`:'';
        const inner=`<div class="in-editor-preview" style="box-sizing:border-box;width:100%;padding:0 0 120px;overflow:hidden">${intro}${renderPublicBlocks((state.blocks||[]).filter(b=>b&&b.type!=='popupSection'&&b.type!=='stickyButton'),{left:0,right:0})}</div>`;
        /* V133 — هدر/فوتر عنصری: همیشه اول/آخر پیش‌نمایش رندر می‌شوند؛ کروم ساختگی
           (preview-header) فقط وقتی نمایش داده می‌شود که هیچ عنصر هدری در صفحه نباشد. */
        const shellFirst=renderPublicBlocks((state.blocks||[]).filter(b=>b&&b.type==='header'));
        const shellLast=renderPublicBlocks((state.blocks||[]).filter(b=>b&&b.type==='footer'));
        const fakeHeader=state.showHeader===true?'<header class="preview-header"><div class="preview-brand">RAVA</div><nav><a href="#">Home</a><a href="#">Products</a><a href="#">Blog</a></nav></header>':'';
        const fakeFooter=state.showFooter===true?'<footer style="padding:28px 18px;border-top:1px solid #EAECF0;color:#667085;text-align:center">© RAVA</footer>':'';
        const popLast=renderPublicBlocks((state.blocks||[]).filter(b=>b&&b.type==='popupSection'));
        const stickyLast=(state.blocks||[]).filter(b=>b&&b.type==='stickyButton').map(stickyButtonPreviewHtml).join(''); /* V138 — Sticky Button پایین‌ترین بخش پیش‌نمایش، چسبیده به پایین */
        temp.innerHTML=`${shellFirst||fakeHeader}${inner}${shellLast||fakeFooter}${popLast?`<div style="padding:0 18px 40px">${popLast}</div>`:''}${stickyLast}`;      }else{
        /* V115.1 — hero chrome (برند، بج، عنوان، SITE HEADER/FOOTER) فقط حالت «نمایش»
           معنا دارد؛ روی بوم ویرایش، دکمه/بج/عنوان کار می‌ساز خود عنصر است و هدر
           ساختگی فقط جای المان‌ها را می‌گیرد. + بوم بدون درهم‌ریختگی رندر می‌شود. */
    /* V116 — edit canvas has no fake chrome; elements start directly */

        /* V133 — هدر/فوتر عنصری روی بوم ویرایش همیشه اول/آخر بوم رندر می‌شوند
           (جای‌گذاری واقعی سایت)، حتی اگر وسط لیست بلاک‌ها باشند؛ بقیهٔ عناصر
           به ترتیب خودشان می‌مانند. */
        const orderedBlocks=[];
        (state.blocks||[]).forEach(b=>{ if(b&&b.type==='header')orderedBlocks.push(b); });
        (state.blocks||[]).forEach(b=>{ if(!b||b.type==='header'||b.type==='footer'||b.type==='popupSection'||b.type==='stickyButton')return; orderedBlocks.push(b); });
        (state.blocks||[]).forEach(b=>{ if(b&&b.type==='footer')orderedBlocks.push(b); });
        (state.blocks||[]).forEach(b=>{ if(b&&b.type==='popupSection')orderedBlocks.push(b); }); /* V137 — Pop Up پایین‌ترین بخش */
        (state.blocks||[]).forEach(b=>{ if(b&&b.type==='stickyButton')orderedBlocks.push(b); }); /* V138 — Sticky Button زیر همه، حتی Pop Up */
        /* Empty pages stay visually empty. The editor affordance belongs to the
           sidebar, never inside the document flow used for the live page. */
        /* V147 — drop strips live INSIDE each node (absolute), so the canvas flow
           contains exactly the same boxes as the published page. */
        orderedBlocks.forEach(b=>{temp.appendChild(nodeEl(b,{left:canvasPadX(),right:canvasPadX()}));});
      }
      canvas.replaceChildren(...Array.from(temp.childNodes));
      canvas.classList.toggle('is-preview',frame.classList.contains('preview'));
    }catch(err){
      console.error('Builder canvas render failed',err);
      temp.innerHTML='<div class="builder-render-error"><strong>ادیتور این صفحه نتوانست کامل رندر شود.</strong><span>عنصر مشکل‌دار را از Layers انتخاب کن یا آن را حذف/اصلاح کن.</span></div>';
      canvas.replaceChildren(...Array.from(temp.childNodes));
    }
    syncSelectionClasses();
    requestAnimationFrame(()=>{ if(scroll){scroll.scrollTop=prevTop;scroll.scrollLeft=prevLeft;} });
    isRenderingCanvas=false;
  }
  function applyCanvasBackground(){
    const l=state.landing||{};
    /* V130 — بوم از همان پشتهٔ پس‌زمینهٔ صفحهٔ منتشرشده استفاده می‌کند:
       [روکا؟] + [لایهٔ طرح؟] + رنگ/گرادیان/تصویر — هر لایه با longhand واقعی ست
       می‌شود (رشتهٔ longhand را نمی‌توان به shorthand background داد؛ کل رشته رد می‌شد). */
    const s=landingSurface(l);
    canvas.style.color=l.fg||'#101828';
    canvas.style.background='transparent';
    canvas.style.borderRadius='0';
    canvas.style.position='relative';
    /* V101 — mobile/tablet device frames scroll the canvas INSIDE the phone
       (fixed screen height + overflow-y:auto in builder-ui.css). An inline
       overflow:visible here overrode that and page content spilled out of the
       bottom of the phone once many elements were added. Desktop keeps
       overflow visible; device frames let the CSS rule own the scroll. */
    if(frame.classList.contains('mobile')||frame.classList.contains('tablet')){canvas.style.overflow='';}
    else {canvas.style.overflow='visible';}
    /* The frame is device chrome; the page surface belongs on the canvas.
       Keeping these layers separate prevents the phone bezel color from painting
       over the landing-page background in the editor. */
    frame.style.backgroundColor='#1b2331';
    frame.style.backgroundImage='none';
    canvas.style.backgroundColor=s.backgroundColor;
    canvas.style.backgroundImage=s.backgroundImage;
    canvas.style.backgroundSize=s.backgroundSize;
    canvas.style.backgroundRepeat=s.backgroundRepeat;
    canvas.style.backgroundPosition=s.backgroundPosition;
    canvas.style.backgroundBlendMode=s.backgroundBlendMode;
    canvas.style.backgroundAttachment='scroll';
    frame.classList.toggle('builder-page-fullbleed',true);
    frame.classList.toggle('builder-page-contained',false);
    /* V100 — keep the device frame at its pinned phone width even when the
       full-bleed background rule (width:100%) applies to the page surface. */
    if(frame.classList.contains('mobile')) frame.style.setProperty('--frame-w','390px');
    if(frame.classList.contains('tablet')) frame.style.setProperty('--frame-w','820px');
    frame.style.setProperty('--page-content-max',(Number(l.contentMaxWidth)||1240)+'px');
    frame.style.setProperty('--page-gutter',(Number(l.pageGutter??22))+'px');
  }
  function pageBackground(l){
    /* V129 — one shared pipeline: the editor canvas renders from the same table as
       the published page (WidgetRenderer.landingShellBackground). 'blob' keeps the
       legacy mesh for old pages; when a pattern id is picked, the chosen tile
       pattern becomes the base color. */
    if(l.backgroundPatternId){
      const info=patternInfo(String(l.backgroundPatternId).split(',')[0]);
      if(info&&info.css) return info.css(l);
      return l.patternBase||l.bg||'#FFFFFF';
    }
    const t=l.backgroundType||'solid';
    if(t==='gradient') return `linear-gradient(${l.gradientDir||'135deg'},${l.gradient1||'#FFFFFF'},${l.gradient2||'#EEF4FF'})`;
    if(t==='radial') return `radial-gradient(circle at 30% 20%, ${l.gradient1||'#EEF4FF'}, ${l.gradient2||'#FFFFFF'} 65%)`;
    if(t==='image' && l.backgroundImage) return `url("${attr(l.backgroundImage)}")`;
    if(t==='blob') return `radial-gradient(circle at 15% 20%, ${l.gradient1||'#EEF4FF'} 0 25%, transparent 26%),radial-gradient(circle at 90% 10%, ${l.gradient2||'#D1E9FF'} 0 22%, transparent 23%),${l.bg||'#FFFFFF'}`;
    return l.bg||'#FFFFFF';
  }
  let autoScrollRaf=null;
  let lastDragClientY=0;
  function runAutoScroll(){
    const stage=document.querySelector('.stage-scroll');
    if(!stage || !dragState){ autoScrollRaf=null; return; }
    const rect=stage.getBoundingClientRect();
    const y=lastDragClientY;
    const edge=96;
    let delta=0;
    if(y < rect.top + edge) delta=-Math.min(32, Math.max(5,(rect.top+edge-y)/2.5));
    else if(y > rect.bottom-edge) delta=Math.min(32, Math.max(5,(y-(rect.bottom-edge))/2.5));
    if(delta) stage.scrollTop += delta;
    autoScrollRaf=requestAnimationFrame(runAutoScroll);
  }
  function updateAutoScroll(e){
    lastDragClientY=e.clientY||0;
    const stage=document.querySelector('.stage-scroll');
    if(stage){
      const rect=stage.getBoundingClientRect();
      const edge=96;
      stage.classList.toggle('drag-scroll-top', lastDragClientY < rect.top + edge);
      stage.classList.toggle('drag-scroll-bottom', lastDragClientY > rect.bottom - edge);
    }
    if(!autoScrollRaf) autoScrollRaf=requestAnimationFrame(runAutoScroll);
  }
  function stopAutoScroll(){
    if(autoScrollRaf){cancelAnimationFrame(autoScrollRaf);autoScrollRaf=null;}
    const stage=document.querySelector('.stage-scroll');
    stage?.classList.remove('drag-scroll-top','drag-scroll-bottom');
  }
  document.addEventListener('dragover',e=>{if(dragState)updateAutoScroll(e);});
  document.addEventListener('drop',stopAutoScroll);
  document.addEventListener('dragend',stopAutoScroll);

  function makeDropTarget(el, targetInfo){
    el.addEventListener('dragover', e=>{
      updateAutoScroll(e);
      const sourceId=e.dataTransfer?.getData('text/plain')||dragState?.id;
      if(!sourceId || sourceId===targetInfo?.targetId || sourceId===targetInfo?.parentId){ e.dataTransfer?.setDragImage?.(new Image(),0,0); return; }
      e.preventDefault(); e.stopPropagation(); el.classList.add('drop-target'); if(e.dataTransfer)e.dataTransfer.dropEffect='move';
    });
    el.addEventListener('dragleave', e=>{ if(!el.contains(e.relatedTarget))el.classList.remove('drop-target'); });
    el.addEventListener('drop', e=>{
      e.preventDefault(); e.stopPropagation(); el.classList.remove('drop-target');
      const sourceId=e.dataTransfer?.getData('text/plain')||dragState?.id;
      if(sourceId) moveBlock(sourceId,targetInfo);
    });
  }
  function nodeEl(b,parentPadX=null){
    const wrap=document.createElement('div');
    const isMobile=frame.classList.contains('mobile');
    const isTablet=frame.classList.contains('tablet');
    const isDesktop=frame.classList.contains('desktop');
    const deviceHidden=(isMobile && b.hideMobile===true) || (isTablet && b.hideTablet===true) || (isDesktop && b.hideDesktop===true) || (isMobile && b.showOnMobile===false) || (isDesktop && b.showOnDesktop===false);
    wrap.className='builder-node builder-node--'+String(b.type||'element').replace(/[^a-z0-9_-]/gi,'')+(b.id===selectedId?' is-selected':'')+(deviceHidden?' device-hidden':'')+((b.edgeToEdge||b.fullBleed)?' is-full-bleed':'');
    if(deviceHidden) wrap.setAttribute('aria-hidden','true');
    wrap.dataset.id=b.id;
    wrap.dataset.nodeLabel=b.name||labels[b.type]||b.type;
    if(b.locked) wrap.classList.add('is-locked');
    wrap.draggable=false;
    if(b.hiddenEditor) wrap.classList.add('editor-hidden');
    wrap.addEventListener('click',e=>{e.stopPropagation();if(frame.classList.contains('preview'))return;if(e.shiftKey){toggleSelect(b.id);}else{select(b.id)}});
    const handle=document.createElement('div');
    handle.className='builder-node__handle';
    handle.textContent='⋮⋮ '+(labels[b.type]||b.type);
    const pinned=b.type==='stickyButton'; /* V138 — Sticky Button قابل جابه‌جایی نیست */
    handle.title=pinned?'این عنصر همیشه پایین‌ترین بخش صفحه است':'برای جابه‌جایی بکش';
    handle.draggable=!pinned;
    if(pinned)handle.textContent='📌 '+(labels[b.type]||b.type);
    handle.addEventListener('dragstart',e=>{e.stopPropagation();document.body.classList.add('rv-dragging');if(b.locked){e.preventDefault();showToast('این عنصر قفل است');return;}dragState={id:b.id};e.dataTransfer.setData('text/plain',b.id);e.dataTransfer.effectAllowed='move';wrap.classList.add('dragging');});
    handle.addEventListener('dragend',()=>{document.body.classList.remove('rv-dragging');stopAutoScroll();dragState=null;wrap.classList.remove('dragging');document.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));});
    wrap.appendChild(handle);
    if(b.type!=='stickyButton'){ const ig=document.createElement('div'); ig.className='insert-gap rv-ig'; ig.setAttribute('aria-hidden','true'); makeDropTarget(ig,{mode:'before',targetId:b.id}); wrap.appendChild(ig); }
    /* V117 — on-canvas quick toolbar removed: the black selection bar
       (builder-v64-selectionbar) is the single floating toolbar for every
       element. The old white per-node strip (section-canvas-toolbar) doubled
       it and overlapped the selection bar — see the V117 note in the CSS. */
    if(!['section','columns','stickySection','stickyColumn','group','popupSection','stickyButton','anywhereSection'].includes(b.type)) makeDropTarget(wrap,{mode:'before',targetId:b.id});
    const content=document.createElement('div');
    content.className='builder-node__content';
    let previewHtml='';
    try {
      previewHtml=renderNodePreview(b,parentPadX);
      if(typeof previewHtml!=='string' || !previewHtml.trim()) throw new Error('Widget renderer returned empty output');
    } catch(err) {
      previewHtml=`<div class="builder-node__error widget-surface"><strong>${esc(labels[b.type]||b.type)}</strong><span>این ویجت در ادیتور خطا داد؛ خود عنصر خراب نشده و می‌توانی تنظیماتش را ویرایش یا ریست کنی.</span></div>`;
      console.error('Builder element render error',b.type,err);
    }
    content.innerHTML=previewHtml;
    if(content.firstElementChild) content.firstElementChild.classList.add('widget-surface');
    let visualNode=content.firstElementChild||document.createElement('div');
    wrap.appendChild(visualNode);
    if(!frame.classList.contains('preview') && visualNode.querySelectorAll){
      visualNode.querySelectorAll('a,button,input,select,textarea,iframe,video,summary,details').forEach(el=>{
        /* V122.1 — پلیر صوت سفارشی باید روی بوم بیلدر هم واقعاً پخش/جست‌وجو کند؛
           listener فاز capture روی خود دکمه، کلیک روی آیکون‌های داخلش را می‌کُشت
           (ایونت هرگز به فاز bubble و listener پخش runtime نمی‌رسید). */
        if(el.closest('.rava-audio'))return;
        el.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();select(b.id);},{capture:true});
        el.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();},{capture:true});
      });
      visualNode.querySelectorAll('iframe,video').forEach(el=>{el.style.pointerEvents='none';});
    }
    /* V116 — scrollPoint markup comes solely from the shared renderer;
       the edit-mode ghost bar keeps the node visible/selectable on the canvas. */
    if(b.type==='section'||b.type==='stickySection'||b.type==='stickyColumn'||b.type==='group'||b.type==='popupSection'||b.type==='anywhereSection'){
      const visual=visualNode||wrap;
      /* V147 — section / group / pop up are drawn by the shared renderer; the
         editor only swaps the children of its [data-rava-inner] layer for the
         drop zone, so padding, width, height and gaps are the published ones. */
      const rInner=visual.matches&&visual.matches('[data-rava-inner]')?visual:visual.querySelector('[data-rava-inner]');
      const host=rInner?(rInner.parentElement||rInner):(visual.querySelector('.container-editor-surface')||visual);
      const inner=rInner||host.querySelector('.container-editor-inner')||host;
      const zone=document.createElement('div');zone.className='nested-drop-zone rv-zone';zone.dataset.parentId=b.id;
      const eg=Math.max(0,n(b.innerGap,0));
      if(eg>0){ zone.classList.add('rv-zone--flex'); zone.style.setProperty('--rv-zone-gap',eg+'px'); }
      if(!(b.blocks||[]).length) zone.classList.add('rv-zone--empty');
      makeDropTarget(host,{mode:'append',parentId:b.id});
      host.addEventListener('dragenter',()=>host.classList.add('container-drop-ready'));
      host.addEventListener('dragleave',e=>{if(!host.contains(e.relatedTarget))host.classList.remove('container-drop-ready')});
      host.addEventListener('drop',()=>host.classList.remove('container-drop-ready'));
      (b.blocks||[]).forEach(child=>{ zone.appendChild(nodeEl(child,{left:n(b.padLeft,b.padX||0),right:n(b.padRight,b.padX||0)})); });
      makeDropTarget(zone,{mode:'append',parentId:b.id});
      inner.replaceChildren(zone);
      inner.classList.add('container-drop-surface');
      // Accept an item anywhere in the empty/background area of the container.
      makeDropTarget(inner,{mode:'append',parentId:b.id});
      inner.addEventListener('dragover',e=>{
        const sourceId=e.dataTransfer?.getData('text/plain')||dragState?.id;
        if(!sourceId || sourceId===b.id || isInside(b.id,sourceId)) return;
        if(!e.target.closest('.builder-node__handle')){ e.preventDefault(); e.stopPropagation(); inner.classList.add('drop-target'); if(e.dataTransfer)e.dataTransfer.dropEffect='move'; }
      });
      inner.addEventListener('dragleave',e=>{ if(!inner.contains(e.relatedTarget)) inner.classList.remove('drop-target'); });
      inner.addEventListener('drop',e=>{
        inner.classList.remove('drop-target');
      });
    }
    if(b.type==='columns'){
      /* V147 — Columns on the canvas ARE the published columns: the shared
         renderer draws the row (gap, widths, valign, mobile stacking, frame)
         and the editor turns each .render-col into a drop zone in place. */
      const count=Math.max(1,Math.min(6,Number(b.count)||2));
      const root=(visualNode&&visualNode.querySelector)?(visualNode.classList&&visualNode.classList.contains('render-columns')?visualNode:visualNode.querySelector('.render-columns')):null;
      const colsEls=root?[...root.querySelectorAll(':scope > .render-col')]:[];
      const vertical=b.dir==='column';
      colsEls.forEach((zone,ci)=>{
        const col=b.items[ci]; if(!col) return;
        zone.classList.add('column-drop-zone','rv-col');zone.dataset.parentId=b.id;zone.dataset.column=ci;
        if(!(col.blocks||[]).length) zone.classList.add('rv-col--empty');
        zone.addEventListener('click',e=>{e.stopPropagation();b.activeColumn=ci;select(b.id);});
        (col.blocks||[]).forEach(child=>zone.appendChild(nodeEl(child,{left:0,right:0})));
        if(!vertical&&ci<count-1){
          const grip=document.createElement('button');grip.type='button';grip.className='column-resizer';grip.title='برای تغییر عرض ستون بکش';grip.setAttribute('aria-label',`تغییر عرض ستون ${ci+1}`);grip.innerHTML='<span></span>';
          grip.addEventListener('pointerdown',e=>{
            e.preventDefault();e.stopPropagation();grip.setPointerCapture?.(e.pointerId);
            const rect=root.getBoundingClientRect(), start=e.clientX, leftW=n(b.items[ci].width,100/count), rightW=n(b.items[ci+1].width,100/count);
            const rtl=getComputedStyle(root).direction==='rtl'?-1:1;
            const move=ev=>{const delta=(ev.clientX-start)/Math.max(1,rect.width)*100*rtl;const a=Math.max(1,Math.min(leftW+rightW-1,leftW+delta));const z=leftW+rightW-a;b.items[ci].width=a;b.items[ci+1].width=z;if(colsEls[ci])colsEls[ci].style.flex=`${a} 1 0%`;if(colsEls[ci+1])colsEls[ci+1].style.flex=`${z} 1 0%`;};
            const up=()=>{grip.releasePointerCapture?.(e.pointerId);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);snapshot();renderAll();select(b.id);};
            window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
          }); zone.appendChild(grip);
        }
        makeDropTarget(zone,{mode:'column',parentId:b.id,column:ci});zone.addEventListener('dragover',e=>{const sourceId=e.dataTransfer?.getData('text/plain')||dragState?.id;if(!sourceId||sourceId===b.id||isInside(b.id,sourceId))return;if(!e.target.closest('.builder-node__handle')){e.preventDefault();e.stopPropagation();zone.classList.add('drop-target');if(e.dataTransfer)e.dataTransfer.dropEffect='move';}});zone.addEventListener('dragleave',e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('drop-target')});zone.addEventListener('drop',()=>zone.classList.remove('drop-target'));
      });
    }
    /* V142 — پس‌زمینه/حاشیه/سایه/هاور کانتینرها روی بوم ویرایش */
    if(V142_CONTAINERS.has(b.type)&&!['section','columns'].includes(b.type)){ const h=b.type==='columns'?wrap.querySelector(':scope > .columns-drop-grid'):((visualNode&&visualNode.querySelector&&visualNode.querySelector('.container-editor-surface'))||visualNode); v142EditorFx(b,h,wrap); if(b.type==='columns'&&h){ try{ const WR=window.WidgetRenderer; const legacy=(b.backgroundType||b.backgroundColor||b.bg)?surfaceStyle(b):''; if(!b.bgxType&&legacy)h.style.background=legacy; }catch(_){} } }
    return wrap;
  }
      function renderNodePreview(b,parentPadX=0){
    /* V116 — ONE engine: every non-container widget renders through the shared
       module (the exact code the server publishes with). Only true editor
       placeholders remain; a shared-engine failure throws loudly instead of
       silently falling back to a second, drifting markup. */
    const EDITOR_ONLY=new Set(['columns','stickyColumn','stickySection','group','section','popupSection','stickyButton','anywhereSection']);
    if(b.type==='section'||b.type==='group'||b.type==='popupSection'||b.type==='columns'){
      /* V147 — render the real container markup (children stripped: the editor
         injects live nodes into [data-rava-inner] / .render-col afterwards). */
      if(b.type==='columns'){
        const count=Math.max(1,Math.min(6,Number(b.count)||2));
        b.items=Array.isArray(b.items)?b.items:[];
        while(b.items.length<count)b.items.push({id:uid(),width:100/count,blocks:[]});
        if(b.items.length>count)b.items=b.items.slice(0,count);
        b.items.forEach(col=>{if(col.width==null)col.width=100/count;});
      }
      const shell=b.type==='columns'?Object.assign({},b,{items:b.items.map(c=>Object.assign({},c,{blocks:[]}))}):Object.assign({},b,{blocks:[]});
      const out=renderNodePreviewShared(shell);
      if(typeof out==='string'&&out.trim()) return out;
    }
    if(!EDITOR_ONLY.has(b.type)){
      let shared=null;
      try{ shared=renderNodePreviewShared(b); }catch(err){ console.error('Shared render failed',b.type,err); shared=null; }
      if(shared===null) throw new Error('Widget could not render via the shared engine: '+b.type);
      return shared;
    }
    switch(b.type){
      case 'anywhereSection': {
        const x=n(b.offsetX,0), y=n(b.offsetY,0), w=Math.max(40,n(b.width,320)), h=Math.max(0,n(b.height,180));
        const surface=`position:relative;box-sizing:border-box;width:${w}px;min-height:${h||120}px;transform:translate(${x}px,${y}px);margin:${Math.max(0,y)}px 0 ${Math.max(0,-y)}px;overflow:visible;border:1px dashed #B2CCFF;border-radius:${n(b.radius,14)}px;background:${surfaceStyle(b)}`;
        return `<div class="anywhere-editor-band" style="position:relative;min-height:${h||120}px;overflow:visible"><div class="container-editor-surface" style="${surface}"><div class="container-editor-inner" style="position:relative;z-index:2;min-height:${Math.max(40,h-32)}px;padding:${n(b.padTop,n(b.padY,16))}px ${n(b.padRight,n(b.padX,16))}px ${n(b.padBottom,n(b.padY,16))}px ${n(b.padLeft,n(b.padX,16))}px"><div class="section-inner-drop"></div></div></div></div>`;
      }
      case 'columns': return `<div class="columns-editor-surface" style="display:block;width:100%;min-height:120px"></div>`;
      case 'group':
      /* V118 — فاصله‌گذاری سکشن در ادیتور هم مثل سایت واقعی: پدینگ واقعی عنصر روی پوستهٔ داخلی
         می‌نشیند (قبلاً 18px ثابت بود و اسلایدرها اثر واقعی نداشتند) + مارجین واقعی بالای سکشن */
      case 'section': { const hm=b.sectionHeight||'auto'; const h=hm==='fixed'?Math.max(80,n(b.height,420)):hm==='min'?Math.max(0,n(b.minHeight,0)):0; const w=Math.max(25,Math.min(100,n(b.width,100))); return `<div style="width:${w}%;max-width:${Math.max(25,Math.min(100,n(b.maxWidth,100)))}%;margin:${n(b.marginTop,0)}px 0 ${n(b.marginBottom,0)}px"><div class="container-editor-surface" style="position:relative;box-sizing:border-box;min-height:${h}px;border:1px dashed #B2CCFF;border-radius:${n(b.radius,14)}px;background:${surfaceStyle(b)}"><div class="container-editor-inner" style="position:relative;z-index:2;min-height:0;padding:${n(b.padTop,n(b.padY,0))}px ${n(b.padRight,n(b.padX,0))}px ${n(b.padBottom,n(b.padY,0))}px ${n(b.padLeft,n(b.padX,0))}px"><div class="section-inner-drop"></div></div></div></div>`; }
      /* V137 — Pop Up روی بوم ویرایش: همان سطح قابل‌رهاکردن سکشن، در عرض واقعی پنجره، داخل نوار نارنجی «POP UP» */
      case 'popupSection': { const pw=Math.max(260,Math.min(1400,n(b.popupWidth,560))); const pd=Math.max(1,Math.min(120,Math.round(n(b.popupDelay,5)))); return `<div class="popup-editor-band" style="box-sizing:border-box;margin:${n(b.marginTop,0)+18}px 0 ${n(b.marginBottom,0)}px;padding:12px 12px 16px;border:2px dashed #FDB022;border-radius:20px;background:#FFFAEB"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;font-size:12px;font-weight:800;color:#B54708"><span>⧉ POP UP — پایین‌ترین بخش صفحه</span><span>${pd} ثانیه بعد از ورود بازدیدکننده باز می‌شود</span></div><div class="container-editor-surface" style="position:relative;box-sizing:border-box;min-height:160px;max-width:${pw}px;margin:0 auto;border:1px dashed #B2CCFF;border-radius:${n(b.radius,20)}px;background:${surfaceStyle(b)};box-shadow:0 24px 60px rgba(16,24,40,.18)"><div class="container-editor-inner" style="position:relative;z-index:2;min-height:80px;padding:${n(b.padTop,n(b.padY,0))}px ${n(b.padRight,n(b.padX,0))}px ${n(b.padBottom,n(b.padY,0))}px ${n(b.padLeft,n(b.padX,0))}px"><div class="section-inner-drop"></div></div></div></div>`; }
      /* V138 — Sticky Button روی بوم ویرایش: نوار بنفش «پایین‌ترین بخش صفحه» + خود دکمه (بدون position:fixed که از بوم بیرون می‌زد) */
      case 'stickyButton': { const pos=b.stickyPos||'bottom-right'; const posFa=pos==='bottom-left'?'پایین چپ':pos==='bottom-center'?'پایین وسط':'پایین راست'; const j=pos==='bottom-left'?'flex-start':pos==='bottom-center'?'center':'flex-end'; let btn=''; try{ btn=renderNodePreviewShared(stickyButtonAsBuy(b))||''; }catch(_){ btn=''; } return `<div class="sticky-btn-editor-band" style="box-sizing:border-box;margin:18px 0 0;padding:12px 12px 14px;border:2px dashed #9E77ED;border-radius:20px;background:#F9F5FF"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px;font-size:12px;font-weight:800;color:#6941C6"><span>📌 STICKY BUTTON — پایین‌ترین بخش صفحه</span><span>روی سایت: ثابت در ${posFa}</span></div><div style="display:flex;justify-content:${j}">${btn}</div></div>`; }
      case 'stickyColumn': return `<div style="position:relative;min-height:140px;border:1px dashed #B2CCFF;border-radius:14px;background:#F8FBFF;padding:18px;font-size:11px;font-weight:800;color:#175CD3">STICKY COLUMN — عناصر را اینجا رها کن</div>`;
      case 'stickySection': return `<div style="position:relative;min-height:120px;border:1px dashed #B2CCFF;border-radius:14px;background:#F8FBFF;padding:18px;font-size:11px;font-weight:800;color:#175CD3">STICKY SECTION — عناصر را اینجا رها کن</div>`;
    }
    throw new Error('Unknown editor-only widget: '+b.type);
  }

  function renderLayers(){
    layers.innerHTML='';
    function add(list,depth=0){ list.forEach((b,i)=>{
      const row=document.createElement('div');
      row.dataset.layerId=b.id;
      row.dataset.layerDepth=String(depth);
      row.dataset.layerType=b.type;
      row.dataset.hasChildren=String((Array.isArray(b.blocks)&&b.blocks.length>0)||(b.type==='columns'&&Array.isArray(b.items)&&b.items.some(col=>Array.isArray(col.blocks)&&col.blocks.length>0)));
      const active=selectedIds.has(b.id)||(b.id===selectedId);
      row.className='layer-item'+(active?' active':'')+(b.locked?' is-locked':'')+(b.hiddenEditor?' is-hidden':'');
      row.dataset.layerLabel=String(labels[b.type]||b.type).toLowerCase();
      row.style.paddingRight=(8+depth*14)+'px';
      row.draggable=!b.locked;
      const eyeOn='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
      const eyeOff='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 6.2A9.3 9.3 0 0 1 12 6c6.2 0 10 6 10 6a17.7 17.7 0 0 1-3.1 3.6M6.1 6.2C3.6 7.8 2 12 2 12s3.8 6 10 6a10.6 10.6 0 0 0 3.4-.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      row.innerHTML=`<span class="layer-item__grab">⋮⋮</span><span class="layer-item__name" data-layer-name="${b.id}">${esc(b.name||labels[b.type]||b.type)}</span><span class="layer-actions"><button data-act="rename" title="تغییر نام">✎</button><button data-act="dup" title="تکثیر">⧉</button><button data-act="hide" class="layer-icon-btn" title="نمایش/مخفی" aria-label="${b.hiddenEditor?'نمایش':'مخفی کردن'}">${b.hiddenEditor?eyeOff:eyeOn}</button><button data-act="lock" title="قفل">${b.locked?'🔒':'🔓'}</button><button data-act="up" title="بالا">↑</button><button data-act="down" title="پایین">↓</button></span>`;
      row.querySelector('[data-act="rename"]').addEventListener('click',e=>{e.stopPropagation();const name=(prompt('نام جدید این لایه:',b.name||labels[b.type]||b.type)||'').trim();if(!name)return;b.name=name;snapshot();renderAll();});
      row.querySelector('[data-act="dup"]').addEventListener('click',e=>{e.stopPropagation();select(b.id);duplicateSelected();});
      row.addEventListener('click',e=>{if(e.target.closest('button'))return;select(b.id);});
      row.querySelector('[data-act="up"]').addEventListener('click',e=>{e.stopPropagation();moveSibling(b.id,-1);});
      row.querySelector('[data-act="down"]').addEventListener('click',e=>{e.stopPropagation();moveSibling(b.id,1);});
      row.querySelector('[data-act="hide"]').addEventListener('click',e=>{e.stopPropagation();b.hiddenEditor=!b.hiddenEditor;snapshot();renderAll();});
      row.querySelector('[data-act="lock"]').addEventListener('click',e=>{e.stopPropagation();b.locked=!b.locked;snapshot();renderAll();});
      row.addEventListener('dragstart',e=>{document.body.classList.add('rv-dragging');if(b.locked||b.type==='stickyButton'){e.preventDefault();return;}dragState={id:b.id};e.dataTransfer.setData('text/plain',b.id);e.dataTransfer.effectAllowed='move';row.classList.add('dragging');});
      row.addEventListener('dragover',e=>{if(!dragState||dragState.id===b.id)return;e.preventDefault();e.stopPropagation();row.classList.add('drop-target');});
      row.addEventListener('dragleave',()=>row.classList.remove('drop-target'));
      row.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();row.classList.remove('drop-target');if(dragState?.id&&dragState.id!==b.id){moveBlock(dragState.id,{mode:'before',targetId:b.id});dragState=null;}});
      row.addEventListener('dragend',()=>{document.body.classList.remove('rv-dragging');stopAutoScroll();dragState=null;row.classList.remove('dragging');document.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));});
      layers.appendChild(row);
      if(b.blocks) add(b.blocks,depth+1);
      if(b.type==='columns'&&b.items) b.items.forEach(col=>add(col.blocks||[],depth+1));
    }); }
    add(state.blocks||[]);
  }
  function syncSelectionClasses(){
    canvas.querySelectorAll('.builder-node.is-selected,.builder-node.is-multi-selected').forEach(n=>n.classList.remove('is-selected','is-multi-selected'));
    const ids=new Set(selectedIds); if(selectedId) ids.add(selectedId);
    ids.forEach(id=>{ const el=canvas.querySelector(`.builder-node[data-id="${id}"]`); if(el) el.classList.add(id===selectedId?'is-selected':'is-multi-selected'); });
    const count=ids.size;
    selectedName.textContent=count>1?`${count} عنصر انتخاب شده`:selectedId?(labels[find(selectedId)?.b.type]||'Element'):'Page'; const chip=document.getElementById('selectionChip'); if(chip) chip.textContent=String(count||0);
  }
  function select(id){
    if(id && !find(id)) id=null;
    selectedIds=new Set(id?[id]:[]); selectedId=id;
    syncSelectionClasses(); updateInspector(); renderLayers();
    if(id) requestAnimationFrame(()=>canvas.querySelector(`.builder-node[data-id="${id}"]`)?.scrollIntoView({behavior:'smooth',block:'nearest'}));
  }
  function toggleSelect(id){
    if(!find(id)) return;
    if(selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
    selectedId=id;
    syncSelectionClasses(); renderLayers();
    if(selectedIds.size!==1) { selectedName.textContent=`${selectedIds.size} عنصر انتخاب شده`; inspector.innerHTML=multiSelectionInspector(); }
    else updateInspector();
  }
  function multiSelectionInspector(){
    return section('Multi-selection',`<div class="helper">${selectedIds.size} عنصر انتخاب شده‌اند.</div>${selectField('Horizontal align','multiAlign','none',[['none','بدون تغییر'],['left','چپ'],['center','وسط'],['right','راست']])}${rangeField('Gap','multiGap',0,0,120,1)}<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"><button type="button" class="mini-btn" id="groupSelected">گروه‌کردن</button><button type="button" class="danger-btn" id="multiDelete">حذف همه</button></div>`).outerHTML;
  }
  function section(title, body, open=true){ const d=document.createElement('div'); d.className='inspector-section'+(open?'':' collapsed'); d.innerHTML=`<button type="button"><span>${title}</span><span class="section-chevron">⌄</span></button><div class="inspector-section__body">${body}</div>`; d.querySelector('button').addEventListener('click',()=>d.classList.toggle('collapsed')); return d; }
  function input(label,key,value,type='text',extra=''){
    const mediaKey=type==='text' && /(?:^|\.)(src|image|imageUrl|backgroundImage|heroImage|avatar|poster|before|after|iconUrl)$/.test(String(key||''));
    if(mediaKey)return mediaInput(label,key,value);
    return `<div class="field"><label>${label}</label><input data-bind="${key}" value="${attr(value??'')}" type="${type}" ${extra}></div>`;
  }
  function rangeField(label,key,value,min=0,max=100,step=1){return `<div class="field slider-field"><div class="field-head"><label>${label}</label><output data-range-output="${key}">${value??0}</output></div><input class="range" data-bind="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${Number.isFinite(Number(value))?value:0}"><input class="range-number" data-bind="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${Number.isFinite(Number(value))?value:0}"></div>`;}
  function textarea(label,key,value){return `<div class="field"><label>${label}</label><textarea data-bind="${key}">${esc(value??'')}</textarea></div>`;}
  function selectField(label,key,value,opts){return `<div class="field"><label>${label}</label><select data-bind="${key}">${opts.map(o=>`<option value="${attr(o[0])}" ${String(value)===String(o[0])?'selected':''}>${esc(o[1])}</option>`).join('')}</select></div>`;}

  /* ===== V101 — font library picker =====================================
     window.RAVA_FONTS comes from the server (~224 fonts, grouped by script
     and category). Every font dropdown in the builder is generated from it,
     and picking a family loads its Google Fonts stylesheet immediately so
     the canvas preview shows the real face. */
  /* V131 — متن ساده به HTML (برای ویرایشگر متن و فیلدهای rich). تا امروز هیچ تعریفی
     از این تابع در فایل نبود و هر جا صدا زده می‌شد (مثل richEditor برای متنِ تازه)
     ReferenceError می‌داد؛ حالا یک تعریف مشترک دارد. */
  function plainToHtml(t){ return esc(t||'').replace(/\n/g,'<br>'); }
  /* ======================= V132 — runtime انیمیشن ادیتور =======================
     یک تابع play/observe مشترک (RAVA_ANIMATIONS) هم سایت منتشرشده و هم بیلدر را پوشش
     می‌دهد. اینجا فقط: پیدا کردن DOM عنصر انتخاب‌شده روی بوم + پخش فوری. اسلایدرهای
     Duration/Delay تغییرشان مستقیم روی data-* عنصر بوم هم می‌نشیند تا Replay همان
     لحظه با مقادیر جدید پخش شود. */
  function animCanvasNode(block){
    if(!block)return null;
    const node=canvas.querySelector(`.builder-node[data-id="${block.id}"]`);
    if(!node)return null;
    return node.querySelector('[data-rva-anim]')||node;
  }
  function replaySelectedAnimation(quiet){
    const f=find(selectedId)?.b;if(!f)return;
    const A=window.RAVA_ANIMATIONS;if(!A)return;
    const el=animCanvasNode(f);
    if(!el){ if(!quiet)showToast('این عنصر روی بوم یافت نشد'); return; }
    /* data-* های بوم را با مقدار فعلی بلوک سینک کن تا play همان لحظه درست باشد */
    el.dataset.rvaType=f.animationType||'none';
    el.dataset.rvaIntensity=f.animationIntensity||'normal';
    el.dataset.rvaThreshold=f.animationThreshold||'normal';
    el.dataset.rvaDuration=String(Number(f.animationDuration)||1);
    el.dataset.rvaDelay=String(Number(f.animationDelay)||0);
    A.play(el);
  }
  function updateAnimOutputs(){
    const f=find(selectedId)?.b;if(!f)return;
    const A=window.RAVA_ANIMATIONS;const META=(A&&A.META)||{};const INT=(A&&A.INTENSITY)||{};
    const inten=['subtle','normal','strong'].includes(f.animationIntensity)?f.animationIntensity:'normal';
    const meta=META[f.animationType]||{};const st=INT[inten]||INT.normal||{};
    const hint=meta.varKey==='dist'?`جابه‌جایی ${st.dist}px`:meta.varKey==='blur'?`تاری ${st.blur}px`:meta.varKey==='deg'?`چرخش ${st.deg}°`:meta.varKey==='glitch'?`لرزش ${st.glitch}px`:meta.varKey==='scale'?`شروع از ${st.scale}×`:meta.varKey==='bounce'||meta.varKey2==='bounce'?`پرش ${st.bounce}px`:'مقدار پیش‌فرض';
    const io=inspector.querySelector('[data-anim-inten-out]');if(io)io.textContent=inten+' — '+hint;
    const th={low:'Low — ۱۰٪ دیده شود',normal:'Normal — ۵۰٪ دیده شود',high:'High — ۹۰٪ دیده شود'}[f.animationThreshold||'normal'];
    const to=inspector.querySelector('[data-anim-th-out]');if(to)to.textContent=th;
    /* V132.1 — Duration/Delay با پسوند s نمایش داده می‌شوند (مثل «1s») */
    const durOut=inspector.querySelector('[data-range-output="animationDuration"]');if(durOut)durOut.textContent=Number(f.animationDuration||1).toFixed(1)+'s';
    const delayOut=inspector.querySelector('[data-range-output="animationDelay"]');if(delayOut)delayOut.textContent=Number(f.animationDelay||0).toFixed(1)+'s';
  }
  const FONT_GROUPS=[
    {key:'system',label:'سیستمی'},
    {key:'fa',label:'فارسی و عربی'},
    {key:'sans',label:'لاتین مدرن (Sans)'},
    {key:'serif',label:'سریف'},
    {key:'display',label:'دیسپلی و تیتر'},
    {key:'hand',label:'دست‌نویس'},
    {key:'round',label:'گرد'},
    {key:'mono',label:'مونو / کد'},
    {key:'other',label:'زبان‌های دیگر'},
  ];
  const FONT_GROUP_MAP=(()=>{
    const list=(window.RAVA_FONTS&&window.RAVA_FONTS.length)?window.RAVA_FONTS:[{id:'system-ui',label:'سیستمی',scripts:['any'],cat:'system'}];
    const map=new Map();
    for(const f of list){
      let g;
      if(f.cat==='system')g='system';
      else if(f.scripts&&(f.scripts.includes('fa')||f.scripts.includes('ar')||f.scripts.includes('ur')))g='fa';
      else if(['he','ja','ko','th','deva'].some(s=>f.scripts&&f.scripts.includes(s)))g='other';
      else g=(f.cat==='sans'||f.cat==='serif'||f.cat==='display'||f.cat==='hand'||f.cat==='mono'||f.cat==='round')?f.cat:'sans';
      if(!map.has(g))map.set(g,[]);map.get(g).push(f);
    }
    return map;
  })();
  const loadedFontFamilies=new Set();
  function ensureFontLoaded(fam){
    const f=(window.RAVA_FONTS||[]).find(x=>x.id===fam);
    if(!f||(f.scripts&&f.scripts.includes('any')))return;
    const generic=['system-ui','Tahoma','Arial','Helvetica','Georgia','Verdana','Courier New'];
    if(generic.includes(fam)||loadedFontFamilies.has(fam))return;
    loadedFontFamilies.add(fam);
    try{
      /* V141 — css2 با وزن‌های ثابت برای فونت‌های تک‌وزنه 400 برمی‌گرداند؛ v1 سهل‌گیر است + فونت‌های فارسی غیرگوگل از CDN */ const href=({"Sahel":"https://cdn.jsdelivr.net/gh/rastikerdar/sahel-font@v3.4.0/dist/font-face.css","Samim":"https://cdn.jsdelivr.net/gh/rastikerdar/samim-font/dist/font-face.css","Shabnam":"https://cdn.jsdelivr.net/gh/rastikerdar/shabnam-font/dist/font-face.css","Gandom":"https://cdn.jsdelivr.net/gh/rastikerdar/gandom-font/dist/font-face.css","Parastoo":"https://cdn.jsdelivr.net/gh/rastikerdar/parastoo-font/dist/font-face.css","Tanha":"https://cdn.jsdelivr.net/gh/rastikerdar/tanha-font/dist/font-face.css","Nahid":"https://cdn.jsdelivr.net/gh/rastikerdar/nahid-font/dist/font-face.css"})[fam]||`https://fonts.googleapis.com/css?family=${encodeURIComponent(fam).replace(/%20/g,'+')}:300,400,500,600,700,800,900&display=swap`;
      if(!document.head.querySelector(`link[data-font="${fam.replace(/"/g,'')}"]`)){
        const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.setAttribute('data-font',fam);document.head.appendChild(link);
      }
    }catch(_){}
  }
  let fontsPreloadPromise=null;
  function preloadVisibleFonts(){
    if(fontsPreloadPromise)return fontsPreloadPromise;
    const fonts=(window.RAVA_FONTS||[]).filter(f=>f&&f.id&&!(f.scripts||[]).includes('any'));
    fonts.forEach(f=>ensureFontLoaded(f.id));
    const waiters=fonts.map(f=>{
      const family=String(f.id).replace(/["']/g,'');
      return document.fonts?.load(`400 16px "${family}"`).catch(()=>null);
    });
    fontsPreloadPromise=Promise.race([
      Promise.allSettled(waiters),
      new Promise(resolve=>setTimeout(resolve,1800))
    ]).then(()=>{document.documentElement.classList.add('rava-fonts-ready');return true;});
    return fontsPreloadPromise;
  }
  function fontOptionsHtml(cur){
    /* V122 — لیست کامل فونت‌ها (همان ۲۲۴ فونت گروه‌بندی‌شده) برای همهٔ دراپ‌داون‌ها؛
       هم تب طراحی و هم اکوردیون داخل ویرایشگر متن از همین استفاده می‌کنند. */
    cur=String(cur||'system-ui');
    const known=[...FONT_GROUP_MAP.values()].flat().some(f=>f.id===cur);
    const groups=FONT_GROUPS.map(g=>{
      const items=FONT_GROUP_MAP.get(g.key);if(!items||!items.length)return '';
      return `<optgroup label="${attr(g.label)}">${items.map(f=>`<option value="${attr(f.id)}" ${cur===f.id?'selected':''} style="font-family:'${f.id}',Vazirmatn,system-ui">${esc(f.label)}${g.key!=='fa'&&g.key!=='system'?' — '+esc(f.id):''}</option>`).join('')}</optgroup>`;
    }).join('');
    const extra=!known&&cur?`<optgroup label="سفارشی"><option value="${attr(cur)}" selected>${esc(cur)}</option></optgroup>`:'';
    return extra+groups;
  }
  function fontSelectField(label,key,value){
    const cur=String(value||'system-ui');
    const known=[...FONT_GROUP_MAP.values()].flat().some(f=>f.id===cur);
    return `<div class="field"><label>${label}</label><select data-bind="${key}" data-font-select="1" title="${attr(known?'':('فونت سفارشی: '+cur))}">${fontOptionsHtml(cur)}</select></div>`;
  }
  function initFontPickers(){
    inspector.querySelectorAll('[data-font-select], [data-rich-font]').forEach(sel=>{
      if(sel.dataset.fontBound)return;
      sel.dataset.fontBound='1';
      ensureFontLoaded(sel.value);
      makeFontPicker(sel);
    });
  }
  /* V156 — native select menus ignore option font-family and do not expose a
     reliable hover event. Replace them with an accessible custom menu: every
     row is rendered in its own face, hover previews immediately, click commits. */
  function makeFontPicker(sel){
    if(!sel || sel.dataset.fontCustom==='1')return;
    sel.dataset.fontCustom='1';
    const wrap=document.createElement('div'); wrap.className='rava-font-picker';
    const trigger=document.createElement('button'); trigger.type='button'; trigger.className='rava-font-trigger'; trigger.setAttribute('aria-haspopup','listbox');
    const status=document.createElement('span'); status.className='rava-font-loading'; status.textContent='در حال آماده‌سازی فونت‌ها…'; wrap.appendChild(status);
    const menu=document.createElement('div'); menu.className='rava-font-menu'; menu.setAttribute('role','listbox'); menu.hidden=true;
    const options=[...sel.options].map(o=>({value:o.value,label:o.textContent.trim(),group:o.parentElement?.tagName==='OPTGROUP'?o.parentElement.label:''}));
    /* V158 — searchable font menu: sticky search row on top of the list,
       matches Persian/Latin labels, the family id and the group name. */
    const fontNorm=t=>String(t||'').toLowerCase().replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\s\u200c_\-—]+/g,'');
    const searchRow=document.createElement('div'); searchRow.className='rava-font-search';
    searchRow.innerHTML=`<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" data-font-search placeholder="جست‌وجوی فونت… (مثلاً وزیر، Inter، سریف)" aria-label="جست‌وجوی فونت" autocomplete="off" spellcheck="false"><span class="rava-font-count" data-font-count></span>`;
    menu.appendChild(searchRow);
    const searchInput=searchRow.querySelector('input'); const countEl=searchRow.querySelector('[data-font-count]');
    let lastGroup='';
    options.forEach(o=>{
      if(o.group&&o.group!==lastGroup){const g=document.createElement('div');g.className='rava-font-group';g.textContent=o.group;menu.appendChild(g);lastGroup=o.group;}
      const b=document.createElement('button'); b.type='button'; b.className='rava-font-option'; b.dataset.value=o.value; b.dataset.search=fontNorm(o.label+' '+o.value+' '+o.group); b.setAttribute('role','option'); b.textContent=o.label; b.style.fontFamily=`'${o.value}', Vazirmatn, system-ui`; b.title=o.label;
      b.addEventListener('mouseenter',()=>{ensureFontLoaded(o.value); fontPreview(sel,o.value);});
      b.addEventListener('focus',()=>{ensureFontLoaded(o.value); fontPreview(sel,o.value);});
      b.addEventListener('click',()=>{sel.value=o.value; sel.dispatchEvent(new Event('change',{bubbles:true})); clearFontPreview(sel); closeFontPicker(wrap);});
      menu.appendChild(b);
    });
    const emptyEl=document.createElement('div'); emptyEl.className='rava-font-empty'; emptyEl.hidden=true; emptyEl.textContent='فونتی با این نام پیدا نشد'; menu.appendChild(emptyEl);
    const visibleOpts=()=>[...menu.querySelectorAll('.rava-font-option')].filter(x=>!x.hidden);
    const filterFonts=(q)=>{
      const n=fontNorm(q); let group=null, groupHas=false, total=0;
      const closeGroup=()=>{ if(group) group.hidden=!groupHas; };
      [...menu.children].forEach(el=>{
        if(el.classList.contains('rava-font-group')){ closeGroup(); group=el; groupHas=false; return; }
        if(!el.classList.contains('rava-font-option'))return;
        const hit=!n||el.dataset.search.includes(n)||fontNorm(el.textContent).includes(n);
        el.hidden=!hit; if(hit){groupHas=true;total++;}
      });
      closeGroup();
      emptyEl.hidden=total>0; countEl.textContent=n?String(total):'';
    };
    searchInput.addEventListener('input',()=>{filterFonts(searchInput.value); menu.scrollTop=0;});
    searchInput.addEventListener('keydown',e=>{
      if(e.key==='ArrowDown'){e.preventDefault();visibleOpts()[0]?.focus();}
      else if(e.key==='Enter'){e.preventDefault();visibleOpts()[0]?.click();}
      else if(e.key==='Escape'){e.preventDefault();closeFontPicker(wrap);trigger.focus();}
    });
    menu.addEventListener('keydown',e=>{
      const cur=e.target.closest?.('.rava-font-option'); if(!cur)return;
      const list=visibleOpts(); const i=list.indexOf(cur);
      if(e.key==='ArrowDown'){e.preventDefault();(list[i+1]||list[i])?.focus();}
      else if(e.key==='ArrowUp'){e.preventDefault(); if(i<=0)searchInput.focus(); else list[i-1].focus();}
      else if(e.key==='Escape'){e.preventDefault();closeFontPicker(wrap);trigger.focus();}
    });
    const openMenu=(focusSearch)=>{
      document.querySelectorAll('.rava-font-menu').forEach(m=>m.hidden=true); clearFontPreview(sel);
      searchInput.value=''; filterFonts(''); menu.hidden=false; sync();
      if(focusSearch){ searchInput.focus({preventScroll:true}); menu.scrollTop=0; }
      else menu.querySelector(`[data-value="${CSS.escape(sel.value)}"]`)?.scrollIntoView({block:'nearest'});
    };
    const searchBtn=document.createElement('button'); searchBtn.type='button'; searchBtn.className='rava-font-search-btn'; searchBtn.title='جست‌وجوی فونت'; searchBtn.setAttribute('aria-label','جست‌وجوی فونت');
    searchBtn.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
    searchBtn.addEventListener('click',()=>{ if(!menu.hidden&&document.activeElement===searchInput){closeFontPicker(wrap);return;} openMenu(true); });
    const sync=()=>{const o=options.find(x=>x.value===sel.value)||options[0]; if(!o)return; trigger.textContent=o.label; trigger.style.fontFamily=`'${o.value}', Vazirmatn, system-ui`; menu.querySelectorAll('.rava-font-option').forEach(x=>x.classList.toggle('is-selected',x.dataset.value===o.value));};
    trigger.addEventListener('click',()=>{ if(!menu.hidden){closeFontPicker(wrap);return;} openMenu(false); });
    menu.addEventListener('mouseleave',()=>clearFontPreview(sel));
    sel.addEventListener('change',()=>{ensureFontLoaded(sel.value);sync();clearFontPreview(sel);
      const cur=sel.closest('.inspector-section')?.querySelector(':scope > button .rava-font-panel__cur');
      if(cur){const o=options.find(x=>x.value===sel.value);cur.textContent=(!sel.value||sel.value==='system-ui')?'پیش‌فرض سایت':(o?o.label:sel.value);}
    });
    const row=document.createElement('div'); row.className='rava-font-row'; row.append(trigger,searchBtn);
    wrap.append(row,menu); sel.hidden=true; sel.parentNode.insertBefore(wrap,sel.nextSibling); sync();
    preloadVisibleFonts().then(()=>{status.remove();wrap.classList.add('is-ready');});
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))menu.hidden=true;});
  }
  function closeFontPicker(wrap){const m=wrap?.querySelector('.rava-font-menu');if(m)m.hidden=true; const sel=wrap?.previousElementSibling; if(sel?.matches?.('[data-font-select],[data-rich-font]'))clearFontPreview(sel);}
  function clearFontPreview(sel){
    const state=sel&&sel.__ravaFontPreview;
    if(!state)return;
    state.forEach(([el,value,priority])=>{try{el.style.setProperty('font-family',value,priority||'');}catch(_){}});
    sel.__ravaFontPreview=null; sel.dataset.fontHover='';
  }
  function fontPreview(sel,fam){
    if(!sel||!fam)return;
    clearFontPreview(sel);
    const family=`'${String(fam).replace(/["']/g,'')}', Vazirmatn, system-ui`;
    const targets=[];
    const addTextTree=(root)=>{
      if(!root)return;
      const skip='svg,img,video,canvas,script,style,input,textarea,select';
      if(!root.matches?.(skip))targets.push(root);
      root.querySelectorAll?.('*').forEach(el=>{
        if(!el.matches(skip) && (el.childElementCount===0 || el.textContent.trim()))targets.push(el);
      });
    };
    if(sel.matches('[data-rich-font]'))addTextTree(inspector.querySelector(`[data-rich-id="${CSS.escape(sel.dataset.richFont)}"]`));
    const id=selectedId; const node=id&&canvas.querySelector(`.builder-node[data-id="${CSS.escape(id)}"]`);
    if(node)addTextTree(node.querySelector('.builder-node > .widget-surface')||node.querySelector(':scope > .widget-surface')||node.querySelector('.widget-surface')||node.querySelector('.builder-node__content'));
    const unique=[...new Set(targets)];
    sel.__ravaFontPreview=unique.map(el=>[el,el.style.getPropertyValue('font-family'),el.style.getPropertyPriority('font-family')]);
    unique.forEach(el=>el.style.setProperty('font-family',family,'important'));
    sel.dataset.fontHover=fam;
  }
  function check(label,key,value){return `<label class="check"><input data-bind="${key}" type="checkbox" ${value?'checked':''}>${label}</label>`;}
  function normalizeColorValue(value, fallback='#000000'){
    const raw=String(value??'').trim();
    if(/^#[0-9a-fA-F]{3}$/.test(raw)) return '#'+raw.slice(1).split('').map(x=>x+x).join('').toUpperCase();
    if(/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
    /* Native color inputs support only opaque 6-digit hex. Keep alpha/legacy
       values in the text field instead of silently replacing them with black. */
    if(/^#[0-9a-fA-F]{8}$/.test(raw)) return '#'+raw.slice(1,7).toUpperCase();
    return fallback;
  }
  function color(label,key,value){
    const v=String(value??'').trim()||'#000000';
    const safe=normalizeColorValue(v);
    return `<div class="field"><label>${label}</label><div class="swatch-input"><input data-bind="${attr(key)}" type="text" value="${attr(v)}" autocomplete="off"><input data-color-for="${attr(key)}" type="color" value="${safe}" aria-label="${attr(label)}"></div></div>`;
  }
  function buttonRm(kind,index){ return `<span class="rep-tools"><button type="button" class="mini-btn" data-rep-up="${kind}" data-index="${index}" title="بالا">↑</button><button type="button" class="mini-btn" data-rep-down="${kind}" data-index="${index}" title="پایین">↓</button><button type="button" class="mini-btn" data-rep-dup="${kind}" data-index="${index}" title="تکثیر">⧉</button><button type="button" class="mini-danger" data-remove-item="${kind}" data-index="${index}">حذف</button></span>`; }
  function repArr(kind){ const f=find(selectedId)?.b;if(!f)return null; const map={faq:'items',form:'fields',stats:'items',list:'items',social:'items',carousel:'slides',trustBar:'items',iconGrid:'items',steps:'items',timeline:'items',logoCloud:'items',buttonGroup:'buttons',featureCompare:'items',avatarStack:'items',roadmap:'items',bonusStack:'items',curriculum:'modules',testiMarquee:'items',mediaMarquee:'items',images:'images',icons:'icons',upsellBox:'items'}; const key=map[kind]; return key?f[key]:null; }
  function nineAlignField(label,key,value='mc'){
    const vals=[['tl','↖'],['tc','↑'],['tr','↗'],['ml','←'],['mc','•'],['mr','→'],['bl','↙'],['bc','↓'],['br','↘']];
    return `<div class="nine-align-field"><div class="field-head"><label>${esc(label)}</label><output>${esc(value||'mc')}</output></div><div class="nine-align-grid">${vals.map(([v,icon])=>`<button type="button" data-nine-value="${v}" data-nine-path="${attr(key)}" class="nine-align-btn ${String(value||'mc')===v?'active':''}" title="${v}">${icon}</button>`).join('')}</div></div>`;
  }
  function alignmentField(b){ const isT=b&&b.type==='text'; return selectField(isT?'چینش متن':'Alignment','align',b.align||((isT||(b&&b.type==='feature'))?'right':'center'),isT?[['right','راست‌چین'],['center','وسط‌چین'],['left','چپ‌چین'],['justify','تراز دو طرف']]:[['left','Left'],['center','Center'],['right','Right']]); }
  function typographyFields(b, rich=false){
    return section('Typography',`${fontSelectField('Font','fontFamily',b.fontFamily||'system-ui')}${rangeField('Text size','size',b.size??18,8,180,1)}${rangeField('Weight','weight',b.weight??400,100,1000,100)}${rangeField('Line height','line',b.line??1.5,.8,3,.05)}${rangeField('Letter spacing','letter',b.letter??0,-2,12,.1)}${check('Italic','italic',b.italic)}${selectField('Decoration','decoration',b.decoration||'none',[['none','None'],['underline','Underline'],['line-through','Strikethrough'],['overline','Overline']])}${selectField('Transform','transform',b.transform||'none',[['none','None'],['uppercase','Uppercase'],['lowercase','Lowercase'],['capitalize','Capitalize']])}${selectField('Direction','direction',b.direction||'auto',[['auto','Auto'],['rtl','RTL'],['ltr','LTR']])}${color('Text color','color',b.color||'#101828')}${color('Text selection highlight','textShadowColor',b.textShadowColor||'#00000000')}`).outerHTML;
  }

  /* V122 — اندازهٔ دلخواه px برای ویرایشگرهای متن (جای ۷ گزینهٔ ثابت قبلی).
     اگر داخل ادیتور انتخاب متنی باشد روی همان بخش اعمال می‌شود (execCommand)،
     وگرنه اندازهٔ کل عنصر (size) عوض می‌شود. */
  function richFontSizeRow(id,curPx){
    const px=Number(curPx)||18;
    return `<div class="rich-size-row"><label class="rich-size-row__label">اندازه (px)</label><input type="number" class="rich-size-input" data-rich-px="${id}" min="6" max="300" step="1" value="${px}"><button type="button" class="mini-btn" data-rich-px-apply="${id}" title="اعمال روی متن انتخاب‌شده">اعمال</button></div>`;
  }
  /* ===== V144 — ویرایشگر متن حرفه‌ای (Text Studio) =====
     - همیشه باز، بدون اکوردیون فونت
     - انتخاب متن حفظ می‌شود حتی وقتی روی فیلدهای پنل کلیک می‌کنی
     - استایل‌دهی بخشی از متن (اندازه/فونت/وزن/فاصله حروف/رنگ/هایلایت) با موتور span خودمان، نه execCommand('fontSize')
     - رنگ/نوع/ضخامت زیرخط و خط‌خورده
     - چینش و جهت نوشتار داخل همین پنل */
  const RTE_ICO={
    alignRight:'<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 5h14M7 8.5h10M3 12h14M9 15.5h8"/></svg>',
    alignCenter:'<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 5h14M5.5 8.5h9M3 12h14M6.5 15.5h7"/></svg>',
    alignLeft:'<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 5h14M3 8.5h10M3 12h14M3 15.5h8"/></svg>',
    justify:'<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 5h14M3 8.5h14M3 12h14M3 15.5h14"/></svg>',
    rtl:'<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3.5h7M12.5 3.5v9M9.5 3.5a3 3 0 0 0 0 6h3"/><path d="M16 16.5H4m0 0 2.5-2.5M4 16.5 6.5 19"/></svg>',
    ltr:'<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3.5h7M7.5 3.5v9M10.5 3.5a3 3 0 0 1 0 6h-3"/><path d="M4 16.5h12m0 0-2.5-2.5m2.5 2.5L13.5 19"/></svg>',
    link:'<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1"/></svg>',
    clear:'<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5h10M9 4.5 7 16"/><path d="m12.5 12 4 4m0-4-4 4"/></svg>',
    bucket:'<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m8 2.8 7 7-5.6 5.6a1.5 1.5 0 0 1-2.1 0L2.4 10.5a1.5 1.5 0 0 1 0-2.1L8 2.8Z"/><path d="M2.6 9.4h11.8"/><path d="M16.8 12.2s1.4 1.7 1.4 2.7a1.4 1.4 0 0 1-2.8 0c0-1 1.4-2.7 1.4-2.7Z" fill="currentColor" stroke="none"/></svg>',
    minus:'<svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2.5 6h7"/></svg>',
    plus:'<svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2.5 6h7M6 2.5v7"/></svg>',
    letter:'<svg viewBox="0 0 22 16" width="18" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m2 11 3-8 3 8M3 8.5h4M14 11l3-8 3 8M15 8.5h4"/><path d="M8.5 14h5m0 0-1.2-1.2M13.5 14l-1.2 1.2M8.5 14l1.2-1.2M8.5 14l1.2 1.2" stroke-width="1.2"/></svg>',
    line:'<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h9M9 10h9M9 15h9"/><path d="M4 3v14M2.3 4.8 4 3l1.7 1.8M2.3 15.2 4 17l1.7-1.8"/></svg>',
    size:'<svg viewBox="0 0 22 16" width="18" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4V2.5h8V4M6 2.5v11M4.5 13.5h3"/><path d="M12 8V7h7v1M15.5 7v6.5M14.5 13.5h2"/></svg>'
  };
  const RTE_SWATCHES=['#101828','#344054','#667085','#98A2B3','#D0D5DD','#FFFFFF','#175CD3','#2E90FA','#7F56D9','#DD2590','#F04438','#F79009','#FDB022','#12B76A','#099250','#0BA5EC','#FFF2A8','#FEE4E2','#D1FADF','#E0EAFF'];
  function rteKeys(b){
    const T=b&&b.type;
    return {size:T==='header'?'logoSize':'size', color:(T==='button'||T==='header')?'fg':'color', font:'fontFamily', weight:'weight', letter:'letter', line:'line', align:'align', dir:'direction'};
  }
  function rteStepper(kind,label,icon,value,step,min,max,unit){
    return `<div class="rte2-step" data-rte-step="${kind}" title="${attr(label)}"><span class="rte2-step__ico">${icon}</span><button type="button" class="rte2-step__btn" data-rte-dec="${kind}" aria-label="کم">${RTE_ICO.minus}</button><input type="number" inputmode="decimal" class="rte2-step__inp" data-rte-num="${kind}" value="${attr(value)}" step="${step}" min="${min}" max="${max}"><button type="button" class="rte2-step__btn" data-rte-inc="${kind}" aria-label="زیاد">${RTE_ICO.plus}</button>${unit?`<span class="rte2-step__unit">${unit}</span>`:''}</div>`;
  }
  function richEditor(b){
    const K=rteKeys(b);
    const curPx=Number(b[K.size])||18;
    const align=b.align||'right';
    const dir=b.direction||'auto';
    const col=b[K.color]||'#101828';
    const weights=[[100,'Thin 100'],[200,'Extra Light 200'],[300,'Light 300'],[400,'Regular 400'],[500,'Medium 500'],[600,'Semi Bold 600'],[700,'Bold 700'],[800,'Extra Bold 800'],[900,'Black 900']];
    const wCur=Number(b.weight)||400;
    const ab=(v,ico,t)=>`<button type="button" class="rte2-btn${align===v?' is-on':''}" data-rte-align="${v}" title="${t}">${ico}</button>`;
    const db=(v,ico,t)=>`<button type="button" class="rte2-btn rte2-btn--txt${dir===v?' is-on':''}" data-rte-dir="${v}" title="${t}">${ico}<span>${v.toUpperCase()}</span></button>`;
    const edStyle=`text-align:${align==='justify'?'justify':align};${dir!=='auto'?`direction:${dir};`:''}`;
    return `<div class="rte2" data-rte-root="main-rich">
      <div class="rte2-head"><span class="rte2-title">ویرایشگر متن</span><span class="rte2-scope" data-rte-scope><i></i><b>روی کل متن</b></span></div>
      <div class="rte2-bar">
        <div class="rte2-row rte2-row--font">
          <select class="rte2-select rte2-select--font" data-rich-font="main-rich" data-rte-font title="فونت">${fontOptionsHtml(b.fontFamily)}</select>
          <select class="rte2-select rte2-select--weight" data-rte-weight title="وزن فونت">${weights.map(([v,l])=>`<option value="${v}" ${wCur===v?'selected':''}>${l}</option>`).join('')}</select>
        </div>
        <div class="rte2-row rte2-row--steps">
          ${rteStepper('size','اندازهٔ متن (px)',RTE_ICO.size,curPx,1,6,300,'px')}
          ${rteStepper('letter','فاصلهٔ حروف (px)',RTE_ICO.letter,Number(b.letter)||0,0.5,-5,40,'')}
          ${rteStepper('line','ارتفاع خط',RTE_ICO.line,Number(b.line)||1.9,0.05,0.05,4,'')}
        </div>
        <div class="rte2-row">
          <div class="rte2-group">
            <button type="button" class="rte2-btn" data-rte-cmd="bold" title="بولد (Ctrl+B)"><b>B</b></button>
            <button type="button" class="rte2-btn" data-rte-cmd="italic" title="ایتالیک (Ctrl+I)"><i style="font-family:Georgia,serif">I</i></button>
            <button type="button" class="rte2-btn" data-rte-cmd="underline" title="زیرخط (Ctrl+U)"><u>U</u></button>
            <button type="button" class="rte2-btn" data-rte-cmd="strikeThrough" title="خط‌خورده"><s>S</s></button>
            <button type="button" class="rte2-btn rte2-btn--deco" data-rte-pop="deco" title="رنگ و نوع خط زیر/رو"><span class="rte2-deco-ico"><u>U</u><s>S</s></span><span class="rte2-caret">▾</span></button>
          </div>
          <div class="rte2-group">
            <button type="button" class="rte2-btn rte2-btn--color" data-rte-pop="color" title="رنگ متن"><span class="rte2-a">A</span><span class="rte2-bar-swatch" data-rte-sw="color" style="background:${attr(col)}"></span></button>
            <button type="button" class="rte2-btn rte2-btn--color" data-rte-pop="highlight" title="هایلایت (رنگ پس‌زمینهٔ متن)">${RTE_ICO.bucket}<span class="rte2-bar-swatch" data-rte-sw="highlight" style="background:#FFF2A8"></span></button>
          </div>
          <div class="rte2-group">
            <button type="button" class="rte2-btn" data-rte-cmd="createLink" title="لینک">${RTE_ICO.link}</button>
            <button type="button" class="rte2-btn rte2-btn--sm" data-rte-cmd="unlink" title="حذف لینک"><span style="text-decoration:line-through;font-size:11px">🔗</span></button>
            <button type="button" class="rte2-btn" data-rte-cmd="removeFormat" title="پاک کردن فرمت">${RTE_ICO.clear}</button>
          </div>
          <div class="rte2-group">
            <button type="button" class="rte2-btn rte2-btn--sm" data-rte-cmd="insertUnorderedList" title="لیست نقطه‌ای">•≡</button>
            <button type="button" class="rte2-btn rte2-btn--sm" data-rte-cmd="insertOrderedList" title="لیست شماره‌دار">1≡</button>
          </div>
        </div>
        <div class="rte2-row">
          <div class="rte2-group rte2-group--seg">${ab('right',RTE_ICO.alignRight,'راست‌چین')}${ab('center',RTE_ICO.alignCenter,'وسط‌چین')}${ab('left',RTE_ICO.alignLeft,'چپ‌چین')}${ab('justify',RTE_ICO.justify,'تراز دو طرف')}</div>
          <div class="rte2-group rte2-group--seg">${db('rtl',RTE_ICO.rtl,'راست‌به‌چپ (فارسی)')}${db('ltr',RTE_ICO.ltr,'چپ‌به‌راست (انگلیسی)')}</div>
          <div class="rte2-group">
            <button type="button" class="rte2-btn rte2-btn--sm" data-rte-cmd="superscript" title="بالانویس">x<sup>2</sup></button>
            <button type="button" class="rte2-btn rte2-btn--sm" data-rte-cmd="subscript" title="زیرنویس">x<sub>2</sub></button>
          </div>
        </div>
      </div>
      <div id="richTextEditor" class="rich-editor rte2-editor" contenteditable="true" spellcheck="true" ${dir!=='auto'?`dir="${dir}"`:''} style="${edStyle}">${b.html||plainToHtml(b.text||'متن جدید')}</div>
      <div class="rte2-foot">بخشی از متن را انتخاب کن تا تغییرات فقط روی همان بخش اعمال شود؛ بدون انتخاب، روی کل متن.</div>
    </div>`;
  }




/* ===== V110 - core-element field helpers ==============================
   Short labels, Persian-first: sliders instead of raw number inputs, so the
   tab for the 8 main elements reads at a glance. */
  /* V110 - media-library URL field for any key (video/audio/embed/icon sources). */
  function mediaInput(label,key,value){return `<div class="field v68-media-field"><div class="field-head"><label>${label}</label><button type="button" class="mini-btn v68-media-open" data-media-open="${attr(key)}">▧ کتابخانه</button></div><div class="v68-media-input-row"><input data-bind="${key}" value="${attr(value??'')}" type="text"><button type="button" class="mini-btn" data-media-open="${attr(key)}" title="انتخاب از Media Library">انتخاب</button></div></div>`;}
  function mediaPickerField(label,key,value){ return mediaInput(label,key,value||''); }
  function chl(title,body){return section(title,body).outerHTML;}
  function fieldGroup(title,inner){return `<div class="inspector-section"><div class="inspector-section__body field-group"><div class="field-group__title">${title}</div>${inner}</div></div>`;}
  /* ===== V111 — fx kit: switch rows, gradient stops, stroke card, frame card ===== */
  function fxRow(icon,label,key,on,hint){
    return `<div class="fx-row${on?' on':''}"><span class="fx-row__ico">${icon}</span><span class="fx-row__lbl">${label}${hint?`<small>${hint}</small>`:''}</span><label class="switch"><input type="checkbox" data-bind="${attr(key)}" ${on?'checked':''}><span class="switch__track"></span></label></div>`;
  }
  function gradRow(label,keyPrefix,b,toggleKey){
    toggleKey=toggleKey||(keyPrefix+'.fxGrad');
    const onv=(p)=>p.split('.').reduce((o,k)=>(o==null?o:o[k]),b);
    const on=onv(toggleKey)===true;
    const src=keyPrefix==='fx'?b:(b.frame&&typeof b.frame==='object'?b.frame:b);
    const stops=Array.isArray(src.gradStops)&&src.gradStops.length>=2?src.gradStops:[{c:src.bg||b.bg||'#4F46E5',p:0},{c:src.grad2||b.grad2||'#EC4899',p:100}];
    const hex=(v)=>{const x=String(v||'');return /^#[0-9a-fA-F]{6}$/.test(x)?x:(/^#[0-9a-fA-F]{8}$/.test(x)?x.slice(0,7):'#4F46E5');};
    const rows=stops.map((st,i)=>`<div class="grad-stop"><input type="color" value="${hex(st.c)}" data-grad-idx="${i}" data-grad-color="${attr(keyPrefix)}"><input type="text" value="${attr(st.c||'')}" data-grad-idx="${i}" data-grad-color="${attr(keyPrefix)}"><input type="number" min="0" max="100" value="${Math.max(0,Math.min(100,Number(st.p)||0))}" data-grad-idx="${i}" data-grad-pos="${attr(keyPrefix)}"><button type="button" class="mini-btn" data-grad-del="${i}" data-grad-delarr="${attr(keyPrefix)}" title="حذف رنگ">🗑</button></div>`).join('');
    const ang=Number(src.fxAngle)||90;
    const bar=`background:linear-gradient(${ang}deg,${stops.map(st=>`${attr(hex(st.c))} ${Math.max(0,Math.min(100,Number(st.p)||0))}%`).join(',')})`;
    const ak=(String(toggleKey)==='fxGrad')?'fxAngle':keyPrefix+'.fxAngle';
    return fxRow('▨',label,toggleKey,on)+`<div class="fx-card${on?' open':''}"><div class="grad-bar" style="${bar}"></div>${rows}<button type="button" class="add-inline" data-grad-add="${attr(keyPrefix)}">+ افزودن رنگ</button><div class="field slider-field"><div class="field-head"><label>زاویه</label><output data-range-output="${ak}">${ang}°</output></div><input class="range" data-bind="${ak}" type="range" min="0" max="360" step="5" value="${ang}"><input class="range-number" data-bind="${ak}" type="number" min="0" max="360" step="5" value="${ang}"></div></div>`;
  }
  function strokeCard(b){
    const on=b.fxStroke===true;
    return fxRow('◯','استروک','fxStroke',on)+`<div class="fx-card${on?' open':''}">${color('رنگ خط','strokeColor',b.strokeColor||'#101828')}${rangeField('ضخامت خط','strokeWidth',b.strokeWidth??2,0.5,8,0.5)}${rangeField('فاصله دور خط','strokeBlur',b.strokeBlur??0,0,12,1)}</div>`;
  }
  /* V112 — پس‌زمینهٔ متن: یک کارت با سه تیک انحصاری (ساده / گرادیان / استروک) */
  function bgTick(icon,label,mode,on,inner){
    return `<div class="fx-row${on?' on':''}"><span class="fx-row__ico">${icon}</span><span class="fx-row__lbl">${label}</span><label class="switch"><input type="checkbox" data-fx-mode="${mode}" ${on?'checked':''}><span class="switch__track"></span></label></div>${on?`<div class="fx-card open">${inner}</div>`:''}`;
  }
  function bgPickCard(b){
    const mode=b.fxMode||(b.fxGrad===true?'gradient':(b.fxStroke===true?'stroke':(b.fxBg===true?'solid':'')));
    const solidInner=color('رنگ پس‌زمینه','bg',b.bg||'#EEF2FF')+rangeField('گردی گوشه','fxRadius',b.fxRadius??14,0,60,1)+rangeField('پدینگ افقی','fxPadX',b.fxPadX??16,0,48,1)+rangeField('پدینگ عمودی','fxPadY',b.fxPadY??10,0,48,1)+selectField('سایه','fxShadow',b.fxShadow||'none',[['none','بدون'],['sm','کم'],['md','متوسط'],['lg','زیاد']]);
    const stops=Array.isArray(b.gradStops)&&b.gradStops.length>=2?b.gradStops:[{c:b.bg||'#4F46E5',p:0},{c:b.grad2||'#EC4899',p:100}];
    const hex=(v)=>{const x=String(v||'');return /^#[0-9a-fA-F]{6}$/.test(x)?x:(/^#[0-9a-fA-F]{8}$/.test(x)?x.slice(0,7):'#4F46E5');};
    const rows=stops.map((st,i)=>`<div class="grad-stop"><input type="color" value="${hex(st.c)}" data-grad-idx="${i}" data-grad-color="fx"><input type="text" value="${attr(st.c||'')}" data-grad-idx="${i}" data-grad-color="fx"><input type="number" min="0" max="100" value="${Math.max(0,Math.min(100,Number(st.p)||0))}" data-grad-idx="${i}" data-grad-pos="fx"><button type="button" class="mini-btn" data-grad-delarr="fx" data-grad-del="${i}">🗑</button></div>`).join('');
    const ang=Number(b.fxAngle)||90;
    const bar=`background:linear-gradient(${ang}deg,${stops.map(st=>`${attr(hex(st.c))} ${Math.max(0,Math.min(100,Number(st.p)||0))}%`).join(',')})`;
    const gradInner=`<div class="grad-bar" style="${bar}"></div>${rows}<button type="button" class="add-inline" data-grad-add="fx">+ افزودن رنگ</button><div class="field slider-field"><div class="field-head"><label>زاویه</label><output data-range-output="fxAngle">${ang}°</output></div><input class="range" data-bind="fxAngle" type="range" min="0" max="360" step="5" value="${ang}"></div>`;
    const strokeInner=color('رنگ خط','strokeColor',b.strokeColor||'#101828')+rangeField('ضخامت خط','strokeWidth',b.strokeWidth??2,1,8,0.5)+selectField('نوع خط','frameStyle',b.frameStyle||'solid',[['solid','خط ممتد'],['dashed','خط‌چین'],['dotted','نقطه‌چین']])+rangeField('گردی گوشه','fxRadius',b.fxRadius??14,0,60,1);
    return fieldGroup('پس‌زمینه',
      bgTick('▦','پس‌زمینه ساده','solid',mode==='solid',solidInner)
      +bgTick('▨','پس‌زمینه Gradient','gradient',mode==='gradient',gradInner)
      +bgTick('◯','پس‌زمینه Stroke','stroke',mode==='stroke',strokeInner));
  }
  function iconFrameCard(b,perRow){
    const mode=b.frameMode||'plain';
    return selectField('حالت قاب','frameMode',mode,[['plain','رنگ ساده'],['gradient','گرادیان'],['stroke','خط‌دار'],['none','بدون قاب']])
      +(mode==='plain'?color('رنگ قاب','bg',b.bg||'#EEF4FF'):'')
      +(mode==='gradient'?gradRow('گرادیان قاب','frame',b):'')
      +(mode==='stroke'?color('رنگ خط','strokeColor',b.strokeColor||'#101828')+rangeField('ضخامت خط','strokeWidth',b.strokeWidth??2,1,8,0.5)+selectField('نوع خط','frameStyle',b.frameStyle||'solid',[['solid','خط ممتد'],['dashed','خط‌چین'],['dotted','نقطه‌چین']]):'')
      +(perRow?'':selectField('شکل قاب','shape',b.shape||'rounded',[['rounded','گرد گوشه'],['circle','دایره'],['pill','کپسول']]));
  }

  /* ===== V133 — کارت‌های هدر و فوتر سایت (عناصر شل) ======================
     چهار تب: محتوا / طراحی / فاصله‌گذاری / پیشرفته. همهٔ کلیدها همان کلیدهایی‌اند
     که رندرر مشترک (widget-renderer.js) می‌خواند — هیچ کنترل مرده‌ای در پنل نیست. */
  /* V134 — پریست‌های ظاهری آمادهٔ هدر (یک کلیک، چند فیلد با هم) */
  function shellHeaderPresetCard(b){
    const presets=[
      {id:'light',label:'روشن (سفید)',desc:'هدر سفید تمیز با متن تیره — پیش‌فرض امن',apply:()=>({bgMode:'solid',bg:'#FFFFFF',fg:'#101828',linkColor:'#101828',linkHoverColor:'#175CD3',linkActiveColor:'#175CD3'})},
      {id:'dark',label:'تیره',desc:'سرمه‌ای عمیق با لینک‌های روشن — برای هیرو تیره',apply:()=>({bgMode:'solid',bg:'#0B1220',fg:'#F8FAFC',linkColor:'#E2E8F0',linkHoverColor:'#FFFFFF',linkActiveColor:'#7DD3FC'})},
      {id:'glass',label:'گلس (بلور)',desc:'نیمه‌شفاف با بلور پشت‌زمینه — مدرن',apply:()=>({bgMode:'glass',bg:'#FFFFFF',bgOpacity:72,blur:12,fg:'#101828',linkColor:'#101828',linkHoverColor:'#175CD3',linkActiveColor:'#175CD3'})},
      {id:'transparent',label:'شفاف',desc:'بدون پس‌زمینه — می‌نشیند روی محتوای صفحه',apply:()=>({bgMode:'transparent',fg:'#FFFFFF',linkColor:'#FFFFFF',linkHoverColor:'#FFFFFF',linkActiveColor:'#FFFFFF'})}
    ];
    const cur=(x)=>x.apply().bgMode===b.bgMode&&x.apply().bg===b.bg;
    return chl('پریست ظاهری (یک کلیک)', presets.map(p=>`<button type="button" class="pat-swatch${cur(p)?' on':''}" data-hdr-preset="${p.id}" title="${attr(p.desc)}"><span class="pat-swatch__lbl">${esc(p.label)}</span></button>`).join('')+'<div class="helper">پریست رنگ پس‌زمینه، متن و لینک‌ها را با هم ست می‌کند — بعدش می‌توانی تک‌تک فیلدها را جدا تغییر بدهی.</div>');
  }
  function bindShellHeaderPresets(){
    inspector.querySelectorAll('[data-hdr-preset]').forEach(btn=>btn.addEventListener('click',()=>{
      const f=find(selectedId)?.b;if(!f)return;
      const map={light:{bgMode:'solid',bg:'#FFFFFF',fg:'#101828',linkColor:'#101828',linkHoverColor:'#175CD3',linkActiveColor:'#175CD3'},dark:{bgMode:'solid',bg:'#0B1220',fg:'#F8FAFC',linkColor:'#E2E8F0',linkHoverColor:'#FFFFFF',linkActiveColor:'#7DD3FC'},glass:{bgMode:'glass',bg:'#FFFFFF',bgOpacity:72,blur:12,fg:'#101828',linkColor:'#101828',linkHoverColor:'#175CD3',linkActiveColor:'#175CD3'},transparent:{bgMode:'transparent',fg:'#FFFFFF',linkColor:'#FFFFFF',linkHoverColor:'#FFFFFF',linkActiveColor:'#FFFFFF'}};
      const p=map[btn.dataset.hdrPreset];if(!p)return;
      Object.assign(f,p);
      snapshot(); scheduleSave(); scheduleCanvasRender(); setTimeout(()=>updateInspector(),0);
      showToast('پریست اعمال شد');
    }));
  }
  function shellHeaderContentFields(b){
    const navChip=(x,i)=>`<div class="repeater"><div class="field-head"><b>لینک ${i+1}</b>${buttonRm('headerNav',i)}</div>${input('متن','nav.'+i+'.label',x.label||'')}${input('آیکون / ایموجی (اختیاری)','nav.'+i+'.icon',x.icon||'')}${selectField('مقصد','nav.'+i+'.linkKind',x.linkKind||x.target||'none',[['none','لینک دلخواه'],['checkout','صفحه پرداخت'],['subpage','زیرصفحه محصول']])}${((x.linkKind||x.target||'none')==='subpage')?subPageSelectField('زیرصفحه مقصد','nav.'+i+'.subpage',String(x.subpage||'').replace(/^\/+/, '')):input('آدرس','nav.'+i+'.url',x.url||'#')}<details class="repeater"><summary style="cursor:pointer;font-weight:700;font-size:12px;color:#175CD3">زیرمنو (اختیاری)</summary><div style="padding-top:8px">${(Array.isArray(x.submenu)?x.submenu:[]).map((s,si)=>`<div class="repeater"><div class="field-head"><b>آیتم ${si+1}</b><button type="button" class="mini-danger" data-remove-item="headerSub" data-gi="${i}" data-index="${si}">حذف</button></div>${input('متن','nav.'+i+'.submenu.'+si+'.label',s.label||'')}${input('آدرس','nav.'+i+'.submenu.'+si+'.url',s.url||'#')}</div>`).join('')}<button type="button" class="add-inline" data-add-item="headerSub" data-gi="${i}">+ افزودن به زیرمنو</button></div></details></div>`;
    return chl('خاموش / روشن', fxRow('⏻','هدر فعال باشد','enabled',b.enabled!==false)+'<div class="helper">خاموش‌کردن موقتی است — عنصر و تنظیماتش حذف نمی‌شود و هر وقت بخواهی دوباره روشنش می‌کنی.</div>')
      +chl('لوگو', selectField('نوع لوگو','logoType',b.logoType||'text',[['text','متن برند'],['image','تصویر / لوگو']])+(b.logoType==='image'?mediaPickerField('تصویر لوگو','logoUrl',b.logoUrl||''):input('متن برند','logoText',b.logoText||'RAVA'))+rangeField('اندازه متن لوگو','logoSize',b.logoSize??22,12,64,1)+'<div class="helper">برای متن برند، بخش «متن برند» را از ویرایشگر زیر بنویس (بولد/رنگ/لینک پشتیبانی می‌شود).</div>'+(b.logoType!=='image'?richEditor(b):''))
      +chl('لینک‌های نویگیشن', (Array.isArray(b.nav)?b.nav:[]).map(navChip).join('')+'<button type="button" class="add-inline" data-add-item="headerNav">+ افزودن لینک</button>')
      +chl('دکمه CTA', fxRow('★','دکمه CTA روشن باشد','ctaEnabled',b.ctaEnabled!==false)+(b.ctaEnabled!==false?input('متن دکمه','ctaLabel',b.ctaLabel||'شروع')+input('لینک','ctaUrl',b.ctaUrl||'#buy')+color('رنگ پس‌زمینه','ctaBg',b.ctaBg||'#175CD3')+color('رنگ متن','ctaFg',b.ctaFg||'#FFFFFF')+rangeField('گردی گوشه','ctaRadius',b.ctaRadius??12,0,40,1):''))
      +chl('آیتم سفارشی (عکس + لینک)', (Array.isArray(b.items)?b.items:[]).map((x,i)=>`<div class="repeater"><div class="field-head"><b>آیتم ${i+1}</b>${buttonRm('headerItems',i)}</div>${mediaPickerField('عکس (لوگو/برند)','items.'+i+'.src',x.src||'')}${input('لینک','items.'+i+'.url',x.url||'#')}${input('Alt (متن جایگزین)','items.'+i+'.alt',x.alt||'')}${rangeField('ارتفاع عکس (px)','items.'+i+'.size',x.size??28,14,96,1)}${check('بازشدن در تب جدید','items.'+i+'.newTab',x.newTab===true)}</div>`).join('')+'<button type="button" class="add-inline" data-add-item="headerItems">+ افزودن آیتم</button><div class="helper">مثلاً لوگوی دوم، نشان اعتماد، یا آیکون شبکهٔ اجتماعی با عکس دلخواه — کل عکس لینک است.</div>');
  }
  function shellFooterContentFields(b){
    const linkChip=(x,i,kind)=>`<div class="repeater"><div class="field-head"><b>لینک ${i+1}</b>${buttonRm(kind,i)}</div>${input('متن','bottomLinks.'+i+'.label',x.label||'')}${input('آدرس','bottomLinks.'+i+'.url',x.url||'#')}</div>`;
    return chl('خاموش / روشن', fxRow('⏻','فوتر فعال باشد','enabled',b.enabled!==false)+'<div class="helper">خاموش‌کردن موقتی است — عنصر و تنظیماتش حذف نمی‌شود.</div>')
      +chl('لوگو / برند', mediaPickerField('تصویر لوگو (اختیاری)','logoUrl',b.logoUrl||'')+input('نام برند','brandName',b.brandName||'RAVA')+richField('توضیح کوتاه','brandDesc',b.brandDesc||''))
      +chl('گروه‌های لینک', (Array.isArray(b.groups)?b.groups:[]).map((g,gi)=>`<div class="repeater"><div class="field-head"><b>گروه ${gi+1}</b>${buttonRm('footerGroups',gi)}</div>${input('عنوان گروه','groups.'+gi+'.title',g.title||'')}${(Array.isArray(g.links)?g.links:[]).map((x,li)=>{const y=x;return `<div class="repeater"><div class="field-head"><b>لینک ${li+1}</b><button type="button" class="mini-danger" data-remove-item="footerLink" data-gi="${gi}" data-index="${li}">حذف</button></div>${input('متن','groups.'+gi+'.links.'+li+'.label',y.label||'')}${input('آدرس','groups.'+gi+'.links.'+li+'.url',y.url||'#')}</div>`;}).join('')}<button type="button" class="add-inline" data-add-item="footerLink" data-gi="${gi}">+ افزودن لینک</button></div>`).join('')+'<button type="button" class="add-inline" data-add-item="footerGroups">+ افزودن گروه</button><div class="helper">فرق فوتر با هدر همین‌جاست: هر گروه عنوان خودش و لیست لینک مخصوص خودش را دارد (مثل «محصول»، «شرکت»، «قوانین»).</div>')
      +chl('شبکه‌های اجتماعی', fxRow('●','آیکون‌های اجتماعی روشن باشند','socialEnabled',b.socialEnabled!==false)+(b.socialEnabled!==false?(Array.isArray(b.socials)?b.socials:[]).map((x,i)=>`<div class="repeater"><div class="field-head"><b>شبکه ${i+1}</b>${buttonRm('footerSocials',i)}</div>${input('نام','socials.'+i+'.label',x.label||'')}${input('آیکون / ایموجی','socials.'+i+'.icon',x.icon||'◎')}${input('آدرس','socials.'+i+'.url',x.url||'#')}</div>`).join('')+'<button type="button" class="add-inline" data-add-item="footerSocials">+ افزودن شبکه</button>':''))
      +chl('فرم خبرنامه', fxRow('✉','فرم خبرنامه روشن باشد','newsletterEnabled',b.newsletterEnabled===true)+(b.newsletterEnabled===true?input('عنوان فرم','newsletterLabel',b.newsletterLabel||'عضویت در خبرنامه')+input('متن جای‌نگهدار','newsletterPlaceholder',b.newsletterPlaceholder||'ایمیل شما')+input('متن دکمه','newsletterButton',b.newsletterButton||'عضویت'):''))
      +chl('کپی‌رایت', input('متن کپی‌رایت','copyright',b.copyright||'© {year} RAVA — تمامی حقوق محفوظ است.')+'<div class="helper">توکن <b dir="ltr">{year}</b> خودکار با سال جاری جایگزین می‌شود — نیازی به آپدیت دستی هر سال نیست.</div>')
      +chl('ردیف لینک‌های پایینی', (Array.isArray(b.bottomLinks)?b.bottomLinks:[]).map((x,i)=>linkChip(x,i,'footerBottom')).join('')+'<button type="button" class="add-inline" data-add-item="footerBottom">+ افزودن لینک</button>'+'<div class="helper">مثلاً «حریم خصوصی» و «قوانین» — کنار متن کپی‌رایت در پایین‌ترین ردیف.</div>');
  }
  function shellPatternFields(b,selKey){
    const groups=[['tile','خطی و کاشی‌ای'],['gradient','گرادینتی (لایه‌ای)'],['texture','بافتی'],['fixed','ثابت']];
    const list=patternList();
    const cur=String(b[selKey]||'').split(',')[0];
    const sw=(id)=>`<button type="button" class="pat-swatch${cur===id?' on':''}" data-shell-pat="${id}" data-shell-pat-key="${selKey}" title="${esc((list.find(x=>x.id===id)||{}).label||id)}"><span class="pat-swatch__prev pat-prev--${id}"></span><span class="pat-swatch__lbl">${esc((list.find(x=>x.id===id)||{}).label||'')}</span></button>`;
    const info=patternInfo(cur);
    let ctrl='';
    if(info){ if(info.params.includes('color'))ctrl+=color('رنگ طرح',selKey===''?'':'patternColor',b.patternColor||'#101828'); if(info.params.includes('size'))ctrl+=rangeField('اندازهٔ کاشی (px)','patternSize',b.patternSize??28,8,120,1); if(info.params.includes('base'))ctrl+=color('رنگ پایه','patternBase',b.patternBase||b.bg||'#FFFFFF'); if(info.params.includes('count'))ctrl+=rangeField('تعداد لکه‌ها','patternCount',b.patternCount??3,2,4,1); ctrl+=rangeField('غلظت طرح ٪','patternOpacity',(b.patternOpacity===''||b.patternOpacity==null)?info.defOpacity:b.patternOpacity,0,100,1); }
    return groups.map(([g,gl])=>list.some(x=>x.group===g)?`<div class="pat-group"><div class="pat-group__title">${gl}</div><div class="pat-grid">${list.filter(x=>x.group===g).map(x=>sw(x.id)).join('')}</div></div>`:'').join('')+ctrl+'<div class="helper">از کتابخانهٔ پترن همان موتور پس‌زمینهٔ صفحه — طرح روی رنگ/گرادیان فعلی می‌نشیند.</div>';
  }
  function shellHeaderDesignFields(b){
    const m=b.bgMode||'solid';
    return shellHeaderPresetCard(b)
      +chl('چیدمان (پریست‌های آماده)', selectField('چیدمان','layout',b.layout||'logo-start',[['logo-start','لوگو یک سمت + نویگیشن سمت دیگر'],['logo-center','لوگو وسط + نویگیشن دو طرف'],['logo-end','لوگو وسط + نویگیشن و آیتم‌ها دو طرف'],['logo-end-nav-end','لوگو یک سمت + نویگیشن سمت دیگر'],['nav-only','فقط نویگیشن (وسط‌چین)']]))
      +chl('پس‌زمینه', selectField('نوع پس‌زمینه','bgMode',m,[['solid','رنگ ثابت'],['transparent','شفاف'],['glass','گلس (بلور)']])+(m==='solid'?color('رنگ پس‌زمینه','bg',b.bg||'#FFFFFF')+shellPatternCard(b,'backgroundPatternId'):'')+(m==='glass'?color('رنگ شیشه','bg',b.bg||'#FFFFFF')+rangeField('شفافیت شیشه ٪','bgOpacity',b.bgOpacity??72,10,100,1)+rangeField('میزان بلور (px)','blur',b.blur??10,0,30,1):'')+(m==='transparent'?'<div class="helper">هدر شفاف روی محتوای صفحه می‌نشیند — برای هیروهای تمام‌صفحه عالی است.</div>':''))
      +chl('ارتفاع هدر', rangeField('ارتفاع هدر (px)','headerHeight',b.headerHeight??64,44,160,1)+'<div class="helper">از خیلی باریک تا خیلی بلند؛ لوگو و پدینگ داخلی خودشان با ارتفاع هماهنگ می‌شوند.</div>')
      +chl('رنگ‌ها', color('رنگ متن/لینک','linkColor',b.linkColor||'#101828')+color('رنگ هاور','linkHoverColor',b.linkHoverColor||'#175CD3')+color('رنگ لینک صفحهٔ فعلی','linkActiveColor',b.linkActiveColor||'#175CD3')+color('رنگ کلی هدر','fg',b.fg||'#101828')+rangeField('اندازه لینک‌ها','linkSize',b.linkSize??14,10,24,1)+rangeField('وزن لینک‌ها','linkWeight',b.linkWeight??600,400,900,100))
      +chl('رفتار موبایل', selectField('نوع منوی موبایل','mobileMenu',b.mobileMenu||'drawer',[['drawer','کشویی از کنار'],['fullscreen','تمام‌صفحه'],['accordion','آکاردئونی زیر هدر']])+'<div class="helper">نویگیشن فقط وقتی جا ندارد به منوی موبایل سوئیچ می‌کند (مثل سایت واقعی) — روی بوم موبایل همان رفتار را می‌بینی.</div>');
  }
  function shellFooterDesignFields(b){
    return chl('ارتفاع', selectField('حالت ارتفاع','footerHeight',b.footerHeight||'auto',[['auto','خودکار'],['compact','کم‌ارتفاع'],['tall','بلند']]))
      +chl('پس‌زمینه', selectField('نوع پس‌زمینه','bgType',b.bgType||'solid',[['solid','رنگ ثابت'],['gradient','گرادیان'],['image','تصویر']])+(b.bgType==='gradient'?color('رنگ ۱','bg',b.bg||'#101828')+color('رنگ ۲','bgGradient2',b.bgGradient2||'#1E293B')+input('جهت گرادیان','bgGradientDir',b.bgGradientDir||'180deg'):b.bgType==='image'?mediaPickerField('تصویر پس‌زمینه','bgImage',b.bgImage||''):color('رنگ پس‌زمینه','bg',b.bg||'#101828'))+shellPatternCard(b,'bgPatternId'))
      +chl('ستون‌ها', rangeField('تعداد ستون گروه‌ها','columns',b.columns??3,1,5,1)+selectField('چیدمان','colsLayout',b.colsLayout||'auto',[['auto','خودکار — به تعداد گروه‌ها'],['grid','شبکهٔ ثابت با تعداد انتخابی']]))
      +chl('خط جداکننده', fxRow('—','خط جداکننده بالای کپی‌رایت','divider',b.divider!==false)+(b.divider!==false?color('رنگ خط جداکننده','dividerColor',b.dividerColor||'#334155'):''))
      +chl('رنگ‌ها', color('رنگ متن','fg',b.fg||'#E2E8F0')+color('رنگ لینک','linkColor',b.linkColor||'#CBD5E1')+color('رنگ هاور لینک','linkHoverColor',b.linkHoverColor||'#FFFFFF')+color('رنگ متن کم‌رنگ','mutedColor',b.mutedColor||'#94A3B8'));
  }
  function shellPatternCard(b,selKey){
    const cur=String(b[selKey]||'').split(',')[0];
    return `<div class="field"><label>طرح پس‌زمینه (اختیاری)</label><select data-shell-pat-select="${selKey}"><option value="" ${!cur?'selected':''}>بدون طرح</option>${patternList().map(x=>`<option value="${attr(x.id)}" ${cur===x.id?'selected':''}>${esc(x.label)}</option>`).join('')}</select></div>${cur?shellPatternFields(b,selKey):''}`;
  }
  /* ===== V140 — Icon cards + Iconify ======================================
     Data per card (block.icons[i]):
       icon       emoji / text glyph            iconUrl   image URL
       iconSvg    sanitized inline SVG (Iconify or pasted)   iconify  'prefix:name'
       iconPalette  true = multicolor → color controls are disabled
       url, newTab  optional link                color     '' = design-tab color
       noFill       drop the fill (outline look with stroke)
       strokeOn, strokeColor, strokeWidth (px)
     Iconify is only touched inside the builder (search / library / pick). The picked
     SVG is saved into the page, so published pages stay dependency-free. */
  const ICX_API='https://api.iconify.design';
  const ICX_SETS=[['solar','Solar'],['tabler','Tabler'],['lucide','Lucide'],['ph','Phosphor'],['material-symbols','Material'],['mdi','MDI'],['heroicons','Heroicons'],['simple-icons','برندها'],['logos','لوگو رنگی'],['fluent-emoji-flat','ایموجی رنگی']];
  const ICX_PAGE=60;
  const icx={json:new Map(),svg:new Map(),ui:new Map(),timers:{},ctrl:{}};
  function icxUi(b,i){ const k=(b&&b.id||'x')+':'+i; if(!icx.ui.has(k)) icx.ui.set(k,{q:'',limit:48,res:null,err:'',loading:false,libOpen:false,set:'solar',names:null,shown:ICX_PAGE,libErr:''}); return icx.ui.get(k); }
  /* V140.1 — Iconify over the JSON API only (the same endpoint search/collection use).
     The per-icon .svg endpoint and <img> thumbnails were failing on some networks, so
     icons are now fetched in batches as JSON bodies and built into inline SVG locally.
     Three official Iconify hosts are tried in order; results are cached in memory and
     localStorage, so each icon is downloaded once. */
  const ICX_HOSTS=['https://api.iconify.design','https://api.simplesvg.com','https://api.unisvg.com'];
  let icxHostIdx=0;
  async function icxFetchJson(path){
    let lastErr;
    for(let t=0;t<ICX_HOSTS.length;t++){
      const h=ICX_HOSTS[(icxHostIdx+t)%ICX_HOSTS.length];
      try{
        const ctl=new AbortController(); const tm=setTimeout(()=>ctl.abort(),9000);
        const r=await fetch(h+path,{cache:'force-cache',signal:ctl.signal}); clearTimeout(tm);
        if(!r.ok) throw new Error('HTTP '+r.status);
        const j=await r.json(); icxHostIdx=(icxHostIdx+t)%ICX_HOSTS.length; return j;
      }catch(e){ lastErr=e; }
    }
    throw lastErr||new Error('iconify unreachable');
  }
  function icxJson(url){
    const path=String(url).replace(/^https:\/\/[^/]+/,'');
    if(icx.json.has(path)) return icx.json.get(path);
    const pr=icxFetchJson(path); icx.json.set(path,pr); pr.catch(()=>icx.json.delete(path)); return pr;
  }
  function icxCleanSvg(s){ const W=window.WidgetRenderer; return W&&W.cleanSvg?W.cleanSvg(s):''; }
  function icxIsPalette(s){ const W=window.WidgetRenderer; return !!(W&&W.svgIsPalette&&W.svgIsPalette(s)); }
  function icxCacheGet(id){
    if(icx.svg.has(id)) return icx.svg.get(id);
    try{ const hit=localStorage.getItem('rava.icx2.'+id); if(hit){ icx.svg.set(id,hit); return hit; } }catch(_){}
    return '';
  }
  function icxBuild(data,name){
    const icons=data.icons||{}, aliases=data.aliases||{};
    let ic=icons[name], extra={}, guard=0, cur=name;
    while(!ic&&aliases[cur]&&guard++<6){ extra=Object.assign({},aliases[cur],extra); cur=aliases[cur].parent; ic=icons[cur]; }
    if(!ic||!ic.body) return '';
    const o=Object.assign({left:data.left||0,top:data.top||0,width:data.width||16,height:data.height||16},ic,extra);
    let body=o.body; const w=o.width,h=o.height;
    const tf=[]; const rot=((Number(o.rotate)||0)%4+4)%4;
    if(o.hFlip) tf.push(`translate(${w+2*o.left} 0) scale(-1 1)`);
    if(o.vFlip) tf.push(`translate(0 ${h+2*o.top}) scale(1 -1)`);
    if(rot) tf.push(`rotate(${rot*90} ${o.left+w/2} ${o.top+h/2})`);
    if(tf.length) body=`<g transform="${tf.join(' ')}">${body}</g>`;
    return icxCleanSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="${o.left} ${o.top} ${w} ${h}">${body}</svg>`);
  }
  /* batch-load many ids: one request per icon set (chunked) */
  async function icxLoad(ids){
    const need={};
    [...new Set(ids)].forEach(id=>{ id=String(id||'').toLowerCase(); if(!ICX_ID_RE.test(id)||icxCacheGet(id)) return; const [p,n]=id.split(':'); (need[p]=need[p]||[]).push(n); });
    const jobs=[];
    Object.entries(need).forEach(([p,names])=>{ for(let k=0;k<names.length;k+=80){ const part=names.slice(k,k+80); jobs.push(icxJson(`/${encodeURIComponent(p)}.json?icons=${part.map(encodeURIComponent).join(',')}`).then(j=>{ part.forEach(n=>{ const svg=icxBuild(j||{},n); if(svg){ const id=p+':'+n; icx.svg.set(id,svg); try{ localStorage.setItem('rava.icx2.'+id,svg); }catch(_){} } }); })); } });
    await Promise.allSettled(jobs);
  }
  async function icxSvg(id){
    id=String(id||'').trim().toLowerCase();
    let svg=icxCacheGet(id); if(svg) return svg;
    await icxLoad([id]); svg=icxCacheGet(id);
    if(!svg) throw new Error('not found');
    return svg;
  }
  function icxCell(id,i,cur){ const svg=icxCacheGet(id); return `<button type="button" class="ic-cell${cur===id?' on':''}" data-ic-pick="${attr(id)}" data-ic-idx="${i}" title="${attr(id)}"><span class="ic-cell__svg${svg?'':' is-pending'}" data-ic-thumb="${attr(id)}">${svg}</span></button>`; }
  /* fill thumbnails that aren't cached yet (one batched request per set) */
  function icxHydrate(root){
    if(!root) return;
    const els=[...root.querySelectorAll('[data-ic-thumb].is-pending')]; if(!els.length) return;
    icxLoad(els.map(e=>e.dataset.icThumb)).then(()=>{ els.forEach(e=>{ const svg=icxCacheGet(e.dataset.icThumb); e.classList.remove('is-pending'); if(svg) e.innerHTML=svg; else e.closest('.ic-cell')?.classList.add('is-missing'); }); });
  }
  const ICX_ID_RE=/^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:[-_][a-z0-9]+)*$/i;
  function iconEnsureCards(b){
    if(!b) return [];
    if(!Array.isArray(b.icons)||!b.icons.length){
      const u=String(b.url||'').trim();
      b.icons=[{icon:b.icon||(b.iconUrl?'':'✦'),iconUrl:b.iconUrl||'',url:(u&&u!=='#')?u:'',target:b.target||'_self'}];
      if(b.iconSvg){ b.icons[0].iconSvg=b.iconSvg; }
      b.url='';
    }
    b.icons=b.icons.map(x=>(x&&typeof x==='object')?x:{icon:String(x||'✦')});
    return b.icons;
  }
  function iconKind(x){ return x.iconSvg?'svg':x.iconUrl?'img':'text'; }
  function iconIsEmoji(t){ try{ return /\p{Emoji_Presentation}/u.test(String(t||'')); }catch(_){ return false; } }
  function iconPreview(b,x){
    const k=iconKind(x), col=x.color||b.color||'#175CD3';
    if(k==='svg'){ const W=window.WidgetRenderer; const svg=W&&W.paintSvg?W.paintSvg(x.iconSvg,{size:28,color:col,noFill:x.noFill===true,strokeOn:x.strokeOn===true,strokeColor:x.strokeColor||'#101828',strokeWidth:x.strokeWidth??1.5,palette:x.iconPalette===true}):''; return `<span class="ic-prev__svg">${svg}</span>`; }
    if(k==='img') return `<img src="${attr(x.iconUrl)}" alt="">`;
    return `<span class="ic-prev__txt" style="color:${attr(col)}">${esc(x.icon||'✦')}</span>`;
  }
  function icxResultsHtml(b,i,x){
    const u=icxUi(b,i);
    if(!u.q) return '';
    if(u.loading&&!u.res) return '<div class="ic-note">در حال جستجو…</div>';
    if(u.err) return `<div class="ic-note ic-note--err">${esc(u.err)}</div>`;
    const list=(u.res&&u.res.icons)||[];
    if(!list.length) return '<div class="ic-note">چیزی پیدا نشد — انگلیسی جستجو کن (مثلاً home، star، check).</div>';
    const more=u.res.total>list.length||list.length>=u.limit;
    return `<div class="ic-grid">${list.map(id=>icxCell(id,i,x.iconify)).join('')}</div>${more?`<button type="button" class="ic-more" data-ic-more="${i}">نتایج بیشتر</button>`:''}`;
  }
  function icxLibBodyHtml(b,i,x){
    const u=icxUi(b,i);
    if(!u.libOpen) return '';
    if(u.libErr) return `<div class="ic-note ic-note--err">${esc(u.libErr)}</div>`;
    if(!u.names) return '<div class="ic-note">در حال بارگذاری مجموعه…</div>';
    return `<div class="ic-grid">${u.names.slice(0,u.shown).map(id=>icxCell(id,i,x.iconify)).join('')}</div>${u.names.length>u.shown?`<button type="button" class="ic-more" data-ic-libmore="${i}">بیشتر (${u.names.length-u.shown} آیکون دیگر)</button>`:''}`;
  }
  function icxLibHtml(b,i,x){
    const u=icxUi(b,i);
    const tabs=`<div class="ic-sets">${ICX_SETS.map(([p,l])=>`<button type="button" class="ic-set${u.set===p?' on':''}" data-ic-set="${p}" data-ic-idx="${i}">${esc(l)}</button>`).join('')}</div>`;
    return tabs+`<div data-ic-libbody="${i}">${icxLibBodyHtml(b,i,x)}</div>`;
  }
  function iconCardHtml(b,x,i,count){
    const u=icxUi(b,i), k=iconKind(x);
    const src=k==='svg'?(x.iconify||'SVG سفارشی'):k==='img'?x.iconUrl:(x.icon||'');
    const palette=(k==='svg'&&x.iconPalette===true)||(k==='text'&&iconIsEmoji(x.icon));
    const tag=k==='svg'?(x.iconify?'Iconify':'SVG'):k==='img'?'عکس':(iconIsEmoji(x.icon)?'ایموجی':'متن / نماد');
    const tools=`<span class="rep-tools"><button type="button" class="mini-btn" data-icon-move="${i}" data-icon-dir="-1" title="بالا" ${i===0?'disabled':''}>↑</button><button type="button" class="mini-btn" data-icon-move="${i}" data-icon-dir="1" title="پایین" ${i===count-1?'disabled':''}>↓</button><button type="button" class="mini-btn" data-ic-dup="${i}" title="کپی">⧉</button>${count>1?`<button type="button" class="mini-danger" data-remove-item="icons" data-index="${i}" title="حذف">حذف</button>`:''}</span>`;
    const paint=palette
      ? `<div class="ic-paint is-disabled"><div class="field"><label>رنگ آیکون</label><div class="swatch-input"><input type="text" value="رنگ اصلی" disabled><input type="color" value="#98A2B3" disabled></div></div><div class="helper">این آیکون چندرنگ است؛ رنگش ثابت می‌ماند (Stroke هنوز قابل استفاده است).</div></div>`
      : `<div class="ic-paint">${(k==='img'?check('رنگ‌آمیزی عکس (تک‌رنگ کردن)','icons.'+i+'.tint',x.tint===true):'')}${(k!=='img'||x.tint===true)?color('رنگ آیکون','icons.'+i+'.color',x.color||b.color||'#175CD3'):''}${k!=='img'?check('حذف رنگ (فقط خط دور بماند)','icons.'+i+'.noFill',x.noFill===true):''}${x.noFill===true&&x.strokeOn!==true?'<div class="helper">بدون رنگ و بدون Stroke آیکون دیده نمی‌شود — Stroke را روشن کن.</div>':''}</div>`;
    const stroke=`<div class="ic-stroke">${check('Stroke (خط دور)','icons.'+i+'.strokeOn',x.strokeOn===true)}${x.strokeOn===true?color('رنگ Stroke','icons.'+i+'.strokeColor',x.strokeColor||'#101828')+rangeField('ضخامت Stroke (px)','icons.'+i+'.strokeWidth',x.strokeWidth??1.5,0.5,6,0.5):''}</div>`;
    return `<div class="repeater ic-card" data-ic-card="${i}">
      <div class="field-head ic-card__head"><b>آیکون ${i+1}</b>${tools}</div>
      <div class="ic-search"><span class="ic-search__ico">⌕</span><input type="search" data-ic-search="${i}" value="${attr(u.q)}" placeholder="جستجو در Iconify… (home, star, check)" autocomplete="off" dir="auto"></div>
      <div class="ic-results" data-ic-results="${i}">${icxResultsHtml(b,i,x)}</div>
      <div class="ic-source"><div class="ic-prev">${iconPreview(b,x)}</div><div class="ic-source__main"><label>آیکون / ایموجی / URL عکس</label><div class="ic-source__row"><input data-ic-source="${i}" value="${attr(src)}" placeholder="✦ یا 🔥 یا https://…/icon.png یا mdi:home" dir="auto"><button type="button" class="mini-btn v68-media-open" data-media-open="icons.${i}.iconUrl" title="کتابخانه رسانه">▧</button></div><input type="hidden" data-bind="icons.${i}.iconUrl" value="${attr(x.iconUrl||'')}"><span class="ic-tag">${esc(tag)}</span></div></div>
      <details class="ic-lib" data-ic-lib="${i}" ${u.libOpen?'open':''}><summary>کتابخانه آیکون‌ها (Iconify)</summary><div class="ic-lib__body">${icxLibHtml(b,i,x)}</div></details>
      <div class="ic-link">${input('لینک (اختیاری)','icons.'+i+'.url',x.url||'')}${String(x.url||'').trim()?check('باز شدن در تب جدید','icons.'+i+'.newTab',x.newTab===true):''}</div>
      ${paint}${stroke}
    </div>`;
  }
  function iconBindCards(){
    const f=find(selectedId)?.b; if(!f||!['icon','feature'].includes(f.type)) return;
    const refresh=()=>{ snapshot(); scheduleCanvasRender(); setTimeout(()=>updateInspector(),0); };
    const results=(i)=>{ const box=inspector.querySelector(`[data-ic-results="${i}"]`); const t=find(selectedId)?.b; if(box&&t&&t.icons&&t.icons[i]){ box.innerHTML=icxResultsHtml(t,i,t.icons[i]); icxHydrate(box); } };
    const libBody=(i)=>{ const box=inspector.querySelector(`[data-ic-libbody="${i}"]`); const t=find(selectedId)?.b; if(box&&t&&t.icons&&t.icons[i]){ box.innerHTML=icxLibBodyHtml(t,i,t.icons[i]); icxHydrate(box); } };
    async function runSearch(i){
      const t=find(selectedId)?.b; if(!t) return; const u=icxUi(t,i);
      if(!u.q){ u.res=null; u.err=''; results(i); return; }
      u.loading=true; u.err=''; results(i);
      try{ const q=u.q; const j=await icxJson(`/search?query=${encodeURIComponent(q)}&limit=${u.limit}`); if(u.q!==q) return; u.res={icons:Array.isArray(j.icons)?j.icons:[],total:Number(j.total)||0}; }
      catch(_){ u.err='اتصال به Iconify برقرار نشد. اینترنت را چک کن یا مستقیم ایموجی / URL بگذار.'; }
      u.loading=false; results(i);
    }
    async function loadSet(i){
      const t=find(selectedId)?.b; if(!t) return; const u=icxUi(t,i); u.names=null; u.libErr=''; u.shown=ICX_PAGE; libBody(i);
      try{ const set=u.set; const j=await icxJson(`/collection?prefix=${encodeURIComponent(set)}`); if(u.set!==set) return; const all=new Set(); (j.uncategorized||[]).forEach(n=>all.add(n)); Object.values(j.categories||{}).forEach(a=>(a||[]).forEach(n=>all.add(n))); u.names=[...all].map(n=>set+':'+n); }
      catch(_){ u.libErr='بارگذاری مجموعه ناموفق بود. دوباره امتحان کن.'; }
      libBody(i);
    }
    async function pick(i,id,btn){
      const t=find(selectedId)?.b; if(!t||!t.icons||!t.icons[i]) return;
      btn&&btn.classList.add('is-loading');
      try{ const svg=await icxSvg(id); const it=t.icons[i]; it.iconSvg=svg; it.iconify=id; it.iconPalette=icxIsPalette(svg); it.iconUrl=''; it.icon=''; if(it.iconPalette) it.noFill=false; refresh(); }
      catch(_){ btn&&btn.classList.remove('is-loading'); showToast('دریافت آیکون از Iconify ناموفق بود'); }
    }
    icxHydrate(inspector);
    inspector.querySelectorAll('[data-ic-search]').forEach(el=>{
      const i=Number(el.dataset.icSearch);
      el.addEventListener('input',()=>{ const u=icxUi(f,i); u.q=el.value.trim(); u.limit=48; clearTimeout(icx.timers[i]); icx.timers[i]=setTimeout(()=>runSearch(i),320); });
      el.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); clearTimeout(icx.timers[i]); runSearch(i); } });
    });
    inspector.querySelectorAll('[data-ic-source]').forEach(el=>{
      const i=Number(el.dataset.icSource);
      const looksSpecial=v=>/^(https?:|data:image|\/|<svg)/i.test(v)||ICX_ID_RE.test(v);
      el.addEventListener('input',()=>{ const v=el.value.trim(); const it=f.icons[i]; if(!it||looksSpecial(v)||/:/.test(v)) return; if(it.iconSvg||it.iconUrl) return; it.icon=v; scheduleSave(); scheduleCanvasRender(); const pv=el.closest('.ic-card')?.querySelector('.ic-prev__txt'); if(pv) pv.textContent=v||'✦'; });
      el.addEventListener('change',async()=>{
        const v=el.value.trim(); const it=f.icons[i]; if(!it) return;
        if(it.iconSvg&&(v===it.iconify||(!it.iconify&&v==='SVG سفارشی'))) return;
        if(/^<svg/i.test(v)){ const svg=icxCleanSvg(v); if(!svg){ showToast('SVG معتبر نیست'); return; } Object.assign(it,{iconSvg:svg,iconify:'',iconPalette:icxIsPalette(svg),iconUrl:'',icon:''}); return refresh(); }
        if(/^(https?:\/\/|data:image\/|\/)/i.test(v)){ Object.assign(it,{iconUrl:v,icon:''}); delete it.iconSvg; delete it.iconify; delete it.iconPalette; return refresh(); }
        if(ICX_ID_RE.test(v)){ try{ const svg=await icxSvg(v); Object.assign(it,{iconSvg:svg,iconify:v.toLowerCase(),iconPalette:icxIsPalette(svg),iconUrl:'',icon:''}); return refresh(); }catch(_){ showToast('این آیکون در Iconify پیدا نشد — به‌عنوان متن ذخیره شد'); } }
        Object.assign(it,{icon:v||'✦',iconUrl:''}); delete it.iconSvg; delete it.iconify; delete it.iconPalette; refresh();
      });
    });
    inspector.querySelectorAll('.ic-card').forEach(card=>card.addEventListener('click',e=>{
      const pk=e.target.closest('[data-ic-pick]'); if(pk){ e.preventDefault(); pick(Number(pk.dataset.icIdx),pk.dataset.icPick,pk); return; }
      const mr=e.target.closest('[data-ic-more]'); if(mr){ const i=Number(mr.dataset.icMore); const u=icxUi(f,i); u.limit=Math.min(999,u.limit+48); runSearch(i); return; }
      const lm=e.target.closest('[data-ic-libmore]'); if(lm){ const i=Number(lm.dataset.icLibmore); const u=icxUi(f,i); u.shown+=ICX_PAGE; libBody(i); return; }
      const st=e.target.closest('[data-ic-set]'); if(st){ const i=Number(st.dataset.icIdx); const u=icxUi(f,i); if(u.set===st.dataset.icSet) return; u.set=st.dataset.icSet; card.querySelectorAll('[data-ic-set]').forEach(x=>x.classList.toggle('on',x===st)); loadSet(i); return; }
      const dp=e.target.closest('[data-ic-dup]'); if(dp){ const i=Number(dp.dataset.icDup); const copy=JSON.parse(JSON.stringify(f.icons[i])); f.icons.splice(i+1,0,copy); icxShiftUi(f,i+1); snapshot(); scheduleCanvasRender(); updateInspector(); renderLayers(); return; }
    }));
    inspector.querySelectorAll('[data-ic-lib]').forEach(d=>d.addEventListener('toggle',()=>{ const i=Number(d.dataset.icLib); const u=icxUi(f,i); u.libOpen=d.open; if(d.open&&!u.names&&!u.libErr) loadSet(i); else if(d.open) libBody(i); }));
    inspector.querySelectorAll('[data-ic-add]').forEach(btn=>btn.addEventListener('click',()=>{
      const t=find(selectedId)?.b; if(!t) return; const list=iconEnsureCards(t);
      const last=list[list.length-1]||{icon:'✦'}; const copy=JSON.parse(JSON.stringify(last));
      list.push(copy); snapshot(); scheduleCanvasRender(); updateInspector(); renderLayers();
      setTimeout(()=>{ const cards=inspector.querySelectorAll('.ic-card'); const c=cards[cards.length-1]; if(c){ c.scrollIntoView({block:'nearest',behavior:'smooth'}); c.classList.add('ic-card--new'); setTimeout(()=>c.classList.remove('ic-card--new'),900); } },30);
      showToast('آیکون جدید اضافه شد — کپی آیکون قبلی');
    }));
  }
  /* keep per-card UI state (search text, open library) aligned after insert */
  function icxShiftUi(b,from){ const n=(b.icons||[]).length; for(let k=n-1;k>from;k--){ const prev=icx.ui.get(b.id+':'+(k-1)); if(prev) icx.ui.set(b.id+':'+k,prev); } icx.ui.delete(b.id+':'+from); }

  function contentFields(b){
    switch(b.type){
      case 'header': return shellHeaderContentFields(b);
      case 'footer': return shellFooterContentFields(b);
      case 'latestProducts': return `<div class="inspector-section"><button type="button"><span>آخرین محصولات</span><span class="section-chevron">⌄</span></button><div class="inspector-section__body"><label class="field"><span>Kicker</span><input data-bind="kicker" value="${esc(b.kicker||'PRODUCTS')}"></label><label class="field"><span>Title</span><input data-bind="title" value="${esc(b.title||'آخرین محصولات')}"></label><label class="field"><span>Description</span><textarea data-bind="description">${esc(b.description||'')}</textarea></label><label class="field"><span>Count</span><input data-bind="limit" type="number" min="1" max="12" value="${Number(b.limit)||3}"></label><label class="field"><span>Sort</span><select data-bind="sort"><option value="latest" ${b.sort==='latest'?'selected':''}>Latest</option><option value="featured" ${b.sort==='featured'?'selected':''}>Featured</option><option value="sales" ${b.sort==='sales'?'selected':''}>Best sellers</option><option value="priceLow" ${b.sort==='priceLow'?'selected':''}>Lowest price</option><option value="priceHigh" ${b.sort==='priceHigh'?'selected':''}>Highest price</option></select></label><label class="field"><span>Section link text</span><input data-bind="linkText" value="${esc(b.linkText||'همه محصولات ←')}"></label><label class="field"><span>Card link text</span><input data-bind="cardLinkText" value="${esc(b.cardLinkText||'مشاهده محصول ←')}"></label><label class="check-row"><input type="checkbox" data-bind="showLink" ${b.showLink!==false?'checked':''}> Show section link</label><label class="check-row"><input type="checkbox" data-bind="showPrice" ${b.showPrice!==false?'checked':''}> Show price</label><label class="check-row"><input type="checkbox" data-bind="showExcerpt" ${b.showExcerpt!==false?'checked':''}> Show excerpt</label></div></div>`;
      case 'latestPosts': return `<div class="inspector-section"><button type="button"><span>آخرین مقاله‌ها</span><span class="section-chevron">⌄</span></button><div class="inspector-section__body"><label class="field"><span>Kicker</span><input data-bind="kicker" value="${esc(b.kicker||'FROM BLOG')}"></label><label class="field"><span>Title</span><input data-bind="title" value="${esc(b.title||'آخرین مقاله‌ها')}"></label><label class="field"><span>Description</span><textarea data-bind="description">${esc(b.description||'')}</textarea></label><label class="field"><span>Count</span><input data-bind="limit" type="number" min="1" max="12" value="${Number(b.limit)||3}"></label><label class="field"><span>Sort</span><select data-bind="sort"><option value="latest" ${b.sort==='latest'?'selected':''}>Latest</option><option value="oldest" ${b.sort==='oldest'?'selected':''}>Oldest</option><option value="popular" ${b.sort==='popular'?'selected':''}>Popular</option></select></label><label class="field"><span>Section link text</span><input data-bind="linkText" value="${esc(b.linkText||'مشاهده بلاگ ←')}"></label><label class="field"><span>Card link text</span><input data-bind="cardLinkText" value="${esc(b.cardLinkText||'خواندن مقاله ←')}"></label><label class="check-row"><input type="checkbox" data-bind="showLink" ${b.showLink!==false?'checked':''}> Show section link</label><label class="check-row"><input type="checkbox" data-bind="showExcerpt" ${b.showExcerpt!==false?'checked':''}> Show excerpt</label></div></div>`;
      case 'heading': return section('Heading (قدیمی — در عناصر اصلی با Text+سطح تیتر جایگزین شد)',`${selectField('Tag','tag',b.tag||'h2',[['h1','H1'],['h2','H2'],['h3','H3'],['h4','H4']])}${textarea('Text','text',b.text||'')}${alignmentField(b)}`).outerHTML+typographyFields(b);
      case 'text': return `<div class="inspector-section is-pinned rte2-section"><div class="inspector-section__body">${richEditor(b)}<div class="rte2-seo">
        <div class="rte2-transform">
          <label class="rte2-transform__lbl">تبدیل حروف</label>
          <div class="rte2-transform__btns">
            <button type="button" class="rte2-transform__btn${(b.transform||'none')==='uppercase'?' is-on':''}" data-rte-transform="uppercase" title="همهٔ حروف بزرگ"><span>AA</span></button>
            <button type="button" class="rte2-transform__btn${(b.transform||'none')==='capitalize'?' is-on':''}" data-rte-transform="capitalize" title="اول هر کلمه بزرگ"><span>Aa</span></button>
            <button type="button" class="rte2-transform__btn${(b.transform||'none')==='lowercase'?' is-on':''}" data-rte-transform="lowercase" title="همهٔ حروف کوچک"><span>aa</span></button>
            <button type="button" class="rte2-transform__btn${(b.transform||'none')==='none'?' is-on':''}" data-rte-transform="none" title="بدون تبدیل"><span>—</span></button>
          </div>
        </div>
        ${selectField('سطح تیتر (SEO)','headingLevel',b.headingLevel||'',[['','بدون تیتر — متن بدنه'],['h1','H1 — عنوان اصلی صفحه'],['h2','H2 — عنوان بخش'],['h3','H3 — زیرعنوان'],['h4','H4 — زیرعنوان کوچک']])}
        <div class="helper">H1 فقط یک‌بار در صفحه استفاده کن — برای سئو مهم است.</div></div></div></div>`;
      /* V131 — Button: مقصد (پرداخت / زیرصفحه / لینک دلخواه) + فیلد لینک دلخواه + ویرایشگر متن کامل.
         هر تغییری در مقصد، پنل را نوسازی می‌کند تا فیلد لینک فوراً ظاهر/محو شود. */
      case 'button': {
        const kind=b.linkKind||b.target||'none';
        return chl('متن دکمه', richEditor(b)+'<div class="helper">برچسب دکمه از ویرایشگر بالا می‌آید — بولد، رنگ، لینک و… پشتیبانی می‌شود.</div>')
          +chl('مقصد دکمه', selectField('مقصد','linkKind',kind,[['none','هیچ (بدون لینک)'],['checkout','رفتن به صفحه پرداخت (Checkout)'],['subpage','رفتن به زیرصفحه محصول'],['custom','لینک دلخواه']])
            +(kind==='subpage'?subPageSelectField('زیرصفحه مقصد','subpage',(b.subpage||'').replace(/^\/+/, '')):'')
            +(kind==='custom'?input('لینک دلخواه (URL)','url',b.url||'https://')+check('باز شدن در تب جدید','newTab',b.newTab===true)+check('rel="nofollow" (برای لینک‌های بیرونی/تبلیغاتی)','nofollow',b.nofollow===true)+(/^\s*javascript:/i.test(b.url||'')?'<div class="v250-hint">لینک‌های javascript: به‌دلایل امنیتی در سایت غیرفعال می‌شوند.</div>':'')+'<div class="helper">برای رفتن به یک بخش همین صفحه، <code>#</code> + شناسهٔ آن بخش را بنویس (مثلاً <code>#pricing</code>). شناسه را در تب «پیشرفته» ← Element ID هر عنصر بگذار.</div>':'')
            +(kind==='none'?'<div class="helper">دکمه بدون لینک است (فقط نمایشی) و با کلیک جایی نمی‌رود.</div>':'')
            +(kind==='subpage'?'<div class="helper">مسیر دقیق زیرصفحه را از لیست بالا انتخاب کن — در سایت واقعی به /product/<slug>/<زیرصفحه> می‌رود.</div>':''))
          +chl('آیکون دکمه', input('آیکون / ایموجی (اختیاری)','btnIcon',b.btnIcon||'')+(b.btnIcon?v142Seg('جای آیکون','btnIconPos',b.btnIconPos||'start',[['start','قبل از متن'],['end','بعد از متن']]):'')+'<div class="helper">مثلاً ← ، ✓ ، ⚡ یا 🎁 — خالی بگذار تا آیکونی نمایش داده نشود.</div>');
      }
      case 'buyButton': return section('دکمه خرید — مقصد',`${selectField('مقصد دکمه','target',b.target||'checkout',[['checkout','رفتن به صفحه پرداخت (Checkout)'],['subpage','رفتن به زیرصفحه محصول (توضیحات قبل خرید)'],['custom','لینک دلخواه']])}${b.target==='subpage'?subPageSelectField('زیرصفحه مقصد','subpage',(b.subpage||'').replace(/^\/+/, '')):b.target==='custom'||(!b.target||b.target==='custom')?input('لینک دلخواه','url',b.url||'#'):''}${b.target==='subpage'?'<div class="helper">مسیر دقیق زیرصفحه را از لیست بالا انتخاب کن — در سایت واقعی به /product/<slug>/<زیرصفحه> می‌رود.</div>':''}`).outerHTML+section('استایل دکمه',`${input('متن دکمه','label',b.label||'همین حالا خرید کن')}${input('پدینگ افقی','padX',b.padX??28,'number')}${input('پدینگ عمودی','padY',b.padY??15,'number')}${input('گردی گوشه‌ها','radius',b.radius??14,'number')}${input('اندازه فونت','size',b.size??16,'number')}${selectField('سایه','shadow',b.shadow||'md',[['none','بدون سایه'],['sm','کم'],['md','متوسط'],['lg','زیاد']])}${input('رنگ پس‌زمینه','bg',b.bg||'#175CD3')}${input('رنگ دوم گرادیان','gradient2',b.gradient2||'#7F56D9')}${input('رنگ متن','fg',b.fg||'#FFFFFF')}${check('گرادیان دورنگ','gradient',b.gradient!==false)}${check('حالت قرصی (pill)','pill',b.pill===true)}${check('عرض کامل','fullWidth',b.fullWidth===true)}${check('مقیاس هنگام هاور','hoverScale',b.hoverScale!==false)}${check('آیکون همراه','showIcon',b.showIcon!==false)}${input('آیکون','icon',b.icon||'⚡')}${alignmentField(b)}`).outerHTML+section('نکته و بج',`${input('متن زیر دکمه (اختیاری)','note',b.note||'')}${check('نمایش بج روی دکمه','showBadge',b.showBadge===true)}${input('متن بج','badgeText',b.badgeText||'٪۲۰ تخفیف')}`).outerHTML;
      case 'image': { /* V111 — display card (mode/height) + layout card (align) per design mock */
        const multi=b.imageMode&&b.imageMode!=='single';
        /* V122 — Alignment از تب محتوا به تب طراحی منتقل شد */
        return chl('نمایش', (multi?'':mediaPickerField('آدرس تصویر','src',b.src||''))+input('متن جایگزین (Alt)','alt',b.alt||'')+(!multi&&b.src&&!String(b.alt||'').trim()?'<div class="v250-hint">متن جایگزین (Alt) خالی است؛ برای سئو و دسترس‌پذیری یک توضیح کوتاه بنویس.</div>':'')+selectField('نوع نمایش','imageMode',b.imageMode||'single',[['single','تک‌تصویر'],['carousel','کاروسل'],['gallery','گالری']])+(!multi?selectField('نسبت ابعاد','ratio',b.ratio||'',[['','طبیعی (نسبت خود عکس)'],['1/1','۱:۱ مربع'],['4/3','۴:۳'],['3/2','۳:۲'],['16/9','۱۶:۹ عریض'],['21/9','۲۱:۹ سینمایی'],['3/4','۳:۴ پرتره'],['2/3','۲:۳ پرتره'],['9/16','۹:۱۶ استوری']])+(b.ratio?'<div class="helper">برش با «نقطهٔ تمرکز» در تب استایل ← برش تصویر تنظیم می‌شود.</div>':''):'')+(b.imageMode==='gallery'?rangeField('تعداد ستون گالری','galleryCols',b.galleryCols??2,1,4,1)+rangeField('فاصلهٔ بین تصاویر (px)','galleryGap',b.galleryGap??10,0,80,1):'')+(multi?selectField('اندازه کادر','modeSize',b.modeSize||'md',[['auto','خودکار — نسبت خود عکس'],['sm','کوتاه — بنر پهن'],['md','متوسط'],['lg','بلند'],['full','پرتره']]):'')+(b.imageMode==='carousel'?check('پخش خودکار','modeAuto',b.modeAuto)+rangeField('فاصله پخش (ثانیه)','modeInterval',b.modeInterval??4,2,12,1):''))
          +chl('لینک تصویر', input('با کلیک برود به (اختیاری)','link',b.link||'')+(b.link?check('باز شدن در تب جدید','newTab',b.newTab===true)+check('rel="nofollow"','nofollow',b.nofollow===true):'')+'<div class="helper">آدرس کامل (https://…)، مسیر داخلی (/products) یا لنگر (#pricing).</div>')
          +chl('کپشن', selectField('موقعیت کپشن','captionPosition',b.captionPosition||'bottom',[['bottom','زیر تصویر'],['top','بالای تصویر'],['overlay','روی تصویر']])+textarea('کپشن','caption',b.caption||''))
          +(multi?((b.images||[]).map((x,ix)=>`<div class="repeater"><div class="field-head"><b>تصویر ${ix+1}</b>${buttonRm('images',ix)}</div>${mediaInput('آدرس',`images.${ix}.src`,x.src||'')}${input('Alt',`images.${ix}.alt`,x.alt||'')}${selectField('اندازه','images.'+ix+'.fit',x.fit||'cover',[['cover','پر کردن کادر (Fill)'],['contain','کامل داخل کادر (Fit)'],['fill','کشیده (Stretch)']])}</div>`).join('')+'<button type="button" class="add-inline" data-add-item="images">+ افزودن تصویر</button>'+(b.imageMode==='carousel'&&(b.images||[]).filter(x=>x&&x.src).length<2?'<div class="v250-hint">کاروسل با حداقل ۲ تصویر ساخته می‌شود؛ فعلاً فقط یک تصویر نمایش داده می‌شود.</div>':'')):'');
      }
      /* V117 — پخش: سه تیک مستقل Controls / Autoplay / Muted، مثل هم؛
         پیش‌فرض‌ها با رندرر مشترک هم‌خوان است (controls و muted روشن، autoplay خاموش). */
      case 'video': return chl('ویدیو', mediaPickerField('ویدیو (لینک YouTube/Vimeo/MP4)','url',b.url||'')+input('تصویر کاور (اختیاری)','poster',b.poster||'')+selectField('نسبت تصویر','aspect',b.aspect||'16/9',[['16/9','۱۶:۹'],['4/3','۴:۳'],['1/1','۱:۱'],['21/9','۲۱:۹']]))
        +chl('پخش', check('نمایش دکمه پخش (Controls)','controls',b.controls!==false)+check('پخش خودکار (Autoplay)','autoplay',b.autoplay===true)+check('بی‌صدا شروع شود (Muted)','muted',b.muted!==false)+'<div class="helper">Autoplay در بیشتر مرورگرها فقط وقتی کار می‌کند که Muted روشن باشد.</div>');
      case 'rating': return section('Rating',`${input('Value','value',b.value||5,'number','min="0" max="10" step="0.5"')}${input('Max','max',b.max||5,'number','min="1" max="10"')}${input('Filled icon','icon',b.icon||'★')}${input('Empty icon','emptyIcon',b.emptyIcon||'☆')}${input('Label','label',b.label||'')}${input('Gap','gap',b.gap||2,'number')}${alignmentField(b)}`).outerHTML;
      case 'buttonGroup': return section('Buttons',`${rangeField('Gap','gap',b.gap??10,0,40,1)}${check('Wrap to next line','wrap',b.wrap!==false)}${alignmentField(b)}${(b.buttons||[]).map((x,i)=>`<div class="repeater"><div class="field-head"><b>Button ${i+1}</b>${buttonRm('buttonGroup',i)}</div>${input('Label',`buttons.${i}.label`,x.label||'Button')}${input('URL',`buttons.${i}.url`,x.url||'#')}${selectField('Variant',`buttons.${i}.variant`,x.variant||'solid',[['solid','Solid'],['outline','Outline'],['ghost','Ghost']])}${color('Background',`buttons.${i}.bg`,x.bg||'#175CD3')}${color('Text',`buttons.${i}.fg`,x.fg||'#fff')}${rangeField('Size',`buttons.${i}.size`,x.size??15,10,28,1)}${rangeField('Padding X',`buttons.${i}.padX`,x.padX??18,0,64,1)}${rangeField('Padding Y',`buttons.${i}.padY`,x.padY??12,0,48,1)}</div>`).join('')}<button type="button" class="add-inline" data-add-item="buttonGroup">+ Add button</button>`).outerHTML;
      case 'guarantee': return section('Guarantee',`${input('Kicker','kicker',b.kicker||'GUARANTEE')}${richField('Title','title',b.title||'با خیال راحت شروع کن')}${richField('Text','text',b.text||'توضیح کوتاه')}${input('Icon / Emoji','icon',b.icon||'✓')}`).outerHTML;
      case 'leadMagnet': return section('Lead Magnet',`${input('Kicker','kicker',b.kicker||'رایگان')}${richField('Title','title',b.title||'راهنمای رایگان را بگیر')}${richField('Text','text',b.text||'توضیح کوتاه')}${input('Button','button',b.button||'دریافت رایگان')}${input('URL','url',b.url||'#')}`).outerHTML;
      case 'featureCompare': return section('Comparison',`${richField('Title','title',b.title||'مقایسه امکانات')}${input('Columns (comma separated)','columns',Array.isArray(b.columns)?b.columns.join(', '):'پایه, حرفه‌ای')}${(b.items||[]).map((x,i)=>`<div class="repeater"><div class="field-head"><b>Row ${i+1}</b>${buttonRm('featureCompare',i)}</div>${input('Label',`items.${i}.label`,x.label||'ویژگی')}${input('Values (comma separated)',`items.${i}.values`,Array.isArray(x.values)?x.values.join(', '):'✓, ✓')}</div>`).join('')}<button type="button" class="add-inline" data-add-item="featureCompare">+ Add row</button>`).outerHTML;
      case 'avatarStack': return section('Avatar Stack',`${rangeField('Size','size',b.size??42,24,80,1)}${rangeField('Overlap','overlap',b.overlap??12,0,32,1)}${rangeField('Max visible','max',b.max??5,1,8,1)}${input('Caption','caption',b.caption||'')}${(b.items||[]).map((x,i)=>`<div class="repeater"><div class="field-head"><b>Avatar ${i+1}</b>${buttonRm('avatarStack',i)}</div>${input('Image URL',`items.${i}.src`,x.src||'')}${input('Name',`items.${i}.name`,x.name||'')}</div>`).join('')}<button type="button" class="add-inline" data-add-item="avatarStack">+ Add avatar</button>`).outerHTML;
      case 'testimonial': return section('Content',`${richField('Quote','quote',b.quote||plainToHtml('تجربه فوق‌العاده‌ای بود.'))}${richField('Name','name',b.name||'<strong>نام مشتری</strong>')}${richField('Role','role',b.role||'سمت')}${input('Emoji','emoji',b.emoji||'✨')}${input('Avatar URL','avatar',b.avatar||'')}`).outerHTML+section('Rating',`${check('Show stars','showRating',b.showRating)}${rangeField('Rating','rating',b.rating??5,0,10,0.5)}${rangeField('Max stars','maxRating',b.maxRating??5,1,10,1)}${color('Star color','ratingColor',b.ratingColor||'#F79009')}${rangeField('Star size','ratingSize',b.ratingSize??22,10,64,1)}${rangeField('Star gap','ratingGap',b.ratingGap??2,0,16,1)}`).outerHTML+section('Visibility',`${check('Show avatar','showAvatar',b.showAvatar)}${check('Show name','showName',b.showName)}${check('Show role','showRole',b.showRole)}${check('Show quote','showQuote',b.showQuote)}${check('Show emoji','showEmoji',b.showEmoji)}${alignmentField(b)}`).outerHTML;
      case 'faq': return section('FAQ',`${richField('Title','title',b.title||'سوالات متداول')}${rangeField('Title size','titleSize',b.titleSize??24,12,64,1)}${rangeField('Question size','questionSize',b.questionSize??16,10,48,1)}${rangeField('Answer size','answerSize',b.answerSize??14,10,36,1)}${rangeField('Question weight','questionWeight',b.questionWeight??700,100,900,100)}${rangeField('Answer weight','answerWeight',b.answerWeight??400,100,900,100)}${rangeField('Answer line height','answerLine',b.answerLine??1.7,1,2.6,0.05)}${color('Title color','titleColor',b.titleColor||b.color||'#101828')}${color('Question color','questionColor',b.questionColor||'#101828')}${color('Answer color','answerColor',b.answerColor||'#667085')}${selectField('Text alignment','align',b.align||'center',[['left','Left'],['center','Center'],['right','Right']])}${check('Open first','openFirst',b.openFirst)}${(b.items||[]).map((x,i)=>`<div class="repeater"><div class="field-head"><b>FAQ ${i+1}</b>${buttonRm('faq',i)}</div>${richField('Question',`items.${i}.q`,x.q||'سوال جدید؟')}${richField('Answer',`items.${i}.a`,x.a||'پاسخ جدید')}</div>`).join('')}<button type="button" class="add-inline" data-add-item="faq">+ Add question</button>`).outerHTML;
      case 'form': return section('Form',`${input('Title','title',b.title||'Form')}${textarea('Description','description',b.description||'')}${input('Action URL (اختیاری)','action',b.action||'')}${selectField('Method','method',b.method||'post',[['post','POST'],['get','GET']])}${input('Submit label','submit',b.submit||'Submit')}${input('Success / Redirect URL','successUrl',b.successUrl||'')}${check('Store submissions on this site','storeSubmissions',b.storeSubmissions)}<div class="helper">تنظیمات خود فرم داخل صفحه/محصول ذخیره می‌شود. اگر «Store submissions» روشن باشد، ارسال‌های فرم هم در داده‌های سایت ذخیره می‌شوند. اگر Success URL تعیین کنی، بعد از ارسال کاربر به آن آدرس می‌رود.</div>${(b.fields||[]).map((f,i)=>`<div class="repeater"><div class="field-head"><b>Field ${i+1}</b><button type="button" class="mini-danger" data-remove-item="form" data-index="${i}">حذف</button></div>${input('Label',`fields.${i}.label`,f.label||'')}${input('Name',`fields.${i}.name`,f.name||'')}${selectField('Type',`fields.${i}.type`,f.type||'text',[['text','Text'],['email','Email'],['tel','Tel'],['number','Number'],['textarea','Textarea'],['url','URL']])}${input('Placeholder',`fields.${i}.placeholder`,f.placeholder||'')}${check('Required',`fields.${i}.required`,f.required)}</div>`).join('')}<button type="button" class="add-inline" data-add-item="form">+ Add field</button>`).outerHTML;
      case 'audio': return chl('صوت', input('عنوان (اختیاری)','title',b.title||'')+mediaPickerField('فایل صوتی','url',b.url||'')+check('دکمه پخش','controls',b.controls!==false)+check('پخش خودکار','autoplay',b.autoplay)+check('تکرار (loop)','loop',b.loop)+'<div class="helper">فایل را از کتابخانه رسانه انتخاب یا آپلود کن.</div>');
      case 'divider': return section('Divider',`${rangeField('Thickness','width',b.width??2,1,20,1)}${selectField('Pattern','pattern',b.pattern||'line',[['line','Solid'],['dashed','Dashed'],['dotted','Dotted'],['double','Double'],['stars','Stars'],['wave','Wave'],['zigzag','Zigzag']])}${color('Color','color',b.color||'#EAECF0')}${rangeField('Vertical margin','margin',b.margin??28,0,120,1)}${check('Edge to edge','edgeToEdge',b.edgeToEdge)}${alignmentField(b)}`).outerHTML;
      case 'custom': return chl('HTML', textarea('ساختار (HTML)','html',b.html||''))+chl('CSS', textarea('استایل (CSS) — فقط روی همین عنصر اعمال می‌شود','css',b.css||'')+'<div class="helper">CSS به‌صورت خودکار به همین عنصر محدود می‌شود (Scoped)؛ روی بقیهٔ صفحه اثر نمی‌گذارد.</div>')+chl('JavaScript', textarea('اسکریپت (اختیاری)','js',b.js||'')+'<div class="helper">متغیر <code>root</code> همین عنصر است. اسکریپت فقط روی سایت منتشرشده اجرا می‌شود، نه داخل بوم.</div>');
      case 'embed': return chl('کد Embed', textarea('کد HTML / iframe','code',b.code||'')+'<div class="helper">کد را کامل بچسبان (iframe، ویدیو، نقشه…). در صفحهٔ واقعی اجرا می‌شود.</div>');
      /* V138 — Sticky Button: مقصد + متن + جای‌گیری. استایل در تب طراحی است. */
      case 'stickyButton': {
        const kind=b.target||'checkout';
        return chl('دکمه', input('متن دکمه','label',b.label||'همین حالا خرید کن')+check('آیکون همراه','showIcon',b.showIcon!==false)+(b.showIcon!==false?input('آیکون / ایموجی','icon',b.icon||'⚡'):''))
          +chl('مقصد دکمه', selectField('مقصد','target',kind,[['checkout','رفتن به صفحه پرداخت (Checkout)'],['subpage','رفتن به زیرصفحه محصول'],['custom','لینک دلخواه']])
            +(kind==='subpage'?subPageSelectField('زیرصفحه مقصد','subpage',(b.subpage||'').replace(/^\/+/, '')):'')
            +(kind==='custom'?input('لینک دلخواه (URL)','url',b.url||'https://'):''))
          +chl('جای‌گیری روی صفحه', selectField('گوشهٔ صفحه','stickyPos',b.stickyPos||'bottom-right',[['bottom-right','پایین راست'],['bottom-left','پایین چپ'],['bottom-center','پایین وسط']])
            +rangeField('فاصله از کناره (px)','offsetX',b.offsetX??16,0,80,1)+rangeField('فاصله از پایین (px)','offsetY',b.offsetY??16,0,120,1)
            +check('تمام‌عرض در موبایل','mobileFull',b.mobileFull===true)
            +'<div class="helper">این دکمه روی سایت همیشه در گوشهٔ پایین صفحه ثابت می‌ماند و با اسکرول تکان نمی‌خورد. در بوم ویرایش، پایین‌ترین بخش صفحه است و جابه‌جا نمی‌شود.</div>');
      }
      case 'stickyCta': return chl('دکمه شناور', input('متن دکمه','label',b.label||'شروع کن')+selectField('مقصد','target',b.target||'checkout',[['checkout','صفحه پرداخت'],['subpage','زیرصفحه محصول'],['custom','لینک دلخواه']])+(b.target==='subpage'?subPageSelectField('زیرصفحه مقصد','subpage',(b.subpage||'').replace(/\/+/, '')):input('لینک دلخواه','url',b.url||'#'))+selectField('گوشه صفحه','position',b.position||'bottom-right',[['bottom-right','پایین راست'],['bottom-left','پایین چپ'],['top-right','بالا راست'],['top-left','بالا چپ']]));
      case 'carousel': return section('Image Slider',`${selectField('Aspect','aspect',b.aspect||'16/9',[['16/9','16:9'],['4/3','4:3'],['1/1','1:1'],['21/9','21:9']])}${check('Show arrows','showArrows',b.showArrows)}${check('Show dots','showDots',b.showDots)}${check('Autoplay','autoplay',b.autoplay)}${input('Interval sec','interval',b.interval||4,'number','min="1" max="30"')}${(b.slides||[]).map((x,i)=>`<div class="repeater"><b>Slide ${i+1}</b>${input('Image URL',`slides.${i}.src`,x.src||'')}${input('Alt',`slides.${i}.alt`,x.alt||'')}${input('Caption',`slides.${i}.caption`,x.caption||'')}<button type="button" class="mini-danger" data-remove-item="carousel" data-index="${i}">حذف</button></div>`).join('')}<button type="button" class="add-inline" data-add-item="carousel">+ Add slide</button>`).outerHTML;
      case 'stats': return section('Stats',`${rangeField('Items per row','perRow',b.perRow??3,1,6,1)}${rangeField('Gap','gap',b.gap??12,0,60,1)}${(b.items||[]).map((x,i)=>`<div class="repeater"><b>Stat ${i+1}</b>${richField('Value',`items.${i}.value`,x.value||'0')}${richField('Label',`items.${i}.label`,x.label||'عنوان')}${input('Icon / Emoji',`items.${i}.icon`,x.icon||'')}${input('Icon URL',`items.${i}.iconUrl`,x.iconUrl||'')}${rangeField('Icon size',`items.${i}.iconSize`,x.iconSize??28,10,80,1)}${color('Icon background',`items.${i}.iconBg`,x.iconBg||'#EEF4FF')}${color('Icon color',`items.${i}.iconColor`,x.iconColor||'#175CD3')}${rangeField('Value size',`items.${i}.valueSize`,x.valueSize??22,10,64,1)}${rangeField('Value weight',`items.${i}.valueWeight`,x.valueWeight??800,100,900,100)}${color('Value color',`items.${i}.valueColor`,x.valueColor||'#101828')}${rangeField('Label size',`items.${i}.labelSize`,x.labelSize??12,8,32,1)}${rangeField('Label weight',`items.${i}.labelWeight`,x.labelWeight??400,100,900,100)}${color('Label color',`items.${i}.labelColor`,x.labelColor||'#667085')}${selectField('Item font',`items.${i}.fontFamily`,x.fontFamily||b.fontFamily||'system-ui',[['system-ui','System UI'],['Arial','Arial'],['Helvetica','Helvetica'],['Tahoma','Tahoma'],['Georgia','Georgia'],['Verdana','Verdana']])}${nineAlignField('Text / content position',`items.${i}.align`,x.align||'mc')}${buttonRm('stats',i)}</div>`).join('')}<button type="button" class="add-inline" data-add-item="stats">+ Add stat</button>${alignmentField(b)}`).outerHTML;
      case 'icon': { /* V140 — one card per icon: search → source (Iconify / emoji / image URL) →
          Iconify library accordion → optional link → color / no-fill → stroke. «+ افزودن آیکون»
          copies the last card. 1 card = single icon, 2+ = a row (layout in the Design tab). */
        const items=iconEnsureCards(b);
        return chl('آیکون‌ها', items.map((x,i)=>iconCardHtml(b,x,i,items.length)).join('')
          +'<button type="button" class="add-inline ic-add" data-ic-add="1">+ افزودن آیکون</button>'
          +'<div class="helper">آیکون‌های Iconify موقع انتخاب داخل خود صفحه ذخیره می‌شوند؛ سایت منتشرشده هیچ درخواستی به Iconify نمی‌زند و فقط همان آیکون‌هایی که استفاده کرده‌ای را دارد.</div>');
      }
      case 'scrollPoint': { /* V114 — راهنمای اتصال: لینک/دکمه‌ای که به این نقطه می‌رسد */
        const spHref='#sp-'+(b.id||'');
        return chl('این نقطه چطور کار می‌کند؟', `<div class="helper">این عنصر در سایت واقعی دیده نمی‌شود؛ فقط یک نقطهٔ لنگر است. هر لینک یا دکمه‌ای که آدرسش را روی مقدار زیر بگذاری، صفحه با اسکرول نرم به همین نقطه می‌رسد و محتوای بعد از آن نشان داده می‌شود.</div>`
          +`<div class="sp-link-guide"><span class="sp-link-guide__label">آدرس برای لینک / دکمه:</span><code dir="ltr">${attr(spHref)}</code><button type="button" class="mini-btn" data-copy-sp="${attr(spHref)}" title="کپی">کپی</button></div>`
          +`<div class="helper">در بیلدر، لینک دکمه را همین‌طور ساده بنویس: <b dir="ltr">#sp-…</b> (همان مقدار بالا). در صفحهٔ منتشرشده هم همین کار می‌کند.</div>`
          +input('برچسب روی بوم (فقط داخل بیلدر)','anchorLabel',b.anchorLabel||'')+rangeField('فاصلهٔ بعد از پرش (px)','height',b.height??0,0,120,1));
      }
      case 'badge': return chl('بج', textarea('متن','text',b.text||'Badge')+alignmentField(b));
      case 'pricing': return section('Pricing',`${input('Kicker','kicker',b.kicker||'PRO')}${input('Title','title',b.title||'Pro')}${input('Price','price',b.price||'79$')}${input('Note','note',b.note||'')}${input('Button','button',b.button||'خرید')}${input('URL','url',b.url||'#')}${alignmentField(b)}`).outerHTML;
      /* V131 — تب محتوای Columns ساده شد: PC همیشه کنار هم، موبایل زیر هم؛ فقط یک
         تیک اختیاری «کنار هم در موبایل (فشرده)». کارت‌های چیدمان/رفتار در موبایل
         با دراپ‌داون‌های همپوشان حذف شدند. درصد هر ستون همین لحظه روی بوم دیده می‌شود. */
      case 'columns': {
        const items=Array.isArray(b.items)?b.items:[]; const cnt=items.length;
        const ord=colOrder(b); const rtl=(window.BUILDER_SITE_DIR==='rtl');
        const byPos=items.map((_,i)=>i).sort((a,z)=>ord[a]-ord[z]);
        const card=(x,i)=>{ const w=Math.round(n(x.width,100/(cnt||1))); return `<div class="repeater column-repeater"><div class="field-head"><b>ستون ${i+1}</b><span class="col-head-tools"><output>${w}٪</output>${cnt>1?`<button type="button" class="mini-danger col-del" data-column-del="${i}" title="حذف ستون ${i+1}" aria-label="حذف ستون ${i+1}">✕</button>`:''}</span></div>${cnt>1?rangeField('عرض ٪',`items.${i}.width`,w,5,100-5*(cnt-1),1):'<div class="helper">تک‌ستون همیشه ۱۰۰٪ عرض دارد.</div>'}${v142ColorOpt('رنگ پس‌زمینهٔ ستون',`items.${i}.bg`,x.bg||'','بدون رنگ (شفاف)')}<div class="column-mini-actions"><button type="button" class="mini-btn" data-column-active="${i}">انتخاب ستون ${i+1}</button></div></div>`; };
        return chl('ستون‌ها',`<div class="col-count-bar"><span>تعداد ستون‌ها: <b>${cnt}</b></span><button type="button" class="add-inline" data-column-add="1" ${cnt>=6?'disabled':''}>＋ افزودن ستون</button></div>`
          +items.map(card).join('')
          +'<div class="helper">جمع عرض‌ها همیشه ۱۰۰٪ است و درصدها روی دسکتاپ و موبایل اعمال می‌شوند. ستون بدون رنگ شفاف است.</div>')
          +chl('رفتار در موبایل', check('کنار هم در موبایل (فشرده)','__colSide',b.stackMobile==='side')+(b.stackMobile!=='side'&&cnt>1?check('ترتیب برعکس در موبایل','reverseMobile',b.reverseMobile===true)+'<div class="helper">مثلاً ستون تصویر که در دسکتاپ سمت چپ است، در موبایل بالای متن بیاید.</div>':'')+'<div class="helper">بدون تیک، ستون‌ها در موبایل زیر هم می‌آیند؛ با تیک کنار هم می‌مانند.</div>')
          +(cnt>1?chl('ترتیب در دسکتاپ',`<div class="column-order-preview" style="direction:${rtl?'rtl':'ltr'}">${byPos.map(i=>`<span>ستون ${i+1}</span>`).join('')}</div>${items.map((x,i)=>{ const p=ord[i]; const leftOk=rtl?p<cnt:p>1; const rightOk=rtl?p>1:p<cnt; return `<div class="column-order-row"><b>ستون ${i+1}</b><span class="column-order-value">جایگاه ${p} از ${cnt}</span><button type="button" class="mini-btn" data-column-move="left" data-column-index="${i}" ${leftOk?'':'disabled'}>← چپ</button><button type="button" class="mini-btn" data-column-move="right" data-column-index="${i}" ${rightOk?'':'disabled'}>راست →</button></div>`; }).join('')}`):'')
          +chl('فاصله‌ها', rangeField('فاصله بین ستون‌ها','gap',b.gap??18,0,100,1)+rangeField('فاصله در موبایل','gapMobile',b.gapMobile??12,0,100,1)+rangeField('فاصلهٔ داخلی هر ستون','columnInnerGap',b.columnInnerGap??0,0,120,1));
      }
      case 'announcement': return section('CTA Banner',`${input('Text','text',b.text||'')}${input('Button','button',b.button||'بیشتر')}${input('URL','url',b.url||'#')}${alignmentField(b)}`).outerHTML;
      case 'countdown': return section('Countdown',`${selectField('Language','language',b.language||'fa',[['fa','فارسی'],['en','English']])}${check('Show number backgrounds','showBoxes',b.showBoxes!==false)}${input('Days','days',b.days||0,'number','min=\"0\" max=\"3650\"')}${input('Hours','hours',b.hours||0,'number','min=\"0\" max=\"23\"')}${input('Minutes','minutes',b.minutes||0,'number','min=\"0\" max=\"59\"')}${input('Seconds','seconds',b.seconds||0,'number','min=\"0\" max=\"59\"')}${alignmentField(b)}`).outerHTML;
      case 'social': return section('Social',`${rangeField('Desktop items per row','perRow',b.perRow??3,1,6,1)}${rangeField('Mobile items per row','perRowMobile',b.perRowMobile??1,1,6,1)}${rangeField('Gap','gap',b.gap??10,0,60,1)}${rangeField('Icon size','iconSize',b.iconSize??22,10,72,1)}${rangeField('Item padding','itemPad',b.itemPad??9,0,30,1)}${check('Show on desktop','showOnDesktop',b.showOnDesktop!==false)}${check('Show on mobile','showOnMobile',b.showOnMobile!==false)}${(b.items||[]).map((x,i)=>{const it=typeof x==='string'?{name:x,url:'#',icon:x,iconUrl:'',shape:'circle',bg:'#fff',color:'#101828',border:'#EAECF0',borderWidth:1}:x; return `<div class="repeater social-repeater"><div class="repeater-head"><b>${esc(it.name||('Social '+(i+1)))}</b><button type="button" class="mini-danger" data-remove-item="social" data-index="${i}">حذف</button></div>${input('Name',`items.${i}.name`,it.name||'Instagram')}${input('URL',`items.${i}.url`,it.url||'#')}${input('Icon text / Emoji',`items.${i}.icon`,it.icon||'◎')}${input('Icon URL',`items.${i}.iconUrl`,it.iconUrl||'')}${selectField('Shape',`items.${i}.shape`,it.shape||'circle',[['circle','Circle'],['square','Square'],['none','None']])}${color('Background',`items.${i}.bg`,it.bg||'#fff')}${color('Color',`items.${i}.color`,it.color||'#101828')}${color('Stroke',`items.${i}.border`,it.border||'#EAECF0')}${rangeField('Stroke width',`items.${i}.borderWidth`,it.borderWidth??1,0,8,1)}${rangeField('Icon size',`items.${i}.iconSize`,it.iconSize??22,10,72,1)}</div>`;}).join('')}<button type="button" class="add-inline" data-add-item="social">+ افزودن شبکه</button>${alignmentField(b)}`).outerHTML;
      case 'trustBar': return section('Trust Bar',`${rangeField('Items per row','perRow',b.perRow??3,1,6,1)}${rangeField('Gap','gap',b.gap??14,0,60,1)}${(b.items||[]).map((x,i)=>`<div class="repeater"><b>Item ${i+1}</b>${input('Icon',`items.${i}.icon`,x.icon||'✓')}${richField('Title',`items.${i}.title`,x.title||'عنوان')}${richField('Text',`items.${i}.text`,x.text||'توضیح')}${buttonRm('trustBar',i)}</div>`).join('')}<button type="button" class="add-inline" data-add-item="trustBar">+ افزودن مورد</button>`).outerHTML;
      case 'iconGrid': return section('Icon Grid',`${rangeField('Items per row','perRow',b.perRow??3,1,6,1)}${rangeField('Gap','gap',b.gap??18,0,60,1)}${(b.items||[]).map((x,i)=>`<div class="repeater"><b>Item ${i+1}</b>${input('Icon',`items.${i}.icon`,x.icon||'✦')}${richField('Title',`items.${i}.title`,x.title||'عنوان')}${richField('Text',`items.${i}.text`,x.text||'توضیح')}${buttonRm('iconGrid',i)}</div>`).join('')}<button type="button" class="add-inline" data-add-item="iconGrid">+ افزودن مورد</button>`).outerHTML;
      case 'steps': return section('Steps',`${rangeField('Items per row','perRow',b.perRow??3,1,6,1)}${rangeField('Gap','gap',b.gap??22,0,60,1)}${(b.items||[]).map((x,i)=>`<div class="repeater"><b>Step ${i+1}</b>${input('Number',`items.${i}.number`,x.number||String(i+1).padStart(2,'0'))}${richField('Title',`items.${i}.title`,x.title||'مرحله')}${richField('Text',`items.${i}.text`,x.text||'توضیح')}${buttonRm('steps',i)}</div>`).join('')}<button type="button" class="add-inline" data-add-item="steps">+ افزودن مرحله</button>`).outerHTML;
      case 'timeline': return section('Timeline',`${rangeField('Gap','gap',b.gap??18,0,80,1)}${rangeField('Dot size','radioSize',b.radioSize??12,6,32,1)}${rangeField('Line width','lineWidth',b.lineWidth??2,1,10,1)}${rangeField('Item radius','itemRadius',b.itemRadius??14,0,40,1)}${rangeField('Item padding','itemPadding',b.itemPadding??16,0,50,1)}${color('Section background','bg',b.bg||'#FFFFFF')}${color('Item background','itemBg',b.itemBg||'#FFFFFF')}${color('Title color','titleColor',b.titleColor||'#101828')}${color('Text color','textColor',b.textColor||'#667085')}${color('Line color','line',b.line||'#D0D5DD')}${color('Dot color','dot',b.dot||'#175CD3')}${rangeField('Title size','titleSize',b.titleSize??16,10,56,1)}${rangeField('Title weight','titleWeight',b.titleWeight??800,100,900,100)}${rangeField('Text size','textSize',b.textSize??13,9,32,1)}${rangeField('Text weight','textWeight',b.textWeight??400,100,900,100)}${fontSelectField('Font','fontFamily',b.fontFamily||'system-ui')}${(b.items||[]).map((x,i)=>`<div class="repeater"><b>Item ${i+1}</b>${richField('Title',`items.${i}.title`,x.title||'مرحله')}${richField('Text',`items.${i}.text`,x.text||'توضیح')}${color('Item title color',`items.${i}.titleColor`,x.titleColor||b.titleColor||'#101828')}${color('Item text color',`items.${i}.textColor`,x.textColor||b.textColor||'#667085')}${rangeField('Title size',`items.${i}.titleSize`,x.titleSize??b.titleSize??16,10,56,1)}${rangeField('Text size',`items.${i}.textSize`,x.textSize??b.textSize??13,9,32,1)}${buttonRm('timeline',i)}</div>`).join('')}<button type="button" class="add-inline" data-add-item="timeline">+ افزودن مرحله</button>`).outerHTML;
      case 'roadmap': return section('Roadmap',`${color('Accent (current card)','accent',b.accent||'#175CD3')}${color('Card background','itemBg',b.itemBg||'#FFFFFF')}${color('Line','line',b.line||'#EAECF0')}${rangeField('Gap','gap',b.gap??16,4,48,1)}${rangeField('Item radius','itemRadius',b.itemRadius??16,0,32,1)}${rangeField('Item padding','itemPadding',b.itemPadding??16,8,36,1)}${rangeField('Icon size','iconSize',b.iconSize??18,12,32,1)}${rangeField('Title size','titleSize',b.titleSize??16,10,32,1)}${rangeField('Title weight','titleWeight',b.titleWeight??800,100,900,100)}${rangeField('Text size','textSize',b.textSize??14,10,24,1)}${color('Title color','titleColor',b.titleColor||'#101828')}${color('Text color','textColor',b.textColor||'#475467')}${(b.items||[]).map((x,i)=>`<div class="repeater"><div class="field-head"><b>مرحله ${i+1}</b>${buttonRm('roadmap',i)}</div>${input('آیکن','items.'+i+'.icon',x.icon||'')}${richField('عنوان','items.'+i+'.title',x.title||'مرحله')}${richField('توضیح','items.'+i+'.text',x.text||'')}${selectField('وضعیت','items.'+i+'.status',x.status||'next',[['done','✓ انجام‌شده'],['current','● در حال انجام'],['next','○ پیش‌رو']])}${input('برچسب','items.'+i+'.tag',x.tag||'')}${input('متا (زمان)','items.'+i+'.meta',x.meta||'')}${color('رنگ عنوان آیتم','items.'+i+'.titleColor',x.titleColor||b.titleColor||'#101828')}${color('رنگ متن آیتم','items.'+i+'.textColor',x.textColor||b.textColor||'#475467')}</div>`).join('')}<button type="button" class="add-inline" data-add-item="roadmap">+ افزودن مرحله</button>`).outerHTML;
      case 'forWho': return section('For Who / Not For',`${input('عنوان سبز (بله)','yesTitle',b.yesTitle||'این دوره برای توست اگر…')}${input('عنوان قرمز (نه)','noTitle',b.noTitle||'برای تو نیست اگر…')}${rangeField('Title size','titleSize',b.titleSize??17,12,28,1)}${rangeField('Text size','textSize',b.textSize??14,10,22,1)}${rangeField('Radius','radius',b.radius??20,0,36,1)}${rangeField('Padding','padding',b.padding??22,10,44,1)}${rangeField('Gap','gap',b.gap??16,6,36,1)}${color('رنگ عنوان سبز','titleColor',b.titleColor||'#101828')}${color('رنگ متن','textColor',b.textColor||'#475467')}${color('پس‌زمینه سبز','yesBg',b.yesBg||'#F0FDF4')}${color('حاشیه سبز','yesBorder',b.yesBorder||'#ABEFC6')}${color('رنگ سبز','yesColor',b.yesColor||'#067647')}${color('پس‌زمینه قرمز','noBg',b.noBg||'#FEF3F2')}${color('حاشیه قرمز','noBorder',b.noBorder||'#FECDCA')}${color('رنگ قرمز','noColor',b.noColor||'#B42318')}<div class="helper">آیتم‌های هر ستون را در خط جدا بنویس (هر خط یک آیتم).</div>${textarea('آیتم‌های سبز (هر خط یک آیتم)','yesItemsText',Array.isArray(b.yesItems)?b.yesItems.join('\n'):'')}${textarea('آیتم‌های قرمز (هر خط یک آیتم)','noItemsText',Array.isArray(b.noItems)?b.noItems.join('\n'):'')}`).outerHTML;
      case 'bonusStack': return section('Bonus Stack',`${input('کیکر','kicker',b.kicker||'')}${richField('عنوان','title',b.title||'')}${rangeField('Title size','titleSize',b.titleSize??22,14,40,1)}${rangeField('Text size','textSize',b.textSize??15,11,22,1)}${check('نمایش جمع کل','showTotal',b.showTotal!==false)}${input('متن دکمه','cta',b.cta||'')}${input('URL دکمه','ctaUrl',b.ctaUrl||'#')}${rangeField('Gap','gap',b.gap??12,4,28,1)}${rangeField('Radius','radius',b.radius??24,0,40,1)}${rangeField('Padding Y','padY',b.padY??26,10,60,1)}${rangeField('Padding X','padX',b.padX??24,10,60,1)}${color('رنگ تاکیدی (accent)','accent',b.accent||'#B54708')}${color('پس‌زمینه کارت','bg',b.bg||'#FFFFFF')}${color('حاشیه کارت','border',b.border||'#EAAA08')}${color('پس‌زمینه آیتم‌ها','itemBg',b.itemBg||'#FFFCF5')}${color('حاشیه آیتم‌ها','itemBorder',b.itemBorder||'#FEDF89')}${color('رنگ عنوان','titleColor',b.titleColor||'#101828')}${color('رنگ متن','textColor',b.textColor||'#101828')}${(b.items||[]).map((x,i)=>`<div class="repeater"><div class="field-head"><b>بونوس ${i+1}</b>${buttonRm('bonusStack',i)}</div>${input('آیکن','items.'+i+'.icon',x.icon||'🎁')}${richField('عنوان','items.'+i+'.title',x.title||'بونوس')}${input('توضیح کوتاه','items.'+i+'.text',x.text||'')}${input('ارزش (مثلاً ۹۷)','items.'+i+'.value',x.value||'')}</div>`).join('')}<button type="button" class="add-inline" data-add-item="bonusStack">+ افزودن بونوس</button>`).outerHTML;
      case 'beforeAfter': return section('Before / After',`${input('عنوان قبل','beforeLabel',b.beforeLabel||'قبل')}${textarea('متن قبل','beforeText',b.beforeText||'')}${input('عنوان بعد','afterLabel',b.afterLabel||'بعد')}${textarea('متن بعد','afterText',b.afterText||'')}${input('یادداشت وسط (اختیاری)','note',b.note||'')}${rangeField('Text size','textSize',b.textSize??14,10,22,1)}${rangeField('Radius','radius',b.radius??18,0,36,1)}${rangeField('Padding','padding',b.padding??20,8,44,1)}${rangeField('Gap','gap',b.gap??14,4,32,1)}${color('پس‌زمینه قبل','beforeBg',b.beforeBg||'#FEF3F2')}${color('حاشیه قبل','beforeBorder',b.beforeBorder||'#FECDCA')}${color('رنگ قبل','beforeColor',b.beforeColor||'#B42318')}${color('پس‌زمینه بعد','afterBg',b.afterBg||'#F0FDF4')}${color('حاشیه بعد','afterBorder',b.afterBorder||'#ABEFC6')}${color('رنگ بعد','afterColor',b.afterColor||'#067647')}${color('رنگ متن','textColor',b.textColor||'#475467')}`).outerHTML;
      case 'curriculum': return section('Curriculum',`${richField('عنوان','title',b.title||'سرفصل‌های دوره')}${rangeField('Title size','titleSize',b.titleSize??20,14,36,1)}${rangeField('Text size','textSize',b.textSize??15,11,22,1)}${check('باز بودن ماژول اول','openFirst',b.openFirst)}${rangeField('Gap','gap',b.gap??10,4,24,1)}${rangeField('Radius','radius',b.radius??22,0,40,1)}${rangeField('Padding Y','padY',b.padY??22,10,52,1)}${rangeField('Padding X','padX',b.padX??20,10,52,1)}${color('رنگ تاکیدی','accent',b.accent||'#175CD3')}${color('پس‌زمینه','bg',b.bg||'#FFFFFF')}${color('حاشیه','border',b.border||'#EAECF0')}${color('پس‌زمینه ماژول','moduleBg',b.moduleBg||'#F8FAFC')}${color('حاشیه ماژول','moduleBorder',b.moduleBorder||'#EAECF0')}${color('رنگ عنوان','titleColor',b.titleColor||'#101828')}${color('رنگ متن','textColor',b.textColor||'#101828')}${(b.modules||[]).map((m,i)=>`<div class="repeater"><div class="field-head"><b>ماژول ${i+1}</b>${buttonRm('curriculum',i)}</div>${richField('عنوان ماژول','modules.'+i+'.title',m.title||'ماژول')}${input('متا (مثلاً ۴ درس)','modules.'+i+'.meta',m.meta||'')}${check('باز است (بدون قفل)','modules.'+i+'.unlocked',m.locked===false)}${textarea('درس‌ها (هر خط یک درس)','modules.'+i+'.lessonsText',Array.isArray(m.lessons)?m.lessons.join('\n'):'')}</div>`).join('')}<button type="button" class="add-inline" data-add-item="curriculum">+ افزودن ماژول</button>`).outerHTML;
      case 'instructor': return section('Instructor',`${input('نام','name',b.name||'')}${input('عنوان/تخصص','role',b.role||'')}${textarea('بیو','bio',b.bio||'')}${input('URL عکس (اختیاری)','avatar',b.avatar||'')}${input('کیکر','kicker',b.kicker||'')}${rangeField('Name size','nameSize',b.nameSize??20,14,32,1)}${rangeField('Text size','textSize',b.textSize??14,10,20,1)}${rangeField('Radius','radius',b.radius??24,0,40,1)}${rangeField('Padding Y','padY',b.padY??26,10,56,1)}${rangeField('Padding X','padX',b.padX??24,10,56,1)}${color('رنگ تاکیدی','accent',b.accent||'#175CD3')}${color('پس‌زمینه','bg',b.bg||'#F8FAFC')}${color('حاشیه','border',b.border||'#EAECF0')}${color('رنگ نام','titleColor',b.titleColor||'#101828')}${color('رنگ متن','textColor',b.textColor||'#475467')}<div class="helper">اعتبارها را در خط جدا بنویس (هر خط یک مورد).</div>${textarea('اعتبارها (هر خط یک مورد)','credsText',Array.isArray(b.creds)?b.creds.join('\n'):'')}`).outerHTML;
      case 'testiMarquee': return section('Testimonials Marquee',`${selectField('حالت','mode',b.mode||'auto',[['auto','خودکار (اسکرول پیوسته)'],['manual','دستی (فلش و سوایپ)']])}${selectField('نوع','variant',b.variant||'testi',[['testi','تقدیرنامه‌ها'],['logos','لوگو وال']])}${selectField('جهت','direction',b.direction||'rtl',[['rtl','راست‌به‌چپ'],['ltr','چپ‌به‌راست']])}${rangeField('سرعت (ثانیه هر دور)','speed',b.speed??26,6,90,1)}${check('توقف هنگام هاور','pauseOnHover',b.pauseOnHover!==false)}${b.variant!=='logos'?check('نمایش ستاره‌ها','showStars',b.showStars!==false)+rangeField('تعداد ستاره','stars',b.stars??5,1,5,1):''}${rangeField('عرض کارت (px)','cardWidth',b.cardWidth??300,180,600,10)}${rangeField('گردی گوشه','radius',b.radius??18,0,40,1)}${color('پس‌زمینه کارت','cardBg',b.cardBg||'#FFFFFF')}${color('حاشیه کارت','cardBorder',b.cardBorder||'#EAECF0')}${rangeField('فاصله بین کارت‌ها','gap',b.gap??16,4,60,1)}${b.variant==='logos'?color('رنگ متن لوگو','color',b.color||'#98A2B3')+rangeField('اندازه لوگو','size',b.size??20,14,60,1)+rangeField('شفافیت ٪','opacity',b.opacity??70,10,100,1):color('رنگ متن','textColor',b.textColor||'#344054')+rangeField('سایز متن','textSize',b.textSize??14,10,24,1)+color('رنگ اسم','titleColor',b.titleColor||'#101828')+color('رنگ سمت','roleColor',b.roleColor||'#667085')+color('پس‌زمینه آواتار','avatarBg',b.avatarBg||'#EEF4FF')+color('رنگ ستاره','starColor',b.starColor||'#F79009')}${(b.items||[]).map((x,i)=>`<div class="repeater"><div class="field-head"><b>${b.variant==='logos'?'لوگو':'نظر'} ${i+1}</b>${buttonRm('testiMarquee',i)}</div>${b.variant==='logos'?input('URL عکس (اختیاری)','items.'+i+'.avatar',x.avatar||'')+input('نام/متن لوگو','items.'+i+'.name',x.name||''):richField('متن نظر','items.'+i+'.quote',x.quote||'')+input('اسم','items.'+i+'.name',x.name||'')+input('سمت','items.'+i+'.role',x.role||'')+input('URL آواتار (اختیاری)','items.'+i+'.avatar',x.avatar||'')}</div>`).join('')}<button type="button" class="add-inline" data-add-item="testiMarquee">+ افزودن مورد</button><div class="helper">حالت خودکار: اسکرول پیوسته با توقف در هاور. حالت دستی: فلش‌ها و سوایپ لمسی.</div>`).outerHTML;
      case 'ctaSplit': return section('CTA Split',`${richField('Title','title',b.title||'آماده شروعی؟')}${richField('Text','text',b.text||'')}${input('Button','button',b.button||'شروع کنید')}${input('URL','url',b.url||'#')}${input('Image URL','image',b.image||'')}${color('Background','bg',b.bg||'#101828')}${color('Accent','accent',b.accent||'#175CD3')}${rangeField('Radius','radius',b.radius??24,0,80,1)}${rangeField('Padding','pad',b.pad??28,8,100,1)}`).outerHTML;
      case 'logo': return section('Logo',`${input('Text','text',b.text||'RAVA')}${alignmentField(b)}`).outerHTML;
      case 'feature': {
        if(!Array.isArray(b.icons)||!b.icons.length)b.icons=[{icon:b.icon||'✓',iconUrl:b.iconUrl||'',url:b.url||'',target:b.target||'_self',color:b.iconColor||'#175CD3'}];
        if(!b.html)b.html=plainToHtml(b.text||'توضیح کوتاه');
        return section('متن Feature',`${richEditor(b)}`).outerHTML
          +section('آیکون',`${iconCardHtml(b,b.icons[0],0,1)}${rangeField('اندازه قاب','box',b.box??54,20,140,1)}${rangeField('اندازه آیکون','size',b.size??24,8,96,1)}${color('پس‌زمینه قاب','iconBg',b.iconBg||'#FFFFFF00')}${selectField('شکل قاب','shape',b.shape||'rounded',[['rounded','گرد'],['circle','دایره'],['square','مربع'],['none','بدون قاب']])}${rangeField('شفافیت','opacity',b.opacity??100,0,100,1)}${rangeField('چرخش','rotate',b.rotate??0,-180,180,1)}`).outerHTML
          ;
      }
      case 'stickySection': return section('Sticky Section',`${input('Label','label',b.label||'Sticky section')}${selectField('Position','position',b.position||'bottom',[['bottom','Bottom'],['top','Top']])}${rangeField('Offset','offset',b.offset??0,0,80,1)}${check('Show on mobile','showOnMobile',b.showOnMobile!==false)}${check('Close button','closeable',b.closeable)}<div class="helper">این بخش را می‌توانی برای متن، دکمه، فرم یا هر Element دیگری استفاده کنی و هنگام اسکرول ثابت می‌ماند.</div>`).outerHTML;
      case 'stickyColumn': return section('Sticky Column',`${input('Label','label',b.label||'Sticky column')}${selectField('Position','position',b.position||'top',[['top','Top'],['bottom','Bottom']])}${rangeField('Offset','offset',b.offset??18,0,120,1)}${rangeField('Width %','width',b.width??100,40,100,1)}${rangeField('Min height','minHeight',b.minHeight??160,60,520,1)}${check('Show on mobile','showOnMobile',b.showOnMobile!==false)}<div class="helper">داخل این ستون می‌توانی متن، تصویر، فرم، دکمه و هر عنصر دیگری قرار بدهی.</div>`).outerHTML;
      case 'marquee': return section('Marquee',`${richField('Text','text',b.text||'خبر ویژه • تخفیف • شروع دوره')}${rangeField('Speed sec','speed',b.speed??18,4,60,1)}${color('Text color','color',b.color||'#101828')}${color('Background','bg',b.bg||'#FFFFFF')}${rangeField('Font size','size',b.size??16,10,48,1)}${alignmentField(b)}`).outerHTML;
      case 'logoCloud': return section('Logo Cloud',`${rangeField('Items per row','perRow',b.perRow??4,1,6,1)}${rangeField('Gap','gap',b.gap??14,0,60,1)}${(b.items||[]).map((x,i)=>`<div class="repeater"><b>Logo ${i+1}</b>${input('Image URL',`items.${i}.url`,x.url||'')}${input('Alt',`items.${i}.alt`,x.alt||'')}${input('Link',`items.${i}.link`,x.link||'')}${rangeField('Size',`items.${i}.size`,x.size??72,24,180,1)}${buttonRm('logoCloud',i)}</div>`).join('') }<button type="button" class="add-inline" data-add-item="logoCloud">+ Add logo</button>${alignmentField(b)}`).outerHTML;
      case 'progress': return section('Progress Bar',`${input('Label','label',b.label||'پیشرفت')}${rangeField('Value %','value',b.value??70,0,100,1)}${color('Bar','bar',b.bar||'#175CD3')}${color('Track','track',b.track||'#EEF2F6')}${rangeField('Height','height',b.height??10,4,40,1)}${rangeField('Radius','radius',b.radius??999,0,999,1)}${rangeField('Label size','labelSize',b.labelSize??14,9,32,1)}${alignmentField(b)}`).outerHTML;
      case 'comparison': return section('Before / After',`${input('Before image','before',b.before||'')}${input('After image','after',b.after||'')}${rangeField('Height','height',b.height??360,160,720,1)}${rangeField('Start %','start',b.start??50,5,95,1)}${rangeField('Radius','radius',b.radius??18,0,100,1)}${alignmentField(b)}`).outerHTML;
      case 'spacer': return section('Spacer',`${rangeField('Height','height',b.height??48,0,800,1)}`).outerHTML;
      case 'group': return section('Group',`${input('Label','label',b.label||'Group')}${alignmentField(b)}`).outerHTML;
      case 'upsellBox': return section('Upsell Box',`${input('badge','eyebrow',b.eyebrow||'')}${input('title','title',b.title||'')}${textarea('subtitle','subtitle',b.subtitle||'')}${input('items title','itemsTitle',b.itemsTitle||'')}${input('save note','saveNote',b.saveNote||'')}${input('base price','basePrice',b.basePrice??'0')}${input('button label','btnLabel',b.btnLabel||'')}${check('first item required (legacy، بدون اتصال)','firstRequired',b.firstRequired!==false)}${(b.items||[]).map((x,i)=>{const linked=String(x.productSlug||'');const prod=(window.BUILDER_DATA&&Array.isArray(window.BUILDER_DATA.products))?window.BUILDER_DATA.products.find(pp=>pp.slug===linked):null;const priceLocked=Boolean(linked&&prod);return `<details class="repeater upsell-item-acc" data-upsell-acc="${i}" style="border:1px solid #EAECF0;border-radius:12px;padding:10px 12px;margin-bottom:8px;background:#fff"><summary style="cursor:pointer;display:flex;align-items:center;gap:8px;list-style:none"><b style="flex:1">آیتم ${i+1}${linked?` — <span style="color:#175CD3">${esc(prod?.title||linked)}</span>`:''}</b>${priceLocked?'<span style="font-size:10px;background:#ECFDF3;color:#027A48;padding:3px 8px;border-radius:999px;font-weight:800">قیمت از محصول</span>':''}</summary><div style="padding-top:10px">${selectField('اتصال به محصول','items.'+i+'.productSlug',linked,[['','— بدون اتصال (دستی) —'],...((window.BUILDER_DATA&&Array.isArray(window.BUILDER_DATA.products))?window.BUILDER_DATA.products:[]).map(pp=>[pp.slug,(pp.title||pp.slug)+(pp.price!==''&&pp.price!=null?' — '+(pp.price||'0'):'')])])}${linked&&prod?'<div class="helper">قیمت و عنوان این آیتم از محصول انتخاب‌شده می‌آید — قیمت محصول را از پنل محصولات تغییر بده. توضیح اختیاری داخل اکوردیون سایت نمایش داده می‌شود.</div>':''}${input('title (بدون اتصال)','items.'+i+'.title',x.title||'')}${textarea('desc (توضیح داخل اکوردیون)','items.'+i+'.desc',x.desc||'')}${input('price (بدون اتصال)','items.'+i+'.price',x.price??'0')}${input('compare','items.'+i+'.comparePrice',x.comparePrice??'')}${input('image URL','items.'+i+'.image',x.image||'')}</div></details>`;}).join('')}<button type="button" class="add-inline" data-add-item="upsellBox">+ Add upsell item</button>`).outerHTML+section('Style',`${color('accent','accent',b.accent||'#175CD3')}${color('card bg','cardBg',b.cardBg||'#F8FAFC')}${color('item bg','itemBg',b.itemBg||'#FFFFFF')}${color('border','borderColor',b.borderColor||'#EAECF0')}${color('text','fg',b.fg||'#101828')}${color('muted','muted',b.muted||'#667085')}${color('button bg','bg',b.bg||'#175CD3')}${color('button text','fg2',b.fg2||'#FFFFFF')}${rangeField('radius','radius',b.radius??24,0,48,1)}${rangeField('padX','padX',b.padX??20,0,60,1)}${rangeField('padY','padY',b.padY??26,0,80,1)}${rangeField('title size','titleSize',b.titleSize??24,12,64,1)}${rangeField('btn size','btnSize',b.btnSize??16,10,28,1)}<div class="helper">آیتم‌های متصل به محصول همیشه با قیمت فعلی همان محصول فروخته می‌شوند؛ تیک هر آیتم، دقیقاً همان محصول را به سفارش اضافه می‌کند و بعد از پرداخت دسترسی فعال می‌شود.</div>`).outerHTML;
      case 'offerCard': return section('Offer Card',`${input('badge','badge',b.badge||'')}${color('badge bg','badgeBg',b.badgeBg||'#F79009')}${input('image URL','image',b.image||'')}${rangeField('image height','imageHeight',b.imageHeight??180,0,420,2)}${input('eyebrow','eyebrow',b.eyebrow||'')}${input('title','title',b.title||'')}${textarea('desc','desc',b.desc||'')}${input('currency','currency',b.currency||'$')}${input('price','price',b.price??'0')}${input('compare price','comparePrice',b.comparePrice??'')}${color('price color','priceColor',b.priceColor||'')}${rangeField('price size','priceSize',b.priceSize??30,14,72,1)}${selectField('button target','target',b.target||'checkout',[['checkout','Checkout page'],['subpage','Product sub-page'],['custom','Custom URL']])}${b.target==='subpage'?subPageSelectField('sub-page','subpage',(b.subpage||'').replace(/^\/+/, '')):b.target==='custom'?input('URL','url',b.url||'#buy'):''}${input('button label','btnLabel',b.btnLabel||'')}${color('button bg','btnBg',b.btnBg||'')}${color('button text','btnFg',b.btnFg||'#FFFFFF')}${input('note','note',b.note||'')}`).outerHTML+section('Style',`${color('accent','accent',b.accent||'#175CD3')}${color('bg','bg',b.bg||'#FFFFFF')}${color('border','borderColor',b.borderColor||'#EAECF0')}${rangeField('radius','radius',b.radius??18,0,48,1)}${rangeField('padX','padX',b.padX??18,0,60,1)}${rangeField('padY','padY',b.padY??18,0,80,1)}`).outerHTML;
      case 'countdownOffer': return section('Countdown Offer',`${input('title','title',b.title||'')}${rangeField('minutes','minutes',b.minutes??60,1,1440,1)}${input('note','note',b.note||'')}${input('cta label','ctaLabel',b.ctaLabel||'')}${color('accent','accent',b.accent||'#F79009')}${color('bg','bg',b.bg||'#101828')}${color('title color','fg',b.fg||'#FFFFFF')}${color('digit bg','digitBg',b.digitBg||'#FFFFFF14')}${color('digit color','digitColor',b.digitColor||'#FFFFFF')}${rangeField('digit size','digitSize',b.digitSize??24,14,64,1)}${rangeField('title size','titleSize',b.titleSize??18,12,48,1)}${rangeField('radius','radius',b.radius??20,0,48,1)}<div class="helper">Live countdown; survives reloads per visitor until the deadline passes.</div>`).outerHTML;
      case 'stickyBuyBar': return section('Sticky Buy Bar',`${input('title','title',b.title||'')}${input('currency','currency',b.currency||'$')}${input('price','price',b.price??'0')}${input('compare price','comparePrice',b.comparePrice??'')}${input('image URL','image',b.image||'')}${selectField('button target','target',b.target||'checkout',[['checkout','Checkout page'],['subpage','Product sub-page'],['custom','Custom URL']])}${b.target==='subpage'?subPageSelectField('sub-page','subpage',(b.subpage||'').replace(/^\/+/, '')):b.target==='custom'?input('URL','url',b.url||'#buy'):''}${input('button label','btnLabel',b.btnLabel||'')}${color('accent','accent',b.accent||'#175CD3')}${color('price color','priceColor',b.priceColor||'')}${color('bg','bg',b.bg||'#FFFFFF')}${color('border','borderColor',b.borderColor||'#EAECF0')}${rangeField('radius','radius',b.radius??16,0,30,1)}<div class="helper">In the live site this bar sticks to the bottom while scrolling.</div>`).outerHTML;
      /* V117 — بازطراحی تب محتوای Section: به‌جای یک کارت ۳۰ فیلدی، شش کارت کوچک.
         همهٔ کلیدها همان کلیدهای قبلی‌اند (رندرر دست‌نخورده می‌ماند)؛ فقط innerGap
         جدید است: فاصلهٔ یکنواخت بین عناصر داخل سکشن. */
      case 'mediaMarquee': return chl('عنوان (اختیاری)', input('متن بالای نوار — مثلاً «کسانی که به ما اعتماد کرده‌اند»','title',b.title||''))
        +chl('بکگراند (اختیاری)', mediaPickerField('تصویر پس‌زمینهٔ نوار (PNG / JPG / WebP / SVG)','marqueeBackground',b.marqueeBackground||'')+'<div class="helper">اگر تصویری انتخاب کنی، تصاویر/لوگوها روی آن نشان داده می‌شوند.</div>')
        +chl('تصاویر', (b.items||[]).map((x,i)=>`<div class="repeater"><div class="field-head"><b>تصویر ${i+1}</b>${buttonRm('mediaMarquee',i)}</div>${mediaPickerField('آدرس تصویر (JPG / PNG / WebP / SVG یا هر URL)',`items.${i}.src`,x.src||'')}${input('متن جایگزین (Alt)',`items.${i}.alt`,x.alt||'')}${input('لینک (اختیاری)',`items.${i}.link`,x.link||'')}</div>`).join('')+'<button type="button" class="add-inline" data-add-item="mediaMarquee">+ افزودن تصویر</button><div class="helper">جای خالی‌ها فقط در بیلدر دیده می‌شوند؛ روی سایت فقط تصاویر دارای آدرس حرکت می‌کنند.</div>');
      case 'popupSection':
      case 'section': {
        const isPop=b.type==='popupSection';
        const bgType=b.backgroundType||'solid';
        const ov=color('روکای تیره','overlay',b.overlay||'#000000')+rangeField('شدت روکا ٪','overlayOpacityPct',Math.round(n(b.overlayOpacity,0)*100),0,100,1);
        const bgFields= bgType==='image'
          ? input('تصویر پس‌زمینه','backgroundImage',b.backgroundImage||'')+selectField('اندازه تصویر','backgroundSize',b.backgroundSize||'cover',[['cover','Cover'],['contain','Contain'],['100% 100%','کشیده']])+selectField('موقعیت تصویر','backgroundPosition',b.backgroundPosition||'center',[['center','وسط'],['top','بالا'],['bottom','پایین'],['left','چپ'],['right','راست'],['top left','بالا چپ'],['top right','بالا راست'],['bottom left','پایین چپ'],['bottom right','پایین راست']])+selectField('تکرار تصویر','backgroundRepeat',b.backgroundRepeat||'no-repeat',[['no-repeat','بدون تکرار'],['repeat','تکرار'],['repeat-x','تکرار افقی'],['repeat-y','تکرار عمودی']])+ov
          : bgType==='video'
          ? input('لینک ویدیوی پس‌زمینه (MP4)','backgroundVideo',b.backgroundVideo||'')+ov+'<div class="helper">ویدیو بی‌صدا و لوپ پخش می‌شود؛ روکا خوانایی متن روی آن را بالا می‌برد.</div>'
          : bgType==='solid'
          ? color('رنگ پس‌زمینه','backgroundColor',b.backgroundColor??b.bg??'#FFFFFF')
          : color('رنگ ۱','gradient1',b.gradient1||'#FFFFFF')+color('رنگ ۲','gradient2',b.gradient2||'#EEF4FF')+input('جهت گرادیان','gradientDir',b.gradientDir||'180deg');
        const hm=b.sectionHeight||'auto';
        return chl('نوع پس‌زمینه', selectField('نوع پس‌زمینه','backgroundType',bgType,[['solid','رنگ ساده'],['gradient','گرادیان'],['radial','گرادیان شعاعی'],['image','تصویر'],['blob','حباب‌های رنگی'],['video','ویدیو']]))
          +chl('پس‌زمینه', bgFields)
          +chl('اندازه و چیدمان', selectField('حالت ارتفاع','sectionHeight',hm,[['auto','خودکار'],['min','حداقل ارتفاع'],['fixed','ارتفاع ثابت']])+(hm!=='auto'?rangeField('ارتفاع (px)','height',b.height??420,80,1600,10):'')+(hm==='min'?rangeField('حداقل ارتفاع (px)','minHeight',b.minHeight??240,80,1600,10):'')+rangeField('عرض ٪','width',b.width??100,25,100,1)+rangeField('حداکثر عرض ٪','maxWidth',b.maxWidth??100,25,100,1)+rangeField('عرض محتوای داخلی (px)','innerMaxWidth',b.innerMaxWidth??1200,320,1800,10)+(isPop?'':check('تمام‌عرض (Full bleed)','fullBleed',b.fullBleed||b.edgeToEdge)))
          +chl('فاصله‌گذاری داخلی', rangeField('پدینگ عمودی داخل','padY',b.padY??28,0,160,1)+rangeField('پدینگ افقی داخل','padX',b.padX??24,0,160,1)+rangeField('فاصلهٔ بین عناصر داخلی','innerGap',b.innerGap??0,0,160,1)+'<div class="helper">«فاصلهٔ بین عناصر داخلی» بین همهٔ عناصر داخل این سکشن فاصلهٔ یکنواخت می‌اندازد. فاصلهٔ خود سکشن با عناصر بیرونی در تب «استایل» است.</div>')
          +chl('چینش محتوای داخلی', alignmentField(b))
          +(isPop?'<div class="helper" style="padding:0 14px 14px">هر عنصری (فرم، متن، دکمه، تصویر…) را داخل این پاپ‌آپ بکش. زمان نمایش در تب «استایل» است.</div>':'<div class="inspector-section"><div class="inspector-section__body" style="padding:12px 14px 14px"><button type="button" class="mini-btn" id="sectionToColumns">⇄ تبدیل این بخش به کالمنز</button></div></div>');
      }
      default:return section('Content',input('Title','title',b.title||''),true).outerHTML;
    }
  }
  /* V122 — تب طراحی Section/Group: فقط قاب و روکا؛ فاصله‌گذاری کامل در تب «فاصله‌گذاری */
  function sectionDesignFields(b){
    const isSection=b.type==='section'||b.type==='popupSection';
    const frameCard=chl('قاب و ظاهر', color(isSection?'رنگ پس‌زمینه':'رنگ گروه','backgroundColor',b.backgroundColor??b.bg??'#FFFFFF')+color('رنگ خط','border',b.border||'#00000000')+rangeField('ضخامت خط','borderWidth',b.borderWidth??0,0,16,1)+selectField('نوع خط','borderStyle',b.borderStyle||'solid',[['solid','ممتد'],['dashed','خط‌چین'],['dotted','نقطه‌چین'],['double','دوتایی']])+rangeField('گردی گوشه','radius',b.radius??0,0,120,1)+selectField('سایه','shadow',b.shadow||'none',[['none','بدون'],['sm','کم'],['md','متوسط'],['lg','زیاد'],['xl','خیلی زیاد']]));
    const overlayCard=isSection?chl('روکای روی پس‌زمینه', color('رنگ روکا','overlay',b.overlay||'#000000')+rangeField('شدت روکا ٪','overlayOpacityPct',Math.round(n(b.overlayOpacity,0)*100),0,100,1)+'<div class="helper">روکا روی تصویر/ویدیوی پس‌زمینه می‌نشیند و خوانایی متن را بالا می‌برد. برای پس‌زمینهٔ ساده لازم نیست.</div>'):'';
    return frameCard+overlayCard;
  }
  function styleFields(b){
    /* V122 — تب طراحی دیگر فاصله‌گذاری ندارد؛ همهٔ تنظیمات فاصله (حتی برای
       سکشن/گروه) فقط داخل تب اختصاصی «فاصله‌گذاری» است. */
    if(b.type==='popupSection') return chl('زمان‌بندی نمایش', rangeField('نمایش بعد از ورود (ثانیه)','popupDelay',b.popupDelay??5,1,120,1)+selectField('دفعات نمایش','popupFrequency',b.popupFrequency||'always',[['always','هر بار که صفحه باز شود'],['session','یک‌بار در هر نشست'],['once','فقط یک‌بار برای هر بازدیدکننده']])+'<div class="helper">از لحظهٔ ورود بازدیدکننده به صفحه شمرده می‌شود (۱ تا ۱۲۰ ثانیه).</div>')
      +chl('پنجره', rangeField('عرض پنجره (px)','popupWidth',b.popupWidth??560,260,1400,10)+selectField('جای نمایش','popupPosition',b.popupPosition||'center',[['center','وسط صفحه'],['bottom','پایین صفحه']])+check('دکمهٔ بستن (×)','showClose',b.showClose!==false)+color('رنگ دکمهٔ بستن','closeColor',b.closeColor||'#101828')+color('پس‌زمینهٔ دکمهٔ بستن','closeBg',b.closeBg||'#FFFFFF'))
      +chl('پس‌زمینهٔ تیره', color('رنگ','backdropColor',b.backdropColor||'#0B1220')+rangeField('شدت (٪)','backdropOpacity',b.backdropOpacity??60,0,100,1)+check('با کلیک روی پس‌زمینه بسته شود','closeOnBackdrop',b.closeOnBackdrop!==false)+check('قفل اسکرول صفحه هنگام نمایش','lockScroll',b.lockScroll!==false))
      +sectionDesignFields(b);
    if(CORE_DESIGN[b.type])return coreDesignFields(b);
    /* V117 — Section/Group تب طراحی اختصاصی دارند: قاب + روکا. ابعاد در تب
       محتوا هست و تایپوگرافی عمومی اینجا فقط نویز بود، حذف شد. فاصله‌گذاری هم
       از V122 فقط در کارت «فاصله و اندازه» در تب استایل است. */
    if(b.type==='section'||b.type==='group')return sectionDesignFields(b);
    if(b.type==='anywhereSection'){
      const arrows=`<div class="anywhere-nudge-grid" aria-label="جابجایی پیکسلی"><button type="button" data-any-move="nw">↖</button><button type="button" data-any-move="n">↑</button><button type="button" data-any-move="ne">↗</button><button type="button" data-any-move="w">←</button><button type="button" data-any-move="0">•</button><button type="button" data-any-move="e">→</button><button type="button" data-any-move="sw">↙</button><button type="button" data-any-move="s">↓</button><button type="button" data-any-move="se">↘</button></div>`;
      return sectionDesignFields(b)+v142Card('اندازه و جای‌گذاری',rangeField('عرض (px)','width',b.width??320,40,1800,1)+rangeField('ارتفاع (px)','height',b.height??180,0,1600,1)+rangeField('جابجایی افقی (px)','offsetX',b.offsetX??0,-2000,2000,1)+rangeField('جابجایی عمودی (px)','offsetY',b.offsetY??0,-2000,2000,1)+arrows,'⤢');
    }
    if(b.type==='feature'){
      return v142Card('اندازه Feature',
          rangeField('عرض عنصر (٪)','width',b.width??100,10,100,1)
          +rangeField('ارتفاع (px)','height',b.height??0,0,600,1)
          +rangeField('فاصله داخلی افقی','padX',b.padX??0,0,80,1)
          +rangeField('فاصله داخلی عمودی','padY',b.padY??0,0,80,1),
        '▨').replace('class="v142-card"','class="v142-card feature-surface-card"')
        +v142Card('چینش',
          alignmentField(b)
          +selectField('جای آیکون','iconPosition',b.iconPosition||'start',[['start','ابتدا'],['end','انتها']])
          +rangeField('فاصله آیکون تا متن','iconGap',b.iconGap??12,0,60,1),
          '↔')
        +v142Card('تعامل',
          selectField('حرکت هاور','hoverAnimation',b.hoverAnimation||'none',[['none','بدون'],['lift','بالا آمدن'],['scale','بزرگ شدن'],['glow','درخشش']])
          +check('قفل عنصر','locked',b.locked)
          +check('پنهان در ویرایشگر','hiddenEditor',b.hiddenEditor),
          '✦');
    }
    /* V108 — tab 2 (طراحی) = one visual system, de-duplicated:
       Typography & color merges the old 'Quick style' + 'Typography' sections
       (font/size/weight/line/letter/color/align lived in both), Layout keeps
       container sizing, Appearance keeps surface look. Widget-specific groups
       below are unchanged. 'section' gets this tab for the first time. */
    let s=''; /* V116 — بقیهٔ عناصر فقط کنترل‌های اختصاصی خودشان؛ V122 — بدون فاصله‌گذاری */
    s+=section('Typography & color',`${fontSelectField('Font','fontFamily',b.fontFamily||'system-ui')}${rangeField('Text size','size',b.size??18,8,180,1)}${rangeField('Weight','weight',b.weight??400,100,900,100)}${rangeField('Line height','line',b.line??1.5,.8,3,.05)}${rangeField('Letter spacing','letter',b.letter??0,-2,12,.1)}${color('Text color','color',b.color||'#101828')}${alignmentField(b)}`).outerHTML;
    s+=section('Layout',`${rangeField('Min height','minHeight',b.minHeight??0,0,1600,1)}${selectField('Position','position',b.position||'static',[['static','Static'],['relative','Relative'],['absolute','Absolute'],['sticky','Sticky']])}`).outerHTML;
    s+=section('Typography details',`${check('Italic','italic',b.italic)}${selectField('Decoration','decoration',b.decoration||'none',[['none','None'],['underline','Underline'],['line-through','Strikethrough'],['overline','Overline']])}${selectField('Transform','transform',b.transform||'none',[['none','None'],['uppercase','Uppercase'],['lowercase','Lowercase'],['capitalize','Capitalize']])}${selectField('Direction','direction',b.direction||'auto',[['auto','Auto'],['rtl','RTL'],['ltr','LTR']])}`).outerHTML;
    s+=section('Appearance',`${color('Background','bg',b.bg||'#FFFFFF')}${rangeField('Radius','radius',b.radius??(b.type==='button'?12:16),0,120,1)}${selectField('Shadow','shadow',b.shadow||'none',[['none','None'],['sm','Small'],['md','Medium'],['lg','Large'],['xl','Extra']])}${rangeField('Opacity','opacity',b.opacity??100,0,100,1)}${rangeField('Rotate','rotate',b.rotate??0,-180,180,1)}`).outerHTML;
    if(['card','testimonial','pricing','section','carousel','video','stickySection','stickyColumn','group','timeline'].includes(b.type)) { const bgKey=b.type==='section'?'backgroundColor':'bg'; const bgVal=b.type==='section'?(b.backgroundColor??b.bg??'#FFFFFF'):(b.bg||'#FFFFFF'); s+=section('Surface',`${color('Background',bgKey,bgVal)}${color('Border','border',b.border||'#00000000')}${rangeField('Border width','borderWidth',b.borderWidth??0,0,16,1)}${selectField('Border style','borderStyle',b.borderStyle||'solid',[['solid','Solid'],['dashed','Dashed'],['dotted','Dotted'],['double','Double']])}`).outerHTML; }
    if(b.type==='button') s+=section('Button',`${check('Gradient','gradient',b.gradient)}${selectField('Gradient direction','gradientDir',b.gradientDir||'135deg',[['90deg','90°'],['135deg','135°'],['180deg','180°'],['45deg','45°']])}${color('Gradient end','gradient2',b.gradient2||'#7F56D9')}${color('Text','fg',b.fg||'#FFFFFF')}${color('Stroke','border',b.border||'#175CD3')}${rangeField('Stroke width','borderWidth',b.borderWidth||0,0,16,1)}${selectField('Stroke style','borderStyle',b.borderStyle||'solid',[['solid','Solid'],['dashed','Dashed'],['dotted','Dotted']])}${rangeField('Inner horizontal padding','innerPadX',b.innerPadX??b.padX??20,0,96,1)}${rangeField('Inner vertical padding','innerPadY',b.innerPadY??b.padY??12,0,72,1)}`).outerHTML;
    if(b.type==='image') s+=section('Image',`${selectField('Fit','objectFit',b.objectFit||'cover',[['cover','Cover'],['contain','Contain']])}${color('Border','border',b.border||'#00000000')}${rangeField('Border width','borderWidth',b.borderWidth??0,0,12,1)}${selectField('Caption position','captionPosition',b.captionPosition||'bottom',[['top','Above image'],['bottom','Below image'],['overlay','Overlay']])}${rangeField('Caption size','captionSize',b.captionSize??14,9,32,1)}${color('Caption color','captionColor',b.captionColor||'#475467')}`).outerHTML;
    if(b.type==='video') s+=section('Video',`${rangeField('Radius','radius',b.radius??18,0,120,1)}${color('Border','border',b.border||'#00000000')}${rangeField('Border width','borderWidth',b.borderWidth??0,0,12,1)}${selectField('Shadow','shadow',b.shadow||'none',[['none','None'],['sm','Small'],['md','Medium'],['lg','Large'],['xl','Extra']])}`).outerHTML;
    if(['trustBar','iconGrid','steps','timeline','guarantee','leadMagnet','featureCompare','avatarStack'].includes(b.type)) s+=section('Widget typography',`${rangeField('Title size','titleSize',b.titleSize??16,10,64,1)}${rangeField('Title weight','titleWeight',b.titleWeight??800,100,900,100)}${rangeField('Text size','textSize',b.textSize??13,9,36,1)}${rangeField('Text weight','textWeight',b.textWeight??400,100,900,100)}${color('Title color','titleColor',b.titleColor||'#101828')}${color('Text color','textColor',b.textColor||'#667085')}`).outerHTML;
    if(b.type==='social') s+=section('Social typography',`${rangeField('Text size','textSize',b.textSize??14,9,32,1)}${rangeField('Text weight','textWeight',b.textWeight??700,100,900,100)}${color('Text color','textColor',b.textColor||'#101828')}`).outerHTML;
    if(b.type==='ctaSplit') s+=section('CTA typography',`${rangeField('Title size','titleSize',b.titleSize??34,18,80,1)}${rangeField('Title weight','titleWeight',b.titleWeight??900,100,1000,100)}${rangeField('Text size','textSize',b.textSize??15,10,36,1)}${rangeField('Button size','buttonSize',b.buttonSize??15,10,28,1)}${color('Button background','accent',b.accent||'#175CD3')}`).outerHTML;
    s+=section('Interaction',`${selectField('Hover animation','hoverAnimation',b.hoverAnimation||'none',[['none','None'],['lift','Lift'],['scale','Scale'],['glow','Glow']])}${check('Lock element','locked',b.locked)}${check('Hide in editor','hiddenEditor',b.hiddenEditor)}`).outerHTML;
    return s;
  }
  /* ===== V110 - design tab for the 8 core elements =======================
     Each element gets exactly the controls the shared renderer applies -
     no dead knobs, Persian labels, grouped into small cards. */
  const CORE_DESIGN={mediaMarquee:1,text:1,button:1,image:1,video:1,audio:1,icon:1,badge:1,embed:1,stickyCta:1,stickyButton:1,columns:1,header:1,footer:1};/* V133 — هدر/فوتر تب طراحی اختصاصی دارند */
  function coreDesignFields(b){
    switch(b.type){
      /* V133 — تب طراحی هدر: ارتفاع + پریست‌های چیدمان + پس‌زمینه/گلس + رنگ‌ها + منوی موبایل */
      case 'header': return shellHeaderDesignFields(b);
      /* V133 — تب طراحی فوتر: ارتفاع + پس‌زمینه/پترن + ستون‌ها + جداکننده + رنگ‌ها */
      case 'footer': return shellFooterDesignFields(b);
      /* V117 — تب طراحی Columns: فقط همان کنترل‌هایی که رندرر واقعاً می‌خواند */
      /* V122 — Columns: «فاصله‌گذاری» از تب طراحی حذف شد (در تب محتوا + تب فاصله‌گذاری هست) */
      /* V250 — کارت «پس‌زمینه» فقط یک‌بار (از کارت‌های مشترک FX) می‌آید؛ قبلاً دوبار نمایش داده می‌شد */
      case 'columns': return chl('قاب ستون‌ها', color('رنگ خط ستون‌ها','colBorder',b.colBorder||'#00000000')+rangeField('ضخامت خط ستون‌ها','colBorderWidth',b.colBorderWidth??0,0,8,1)+rangeField('گردی گوشه ستون‌ها','colRadius',b.colRadius??0,0,60,1)+rangeField('فاصلهٔ داخلی هر ستون (Padding)','colPadding',b.colPadding!=null?b.colPadding:(n(b.colBorderWidth,0)?Math.max(4,Math.round(n(b.gap,18)/2)):0),0,80,1)+'<div class="helper">اگر برای ستون‌ها خط یا گردی می‌خواهی، ضخامت را بالای صفر ببر. Padding فضای بین لبهٔ ستون و محتوای داخلش است.</div>');
      /* V122 — فونت از تب طراحیِ Text حذف شد؛ اکوردیون کامل فونت و اندازهٔ دلخواه داخل ویرایشگر متن (تب محتوا) است. */
      case 'text': return bgPickCard(b); /* V112 — پس‌زمینه: سه تیک انحصاری ساده/گرادیان/استروک */
      case 'button': { /* V250 — variant-aware: gradient only for «توپر»، خط همیشه برای «خط‌دار»، بدون خط برای «شفاف» */
        const vr=['outline','ghost'].includes(b.variant)?b.variant:'solid';
        const fgW=!b.fg||/^#(fff|ffffff|ffffffff)$/i.test(String(b.fg).trim());
        return chl('رنگ و گرادیان', v142Seg('نوع دکمه','variant',vr,[['solid','توپر','■'],['outline','خط‌دار','▢'],['ghost','شفاف','◌']])+color(vr==='solid'?'پس‌زمینه':'رنگ اصلی (متن و خط)','bg',b.bg||'#175CD3')+(vr==='solid'?check('گرادیان دو‌رنگ','gradient',b.gradient)+(b.gradient?color('رنگ دوم گرادیان','gradient2',b.gradient2||'#7F56D9')+selectField('جهت گرادیان','gradientDir',b.gradientDir||'135deg',[['90deg','۹۰ درجه'],['135deg','۱۳۵ درجه'],['180deg','۱۸۰ درجه'],['45deg','۴۵ درجه']]):''):'')+color('رنگ متن','fg',b.fg||'#FFFFFF')+(vr!=='solid'&&fgW?'<div class="helper">رنگ متن سفید روی دکمهٔ شفاف دیده نمی‌شود، برای همین در سایت از «رنگ اصلی» استفاده می‌شود. برای رنگ دیگر، رنگ متن را عوض کن.</div>':''))
          +chl('قاب و اندازه', rangeField('گردی گوشه','radius',b.radius??12,0,120,1)+rangeField('اندازه فونت','size',b.size??15,10,72,1)+rangeField('وزن فونت','weight',b.weight??800,100,900,100)+rangeField('فاصلهٔ حروف','letter',b.letter??0,-2,12,0.5)+check('حروف بزرگ (لاتین)','uppercase',b.uppercase)+rangeField('پدینگ افقی','padX',b.padX??20,0,96,1)+rangeField('پدینگ عمودی','padY',b.padY??12,0,72,1)+(vr==='outline'?rangeField('ضخامت خط','borderWidth',Math.max(1,n(b.borderWidth,2)||2),1,12,1)+color('رنگ خط','border',b.border||b.bg||'#175CD3'):'')+selectField('سایه','shadow',b.shadow||'none',[['none','بدون'],['sm','کم'],['md','متوسط'],['lg','زیاد']]))
          +chl('عرض دکمه', check('تمام‌عرض (همهٔ دستگاه‌ها)','fullWidth',b.fullWidth===true)+(b.fullWidth===true?'':check('تمام‌عرض فقط در موبایل','mobileFull',b.mobileFull===true))+'<div class="helper">قبلاً همهٔ دکمه‌ها در موبایلِ سایت خودبه‌خود تمام‌عرض می‌شدند ولی روی بوم نه؛ حالا دقیقاً همان چیزی است که این‌جا انتخاب می‌کنی.</div>');
      }
      case 'mediaMarquee': return chl('حرکت', rangeField('سرعت (کند ← → تند)','speed',b.speed??40,1,100,1)+selectField('جهت حرکت','direction',b.direction||'rtl',[['rtl','راست به چپ'],['ltr','چپ به راست']])+check('توقف با نگه‌داشتن ماوس','pauseOnHover',b.pauseOnHover!==false))
        +chl('اندازه و فاصله', rangeField('ارتفاع تصاویر (px)','logoHeight',b.logoHeight??48,16,240,1)+rangeField('ارتفاع در موبایل (px)','mobileLogoHeight',b.mobileLogoHeight??36,12,240,1)+rangeField('فاصلهٔ بین تصاویر','gap',b.gap??56,0,240,1)+rangeField('گردی گوشهٔ تصاویر','itemRadius',b.itemRadius??0,0,120,1))
        +chl('ظاهر', rangeField('شفافیت تصاویر (٪)','itemOpacity',b.itemOpacity??100,10,100,1)+check('سیاه‌وسفید (رنگی با هاور)','grayscale',b.grayscale===true)+check('محو شدن لبه‌ها','fadeEdges',b.fadeEdges!==false)+rangeField('عرض محو لبه (٪)','fadeWidth',b.fadeWidth??8,0,30,1)+color('پس‌زمینهٔ نوار','bg',b.bg||'#00000000')+rangeField('پدینگ عمودی نوار','bandPadY',b.bandPadY??0,0,80,1)+rangeField('گردی گوشهٔ نوار','radius',b.radius??0,0,60,1))
        +chl('عنوان', rangeField('سایز عنوان','titleSize',b.titleSize??14,10,48,1)+rangeField('وزن عنوان','titleWeight',b.titleWeight??700,100,900,100)+color('رنگ عنوان','titleColor',b.titleColor||'#667085')+rangeField('فاصلهٔ عنوان تا نوار','titleGap',b.titleGap??18,0,80,1)+alignmentField(b));
      /* V122 — Image: Alignment (از تب محتوا منتقل شده) + اندازه و برش + قاب تک‌لایه */
      case 'image': return chl('برش تصویر', selectField('اندازه','objectFit',b.objectFit||'cover',[['cover','پر کردن کادر (Fill)'],['contain','کامل داخل کادر (Fit)'],['fill','کشیده شدن (Stretch)']])+rangeField('نقطه تمرکز X','cropX',b.cropX??50,0,100,1)+rangeField('نقطه تمرکز Y','cropY',b.cropY??50,0,100,1))+chl('قاب', check('قاب دور تصویر','fxFrame',b.fxFrame===true)+(b.fxFrame===true?color('رنگ قاب','frameColor',b.frameColor||'#EF4444')+rangeField('ضخامت قاب','frameWidth',b.frameWidth??2,1,12,1)+rangeField('فاصله قاب','framePad',b.framePad??8,0,40,1)+selectField('نوع قاب','frameStyle',b.frameStyle||'solid',[['solid','خط ممتد'],['dashed','خط‌چین'],['dotted','نقطه‌چین']]):'')+rangeField('گردی گوشه','radius',b.radius??18,0,120,1)+rangeField('ضخامت حاشیه','borderWidth',b.borderWidth??0,0,12,1)+color('رنگ حاشیه','border',b.border||'#00000000'))+chl('کپشن', rangeField('سایز کپشن','captionSize',b.captionSize??14,9,32,1)+color('رنگ کپشن','captionColor',b.captionColor||'#475467')+(b.captionPosition==='overlay'?'<div class="helper">کپشن روی تصویر: رنگ‌های تیره خودکار سفید می‌شوند تا خوانا بمانند.</div>':''))
        +chl('افکت و سرعت', check('بزرگ‌نمایی نرم هنگام هاور (Zoom)','hoverZoom',b.hoverZoom===true)+check('بارگذاری فوری (برای تصویر بالای صفحه)','preload',b.preload===true)+'<div class="helper">«بارگذاری فوری» فقط برای تصویر اصلی بالای صفحه روشن شود؛ بقیه تنبل (lazy) لود می‌شوند تا صفحه سریع بماند.</div>');
      /* V131 — Video: زیر «ضخامت حاشیه» آکاردئون «نوع حاشیه» (ممتد/خط‌چین/نقطه‌چین) */
      case 'video': return chl('ظاهر پخش‌کننده', rangeField('گردی گوشه','radius',b.radius??18,0,120,1)+rangeField('ضخامت حاشیه','borderWidth',b.borderWidth??0,0,12,1)+color('رنگ حاشیه','border',b.border||'#00000000')
        +`<details class="font-accordion border-style-acc" data-border-acc="video" ${(b.borderWidth??0)>0?'open':''}><summary><span class="font-accordion__ico">▭</span><span class="font-accordion__lbl">نوع حاشیه</span><span class="font-accordion__cur">${b.borderStyle==='dashed'?'خط‌چین':b.borderStyle==='dotted'?'نقطه‌چین':'خط ممتد'}</span><span class="section-chevron">⌄</span></summary><div class="font-accordion__body"><div class="border-style-grid">${[['solid','خط ممتد','border-style: solid;'],['dashed','خط‌چین','border-style: dashed;'],['dotted','نقطه‌چین','border-style: dotted;']].map(([v,l,st])=>`<button type="button" class="border-style-btn${(b.borderStyle||'solid')===v?' on':''}" data-border-style="${v}" data-border-style-on="video" title="${l}"><span class="border-style-prev" style="${st}"></span><span>${l}</span></button>`).join('')}</div><div class="helper">نوع حاشیه وقتی دیده می‌شود که ضخامت حاشیه بالای صفر باشد.</div></div></details>`
        +selectField('سایه','shadow',b.shadow||'none',[['none','بدون'],['sm','کم'],['md','متوسط'],['lg','زیاد']]));
      case 'audio': { /* V122 — پریست‌های آماده + ظاهر پخش‌کننده */
        const ap=b.audioVariant||'default';
        return chl('پریست', `<div class="preset-grid">`
          +[['default','مدیتیشن','آرام و سفری','🧘'],['podcast','پادکست','گرم و پویا','🎙'],['seminar','سمیناری','علمی و برند','🎓']].map(([v,lbl,d,ico])=>`<button type="button" class="preset-btn${ap===v?' on':''}" data-audio-preset="${v}" title="${d}"><span class="preset-btn__ico">${ico}</span><b>${lbl}</b><small>${d}</small></button>`).join('')
          +`</div><div class="helper">پریست، رنگ و حالت نمایش پلیر را یک‌جا تنظیم می‌کند؛ بعدش می‌توانی هر رنگ را دستی عوض کنی.</div>`)
          +chl('ظاهر پخش‌کننده', color('پس‌زمینه','bg',b.bg||'#F8FAFC')+color('رنگ حاشیه','borderColor',b.borderColor||'#EAECF0')+rangeField('گردی گوشه','radius',b.radius??16,0,40,1)+rangeField('پدینگ عمودی','padY',b.padY??14,0,40,1)+rangeField('پدینگ افقی','padX',b.padX??16,0,40,1))+chl('عنوان', rangeField('سایز عنوان','titleSize',b.titleSize??15,10,32,1)+color('رنگ عنوان','titleColor',b.titleColor||'#101828'));
      }
      case 'icon': { /* V140 — design tab: frame + sizes for all cards; row layout when 2+ cards.
          رنگ این‌جا «پیش‌فرض» است؛ هر کارت در تب محتوا می‌تواند رنگ و Stroke خودش را داشته باشد. */
        const multi=iconEnsureCards(b).length>1;
        return chl('قاب آیکون', iconFrameCard(b,false)+rangeField('اندازه آیکون','size',b.size??24,12,120,1)+rangeField('اندازه قاب','box',b.box??(multi?48:54),32,160,1))
          +(multi?chl('چیدمان ردیف', rangeField('فاصله بین آیکون‌ها','gap',b.gap??12,0,60,1)+alignmentField(b)+'<div class="helper">قاب و اندازه روی همهٔ آیکون‌های این ردیف اعمال می‌شود.</div>'):chl('چینش', alignmentField(b)))
          +chl('رنگ پیش‌فرض', color('رنگ آیکون','color',b.color||'#175CD3')+'<div class="helper">کارت‌هایی که رنگ اختصاصی ندارند از این رنگ استفاده می‌کنند.</div>')
          +chl('افکت', rangeField('شفافیت (٪)','opacity',b.opacity??100,0,100,1)+rangeField('چرخش (درجه)','rotate',b.rotate??0,-180,180,1));
      }
      case 'scrollPoint': { /* V114 — minimal design tab: فقط نمایش داخل بیلدر */
        return chl('نمایش داخل بیلدر', selectField('حالت نمایش','spShow',b.spShow||'pill',[['pill','کپسول آبی'],['line','خط‌چین ساده'],['dot','نقطهٔ کوچک']])+'<div class="helper">این تنظیمات فقط روی پیش‌نمایش بیلدر اثر دارند؛ در صفحهٔ منتشرشده این عنصر هیچ ظاهری ندارد.</div>');
      }
      case 'badge': return chl('رنگ', color('پس‌زمینه','bg',b.bg||'#EEF4FF')+color('متن','color',b.color||'#175CD3')+color('حاشیه','border',b.border||'#D1E0FF'))+chl('شکل', selectField('گردی گوشه','radius',String(b.radius??'999'),[['999','قرصی کامل'],['24','گرد'],['12','نیمه‌گرد'],['4','تیز']]));
      /* V131 — Embed: کارت «ارتفاع» با آکاردئون دو حالته (خودکار / دستی) */
      case 'embed': return chl('ارتفاع', selectField('حالت ارتفاع','embedHeightMode',b.embedHeightMode||'auto',[['auto','خودکار — به اندازهٔ محتوا'],['manual','دستی (ثابت)']])+(b.embedHeightMode==='manual'?rangeField('ارتفاع (px)','embedHeight',b.embedHeight??420,80,2000,10)+'<div class="helper">محتوای بلندتر از این ارتفاع، داخل کادر اسکرول می‌شود.</div>':'<div class="helper">ارتفاع کادر خودکار با محتوای Embed تنظیم می‌شود.</div>'))+chl('چینش', alignmentField(b));
      case 'stickyButton': return chl('رنگ و گرادیان', selectField('نوع دکمه','variant',b.variant||'solid',[['solid','توپر'],['outline','خط‌دار'],['ghost','شفاف']])+color('پس‌زمینه','bg',b.bg||'#175CD3')+check('گرادیان دو‌رنگ','gradient',b.gradient)+(b.gradient?color('رنگ دوم گرادیان','gradient2',b.gradient2||'#7F56D9')+selectField('جهت گرادیان','gradientDir',b.gradientDir||'135deg',[['90deg','۹۰ درجه'],['135deg','۱۳۵ درجه'],['180deg','۱۸۰ درجه'],['45deg','۴۵ درجه']]):'')+color('رنگ متن','fg',b.fg||'#FFFFFF'))
        +chl('قاب و اندازه', check('حالت قرصی (pill)','pill',b.pill===true)+(b.pill?'':rangeField('گردی گوشه','radius',b.radius??14,0,60,1))+rangeField('اندازه فونت','size',b.size??15,10,32,1)+rangeField('وزن فونت','weight',b.weight??800,100,900,100)+rangeField('پدینگ افقی','padX',b.padX??24,0,80,1)+rangeField('پدینگ عمودی','padY',b.padY??14,0,48,1)+(b.variant&&b.variant!=='solid'?rangeField('ضخامت خط','borderWidth',b.borderWidth??1,0,12,1)+color('رنگ خط','border',b.border||'#175CD3'):'')+selectField('سایه','shadow',b.shadow||'lg',[['none','بدون'],['sm','کم'],['md','متوسط'],['lg','زیاد']])+check('بزرگ‌نمایی هنگام هاور','hoverScale',b.hoverScale!==false))
        +chl('بج', check('نمایش بج روی دکمه','showBadge',b.showBadge===true)+(b.showBadge?input('متن بج','badgeText',b.badgeText||'٪۲۰ تخفیف')+color('رنگ بج','badgeBg',b.badgeBg||'#F79009'):''));
      case 'stickyCta': return chl('رنگ و اندازه', color('پس‌زمینه','bg',b.bg||'#175CD3')+color('متن','fg',b.fg||'#FFFFFF')+rangeField('گردی گوشه','radius',b.radius??999,0,40,1)+rangeField('اندازه فونت','size',b.size??15,11,28,1)+rangeField('پدینگ افقی','padX',b.padX??18,0,64,1)+rangeField('پدینگ عمودی','padY',b.padY??12,0,48,1));
      default: return '';
    }
  }
  /* ======================================================================
     V147 — ONE «اندازه و فاصله» card for every element (Carrd-style).
     Width is a single slider: 5…99٪ → Max → Edge to edge → Full bleed.
     Position (where the box sits), content alignment, height, the gap between
     children, padding and margins all live in this one card, so a user never
     has to guess which of three cards owns a spacing value. Every control
     writes the same keys the shared renderer reads (maxWidth, widthMode,
     boxAlign, align, minHeight, innerGap/gap, pad*, margin*), so the canvas
     and the published page always agree.
     ====================================================================== */
  const rvSplit=new Set(); /* element ids whose padding is edited per side */
  const RV_NO_CARD=new Set(['spacer','scrollPoint','stickyButton','anywhereSection','header','footer']);
  const RV_NO_WIDTH=new Set(['popupSection','stickySection','stickyColumn','stickyCta']);
  const RV_NO_BLEED=new Set(['popupSection','stickySection','stickyColumn','stickyCta']);
  const RV_GAP_KEY={section:'innerGap',group:'innerGap',popupSection:'innerGap',columns:'gap'};
  const RV_HEIGHT=new Set(['section','popupSection','columns']);
  function rvWidthMode(b){
    const W=window.WidgetRenderer; const m=b&&b.widthMode; const pct=Math.max(0,Math.min(100,n(b&&b.maxWidth,100)));
    if(m==='pct'||m==='max'||m==='edge'||m==='bleed') return (m==='pct'&&pct>=100)?'max':(m==='max'&&pct<100?'pct':m);
    if(b&&(b.fullBleed||b.edgeToEdge)) return 'bleed';
    if((b.type==='section'||b.type==='columns'||(b.type==='image'&&(b.imageMode||'single')==='single'))&&n(b.width,100)<100&&pct>=100) return 'pct';
    return pct<100?'pct':'max';
  }
  function rvPct(b){ const pct=n(b.maxWidth,100); if(pct>=100&&(b.type==='section'||b.type==='columns'||(b.type==='image'&&(b.imageMode||'single')==='single'))&&n(b.width,100)<100) return Math.max(5,n(b.width,100)); return Math.max(5,Math.min(100,pct)); }
  function rvWidthSliderValue(b){ const m=rvWidthMode(b); return m==='bleed'?102:m==='edge'?101:m==='max'?100:Math.round(rvPct(b)); }
  function rvWidthLabel(v){ v=Number(v); return v>=102?'Full bleed':v>=101?'Edge to edge':v>=100?'Max':Math.round(v)+'٪'; }
  function rvPadVals(b){ return {t:n(b.padTop,n(b.padY,0)),b:n(b.padBottom,n(b.padY,0)),r:n(b.padRight,n(b.padX,0)),l:n(b.padLeft,n(b.padX,0))}; }
  function rvMarVals(b){ const dv=b.type==='divider'?n(b.margin,28):null; return {t:n(b.marginTop,dv??0),b:n(b.marginBottom,dv??0),r:n(b.marginRight,0),l:n(b.marginLeft,0)}; }
  function rvSlider(label,key,value,min,max,step=1,out=null,extra=''){
    const v=Number.isFinite(Number(value))?Number(value):min;
    return `<div class="rv-ctl" data-rv-row="${attr(key)}"><div class="rv-ctl__head"><label>${label}</label><output data-rv-out="${attr(key)}">${out!=null?esc(out):v}</output></div><div class="rv-ctl__row"><input class="rv-range" type="range" data-rv="${attr(key)}" min="${min}" max="${max}" step="${step}" value="${v}"${extra}><input class="rv-num" type="number" data-rv-num="${attr(key)}" min="${min}" max="${max}" step="${step}" value="${v}"></div></div>`;
  }
  function rvSeg(label,key,cur,opts){
    return `<div class="rv-ctl rv-ctl--seg" data-rv-row="${attr(key)}"><div class="rv-ctl__head"><label>${label}</label></div><div class="rv-seg" role="group" aria-label="${attr(label)}">${opts.map(([v,t,ico])=>`<button type="button" class="${String(cur)===String(v)?'is-on':''}" data-rv-set="${attr(key)}" data-rv-val="${attr(v)}" title="${attr(t)}" aria-pressed="${String(cur)===String(v)}">${ico?`<span aria-hidden="true">${ico}</span>`:''}<b>${esc(t)}</b></button>`).join('')}</div></div>`;
  }
  function sizeCard(b){
    if(!b||RV_NO_CARD.has(b.type)) return '';
    const T=b.type, hasWidth=!RV_NO_WIDTH.has(T), bleedOK=!RV_NO_BLEED.has(T);
    const wv=rvWidthSliderValue(b), mode=rvWidthMode(b);
    let h='';
    if(hasWidth){
      h+=`<div class="rv-group rv-group--width">`+rvSlider('عرض','width',wv,5,bleedOK?102:100,1,rvWidthLabel(wv))
        +`<div class="rv-ticks" aria-hidden="true"><span>۵٪</span><span>۱۰۰٪ · Max</span>${bleedOK?'<span>Edge</span><span>Full bleed</span>':''}</div></div>`;
      if(mode==='pct') h+=rvSeg('جای کادر','boxAlign',b.boxAlign||(['left','center','right'].includes(b.align)?b.align:(T==='section'||T==='columns'||T==='group'?'center':'right')),[['right','راست','⇥'],['center','وسط','↔'],['left','چپ','⇤']]);
      if(T==='section'&&(mode==='edge'||mode==='bleed')) h+=rvSlider('عرض محتوای داخل','innerMaxWidth',n(b.innerMaxWidth,1200),320,1800,10,n(b.innerMaxWidth,1200)+'px');
    }
    const alOpts=T==='text'?[['right','راست','≡'],['center','وسط','≣'],['left','چپ','≡'],['justify','دوطرفه','☰']]:[['right','راست','⇥'],['center','وسط','↔'],['left','چپ','⇤']];
    if(!['divider','stickyCta'].includes(T)) h+=rvSeg('چینش محتوا','align',b.align||(T==='text'?'right':'center'),alOpts);
    if(T==='columns') h+=rvSeg('هم‌ترازی عمودی ستون‌ها','valign',b.valign||'stretch',[['stretch','هم‌قد'],['start','بالا'],['center','وسط'],['end','پایین']]);
    if(RV_HEIGHT.has(T)){
      const hv=T==='columns'?n(b.height,0):((b.sectionHeight||'auto')==='auto'?n(b.minHeight,0):n(b.sectionHeight==='fixed'?b.height:b.minHeight,0));
      h+=rvSlider('ارتفاع','height',Math.min(1600,hv),0,1600,10,hv>0?hv+'px':'Auto');
      if(T!=='columns'&&hv>0) h+=rvSeg('جای محتوا در ارتفاع','contentPos',b.contentPos||'top',[['top','بالا','⤒'],['center','وسط','↕'],['bottom','پایین','⤓']]);
    }
    const gk=RV_GAP_KEY[T];
    if(gk){
      h+=rvSlider(T==='columns'?'فاصله بین ستون‌ها':'فاصله بین عناصر داخل',gk,n(b[gk],gk==='gap'?18:0),0,160,1);
      if(T==='columns'){ h+=rvSlider('فاصله بین ستون‌ها در موبایل','gapMobile',n(b.gapMobile,Math.min(n(b.gap,18),12)),0,160,1); h+=rvSlider('فاصله بین عناصر هر ستون','columnInnerGap',n(b.columnInnerGap,0),0,160,1); }
    }
    const P=rvPadVals(b), M=rvMarVals(b);
    const split=rvSplit.has(b.id)||P.t!==P.b||P.l!==P.r;
    h+=`<div class="rv-sub"><span>Padding</span><small>فاصلهٔ داخل کادر</small><button type="button" class="rv-link${split?' is-on':''}" data-rv-split="1" aria-pressed="${split}" title="هر طرف جدا">${split?'هر طرف جدا':'متصل'}</button></div>`;
    if(split) h+=`<div class="rv-grid">${rvSlider('بالا','padTop',P.t,0,240)}${rvSlider('پایین','padBottom',P.b,0,240)}${rvSlider('راست','padRight',P.r,0,240)}${rvSlider('چپ','padLeft',P.l,0,240)}</div>`;
    else h+=`<div class="rv-grid">${rvSlider('عمودی','padV',P.t,0,240)}${rvSlider('افقی','padH',P.l,0,240)}</div>`;
    h+=`<div class="rv-sub"><span>Margins</span><small>فاصلهٔ بیرون کادر</small></div><div class="rv-grid">${rvSlider('بالا','marginTop',M.t,-80,240)}${rvSlider('پایین','marginBottom',M.b,-80,240)}</div>`;
    if(M.l||M.r) h+=`<div class="rv-grid">${rvSlider('راست','marginRight',M.r,-80,240)}${rvSlider('چپ','marginLeft',M.l,-80,240)}</div>`;
    h+=`<button type="button" class="rv-reset" data-rv-reset="1">بازنشانی اندازه و فاصله</button>`;
    return chl('<span class="v142-ico">⤢</span>اندازه و فاصله',`<div class="rv-card" data-rv-card="${attr(T)}">${h}</div>`);
  }
  /* apply one control value to the model; returns true when the card layout must be rebuilt */
  function rvApply(f,key,v){
    const T=f.type; let rebuild=false;
    const num=Number(v);
    if(key==='width'){
      const before=rvWidthMode(f);
      if(num>=102){ f.widthMode='bleed'; f.fullBleed=true; f.edgeToEdge=true; f.maxWidth=100; }
      else if(num>=101){ f.widthMode='edge'; delete f.fullBleed; delete f.edgeToEdge; f.maxWidth=100; }
      else if(num>=100){ f.widthMode='max'; delete f.fullBleed; delete f.edgeToEdge; f.maxWidth=100; }
      else { f.widthMode='pct'; delete f.fullBleed; delete f.edgeToEdge; f.maxWidth=Math.max(5,Math.round(num)); if(!f.boxAlign) f.boxAlign=['left','center','right'].includes(f.align)?f.align:(T==='section'||T==='columns'||T==='group'?'center':'right'); }
      if(T==='section'||T==='columns'||(T==='image'&&(f.imageMode||'single')==='single')) f.width=100;
      if(T==='image'&&f.imageMode&&f.imageMode!=='single'){} 
      if(f.responsive&&f.responsive.desktop&&f.responsive.desktop.width!=null&&!f.responsive.enabled){}
      delete f.desktopWidth;
      rebuild=before!==rvWidthMode(f)&&(before==='pct'||rvWidthMode(f)==='pct'||T==='section');
    }
    else if(key==='boxAlign'||key==='align'||key==='valign'||key==='contentPos'){ f[key]=v; }
    else if(key==='height'){
      const hv=Math.max(0,Math.round(num));
      if(T==='columns') f.height=hv;
      else { const was=n(f.minHeight,0)>0||(f.sectionHeight&&f.sectionHeight!=='auto'); f.minHeight=hv; f.sectionHeight=hv>0?'min':'auto'; if(f.sectionHeight==='min') delete f.height; rebuild=was!==(hv>0); }
    }
    else if(key==='padV'){ f.padTop=f.padBottom=Math.max(0,Math.round(num)); delete f.padY; delete f.padX; const P=rvPadVals(f); f.padLeft=P.l; f.padRight=P.r; }
    else if(key==='padH'){ f.padLeft=f.padRight=Math.max(0,Math.round(num)); delete f.padY; delete f.padX; const P=rvPadVals(f); f.padTop=P.t; f.padBottom=P.b; }
    else if(/^pad(Top|Bottom|Left|Right)$/.test(key)){ const P=rvPadVals(f); f.padTop=P.t; f.padBottom=P.b; f.padLeft=P.l; f.padRight=P.r; delete f.padY; delete f.padX; f[key]=Math.max(0,Math.round(num)); }
    else if(/^margin(Top|Bottom|Left|Right)$/.test(key)){ f[key]=Math.max(-80,Math.min(400,Math.round(num))); if(T==='divider'&&(key==='marginTop'||key==='marginBottom')){ const M=rvMarVals(f); f.marginTop=key==='marginTop'?f[key]:M.t; f.marginBottom=key==='marginBottom'?f[key]:M.b; } }
    else { f[key]=Math.max(0,Math.round(num)); }
    return rebuild;
  }
  function bindSizeCard(){
    const card=inspector.querySelector('.rv-card'); if(!card) return;
    const cur=()=>find(selectedId)?.b;
    let started=false;
    const commit=(rebuild)=>{ scheduleSave(); scheduleCanvasRender(); if(rebuild) setTimeout(()=>updateInspector(),0); };
    const outFor=(key,v,f)=>{ if(key==='width') return rvWidthLabel(v); if(key==='height') return Number(v)>0?Math.round(v)+'px':'Auto'; if(key==='innerMaxWidth') return Math.round(v)+'px'; return String(Math.round(Number(v))); };
    card.querySelectorAll('input[data-rv],input[data-rv-num]').forEach(el=>{
      const key=el.dataset.rv||el.dataset.rvNum;
      const run=(ev)=>{
        const f=cur(); if(!f) return;
        let v=Number(el.value); if(!Number.isFinite(v)) return;
        const mn=Number(el.min), mx=Number(el.max); if(Number.isFinite(mn)) v=Math.max(mn,v); if(Number.isFinite(mx)) v=Math.min(mx,v);
        if(!started){ snapshot(); started=true; }
        const rebuild=rvApply(f,key,v);
        card.querySelectorAll(`[data-rv="${key}"],[data-rv-num="${key}"]`).forEach(o=>{ if(o!==el) o.value=String(v); });
        card.querySelectorAll(`[data-rv-out="${key}"]`).forEach(o=>o.textContent=outFor(key,v,f));
        commit(rebuild&&ev.type==='change');
        if(ev.type==='change') started=false;
      };
      el.addEventListener('input',run); el.addEventListener('change',run);
    });
    card.querySelectorAll('[data-rv-set]').forEach(btn=>btn.addEventListener('click',()=>{
      const f=cur(); if(!f) return; snapshot();
      rvApply(f,btn.dataset.rvSet,btn.dataset.rvVal);
      btn.parentElement.querySelectorAll('button').forEach(x=>{ const on=x===btn; x.classList.toggle('is-on',on); x.setAttribute('aria-pressed',String(on)); });
      commit(false);
    }));
    card.querySelector('[data-rv-split]')?.addEventListener('click',()=>{
      const f=cur(); if(!f) return; const P=rvPadVals(f); const split=rvSplit.has(f.id)||P.t!==P.b||P.l!==P.r;
      if(split){ snapshot(); f.padBottom=P.t; f.padRight=P.l; f.padTop=P.t; f.padLeft=P.l; delete f.padX; delete f.padY; rvSplit.delete(f.id); commit(false); }
      else rvSplit.add(f.id);
      updateInspector();
    });
    card.querySelector('[data-rv-reset]')?.addEventListener('click',()=>{
      const f=cur(); if(!f) return; snapshot();
      ['marginTop','marginBottom','marginRight','marginLeft','padTop','padBottom','padRight','padLeft','boxAlign','widthMode','desktopWidth','mobileWidth','contentPos'].forEach(k=>delete f[k]); rvSplit.delete(f.id);
      f.maxWidth=100; delete f.fullBleed; delete f.edgeToEdge;
      if(f.type==='section'){ f.sectionHeight='auto'; f.minHeight=0; f.innerGap=0; }
      commit(true); showToast('اندازه و فاصله بازنشانی شد');
    });
  }
  function spacingFields(b){ return sizeCard(b); } /* V147 — legacy entry point → the single card */
  function responsiveFields(b){/* V108 — de-duplicated: Max width + Edge to edge live in طراحی→Layout; only device-specific sizing + visibility stay here. Conflicting show/hide pairs collapsed to one toggle per device. */const mobVis=section('Visibility',`${selectField('On mobile','_mobileVis',(b.hideMobile===true||b.showOnMobile===false)?'hidden':'visible',[['visible','نمایش در موبایل'],['hidden','مخفی در موبایل']])}${selectField('On desktop','_desktopVis',(b.hideDesktop===true||b.showOnDesktop===false)?'hidden':'visible',[['visible','نمایش در دسکتاپ'],['hidden','مخفی در دسکتاپ']])}`).outerHTML;const sizes=section('Per-device sizing',`${rangeField('Desktop width %','desktopWidth',b.desktopWidth??100,10,100,1)}${rangeField('Mobile width %','mobileWidth',b.mobileWidth??100,10,100,1)}${input('Mobile font size (px)','mobileSize',b.mobileSize||'','number','min="8" max="120"')}${b.type==='social'?`${rangeField('Mobile items per row','perRowMobile',b.perRowMobile??1,1,6,1)}`:''}`).outerHTML;return mobVis+sizes;}
  /* V132 — کارت «انیمیشن»: دراپ‌داون نوع + Replay + چهار اسلایدر + چک‌باکس Replayable.
     همه به کلیدهای animationType/animationDuration/animationIntensity/animationDelay/
     animationThreshold/animationReplayable روی خود بلوک وصل‌اند و رندرر مشترک
     data-* هایشان را می‌ریزد؛ runtime مشترک (RAVA_ANIMATIONS) هم روی سایت واقعی
     (IntersectionObserver) و هم روی بوم بیلدر همان‌ها را پخش می‌کند. */
  function animationCard(b){
    const A=window.RAVA_ANIMATIONS;
    const types=(A&&A.TYPE_ORDER)?A.TYPE_ORDER:['none'];
    const META=(A&&A.META)||{};
    const cur=b.animationType||'none';
    const opts=types.map(t=>`<option value="${t}" ${cur===t?'selected':''}>${esc((META[t]&&META[t].fa)||t)}</option>`).join('');
    const dur=Number.isFinite(Number(b.animationDuration))&&b.animationDuration!==''&&b.animationDuration!=null?Number(b.animationDuration):1, delay=Number.isFinite(Number(b.animationDelay))&&b.animationDelay!=null?Number(b.animationDelay):0; /* V139 — NaN نمایش داده نشود */
    const inten=['subtle','normal','strong'].includes(b.animationIntensity)?b.animationIntensity:'normal';
    const th=['low','normal','high'].includes(b.animationThreshold)?b.animationThreshold:'normal';
    const INT=(A&&A.INTENSITY)||{subtle:{},normal:{},strong:{}};
    const meta=META[cur]||{};
    const st=INT[inten]||INT.normal||{};
    const intenHint=meta.varKey==='dist'?`جابه‌جایی ${st.dist}px`:meta.varKey==='blur'?`تاری ${st.blur}px`:meta.varKey==='deg'?`چرخش ${st.deg}°`:meta.varKey==='glitch'?`لرزش ${st.glitch}px`:meta.varKey==='scale'?`شروع از ${st.scale}×`:meta.varKey==='bounce'||meta.varKey2==='bounce'?`پرش ${st.bounce}px`:'مقدار پیش‌فرض';
    return section('انیمیشن',`
      <div class="anim-row anim-row--type">
        <div class="field"><label>نوع انیمیشن</label><select data-bind="animationType">${opts}</select></div>
        <button type="button" class="mini-btn anim-replay-btn" id="animReplayBtn" title="پخش دوباره روی بوم">▶ Replay</button>
      </div>
      ${cur==='none'?'<div class="helper">نوع انیمیشن را انتخاب کن؛ پیش‌نمایش روی بوم همان لحظه اجرا می‌شود.</div>':''}
      <div class="anim-grid2">
        ${animSlider('Duration','animationDuration',dur,0.2,2.5,0.1,(v)=>Number(v).toFixed(1)+'s')}
        <div class="field slider-field"><div class="field-head"><label>Intensity</label><output data-anim-inten-out>${inten} — ${intenHint}</output></div><input class="range" data-anim-inten type="range" min="0" max="2" step="1" value="${{subtle:0,normal:1,strong:2}[inten]}"><div class="anim-ticks"><span>Subtle</span><span>Normal</span><span>Strong</span></div></div>
      </div>
      ${animSlider('Delay','animationDelay',delay,0,2,0.1,(v)=>Number(v).toFixed(1)+'s')}
      <div class="field slider-field"><div class="field-head"><label>Threshold</label><output data-anim-th-out>${{low:'Low — ۱۰٪ دیده شود',normal:'Normal — ۵۰٪ دیده شود',high:'High — ۹۰٪ دیده شود'}[th]}</output></div><input class="range" data-anim-th type="range" min="0" max="2" step="1" value="${{low:0,normal:1,high:2}[th]}"><div class="anim-ticks"><span>Low</span><span>Normal</span><span>High</span></div></div>
      <label class="check anim-check"><input data-anim-replay type="checkbox" ${b.animationReplayable!==false?'checked':''}><span><b>Replayable</b><small>Automatically replay animation when this element is scrolled back into view.</small></span></label>
      <div class="helper">انیمیشن با CSS خالص پخش می‌شود؛ در سایت منتشرشده با اسکرول به دید عنصر فعال می‌شود. اگر کاربر «حرکت کمتر» را در سیستم‌عاملش فعال کرده باشد، ملایم‌تر اجرا می‌شود.</div>
    `).outerHTML;
    function animSlider(label,key,val,min,max,step,fmt){
      return `<div class="field slider-field"><div class="field-head"><label>${label}</label><output data-range-output="${key}">${fmt(val)}</output></div><input class="range" data-bind="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${Number.isFinite(Number(val))?val:min}"><input class="range-number" data-bind="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${Number.isFinite(Number(val))?val:min}" hidden></div>`;
    }
  }
  function advancedFields(b){/* V108 — de-duplicated: position/opacity/rotate/locked/hiddenEditor moved to the طراحی tab; this tab is now genuinely advanced */
    /* V114 — scrollPoint keeps its address stable: no ID editing, no custom CSS targets. */
    if(b.type==='scrollPoint')return section('پیشرفته — Scroll Point','<div class="helper">برای Scroll Point تب پیشرفته در دسترس نیست. آدرس لنگر این عنصر ثابت است (از تب «محتوا» کپی کن) تا لینک‌ها و دکمه‌های ساخته‌شده هرگز نشکنند.</div>').outerHTML;
    const vis=section('نمایش در دستگاه‌ها',`<div class="v250-vis">${check('دسکتاپ','showDesktop',!(b.hideDesktop===true||b.showOnDesktop===false))}${check('تبلت','showTablet',b.hideTablet!==true)}${check('موبایل','showMobile',!(b.hideMobile===true||b.showOnMobile===false))}</div><div class="helper">تیک هر دستگاه را برداری، عنصر فقط در همان دستگاه پنهان می‌شود (مثلاً یک تصویر بزرگ فقط در موبایل). روی بوم هم با عوض کردن حالت دستگاه همین را می‌بینی.</div>`).outerHTML;
    const idClean=String(b.domId||'').replace(/^#/,'');
    return animationCard(b)+vis+responsiveOverrideCard(b)+section('پیشرفته',`${input('Element ID (لنگر)','domId',b.domId||'')}${idClean?`<div class="v250-anchor"><code>#${esc(idClean)}</code><button type="button" class="mini-btn" data-v250-copy="#${attr(idClean)}">کپی لینک</button></div>`:''}<div class="helper">با شناسه، هر دکمه/لینکی با آدرس <code>#شناسه</code> به این عنصر اسکرول می‌کند. شناسه در صفحه باید یکتا باشد.</div>${input('Custom class','className',b.className||'')}${textarea('Custom CSS','customCss',b.customCss||'')}<div class="helper">دو حالت: فقط ویژگی‌ها (<code>color:red; letter-spacing:1px</code>) روی خود عنصر، یا قانون کامل با <code>&amp;</code> برای خود عنصر: <code>&amp;:hover{opacity:.8}</code> ، <code>img{border-radius:0}</code> — همه فقط روی همین عنصر اعمال می‌شوند.</div>`).outerHTML+section('عملیات',`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button type="button" class="mini-btn" id="duplicateSelected">تکثیر</button>${b.type==='group'?'<button type="button" class="mini-btn" id="ungroupSelected">خارج‌کردن از گروه</button>':''}<button type="button" class="mini-btn" id="copySelected">کپی</button><button type="button" class="mini-btn" id="pasteSelected">پیست</button><button type="button" class="mini-btn" id="saveAsBlockBtn" style="grid-column:1/-1">ذخیره به‌عنوان بلوک قابل‌استفاده مجدد</button><button type="button" class="danger-btn" id="deleteSelected" style="grid-column:1/-1">حذف عنصر</button></div>`).outerHTML;}
  /* V143 — responsive overrides are opt-in. Legacy responsive behavior stays
     untouched until the user explicitly enables this card. */
  function responsiveOverrideCard(b){
    const r=b.responsive||{}, active=!!r.enabled, dev=r.device||'desktop';
    const values=r[dev]||{};
    const deviceButtons=[['desktop','▣','Desktop'],['tablet','▤','Tablet'],['mobile','▥','Mobile']].map(([id,icon,label])=>`<button type="button" class="rsp-device${dev===id?' is-active':''}" data-rsp-device="${id}"><b>${icon}</b><span>${label}</span></button>`).join('');
    const fields=`
      <div class="rsp-device-grid">${deviceButtons}</div>
      <div class="rsp-fields">
        ${rangeField('عرض (%)','responsive.'+dev+'.width',values.width??100,10,100,1)}
        ${input('اندازه متن (px)','responsive.'+dev+'.fontSize',values.fontSize??'','number','min="8" max="160"')}
        ${rangeField('فاصله داخلی بالا/پایین','responsive.'+dev+'.padY',values.padY??0,0,160,1)}
        ${rangeField('فاصله داخلی چپ/راست','responsive.'+dev+'.padX',values.padX??0,0,160,1)}
        ${selectField('چینش','responsive.'+dev+'.align',values.align||'inherit',[['inherit','همان مقدار اصلی'],['right','راست'],['center','وسط'],['left','چپ']])}
      </div>
      <div class="helper">فقط همین دستگاه تغییر می‌کند؛ فیلدهای خالی از مقدار اصلی عنصر استفاده می‌کنند.</div>`;
    return section('Responsive Override',`<label class="check rsp-toggle"><input data-bind="responsive.enabled" type="checkbox" ${active?'checked':''}><span><b>تنظیمات جداگانه برای دستگاه‌ها</b><small>خاموش = رفتار فعلی بدون هیچ override</small></span></label><div class="rsp-panel" ${active?'':'hidden'}>${fields}</div>`,'🔁').outerHTML;
  }
  /* V124 — تنظیمات صفحه در چهار تب می‌آید (محتوا / طراحی / فاصله‌گذاری / پیشرفته):
     updateInspector وقتی هیچ عنصری انتخاب نشده، به‌جای ریختن همهٔ کارت‌ها در یک پنل،
     فقط کارت‌های تب فعال را می‌سازد. تب سمت راست با activeTab مشترک است، پس همین
     توابع هم برای بوم صفحه و هم برای عنصر انتخابی کار می‌کنند. */
  function pageCardSubpages(){
    if(window.BUILDER_KIND!=='product')return null;
    const subs=Array.isArray(state.subPages)?state.subPages:[];
    const cur=subCtx();
    return section('زیرصفحه‌ها — ویرایش کامل',`${subs.length?subs.map((s,i)=>`<div class="repeater"><div class="field-head"><b>${esc(s.title||s.path||('زیرصفحه '+(i+1)))}</b><a class="mini-btn" href="/admin/builder/product/${esc(window.BUILDER_INDEX??'')}?sub=${encodeURIComponent(s.path||'')}" target="_blank">باز کردن در بیلدر ↗</a></div><div class="helper" dir="ltr">/product/${esc(state.slug||'')}/${esc(s.path||'')}</div></div>`).join(''):'<div class="helper">زیرصفحه‌ای نیست — از دکمه ⑂ (زیرصفحه‌ها) در نوار بالا بساز.</div>'}${cur?`<div class="helper">⚠ در حال ویرایش زیرصفحه «${esc(cur.title||cur.path)}» هستی — ذخیره، بلوک‌ها را در همین زیرصفحه می‌نویسد.</div>`:''}`);
  }
  function pageCardPage(){
    return section('صفحه',`${input('Title','title',state.title||'')}${input('Slug','slug',state.slug||'')}${input('Hero','hero',state.hero||'')}${textarea('Description','excerpt',state.excerpt||'')}${check('Show site header','showHeader',state.showHeader!==false)}${check('Show site footer','showFooter',state.showFooter!==false)}${window.BUILDER_KIND==='product'?`${check('Show hero title','showHeroTitle',state.showHeroTitle!==false)}${check('Show hero description','showHeroDescription',state.showHeroDescription!==false)}${check('Show hero image','showHeroImage',state.showHeroImage===true)}${input('Hero image URL','heroImage',state.heroImage||'')}${check('Show buy card','showBuyCard',state.showBuyCard!==false)}${check('Sticky buy card on desktop','stickyBuyCard',state.stickyBuyCard!==false)}${check('Mobile buy bar','mobileBuyBar',state.mobileBuyBar!==false)}<label class="field"><span>Buy button label</span><input data-bind="cta" value="${esc(state.cta||'خرید و دسترسی فوری')}"></label>`:''}<div class="helper">هر چیزی که تیک نمایش آن را برداری، در پیش‌نمایش موبایل، تبلت، دسکتاپ و صفحهٔ منتشرشده واقعاً حذف می‌شود. هیچ بج پیش‌فرضی روی صفحه نیست.</div>`);
  }
  /* V129 — پس‌زمینهٔ لندینگ: فقط «یک» آکاردئون. یک دراپ‌داون نوع (رنگ ساده / گرادیان
     خطی / گرادیان شعاعی / تصویر / طرح‌ها) و زیرش فقط فیلدهای همان حالت.
     «طرح‌ها» کتابخانهٔ الگوی پس‌زمینه است (شبکه، نقطه‌چین، مدار، شفق، شیشه، دانه،
     بافت کاغذ و…) — هم ادیتور و هم سایت منتشرشده از یک رندرکنندهٔ مشترک
     (WidgetRenderer.landingShellBackground / landingShellDecor) می‌خوانند.
     Full bleed دیگر تیک ندارد — صفحه همیشه لبه‌به‌لبه است. Radius هم حذف شد.
     Overlay کارت جداگانه‌ای است (pageCardOverlay) و روی هر پس‌زمینه‌ای می‌نشیند. */
  /* V129/V130 — shims over the shared renderer (window.WidgetRenderer از سرور و بیلدر یکی است) */
  function patternList(){ return (window.WidgetRenderer&&window.WidgetRenderer.patternList)?window.WidgetRenderer.patternList():[]; }
  function patternInfo(id){ return (window.WidgetRenderer&&window.WidgetRenderer.patternInfo)?window.WidgetRenderer.patternInfo(id):null; }
  function landingSurfaceCss(l){ return (window.WidgetRenderer&&window.WidgetRenderer.landingSurfaceCss)?window.WidgetRenderer.landingSurfaceCss(l):(pageBackground(l)||'#FFFFFF'); }
  function landingSurface(l){ return (window.WidgetRenderer&&window.WidgetRenderer.landingSurface)?window.WidgetRenderer.landingSurface(l):{backgroundColor:pageBackground(l)||'#FFFFFF',backgroundImage:'none',backgroundSize:'auto',backgroundRepeat:'repeat',backgroundPosition:'0 0',backgroundBlendMode:'normal'}; }
  const BG_TYPE_LABELS={solid:'رنگ ساده',gradient:'گرادیان خطی',radial:'گرادیان شعاعی',image:'تصویر',pattern:'طرح‌ها'};
  function bgTypeSelect(t){
    return `<div class="field bg-type-field"><label>نوع پس‌زمینه</label><select data-bg-select="1">${Object.entries(BG_TYPE_LABELS).map(([v,lb])=>`<option value="${v}" ${t===v?'selected':''}>${lb}</option>`).join('')}</select></div>`;
  }
  function landingBgCard(l){
    /* «طرح‌ها» حالت مجازی است: هر patternId انتخابی یعنی طرح‌ها (زیرش type='blob' می‌ماند) */
    const t=l.backgroundPatternId?'pattern':(l.backgroundType||'solid');
    const solidInner=color('رنگ صفحه','landing.bg',l.bg||'#FFFFFF');
    const gradInner=color('رنگ ۱','landing.gradient1',l.gradient1||'#FFFFFF')+color('رنگ ۲','landing.gradient2',l.gradient2||'#EEF4FF')+input('جهت گرادیان','landing.gradientDir',l.gradientDir||'135deg');
    const radialInner=color('رنگ مرکز','landing.gradient1',l.gradient1||'#EEF4FF')+color('رنگ بیرون','landing.gradient2',l.gradient2||'#FFFFFF')+'<div class="helper">گرادیان شعاعی از بالا-چپ صفحه به بیرون پخش می‌شود.</div>';
    const imageInner=mediaPickerField('تصویر پس‌زمینه','landing.backgroundImage',l.backgroundImage||'')+selectField('اندازه تصویر','landing.backgroundSize',l.backgroundSize||'cover',[['cover','Cover'],['contain','Contain'],['100% 100%','کشیده']])+selectField('موقعیت تصویر','landing.backgroundPosition',l.backgroundPosition||'center',[['center','وسط'],['top','بالا'],['bottom','پایین'],['left','چپ'],['right','راست'],['top left','بالا چپ'],['top right','بالا راست'],['bottom left','پایین چپ'],['bottom right','پایین راست']])+selectField('تکرار تصویر','landing.backgroundRepeat',l.backgroundRepeat||'no-repeat',[['no-repeat','بدون تکرار'],['repeat','تکرار'],['repeat-x','تکرار افقی'],['repeat-y','تکرار عمودی']]);
    const groups=[['tile','خطی و کاشی‌ای'],['gradient','گرادینتی (لایه‌ای)'],['texture','بافتی'],['fixed','ثابت']];
    const list=patternList();
    const has=id=>{const p=l.backgroundPatternId?String(l.backgroundPatternId).split(',')[0]:'';return p===id;};
    const currentId=(l.backgroundPatternId?String(l.backgroundPatternId).split(',')[0]:'')||'dot-grid';
    const swatch=(id)=>`<button type="button" class="pat-swatch${has(id)?' on':''}" data-pat-sel="${id}" title="${esc((list.find(x=>x.id===id)||{}).label||id)}"><span class="pat-swatch__prev pat-prev--${id}"></span><span class="pat-swatch__lbl">${esc((list.find(x=>x.id===id)||{}).label||'')}</span></button>`;
    const patternInner=
      groups.map(([g,gLabel])=>list.some(x=>x.group===g)?`<div class="pat-group"><div class="pat-group__title">${gLabel}</div><div class="pat-grid">${list.filter(x=>x.group===g).map(x=>swatch(x.id)).join('')}</div></div>`:'').join('')
      +patternControls(l);
    const innerFor={solid:solidInner,gradient:gradInner,radial:radialInner,image:imageInner,pattern:patternInner};
    return section('پس‌زمینه‌ی لندینگ',
      bgTypeSelect(t)
      +`<div class="fx-card open" style="margin-top:10px">${innerFor[t]||''}</div>`
      +'<div class="helper">صفحه همیشه Full bleed است (پس‌زمینه تا لبه‌ها می‌رود) و بدون گردی رندر می‌شود. برای لایهٔ نیمه‌شفاف روی پس‌زمینه، کارت «روکا» را ببین.</div>');
  }
  /* فقط کنترل‌هایی که الگوی انتخاب‌شده واقعاً پشتیبانی می‌کند نمایش داده می‌شود */
  function patternControls(l){
    const info=patternInfo((l.backgroundPatternId?String(l.backgroundPatternId).split(',')[0]:'')||'dot-grid');
    if(!info)return '';
    let out='';
    if(info.params.includes('color'))out+=color('رنگ طرح','landing.patternColor',l.patternColor||'#101828');
    if(info.params.includes('size'))out+=rangeField('اندازهٔ کاشی (px)','landing.patternSize',l.patternSize??28,8,120,1);
    if(info.params.includes('base'))out+=color('رنگ پایه','landing.patternBase',l.patternBase||l.bg||'#FFFFFF');
    if(info.params.includes('count'))out+=rangeField('تعداد لکه‌ها','landing.patternCount',l.patternCount??3,2,4,1);
    const shownOp=(l.patternOpacity===''||l.patternOpacity==null)?info.defOpacity:l.patternOpacity; /* خالی = پیش‌فرض همان الگو */
    out+=rangeField('غلظت طرح ٪','landing.patternOpacity',shownOp,0,100,1);
    return out;
  }
  function pageCardOverlay(l){
    const on=n(l.overlayOpacity,0)>0;
    return section('روکا (Overlay)',`${check('روکا روشن باشد','__overlayOn',on)}${on?`${color('رنگ روکا','landing.overlay',l.overlay||'#000000')}${rangeField('شدت روکا ٪','landing.overlayOpacityPct',Math.round(n(l.overlayOpacity,0)*100),1,100,1)}`:''}<div class="helper">یک لایهٔ نیمه‌شفاف روی هر پس‌زمینه‌ای (رنگ، گرادیان، تصویر، طرح) می‌نشیند تا متن خواناتر شود.</div>`);
  }
  function pageCardStyle(l){
    return section('استایل کلی',`${fontSelectField('Default font','landing.defaultFontFamily',l.defaultFontFamily||'system-ui')}${color('Default text','landing.fg',l.fg||'#101828')}${color('Accent','landing.accent',l.accent||'#175CD3')}${check('Enable CSS reset','landing.cssReset',l.cssReset!==false)}<div class="helper">این‌ها روی عناصری اعمال می‌شوند که استایل اختصاصی برایشان تعیین نشده باشد.</div>`);
  }
  function pageCardTypography(l){
    return section('تایپوگرافی کلی',`${fontSelectField('Default font','landing.defaultFontFamily',l.defaultFontFamily||'system-ui')}<div class="helper">این فونت فقط روی عناصری اعمال می‌شود که فونت اختصاصی برایشان تعیین نکرده‌ای.</div>`);
  }
  function pageCardBrand(l){
    return section('برند',`${color('Text','landing.fg',l.fg||'#101828')}${color('Accent','landing.accent',l.accent||'#175CD3')}`);
  }
  function pageCardSpacing(l){
    return section('عرض و حاشیهٔ صفحه',`${rangeField('Content max width','landing.contentMaxWidth',l.contentMaxWidth??1240,320,1600,10)}${rangeField('Side gutter','landing.pageGutter',l.pageGutter??22,0,80,1)}<div class="helper">عرض محتوا و فاصلهٔ آن از لبه‌های صفحه را کنترل می‌کند؛ پس‌زمینه همیشه تا لبه می‌رود.</div>`);
  }
  /* V124 — «فاصله عناصر داخلی»: یک اسلایدر عددی که بین همهٔ عناصر ریشهٔ صفحه فاصله می‌اندازد.
     روی سایت واقعی هم اعمال می‌شود (gap کانتینر محتوا). صفر = عناصر چسبیده به هم. */
  function pageCardElementGap(l){
    return section('فاصله عناصر داخلی',`${rangeField('فاصله بین عناصر صفحه (px)','landing.elementGap',l.elementGap??10,0,120,1)}<div class="helper">فاصلهٔ یکنواخت بین عناصر اصلی صفحه. کمش کن تا عناصر به هم بچسبند؛ صفر یعنی لبه‌به‌لبه.</div>`);
  }
  function pageCardRhythm(l){
    const preset=l.spacingPreset||'balanced';
    const presets=[['tight','فشرده','برای صفحات فروش سریع'],['balanced','متعادل','پیشنهاد موبایل‌محور'],['airy','باز','برای صفحات برند و معرفی']];
    return section('سیستم هارمونی فاصله‌ها',`<div class="spacing-presets">${presets.map(([v,t,d])=>`<button type="button" class="spacing-preset${preset===v?' is-active':''}" data-spacing-preset="${v}"><b>${t}</b><small>${d}</small></button>`).join('')}</div>${rangeField('فاصلهٔ پایه بین عناصر','landing.elementGap',l.elementGap??12,0,160,1)}${rangeField('فاصلهٔ بین بخش‌ها','landing.sectionGap',l.sectionGap??0,0,240,1)}<div class="sp-grid">${rangeField('فضای بالای صفحه','landing.pagePadTop',l.pagePadTop??0,0,240,1)}${rangeField('فضای پایین صفحه','landing.pagePadBottom',l.pagePadBottom??0,0,240,1)}</div><div class="helper">پیش‌فرض «متعادل» فاصله‌ها را برای موبایل کنترل می‌کند و همان ریتم را بدون کش‌آمدن اضافی روی کامپیوتر نگه می‌دارد. مقدار صفر یعنی چسبیده.</div>`);
  }
  function pageCardMobileCanvas(l){
    return section('بوم موبایل (طراحی اصلی)',`${check('طراحی موبایل‌محور — انتشار با همین ترکیب','landing.mobileNative',l.mobileNative===true)}${selectField('عرض بوم موبایل','landing.mobileWidth',String(l.mobileWidth||390),[['375','۳۷۵px'],['390','۳۹۰px'],['393','۳۹۳px'],['412','۴۱۲px'],['428','۴۲۸px']])}`);
  }
  function pageCardExportImport(){
    return section('Export و Import',`
      <div style="display:grid;gap:8px">
        <button type="button" class="mini-btn" id="exportPageJson">⇩ Export — دانلود JSON صفحه</button>
        <button type="button" class="mini-btn" id="copyPageJson">⧉ کپی JSON در کلیپ‌بورد</button>
        <button type="button" class="mini-btn" id="importPageClipboard">⇧ Import from Clipboard — خواندن JSON</button>
        <label class="mini-btn" style="text-align:center;cursor:pointer;display:block">⇧ Import — انتخاب فایل JSON<input id="importPageJson" type="file" accept="application/json,.json" style="display:none"></label>
      </div>
      <div class="helper">کل صفحه (تنظیمات + بلوک‌ها) Export می‌شود. Import محتوای فعلی را با فایل انتخابی جایگزین می‌کند — قبلش Export بگیر.</div>`);
  }
  function pageInspector(){
    const l=state.landing||{};
    inspector.innerHTML='';
    /* V124 — صفحه هم درست مثل عنصرها تبی دارد: محتوا / طراحی / فاصله‌گذاری / پیشرفته. */
    if(activeTab==='content'){
      const subCard=pageCardSubpages(); if(subCard)inspector.appendChild(subCard);
      inspector.appendChild(pageCardPage());
    }
    else if(activeTab==='design'||activeTab==='style'||activeTab==='responsive'){
      inspector.appendChild(landingBgCard(l));
      inspector.appendChild(pageCardOverlay(l));
      inspector.appendChild(pageCardStyle(l));
      inspector.appendChild(pageCardTypography(l));
      inspector.appendChild(pageCardBrand(l));
      inspector.appendChild(pageCardSpacing(l)); /* V142 — فاصله‌گذاری صفحه داخل تب استایل */
      inspector.appendChild(pageCardElementGap(l));
    }

    else if(activeTab==='advanced'){
      inspector.appendChild(pageCardMobileCanvas(l));
      inspector.appendChild(pageCardExportImport());
    }
    bindFields(); bindRichFields(); initFontPickers();
    bindPageSettingsExtras();
  }
  function bindPageSettingsExtras(){
    inspector.querySelectorAll('[data-spacing-preset]').forEach(btn=>btn.addEventListener('click',()=>{ const P={tight:{spacingPreset:'tight',elementGap:6,sectionGap:18,pagePadTop:12,pagePadBottom:20},balanced:{spacingPreset:'balanced',elementGap:12,sectionGap:32,pagePadTop:20,pagePadBottom:32},airy:{spacingPreset:'airy',elementGap:20,sectionGap:56,pagePadTop:40,pagePadBottom:64}}; Object.assign(state.landing,P[btn.dataset.spacingPreset]||P.balanced); snapshot(); scheduleSave(); scheduleCanvasRender(); setTimeout(()=>updateInspector(),0); }));
    /* V129 — آکاردئون تک‌گانه: دراپ‌داون «نوع پس‌زمینه» حالت را عوض می‌کند و فقط
       فیلدهای همان حالت زیرش می‌آید. انتخاب طرح از کتابخانهٔ «طرح‌ها» هم همین‌طور. */
    inspector.querySelectorAll('[data-bg-select]').forEach(sel=>sel.addEventListener('change',()=>{
      const v=sel.value;
      if(v==='pattern'){ state.landing.backgroundPatternId=state.landing.backgroundPatternId||'dot-grid'; state.landing.backgroundType='blob'; }
      else { state.landing.backgroundType=v; state.landing.backgroundPatternId=''; }
      snapshot(); scheduleSave(); scheduleCanvasRender(); setTimeout(()=>updateInspector(),0);
    }));
    inspector.querySelectorAll('[data-pat-sel]').forEach(btn=>btn.addEventListener('click',()=>{
      state.landing.backgroundPatternId=btn.dataset.patSel;
      if((state.landing.backgroundType||'solid')!=='blob') state.landing.backgroundType='blob';
      snapshot(); scheduleSave(); scheduleCanvasRender(); setTimeout(()=>updateInspector(),0);
    }));
    /* روکای لندینگ (کارت جداگانه): تیک = روشن/خاموش کردن کامل + فیلدهای رنگ/شدت */
    inspector.querySelectorAll('[data-bind="__overlayOn"]').forEach(cb=>cb.addEventListener('change',()=>{
      state.landing.overlayOpacity=cb.checked?0.35:0;
      snapshot(); scheduleSave(); scheduleCanvasRender(); setTimeout(()=>updateInspector(),0);
      if(cb.checked)showToast('روکا روشن شد — شدت و رنگش را زیرش تنظیم کن');
    }));
    inspector.querySelector('#exportPageJson')?.addEventListener('click',exportPageJson);
    inspector.querySelector('#copyPageJson')?.addEventListener('click',copyPageJson);
    inspector.querySelector('#importPageClipboard')?.addEventListener('click',importPageJsonClipboard);
    inspector.querySelector('#importPageJson')?.addEventListener('change',importPageJsonFile);
  }
  function exportPageJson(){
    /* V124 — خروجی کامل صفحه: تنظیمات + بلوک‌ها + زیرصفحه‌ها در یک فایل JSON. */
    try{
      const payload={ravaBuilderExport:1,kind:window.BUILDER_KIND||'product',exportedAt:new Date().toISOString(),page:structuredClone(state)};
      const name=(state.slug||state.title||'page').toString().replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,60)||'page';
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name+'.json';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},300);
      showToast('خروجی JSON دانلود شد');
    }catch(err){console.error(err);showToast('Export ناموفق بود: '+err.message);}
  }
  function copyPageJson(){
    try{
      const payload={ravaBuilderExport:1,kind:window.BUILDER_KIND||'product',exportedAt:new Date().toISOString(),page:structuredClone(state)};
      navigator.clipboard.writeText(JSON.stringify(payload,null,2)).then(()=>showToast('JSON کپی شد')).catch(()=>showToast('کلیپ‌بورد در دسترس نیست'));
    }catch(err){showToast('کپی ناموفق: '+err.message);}
  }
  function importPageJsonText(raw){
    const parsed=JSON.parse(String(raw||''));
    const page=(parsed&&parsed.page&&typeof parsed.page==='object')?parsed.page:(parsed&&typeof parsed==='object'?parsed:null);
    if(!page)throw new Error('فایل یک صفحهٔ بیلدر نیست');
    if(!Array.isArray(page.blocks)&&!page.landing)throw new Error('ساختار JSON قابل قبول نیست');
    if(!confirm('محتوای فعلی صفحه با JSON کلیپ‌بورد جایگزین شود؟'))return false;
    const keepTitle=state.title;
    state=structuredClone(page);
    if(!state.title)state.title=keepTitle;
    normalizeState();
    selectedId=null;selectedIds.clear();
    snapshot();renderAll();
    showToast('صفحه از کلیپ‌بورد بازخوانی شد ✓');
    return true;
  }
  async function importPageJsonClipboard(){
    try{
      if(!navigator.clipboard?.readText)throw new Error('Clipboard API در این مرورگر در دسترس نیست');
      const raw=await navigator.clipboard.readText();
      if(!raw.trim())throw new Error('کلیپ‌بورد خالی است');
      importPageJsonText(raw);
    }catch(err){console.error(err);showToast('Import از کلیپ‌بورد ناموفق: '+err.message);}
  }
  function importPageJsonFile(ev){
    const file=ev.target&&ev.target.files&&ev.target.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const parsed=JSON.parse(String(reader.result||''));
        importPageJsonText(reader.result);
      }catch(err){console.error(err);showToast('Import ناموفق: '+err.message);}
      finally{ ev.target.value=''; }
    };
    reader.onerror=()=>showToast('خواندن فایل ناموفق بود');
    reader.readAsText(file);
  }
  function applyLandingPreset(name){
    const presets={
      sales:{fullBleed:true,contentMaxWidth:1240,pageGutter:20,radius:0,backgroundType:'solid',bg:'#0B1220',fg:'#FFFFFF',accent:'#7F56D9',gradient1:'#0B1220',gradient2:'#175CD3',backgroundSize:'cover',backgroundPosition:'center',backgroundRepeat:'no-repeat'},
      minimal:{fullBleed:true,contentMaxWidth:1100,pageGutter:22,radius:0,backgroundType:'solid',bg:'#FFFFFF',fg:'#101828',accent:'#175CD3',backgroundSize:'cover',backgroundPosition:'center',backgroundRepeat:'no-repeat'},
      immersive:{fullBleed:true,contentMaxWidth:1440,pageGutter:18,radius:0,backgroundType:'gradient',bg:'#0B1220',fg:'#FFFFFF',accent:'#7F56D9',gradient1:'#0B1220',gradient2:'#175CD3',gradientDir:'135deg',backgroundSize:'cover',backgroundPosition:'center',backgroundRepeat:'no-repeat'},
      mobile:{fullBleed:true,contentMaxWidth:680,pageGutter:16,radius:0,backgroundType:'solid',bg:'#FFFFFF',fg:'#101828',accent:'#175CD3',backgroundSize:'cover',backgroundPosition:'center',backgroundRepeat:'no-repeat',mobileNative:true,mobileWidth:390}
    };
    const preset=presets[name];if(!preset)return;state.landing={...state.landing,...preset};snapshot();scheduleSave();renderAll();showToast('Preset لندینگ اعمال شد');
  }
  /* V124 — «پیش‌تنظیم‌های لندینگ» از تنظیمات صفحه حذف شد؛ تابع برای سازگاری می‌ماند. */
    /* =====================================================================
     V142 — Inspector 3.0 for the core library (عناصر اصلی / بخش‌بندی / خرید)
     • سه تب مرتب: محتوا (فقط محتوا و رفتار) / استایل (همهٔ ظاهر + فاصله) / پیشرفته
     • کارت‌های جمع‌وجور آکاردئونی: فقط یک کارت باز، بقیه یک خط.
     • کارت‌های جدید مشترک: پس‌زمینه (کانتینرها) / حاشیه و گوشه / سایه / حالت هاور
     • کنترل‌های تکراریِ قدیمی (حاشیه/گردی/سایهٔ پراکنده) از کارت‌های قبلی حذف
       شده‌اند و مقدار قبلی‌شان پیش‌فرض کارت جدید است؛ پس هیچ صفحه‌ای عوض نمی‌شود.
     رندر: WidgetRenderer.fxCss (یک منبع برای بوم، پیش‌نمایش و سایت منتشرشده).
     ===================================================================== */
  const V142_TYPES=new Set(['text','image','video','audio','button','buyButton','icon','embed','badge','mediaMarquee','section','columns','anywhereSection','spacer','divider','scrollPoint','stickyButton','upsellBox','stickySection','stickyColumn']);
  const V142_CAPS=(window.WidgetRenderer&&window.WidgetRenderer.FX_CAPS)||{};
  const V142_CONTAINERS=new Set(['section','columns','anywhereSection','stickySection','stickyColumn']);
  const V142_DUP_KEYS=['border','borderWidth','borderStyle','borderColor','radius','shadow','hoverScale','hoverAnimation'];
  const V142_RADIUS_DEF={image:18,video:18,button:12,buyButton:14,stickyButton:14,badge:999,audio:24,stickyColumn:18,stickySection:0,section:0,columns:0,text:0,embed:0,mediaMarquee:0};
  const V142_SHADOW_DEF={buyButton:'md',stickyButton:'lg',stickySection:'lg',stickyColumn:'md'};
  const V142_RR=new Set(['pattern','bdS','bdRSplit','shPreset','shInset','hvOn','hvMove','hvSh','bgxType','bgxGT','bgxGlass','pill','showBadge','showIcon','gradient','variant','fxFrame','target','bgxG3']);
  const v142Open=new Map(); /* type|tab → عنوان کارت باز */
  const v142Has=(b,cap)=>(V142_CAPS[b.type]||[]).includes(cap);

  /* ---------- tiny UI kit ---------- */
  function v142Seg(label,key,cur,opts,cls=''){
    return `<div class="field v142-seg ${cls}">${label?`<label>${label}</label>`:''}<div class="v142-seg__row">${opts.map(([v,t,ico])=>`<button type="button" class="v142-seg__btn${String(cur)===String(v)?' on':''}" data-v142-set="${attr(key)}" data-v142-val="${attr(v)}" title="${attr(t)}">${ico?`<span class="v142-seg__ico">${ico}</span>`:''}<span>${esc(t)}</span></button>`).join('')}</div></div>`;
  }
  function v142ColorOpt(label,key,value,ph='بدون تغییر'){
    const v=value||''; const safe=/^#[0-9a-fA-F]{6}$/.test(v)?v:(/^#[0-9a-fA-F]{8}$/.test(v)?v.slice(0,7):'#175CD3');
    return `<div class="field v142-copt${v?'':' is-empty'}"><label>${label}</label><div class="swatch-input v142-swatch"><input data-bind="${attr(key)}" type="text" value="${attr(v)}" placeholder="${attr(ph)}"><input data-color-for="${attr(key)}" type="color" value="${safe}"><button type="button" class="v142-clear" data-v142-clear="${attr(key)}" title="برداشتن">✕</button></div></div>`;
  }
  function v142Row(...cells){ return `<div class="v142-row">${cells.join('')}</div>`; }
  function v142Switch(icon,label,key,on,hint){ return fxRow(icon,label,key,on,hint); }
  function v142Card(title,body,icon=''){ return chl((icon?`<span class="v142-ico">${icon}</span>`:'')+title,body); }

  /* ---------- HTML surgery: حذف کنترل‌های تکراری / جابه‌جایی کارت بین تب‌ها ---------- */
  function v142Parse(html){ const t=document.createElement('template'); t.innerHTML=html||''; return t.content; }
  function v142Html(frag){ const d=document.createElement('div'); d.appendChild(frag); return d.innerHTML; }
  function v142Strip(html,keys){
    if(!html||!keys||!keys.length)return html||'';
    const f=v142Parse(html);
    keys.forEach(k=>f.querySelectorAll(`[data-bind="${k}"]`).forEach(el=>{ const box=el.closest('.field,label.check,.fx-row'); if(box)box.remove(); }));
    if(keys.includes('borderStyle')) f.querySelectorAll('details.border-style-acc').forEach(x=>x.remove());
    f.querySelectorAll('.inspector-section').forEach(sec=>{ const body=sec.querySelector('.inspector-section__body'); if(body&&!body.querySelector('[data-bind],button,input,select,textarea,details,.repeater,[data-ic-add]'))sec.remove(); });
    return v142Html(f);
  }
  function v142Take(html,titles){
    const f=v142Parse(html); const taken=[];
    f.querySelectorAll('.inspector-section').forEach(sec=>{ const h=sec.querySelector(':scope > button > span'); const t=(h?h.textContent:'').trim(); if(titles.includes(t)){ taken.push(sec.outerHTML); sec.remove(); } });
    return {rest:v142Html(f),taken:taken.join('')};
  }
  function v142Retitle(html,map){ const f=v142Parse(html); f.querySelectorAll('.inspector-section > button > span:first-child').forEach(s=>{ const t=s.textContent.trim(); if(map[t])s.textContent=map[t]; }); f.querySelectorAll('.field > label, label.check').forEach(l=>{ const node=[...l.childNodes].find(x=>x.nodeType===3&&x.textContent.trim()); if(node&&map[node.textContent.trim()])node.textContent=map[node.textContent.trim()]; }); return v142Html(f); }

  /* ---------- legacy → نمایش پیش‌فرض کارت‌های جدید ---------- */
  function v142Legacy(b){
    const lw=b.type==='stickySection'||b.type==='stickyColumn'?n(b.borderWidth,b.type==='stickySection'?1:1):n(b.borderWidth,0);
    return {
      w:lw, c:b.border||b.borderColor||'#EAECF0', s:lw>0?(b.borderStyle||'solid'):'none',
      r:n(b.radius,V142_RADIUS_DEF[b.type]??0), sh:b.shadow||V142_SHADOW_DEF[b.type]||'none'
    };
  }
  function v142LegacyBg(b){
    if(b.type==='section'){
      const t=b.backgroundType||'solid';
      if(t==='gradient')return {type:'gradient',g1:b.gradient1||b.bg||'#FFFFFF',g2:b.gradient2||'#EEF4FF',a:parseInt(b.gradientDir,10)||135,gt:'linear'};
      if(t==='radial')return {type:'gradient',g1:b.gradient1||'#EEF4FF',g2:b.gradient2||b.bg||'#FFFFFF',a:135,gt:'radial'};
      if(t==='image')return {type:'image',img:b.backgroundImage||'',c:'#F2F4F7'};
      if(t==='video')return {type:'video',vid:b.backgroundVideo||''};
      return {type:'solid',c:b.backgroundColor??b.bg??'#FFFFFF'};
    }
    if(b.type==='columns')return {type:'none',c:'#FFFFFF'};
    return {type:'solid',c:b.bg||'#FFFFFF'};
  }

  /* ---------- کارت‌های مشترک ---------- */
  function v142BorderCard(b){
    const L=v142Legacy(b);
    const s=b.bdS??L.s, w=b.bdW??L.w, c=b.bdC??L.c, r=b.bdR??L.r;
    let body=v142Seg('نوع خط','bdS',s,[['none','بدون','∅'],['solid','ممتد','—'],['dashed','خط‌چین','┄'],['dotted','نقطه‌چین','┈']]);
    if(s!=='none') body+=v142Row(rangeField('ضخامت','bdW',w||1,0,20,1),color('رنگ','bdC',c));
    body+=rangeField('گردی گوشه‌ها','bdR',r,0,200,1);
    body+=check('هر گوشه جدا','bdRSplit',b.bdRSplit===true);
    if(b.bdRSplit===true) body+=`<div class="v142-corners">${[['bdRtr','↗ بالا راست'],['bdRtl','↖ بالا چپ'],['bdRbr','↘ پایین راست'],['bdRbl','↙ پایین چپ']].map(([k,t])=>input(t,k,b[k]??r,'number','min="0" max="400"')).join('')}</div>`;
    return v142Card('حاشیه و گوشه',body,'▢');
  }
  function v142ShadowCard(b){
    const L=v142Legacy(b); const p=b.shPreset??L.sh;
    let body=v142Seg('','shPreset',p,[['none','بدون'],['sm','نرم'],['md','متوسط'],['lg','عمیق'],['xl','خیلی عمیق'],['glow','درخشش'],['custom','سفارشی']],'v142-seg--wrap');
    if(p==='glow') body+=v142Row(color('رنگ درخشش','shC',b.shC||'#7C3AED'),rangeField('شدت ٪','shO',b.shO??55,0,100,1))+v142Row(rangeField('پخش (Blur)','shBlur',b.shBlur??28,0,200,1),rangeField('گسترش','shSpread',b.shSpread??2,-50,80,1));
    if(p==='custom') body+=v142Row(rangeField('افقی X','shX',b.shX??0,-100,100,1),rangeField('عمودی Y','shY',b.shY??12,-100,150,1))+v142Row(rangeField('پخش (Blur)','shBlur',b.shBlur??32,0,200,1),rangeField('گسترش','shSpread',b.shSpread??0,-60,80,1))+v142Row(color('رنگ','shC',b.shC||'#101828'),rangeField('شدت ٪','shO',b.shO??18,0,100,1))+check('سایهٔ داخلی (Inset)','shInset',b.shInset===true);
    return v142Card('سایه',body,'◐');
  }
  function v142HoverCard(b){
    const on=b.hvOn===true; const iconOnly=b.type==='icon';
    let inner='';
    if(on){
      inner+=v142Seg('حرکت','hvMove',b.hvMove||'none',[['none','بدون'],['lift','بالا آمدن','↑'],['grow','بزرگ شدن','⤢'],['shrink','کوچک شدن','⤡']]);
      if(b.hvMove&&b.hvMove!=='none') inner+=rangeField(b.hvMove==='lift'?'مقدار بالا آمدن (px)':'مقدار تغییر اندازه (٪)','hvAmt',b.hvAmt??6,1,30,1);
      inner+=iconOnly?v142ColorOpt('رنگ آیکون','hvColor',b.hvColor):v142Row(v142ColorOpt('پس‌زمینه','hvBg',b.hvBg),v142ColorOpt('رنگ متن','hvColor',b.hvColor));
      if(!iconOnly){ if(v142Has(b,'border'))inner+=v142ColorOpt('رنگ حاشیه','hvBd',b.hvBd); inner+=v142Seg('سایه در هاور','hvSh',b.hvSh||'keep',[['keep','بدون تغییر'],['none','بدون'],['sm','نرم'],['md','متوسط'],['lg','عمیق'],['glow','درخشش']],'v142-seg--wrap'); }
      inner+=rangeField('سرعت انیمیشن (میلی‌ثانیه)','hvDur',b.hvDur??280,60,1200,20);
      inner+='<div class="helper">روی بوم هم ماوس را روی عنصر ببر تا همین حالا نتیجه را ببینی.</div>';
    }
    return v142Card('حالت هاور',v142Switch('✦','فعال‌سازی افکت هاور','hvOn',on,'تغییر ظاهر وقتی ماوس روی عنصر می‌رود')+(on?`<div class="v142-sub">${inner}</div>`:''),'✦');
  }
  const V142_GRADS=[['#EEF4FF','#FFFFFF',180],['#7F56D9','#175CD3',135],['#F79009','#F04438',135],['#12B76A','#0BA5EC',135],['#101828','#344054',160],['#FDF2FA','#EEF4FF',135]];
  function v142BgCard(b){
    const L=v142LegacyBg(b); const t=b.bgxType??L.type;
    let body=v142Seg('','bgxType',t,[['none','شفاف','∅'],['solid','رنگ','■'],['gradient','گرادیان','◧'],['image','تصویر','▧'],['video','ویدیو','▶']],'v142-seg--wrap');
    if(t==='solid'){
      body+=v142Row(color('رنگ','bgxC',b.bgxC??L.c??'#FFFFFF'),rangeField('شفافیت رنگ ٪','bgxCo',b.bgxCo??100,0,100,1));
      body+=check('افکت شیشه‌ای (Glass)','bgxGlass',b.bgxGlass===true);
      if(b.bgxGlass===true) body+=rangeField('میزان تاری پشت (px)','bgxBlur',b.bgxBlur??14,0,60,1)+'<div class="helper">برای دیده شدن افکت شیشه، «شفافیت رنگ» را زیر ۸۰٪ بگذار.</div>';
    }
    if(t==='gradient'){
      body+=`<div class="v142-grads">${V142_GRADS.map(([a,c,d],i)=>`<button type="button" class="v142-grad" data-v142-grad="${i}" style="background:linear-gradient(${d}deg,${a},${c})" title="پریست ${i+1}"></button>`).join('')}</div>`;
      body+=v142Seg('نوع','bgxGT',b.bgxGT||L.gt||'linear',[['linear','خطی'],['radial','دایره‌ای']]);
      body+=v142Row(color('رنگ ۱','bgxG1',b.bgxG1??L.g1??'#EEF4FF'),color('رنگ ۲','bgxG2',b.bgxG2??L.g2??'#FFFFFF'));
      body+=v142ColorOpt('رنگ ۳ (اختیاری)','bgxG3',b.bgxG3,'بدون رنگ سوم');
      if((b.bgxGT||L.gt||'linear')!=='radial') body+=rangeField('زاویه (درجه)','bgxA',b.bgxA??L.a??135,0,360,5);
    }
    if(t==='image'){
      body+=mediaInput('تصویر پس‌زمینه','bgxImg',b.bgxImg??L.img??'');
      body+=v142Row(selectField('اندازه','bgxSize',b.bgxSize||'cover',[['cover','پر کردن'],['contain','کامل'],['auto','تکرار (پترن)']]),selectField('موقعیت','bgxPos',b.bgxPos||'center',[['center','وسط'],['top','بالا'],['bottom','پایین'],['left','چپ'],['right','راست']]));
      body+=check('پارالاکس (تصویر هنگام اسکرول ثابت بماند)','bgxFixed',b.bgxFixed===true);
    }
    if(t==='video'){
      body+=mediaInput('ویدیوی پس‌زمینه (MP4)','bgxVid',b.bgxVid??L.vid??'');
      body+=mediaInput('تصویر کاور (تا لود ویدیو)','bgxPoster',b.bgxPoster||'');
      body+='<div class="helper">ویدیو بی‌صدا، خودکار و لوپ پخش می‌شود. فایل سبک (زیر ۵ مگ) انتخاب کن تا صفحه سریع بماند.</div>';
    }
    if(t==='image'||t==='video'||t==='gradient') body+=v142Row(v142ColorOpt('رنگ روکش','bgxOv',b.bgxOv,'بدون روکش'),rangeField('شدت روکش ٪','bgxOvO',b.bgxOvO??(b.bgxOv?40:0),0,100,1));
    return v142Card('پس‌زمینه',body,'▨');
  }
  function v142FxCards(b){
    let s='';
    if(v142Has(b,'bg'))s+=v142BgCard(b);
    if(v142Has(b,'border'))s+=v142BorderCard(b);
    if(v142Has(b,'shadow'))s+=v142ShadowCard(b);
    if(v142Has(b,'hover'))s+=v142HoverCard(b);
    return s;
  }
  function v142SpacingCard(b){
    if(['spacer','scrollPoint','stickyButton'].includes(b.type))return '';
    const f=v142Parse(spacingFields(b)); const sec=f.querySelector('.inspector-section');
    if(sec){ const sp=sec.querySelector(':scope > button > span'); if(sp)sp.innerHTML='<span class="v142-ico">↔</span>فاصله و اندازه'; }
    return v142Html(f);
  }

  /* ---------- تب محتوا ---------- */
  function v142Content(b){ return stickyWidgetCard(b)+v142ContentInner(b); }
  function v142ContentInner(b){
    const T=b.type;
    if(T==='buyButton'){
      const kind=b.target||'checkout';
      return v142Card('دکمه', input('متن دکمه','label',b.label||'همین حالا خرید کن')+check('آیکون کنار متن','showIcon',b.showIcon===true)+(b.showIcon===true?input('آیکون / ایموجی','icon',b.icon||'⚡'):''),'⬭')
        +v142Card('مقصد دکمه', selectField('مقصد','target',kind,[['checkout','صفحهٔ پرداخت (Checkout)'],['subpage','زیرصفحهٔ محصول'],['custom','لینک دلخواه']])+(kind==='subpage'?subPageSelectField('زیرصفحهٔ مقصد','subpage',(b.subpage||'').replace(/^\/+/, '')):'')+(kind==='custom'?input('لینک دلخواه (URL)','url',b.url||'#buy'):''),'↗')
        +v142Card('متن زیر دکمه', input('مثلاً «پرداخت امن — فعال‌سازی فوری»','note',b.note||''),'✎');
    }
    if(T==='divider') return v142Card('الگوی خط', v142Seg('','pattern',b.pattern||'line',[['none','بدون خط (Spacer)'],['line','ممتد'],['dashed','خط‌چین'],['dotted','نقطه‌چین'],['double','دوخطی'],['stars','ستاره'],['wave','موج'],['zigzag','زیگزاگ']],'v142-seg--wrap')+((b.pattern==='none')?rangeField('ارتفاع فاصله (px)','spaceHeight',b.spaceHeight??48,0,800,1)+'<div class="helper">حالت Spacer: فقط فضای خالی؛ روی بوم با خط‌چین دیده می‌شود و در سایت نامرئی است.</div>':'')+'<div class="helper">برای لبه‌به‌لبه کردن خط، در تب «استایل» اسلایدر «عرض» را تا Edge to edge یا Full bleed بکش.</div>','―');
    if(T==='spacer') return v142Card('ارتفاع فاصله', rangeField('ارتفاع (px)','height',b.height??48,0,800,1)+'<div class="helper">یک فضای خالی بین عناصر. روی بوم با خط‌چین دیده می‌شود و در سایت نامرئی است.</div>','↕');
    if(T==='stickySection') return v142Card('رفتار چسبان', input('نام (فقط در بیلدر)','label',b.label||'Sticky section')+v142Seg('بچسبد به','position',b.position||'bottom',[['bottom','پایین صفحه'],['top','بالای صفحه']])+rangeField('فاصله از لبه (px)','offset',b.offset??0,0,80,1)+check('نمایش در موبایل','showOnMobile',b.showOnMobile!==false)+check('دکمهٔ بستن','closeable',b.closeable)+'<div class="helper">هر عنصری (متن، دکمه، فرم…) را داخلش بکش؛ هنگام اسکرول ثابت می‌ماند.</div>','📌');
    if(T==='stickyColumn') return v142Card('رفتار چسبان', input('نام (فقط در بیلدر)','label',b.label||'Sticky column')+v142Seg('بچسبد به','position',b.position||'top',[['top','بالا'],['bottom','پایین']])+rangeField('فاصله از لبه (px)','offset',b.offset??18,0,120,1)+check('نمایش در موبایل','showOnMobile',b.showOnMobile!==false)+'<div class="helper">داخل یک ستون بگذارش تا هنگام اسکرول کنار محتوای بلند ثابت بماند (مثل کارت خرید).</div>','📌');
    if(T==='anywhereSection') return v142Card('محتوا',input('نام داخلی','label',b.label||'Anywhere Section')+'<div class="helper">عناصر را داخل این سکشن رها کن. جای‌گذاری، اندازه و ریسپانسیو در تب طراحی و پیشرفته تنظیم می‌شوند.</div>','⬚');
    if(T==='section'){
      /* V250 — تب محتوای Section دیگر خالی نیست: نام در لایه‌ها + لنگر برای لینک‌های #، و تعداد عناصر داخلش */
      const kids=(b.blocks||[]).length;
      return v142Card('بخش', input('نام بخش (فقط در لایه‌ها و بیلدر)','name',b.name||'')+input('شناسهٔ لنگر (برای لینک #)','domId',b.domId||'')+(b.domId?`<div class="v250-anchor"><code>#${esc(String(b.domId).replace(/^#/,''))}</code><button type="button" class="mini-btn" data-v250-copy="#${attr(String(b.domId).replace(/^#/,''))}">کپی</button></div>`:'')+'<div class="helper">مثلاً <code>pricing</code> بنویس؛ هر دکمه یا لینکی با آدرس <code>#pricing</code> به این بخش اسکرول می‌کند.</div>','▭')
        +`<div class="helper v142-empty">${kids?`این بخش ${kids} عنصر دارد. `:'این بخش خالی است؛ عناصر را از کتابخانه داخلش بکش. '}عرض، جایگاه، چینش، ارتفاع و فاصله‌ها در تب «استایل» ← «اندازه و فاصله» هستند.</div><div class="inspector-section v142-actions"><div class="inspector-section__body"><button type="button" class="mini-btn" id="sectionToColumns">⇄ تبدیل این بخش به کالمنز</button></div></div>`;
    }
    let html=contentFields(b);

    if(T==='columns'){ const x=v142Take(html,['فاصله‌ها']); html=x.rest; }
    if(T==='upsellBox'){ const x=v142Take(html,['Style']); html=v142Retitle(x.rest,V142_UPSELL_FA); }
    return html;
  }
  const V142_UPSELL_FA={'Upsell Box':'آپسل','badge':'برچسب بالا','title':'عنوان','subtitle':'زیرعنوان','items title':'عنوان لیست آیتم‌ها','save note':'یادداشت صرفه‌جویی','base price':'قیمت پایه','button label':'متن دکمه','title (بدون اتصال)':'عنوان (بدون اتصال)','desc (توضیح داخل اکوردیون)':'توضیح (داخل اکوردیون)','price (بدون اتصال)':'قیمت (بدون اتصال)','compare':'قیمت قبل از تخفیف','image URL':'تصویر','Style':'رنگ‌ها و اندازه','accent':'رنگ اصلی','card bg':'پس‌زمینهٔ کارت','item bg':'پس‌زمینهٔ آیتم','border':'رنگ حاشیه','text':'رنگ متن','muted':'رنگ متن کم‌رنگ','button bg':'پس‌زمینهٔ دکمه','button text':'رنگ متن دکمه','radius':'گردی گوشه','padX':'پدینگ افقی','padY':'پدینگ عمودی','title size':'اندازهٔ عنوان','btn size':'اندازهٔ دکمه'};

  /* ---------- تب استایل ---------- */
  function v142Style(b){
    const T=b.type; let own='';
    if(T==='buyButton'){
      own=v142Strip(coreDesignFields(Object.assign({},b,{type:'stickyButton',shadow:b.shadow||'md'})),V142_DUP_KEYS)
        +v142Card('چینش', alignmentField(b)+check('تمام‌عرض','fullWidth',b.fullWidth===true),'☰')
        +(b.note?v142Card('متن زیر دکمه', color('رنگ','noteColor',b.noteColor||'#667085'),'✎'):'');
    }
    else if(T==='divider'&&b.pattern==='none') own='<div class="helper v142-empty">حالت Spacer ظاهری ندارد؛ ارتفاعش را از تب «محتوا» تنظیم کن.</div>';
    else if(T==='divider') own=v142Card('ظاهر خط', v142Row(color('رنگ','color',b.color||'#EAECF0'),rangeField('ضخامت','width',b.width??2,1,20,1)),'―');
    else if(T==='spacer') own='<div class="helper v142-empty">Spacer ظاهری ندارد؛ ارتفاعش را از تب «محتوا» تنظیم کن.</div>';
    else if(T==='stickySection'||T==='stickyColumn') own=v142Card('متن و اندازه', color('رنگ متن','fg',b.fg||'#101828')+(T==='stickyColumn'?v142Row(rangeField('عرض ٪','width',b.width??100,40,100,1),rangeField('حداقل ارتفاع','minHeight',b.minHeight??160,0,800,1)):''),'Aa');
    else if(T==='section'){ own=''; /* V147 — size/height/spacing live in the single «اندازه و فاصله» card */ }
    else if(T==='columns'){ own=coreDesignFields(b); }
    else if(T==='button'){ own=v142Strip(coreDesignFields(b),V142_DUP_KEYS); /* V250 — چینش فقط در کارت «اندازه و فاصله» (قبلاً دوبار نمایش داده می‌شد) */ }
    else if(T==='upsellBox'){ const x=v142Take(contentFields(b),['Style']); own=v142Retitle(x.taken,V142_UPSELL_FA); }
    else if(T==='scrollPoint') own=coreDesignFields(b);
    else own=v142Strip(styleFields(b),v142Has(b,'border')?V142_DUP_KEYS:['hoverScale','hoverAnimation']);
    return own+v142FxCards(b)+sizeCard(b);
  }

  /* ---------- تب پیشرفته ---------- */
  function v142Advanced(b){
    return advancedFields(b)+v142Card('در ویرایشگر', check('قفل عنصر (جابه‌جا نشود)','locked',b.locked)+check('پنهان در بوم ویرایش','hiddenEditor',b.hiddenEditor),'🔒');
  }

  /* ---------- رفتار کارت‌ها: آکاردئون تک‌بازشو + به خاطر سپردن کارت باز ---------- */
  function v142Accordion(t){
    const key=(t?t.type:'page')+'|'+activeTab;
    /* کارت‌های fieldGroup (بدون هدر) هم هدر آکاردئونی می‌گیرند */
    inspector.querySelectorAll('.inspector-section').forEach(s=>{ if(s.parentElement.closest('.inspector-section__body')||s.querySelector(':scope > button'))return; const tt=s.querySelector(':scope > .inspector-section__body > .field-group__title'); if(!tt)return; const btn=document.createElement('button'); btn.type='button'; btn.innerHTML=`<span>${esc(tt.textContent.trim())}</span><span class="section-chevron">⌄</span>`; tt.remove(); s.prepend(btn); });
    const secs=[...inspector.querySelectorAll('.inspector-section')].filter(s=>!s.parentElement.closest('.inspector-section__body')&&s.querySelector(':scope > button'));
    if(!secs.length)return;
    const titleOf=s=>(s.querySelector(':scope > button')?.textContent||'').replace('⌄','').trim();
    const want=v142Open.get(key);
    const hit=secs.find(s=>titleOf(s)===want);
    secs.forEach((s,i)=>{
      const old=s.querySelector(':scope > button'); const btn=old.cloneNode(true); old.replaceWith(btn);
      s.classList.toggle('collapsed', hit? s!==hit : i!==0);
      btn.addEventListener('click',()=>{
        const willOpen=s.classList.contains('collapsed');
        secs.forEach(o=>o.classList.add('collapsed'));
        if(willOpen){ s.classList.remove('collapsed'); v142Open.set(key,titleOf(s)); } else v142Open.set(key,'__none__');
      });
    });
  }
  /* ---------- اتصال کنترل‌های V142 ---------- */
  function v142Commit(t,rerender=true){ snapshot(); scheduleSave(); scheduleCanvasRender(); if(rerender)setTimeout(()=>updateInspector(),0); }
  function v142Normalize(t,key){
    /* لمس هر کنترل حاشیه، هر سه مقدار را قطعی می‌کند تا رندر با نمایش یکی باشد */
    const L=v142Legacy(t);
    if(/^bd[SWC]$/.test(key)){ if(t.bdS===undefined)t.bdS=L.s==='none'?'solid':L.s; if(t.bdS!=='none'){ if(t.bdW===undefined||(key==='bdS'&&!(n(t.bdW,0)>0)))t.bdW=L.w>0?L.w:1; if(t.bdC===undefined)t.bdC=L.c; } }
    if(key==='bdRSplit'&&t.bdRSplit){ const r=t.bdR??L.r; ['bdRtl','bdRtr','bdRbr','bdRbl'].forEach(k=>{ if(t[k]===undefined)t[k]=r; }); }
    if(key==='bgxType'){ const B=v142LegacyBg(t); if(t.bgxType==='solid'&&t.bgxC===undefined)t.bgxC=B.c||'#FFFFFF'; if(t.bgxType==='gradient'){ if(t.bgxG1===undefined)t.bgxG1=B.g1||'#EEF4FF'; if(t.bgxG2===undefined)t.bgxG2=B.g2||'#FFFFFF'; if(t.bgxA===undefined)t.bgxA=B.a||135; if(t.bgxGT===undefined)t.bgxGT=B.gt||'linear'; } if(t.bgxType==='image'&&t.bgxImg===undefined&&B.img)t.bgxImg=B.img; if(t.bgxType==='video'&&t.bgxVid===undefined&&B.vid)t.bgxVid=B.vid; }
    if(key==='hvOn'&&t.hvOn&&!t.hvMove){ t.hvMove='lift'; if(t.hvAmt===undefined)t.hvAmt=4; }
  }
  function v142Bind(t){
    if(!t)return;
    inspector.querySelectorAll('[data-sw-mode]').forEach(btn=>btn.addEventListener('click',()=>stickyWidgetSwitch(t.id,btn.dataset.swMode)));
    inspector.querySelectorAll('[data-v142-set]').forEach(btn=>btn.addEventListener('click',()=>{
      const k=btn.dataset.v142Set; let v=btn.dataset.v142Val; if(/^-?\d+(\.\d+)?$/.test(v))v=Number(v);
      setPath(t,k,v); v142Normalize(t,k); v142Commit(t);
    }));
    inspector.querySelectorAll('[data-v142-clear]').forEach(btn=>btn.addEventListener('click',()=>{ delete t[btn.dataset.v142Clear]; v142Commit(t); }));
    inspector.querySelectorAll('[data-v142-grad]').forEach(btn=>btn.addEventListener('click',()=>{ const g=V142_GRADS[Number(btn.dataset.v142Grad)]; if(!g)return; t.bgxType='gradient'; t.bgxGT='linear'; t.bgxG1=g[0]; t.bgxG2=g[1]; t.bgxA=g[2]; delete t.bgxG3; v142Commit(t); }));
    inspector.querySelectorAll('[data-bind]').forEach(el=>{
      const k=el.dataset.bind;
      if(/^bd[WC]$/.test(k)||k==='bdR') el.addEventListener('input',()=>{ v142Normalize(t,k); });
      if(V142_RR.has(k)&&(el.type==='checkbox'||el.tagName==='SELECT')) el.addEventListener('change',()=>{ v142Normalize(t,k); setTimeout(()=>updateInspector(),0); });
    });
    inspector.querySelectorAll('.v142-copt input[data-bind]').forEach(el=>el.addEventListener('input',()=>{ el.closest('.v142-copt')?.classList.toggle('is-empty',!el.value); }));
  }
  /* بوم ویرایش: کانتینرها با سطح ویرایشی خودشان کشیده می‌شوند (نه رندرر مشترک)،
     پس همان CSS مشترک را روی سطح ویرایشی‌شان می‌گذاریم تا بوم = سایت. */
  function v142EditorFx(b,host,wrap){
    try{
      const WR=window.WidgetRenderer; if(!WR||!WR.fxCss||!host)return;
      const id=String(b.id||'').replace(/[^a-zA-Z0-9_-]/g,''); if(!id)return;
      const cls='rvx-e-'+id; host.classList.add(cls);
      const css=WR.fxCss(b,'.'+cls,{surface:''}); if(!css)return;
      const st=document.createElement('style'); st.textContent=css; wrap.appendChild(st);
      const vt=WR.fxVideoTag&&WR.fxVideoTag(b); if(vt)host.insertAdjacentHTML('afterbegin',vt);
    }catch(err){ console.warn('V142 editor fx',err); }
  }

  function updateInspector(){ updateInspectorCore(); try{ v142Accordion(selectedId?find(selectedId)?.b:null); }catch(err){ console.warn('V142 accordion',err); } }
  /* V158 — «فونت متن»: کارت آکاردئونی در تب محتوا برای هر عنصری که متن دارد
     ولی ویرایشگر اصلی متن (با فونت) ندارد. فونت روی ریشهٔ عنصر می‌نشیند و همهٔ
     متن‌های داخلش ارث می‌برند؛ فونت بخشی که داخل ویرایشگرهای کوچک داده شده برنده است. */
  const FONT_PANEL_SKIP=new Set(['custom','text','heading','header','footer','section','columns','group','stickySection','stickyColumn','popupSection','anywhereSection','spacer','divider','image','video','audio','embed','scrollPoint','icon','latestElements']);
  function fontPanelFor(t,html){
    if(!t||FONT_PANEL_SKIP.has(t.type))return '';
    if(String(html||'').includes('data-rte-font'))return '';
    const cur=t.fontFamily&&t.fontFamily!=='system-ui'?t.fontFamily:'';
    const lbl=cur?(((window.RAVA_FONTS||[]).find(f=>f.id===cur)||{}).label||cur):'پیش‌فرض سایت';
    return chl(`<span class="v142-ico">Aa</span>فونت متن <small class="rava-font-panel__cur">${esc(lbl)}</small>`,
      `${fontSelectField('فونت همهٔ متن‌های این عنصر','fontFamily',cur||'system-ui')}<div class="helper">با بردن موس روی هر فونت، پیش‌نمایشش را روی خود عنصر می‌بینی؛ با کلیک ثبت می‌شود. فونتی که داخل ویرایشگر روی بخشی از متن گذاشته‌ای اولویت دارد.</div>`);
  }
  function updateInspectorCore(){
    if(activeTab!=='content'&&activeTab!=='advanced')activeTab='design'; /* V143 — سه تب: محتوا / استایل / پیشرفته */
    selectedName.textContent=selectedId?(labels[find(selectedId)?.b.type]||'عنصر'):'صفحه'; inspector.innerHTML=''; const t=selectedId?find(selectedId)?.b:null; if(!t){pageInspector();return;}
    const body=document.createElement('div');
    const pick=()=>{}; /* V200 — legacy #pickMedia hook (never rendered; called an undefined chooseMediaInto). Media fields use the shared picker ([data-media-open]). */
    if(t.type==='header'||t.type==='footer'){
      if(activeTab==='content')body.innerHTML=contentFields(t);
      if(activeTab==='design')body.innerHTML=(t.type==='header'?shellHeaderDesignFields(t):shellFooterDesignFields(t))+shellSpacingFields(t);
      if(activeTab==='advanced')body.innerHTML=shellAdvancedFields(t,t.type);
      inspector.appendChild(body); bindFields(); bindRichEditor(); bindRichFields(); initFontPickers(); shellBindExtras(); pick('logoUrl'); return;
    }
    if(V142_TYPES.has(t.type)){
      body.innerHTML=activeTab==='content'?(h=>h+fontPanelFor(t,h))(v142Content(t)):activeTab==='advanced'?v142Advanced(t):v142Style(t);
      inspector.appendChild(body); bindFields(); bindRichEditor(); bindRichFields(); initFontPickers(); pick('src'); v142Bind(t); bindSizeCard(); return;
    }
    if(activeTab==='content'){ const h=contentFields(t); body.innerHTML=h+fontPanelFor(t,h); }
    if(activeTab==='design')body.innerHTML=styleFields(t)+spacingFields(t);
    if(activeTab==='advanced')body.innerHTML=advancedFields(t);
    inspector.appendChild(body); bindFields(); bindRichEditor(); bindRichFields(); initFontPickers(); pick('src'); bindSizeCard();
  }

  /* V104 - sub-page context helpers */
  function subCtx(){ return (window.BUILDER_CONTEXT&&window.BUILDER_CONTEXT.type==='subpage')?window.BUILDER_CONTEXT:null; }
  let spBackup=null, subActive=false;
  window.__openSubInBuilder=function(i){
    const subs=state.subPages=Array.isArray(state.subPages)?state.subPages:[];
    if(!subs[i])return;
    if(subActive&&subCtx()&&subCtx().path===subs[i].path)return;
    if(subActive){const prev=subs.find(x=>x.path===(subCtx()&&subCtx().path));if(prev)prev.blocks=state.blocks;state.blocks=spBackup||state.blocks;spBackup=null;subActive=false;}
    spBackup=state.blocks;
    state.blocks=Array.isArray(subs[i].blocks)?subs[i].blocks:[];
    subActive=true;selectedId=null;
    try{snapshot();renderAll();updateInspector();renderLayers();}catch(e){console.error(e);}
    showToast('ویرایش زیرصفحه: '+(subs[i].title||subs[i].path||''));
  };
  window.__backToProductInBuilder=function(){
    if(!subActive)return;
    const subs=state.subPages=Array.isArray(state.subPages)?state.subPages:[];
    const cur=subs.find(x=>x.path===(subCtx()&&subCtx().path));
    if(cur)cur.blocks=state.blocks;
    state.blocks=spBackup||state.blocks;spBackup=null;subActive=false;selectedId=null;
    try{snapshot();renderAll();updateInspector();renderLayers();}catch(e){console.error(e);}
    showToast('بازگشت به صفحه محصول');
  };
  function subPageSelectField(label,key,val){ const subs=Array.isArray(state.subPages)?state.subPages:[]; if(!subs.length) return '<div class="helper">هنوز زیرصفحه‌ای نساخته‌ای — از دکمه ⑂ در نوار بالا بساز.</div>'; const opts=subs.map(s=>[String(s.path||''),(s.title||s.path||'')]); if(val&&!opts.some(o=>o[0]===val)) opts.unshift([val,val+' (مسیر فعلی)']); return selectField(label,key,val||'',opts); }
  function setPath(obj,path,val){ const parts=path.split('.');let o=obj;for(let i=0;i<parts.length-1;i++){if(o[parts[i]]==null)o[parts[i]]={};o=o[parts[i]];}o[parts[parts.length-1]]=val; }
  function getTarget(key){ return key.startsWith('landing.')?state:(selectedId?find(selectedId)?.b:state); }
  function applyBind(key,val){ const target=getTarget(key); if(!target)return;setPath(target,key,val); if(key==='text' && target.type==='text' && !target.html)target.html=plainToHtml(val); snapshot(); scheduleCanvasRender(); renderLayers(); if(selectedId){updateInspector();preserveFieldFocus();} }
  function preserveFieldFocus(){ /* Inspector updates only for committed select/checkbox changes; text fields remain handled via direct event without full rebuild. */ }
  /* V250 — کپی لنگر/آدرس از اینسپکتور */
  document.addEventListener('click',e=>{ const b=e.target.closest&&e.target.closest('[data-v250-copy]'); if(!b)return; e.preventDefault(); const t=b.dataset.v250Copy||''; try{ navigator.clipboard.writeText(t).then(()=>showToast('کپی شد: '+t),()=>showToast(t)); }catch(_){ showToast(t); } });
  function bindFields(){
    /* V108 — Visibility selects (single source for show/hide flags) */
    const syncVis=(sel,mob)=>{const v=sel.value==='hidden';if(mob){setPath(getTarget('hideMobile'),'hideMobile',v);setPath(getTarget('showOnMobile'),'showOnMobile',!v);}else{setPath(getTarget('hideDesktop'),'hideDesktop',v);setPath(getTarget('showOnDesktop'),'showOnDesktop',!v);}snapshot();renderAll();};
    inspector.querySelectorAll('[data-bind="_mobileVis"],[data-bind="_desktopVis"]').forEach(sel=>{sel.addEventListener('change',()=>{try{syncVis(sel,sel.dataset.bind==='_mobileVis');}catch(err){console.warn('visibility sync failed',err);}});});
    /* V133 — هدر/فوتر: سه تیک نمایش دسکتاپ/تبلت/موبایل → کلیدهای hideDesktop/hideTablet/hideMobile */
    inspector.querySelectorAll('[data-bind="showDesktop"],[data-bind="showTablet"],[data-bind="showMobile"]').forEach(cb=>cb.addEventListener('change',()=>{
      const f=find(selectedId)?.b;if(!f)return; /* V250 — برای همهٔ عناصر (قبلاً فقط هدر/فوتر) */
      const map={showDesktop:'hideDesktop',showTablet:'hideTablet',showMobile:'hideMobile'};
      const k=map[cb.dataset.bind];if(k)f[k]=!cb.checked;
      if(cb.dataset.bind==='showMobile')f.showOnMobile=cb.checked; if(cb.dataset.bind==='showDesktop')f.showOnDesktop=cb.checked;
      if(f.type!=='header'&&f.type!=='footer'&&f.hideDesktop===true&&f.hideTablet===true&&f.hideMobile===true) showToast('این عنصر الان در هیچ دستگاهی نمایش داده نمی‌شود');
      snapshot();scheduleSave();if(f.type==='header'||f.type==='footer')scheduleCanvasRender();else renderAll();
    }));
    inspector.querySelectorAll('[data-bind]').forEach(el=>{
      const handler=(ev)=>{
        let v=el.type==='checkbox'?el.checked:el.value;if(['number','range'].includes(el.type))v=Number(v);
        const key=el.dataset.bind;const target=getTarget(key);if(!target)return;
        if(key==='overlayOpacityPct'||key==='landing.overlayOpacityPct'){v=Math.max(0,Math.min(100,Number(v)));setPath(target,key,v);setPath(target,key.replace(/Pct$/,''),v/100);}
        else if(target.type==='columns' && /^items\.\d+\.width$/.test(key)){const idx=Number(key.split('.')[1]);rebalanceColumnWidth(target,idx,v);}
        else if(target.type==='featureCompare' && key==='columns'){target.columns=String(v).split(',').map(x=>x.trim()).filter(Boolean);}
        else if(target.type==='featureCompare' && /^items\.\d+\.values$/.test(key)){const idx=Number(key.split('.')[1]);target.items[idx].values=String(v).split(',').map(x=>x.trim());}
        /* V121 — Upsell: اتصال آیتم به محصول؛ قیمت/عنوان/عکس خودکار پر می‌شوند و قیمت روی قیمتی که در /api/orders دوباره خوانده می‌شود قفل است */
        else if(target.type==='upsellBox' && /^items\.\d+\.productSlug$/.test(key)){
          const idx=Number(key.split('.')[1]); const item=target.items&&target.items[idx];
          if(item){
            const prod=(window.BUILDER_DATA&&Array.isArray(window.BUILDER_DATA.products))?window.BUILDER_DATA.products.find(pp=>pp.slug===v):null;
            if(prod){
              item.title=prod.title||prod.slug;
              if(!item.image&&prod.cardImage) item.image=prod.cardImage;
              item.price=String(prod.price??'0');
              showToast(`اتصال شد: ${prod.title} — قیمت ${prod.price??'0'} (در سایت همیشه قیمت فعلی محصول)`);
            }
            if(!v){ delete item.price; delete item.comparePrice; }
          }
          setPath(target,key,v);scheduleSave();scheduleCanvasRender();if(ev.type==='change')setTimeout(()=>updateInspector(),0);return;
        }
        /* V99.2 — newline-list textareas for premium elements */
        else if(target.type==='forWho' && key==='yesItemsText'){target.yesItems=String(v).split('\n').map(x=>x.trim()).filter(Boolean);}
        else if(target.type==='forWho' && key==='noItemsText'){target.noItems=String(v).split('\n').map(x=>x.trim()).filter(Boolean);}
        else if(target.type==='instructor' && key==='credsText'){target.creds=String(v).split('\n').map(x=>x.trim()).filter(Boolean);}
        else if(target.type==='curriculum' && /^modules\.\d+\.lessonsText$/.test(key)){const idx=Number(key.split('.')[1]);if(target.modules&&target.modules[idx])target.modules[idx].lessons=String(v).split('\n').map(x=>x.trim()).filter(Boolean);}
        else if(target.type==='icon' && /^icons\.\d+\.iconUrl$/.test(key)){ const it=target.icons&&target.icons[Number(key.split('.')[1])]; if(it){ it.iconUrl=String(v||'').trim(); if(it.iconUrl){ delete it.iconSvg; delete it.iconify; delete it.iconPalette; it.icon=''; } } if(ev.type==='change')setTimeout(()=>updateInspector(),0); }
        else{setPath(target,key,v);}
        if(key==='text'&&target.type==='text'&&!target.html)target.html=plainToHtml(v);
        /* V250 — تغییر حالت تصویر: عکس فعلی اولین اسلاید/آیتم می‌شود (قبلاً گالری خالی می‌ماند) */
        if(key==='imageMode'&&target.type==='image'&&ev.type==='change'){
          if(v!=='single'){ if(!Array.isArray(target.images))target.images=[]; if(!target.images.some(x=>x&&x.src)&&target.src) target.images.unshift({src:target.src,alt:target.alt||'',fit:'cover'}); while(target.images.length<2) target.images.push({src:'',alt:'',fit:'cover'}); }
          else if(!target.src&&Array.isArray(target.images)){ const first=target.images.find(x=>x&&x.src); if(first){ target.src=first.src; if(!target.alt)target.alt=first.alt||''; } }
        }
        if(key==='domId'){ const clean=String(v||'').trim().replace(/^#/,'').replace(/\s+/g,'-'); if(clean!==v) setPath(target,'domId',clean); }
        /* V132 — انیمیشن: تغییر نوع/مدت/تأخیر همان لحظه روی data-* عنصر بوم می‌نشیند تا Replay درست باشد */
        if(/^animation(Type|Duration|Delay|Intensity|Threshold|Replayable)$/.test(key)){
          const node=canvas.querySelector(`.builder-node[data-id="${target.id}"]`);
          const el=node?node.querySelector('[data-rva-anim]')||node:null;
          if(el){
            if(key==='animationType'){ if(v==='none'){el.removeAttribute('data-rva-anim');window.RAVA_ANIMATIONS&&window.RAVA_ANIMATIONS.cleanup(el);} else el.setAttribute('data-rva-anim','1'); }
            if(key==='animationDuration')el.dataset.rvaDuration=String(Number(v)||1);
            if(key==='animationDelay')el.dataset.rvaDelay=String(Number(v)||0);
            if(key==='animationIntensity')el.dataset.rvaIntensity=v;
            if(key==='animationThreshold')el.dataset.rvaThreshold=v;
            if(key==='animationReplayable')el.dataset.rvaReplayable=(v===true||v==='true')?'1':'0';
          }
          if(key==='animationType'&&ev.type==='change'){ setTimeout(()=>{updateAnimOutputs();replaySelectedAnimation();},180); }
          if(key==='animationDuration'||key==='animationDelay'){ updateAnimOutputs(); if(ev.type==='change')setTimeout(()=>replaySelectedAnimation(true),180); } /* V139 — بعد از رندر بوم پخش شود */
          /* V132.1 — خروجی Duration/Delay پسوند s دارد؛ هندلر سراسریِ اسلایدر آن را بازنویسی نکند */
          if((key==='animationDuration'||key==='animationDelay')&&ev.type==='input'){ setTimeout(updateAnimOutputs,0); }
        }
        /* V131 — Columns: تیک «کنار هم در موبایل (فشرده)» = stackMobile 'side' / 'stack' */
        if(key==='__colSide'&&target.type==='columns'){ delete target.__colSide; setPath(target,'stackMobile',v?'side':'stack'); }
        if(key==='count'&&target.type==='columns'){const count=Math.max(1,Math.min(6,Number(v)||2));target.items=target.items||[];while(target.items.length<count)target.items.push({id:uid(),width:100/count,blocks:[]});if(target.items.length>count)target.items.length=count;normalizeColumnWidths(target,true);}
        inspector.querySelectorAll(`[data-range-output="${key}"]`).forEach(o=>o.textContent=v);
        /* V131 — rebalance زندهٔ ستون‌ها: بقیهٔ اسلایدرها و درصد‌های همین پنل هم همان لحظه
           به‌روز می‌شوند (بدون از دست دادن فوکوسِ اسلایدرِ در حال کشیدن) و بوم هم رندر می‌شود. */
        if(target.type==='columns' && /^items\.\d+\.width$/.test(key)){
          const dragging=(ev.type==='input'&&el.type==='range');
          inspector.querySelectorAll('.column-repeater').forEach((row,i)=>{
            if(i>=target.items.length)return;
            const w=Math.round(n(target.items[i].width,100/(target.items.length||1)));
            const out=row.querySelector('output'); if(out)out.textContent=w+'٪';
            /* V131.1 — خروجی و اسلایدر/عددِ خودِ هر ردیف هم تازه شود */
            inspector.querySelectorAll(`[data-range-output="items.${i}.width"]`).forEach(o=>o.textContent=String(w));
            /* V139 — هم اسلایدر و هم باکس عددیِ همهٔ ستون‌ها (به‌جز همان کنترلی که کاربر در حال کشیدنش است) */
            row.querySelectorAll(`[data-bind="items.${i}.width"]`).forEach(ctrl=>{ if(ctrl===el)return; ctrl.value=String(w); });
          });
        }
        if(ev.type==='input'){if(!el.dataset.historyStarted){snapshot();el.dataset.historyStarted='1';}} else {delete el.dataset.historyStarted;}
        scheduleSave();scheduleCanvasRender();
        /* V250 — فیلدهایی که کارت را عوض می‌کنند (نمایش/پنهان شدن گزینه‌های وابسته) */
        if(ev.type==='change' && ((target.type==='image'&&['link','ratio','src','alt','captionPosition'].includes(key)) || (target.type==='button'&&['btnIcon','fullWidth','url'].includes(key)) || (target.type==='columns'&&key==='reverseMobile') || key==='domId')) setTimeout(()=>updateInspector(),0);
        if(((key==='count' && target.type==='columns')||(key==='__colSide' && target.type==='columns')||(key==='dir' && target.type==='columns')||(key==='embedHeightMode' && target.type==='embed')||(key==='backgroundType' && (target.type==='section'||target.type==='popupSection'))||(key==='sectionHeight' && (target.type==='section'||target.type==='popupSection'))||(key==='imageMode' && target.type==='image')||(key==='gradient' && target.type==='button')||(key==='target' && (target.type==='stickyCta'||target.type==='buyButton'||target.type==='stickyButton'))||(key==='linkKind' && target.type==='button')||((key==='gradient'||key==='variant'||key==='pill'||key==='showIcon'||key==='showBadge') && target.type==='stickyButton')||(key==='frameMode' && (target.type==='icon'||target.type==='iconRow'))||key==='iconsEnabled'||(target.type==='icon'&&/^icons\.\d+\.(strokeOn|noFill|tint|newTab|url|color|strokeColor|strokeWidth)$/.test(key))||key==='fxGrad'||key==='frame.fxGrad'||key==='fxBg'||key==='fxStroke'||key==='fxFrame'||key==='icon'||key==='__spV'||key==='__spH'||key==='marginTop'||key==='marginBottom'
          ||(key==='logoType'&&target.type==='header')||(key==='bgMode'&&target.type==='header')||(key==='mobileMenu'&&target.type==='header')||(key==='ctaEnabled'&&target.type==='header')||(key==='langEnabled'&&target.type==='header')||(key==='searchEnabled'&&target.type==='header')||(key==='cartEnabled'&&target.type==='header')||(key==='bgType'&&target.type==='footer')||(key==='divider'&&target.type==='footer')||(key==='newsletterEnabled'&&target.type==='footer')||(key==='socialEnabled'&&target.type==='footer')||(key==='colsLayout'&&target.type==='footer')||(key==='footerHeight'&&target.type==='footer')||(/^nav\.\d+\.linkKind$/.test(key))
        ) && ev.type==='change'){ setTimeout(()=>updateInspector(),0); }
        /* V122 — پریست‌های صوت: مقادیر پیش‌فرض هر پریست را یک‌جا می‌نویسد */
        if(key==='audioVariant' && target.type==='audio' && ev.type==='change'){
          const presets={
            default:{bg:'#F7F7FB',borderColor:'#EAECF0',radius:999,audioAccent:'#7C3AED',audioAccent2:'#4F46E5',titleColor:'#101828',padY:12,padX:16},
            podcast:{bg:'#FFF6EC',borderColor:'#F5E0C8',radius:24,audioAccent:'#EA580C',audioAccent2:'#F59E0B',titleColor:'#271A10',padY:18,padX:20},
            seminar:{bg:'#0B1220',borderColor:'#24304A',radius:24,audioAccent:'#8B5CF6',audioAccent2:'#D946EF',titleColor:'#F8FAFC',padY:18,padX:20}
          };
          const pr=presets[v]||presets.default;
          Object.assign(target,pr);
        }
        /* V133 — کلید فعال/خاموش هدر/فوتر: خاموشی در بوم ادیتور، راهنمای «هدر خاموش» را نشان می‌دهد */
        if(key==='enabled'&&(target.type==='header'||target.type==='footer')&&ev.type==='change'){ setTimeout(()=>updateInspector(),0); }
        /* V115 — اسلایدرهای ترکیبی فاصله‌گذاری: بالا و پایین (یا چپ و راست) را باهم تنظیم می‌کنند */
        if(key==='__spV'){ const half=Math.round(Number(v)||0)/2; target.padTop=half; target.padBottom=half; }
        else if(key==='__spH'){ const half=Math.round(Number(v)||0)/2; target.padLeft=half; target.padRight=half; }
        /* V118 — حذف کلیدهای قدیمی padX/padY وقتی pad چهارطرفهٔ دقیق ذخیره می‌شود */
        if(target && typeof target==='object' && ['padTop','padBottom','padRight','padLeft'].includes(key)){ delete target.padX; delete target.padY; }
        if(target && typeof target==='object' && ['marginTop','marginBottom','marginRight','marginLeft'].includes(key)){ target[key]=Math.max(-40,Math.min(160,Math.round(Number(v)||0))); }
      };
      el.addEventListener('input',handler);el.addEventListener('change',handler);
    });
    /* V143 — device picker lives inside the responsive accordion. */
    inspector.querySelectorAll('[data-rsp-device]').forEach(btn=>btn.addEventListener('click',()=>{
      const f=find(selectedId)?.b;if(!f)return;
      f.responsive=f.responsive||{};f.responsive.device=btn.dataset.rspDevice||'desktop';
      updateInspector();
    }));
    inspector.querySelectorAll('[data-bind="responsive.enabled"]').forEach(cb=>cb.addEventListener('change',()=>{
      const f=find(selectedId)?.b;if(!f)return;
      f.responsive=f.responsive||{};f.responsive.enabled=!!cb.checked;
      snapshot();renderAll();
    }));
    /* V131 — Video: آکاردئون «نوع حاشیه» (ممتد / خط‌چین / نقطه‌چین) */
    inspector.querySelectorAll('[data-border-style]').forEach(btn=>btn.addEventListener('click',()=>{
      const f=find(selectedId)?.b;if(!f)return;
      f.borderStyle=btn.dataset.borderStyle;
      if(n(f.borderWidth,0)===0)f.borderWidth=2;
      inspector.querySelectorAll(`[data-border-style-on="${btn.dataset.borderStyleOn||'video'}"]`).forEach(x=>x.classList.toggle('on',x===btn));
      const cur=btn.closest('.font-accordion')?.querySelector('.font-accordion__cur');
      if(cur)cur.textContent=btn.dataset.borderStyle==='dashed'?'خط‌چین':btn.dataset.borderStyle==='dotted'?'نقطه‌چین':'خط ممتد';
      snapshot();scheduleSave();scheduleCanvasRender();
    }));
    /* V112 — پس‌زمینهٔ متن: سه تیک انحصاری (روشن‌کردن یکی، بقیه را خاموش می‌کند) */
    inspector.querySelectorAll('[data-fx-mode]').forEach(cb=>{
      cb.addEventListener('change',()=>{
        const b=getTarget('fxMode');if(!b||b===state)return;
        const mode=cb.dataset.fxMode;
        const on=cb.checked===true;
        const cur=b.fxMode||(b.fxGrad===true?'gradient':(b.fxStroke===true?'stroke':(b.fxBg===true?'solid':'')));
        if(on){ b.fxMode=mode; b.fxBg=mode==='solid'; b.fxGrad=mode==='gradient'; b.fxStroke=mode==='stroke'; }
        else if(cur===mode){ b.fxMode=''; b.fxBg=false; b.fxGrad=false; b.fxStroke=false; }
        snapshot();scheduleSave();scheduleCanvasRender();
        setTimeout(()=>updateInspector(),0);
      });
    });
    inspector.querySelectorAll('[data-color-for]').forEach(el=>el.addEventListener('input',()=>{
      const key=el.dataset.colorFor;
      const txt=[...inspector.querySelectorAll('[data-bind]')].find(x=>x.dataset.bind===key);
      if(!txt)return;
      txt.value=normalizeColorValue(el.value);
      /* Dispatch through the existing single source of truth. Do not rebuild the
         inspector here, otherwise the native picker loses its current value. */
      txt.dispatchEvent(new Event('input',{bubbles:true}));
    }));
    inspector.querySelectorAll('[data-array]').forEach(el=>el.addEventListener('input',()=>{const f=find(selectedId)?.b;if(!f)return;const arrName=el.dataset.array,idx=Number(el.dataset.index),key=el.dataset.key;const arr=f[arrName];if(!arr||!arr[idx])return;arr[idx][key]=el.value;scheduleSave();scheduleCanvasRender();renderLayers();}));
    /* V133 — ریپیترهای هدر/فوتر: آگاه از گروه (data-gi) و کلید آرایه؛ انواع شل حتی بدون gi مسیر درست می‌روند */
    const SHELL_REP={headerNav:1,headerSub:1,footerGroups:1,footerLink:1,footerSocials:1,footerBottom:1};
    inspector.querySelectorAll('[data-add-item]').forEach(btn=>btn.addEventListener('click',()=>{ if(SHELL_REP[btn.dataset.addItem]){ addShellRepeater(btn.dataset.addItem,Number(btn.dataset.gi||-1)); return; } addRepeater(btn.dataset.addItem); }));
    inspector.querySelectorAll('[data-remove-item]').forEach(btn=>btn.addEventListener('click',()=>{ if(SHELL_REP[btn.dataset.removeItem]){ removeShellRepeater(btn.dataset.removeItem,Number(btn.dataset.gi||-1),Number(btn.dataset.index)); return; } removeRepeater(btn.dataset.removeItem,Number(btn.dataset.index)); }));        /* V112.1 — per-icon tint: show/hide color picker + live canvas update */
        inspector.querySelectorAll('[data-bind^="icons."][data-bind$=".tint"]').forEach(cb=>cb.addEventListener('change',()=>{snapshot();scheduleCanvasRender();setTimeout(()=>updateInspector(),0);}));
        /* V114 — merged Icon: switching mode (single ⇄ strip) rebuilds the icons array,
           preserving the current single icon as the first chip. */
        inspector.querySelectorAll('[data-bind="iconsEnabled"]').forEach(sel=>sel.addEventListener('change',()=>{
          const f=find(selectedId)?.b;if(!f||f.type!=='icon')return;
          if(sel.value==='strip'){ if(!Array.isArray(f.icons)||!f.icons.length) f.icons=[{icon:f.icon||'🔥'},{icon:'⭐'},{icon:'⚡'}]; }
          else { const first=(Array.isArray(f.icons)?f.icons:[])[0]; if(first){f.icon=first.icon||f.icon||'✦';f.iconUrl=first.iconUrl||'';} delete f.icons; }
          snapshot();scheduleSave();scheduleCanvasRender();setTimeout(()=>updateInspector(),0);
        }));
        /* V114 — Scroll Point: کپی آدرس لنگر */
        inspector.querySelectorAll('[data-copy-sp]').forEach(btn=>btn.addEventListener('click',()=>{try{navigator.clipboard.writeText(btn.dataset.copySp);showToast('آدرس کپی شد: '+btn.dataset.copySp);}catch(_){window.prompt('آدرس لنگر:',btn.dataset.copySp);}}));
        inspector.querySelectorAll('[data-icon-pick]').forEach(btn=>btn.addEventListener('click',()=>{const t=find(selectedId)?.b;if(!t)return;if(btn.dataset.iconIdx!==undefined){const i=Number(btn.dataset.iconIdx);if(Array.isArray(t.icons)&&t.icons[i]){t.icons[i].icon=btn.dataset.iconPick;const inp=inspector.querySelector('[data-bind="icons.'+i+'.icon"]');if(inp)inp.value=btn.dataset.iconPick;snapshot();scheduleCanvasRender();}return;}t.icon=btn.dataset.iconPick;const inputEl=inspector.querySelector('[data-bind="icon"]');if(inputEl)inputEl.value=t.icon;scheduleSave();scheduleCanvasRender();}));
    inspector.querySelectorAll('[data-rep-up],[data-rep-down],[data-rep-dup]').forEach(btn=>btn.addEventListener('click',()=>{
      const kind=btn.dataset.repUp||btn.dataset.repDown||btn.dataset.repDup; const idx=Number(btn.dataset.index); const arr=repArr(kind); if(!Array.isArray(arr)||!arr[idx])return;
      if(btn.dataset.repDup){ const copy=JSON.parse(JSON.stringify(arr[idx])); if(copy&&copy.id)copy.id=uid(); arr.splice(idx+1,0,copy); }
      else if(btn.dataset.repUp&&idx>0){ const t=arr[idx-1];arr[idx-1]=arr[idx];arr[idx]=t; }
      else if(btn.dataset.repDown&&idx<arr.length-1){ const t=arr[idx+1];arr[idx+1]=arr[idx];arr[idx]=t; }
      snapshot(); scheduleCanvasRender(); updateInspector();
    }));
    /* V111 — gradient stop editing (text fx + icon frame) */
    const gradArr=(pfx)=>{const f=find(selectedId)?.b;if(!f)return null;if(pfx==='fx')return f;const parts=pfx.split('.');let o=f;for(const k of parts){if(o==null)return null;o=o[k];}return o;};
    inspector.querySelectorAll('[data-grad-color]').forEach(el=>el.addEventListener('input',()=>{const pfx=el.dataset.gradColor;const a=gradArr(pfx);if(!a)return;if(!Array.isArray(a.gradStops)||a.gradStops.length<2){a.gradStops=[{c:a.bg||'#4F46E5',p:0},{c:a.grad2||a.gradient2||'#EC4899',p:100}];}const i=Number(el.dataset.gradIdx);if(!a.gradStops[i])return;a.gradStops[i].c=el.value;scheduleSave();scheduleCanvasRender();const bar=inspector.querySelector('.fx-card.open .grad-bar');if(bar){const st=a.gradStops.map(s2=>String(s2.c)+' '+Math.max(0,Math.min(100,Number(s2.p)||0))+'%').join(',');bar.style.background=`linear-gradient(${Number(a.fxAngle)||90}deg,${st})`;}}));
    inspector.querySelectorAll('[data-grad-pos]').forEach(el=>el.addEventListener('input',()=>{const pfx=el.dataset.gradPos;const a=gradArr(pfx);if(!a||!Array.isArray(a.gradStops))return;const i=Number(el.dataset.gradIdx);if(!a.gradStops[i])return;a.gradStops[i].p=Math.max(0,Math.min(100,Number(el.value)||0));scheduleSave();scheduleCanvasRender();const bar=inspector.querySelector('.fx-card.open .grad-bar');if(bar){const st=a.gradStops.map(s2=>String(s2.c)+' '+Math.max(0,Math.min(100,Number(s2.p)||0))+'%').join(',');bar.style.background=`linear-gradient(${Number(a.fxAngle)||90}deg,${st})`;}}));
    inspector.querySelectorAll('[data-grad-del]').forEach(el=>el.addEventListener('click',()=>{const pfx=el.dataset.gradDelarr;const a=gradArr(pfx);if(!a||!Array.isArray(a.gradStops)||a.gradStops.length<=2)return;a.gradStops.splice(Number(el.dataset.gradDel),1);snapshot();scheduleCanvasRender();updateInspector();}));
    inspector.querySelectorAll('[data-grad-add]').forEach(el=>el.addEventListener('click',()=>{const pfx=el.dataset.gradAdd;const a=gradArr(pfx);if(!a)return;if(!Array.isArray(a.gradStops)||a.gradStops.length<2){a.gradStops=[{c:a.bg||'#4F46E5',p:0},{c:a.grad2||a.gradient2||'#EC4899',p:100}];}const n2=a.gradStops.length;a.gradStops.push({c:'#8B5CF6',p:Math.min(100,Math.round(100*n2/(n2+1)))});a.gradStops.sort((x,y)=>(Number(x.p)||0)-(Number(y.p)||0));snapshot();scheduleCanvasRender();updateInspector();}));
    const currentBlock=find(selectedId)?.b;
    if(currentBlock&&['icon','feature'].includes(currentBlock.type)) iconBindCards();
    /* V111 — icon row: per-icon move/delete */
    inspector.querySelectorAll('[data-icon-move]').forEach(el=>el.addEventListener('click',()=>{const f=find(selectedId)?.b;if(!f||!Array.isArray(f.icons))return;const i=Number(el.dataset.iconMove),d=Number(el.dataset.iconDir);const j=i+d;if(j<0||j>=f.icons.length)return;const t=f.icons[i];f.icons[i]=f.icons[j];f.icons[j]=t;snapshot();scheduleCanvasRender();updateInspector();renderLayers();}));
    document.getElementById('sectionToColumns')?.addEventListener('click',()=>{ const s=find(selectedId)?.b; if(!s||s.type!=='section')return; const col={id:uid(),type:'columns',count:2,gap:18,items:[{id:uid(),width:50,blocks:s.blocks||[]},{id:uid(),width:50,blocks:[]}]};
      const entry=find(selectedId); const parent=entry?entry.parent:null;
      const host=parent?parent.blocks:(state.blocks||[]); const i=host.indexOf(s); if(i>=0)host[i]=col;
      snapshot(); renderAll(); select(col.id); showToast('سکشن به کالمن تبدیل شد — ستون‌ها را از Content تنظیم کن');
    });
    inspector.querySelectorAll('input.range').forEach(r=>{r.addEventListener('input',()=>{const key=r.dataset.bind;const num=inspector.querySelector(`input.range-number[data-bind=\"${key}\"]`);if(num)num.value=r.value;const out=inspector.querySelector(`[data-range-output=\"${key}\"]`);if(out)out.value??=r.value;});});
    inspector.querySelectorAll('input.range-number').forEach(nm=>{nm.addEventListener('input',()=>{const key=nm.dataset.bind;const r=inspector.querySelector(`input.range[data-bind=\"${key}\"]`);if(r)r.value=nm.value;const out=inspector.querySelector(`[data-range-output=\"${key}\"]`);if(out)out.textContent=nm.value;});});
    inspector.querySelector('#duplicateSelected')?.addEventListener('click',duplicateSelected);
    inspector.querySelector('#copySelected')?.addEventListener('click',copySelected);
    inspector.querySelector('#pasteSelected')?.addEventListener('click',pasteSelected);
    inspector.querySelector('#deleteSelected')?.addEventListener('click',deleteSelected);
    inspector.querySelector('#saveAsBlockBtn')?.addEventListener('click',saveAsBlock);
    inspector.querySelector('#groupSelected')?.addEventListener('click',groupSelected); inspector.querySelector('#ungroupSelected')?.addEventListener('click',ungroupSelected); inspector.querySelector('#multiDelete')?.addEventListener('click',deleteMulti); inspector.querySelector('[data-bind="multiAlign"]')?.addEventListener('change',e=>{if(e.target.value!=='none')alignSelected(e.target.value);});
    inspector.querySelector('[data-bind="multiGap"]')?.addEventListener('change',e=>{const gap=Math.max(0,Number(e.target.value)||0);[...selectedIds].forEach((id)=>{const f=find(id);if(f)f.b.marginBottom=gap;});snapshot();scheduleCanvasRender();renderLayers();});
    /* V115 — ریست فاصله‌گذاری */
    inspector.querySelector('#spReset')?.addEventListener('click',()=>{const f=find(selectedId)?.b;if(!f)return;['marginTop','marginBottom','marginRight','marginLeft','padTop','padBottom','padRight','padLeft'].forEach(k=>delete f[k]);snapshot();scheduleCanvasRender();updateInspector();showToast('فاصله‌ها بازنشانی شد');});
    /* V118 — بعد از ذخیره به‌عنوان بلوک، لیست «الگوهای شما» در پنل چپ تازه‌سازی می‌شود */
    inspector.querySelector('#saveAsBlockBtn')?.addEventListener('click',()=>setTimeout(()=>showLeftTabNow('presets'),400));
  }
  const richSelections = new Map();
  const richSizeMap = {'10px':'1','12px':'2','14px':'3','16px':'4','20px':'5','28px':'6','40px':'7'};
  function rememberRichSelection(ed){
    if(!ed)return;
    const sel=window.getSelection(); if(!sel || !sel.rangeCount)return;
    const range=sel.getRangeAt(0); if(!ed.contains(range.commonAncestorContainer))return;
    richSelections.set(ed.dataset.richId,range.cloneRange());
  }
  function restoreRichSelection(ed){
    if(!ed)return;
    ed.focus(); const r=richSelections.get(ed.dataset.richId); if(!r)return;
    const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  function saveRichFieldValue(ed){
    const f=find(selectedId)?.b; if(!f)return; const path=ed.dataset.richPath; if(!path)return;
    setPath(f,path,ed.innerHTML); scheduleSave(); scheduleCanvasRender(); renderLayers();
  }
  /* ===== V144 — موتور استایل‌دهی بخشی از متن ===== */
  function rteRange(ed){
    const r=richSelections.get(ed.dataset.richId);
    if(!r||!ed.contains(r.startContainer)||!ed.contains(r.endContainer))return null;
    return r;
  }
  function rteHasSel(ed){ const r=rteRange(ed); return !!(r&&!r.collapsed&&r.toString().length>0); }
  function rteWholeRange(ed){ const r=document.createRange(); r.selectNodeContents(ed); return r; }
  function rteTextNodes(ed,range){
    const out=[]; const w=document.createTreeWalker(ed,NodeFilter.SHOW_TEXT,null);
    let t; while((t=w.nextNode())){
      if(!range.intersectsNode(t))continue;
      let s=0,e=t.length;
      if(t===range.startContainer)s=range.startOffset;
      if(t===range.endContainer)e=range.endOffset;
      if(s>=e)continue;
      if(/^\s*$/.test(t.data.slice(s,e)) && t.parentNode===ed)continue;
      out.push({t,s,e});
    }
    return out;
  }
  /* هر تکه متن انتخاب‌شده را جدا و داخل span داخلی‌ترین می‌گذارد تا استایل جدید حتماً برنده باشد */
  function rteWrap(ed,range,apply){
    const parts=rteTextNodes(ed,range); const targets=[];
    parts.forEach(({t,s,e})=>{
      if(e<t.length)t.splitText(e);
      if(s>0)t=t.splitText(s);
      const p=t.parentNode; let el;
      /* Never reuse an existing styled span here. Reusing it makes a later
         selection mutate the first selection's font in the live preview and
         published HTML. Each selection gets its own override span, while
         inherited styles from the parent remain intact. */
      el=document.createElement('span'); p.insertBefore(el,t); el.appendChild(t);
      apply(el); targets.push(el);
    });
    if(targets.length){
      const nr=document.createRange(); nr.setStart(targets[0].firstChild||targets[0],0);
      const last=targets[targets.length-1]; const lt=last.lastChild||last; nr.setEnd(lt,lt.nodeType===3?lt.length:lt.childNodes.length);
      richSelections.set(ed.dataset.richId,nr); rteHighlight(ed);
    }
    return targets.length;
  }
  function rteCommit(ed){ ed.dispatchEvent(new Event('input',{bubbles:true})); }
  function rteInlineStyle(ed,styles,{whole=false}={}){
    const r=rteHasSel(ed)?rteRange(ed):(whole?rteWholeRange(ed):null); if(!r)return false;
    const n=rteWrap(ed,r,el=>Object.entries(styles).forEach(([k,v])=>{ if(v===''||v==null)el.style.removeProperty(k); else el.style.setProperty(k,v); }));
    rteCleanup(ed); if(n)rteCommit(ed); return n>0;
  }
  function rteCleanup(ed){
    ed.querySelectorAll('span').forEach(s=>{ if(!s.getAttribute('style'))s.removeAttribute('style'); if(!s.attributes.length&&!s.closest('a')){ /* span خالی از استایل را باز کن */ const cur=richSelections.get(ed.dataset.richId); if(cur&&(s.contains(cur.startContainer)||s.contains(cur.endContainer)))return; while(s.firstChild)s.parentNode.insertBefore(s.firstChild,s); s.remove(); } });
  }
  /* عنصری که خط زیر/رو را حمل می‌کند (u/s/strike/del یا span با text-decoration-line) */
  function rteDecoLines(el){
    const tag=el.tagName; const out=new Set();
    if(tag==='U'||tag==='INS')out.add('underline');
    if(tag==='S'||tag==='STRIKE'||tag==='DEL')out.add('line-through');
    const L=(el.style.textDecorationLine||el.style.textDecoration||'');
    if(/underline/.test(L))out.add('underline'); if(/line-through/.test(L))out.add('line-through');
    return out;
  }
  function rteDecoCarriers(ed,range,kind){
    const set=new Set();
    rteTextNodes(ed,range).forEach(({t})=>{ let el=t.parentNode; while(el&&el!==ed){ if(el.nodeType===1){ const L=rteDecoLines(el); if(L.has(kind))set.add(el); } el=el.parentNode; } });
    return [...set];
  }
  const rteDeco={underline:{color:'',style:'solid',thick:''},'line-through':{color:'',style:'solid',thick:''}};
  function rteApplyDeco(ed,kind,opts){
    Object.assign(rteDeco[kind],opts);
    const r=rteHasSel(ed)?rteRange(ed):rteWholeRange(ed);
    let els=rteDecoCarriers(ed,r,kind);
    const d=rteDeco[kind];
    els.forEach(el=>{ el.style.textDecorationColor=d.color||''; el.style.textDecorationStyle=d.style&&d.style!=='solid'?d.style:''; el.style.textDecorationThickness=d.thick?d.thick+'px':''; if(!el.getAttribute('style'))el.removeAttribute('style'); });
    const f=find(selectedId)?.b;
    /* زیرخط سطح عنصر (از تب استایل) */
    if(f&&!rteHasSel(ed)&&(f.decoration===kind)){ f.decorationColor=d.color||''; f.decorationStyle=d.style||'solid'; f.decorationThickness=d.thick||''; snapshot(); scheduleCanvasRender(); scheduleSave(); return true; }
    if(els.length){ rteCommit(ed); return true; }
    return false;
  }
  function rteHighlight(ed){
    try{
      if(!window.CSS||!CSS.highlights||typeof Highlight==='undefined')return;
      const r=rteRange(ed);
      if(r&&!r.collapsed&&document.activeElement!==ed) CSS.highlights.set('rava-rte-sel',new Highlight(r)); else CSS.highlights.delete('rava-rte-sel');
    }catch(_){}
  }
  /* مقدار فعلی یک ویژگی در محل انتخاب (اول استایل inline، بعد مقدار عنصر) */
  function rteInlineValue(ed,prop){
    const r=rteRange(ed); if(!r)return null;
    let el=r.startContainer; if(el.nodeType===3)el=el.parentNode;
    if(r.startContainer.nodeType===1&&r.startContainer.childNodes[r.startOffset]){ let c=r.startContainer.childNodes[r.startOffset]; while(c&&c.nodeType===1&&c.firstChild)c=c.firstChild; if(c)el=c.nodeType===3?c.parentNode:c; }
    while(el&&el!==ed){ if(el.nodeType===1&&el.style&&el.style.getPropertyValue(prop))return el.style.getPropertyValue(prop); el=el.parentNode; }
    return null;
  }
  document.addEventListener('selectionchange',()=>{ try{ const s=window.getSelection(); if(!s||!s.rangeCount)return; const r=s.getRangeAt(0); let n=r.commonAncestorContainer; if(n.nodeType===3)n=n.parentNode; const ed=n&&n.closest&&n.closest('[contenteditable="true"][data-rich-id]'); if(ed&&inspector.contains(ed))richSelections.set(ed.dataset.richId,r.cloneRange()); }catch(_){} });
  let rtePopEl=null;
  function rteClosePop(){ if(rtePopEl){ rtePopEl.remove(); rtePopEl=null; document.querySelectorAll('.rte2-btn.is-pop').forEach(x=>x.classList.remove('is-pop')); } }
  function rteOpenPop(anchor,html,bind){
    const was=anchor.classList.contains('is-pop'); rteClosePop(); if(was)return;
    const pop=document.createElement('div'); pop.className='rte2-pop'; pop.innerHTML=html; document.body.appendChild(pop); rtePopEl=pop; anchor.classList.add('is-pop');
    const a=anchor.getBoundingClientRect(); const w=pop.offsetWidth, h=pop.offsetHeight;
    let left=Math.min(window.innerWidth-w-10,Math.max(10,a.right-w)); let top=a.bottom+6; if(top+h>window.innerHeight-10)top=Math.max(10,a.top-h-6);
    pop.style.left=left+'px'; pop.style.top=top+'px';
    /* کلیک روی پاپ‌اور، انتخاب متن داخل ادیتور را از بین نمی‌برد */
    pop.addEventListener('pointerdown',e=>{ if(!e.target.closest('input,select'))e.preventDefault(); });
    bind(pop);
  }
  document.addEventListener('pointerdown',e=>{ if(rtePopEl&&!rtePopEl.contains(e.target)&&!e.target.closest('[data-rte-pop]'))rteClosePop(); },true);
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&rtePopEl)rteClosePop(); });
  window.addEventListener('resize',rteClosePop);
  function rteRecentColors(){
    try{
      const all=[];
      const raw=JSON.parse(localStorage.getItem('rava.rteRecentColors')||'[]');
      if(Array.isArray(raw))all.push(...raw);
      for(let i=0;i<10;i++){const slot=localStorage.getItem('rava.rteRecentColor.'+i);if(slot)all.push(slot);}
      const seen=new Set();
      return all.map(x=>String(x||'').trim().toUpperCase()).filter(x=>/^#[0-9A-F]{6,8}$/.test(x)&&!seen.has(x)&&seen.add(x)).slice(0,10);
    }catch(_){return[];}
  }
  function rteRememberColor(c){
    const value=String(c||'').trim().toUpperCase(); if(!/^#[0-9A-F]{6,8}$/.test(value))return;
    try{
      const merged=[value,...rteRecentColors().filter(x=>x!==value)].slice(0,10);
      localStorage.setItem('rava.rteRecentColors',JSON.stringify(merged));
      merged.forEach((x,i)=>localStorage.setItem('rava.rteRecentColor.'+i,x));
      for(let i=merged.length;i<10;i++)localStorage.removeItem('rava.rteRecentColor.'+i);
    }catch(_){}
  }
  function rteColorPopHtml(title,cur,allowNone){
    const hex=/^#[0-9a-fA-F]{6}$/.test(cur||'')?cur.slice(0,7):'#101828'; const alpha=/^#[0-9a-fA-F]{8}$/.test(cur||'')?parseInt(cur.slice(7),16)/255:1; const recent=rteRecentColors();
    return `<div class="rte2-pop__title">${title}</div><div class="rte2-pop__sub">رنگ‌های استفاده‌شده اخیراً</div>${recent.length?`<div class="rte2-sw-grid rte2-sw-grid--recent">${recent.map(c=>`<button type="button" class="rte2-sw${(cur||'').toLowerCase()===c.toLowerCase()?' is-on':''}" data-pop-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div>`:'<div class="rte2-recent-empty">بعد از انتخاب رنگ، اینجا ذخیره می‌شود</div>'}<div class="rte2-pop__sub">رنگ‌های آماده</div><div class="rte2-sw-grid">${RTE_SWATCHES.map(c=>`<button type="button" class="rte2-sw${(cur||'').toLowerCase()===c.toLowerCase()?' is-on':''}" data-pop-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div><div class="rte2-pop__row"><label class="rte2-native" title="رنگ دلخواه"><input type="color" data-pop-native value="${hex}"><span>دلخواه</span></label><input type="text" class="rte2-hex" data-pop-hex value="${attr(cur||'')}" placeholder="#101828" dir="ltr">${allowNone?'<button type="button" class="rte2-none" data-pop-color="">بدون رنگ</button>':''}</div><div class="rte2-opacity"><label>شفافیت رنگ <output data-pop-opacity-out>${Math.round(alpha*100)}٪</output></label><input type="range" min="0" max="100" value="${Math.round(alpha*100)}" data-pop-opacity></div>`;
  }
  function rteBindColorPop(pop,onPick){
    const opacity=()=>Number(pop.querySelector('[data-pop-opacity]')?.value??100);
    const withOpacity=c=>{if(!c)return c;const h=String(c).replace('#','');if(h.length===3)c='#'+h.split('').map(x=>x+x).join('');if(h.length>=6)return '#'+h.slice(0,6)+Math.round(opacity()*2.55).toString(16).padStart(2,'0').toUpperCase();return c;};
    pop.querySelectorAll('[data-pop-color]').forEach(b=>b.addEventListener('click',()=>{const c=withOpacity(b.dataset.popColor);rteRememberColor(c);onPick(c);rteClosePop();}));
    const nat=pop.querySelector('[data-pop-native]'); const hx=pop.querySelector('[data-pop-hex]');
    nat?.addEventListener('input',()=>{if(hx)hx.value=nat.value;const c=withOpacity(nat.value);rteRememberColor(c);onPick(c,true);});
    hx?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const v=hx.value.trim();if(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)){const c=withOpacity(v);rteRememberColor(c);onPick(c);rteClosePop();}}});
    pop.querySelector('[data-pop-opacity]')?.addEventListener('input',e=>{const out=pop.querySelector('[data-pop-opacity-out]');if(out)out.textContent=e.target.value+'٪';const base=(hx?.value||'#101828').trim();onPick(withOpacity(base),true);});
  }
  function runRichCommand(ed,cmd,value){
    /* V144 — اندازه/رنگ/هایلایت با موتور span (بدون از دست رفتن انتخاب و بدون دزدیدن فوکوس از color picker) */
    if(cmd==='fontSize'&&/px$/.test(String(value||''))){ rteInlineStyle(ed,{'font-size':value},{whole:true}); return; }
    if(cmd==='foreColor'){ rteInlineStyle(ed,{color:value},{whole:true}); return; }
    if(cmd==='hiliteColor'){ rteInlineStyle(ed,{'background-color':value},{whole:true}); return; }
    restoreRichSelection(ed);
    try{document.execCommand('styleWithCSS',false,true);}catch{}
    if(cmd==='fontSize') document.execCommand('fontSize',false,value);
    else if(cmd==='fontName') document.execCommand('fontName',false,value);
    else document.execCommand(cmd,false,value||null);
    normalizeFontTags(ed);
    rememberRichSelection(ed); saveRichFieldValue(ed);
  }
  function normalizeFontTags(root){
    root.querySelectorAll('font[size],font[face]').forEach(el=>{
      const span=document.createElement('span');
      if(el.getAttribute('size')){ const map={'1':'10px','2':'12px','3':'14px','4':'16px','5':'20px','6':'28px','7':'40px'}; span.style.fontSize=map[el.getAttribute('size')]||'16px'; }
      if(el.getAttribute('face')) span.style.fontFamily=el.getAttribute('face');
      while(el.firstChild) span.appendChild(el.firstChild); el.replaceWith(span);
    });
  }
  function bindRichFields(){
    inspector.querySelectorAll('[data-rich-id][data-rich-path]').forEach(ed=>{
      ed.addEventListener('input',()=>{rememberRichSelection(ed); saveRichFieldValue(ed);});
      ed.addEventListener('mouseup',()=>rememberRichSelection(ed));
      ed.addEventListener('keyup',()=>rememberRichSelection(ed));
      ed.addEventListener('focus',()=>rememberRichSelection(ed));
    });
    inspector.querySelectorAll('[data-rich-cmd]').forEach(btn=>btn.addEventListener('pointerdown',e=>{
      e.preventDefault();
      const ed=inspector.querySelector(`[data-rich-id="${btn.dataset.richId}"]`); if(!ed)return;
      const cmd=btn.dataset.richCmd;
      if(cmd==='createLink'){
        restoreRichSelection(ed); const url=window.prompt('Link URL','https://'); if(url)runRichCommand(ed,'createLink',url); else rememberRichSelection(ed);
      } else runRichCommand(ed,cmd,null);
    }));
    inspector.querySelectorAll('[data-rich-font]').forEach(sel=>sel.addEventListener('change',()=>{const ed=inspector.querySelector(`[data-rich-id="${sel.dataset.richFont}"]`); if(ed)runRichCommand(ed,'fontName',sel.value);}));
    /* V122 — اندازهٔ دلخواه px: اگر انتخاب متنی هست روی همان بخش (execCommand fontSize)،
       وگرنه اندازهٔ کل عنصر (size) عوض می‌شود. Enter هم اعمال می‌کند. */
    const applyRichPx=(ed,inp)=>{
      const px=Math.max(6,Math.min(300,Math.round(Number(inp.value)||16)));
      if(rteHasSel(ed)){ rteInlineStyle(ed,{'font-size':px+'px'}); }
      else { const f=find(selectedId)?.b; if(f){ if(!f.dataset)0; f.size=px; snapshot(); scheduleCanvasRender(); showToast('اندازهٔ عنصر: '+px+'px'); } }
      const cur=inspector.querySelector(`[data-font-cur="${ed.dataset.richId}"]`); if(cur)cur.textContent=(f=>((f&&f.fontFamily)||'system-ui')+' • '+px+'px')(find(selectedId)?.b);
    };
    inspector.querySelectorAll('[data-rich-px]').forEach(inp=>{
      inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const ed=inspector.querySelector(`[data-rich-id="${inp.dataset.richPx}"]`);if(ed)applyRichPx(ed,inp);}});
      inp.addEventListener('change',()=>{const ed=inspector.querySelector(`[data-rich-id="${inp.dataset.richPx}"]`);if(ed)applyRichPx(ed,inp);});
    });
    inspector.querySelectorAll('[data-rich-px-apply]').forEach(btn=>btn.addEventListener('click',()=>{const inp=inspector.querySelector(`[data-rich-px="${btn.dataset.richPxApply}"]`);const ed=inspector.querySelector(`[data-rich-id="${btn.dataset.richPxApply}"]`);if(inp&&ed)applyRichPx(ed,inp); else if(inp){const f=find(selectedId)?.b;if(f){f.size=Math.max(6,Math.min(300,Math.round(Number(inp.value)||16)));snapshot();scheduleCanvasRender();}}}));
    inspector.querySelectorAll('[data-rich-color]').forEach(inp=>inp.addEventListener('input',()=>{const ed=inspector.querySelector(`[data-rich-id="${inp.dataset.richColor}"]`); if(ed)runRichCommand(ed,'foreColor',inp.value);}));
    inspector.querySelectorAll('[data-rich-highlight]').forEach(inp=>inp.addEventListener('input',()=>{const ed=inspector.querySelector(`[data-rich-id="${inp.dataset.richHighlight}"]`); if(ed)runRichCommand(ed,'hiliteColor',inp.value);}));
    inspector.querySelectorAll('[data-nine-value]').forEach(btn=>btn.addEventListener('click',()=>{const f=find(selectedId)?.b;if(!f)return;setPath(f,btn.dataset.ninePath,btn.dataset.nineValue);snapshot();scheduleCanvasRender();updateInspector();}));
    inspector.querySelectorAll('[data-column-active]').forEach(btn=>btn.addEventListener('click',()=>{const f=find(selectedId)?.b;if(!f||f.type!=='columns')return;f.activeColumn=Number(btn.dataset.columnActive);scheduleCanvasRender();showToast(`ستون ${f.activeColumn+1} فعال شد`);}));
    const colRefresh=(f,msg)=>{ f.count=(f.items||[]).length; snapshot(); scheduleSave(); renderAll(); select(f.id); if(msg)showToast(msg); };
    inspector.querySelector('[data-column-add]')?.addEventListener('click',()=>{
      const f=find(selectedId)?.b; if(!f||f.type!=='columns')return; f.items=Array.isArray(f.items)?f.items:[]; if(f.items.length>=6)return;
      const ord=colOrder(f); f.items.push({id:uid(),width:0,blocks:[]}); ord.push(f.items.length); setColOrder(f,ord);
      rebalanceColumnWidth(f,f.items.length-1,Math.round(100/f.items.length)); colRefresh(f,`ستون ${f.items.length} اضافه شد`);
    });
    inspector.querySelectorAll('[data-column-del]').forEach(btn=>btn.addEventListener('click',()=>{
      const f=find(selectedId)?.b; if(!f||f.type!=='columns'||(f.items||[]).length<2)return; const i=Number(btn.dataset.columnDel);
      const ord=colOrder(f), removed=ord[i]; f.items.splice(i,1); ord.splice(i,1); setColOrder(f,ord.map(o=>o>removed?o-1:o)); normalizeColumnWidths(f,true); colRefresh(f,`ستون ${i+1} حذف شد`);
    }));
    inspector.querySelectorAll('[data-column-move]').forEach(btn=>btn.addEventListener('click',()=>{
      const f=find(selectedId)?.b; if(!f||f.type!=='columns')return; const i=Number(btn.dataset.columnIndex); const ord=colOrder(f); const rtl=(window.BUILDER_SITE_DIR==='rtl');
      const q=ord[i]+((btn.dataset.columnMove==='left')===rtl?1:-1); if(q<1||q>ord.length)return; const j=ord.indexOf(q); [ord[i],ord[j]]=[ord[j],ord[i]]; setColOrder(f,ord); colRefresh(f);
    }));
    inspector.querySelectorAll('[data-any-move]').forEach(btn=>btn.addEventListener('click',()=>{const f=find(selectedId)?.b;if(!f||f.type!=='anywhereSection')return;const d=btn.dataset.anyMove;const dx=d.includes('w')?-1:d.includes('e')?1:0;const dy=d.includes('n')?-1:d.includes('s')?1:0;f.offsetX=n(f.offsetX,0)+dx;f.offsetY=n(f.offsetY,0)+dy;snapshot();scheduleCanvasRender();updateInspector();}));
    /* V132 — کارت انیمیشن: Replay فوراً همان عنصر انتخاب‌شده روی بوم واقعی را پخش می‌کند */
    inspector.querySelector('#animReplayBtn')?.addEventListener('click',()=>{
      const f=find(selectedId)?.b;if(!f)return;
      replaySelectedAnimation();
    });
    /* Intensity (سه پله) و Threshold (سه پله) — خروجی زنده + بوم */
    inspector.querySelectorAll('[data-anim-inten]').forEach(r=>r.addEventListener('input',()=>{
      const f=find(selectedId)?.b;if(!f)return;
      const steps=['subtle','normal','strong'];
      f.animationIntensity=steps[Number(r.value)||0]||'normal';
      updateAnimOutputs();snapshot();scheduleSave();scheduleCanvasRender();setTimeout(()=>replaySelectedAnimation(true),180); /* V139 — بوم با شدت جدید رندر و پخش می‌شود */
    }));
    inspector.querySelectorAll('[data-anim-th]').forEach(r=>r.addEventListener('input',()=>{
      const f=find(selectedId)?.b;if(!f)return;
      const steps=['low','normal','high'];
      f.animationThreshold=steps[Number(r.value)||0]||'normal';
      updateAnimOutputs();snapshot();scheduleSave();
    }));
    inspector.querySelectorAll('[data-anim-replay]').forEach(cb=>cb.addEventListener('change',()=>{
      const f=find(selectedId)?.b;if(!f)return;
      f.animationReplayable=cb.checked;
      snapshot();scheduleSave();
      const node=canvas.querySelector(`.builder-node[data-id="${f.id}"] [data-rva-anim], .in-editor-preview [data-rva-anim]`);
      if(node){node.dataset.rvaReplayable=cb.checked?'1':'0';const io=node.__rvaIo;if(!cb.checked&&io){io.unobserve(node);node.__rvaIo=null;}}
    }));
  }
  /* V250 — چسباندن تمیز در همهٔ ویرایشگرهای متن: استایل/کلاس/فونت‌های Word و سایت‌ها
     حذف می‌شوند؛ فقط ساختار (پاراگراف، بولد، ایتالیک، زیرخط، لینک، لیست) می‌ماند.
     Ctrl+Shift+V = فقط متن ساده. Enter همیشه <p> می‌سازد (نه <div>). */
  let v250PlainPaste=false;
  document.addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey)&&e.shiftKey&&String(e.key).toLowerCase()==='v') v250PlainPaste=true; },true);
  document.addEventListener('focusin',e=>{ const ed=e.target&&e.target.closest&&e.target.closest('.rich-editor[contenteditable="true"]'); if(ed){ try{document.execCommand('defaultParagraphSeparator',false,'p');}catch(_){} } });
  function v250CleanPaste(html){
    const box=document.createElement('div'); box.innerHTML=html;
    box.querySelectorAll('script,style,meta,link,title,iframe,object,embed,svg,img,video,audio,form,input,button,select,textarea,o\\:p').forEach(x=>x.remove());
    const KEEP=new Set(['P','BR','B','STRONG','I','EM','U','S','STRIKE','A','UL','OL','LI','SUP','SUB','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','DIV','SPAN']);
    const walk=(el)=>{ [...el.children].forEach(c=>{ walk(c); if(!KEEP.has(c.tagName)){ c.replaceWith(...c.childNodes); return; }
      const href=c.tagName==='A'?(c.getAttribute('href')||''):''; [...c.attributes].forEach(a=>c.removeAttribute(a.name));
      if(c.tagName==='A'){ if(href&&!/^(javascript|vbscript|data):/i.test(href.replace(/\s+/g,''))) c.setAttribute('href',href); else c.replaceWith(...c.childNodes); }
      if(/^H[1-6]$|^DIV$|^BLOCKQUOTE$/.test(c.tagName)){ const p=document.createElement('p'); p.append(...c.childNodes); c.replaceWith(p); }
      if(c.tagName==='SPAN'){ c.replaceWith(...c.childNodes); } }); };
    walk(box);
    return box.innerHTML.replace(/<p>\s*<\/p>/g,'').replace(/(&nbsp;|\u00a0){2,}/g,' ');
  }
  document.addEventListener('paste',e=>{
    const ed=e.target&&e.target.closest&&e.target.closest('.rich-editor[contenteditable="true"]'); if(!ed)return;
    const cd=e.clipboardData; if(!cd)return;
    const html=cd.getData('text/html'), text=cd.getData('text/plain');
    e.preventDefault();
    try{
      if(html&&!v250PlainPaste) document.execCommand('insertHTML',false,v250CleanPaste(html));
      else document.execCommand('insertText',false,text||'');
    }catch(_){ document.execCommand('insertText',false,text||''); }
    v250PlainPaste=false;
    ed.dispatchEvent(new Event('input',{bubbles:true}));
  });
  function bindRichEditor(){
    const editor=document.getElementById('richTextEditor'); if(!editor)return;
    const root=inspector.querySelector('[data-rte-root="main-rich"]');
    const cur=()=>find(selectedId)?.b;
    const K=()=>rteKeys(cur());
    /* V144 — ذخیره متن بدون رندر کامل همزمان بوم (روان‌تر) */
    const saveRich=()=>{const f=cur();if(!f)return;if(!editor.dataset.historyStarted){snapshot();editor.dataset.historyStarted='1';}if(f.type==='button'){f.labelHtml=editor.innerHTML;f.label=editor.textContent||f.label;}else{f.html=editor.innerHTML;f.text=editor.textContent||'';}scheduleSave();scheduleCanvasRender();};
    editor.dataset.richId='main-rich';
    editor.addEventListener('input',saveRich);
    editor.addEventListener('focus',()=>{ try{CSS.highlights&&CSS.highlights.delete('rava-rte-sel');}catch(_){} });
    editor.addEventListener('blur',()=>rteHighlight(editor));
    if(!root)return; /* ویرایشگرهای قدیمی (اگر جایی مانده باشد) */
    const scope=root.querySelector('[data-rte-scope]');
    const setNum=(kind,v)=>{ const i=root.querySelector(`[data-rte-num="${kind}"]`); if(i&&document.activeElement!==i)i.value=v; };
    const refresh=()=>{
      const f=cur(); if(!f)return; const k=rteKeys(f); const sel=rteHasSel(editor);
      if(scope){ scope.classList.toggle('is-sel',sel); scope.querySelector('b').textContent=sel?'روی بخش انتخاب‌شده':'روی کل متن'; }
      const px=sel?parseFloat(rteInlineValue(editor,'font-size')||''):NaN; setNum('size',Number.isFinite(px)?Math.round(px*10)/10:(Number(f[k.size])||18));
      const ls=sel?parseFloat(rteInlineValue(editor,'letter-spacing')||''):NaN; setNum('letter',Number.isFinite(ls)?ls:(Number(f.letter)||0));
      setNum('line',Number(f.line)||1.9);
      const fam=(sel&&rteInlineValue(editor,'font-family'))||f.fontFamily||'system-ui'; const fs=root.querySelector('[data-rte-font]'); const famC=String(fam).split(',')[0].replace(/["']/g,'').trim(); if(fs&&document.activeElement!==fs&&[...fs.options].some(o=>o.value===famC))fs.value=famC;
      const w=(sel&&rteInlineValue(editor,'font-weight'))||f.weight||400; const ws=root.querySelector('[data-rte-weight]'); if(ws&&document.activeElement!==ws)ws.value=String(Math.round(Number(w)/100)*100||400);
      const c=(sel&&rteInlineValue(editor,'color'))||f[k.color]||'#101828'; const sw=root.querySelector('[data-rte-sw="color"]'); if(sw)sw.style.background=c;
      /* وضعیت فعال B/I/U/S */
      if(document.activeElement===editor){ ['bold','italic','underline','strikeThrough','superscript','subscript'].forEach(cmd=>{ let on=false; try{on=document.queryCommandState(cmd);}catch(_){} root.querySelector(`[data-rte-cmd="${cmd}"]`)?.classList.toggle('is-on',!!on); }); }
    };
    const onSel=()=>{ if(!document.body.contains(editor)){document.removeEventListener('selectionchange',onSel);return;} const s=window.getSelection(); if(!s||!s.rangeCount)return; const r=s.getRangeAt(0); if(!editor.contains(r.commonAncestorContainer))return; richSelections.set('main-rich',r.cloneRange()); refresh(); };
    document.addEventListener('selectionchange',onSel);
    richSelections.delete('main-rich');
    refresh();
    const elemSet=(key,val,msg)=>{ const f=cur(); if(!f)return; snapshot(); f[key]=val; scheduleSave(); scheduleCanvasRender(); if(msg)showToast(msg); refresh(); };
    /* فونت */
    root.querySelector('[data-rte-font]')?.addEventListener('change',e=>{ const fam=e.target.value; ensureFontLoaded(fam); if(rteHasSel(editor)){ rteInlineStyle(editor,{'font-family':`'${fam}', Vazirmatn, system-ui`}); showToast('فونت روی بخش انتخاب‌شده اعمال شد'); } else elemSet('fontFamily',fam); });
    root.querySelector('[data-rte-weight]')?.addEventListener('change',e=>{ const w=Number(e.target.value)||400; if(rteHasSel(editor))rteInlineStyle(editor,{'font-weight':String(w)}); else elemSet('weight',w); });
    /* استپرها: اندازه / فاصلهٔ حروف / ارتفاع خط */
    const lim={size:[6,300,1],letter:[-5,40,0.5],line:[0.05,4,0.05]};
    const applyStep=(kind,raw)=>{
      const [mn,mx,st]=lim[kind]; let v=Number(raw); if(!Number.isFinite(v))return; v=Math.max(mn,Math.min(mx,Math.round(v/st)*st)); v=Math.round(v*100)/100;
      const inp=root.querySelector(`[data-rte-num="${kind}"]`); if(inp)inp.value=v;
      const f=cur(); if(!f)return; const k=rteKeys(f);
      if(kind==='line'){ elemSet('line',v); return; }
      if(rteHasSel(editor)){ rteInlineStyle(editor,kind==='size'?{'font-size':v+'px'}:{'letter-spacing':v+'px'}); refresh(); }
      else elemSet(kind==='size'?k.size:'letter',v);
    };
    root.querySelectorAll('[data-rte-num]').forEach(inp=>{
      inp.addEventListener('change',()=>applyStep(inp.dataset.rteNum,inp.value));
      inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();applyStep(inp.dataset.rteNum,inp.value);} if(e.key==='ArrowUp'||e.key==='ArrowDown'){ e.preventDefault(); const st=lim[inp.dataset.rteNum][2]*(e.shiftKey?10:1); applyStep(inp.dataset.rteNum,Number(inp.value)+(e.key==='ArrowUp'?st:-st)); } });
      inp.addEventListener('wheel',e=>{ if(document.activeElement!==inp)return; e.preventDefault(); const st=lim[inp.dataset.rteNum][2]; applyStep(inp.dataset.rteNum,Number(inp.value)+(e.deltaY<0?st:-st)); },{passive:false});
    });
    const hold=(btn,kind,sign)=>{ let t1,t2; const step=()=>{ const inp=root.querySelector(`[data-rte-num="${kind}"]`); applyStep(kind,Number(inp.value)+sign*lim[kind][2]); };
      btn.addEventListener('pointerdown',e=>{ e.preventDefault(); step(); t1=setTimeout(()=>{t2=setInterval(step,70);},380); });
      const stop=()=>{clearTimeout(t1);clearInterval(t2);}; btn.addEventListener('pointerup',stop); btn.addEventListener('pointerleave',stop); btn.addEventListener('pointercancel',stop); };
    root.querySelectorAll('[data-rte-dec]').forEach(b=>hold(b,b.dataset.rteDec,-1));
    root.querySelectorAll('[data-rte-inc]').forEach(b=>hold(b,b.dataset.rteInc,1));
    /* فرمت‌ها: بدون انتخاب → کل متن */
    root.querySelectorAll('[data-rte-cmd]').forEach(btn=>btn.addEventListener('pointerdown',e=>{
      e.preventDefault(); const cmd=btn.dataset.rteCmd;
      const had=rteHasSel(editor);
      if(!had&&cmd!=='createLink'){ richSelections.set('main-rich',rteWholeRange(editor)); }
      if(cmd==='createLink'){
        if(!had){showToast('اول بخشی از متن را برای لینک انتخاب کن');return;}
        /* V250 — لینک: اعتبارسنجی، بدون javascript:، تب جدید برای لینک‌های بیرونی */
        const curA=(()=>{ const r=rteRange(editor); let nd=r&&r.commonAncestorContainer; if(nd&&nd.nodeType===3)nd=nd.parentNode; return nd&&nd.closest?nd.closest('a'):null; })();
        let url=window.prompt('آدرس لینک (https://… ، /مسیر ، #لنگر ، mailto: یا tel:)',curA?curA.getAttribute('href')||'https://':'https://'); if(url==null)return; url=url.trim(); if(!url||url==='https://')return;
        if(/^(javascript|vbscript|data):/i.test(url.replace(/\s+/g,''))){ showToast('این نوع لینک مجاز نیست'); return; }
        if(/^www\./i.test(url)) url='https://'+url;
        if(!/^(https?:|mailto:|tel:|\/|#|\?)/i.test(url)&&/^[^\s]+\.[a-z]{2,}(\/|$)/i.test(url)) url='https://'+url;
        const external=/^https?:\/\//i.test(url)&&!url.includes(location.host);
        const newTab=external?window.confirm('این لینک در تب جدید باز شود؟'):false;
        restoreRichSelection(editor); document.execCommand('createLink',false,url);
        editor.querySelectorAll('a').forEach(a=>{ if(a.getAttribute('href')!==url)return; if(newTab){ a.setAttribute('target','_blank'); a.setAttribute('rel','noopener'); } else { a.removeAttribute('target'); a.removeAttribute('rel'); } });
        rememberRichSelection(editor); rteCommit(editor); showToast('لینک اضافه شد'); return;
      }
      restoreRichSelection(editor);
      try{document.execCommand('styleWithCSS',false,cmd!=='underline'&&cmd!=='strikeThrough');}catch{}
      document.execCommand(cmd,false,null);
      normalizeFontTags(editor);
      if(cmd==='removeFormat'){ const r=rteRange(editor)||rteWholeRange(editor); rteTextNodes(editor,r).forEach(({t})=>{ let el=t.parentNode; while(el&&el!==editor){ if(el.tagName==='SPAN'&&el.style){ ['font-size','letter-spacing','font-family','font-weight','color','background-color','text-decoration','text-decoration-color','text-decoration-style','text-decoration-thickness'].forEach(p=>el.style.removeProperty(p)); } el=el.parentNode; } }); rteCleanup(editor); }
      /* زیرخط/خط‌خورده تازه، رنگ و نوع انتخاب‌شدهٔ قبلی را می‌گیرد */
      if((cmd==='underline'||cmd==='strikeThrough')){ const kind=cmd==='underline'?'underline':'line-through'; const d=rteDeco[kind]; if(d.color||d.style!=='solid'||d.thick){ const r=rteRange(editor); if(r)rteDecoCarriers(editor,r,kind).forEach(el=>{ el.style.textDecorationColor=d.color||''; el.style.textDecorationStyle=d.style!=='solid'?d.style:''; el.style.textDecorationThickness=d.thick?d.thick+'px':''; }); } }
      rememberRichSelection(editor);
      if(!had){ const s=window.getSelection(); s.collapseToEnd(); rememberRichSelection(editor); }
      rteCommit(editor); refresh();
    }));
    /* چینش و جهت (سطح عنصر) */
    root.querySelectorAll('[data-rte-align]').forEach(btn=>btn.addEventListener('click',()=>{
      const v=btn.dataset.rteAlign; editor.querySelectorAll('[style*="text-align"]').forEach(el=>el.style.removeProperty('text-align')); editor.querySelectorAll('[align]').forEach(el=>el.removeAttribute('align'));
      editor.style.textAlign=v; root.querySelectorAll('[data-rte-align]').forEach(x=>x.classList.toggle('is-on',x===btn));
      const f=cur(); if(!f)return; snapshot(); f.align=v; if(f.type==='button')f.labelHtml=editor.innerHTML; else f.html=editor.innerHTML; scheduleSave(); scheduleCanvasRender();
    }));
    root.querySelectorAll('[data-rte-dir]').forEach(btn=>btn.addEventListener('click',()=>{
      const f=cur(); if(!f)return; const v=(f.direction===btn.dataset.rteDir)?'auto':btn.dataset.rteDir;
      snapshot(); f.direction=v;
      /* تغییر جهت، چینش پیش‌فرض را هم منطقی می‌کند اگر کاربر قبلاً عوضش نکرده باشد */
      if(v==='ltr'&&(!f.align||f.align==='right')){ f.align='left'; }
      if(v==='rtl'&&f.align==='left'){ f.align='right'; }
      if(v==='auto')editor.removeAttribute('dir'); else editor.setAttribute('dir',v);
      editor.style.direction=v==='auto'?'':v; editor.style.textAlign=f.align||'';
      root.querySelectorAll('[data-rte-dir]').forEach(x=>x.classList.toggle('is-on',x.dataset.rteDir===v));
      root.querySelectorAll('[data-rte-align]').forEach(x=>x.classList.toggle('is-on',x.dataset.rteAlign===(f.align||'right')));
      scheduleSave(); scheduleCanvasRender(); showToast(v==='auto'?'جهت نوشتار: خودکار':v==='rtl'?'راست‌به‌چپ':'چپ‌به‌راست');
    }));
    /* پاپ‌اورهای رنگ */
    let colorSnap=false,colorSnapT=0;
    root.querySelectorAll('[data-rte-pop]').forEach(btn=>btn.addEventListener('pointerdown',e=>{
      e.preventDefault(); const kind=btn.dataset.rtePop; const f=cur(); if(!f)return; const k=rteKeys(f);
      if(kind==='color'){
        const now=(rteHasSel(editor)&&rteInlineValue(editor,'color'))||f[k.color]||'#101828';
        rteOpenPop(btn,rteColorPopHtml(rteHasSel(editor)?'رنگ بخش انتخاب‌شده':'رنگ کل متن',now,false),pop=>rteBindColorPop(pop,(c,live)=>{
          if(rteHasSel(editor)){ rteInlineStyle(editor,{color:c}); }
          else { const ff=cur(); if(!ff)return; if(!live||!colorSnap){snapshot();colorSnap=true;clearTimeout(colorSnapT);colorSnapT=setTimeout(()=>{colorSnap=false;},900);} ff[k.color]=c; scheduleSave(); scheduleCanvasRender(); }
          const sw=root.querySelector('[data-rte-sw="color"]'); if(sw)sw.style.background=c;
        }));
      }
      if(kind==='highlight'){
        const now=(rteHasSel(editor)&&rteInlineValue(editor,'background-color'))||'';
        rteOpenPop(btn,rteColorPopHtml(rteHasSel(editor)?'هایلایت بخش انتخاب‌شده':'هایلایت کل متن',now,true),pop=>rteBindColorPop(pop,(c)=>{
          rteInlineStyle(editor,{'background-color':c||''},{whole:true});
          if(!c){ editor.querySelectorAll('[style*="background"]').forEach(el=>{ if(!rteHasSel(editor)||rteRange(editor).intersectsNode(el)){ el.style.removeProperty('background-color'); el.style.removeProperty('background'); } }); rteCleanup(editor); rteCommit(editor); }
          const sw=root.querySelector('[data-rte-sw="highlight"]'); if(sw)sw.style.background=c||'transparent';
        }));
      }
      if(kind==='deco'){
        const row=(kd,label)=>{ const d=rteDeco[kd]; return `<div class="rte2-deco-row" data-deco-kind="${kd}"><div class="rte2-pop__sub">${label}</div><div class="rte2-sw-grid rte2-sw-grid--sm">${['','#101828','#175CD3','#7F56D9','#DD2590','#F04438','#F79009','#12B76A','#0BA5EC','#FFFFFF'].map(c=>`<button type="button" class="rte2-sw${(d.color||'')===c?' is-on':''}${c?'':' rte2-sw--auto'}" data-deco-color="${c}" style="${c?`background:${c}`:''}" title="${c||'هم‌رنگ متن'}"></button>`).join('')}<label class="rte2-sw rte2-sw--native" title="رنگ دلخواه"><input type="color" data-deco-native value="${/^#[0-9a-fA-F]{6}$/.test(d.color)?d.color:'#F04438'}"></label></div><div class="rte2-pop__row"><select class="rte2-select rte2-select--sm" data-deco-style>${[['solid','ممتد'],['dashed','خط‌چین'],['dotted','نقطه‌چین'],['wavy','موجی'],['double','دوخطی']].map(([v,l])=>`<option value="${v}" ${d.style===v?'selected':''}>${l}</option>`).join('')}</select><select class="rte2-select rte2-select--sm" data-deco-thick>${[['','ضخامت خودکار'],['1','1px'],['2','2px'],['3','3px'],['4','4px'],['6','6px']].map(([v,l])=>`<option value="${v}" ${String(d.thick)===v?'selected':''}>${l}</option>`).join('')}</select></div></div>`; };
        rteOpenPop(btn,`<div class="rte2-pop__title">خط زیر و خط‌خورده</div>${row('underline','زیرخط <u>U</u>')}${row('line-through','خط‌خورده <s>S</s>')}<div class="rte2-pop__hint">اگر خطی روی متن نیست، اول U یا S را بزن؛ تنظیمات این‌جا روی خط‌های جدید هم اعمال می‌شود.</div>`,pop=>{
          pop.querySelectorAll('[data-deco-kind]').forEach(rw=>{ const kd=rw.dataset.decoKind;
            const go=(o)=>{ const ok=rteApplyDeco(editor,kd,o); if(!ok)showToast(kd==='underline'?'روی این متن زیرخطی نیست — ذخیره شد برای زیرخط بعدی':'روی این متن خط‌خورده‌ای نیست — ذخیره شد برای بعدی'); };
            rw.querySelectorAll('[data-deco-color]').forEach(b=>b.addEventListener('click',()=>{ rw.querySelectorAll('.rte2-sw').forEach(x=>x.classList.remove('is-on')); b.classList.add('is-on'); go({color:b.dataset.decoColor}); }));
            rw.querySelector('[data-deco-native]')?.addEventListener('input',e=>go({color:e.target.value}));
            rw.querySelector('[data-deco-style]')?.addEventListener('change',e=>go({style:e.target.value}));
            rw.querySelector('[data-deco-thick]')?.addEventListener('change',e=>go({thick:e.target.value}));
          });
        });
      }
    }));
    /* تبدیل حروف */
    root.querySelectorAll('[data-rte-transform]').forEach(btn=>btn.addEventListener('click',()=>{
      const f=cur(); if(!f)return; const v=btn.dataset.rteTransform;
      snapshot(); f.transform=v; 
      root.querySelectorAll('[data-rte-transform]').forEach(x=>x.classList.toggle('is-on',x===btn));
      scheduleSave(); scheduleCanvasRender(); showToast(v==='none'?'بدون تبدیل':v==='uppercase'?'همهٔ حروف بزرگ':v==='lowercase'?'همهٔ حروف کوچک':'اول بزرگ');
    }));
    const setTransformOn=()=>{ const f=cur(); if(!f)return; root.querySelectorAll('[data-rte-transform]').forEach(x=>x.classList.toggle('is-on',x.dataset.rteTransform===(f.transform||'none'))); };
    setTransformOn();
    /* میانبرها */
    editor.addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&['b','i','u'].includes(e.key.toLowerCase())){ setTimeout(()=>{rteCommit(editor);refresh();},0); } });
  }

  function colOrder(c){
    const items=Array.isArray(c&&c.items)?c.items:[];
    const ranked=items.map((x,i)=>({i,o:Number(x&&x.desktopOrder)})).sort((a,z)=>((Number.isFinite(a.o)&&a.o>0?a.o:a.i+1)-(Number.isFinite(z.o)&&z.o>0?z.o:z.i+1))||(a.i-z.i));
    const ord=[]; ranked.forEach((r,k)=>{ord[r.i]=k+1;}); return ord;
  }
  function setColOrder(c,ord){ (c.items||[]).forEach((x,i)=>{x.desktopOrder=ord[i]||i+1;}); }

  function normalizeColumnWidths(c,force=false){
    const items=c.items||[]; if(!items.length)return;
    /* V131 — حالت زیر هم (legacy dir='column'): تک‌ستون همیشه تمام‌عرض */
    if(c.dir==='column' && items.length===1){items[0].width=100;return;}
    const raw=items.map(x=>Math.max(1,n(x.width,100/items.length)));
    const total=raw.reduce((a,v)=>a+v,0);
    if(!force && total<=100)return;
    const scale=total>0?100/total:1/items.length;
    items.forEach((x,i)=>x.width=Math.round(raw[i]*scale*100)/100);
    const sum=items.reduce((a,v)=>a+n(v.width,0),0);
    if(items.length)items[items.length-1].width=Math.round((items[items.length-1].width+(100-sum))*100)/100;
  }
  function rebalanceColumnWidth(c,index,value){
    const items=c.items||[]; if(!items[index])return;
    const next=Math.max(1,Math.min(99,n(value,items[index].width)));
    items[index].width=next;
    const others=items.map((_,i)=>i).filter(i=>i!==index);
    const remainder=Math.max(1,100-next);
    if(!others.length){items[index].width=100;return;}
    const rawTotal=others.reduce((a,i)=>a+Math.max(0,n(items[i].width,1)),0) || others.length;
    others.forEach((i,pos)=>{
      const share=Math.max(1,remainder*(Math.max(0,n(items[i].width,1))/rawTotal));
      items[i].width=share;
    });
    normalizeColumnWidths(c,true);
  }
    function addRepeater(kind){
    const f=find(selectedId)?.b;if(!f)return;
    if(kind==='faq'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({q:'سوال جدید؟',a:'پاسخ جدید'});}
    if(kind==='form'){f.fields=Array.isArray(f.fields)?f.fields:[];f.fields.push({name:'field'+(f.fields.length+1),label:'فیلد جدید',type:'text',placeholder:'',required:false});}
    if(kind==='stats'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({value:'<strong>0</strong>',label:'جدید',icon:'✦',iconUrl:'',iconSize:28,align:'mc',fontFamily:'system-ui'});}
    if(kind==='list'){f.items=Array.isArray(f.items)?f.items:[];f.items.push('آیتم جدید');}
    if(kind==='social'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({name:'شبکه جدید',url:'#',icon:'◎',iconUrl:'',shape:'circle',bg:'#fff',color:'#101828',border:'#EAECF0',borderWidth:1,iconSize:22});}
    if(kind==='carousel'){f.slides=Array.isArray(f.slides)?f.slides:[];f.slides.push({src:'',alt:'Slide '+(f.slides.length+1),caption:''});}
    if(kind==='upsellBox'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({title:'آیتم جدید',desc:'',price:'19',comparePrice:'',image:'',productSlug:''});}
    if(kind==='trustBar'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({icon:'✓',title:'عنوان',text:'توضیح'});}
    if(kind==='iconGrid'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({icon:'✦',title:'عنوان',text:'توضیح'});}
    if(kind==='icons'){f.icons=Array.isArray(f.icons)?f.icons:[];f.icons.push({icon:'✦'});}
    if(kind==='steps'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({number:String(f.items.length+1).padStart(2,'0'),title:'مرحله',text:'توضیح'});}
    if(kind==='timeline'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({title:'مرحله',text:'توضیح',titleColor:f.titleColor||'#101828',textColor:f.textColor||'#667085',titleSize:f.titleSize||16,textSize:f.textSize||13});}
    if(kind==='buttonGroup'){f.buttons=Array.isArray(f.buttons)?f.buttons:[];f.buttons.push({label:'دکمه جدید',url:'#',variant:'solid',bg:'#175CD3',fg:'#fff',size:15,padX:18,padY:12});}
    if(kind==='featureCompare'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({label:'ویژگی جدید',values:['✓','✓']});}
    if(kind==='avatarStack'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({src:'',name:'کاربر جدید'});}
    if(kind==='roadmap'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({icon:'✦',title:'مرحله جدید',text:'توضیح مرحله',status:'next',tag:'',meta:''});}
    if(kind==='bonusStack'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({icon:'🎁',title:'بونوس جدید',text:'',value:''});}
    if(kind==='curriculum'){f.modules=Array.isArray(f.modules)?f.modules:[];f.modules.push({title:'ماژول جدید',meta:'',lessons:['درس اول'],locked:true});}
    if(kind==='logoCloud'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({id:uid(),url:'',alt:'Logo',link:'',size:72});}
    if(kind==='testiMarquee'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({quote:'نظر مشتری جدید',name:'نام مشتری',role:'سمت',avatar:''});}
    if(kind==='badges'){const t=state.landing=state.landing||{};t.badges=Array.isArray(t.badges)?t.badges:[];t.badges.push({label:'بج جدید',tone:'soft'});}
    if(kind==='mediaMarquee'){f.items=Array.isArray(f.items)?f.items:[];f.items.push({src:'',alt:'',link:''});}
    if(kind==='images'){f.images=Array.isArray(f.images)?f.images:[];f.images.push({src:'',alt:'تصویر'});}
    /* V114 — quick icon mode switches from the canvas mini toolbar */
    inspector.querySelectorAll('[data-icon-mode-quick]').forEach(btn=>btn.addEventListener('click',()=>{
      const f=find(selectedId)?.b;if(!f||f.type!=='icon')return;
      if(btn.dataset.iconModeQuick==='strip'){ if(!Array.isArray(f.icons)||!f.icons.length) f.icons=[{icon:f.icon||'🔥'},{icon:'⭐'},{icon:'⚡'}]; }
      else { const first=(Array.isArray(f.icons)?f.icons:[])[0]; if(first){f.icon=first.icon||f.icon||'✦';} delete f.icons; }
      snapshot();scheduleSave();scheduleCanvasRender();updateInspector();
      showToast(btn.dataset.iconModeQuick==='strip'?'حالت چند آیکون فعال شد — چیپ‌ها در تب محتوا':'حالت تک‌آیکون');
    }));
    snapshot(); scheduleCanvasRender(); updateInspector(); renderLayers(); syncSelectionClasses();
    showToast(kind==='social'?'شبکه اجتماعی اضافه شد':'آیتم اضافه شد');
  }
  /* ===== V133 — ریپیترها و بایندهای اختصاصی هدر/فوتر ===== */
  function addShellRepeater(kind,gi){
    const f=find(selectedId)?.b;if(!f)return;
    if(kind==='headerNav'){ f.nav=Array.isArray(f.nav)?f.nav:[]; f.nav.push({id:uid(),label:'لینک جدید',icon:'',url:'#'}); }
    else if(kind==='headerItems'){ f.items=Array.isArray(f.items)?f.items:[]; f.items.push({id:uid(),src:'',url:'#',alt:'',size:28,newTab:false}); }
    else if(kind==='headerSub'){ const it=f.nav&&f.nav[gi]; if(!it)return; it.submenu=Array.isArray(it.submenu)?it.submenu:[]; it.submenu.push({id:uid(),label:'آیتم زیرمنو',url:'#'}); }
    else if(kind==='footerGroups'){ f.groups=Array.isArray(f.groups)?f.groups:[]; f.groups.push({id:uid(),title:'گروه جدید',links:[{id:uid(),label:'لینک اول',url:'#'}]}); }
    else if(kind==='footerLink'){ const g=f.groups&&f.groups[gi]; if(!g)return; g.links=Array.isArray(g.links)?g.links:[]; g.links.push({id:uid(),label:'لینک جدید',url:'#'}); }
    else if(kind==='footerSocials'){ f.socials=Array.isArray(f.socials)?f.socials:[]; f.socials.push({id:uid(),label:'شبکه جدید',icon:'◎',url:'#'}); }
    else if(kind==='footerBottom'){ f.bottomLinks=Array.isArray(f.bottomLinks)?f.bottomLinks:[]; f.bottomLinks.push({id:uid(),label:'لینک جدید',url:'#'}); }
    else return addRepeater(kind);
    snapshot(); scheduleCanvasRender(); updateInspector(); renderLayers(); syncSelectionClasses(); showToast('آیتم اضافه شد');
  }
  function removeShellRepeater(kind,gi,index){
    const f=find(selectedId)?.b;if(!f)return;
    if(kind==='headerNav'){ if(!Array.isArray(f.nav))return; f.nav.splice(index,1); }
    else if(kind==='headerItems'){ if(!Array.isArray(f.items))return; f.items.splice(index,1); }
    else if(kind==='headerSub'){ const it=f.nav&&f.nav[gi]; if(!it||!Array.isArray(it.submenu))return; it.submenu.splice(index,1); if(!it.submenu.length)delete it.submenu; }
    else if(kind==='footerGroups'){ if(!Array.isArray(f.groups))return; f.groups.splice(gi,1); }
    else if(kind==='footerLink'){ const g=f.groups&&f.groups[gi]; if(!g||!Array.isArray(g.links))return; g.links.splice(index,1); }
    else if(kind==='footerSocials'){ if(!Array.isArray(f.socials))return; f.socials.splice(index,1); }
    else if(kind==='footerBottom'){ if(!Array.isArray(f.bottomLinks))return; f.bottomLinks.splice(index,1); }
    else return removeRepeater(kind,index);
    snapshot(); scheduleCanvasRender(); updateInspector(); renderLayers(); syncSelectionClasses();
  }
  function shellBindExtras(){
    /* انتخاب طرح پس‌زمینه از کتابخانهٔ پترن (هدر/فوتر) */
    inspector.querySelectorAll('[data-shell-pat-select]').forEach(sel=>sel.addEventListener('change',()=>{
      const f=find(selectedId)?.b;if(!f)return;
      const k=sel.dataset.shellPatSelect; f[k]=sel.value||'';
      snapshot(); scheduleSave(); scheduleCanvasRender(); setTimeout(()=>updateInspector(),0);
    }));
    inspector.querySelectorAll('[data-shell-pat]').forEach(btn=>btn.addEventListener('click',()=>{
      const f=find(selectedId)?.b;if(!f)return;
      f[btn.dataset.shellPatKey]=btn.dataset.shellPat;
      snapshot(); scheduleSave(); scheduleCanvasRender(); setTimeout(()=>updateInspector(),0);
    }));
    bindShellHeaderPresets();
  }
  /* V133 — تب فاصله‌گذاری هدر/فوتر: همان سیستم استاندارد (پدینگ واقعی روی پوستهٔ هدر/فوتر می‌نشیند) */
  function shellSpacingFields(b){
    const isHeader=b.type==='header';
    return section('فاصله‌گذاری',`
      <div class="sp-grid">
        ${rangeField('پدینگ بالا','padTop',n(b.padTop,n(b.padY,isHeader?12:32)),0,120,1)}
        ${rangeField('پدینگ پایین','padBottom',n(b.padBottom,n(b.padY,isHeader?12:32)),0,120,1)}
        ${rangeField('پدینگ راست','padRight',n(b.padRight,n(b.padX,isHeader?18:24)),0,160,1)}
        ${rangeField('پدینگ چپ','padLeft',n(b.padLeft,n(b.padX,isHeader?18:24)),0,160,1)}
      </div>
      ${isHeader?rangeField('فاصلهٔ بین آیتم‌های نویگیشن','gap',n(b.gap,26),4,80,1):''}
      <div class="helper">${isHeader?'پدینگ داخلی هدر و فاصلهٔ لینک‌های نویگیشن.':'پدینگ داخلی فوتر.'} تغییرها همان لحظه روی بوم دیده می‌شود.</div>`).outerHTML;
  }
  /* V133 — تب پیشرفته هدر/فوتر: sticky/اسکرول/z-index یا آکاردئون موبایل + بریک‌پوینت‌ها + انیمیشن */
  function shellAdvancedFields(b,which){
    const stickyCard=which==='header'?chl('Sticky / Fixed', selectField('حالت هدر','stickyMode',b.stickyMode||'normal',[['normal','عادی (با اسکرول می‌رود)'],['top','چسبان بالا (Sticky)'],['fixed','ثابت روی صفحه (Fixed)'],['smart','مخفی با اسکرول پایین / ظاهر با اسکرول بالا']])+fxRow('⇲','کوچک‌شدن هدر بعد از اسکرول','scrollShrink',b.scrollShrink===true)+fxRow('◐','گلس فقط بعد از اسکرول','glassOnScroll',b.glassOnScroll===true)+rangeField('z-index','zIndex',b.zIndex??50,1,999,1)+rangeField('فاصله از بالای صفحه','offsetTop',b.offsetTop??0,0,200,1)+'<div class="helper">در حالت «ثابت روی صفحه»، فاصلهٔ جبرانی خودکار بالای محتوای صفحه اعمال می‌شود تا چیزی زیر هدر قایم نشود — این باگ رایج است و اینجا خودکار حل شده.</div>'):'';
    const mobileCard=which==='footer'?chl('رفتار موبایل', fxRow('▤','گروه‌های لینک در موبایل آکاردئونی شوند','footerAccordionMobile',b.footerAccordionMobile!==false)+'<div class="helper">روی موبایل هر گروه عنوان بسته‌شدنی می‌گیرد و لیست لینک‌هایش زیرش باز می‌شود — الگوی رایج فوترهای چندستونی.</div>'):'';
    return stickyCard+mobileCard+section('نمایش در بریک‌پوینت‌ها',`${check('نمایش در دسکتاپ','showDesktop',b.hideDesktop!==true)}${check('نمایش در تبلت','showTablet',b.hideTablet!==true)}${check('نمایش در موبایل','showMobile',b.hideMobile!==true)}`).outerHTML+animationCard(b);
  }
  function removeRepeater(kind,index){
    if(kind==='badges'){const t=state.landing;if(!t||!Array.isArray(t.badges)||!t.badges[index])return;t.badges.splice(index,1);if(!t.badges.length)delete t.badges;snapshot();updateInspector();showToast('بج حذف شد');return;}
    const f=find(selectedId)?.b;if(!f)return;
    const map={faq:'items',form:'fields',stats:'items',list:'items',social:'items',carousel:'slides',trustBar:'items',iconGrid:'items',steps:'items',timeline:'items',logoCloud:'items',buttonGroup:'buttons',featureCompare:'items',avatarStack:'items',roadmap:'items',bonusStack:'items',curriculum:'modules',testiMarquee:'items',mediaMarquee:'items',images:'images',icons:'icons',upsellBox:'items'};
    const key=map[kind], arr=key?f[key]:null;
    if(!Array.isArray(arr)||arr[index]===undefined)return;
    arr.splice(index,1); snapshot(); scheduleCanvasRender(); updateInspector(); renderLayers(); syncSelectionClasses();
  }

  function isInside(entryId, ancestorId){
    if(!entryId||!ancestorId||entryId===ancestorId)return entryId===ancestorId;
    const entry=find(entryId), anc=find(ancestorId);
    if(!entry||!anc)return false;
    let p=entry.parent;
    while(p){ if(p.id===ancestorId)return true; p=allEntries().find(x=>x.b===p.parent)?.b; }
    return entry.path.join('/').startsWith(anc.path.join('/')+'/');
  }
  function moveBlock(sourceId,target){
    if(!sourceId||!target)return false;
    const s=find(sourceId); if(!s)return false;
    if(s.b.type==='stickyButton'){ showToast('Sticky Button همیشه پایین‌ترین بخش صفحه است'); return false; } /* V138 */
    if(target.targetId){ const tt=find(target.targetId); if(tt&&tt.b.type==='stickyButton') return false; }
    if(target.targetId===sourceId || target.parentId===sourceId)return false;
    if(target.parentId && isInside(target.parentId, sourceId))return false;
    if(target.targetId && isInside(target.targetId, sourceId))return false;

    let dest=null, idx=-1;
    if(target.mode==='append'){
      const p=find(target.parentId)?.b;
      if(!p || !Array.isArray(p.blocks)) return false;
      dest=p.blocks; idx=dest.length;
    } else if(target.mode==='column'){
      const p=find(target.parentId)?.b;
      if(!p || p.type!=='columns' || !p.items?.[target.column]) return false;
      p.items[target.column].blocks=p.items[target.column].blocks||[];
      dest=p.items[target.column].blocks; idx=dest.length;
    } else {
      const t=find(target.targetId); if(!t)return false;
      dest=getContainer(t); idx=dest.indexOf(t.b); if(idx<0)idx=dest.length;
      if(dest===getContainer(s) && s.index<idx) idx--;
    }

    if(s.b.type==='popupSection' && dest!==state.blocks){ showToast('Pop Up فقط در ریشهٔ صفحه قرار می‌گیرد'); return false; }
    const srcArr=getContainer(s);
    if(srcArr===dest && (idx===s.index || idx===s.index+1)) return false;
    srcArr.splice(s.index,1);
    if(idx>dest.length) idx=dest.length;
    dest.splice(idx,0,s.b);
    snapshot(); renderAll(); select(sourceId);
    return true;
  }
  function moveSibling(id,dir){const f=find(id);if(!f)return;if(f.b.type==='stickyButton'){showToast('Sticky Button همیشه پایین‌ترین بخش صفحه است');return;}const _arr=getContainer(f),_j=f.index+dir;if(_arr[_j]&&_arr[_j].type==='stickyButton')return;const arr=getContainer(f),j=f.index+dir;if(j<0||j>=arr.length)return;[arr[f.index],arr[j]]=[arr[j],arr[f.index]];snapshot();renderAll();select(id);}
  function reIdsDeep(b){
    b.id=uid();
    if(Array.isArray(b.blocks)) b.blocks.forEach(reIdsDeep);
    if(Array.isArray(b.items)) b.items.forEach(it=>{ if(it&&typeof it==='object'){ if(it.id)it.id=uid(); if(Array.isArray(it.blocks)) it.blocks.forEach(reIdsDeep); } });
    return b;
  }
  let savedBlocks=Array.isArray(window.SAVED_BLOCKS)?window.SAVED_BLOCKS:[];
  function saveAsBlock(){
    if(!selectedId)return showToast('اول یک عنصر یا بخش را انتخاب کن');
    const f=find(selectedId); if(!f)return;
    const isSection=['section','group'].includes(f.b.type)&&Array.isArray(f.b.blocks);
    const name=(prompt(isSection?'اسم این بخش برای کتابخانه کامپوننت‌ها چیه؟':'اسم این کامپوننت برای استفاده‌ی بعدی چیه؟',labels[f.b.type]||'کامپوننت من')||'').trim();
    if(!name)return;
    const category=(prompt('دسته‌بندی (مثلاً: هیرو، دکمه، اعتمادسازی…)',isSection?'بخش‌ها':'عمومی')||'عمومی').trim().slice(0,40)||'عمومی';
    const payload=isSection?{name,category,blocks:structuredClone(f.b.blocks)}:{name,category,block:structuredClone(f.b)};
    fetch('/api/builder/saved-blocks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      .then(r=>r.json()).then(out=>{
        if(!out.ok)return showToast(out.error||'ذخیره نشد');
        savedBlocks.unshift(out.savedBlock);
        renderElementLibrary(document.getElementById('elementSearch')?.value||'');
        showToast('کامپوننت ذخیره شد — در کتابخانه ببینش');
      }).catch(()=>showToast('ارتباط با سرور برقرار نشد'));
  }
  function duplicateSavedBlock(id){
    const src=savedBlocks.find(x=>x.id===id); if(!src)return;
    const name=(prompt('اسم کپی:',src.name+' (کپی)')||'').trim(); if(!name)return;
    const payload=src.blocks?{name,category:src.category,blocks:structuredClone(src.blocks)}:{name,category:src.category,block:structuredClone(src.block)};
    fetch('/api/builder/saved-blocks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      .then(r=>r.json()).then(out=>{ if(!out.ok)return showToast(out.error||'کپی نشد'); savedBlocks.unshift(out.savedBlock); renderElementLibrary(document.getElementById('elementSearch')?.value||''); showToast('کپی ساخته شد'); })
      .catch(()=>showToast('ارتباط برقرار نشد'));
  }
  function renameSavedBlock(id){
    const src=savedBlocks.find(x=>x.id===id); if(!src)return;
    const name=(prompt('اسم جدید کامپوننت:',src.name)||'').trim(); if(!name||name===src.name)return;
    fetch('/api/builder/saved-blocks/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name})})
      .then(r=>r.json()).then(out=>{ if(!out.ok)return showToast(out.error||'تغییر نام نشد'); savedBlocks=savedBlocks.map(x=>x.id===id?out.savedBlock:x); renderElementLibrary(document.getElementById('elementSearch')?.value||''); showToast('نام عوض شد'); })
      .catch(()=>showToast('ارتباط برقرار نشد'));
  }
  function deleteSavedBlock(id){
    if(!confirm('این بلوک ذخیره‌شده حذف شود؟'))return;
    fetch('/api/builder/saved-blocks/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
      .then(r=>r.json()).then(out=>{
        if(!out.ok)return showToast(out.error||'حذف نشد');
        savedBlocks=savedBlocks.filter(x=>x.id!==id);
        renderElementLibrary(document.getElementById('elementSearch')?.value||'');
        showToast('بلوک حذف شد');
      }).catch(()=>showToast('ارتباط با سرور برقرار نشد'));
  }
  function insertSavedBlock(entry){
    const isSection=Array.isArray(entry.blocks)&&entry.blocks.length;
    const sectionWrap=(blocks)=>{ const sec=defaultBlock('section'); sec.blocks=blocks; sec.padY=24; sec.padX=24; return sec; };
    const added=[];
    if(isSection){
      const sec=reIdsDeep(sectionWrap(structuredClone(entry.blocks)));
      added.push(sec); state.blocks.push(sec);
    } else {
      const b=reIdsDeep(structuredClone(entry.block)); added.push(b);
      const targetId=selectedId;
      const selected=targetId?find(targetId)?.b:null;
      if(selected && ['section','group','stickySection','stickyColumn','popupSection'].includes(selected.type) && Array.isArray(selected.blocks)){
        selected.blocks.push(b);
      } else if(selected){
        const en=find(targetId); const arr=en?getContainer(en):state.blocks; const at=en?en.index+1:arr.length; arr.splice(Math.max(0,at),0,b);
      } else {
        state.blocks.push(b);
      }
    }
    snapshot();renderAll();select(added[0].id);showToast(`${entry.name} اضافه شد`);
  }
  function addElement(type, options={}){
    type=resolveElementAlias(type);
    if(type==='latestElements'){ /* V118 — الگوی «محصولات و مقالات» از سرور می‌آید (یک سکشن با بلوک‌های پویا) */
      const raw=(typeof window.LATEST_ELEMENTS_SECTION==='function')?window.LATEST_ELEMENTS_SECTION(Date.now()%100000):(typeof window.LATEST_ELEMENTS_SECTION==='object'?window.LATEST_ELEMENTS_SECTION:null);
      if(raw&&typeof raw==='object'){
        const sec=normalizeNode(JSON.parse(JSON.stringify(raw)),new Set());
        const targetId=Object.prototype.hasOwnProperty.call(options,'targetId')?options.targetId:selectedId;
        const selected=targetId?find(targetId)?.b:null;
        if(selected && ['section','group','stickySection','stickyColumn','popupSection'].includes(selected.type) && Array.isArray(selected.blocks))selected.blocks.push(sec);
        else state.blocks.push(sec);
        snapshot();renderAll();select(sec.id);showToast('محصولات و مقالات اضافه شد');
        return sec;
      }
    }
    const b=defaultBlock(type);
    if(type==='popupSection'){ state.blocks.push(b); snapshot();renderAll();select(b.id);showToast('Pop Up اضافه شد — پایین‌ترین بخش صفحه'); return b; } /* V137 — همیشه در ریشهٔ صفحه */
    if(type==='stickyButton'){ /* V138 — فقط یک Sticky Button، همیشه آخرین بلوک ریشه */
      const ex=(state.blocks||[]).find(x=>x&&x.type==='stickyButton');
      if(ex){ select(ex.id); showToast('این صفحه از قبل یک Sticky Widget دکمه‌ای دارد'); return ex; }
      state.blocks.push(b); snapshot();renderAll();select(b.id);showToast('Sticky Widget (دکمه) اضافه شد — پایین‌ترین بخش صفحه'); return b;
    }
    const targetId=Object.prototype.hasOwnProperty.call(options,'targetId')?options.targetId:selectedId;
    const selected=targetId?find(targetId)?.b:null;
    if(selected && ['section','group','stickySection','stickyColumn','popupSection'].includes(selected.type) && Array.isArray(selected.blocks)){
      selected.blocks.push(b);
    } else if(selected && selected.type==='columns'){
      selected.items=selected.items||[{id:uid(),width:50,blocks:[]},{id:uid(),width:50,blocks:[]}];
      selected.items.forEach(col=>col.blocks=Array.isArray(col.blocks)?col.blocks:[]);
      const targetColumn=Math.max(0,Math.min(selected.items.length-1,Number(selected.activeColumn)||0));
      selected.items[targetColumn].blocks.push(b);
    } else if(selected){
      const entry=find(targetId);
      const arr=entry?getContainer(entry):state.blocks;
      const at=entry?entry.index+1:arr.length;
      arr.splice(Math.max(0,at),0,b);
    } else {
      state.blocks.push(b);
    }
    snapshot();renderAll();select(b.id);showToast(`${labels[type]} اضافه شد`);
    return b;
  }
  function addElementToTarget(type,targetId,mode='append'){
    type=resolveElementAlias(type);
    if(type==='latestElements'){ /* V118 — درج «محصولات و مقالات» از مسیر درگ یا پریست‌ها */
      return addElement('latestElements',{targetId:targetId});
    }
    if(type==='popupSection') return addElement('popupSection');
    if(type==='stickyButton') return addElement('stickyButton');
    const b=defaultBlock(type);
    const target=find(targetId);
    if(!target){ if(targetId==null){ state.blocks.push(b); snapshot(); renderAll(); select(b.id); showToast(`${labels[type]} اضافه شد`); return b; } return addElement(type); }
    if(mode==='inside' && ['section','group','stickySection','stickyColumn','popupSection'].includes(target.b.type) && Array.isArray(target.b.blocks)){
      target.b.blocks.push(b);
    } else if(mode==='column' && target.b.type==='columns'){
      target.b.items=target.b.items||[];
      const ci=Math.max(0,Math.min(target.b.items.length-1,Number(target.b.activeColumn)||0));
      target.b.items[ci].blocks=Array.isArray(target.b.items[ci].blocks)?target.b.items[ci].blocks:[];
      target.b.items[ci].blocks.push(b);
    } else {
      const arr=getContainer(target); const idx=target.index+(mode==='after'?1:0); arr.splice(idx,0,b);
    }
    snapshot();renderAll();select(b.id);showToast(`${labels[type]} اضافه شد`); return b;
  }
  /* V200 — Sticky Widget: یک عنصر با سه حالت (دکمه / سکشن / ستون). زیرساخت همان
     سه نوع قبلی است، پس رندر سایت، بوم و داده‌های قدیمی دست‌نخورده می‌مانند. */
  const STICKY_WIDGET_TYPES=['stickyButton','stickySection','stickyColumn'];
  function resolveElementAlias(type){
    if(type==='spacer') return 'divider';
    if(type==='stickyWidget'){ const hasBtn=(state.blocks||[]).some(x=>x&&x.type==='stickyButton'); return hasBtn?'stickySection':'stickyButton'; }
    return type;
  }
  function stickyWidgetSwitch(id,to){
    const entry=find(id); if(!entry||!STICKY_WIDGET_TYPES.includes(to)||entry.b.type===to) return;
    const t=entry.b;
    if(to==='stickyButton' && allEntries().some(e=>e.b.type==='stickyButton'&&e.b.id!==t.id)){ showToast('این صفحه از قبل یک Sticky Widget دکمه‌ای دارد'); return; }
    const stash=Object.assign({},t._swStash||{});
    const kids=Array.isArray(t.blocks)?t.blocks:[];
    const cur=structuredClone(t); delete cur._swStash; delete cur.blocks; stash[t.type]=cur;
    if(to==='stickyButton'&&kids.length) stash._kids=kids;
    const nb=stash[to]?structuredClone(stash[to]):defaultBlock(to);
    nb.id=t.id; nb.type=to;
    if(to!=='stickyButton'){ nb.blocks=kids.length?kids:(Array.isArray(stash._kids)?stash._kids:[]); delete stash._kids; }
    nb._swStash=stash;
    entry.container.splice(entry.index,1);
    if(to==='stickyButton') state.blocks.push(nb); /* دکمهٔ چسبان همیشه آخرین بلوک ریشه است */
    else if(t.type==='stickyButton') state.blocks.push(nb);
    else entry.container.splice(entry.index,0,nb);
    selectedId=nb.id; selectedIds=new Set([nb.id]);
    snapshot(); renderAll(); select(nb.id);
    showToast('Sticky Widget → '+(to==='stickyButton'?'دکمه':to==='stickySection'?'سکشن':'ستون'));
  }
  function stickyWidgetCard(b){
    if(!STICKY_WIDGET_TYPES.includes(b.type)) return '';
    const opt=[['stickyButton','دکمه','⬭'],['stickySection','سکشن','▭'],['stickyColumn','ستون','▯']];
    return v142Card('نوع Sticky Widget', `<div class="field v142-seg sw-mode"><div class="v142-seg__row">${opt.map(([k,l,g])=>`<button type="button" class="v142-seg__btn${b.type===k?' on':''}" data-sw-mode="${k}" title="${l}"><span class="v142-seg__ico">${g}</span><span>${l}</span></button>`).join('')}</div></div><div class="helper">دکمه: شناور گوشهٔ صفحه · سکشن: نوار چسبان بالا/پایین با هر عنصری داخلش · ستون: ستونی که کنار محتوای بلند ثابت می‌ماند. تنظیمات هر حالت جدا نگه داشته می‌شود.</div>`,'📌');
  }
  function groupSelected(){
    const ids=[...selectedIds]; if(ids.length<2)return showToast('حداقل دو عنصر را انتخاب کن');
    const entries=ids.map(id=>find(id)).filter(Boolean).sort((a,b)=>a.path.join('.').localeCompare(b.path.join('.')));
    const first=entries[0]; const same=entries.every(e=>e.container===first.container); if(!same)return showToast('برای Group باید عناصر در یک سطح باشند');
    const indexes=entries.map(e=>e.index).sort((a,b)=>a-b); const blocks=entries.map(e=>structuredClone(e.b)); const container=first.container; const insertAt=indexes[0];
    for(let i=indexes.length-1;i>=0;i--)container.splice(indexes[i],1);
    const g=defaultBlock('group'); g.blocks=blocks; g.label='Group'; container.splice(insertAt,0,g); snapshot(); selectedIds=new Set([g.id]); selectedId=g.id; renderAll(); showToast('گروه ساخته شد');
  }
  function ungroupSelected(){const f=find(selectedId)?.b; if(!f||f.type!=='group')return showToast('یک Group را انتخاب کن'); const ent=find(selectedId); const children=f.blocks||[]; ent.container.splice(ent.index,1,...children); snapshot(); selectedIds=new Set(children.map(x=>x.id)); selectedId=children[0]?.id||null; renderAll();}
  function alignSelected(mode){ const ids=[...selectedIds]; ids.forEach(id=>{const f=find(id);if(!f)return;f.b.align=mode;}); snapshot(); scheduleCanvasRender(); renderLayers(); }
  function deleteMulti(){const ids=[...selectedIds]; if(!ids.length)return; const entries=ids.map(id=>find(id)).filter(Boolean).sort((a,b)=>b.path.length-a.path.length||b.index-a.index); entries.forEach(e=>e.container.splice(e.index,1)); selectedIds.clear();selectedId=null;snapshot();renderAll();showToast('عناصر حذف شدند');}
  function duplicateSelected(){
    if(!selectedId)return; const f=find(selectedId); if(!f)return;
    if(f.b.type==='stickyButton')return showToast('هر صفحه فقط یک Sticky Button دارد');
    const clone=structuredClone(f.b); clone.id=uid(); getContainer(f).splice(f.index+1,0,clone); snapshot(); renderAll(); select(clone.id); showToast('عنصر تکثیر شد');
  }
  function copySelected(){ if(!selectedId)return; const f=find(selectedId); if(!f)return; clipboardBlock=structuredClone(f.b); showToast('عنصر کپی شد'); }
  function pasteSelected(){
    const target=selectedId?find(selectedId):null; if(!clipboardBlock)return showToast('چیزی برای پیست وجود ندارد');
    const clone=structuredClone(clipboardBlock); clone.id=uid(); const arr=target?getContainer(target):state.blocks; const idx=target?target.index+1:arr.length; arr.splice(idx,0,clone); snapshot(); renderAll(); select(clone.id); showToast('عنصر پیست شد');
  }
    function deleteSelected(){if(!selectedId)return;const f=find(selectedId);if(!f)return;getContainer(f).splice(f.index,1);selectedId=null;snapshot();renderAll();showToast('عنصر حذف شد');}

      function shouldRenderForCanvasDevice(b){ const m=frame.classList.contains('mobile'); const t=frame.classList.contains('tablet'); const d=frame.classList.contains('desktop'); if(m && (b.hideMobile===true || b.showOnMobile===false)) return false; if(t && b.hideTablet===true) return false; if(d && (b.hideDesktop===true || b.showOnDesktop===false)) return false; return true; }
  /* V138 — Sticky Button = همان دکمهٔ خرید (buyButton) با جای‌گیری ثابت. برای نمایش روی بوم،
     یک کپی buyButton بدون فاصله/یادداشت می‌سازیم تا ظاهرش دقیقاً مثل سایت باشد. */
  function stickyButtonAsBuy(b,extra={}){
    return Object.assign({},b,{type:'buyButton',id:(b.id||'sb')+'-v',marginTop:0,marginBottom:0,marginLeft:0,marginRight:0,padTop:0,padBottom:0,padLeft:0,padRight:0,maxWidth:100,desktopWidth:undefined,mobileWidth:undefined,edgeToEdge:false,fullBleed:false,note:'',align:'center',animationType:'none',position:undefined,fullWidth:false,hideMobile:false,hideDesktop:false,hideTablet:false,showOnMobile:true,showOnDesktop:true},extra);
  }
  /* V138 — Sticky Button همیشه در ریشهٔ صفحه و آخرین بلوک است (حتی اگر پیست/درگ/قالب آن را جای دیگری بگذارد) */
  function pinStickyButtons(){
    if(!Array.isArray(state.blocks))return;
    const found=[];
    const walk=(arr)=>{ for(let i=arr.length-1;i>=0;i--){ const x=arr[i]; if(!x)continue; if(x.type==='stickyButton'){ arr.splice(i,1); found.unshift(x); continue; } if(Array.isArray(x.blocks))walk(x.blocks); if(x.type==='columns'&&Array.isArray(x.items))x.items.forEach(c=>{ if(c&&Array.isArray(c.blocks))walk(c.blocks); }); } };
    walk(state.blocks);
    if(found.length)state.blocks.push(...found);
  }
  function stickyButtonPreviewHtml(b){
    const device=frame.classList.contains('mobile')?'mobile':(frame.classList.contains('desktop')?'desktop':undefined);
    if(device==='mobile'&&(b.hideMobile===true||b.showOnMobile===false))return '';
    if(device==='desktop'&&(b.hideDesktop===true||b.showOnDesktop===false))return '';
    const pos=b.stickyPos||'bottom-right';
    const full=device==='mobile'&&b.mobileFull===true;
    const j=full?'stretch':pos==='bottom-left'?'flex-start':pos==='bottom-center'?'center':'flex-end';
    const ox=Math.max(0,Math.min(80,n(b.offsetX,16))), oy=Math.max(0,Math.min(120,n(b.offsetY,16)));
    let btn=''; try{ btn=renderNodePreviewShared(stickyButtonAsBuy(b,{fullWidth:full}))||''; }catch(_){ btn=''; }
    if(!btn)return '';
    return `<div class="sticky-btn-preview" style="position:sticky;bottom:${oy}px;z-index:40;display:flex;flex-direction:column;align-items:${j};padding:0 ${ox}px;pointer-events:none"><div style="pointer-events:auto;${full?'width:100%':''}">${btn}</div></div>`;
  }
  function renderPublicBlocks(blocks=[],parentPadX=0){
    /* V108 — preview now renders through the SHARED widget renderer (the same
       engine server renderBlocks uses), so in-builder preview == published page. */
    /* V124 — فاصلهٔ عناصر داخلی (landing.elementGap): همان گپ صفحهٔ منتشرشده را روی
       بوم هم می‌گذاریم تا پیش‌نمایش با سایت واقعی یکی باشد. */
    const device=frame.classList.contains('mobile')?'mobile':(frame.classList.contains('desktop')?'desktop':undefined);
    const gap=Math.max(0,n((state.landing||{}).elementGap,10));
    const l=state.landing||{}; return sharedRenderer().renderBlocks(blocks||[],{device,gap,sectionGap:n(l.sectionGap,0),pagePadTop:n(l.pagePadTop,0),pagePadBottom:n(l.pagePadBottom,0)});
  }
  /* ---------- V108 shared renderer bridge (preview parity) ---------- */
  const pctClamp=(x,f=100)=>Math.max(0,Math.min(100,Number.isFinite(Number(x))?Number(x):f));
  let _sharedR=null;
  function sharedRenderer(){
    if(_sharedR) return _sharedR;
    const WR=window.WidgetRenderer;
    if(WR&&WR.createWidgetRenderer){
      _sharedR=WR.createWidgetRenderer({
        rich:(h)=>sanitizeRich(h),
        plainToHtml:(t)=>esc(t||'').replace(/\n/g,'<br>'),
        imageTransformUrl:(u)=>u,
        responsiveImageAttrs:(u,o)=>{const loading=(o&&o.loading)||'lazy';return ` loading="${loading}" decoding="async"${(o&&o.fetchpriority)?' fetchpriority="high"':''}`;},
        mediaSettings:()=>({}),
        testiMarqueeRender:null,
        logoMarqueeRender:null,
        RAVA_MARQUEE_CSS:'',
        isBrowser:true,
        /* V116 — editor context drives the scrollPoint affordance (ghost bar vs capsule) */
        get editorCtx(){ return frame.classList.contains('preview') ? 'preview' : 'edit'; } /* V137 — زنده، نه ثابت در لحظهٔ ساخت */
      });
    }
    return _sharedR;
  }
    function renderNodePreviewShared(b){
    /* Single shared engine (the same module the server publishes with).
       isBrowser:true only switches editor-only affordances such as the
       scrollPoint capsule and the static carousel image. */
    try{
      const WR=(typeof window!=='undefined')?window.WidgetRenderer:null;
      if(!(WR&&WR.createWidgetRenderer)) return null;
      const device=frame.classList.contains('mobile')?'mobile':(frame.classList.contains('desktop')?'desktop':undefined);
      const out=sharedRenderer().renderBlocks([b],{device});
      if(typeof out!=='string'||!out.trim()) return null;
      return out;
    }catch(err){ console.error('Shared render failed',b&&b.type,err); return null; }
  }
  function sanitizeRich(html){ const box=document.createElement('div');box.innerHTML=html;box.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(x=>x.remove());box.querySelectorAll('*').forEach(el=>{[...el.attributes].forEach(a=>{if(/^on/i.test(a.name))el.removeAttribute(a.name); else if(/^(href|src|xlink:href|action|formaction)$/i.test(a.name)&&/^(javascript|vbscript|data:text\/html)/i.test(String(a.value).replace(/[\s\x00-\x1f]+/g,'')))el.removeAttribute(a.name);});});return box.innerHTML; } /* V250 — javascript: links removed too */
  async function openRealPreview(){
    try{
      const SC=subCtx()?'&sub='+encodeURIComponent(subCtx().path||''):'';const r=await fetch('/api/preview-url?kind='+encodeURIComponent(window.BUILDER_KIND||'product')+'&index='+encodeURIComponent(window.BUILDER_INDEX??'')+SC);
      const j=await r.json();
      if(j&&j.ok&&j.url){ window.open(j.url,'_blank'); return; }
    }catch(e){}
    showToast('لینک صفحه پیدا نشد — ابتدا ذخیره کن');
  }
    function runBuilderDiagnostics(){
    const errors=[]; const elements=window.ELEMENTS||[]; normalizeState();
    elements.forEach(item=>{
      const type=item[2]; const b=defaultBlock(type);
      try{ const html=renderNodePreview(b,0); if(typeof html!=='string'||!html.trim())throw new Error('empty renderer'); }
      catch(err){ errors.push({type,label:labels[type]||type,message:err?.message||String(err)}); }
    });
    if(errors.length){ console.error('Builder diagnostics',errors); showToast(`${errors.length} ویجت خطا دارد`); }
    else showToast(`Builder OK • ${elements.length} ویجت بررسی شد`);
    document.documentElement.dataset.ravaBuilderDiagnostics = JSON.stringify(errors);
    return errors;
  }

  function installDiagnosticsButton(){
    /* V122.2 — دکمهٔ «بررسی» از نوار بالای بیلدر حذف شد؛ ابزار تشخیص همچنان از کنسول در دسترس است: window.__RAVA_BUILDER_DIAGNOSTICS__() */
    return;
  }

  window.__RAVA_BUILDER_DIAGNOSTICS__=runBuilderDiagnostics;
  window.__RAVA_BUILDER_API__={
    getState:()=>state,
    getSelection:()=>({id:selectedId,ids:[...selectedIds]}),
    getSelected:()=>selectedId?((find(selectedId)||{}).b||null):null,
    find,
    select,
    toggleSelect,
    addElement,
    addElementToTarget,
    duplicateSelected,
    deleteSelected,
    deleteMulti,
    groupSelected,
    ungroupSelected,
    copySelected,
    pasteSelected,
    moveSibling,
    moveBlock,
    renderAll,
    renderLayers,
    renderElementLibrary,
    updateInspector,
    snapshot,
    undo,
    redo,
    save,
    showToast,
    setActiveTab:(tab)=>{activeTab=(tab==='content'||tab==='advanced')?tab:'design';document.querySelectorAll('.inspector-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===activeTab));updateInspector();},
    getHistory:()=>({undo:Math.max(0,history.length-1),redo:future.length})
  };

  function renderElementLibrary(filter=''){
    groups.innerHTML='';
    const elements=[...(window.ELEMENTS||[])]; /* V200 — Anywhere Section حذف شد */
    const cats={core:'عناصر اصلی',structure:'بخش‌بندی',sales:'خرید',others:'عناصر دیگر',shell:'هدر و فوتر'};/* V105 — «عناصر دیگر» accordion، بای‌دیفالت بسته */
    const accCats=['others','shell'];/* V133 — دسته‌های آکاردئونی؛ shell هم بای‌دیفالت بسته */
    const libOpen=JSON.parse((()=>{try{return localStorage.getItem('rava.libAccordion')||'{}'}catch(_){return '{}'}})());
    const wanted=elements.filter(x=>!filter||x[1].toLowerCase().includes(filter.toLowerCase()));
    const savedWanted=savedBlocks.filter(x=>!filter||x.name.toLowerCase().includes(filter.toLowerCase())||String(x.category||'').toLowerCase().includes(filter.toLowerCase()));
    if(savedWanted.length){
      const byCat={}; savedWanted.forEach(x=>{const c=String(x.category||'عمومی');(byCat[c]=byCat[c]||[]).push(x);});
      Object.keys(byCat).sort().forEach(cat=>{
        const list=byCat[cat];
        const g=document.createElement('div');g.className='element-group element-group--saved';g.innerHTML=`<h4>★ ${esc(cat)}<span class="element-count">${list.length}</span></h4><div class="element-grid"></div>`;
        const grid=g.querySelector('.element-grid');
        list.forEach(entry=>{
          const b=document.createElement('button');b.className='add-el add-el--saved';b.type='button';b.title=`افزودن «${entry.name}» — کلیک: درج / دکمه‌ها: تغییر نام، کپی و حذف`;
          b.innerHTML=`<span class="add-el__label">${entry.blocks?'▣ ':''}${esc(entry.name)}</span><span class="add-el__tools"><span class="add-el__ren" data-ren-saved="${esc(entry.id)}" title="تغییر نام">✎</span><span class="add-el__dup" data-dup-saved="${esc(entry.id)}" title="کپی">⧉</span><span class="add-el__del" data-del-saved="${esc(entry.id)}" title="حذف">×</span></span>`;
          b.addEventListener('click',(e)=>{ if(e.target.closest('[data-del-saved],[data-dup-saved],[data-ren-saved]'))return; insertSavedBlock(entry); });
          grid.appendChild(b);
        });
        groups.appendChild(g);
        g.querySelectorAll('[data-del-saved]').forEach(x=>x.addEventListener('click',(e)=>{e.stopPropagation();deleteSavedBlock(x.dataset.delSaved);}));
        g.querySelectorAll('[data-dup-saved]').forEach(x=>x.addEventListener('click',(e)=>{e.stopPropagation();duplicateSavedBlock(x.dataset.dupSaved);}));
        g.querySelectorAll('[data-ren-saved]').forEach(x=>x.addEventListener('click',(e)=>{e.stopPropagation();renameSavedBlock(x.dataset.renSaved);}));
      });
    }
    Object.keys(cats).forEach(cat=>{const items=wanted.filter(x=>x[0]===cat);if(!items.length)return;
      const acc=accCats.includes(cat);
      const isOpen=acc?Boolean(libOpen[cat]||filter||items.some(x=>x[2]==='latestElements')):true; /* accordion cats start collapsed (unless searching) */
      const g=document.createElement('div');g.className='element-group'+(acc?' element-group--accordion':'')+(isOpen?' is-open':'');g.dataset.category=cat;
      g.innerHTML=`<h4${acc?' class="element-group__toggle" role="button" tabindex="0" aria-expanded="'+isOpen+'"':''}>${cats[cat]}<span class="element-count">${items.length}</span>${acc?'<span class="element-group__arrow" aria-hidden="true">⌄</span>':''}</h4><div class="element-grid"${acc&&!isOpen?' hidden':''}></div>`;
      if(acc){const t=g.querySelector('.element-group__toggle');const toggle=()=>{const nowOpen=!g.classList.contains('is-open');g.classList.toggle('is-open',nowOpen);t.setAttribute('aria-expanded',String(nowOpen));const grid=g.querySelector('.element-grid');if(grid)grid.hidden=!nowOpen;try{const st=JSON.parse(localStorage.getItem('rava.libAccordion')||'{}');st[cat]=nowOpen;localStorage.setItem('rava.libAccordion',JSON.stringify(st));}catch(_){}};t.addEventListener('click',toggle);t.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});}
      items.forEach(x=>{const b=document.createElement('button');b.className='add-el';b.type='button';b.textContent=x[1];b.draggable=true;b.dataset.elementType=x[2];b.title=`افزودن ${x[1]} — برای قرار دادن مستقیم روی Canvas بکش`;b.addEventListener('click',()=>addElement(x[2]));b.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',`element:${x[2]}`);e.dataTransfer.effectAllowed='copy';b.classList.add('dragging');});b.addEventListener('dragend',()=>b.classList.remove('dragging'));g.querySelector('.element-grid').appendChild(b);});groups.appendChild(g);});
  }
  let savingNow=false;
  async function save(){
    /* V104 - sub-page context: write working blocks back to the active sub-page, restore the product blocks for the payload, then swap back so the builder keeps editing the sub-page. */
    if(subActive){
      const subs=state.subPages=Array.isArray(state.subPages)?state.subPages:[];
      const sb=subs.find(x=>x.path===(subCtx()&&subCtx().path));
      if(sb)sb.blocks=state.blocks;
      const keep=state.blocks;
      state.blocks=spBackup||[];
      try{await saveCore();}finally{state.blocks=keep;}
      return;
    }
    return saveCore();
  }
  async function saveCore(){
    if(savingNow) return;                       // V90: block duplicate submits
    savingNow=true;
    const btn=document.getElementById('saveBtn');
    if(btn){btn.dataset.busy='1';btn.disabled=true;}
    window.__RAVA_BUILDER_SAVE_STATE__='saving';
    try{
      saveStatus.textContent='در حال ذخیره...';
      saveChip('saving');
      const res=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:window.BUILDER_KIND,index:window.BUILDER_INDEX,item:state,sub:subCtx()?subCtx().path:''})});
      const out=await res.json();
      if(!out.ok)throw new Error(out.error||'save failed');
      if(window.BUILDER_INDEX==='new'&&out.editUrl){window.BUILDER_INDEX=String(out.id||out.index);/* V136 — stable id */history.replaceState({},'',out.editUrl);showToast('محصول ساخته شد و Builder آماده ویرایش است');}
      saveStatus.textContent='ذخیره شد ✓';
      saveChip('saved');
      window.__RAVA_BUILDER_DIRTY__=false;
      window.__RAVA_BUILDER_SAVE_STATE__='saved';
      showToast('با موفقیت ذخیره شد');
    }catch(e){
      saveStatus.textContent='خطا در ذخیره';
      saveChip('error');
      window.__RAVA_BUILDER_SAVE_STATE__='error';
      showToast('خطا در ذخیره: '+e.message);
    }finally{
      savingNow=false;
      if(btn){delete btn.dataset.busy;btn.disabled=false;}
    }
  }
  function showToast(msg){toast.textContent=msg;toast.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.classList.remove('show'),1800);}
  function scheduleCanvasRender(){
    if(renderQueued)return;
    renderQueued=true;
    /* V118.1 — وقتی تب/وب‌ویو پنهان است، requestAnimationFrame هیچ‌وقت fire نمی‌شود و
       رندر بوم معلق می‌ماند (کاربر بعد از برگشت به تب، بوم کهنه می‌بیند). تایمر fallback
       تضمین می‌کند رندر حداکثر ۱۲۰ms بعد از تغییر انجام شود؛ rAF زودتر برسد flag جلوی
       دوباره‌کاری را می‌گیرد. */
    const flush=()=>{ if(!renderQueued) return; renderQueued=false; renderCanvas(); renderLayers(); syncSelectionClasses(); };
    requestAnimationFrame(flush);
    setTimeout(flush,120);
  }
  function renderAll(){pinStickyButtons();renderCanvas();renderLayers();updateInspector();syncSelectionClasses();}

  document.querySelectorAll('.device-switch button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.device-switch button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const d=btn.dataset.device;frame.className='canvas-frame '+d;frame.style.width='';const deviceLabels={mobile:'موبایل 390px',tablet:'تبلت 820px',desktop:'دسکتاپ',preview:'پیش‌نمایش'};const hint=document.getElementById('stageHint');if(hint){hint.textContent=deviceLabels[d]||d;hint.dataset.defaultHint=hint.textContent;}
    /* V100 — when returning to the mobile canvas, re-apply the pinned width preference (375/390/393/412/428/custom). */
    /* V124 — با عوض‌کردن دستگاه، پنل تنظیمات هم از نو رندر می‌شود؛
       این همان چیزی است که تیک‌های «صفحه» را در همهٔ دستگاه‌ها واقعی می‌کند. */
    renderCanvas();updateInspector();}));
  document.getElementById('undoBtn')?.addEventListener('click',undo);document.getElementById('redoBtn')?.addEventListener('click',redo);document.getElementById('saveBtn')?.addEventListener('click',save);document.getElementById('previewBtn')?.addEventListener('click',openRealPreview);
  document.getElementById('elementSearch')?.addEventListener('input',e=>renderElementLibrary(e.target.value));
  document.getElementById('globalBtn')?.addEventListener('click',()=>{selectedId=null;activeTab='design';updateInspector();});
  document.getElementById('closeInspector')?.addEventListener('click',()=>{selectedId=null;updateInspector();renderLayers();syncSelectionClasses();});
  document.querySelectorAll('.inspector-tabs button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.inspector-tabs button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');activeTab=btn.dataset.tab;updateInspector();}));
  document.getElementById('zoomMinus')?.addEventListener('click',()=>{zoom=Math.max(.65,zoom-.1);frame.style.zoom=zoom;document.getElementById('zoomValue').textContent=Math.round(zoom*100)+'%';});
  document.getElementById('zoomPlus')?.addEventListener('click',()=>{zoom=Math.min(1.5,zoom+.1);frame.style.zoom=zoom;document.getElementById('zoomValue').textContent=Math.round(zoom*100)+'%';});
  document.getElementById('focusBtn')?.addEventListener('click',()=>{if(selectedId)document.querySelector(`.builder-node[data-id="${selectedId}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});});
  document.getElementById('collapseLayers')?.addEventListener('click',()=>layers.classList.toggle('hidden'));
  canvas.addEventListener('click',e=>{if(!frame.classList.contains('preview')&&e.target===canvas){selectedId=null;updateInspector();renderLayers();syncSelectionClasses();}});
  /* V143 — native-feeling marquee selection. It only starts on empty canvas
     space, so normal element clicks and drag handles keep their old behavior. */
  (()=>{let marquee=null,start=null;
    const ensure=()=>{if(marquee)return;marquee=document.createElement('div');marquee.className='builder-marquee';canvas.appendChild(marquee);};
    canvas.addEventListener('pointerdown',e=>{
      if(frame.classList.contains('preview')||e.button!==0||e.target!==canvas)return;
      ensure();start={x:e.clientX,y:e.clientY,add:e.shiftKey||e.ctrlKey||e.metaKey};canvas.setPointerCapture?.(e.pointerId);
      marquee.hidden=false;marquee.style.left='0';marquee.style.top='0';marquee.style.width='0';marquee.style.height='0';e.preventDefault();
    });
    canvas.addEventListener('pointermove',e=>{
      if(!start)return;const cr=canvas.getBoundingClientRect(),x1=Math.min(start.x,e.clientX)-cr.left,y1=Math.min(start.y,e.clientY)-cr.top,x2=Math.max(start.x,e.clientX)-cr.left,y2=Math.max(start.y,e.clientY)-cr.top;
      marquee.style.left=x1+'px';marquee.style.top=y1+'px';marquee.style.width=(x2-x1)+'px';marquee.style.height=(y2-y1)+'px';
      const hits=[...canvas.querySelectorAll('.builder-node')].filter(n=>{const r=n.getBoundingClientRect();return r.left<x2+cr.left&&r.right>x1+cr.left&&r.top<y2+cr.top&&r.bottom>y1+cr.top;});
      if(!start.add)selectedIds.clear();hits.forEach(n=>selectedIds.add(n.dataset.id));selectedId=hits.at(-1)?.dataset.id||selectedId;syncSelectionClasses();renderLayers();
    });
    const end=()=>{if(!start)return;start=null;marquee.hidden=true;if(selectedIds.size>1)inspector.innerHTML=multiSelectionInspector();};
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  })();
  document.addEventListener('keydown',e=>{
    const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable;
    /* V122 — Undo/Redo کیبورد: Ctrl+Z واگرد، Ctrl+Shift+Z و Ctrl+Y انجام‌دوباره.
       stopPropagation تا لایهٔ builder-pro هم دوباره redo نزند (قبلاً هر دو هندلر
       اجرا می‌شدند و Ctrl+Shift+Z عملاً undo+redo = هیچ می‌شد). در داخل ادیتور
       contenteditable هم بیلدر-Undo برنده است تا تاریخچه یکپارچه بماند. */
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){
      e.preventDefault();e.stopPropagation();
      if(e.shiftKey)redo();else undo();
      return;
    }
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();e.stopPropagation();redo();return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'&&!typing){e.preventDefault();duplicateSelected();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='g'&&!typing){e.preventDefault();groupSelected();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='u'&&!typing){e.preventDefault();ungroupSelected();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&!typing&&selectedId){e.preventDefault();copySelected();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&!typing&&clipboardBlock){e.preventDefault();pasteSelected();}
    if((e.key==='Delete'||e.key==='Backspace')&&!typing&&(selectedIds.size>1)){e.preventDefault();deleteMulti();} else if((e.key==='Delete'||e.key==='Backspace')&&!typing&&selectedId)deleteSelected();
    if(!typing&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&selectedId&&(e.key==='ArrowUp'||e.key==='ArrowDown')){
      e.preventDefault();moveSibling(selectedId,e.key==='ArrowUp'?-1:1);
    }
  });

  /* V118 — سوییچ برنامه‌ای به یک تب از پنل چپ (برای «الگوهای شما») */
  function showLeftTabNow(name){
    const btn=document.querySelector(`.bp-left-tabs button[data-lefttab="${name}"]`);
    if(btn) btn.click();
  }

  function installBuilder2Toolbar(){
    const top=document.querySelector('.builder-top-actions'); if(!top||document.getElementById('builder2Tools'))return;
    const box=document.createElement('div'); box.id='builder2Tools'; box.className='builder2-tools';
    box.innerHTML=`<button class="mini-btn" id="addGroupBtn" title="گروه جدید">گروه</button><button class="mini-btn" id="undo2" title="تاریخچه Undo">تاریخچه</button><span class="selection-chip" id="selectionChip">1</span>`;
    top.insertBefore(box, top.firstChild);
    box.querySelector('#addGroupBtn').onclick=()=>{const g=defaultBlock('group');state.blocks.push(g);snapshot();renderAll();select(g.id);};
    box.querySelector('#undo2').onclick=()=>{activeTab='advanced';updateInspector();showToast('History در Undo/Redo بالای صفحه قرار دارد');};
  }
  installBuilder2Toolbar();
  installDiagnosticsButton();
  /* V122 — runtime پلیر صوت روی بوم بیلدر (همان رفتار صفحهٔ منتشرشده):
     هر بار رندر بوم، پلیرهای جدید را می‌باند؛ idempotent با data-rau-init. */
  (function installCanvasAudioRuntime(){
    if(window.__RAVA_AUDIO_RUNTIME__) return;
    window.__RAVA_AUDIO_RUNTIME__=true;
    const fmt=(s)=>{if(!isFinite(s)||s<0)s=0;s=Math.floor(s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
    const stopAll=(ex)=>canvas.querySelectorAll('.rava-audio audio').forEach(a=>{if(a!==ex&&!a.paused)a.pause();});
    const bind=(rootEl)=>rootEl.querySelectorAll('.rava-audio').forEach(el=>{
      if(el.dataset.rauInit)return; el.dataset.rauInit='1';
      const a=el.querySelector('audio'); if(!a)return;
      const play=el.querySelector('.rau-play'),fill=el.querySelector('.rau-fill'),thumb=el.querySelector('.rau-thumb'),track=el.querySelector('.rau-track'),cur=el.querySelector('.rau-cur'),dur=el.querySelector('.rau-dur'),wave=el.querySelector('.rau-wave');
      const paint=()=>{const d=a.duration||0,ct=a.currentTime||0,p=d>0?Math.min(100,ct/d*100):0;if(fill)fill.style.width=p+'%';if(thumb)thumb.style.left=p+'%';if(cur)cur.textContent=fmt(ct);if(dur)dur.textContent=(isFinite(d)&&d>0)?fmt(d):'--:--';};
      a.addEventListener('loadedmetadata',paint);a.addEventListener('timeupdate',paint);
      a.addEventListener('play',()=>{el.classList.add('is-playing');play?.classList.add('is-playing');stopAll(a);});
      a.addEventListener('pause',()=>{el.classList.remove('is-playing');play?.classList.remove('is-playing');});
      a.addEventListener('ended',()=>{el.classList.remove('is-playing');play?.classList.remove('is-playing');});
      play?.addEventListener('click',()=>{if(a.paused){stopAll(a);a.play().catch(()=>{});}else a.pause();});
      const seek=(ev)=>{if(!track||!isFinite(a.duration)||a.duration<=0)return;const r=track.getBoundingClientRect();const x=(ev.touches&&ev.touches[0]?ev.touches[0].clientX:ev.clientX)-r.left;const ratio=Math.max(0,Math.min(1,x/r.width));a.currentTime=ratio*a.duration;paint();};
      track?.addEventListener('pointerdown',(ev)=>{seek(ev);const mv=(e2)=>seek(e2);const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);};window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);});
      wave?.addEventListener('pointerdown',(ev)=>{if(!isFinite(a.duration)||a.duration<=0)return;const r=wave.getBoundingClientRect();const x=(ev.touches&&ev.touches[0]?ev.touches[0].clientX:ev.clientX)-r.left;const ratio=Math.max(0,Math.min(1,x/r.width));a.currentTime=ratio*a.duration;paint();});
      el.querySelectorAll('[data-rau-skip]').forEach(b=>b.addEventListener('click',()=>{const d=Number(b.getAttribute('data-rau-skip'))||0;a.currentTime=Math.max(0,Math.min(a.duration||0,a.currentTime+d));paint();}));
      paint();
    });
    bind(canvas);
    /* V122.1 — bind باید بعد از *هر* رندر بوم اجرا شود، نه فقط بعد از scheduleCanvasRender؛
       چون renderAll و سوییچ دستگاه مستقیم renderCanvas را صدا می‌زنند. وگرنه پلیر صوت
       بلافاصله بعد از افزودن عنصر یا کلیک پریست بی‌پاسخ می‌ماند تا اولین ویرایش بعدی. */
    const origRenderCanvas=renderCanvas;
    renderCanvas=function(){const out=origRenderCanvas.apply(this,arguments);setTimeout(()=>{try{bind(canvas);}catch(_){}try{/* V132 — بعد از هر رندر بوم، عناصر animated دوباره observe می‌شوند (idempotent) */window.RAVA_ANIMATIONS&&window.RAVA_ANIMATIONS.observe(canvas);}catch(_){}},0);return out;};
  })();
  renderElementLibrary();renderAll();
  /* Preload the full font library once at builder boot. Existing typography,
     color, opacity, line-height and spacing controls remain untouched. */
  preloadVisibleFonts();
  /* V101 — warm up font loading: families already used on the page load once
     at boot so the canvas shows real faces immediately. */
  try{(function collectStateFonts(n,out){if(!n||typeof n!=='object')return out;if(Array.isArray(n)){for(const x of n)collectStateFonts(x,out);return out;}for(const[k,v]of Object.entries(n)){if(typeof v==='string'&&/(^|\.)fontFamily$|FontFamily$/.test(k))out.add(v);if(v&&typeof v==='object')collectStateFonts(v,out);}return out;})(state,new Set()).forEach(ensureFontLoaded);}catch(_){}
  window.__RAVA_BUILDER_BOOT_OK__=true;
  if(new URLSearchParams(location.search).get('doctor')==='1') runBuilderDiagnostics();
})();

/* V64 — Builder Pro UX layer: navigation, mobile drawers, canvas tools, smart drag-insert */
(() => {
  const app=document.querySelector('.builder-app');
  const api=window.__RAVA_BUILDER_API__;
  if(!app||!api)return;
  const canvas=document.getElementById('canvas');
  const frame=document.getElementById('canvasFrame');
  const stage=document.querySelector('.builder-stage');
  const scroll=document.querySelector('.stage-scroll');
  const left=document.querySelector('.builder-panel--left');
  const right=document.querySelector('.builder-panel--right');
  const topActions=document.querySelector('.builder-top-actions');
  const stageToolbar=document.querySelector('.stage-toolbar');
  const layers=document.getElementById('layers');
  const toast=document.getElementById('toast');
  const saveStatus=document.getElementById('saveStatus');
  const originalText=saveStatus?.textContent||'ذخیره نشده';
  let gridOn=false;
  let focusOn=false;
  let activeDrawer=null;
  let collapsedLayers=new Set();
  let layerFilter='';
  let mobileInspectorTimer=null;

  const icon={
    layers:'▤',elements:'＋',grid:'⌗',focus:'⛶',fit:'⌖',desktop:'▭',mobile:'▯',preview:'▷',close:'×',duplicate:'⧉',delete:'⌫',up:'↑',down:'↓',lock:'🔒',hide:'◉'
  };

  function qs(sel,root=document){return root.querySelector(sel)}
  /* V200 — the media picker below used esc()/attr() from the first IIFE, which are out of scope here → ReferenceError as soon as the library had files. */
  function esc(v=''){ return String(v).replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m])); }
  function attr(v=''){ return esc(v).replace(/`/g,'&#96;'); }
  function qsa(sel,root=document){return [...root.querySelectorAll(sel)]}
  function isMobile(){return window.matchMedia('(max-width: 920px)').matches}
  function typing(){const a=document.activeElement;return ['INPUT','TEXTAREA','SELECT'].includes(a?.tagName)||a?.isContentEditable}
  function show(msg){api.showToast(msg)}

  function makeButton(id,title,label,cls='v64-tool-btn'){
    const b=document.createElement('button');b.id=id;b.type='button';b.className=cls;b.title=title;b.setAttribute('aria-label',title);b.innerHTML=`<span class="v64-tool-icon">${label}</span><span class="v64-tool-label">${title}</span>`;return b;
  }

  function injectTopTools(){
    if(!topActions||qs('#builderV64Tools'))return;
    const box=document.createElement('div');box.id='builderV64Tools';box.className='builder-v64-tools';
    const layersBtn=makeButton('v64LayersBtn','لایه\u200cها',icon.layers);
    const elementsBtn=makeButton('v64ElementsBtn','عناصر',icon.elements);
    const gridBtn=makeButton('v64GridBtn','گرید',icon.grid);
    const fitBtn=makeButton('v64FitBtn','تناسب',icon.fit);
    const focusBtn=makeButton('v64FocusBtn','تمرکز',icon.focus);
    [layersBtn,elementsBtn,gridBtn,fitBtn,focusBtn].forEach(b=>box.appendChild(b));
    topActions.insertBefore(box,topActions.firstChild);
    layersBtn.onclick=()=>toggleDrawer('left');
    elementsBtn.onclick=()=>toggleDrawer('left');
    gridBtn.onclick=toggleGrid;
    fitBtn.onclick=fitCanvas;
    focusBtn.onclick=toggleFocus;
  }

  function injectLayerTools(){
    if(!layers||qs('#v64LayerTools'))return;
    const host=layers.parentElement;
    const box=document.createElement('div');box.id='v64LayerTools';box.className='builder-v64-layer-tools';
    box.innerHTML=`<div class="v64-layer-search"><span>⌕</span><input type="search" id="v64LayerSearch" placeholder="جست‌وجوی لایه..."/><button type="button" id="v64LayerClear" aria-label="پاک کردن">×</button></div><div class="v64-layer-actions"><button type="button" id="v64CollapseAll">بستن گروه‌ها</button><button type="button" id="v64ExpandAll">بازکردن</button></div>`;
    host.insertBefore(box,layers);
    qs('#v64LayerSearch').addEventListener('input',e=>{layerFilter=e.target.value.trim().toLowerCase();decorateLayers();});
    qs('#v64LayerClear').onclick=()=>{qs('#v64LayerSearch').value='';layerFilter='';decorateLayers();};
    qs('#v64CollapseAll').onclick=()=>{qsa('.layer-item[data-has-children="true"]',layers).forEach(r=>collapsedLayers.add(r.dataset.layerId));decorateLayers();};
    qs('#v64ExpandAll').onclick=()=>{collapsedLayers.clear();decorateLayers();};
  }

  function layerDepth(row){return Number(row.dataset.layerDepth||0)}
  function decorateLayers(){
    if(!layers)return;
    const rows=qsa('.layer-item',layers);
    let hiddenUntilDepth=null;
    rows.forEach((row,i)=>{
      row.classList.remove('v64-filter-hidden');
      const depth=layerDepth(row);
      if(hiddenUntilDepth!=null && depth>hiddenUntilDepth){row.classList.add('v64-collapsed-child');row.setAttribute('aria-hidden','true');return;}
      hiddenUntilDepth=null;
      const matches=!layerFilter || (row.dataset.layerLabel||'').includes(layerFilter) || (row.dataset.layerType||'').includes(layerFilter);
      if(!matches)row.classList.add('v64-filter-hidden');
      const has=row.dataset.hasChildren==='true';
      let toggle=row.querySelector('.v64-layer-fold');
      if(has&&!toggle){
        toggle=document.createElement('button');toggle.type='button';toggle.className='v64-layer-fold layer-icon-btn';toggle.title='باز/بستن';toggle.setAttribute('aria-label','باز/بستن');
        toggle.addEventListener('click',e=>{e.stopPropagation();if(collapsedLayers.has(row.dataset.layerId))collapsedLayers.delete(row.dataset.layerId);else collapsedLayers.add(row.dataset.layerId);decorateLayers();});
        row.insertBefore(toggle,row.firstElementChild);
      }
      if(toggle){toggle.textContent=collapsedLayers.has(row.dataset.layerId)?'＋':'−';toggle.style.display=has?'inline-grid':'none';}
      row.style.paddingRight=(8+depth*14)+'px';
      if(has&&collapsedLayers.has(row.dataset.layerId))hiddenUntilDepth=depth;
    });
  }

  function injectMobileChrome(){
    if(qs('#builderV64Backdrop'))return;
    const backdrop=document.createElement('div');backdrop.id='builderV64Backdrop';backdrop.className='builder-v64-backdrop';backdrop.hidden=true;
    const bar=document.createElement('nav');bar.id='builderV64Mobilebar';bar.className='builder-v64-mobilebar';bar.setAttribute('aria-label','Builder controls');
    bar.innerHTML=`<button type="button" data-open="left"><span>${icon.elements}</span><b>عناصر</b></button><button type="button" data-open="right"><span>✎</span><b>ویرایش</b></button><button type="button" data-action="undo"><span>↶</span><b>واگرد</b></button><button type="button" data-action="preview"><span>${icon.preview}</span><b>پیش‌نمایش</b></button>`;
    app.append(backdrop,bar);
    backdrop.addEventListener('click',closeDrawers);
    qsa('[data-open]',bar).forEach(b=>b.addEventListener('click',()=>toggleDrawer(b.dataset.open)));
    qs('[data-action="undo"]',bar).onclick=()=>api.undo();
    qs('[data-action="preview"]',bar).onclick=()=>qs('#previewBtn')?.click();
  }

  function closeDrawers(){
    activeDrawer=null;left?.classList.remove('is-mobile-open');right?.classList.remove('is-mobile-open');
    const bd=qs('#builderV64Backdrop');if(bd){bd.hidden=true;bd.classList.remove('is-visible');}
    document.body.classList.remove('builder-v64-drawer-open');
  }
  function toggleDrawer(which){
    if(!isMobile())return;
    const panel=which==='left'?left:right;if(!panel)return;
    const already=activeDrawer===which;
    closeDrawers();
    if(already)return;
    activeDrawer=which;panel.classList.add('is-mobile-open');
    const bd=qs('#builderV64Backdrop');if(bd){bd.hidden=false;requestAnimationFrame(()=>bd.classList.add('is-visible'));}
    document.body.classList.add('builder-v64-drawer-open');
  }

  function toggleGrid(){
    gridOn=!gridOn;app.classList.toggle('builder-v64-grid-on',gridOn);qs('#v64GridBtn')?.classList.toggle('active',gridOn);show(gridOn?'شبکه‌ی Canvas فعال شد':'شبکه‌ی Canvas خاموش شد');
  }
  function fitCanvas(){
    const avail=Math.max(280,(stage?.clientWidth||1000)-70);
    const base=frame?.classList.contains('mobile')?390:980;
    const z=Math.max(.65,Math.min(1,avail/base));
    frame.style.zoom=z;
    const out=qs('#zoomValue');if(out)out.textContent=Math.round(z*100)+'%';
  }
  function toggleFocus(){
    focusOn=!focusOn;app.classList.toggle('builder-v64-focus',focusOn);qs('#v64FocusBtn')?.classList.toggle('active',focusOn);if(focusOn)closeDrawers();}

  function createSelectionToolbar(){
    if(qs('#builderV64SelectionBar'))return null;
    const bar=document.createElement('div');bar.id='builderV64SelectionBar';bar.className='builder-v64-selectionbar';bar.setAttribute('role','toolbar');
    bar.innerHTML=`<span class="v64-selection-label">—</span><div class="v64-selection-actions"><button data-sel="up" title="بالا">↑</button><button data-sel="down" title="پایین">↓</button><button data-sel="duplicate" title="تکثیر">⧉</button><button data-sel="lock" title="قفل">🔒</button><button data-sel="hide" title="مخفی در ادیتور">◉</button><button data-sel="delete" title="حذف">⌫</button></div>`;
    app.appendChild(bar);
    bar.addEventListener('click',e=>{
      const act=e.target.closest('[data-sel]')?.dataset.sel;if(!act)return;
      const s=api.getSelection();const id=s.id;if(!id)return;const entry=api.find(id);if(!entry)return;
      if(act==='up')api.moveSibling(id,-1);
      if(act==='down')api.moveSibling(id,1);
      if(act==='duplicate')api.duplicateSelected();
      if(act==='delete')api.deleteSelected();
      if(act==='lock'){entry.b.locked=!entry.b.locked;api.snapshot();api.renderAll();}
      if(act==='hide'){entry.b.hiddenEditor=!entry.b.hiddenEditor;api.snapshot();api.renderAll();}
      if(act==='convert'){/* V117 — تبدیل سکشن/گروه به کالمنز از همان نوار شناور */api.setActiveTab('content');api.select(id);setTimeout(()=>document.getElementById('sectionToColumns')?.click(),30);}
      updateSelectionBar();
    });
    return bar;
  }
  function updateSelectionBar(){
    const bar=qs('#builderV64SelectionBar');if(!bar)return;
    const s=api.getSelection();const ids=s.ids||[];const id=s.id;
    if(!id||!canvas||frame.classList.contains('preview')){bar.classList.remove('show');return;}
    const node=canvas.querySelector(`.builder-node[data-id="${CSS.escape(id)}"]`);if(!node){bar.classList.remove('show');return;}
    const entry=api.find(id);if(!entry){bar.classList.remove('show');return;}
    const rect=node.getBoundingClientRect();const appRect=app.getBoundingClientRect();
    const y=Math.max(appRect.top+72,rect.top-appRect.top-56);const x=Math.max(8,Math.min(app.clientWidth-250,rect.left-appRect.left));
    const type=entry.b.type;
    bar.querySelector('.v64-selection-actions [data-sel=convert]')?.remove();
    if(['section','group'].includes(type)){/* V117 — دکمهٔ تبدیل، فقط برای سکشن/گروه */
      const cv=document.createElement('button');cv.dataset.sel='convert';cv.title='تبدیل به کالمن';cv.textContent='⇄';
      bar.querySelector('.v64-selection-actions')?.prepend(cv);
    }
    bar.style.transform=`translate(${x}px,${y}px)`;bar.querySelector('.v64-selection-label').textContent=ids.length>1?`${ids.length} عنصر`:String(node.querySelector('.builder-node__handle')?.textContent||'عنصر');bar.classList.add('show');
  }

  function installCanvasDnD(){
    if(!canvas||canvas.dataset.v64Dnd)return;canvas.dataset.v64Dnd='1';
    canvas.addEventListener('dragover',e=>{
      const dt=e.dataTransfer?.types||[];if(![...dt].includes('text/plain'))return;
      const value=e.dataTransfer.getData('text/plain');if(!value.startsWith('element:'))return;
      e.preventDefault();e.dataTransfer.dropEffect='copy';canvas.classList.add('v64-drop-ready');
    });
    canvas.addEventListener('dragleave',e=>{if(!canvas.contains(e.relatedTarget))canvas.classList.remove('v64-drop-ready');});
    canvas.addEventListener('drop',e=>{
      const value=e.dataTransfer.getData('text/plain');if(!value.startsWith('element:'))return;
      e.preventDefault();e.stopPropagation();canvas.classList.remove('v64-drop-ready');
      const type=value.slice(8);const col=e.target.closest('.column-drop-zone');
      if(col?.dataset.parentId){const parent=api.find(col.dataset.parentId)?.b;if(parent){parent.activeColumn=Number(col.dataset.column||0);api.select(parent.id);api.addElementToTarget(type,parent.id,'column');return;}}
      const target=e.target.closest('.builder-node');
      if(target?.dataset.id){const entry=api.find(target.dataset.id);if(entry){const b=entry.b;if(['section','group','stickySection','stickyColumn','popupSection'].includes(b.type))api.addElementToTarget(type,b.id,'inside');else api.addElementToTarget(type,b.id,'after');return;}}
      api.addElement(type,{targetId:null});
    });
  }

  function openInspectorOnMobile(id){if(!isMobile()||!id)return;api.select(id);clearTimeout(mobileInspectorTimer);mobileInspectorTimer=setTimeout(()=>toggleDrawer('right'),20);}
  canvas?.addEventListener('click',e=>{
    if(frame.classList.contains('preview'))return;
    const node=e.target.closest('.builder-node');
    if(node&&isMobile())openInspectorOnMobile(node.dataset.id);
    else if(!node&&isMobile())closeDrawers();
  },true);

  function keyboard(){
    document.addEventListener('keydown',e=>{
      if(typing())return;
      const sel=api.getSelection();
      if(e.key==='Escape'){closeDrawers();if(focusOn)toggleFocus();return;}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();qs('#elementSearch')?.focus();return;}
      if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='p'){e.preventDefault();qs('#previewBtn')?.click();return;}
      if(!sel.id)return;
      if(e.key==='ArrowUp'){e.preventDefault();api.moveSibling(sel.id,-1);}
      if(e.key==='ArrowDown'){e.preventDefault();api.moveSibling(sel.id,1);}
      if(e.key==='Enter'&&isMobile()){e.preventDefault();toggleDrawer('right');}
    });
  }

  // (V90) The V64 save-indicator experiment was removed: it detached #saveStatus
  // from the DOM — the very node the core writes status into — and left a polling
  // interval behind. The save dot in the topbar replaces it.

  function monkeyPatchLayerRender(){
    // renderLayers is kept authoritative by core; re-decoration is intentionally additive.
    const original=api.renderLayers;
    api.renderLayers=function(){original();decorateLayers();updateSelectionBar();};
  }

  function syncHistoryButtons(){
    const h=api.getHistory();
    const u=document.getElementById('undoBtn'),r=document.getElementById('redoBtn');
    if(u){u.disabled=h.undo<=0;u.title=h.undo?`واگرد (${h.undo})`:'واگرد';}
    if(r){r.disabled=h.redo<=0;r.title=h.redo?`انجام دوباره (${h.redo})`:'انجام دوباره';}
  }
  function keepSelectionBarFresh(){
    const refresh=()=>requestAnimationFrame(()=>{updateSelectionBar();syncHistoryButtons();});
    window.addEventListener('resize',refresh,{passive:true});
    scroll?.addEventListener('scroll',refresh,{passive:true});
    canvas?.addEventListener('click',refresh,true);
    const obs=new MutationObserver(refresh);obs.observe(canvas,{childList:true,subtree:true});
    const lob=new MutationObserver(()=>requestAnimationFrame(()=>{decorateLayers();updateSelectionBar();syncHistoryButtons();}));
    if(layers)lob.observe(layers,{childList:true,subtree:true});
  }

  function installMediaPicker(){
    const root=qs('#v68MediaPicker'); if(!root||root.dataset.ready==='1') return;
    root.dataset.ready='1'; const grid=qs('#v68PickerGrid',root), search=qs('#v68PickerSearch',root), type=qs('#v68PickerType',root); let targetKey=''; let items=[];
    const close=()=>{root.hidden=true;document.body.classList.remove('builder-v68-picker-open');};
    qs('#v68PickerClose',root)?.addEventListener('click',close);qs('#v68PickerCancel',root)?.addEventListener('click',close);root.addEventListener('click',e=>{if(e.target===root)close()});
    function render(){const q=(search?.value||'').trim().toLowerCase(), t=type?.value||'all'; const shown=items.filter(m=>(t==='all'||m.type===t)&&(!q||`${m.name||''} ${m.folder||''} ${(m.tags||[]).join(' ')}`.toLowerCase().includes(q)));grid.innerHTML=shown.length?shown.map(m=>`<button type="button" class="v68-picker-item" data-picker-id="${attr(m.id)}"><span class="v68-picker-thumb">${m.type==='image'?`<img src="${attr(m.url)}" alt="">`:`<span>${esc(m.type||'FILE')}</span>`}</span><span><strong>${esc(m.name||'Media')}</strong><small>${esc(m.folder||'بدون پوشه')}</small></span></button>`).join(''):`<div class="v68-picker-empty">رسانه‌ای پیدا نشد.</div>`;grid.querySelectorAll('[data-picker-id]').forEach(b=>b.addEventListener('click',()=>{const m=items.find(x=>x.id===b.dataset.pickerId);if(!m)return;setFieldByPath(targetKey,m.url||'');close();}));}
    async function open(key){targetKey=key||'';root.hidden=false;document.body.classList.add('builder-v68-picker-open');search.value='';try{const r=await fetch('/api/media',{cache:'no-store'});const o=await r.json();items=Array.isArray(o.items)?o.items:[];render();setTimeout(()=>search?.focus(),20);}catch{grid.innerHTML='<div class="v68-picker-empty">خطا در دریافت Media Library.</div>';}}
    search?.addEventListener('input',render);type?.addEventListener('change',render);
    document.addEventListener('click',e=>{const b=e.target.closest('[data-media-open]');if(!b)return;e.preventDefault();e.stopPropagation();open(b.dataset.mediaOpen);});
    /* V122 — پریست‌های صوت (delegated: بعد از هر رندر بوم/پنل هم کار می‌کند) */
    document.addEventListener('click',e=>{
      const btn=e.target.closest('[data-audio-preset]'); if(!btn) return;
      const A=window.__RAVA_BUILDER_API__; if(!A) return;
      const sel=A.getSelection(); const f=sel&&sel.id?(A.find(sel.id)||{}).b:null; if(!f||f.type!=='audio') return;
      const presets={
        default:{bg:'#F7F7FB',borderColor:'#EAECF0',radius:999,audioAccent:'#7C3AED',audioAccent2:'#4F46E5',titleColor:'#101828',padY:12,padX:16},
        podcast:{bg:'#FFF6EC',borderColor:'#F5E0C8',radius:24,audioAccent:'#EA580C',audioAccent2:'#F59E0B',titleColor:'#271A10',padY:18,padX:20},
        seminar:{bg:'#0B1220',borderColor:'#24304A',radius:24,audioAccent:'#8B5CF6',audioAccent2:'#D946EF',titleColor:'#F8FAFC',padY:18,padX:20}
      };
      f.audioVariant=btn.dataset.audioPreset;
      Object.assign(f,presets[f.audioVariant]||presets.default);
      A.snapshot();A.renderAll();
      A.showToast('پریست صوت اعمال شد: '+(btn.querySelector('b')?.textContent||f.audioVariant));
    });
    window.addEventListener('message',e=>{if(e.data?.type==='RAVA_MEDIA_PICKED'&&e.data.media?.url&&targetKey)setFieldByPath(targetKey,e.data.media.url);});
  }
  function setFieldByPath(key,value){
    const el=qs(`[data-bind="${CSS.escape(String(key))}"]`); if(!el)return;
    el.value=String(value||''); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function init(){
    try{localStorage.removeItem('rava.canvasWidth');localStorage.removeItem('rava.canvasPinned');}catch(_){}
    injectTopTools();injectLayerTools();injectMobileChrome();createSelectionToolbar();monkeyPatchLayerRender();installCanvasDnD();installMediaPicker();keyboard();keepSelectionBarFresh();
    api.renderLayers();
    syncHistoryButtons();
    fitCanvas();
    window.addEventListener('resize',()=>{if(!isMobile()&&activeDrawer)closeDrawers();});
  }
  init();
})();


/* V87 — Builder interaction recovery + responsive panel hardening */
(() => {
  const app=document.querySelector('.builder-app');
  const api=window.__RAVA_BUILDER_API__;
  if(!app || !api) return;

  const left=document.querySelector('.builder-panel--left');
  const right=document.querySelector('.builder-panel--right');
  const inspector=document.getElementById('inspector');
  const frame=document.getElementById('canvasFrame');
  const canvas=document.getElementById('canvas');

  const mobile=()=>window.matchMedia('(max-width:920px)').matches;
  const openRight=()=>{
    if(!mobile() || !right) return;
    right.classList.add('is-mobile-open');
    const bd=document.getElementById('builderV64Backdrop');
    if(bd){bd.hidden=false;requestAnimationFrame(()=>bd.classList.add('is-visible'));}
  };

  /* Selecting from Layers / adding an element should always expose its inspector on touch. */
  const originalSelect=api.select;
  if(!api.__v87SelectWrapped){
    api.select=function(id){
      const result=originalSelect(id);
      if(mobile() && id){
        requestAnimationFrame(openRight);
      }
      return result;
    };
    api.__v87SelectWrapped=true;
  }

  /* Prevent accidental canvas zoom/drag state from leaving the editor feeling frozen. */
  if(canvas && !canvas.dataset.v87Recovery){
    canvas.dataset.v87Recovery='1';
    canvas.addEventListener('pointerup',()=>{document.querySelectorAll('.dragging,.drop-target').forEach(x=>x.classList.remove('dragging','drop-target'));},{passive:true});
  }

  /* Keep the inspector usable even when the viewport is short or browser UI is present. */
  const harden=()=>{
    if(!app) return;
    if(mobile()){
      if(left) left.style.maxHeight='calc(100dvh - 64px)';
      if(right) right.style.maxHeight='min(78dvh,720px)';
      if(inspector) inspector.style.minHeight='120px';
      if(frame) frame.style.maxWidth='calc(100vw - 20px)';
    } else {
      if(left) left.style.maxHeight='';
      if(right) right.style.maxHeight='';
      if(inspector) inspector.style.minHeight='';
      if(frame) frame.style.maxWidth='';
    }
  };
  harden();
  window.addEventListener('resize',harden,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(harden,80),{passive:true});

  /* If an individual inspector control throws, keep the Builder alive and report it instead of
     leaving a half-rendered panel with apparently dead controls. */
  window.addEventListener('error',e=>{
    if(e?.error && /Builder|render|Inspector/i.test(String(e.error.stack||e.message||''))){
      console.error('V87 Builder recovery',e.error||e.message);
    }
  });

  document.documentElement.dataset.ravaBuilderVersion='V87';
})();

/* V104 - boot: if the builder was opened for a specific sub-page, swap the canvas to that sub-page blocks once ready. */
(function(){const bootFn=()=>{try{if(window.BUILDER_CONTEXT&&window.BUILDER_CONTEXT.path&&typeof window.__openSubInBuilder==='function'){const api=window.__RAVA_BUILDER_API__;const st=api&&api.getState();const subs=(st&&Array.isArray(st.subPages))?st.subPages:[];const ix=subs.findIndex(x=>x.path===window.BUILDER_CONTEXT.path);if(ix>=0)window.__openSubInBuilder(ix);}}catch(e){console.error(e);}};if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',()=>setTimeout(bootFn,60));}else{setTimeout(bootFn,60);}})();
