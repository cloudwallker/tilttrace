/* The UI deliberately keeps all decisions in memory; no requests or storage. */
(function () {
  'use strict';
  const engine = window.TiltTrace;
  const DEMO = {schemaVersion:1,title:'Choose a place to work',criteria:[
    {name:'Focus',weight:40,locked:false},{name:'Cost',weight:30,locked:false},
    {name:'Commute',weight:20,locked:false},{name:'Flexibility',weight:10,locked:false}],
    options:[{name:'Quiet studio',scores:[9,4,8,5]},{name:'Shared hub',scores:[6,8,7,9]},
      {name:'Home desk',scores:[5,10,10,3]}]};
  const words = {
    zh:{skip:'跳到实验区',brandSub:'倾向轨迹',offline:'离线 · 零依赖',import:'导入',export:'导出 JSON ↗',
      eyebrow:'A LAB FOR THE MOMENT YOU CHANGE YOUR MIND',headline:'一个选择，\n离改变主意有多远？',
      lead:'找出让首选失去领先的最小偏好变化。每个结果，都有一条可以重放的轨迹。',
      nearest:'距最近的追平边界',distanceDefinition:'pp = 重新分配的权重点数',yourLens:'你的偏好镜头',
      reset:'恢复示例 ↺',decisionTitle:'这次要决定什么',weightHint:'权重总和始终为 100%。锁定你不能妥协的标准。',
      total:'合计',currentLeader:'当前首选',rankingNote:'排名来自你给出的分数与偏好。分值越高，代表越符合你的需要。',
      boundaries:'让选择动摇的轨迹',undo:'撤回上次预览 ↶',boundaryHint:'保持分数不变，只转移未锁定的权重。这里计算追平初始首选的边界；另一个选项仍可能排得更高。',
      scores:'给每个选择打分',scoreScale:'0–10 · 越高越好',scoreHint:'点选名称和分值即可编辑。成本、耗时等负向指标，请先转换成满意度分数。',
      privacy:'仅在当前页面内存中计算 · 无账号、无上传、无自动保存',method:'计算方法 ↗',
      lock:'锁定',locked:'已锁',option:'选择',preview:'重放这条轨迹 →',unreachable:'无法追平',
      tie:'已经并列，无需转移权重。',canWin:'这是追平边界；继续沿有利方向转移，便可超越初始首选。',
      tieOnly:'最多只能追平，当前锁定条件与分数不允许超越初始首选。',
      impossible:'当前分数与锁定条件下，没有可追平的权重方案。',
      nearestNote:(n,l)=>`最少转移这些权重，${n} 就能追平 ${l}。`,
      noBoundary:'在当前分数和锁定条件下，首选不会被其他选择追平。',
      lockCount:n=>`${n} 项已锁定`,weightLabel:n=>`${n} 权重`,lockLabel:n=>`锁定 ${n}`,nameLabel:n=>`名称：${n}`,
      scoreLabel:(n,c)=>`${n} / ${c} 分值`,previewed:'已应用追平方案。下方显示新权重与排名，可撤回上次预览。',
      undone:'已恢复预览前的权重。',loaded:'已导入，所有计算均在本地完成。',resetDone:'已恢复示例。',
      saved:'JSON 已导出。关闭或刷新页面前，请导出需要保留的数据。',bad:'导入失败：',
      fileLarge:'文件必须小于或等于 64 KiB。',badScore:'分值必须是 0 到 10 之间的数值。',
      badName:'名称不能为空，且最多 60 个字符。',badTitle:'标题不能为空，且最多 120 个字符。'},
    en:{skip:'Skip to workspace',brandSub:'PREFERENCE BOUNDARY LAB',offline:'Offline · Zero dependencies',import:'Import',export:'Export JSON ↗',
      eyebrow:'A LAB FOR THE MOMENT YOU CHANGE YOUR MIND',headline:'How far are you from\nchanging your mind?',
      lead:'Find the smallest preference shift that costs your choice its lead. Every result comes with a trace you can replay.',
      nearest:'NEAREST TIE BOUNDARY',distanceDefinition:'pp = weight points reallocated',yourLens:'Your preference lens',reset:'Reset example ↺',
      decisionTitle:'THE DECISION ON YOUR DESK',weightHint:'Weights always add up to 100%. Lock the criteria you cannot compromise on.',
      total:'Total',currentLeader:'CURRENT FIRST CHOICE',rankingNote:'The ranking reflects your scores and preferences. Higher scores mean a better fit for your needs.',
      boundaries:'Traces that challenge your choice',undo:'Undo last replay ↶',
      boundaryHint:'Keep scores fixed and move only unlocked weight. Each boundary ties the initial leader; a third option may still rank higher.',
      scores:'Score each possibility',scoreScale:'0–10 · Higher is better',scoreHint:'Edit names and scores directly. Convert costs or time into satisfaction scores first.',
      privacy:'Computed in page memory · No accounts, uploads, or autosave',method:'How it works ↗',
      lock:'Lock',locked:'Locked',option:'Option',preview:'Replay this trace →',unreachable:'Unreachable',
      tie:'Already tied. No weight needs to move.',canWin:'This is a tie boundary. Further favorable shifts can beat the initial leader.',
      tieOnly:'A tie is possible, but these scores and locks prevent beating the initial leader.',
      impossible:'No weight allocation can reach a tie with these scores and locks.',
      nearestNote:(n,l)=>`Reallocate this much weight for ${n} to tie ${l}.`,
      noBoundary:'No other option can tie the current leader with these scores and locks.',
      lockCount:n=>`${n} locked`,weightLabel:n=>`${n} weight`,lockLabel:n=>`Lock ${n}`,nameLabel:n=>`Name: ${n}`,
      scoreLabel:(n,c)=>`${n} / ${c} score`,previewed:'Tie allocation applied. The weights and ranking below show its effect. You can undo the last replay.',
      undone:'Restored the weights before replay.',loaded:'Imported. All calculations stay on this device.',resetDone:'Example restored.',
      saved:'JSON exported. Export any work you want to keep before closing or refreshing the page.',bad:'Import failed: ',
      fileLarge:'The file must be at most 64 KiB.',badScore:'Scores must be numbers between 0 and 10.',
      badName:'Names must contain 1–60 characters.',badTitle:'The title must contain 1–120 characters.'}
  };
  let lang = 'zh', model = engine.validateModel(DEMO), previous = null;
  const $ = id => document.getElementById(id);
  const t = key => words[lang][key];
  const fmt = (n, digits=2) => Number(n).toFixed(digits);
  const clone = data => JSON.parse(JSON.stringify(data));
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function say(message, error=false) {
    $('status').textContent = message;
    $('status').className = error ? 'status error' : 'status';
    $('status').hidden = false;
  }
  function edit(action) {
    action(); previous = null; $('status').hidden = true; render();
  }
  function syncWeights() {
    model.criteria.forEach((c,i) => {
      const row = $('weights').children[i];
      row.querySelector('input').value = c.weight;
      row.querySelector('.weight-number').textContent = fmt(c.weight,1)+'%';
    });
    $('total').textContent = fmt(model.criteria.reduce((sum,c)=>sum+c.weight,0),1)+'%';
    $('locked-count').textContent = t('lockCount')(model.criteria.filter(c=>c.locked).length);
  }
  function renderWeights() {
    $('decision-title').value = model.title;
    $('weights').replaceChildren();
    model.criteria.forEach((c,i) => {
      const row = element('div',undefined,'weight-row');
      const label = element('label',c.name,'criterion-name');label.htmlFor='weight-'+i;
      const slider = element('input');slider.type='range';slider.id='weight-'+i;
      slider.min=0;slider.max=100;slider.step=.1;
      slider.disabled=c.locked || model.criteria.filter(v=>!v.locked).length<=1;
      slider.setAttribute('aria-label',t('weightLabel')(c.name));
      slider.addEventListener('input',()=>{
        model=engine.setWeight(model,i,Number(slider.value));previous=null;
        $('status').hidden=true;syncWeights();renderResults();
      });
      const number = element('span',undefined,'weight-number');
      const lock = element('button',c.locked?t('locked'):t('lock'),'lock');lock.type='button';
      lock.setAttribute('aria-pressed',String(c.locked));lock.setAttribute('aria-label',t('lockLabel')(c.name));
      lock.addEventListener('click',()=>edit(()=>{model.criteria[i].locked=!model.criteria[i].locked;}));
      row.append(label,slider,number,lock);$('weights').append(row);
    });
    syncWeights();
  }
  function renderResults() {
    const result=engine.analyze(model), nearest=result.boundaries.find(b=>b.reachable);
    $('leader-name').textContent=result.leader.name;
    $('leader-score').textContent=fmt(result.leader.score);
    $('distance').textContent=nearest?fmt(nearest.distance):'—';
    $('distance-unit').hidden=!nearest;
    $('distance-note').textContent=nearest?t('nearestNote')(model.options[nearest.challengerIndex].name,result.leader.name):t('noBoundary');
    $('ranking').replaceChildren();
    result.ranking.forEach((item,i)=>{
      const row=element('div',undefined,'ranking-row'), label=element('div',undefined,'ranking-label');
      label.append(element('span',`${String(i+1).padStart(2,'0')}  ${item.name}`),element('span',fmt(item.score)));
      const track=element('div',undefined,'ranking-track'),fill=element('div',undefined,'ranking-fill');
      fill.style.width=(item.score*10)+'%';track.append(fill);row.append(label,track);$('ranking').append(row);
    });
    $('boundaries').replaceChildren();
    result.boundaries.forEach(b=>{
      const card=element('article',undefined,'boundary');
      const header=element('div',undefined,'boundary-title');
      header.append(element('h3',model.options[b.challengerIndex].name));
      const distance=element('span',b.reachable?fmt(b.distance):t('unreachable'),b.reachable?'boundary-distance':'unreachable');
      if(b.reachable)distance.append(element('small',' pp'));header.append(distance);card.append(header);
      card.append(element('p',b.reachable?(b.distance<1e-7?t('tie'):(b.canWin?t('canWin'):t('tieOnly'))):t('impossible'),'boundary-copy'));
      if(b.reachable){
        b.transfers.forEach(move=>{
          const line=element('div',undefined,'transfer');
          line.append(element('span',model.criteria[move.from].name+' → '+model.criteria[move.to].name+'  '),element('strong',fmt(move.amount)+' pp'));
          card.append(line);
        });
        const button=element('button',t('preview'),'preview');button.type='button';button.disabled=b.distance<1e-7;
        button.addEventListener('click',()=>{
          previous=clone(model);model.criteria.forEach((c,i)=>{c.weight=b.witness[i];});
          render();say(t('previewed'));
        });
        card.append(button);
      }
      $('boundaries').append(card);
    });
    $('undo').disabled=!previous;
  }
  function nameInput(value, onChange, maxLength=60) {
    const input=element('input');input.type='text';input.value=value;input.maxLength=maxLength;
    input.setAttribute('aria-label',t('nameLabel')(value));
    input.addEventListener('change',()=>{
      const name=input.value.trim();
      if(!name || name.length>maxLength){input.value=value;say(t('badName'),true);return;}
      edit(()=>onChange(name));
    });return input;
  }
  function renderScores() {
    const table=$('scores');table.replaceChildren();
    const head=element('thead'),header=element('tr');header.append(element('th',t('option')));
    model.criteria.forEach((c,i)=>{
      const th=element('th');th.scope='col';th.append(nameInput(c.name,value=>{model.criteria[i].name=value;}));header.append(th);
    });head.append(header);table.append(head);
    const body=element('tbody');
    model.options.forEach((o,i)=>{
      const row=element('tr'),name=element('td');
      name.append(nameInput(o.name,value=>{model.options[i].name=value;}));row.append(name);
      o.scores.forEach((score,j)=>{
        const td=element('td'),input=element('input');input.type='number';input.min=0;input.max=10;input.step=.1;input.value=score;
        input.setAttribute('aria-label',t('scoreLabel')(o.name,model.criteria[j].name));
        input.addEventListener('change',()=>{
          const value=Number(input.value);
          if(input.value.trim()==='' || !Number.isFinite(value) || value<0 || value>10){input.value=score;say(t('badScore'),true);return;}
          edit(()=>{model.options[i].scores[j]=value;});
        });td.append(input);row.append(td);
      });body.append(row);
    });table.append(body);
  }
  function render() {
    document.documentElement.lang=lang==='zh'?'zh-CN':'en';
    document.querySelectorAll('[data-i18n]').forEach(node=>{
      const text=t(node.dataset.i18n);
      if(node.id==='headline'){
        node.replaceChildren();text.split('\n').forEach((line,i)=>{if(i)node.append(element('br'));node.append(document.createTextNode(line));});
      }else node.textContent=text;
    });
    $('language').textContent=lang==='zh'?'EN':'中文';
    $('language').setAttribute('aria-label',lang==='zh'?'Switch to English':'切换到中文');
    $('workspace').setAttribute('aria-label',lang==='zh'?'决策实验区':'Decision workspace');
    $('score-table-wrap').setAttribute('aria-label',t('scores'));
    renderWeights();renderResults();renderScores();
  }
  $('language').addEventListener('click',()=>{lang=lang==='zh'?'en':'zh';$('status').hidden=true;render();});
  $('decision-title').addEventListener('change',()=>{
    const value=$('decision-title').value.trim();
    if(!value || value.length>120){$('decision-title').value=model.title;say(t('badTitle'),true);return;}
    edit(()=>{model.title=value;});
  });
  $('reset').addEventListener('click',()=>{model=engine.validateModel(DEMO);previous=null;render();say(t('resetDone'));});
  $('undo').addEventListener('click',()=>{if(previous){model=previous;previous=null;render();say(t('undone'));}});
  $('import').addEventListener('click',()=>$('file').click());
  $('file').addEventListener('change',async()=>{
    const file=$('file').files[0];if(!file)return;
    try{
      if(file.size>65536)throw new Error(t('fileLarge'));
      const next=engine.validateModel(JSON.parse(await file.text()));
      model=next;previous=null;render();say(t('loaded'));
    }catch(error){say(t('bad')+error.message,true);}
    $('file').value='';
  });
  $('export').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify(model,null,2)+'\n'],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download='tilttrace.json';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);say(t('saved'));
  });
  render();
}());
