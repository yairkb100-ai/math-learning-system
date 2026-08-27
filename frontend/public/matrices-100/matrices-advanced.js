/*
 * Original advanced figural set. The drawings are new; the design target is
 * psychotechnical matrix reasoning with two independently checkable rules.
 */
(function () {
  var uid = 0

  function svg(inner) {
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + inner + '</svg>'
  }

  function rotate(a, n) {
    n = ((n % a.length) + a.length) % a.length
    return a.slice(n).concat(a.slice(0, n))
  }

  function xorArray(a, b) {
    return a.map(function (v, i) { return v ^ b[i] })
  }

  function disc(state) {
    var id = 'adv' + (++uid)
    var paths = [
      'M50 50L50 15A35 35 0 0 0 15 50Z',
      'M50 50L85 50A35 35 0 0 0 50 15Z',
      'M50 50L50 85A35 35 0 0 0 85 50Z',
      'M50 50L15 50A35 35 0 0 0 50 85Z'
    ]
    var defs = '<defs>' +
      '<pattern id="h' + id + '" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 3.5H7" stroke="#171717" stroke-width="1.7"/></pattern>' +
      '<pattern id="v' + id + '" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M3.5 0V7" stroke="#171717" stroke-width="1.7"/></pattern>' +
      '<pattern id="x' + id + '" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 3.5H7M3.5 0V7" stroke="#171717" stroke-width="1.45"/></pattern>' +
      '</defs>'
    var body = state.map(function (code, i) {
      if (!code) return ''
      var fill = code === 1 ? 'h' : code === 2 ? 'v' : 'x'
      return '<path d="' + paths[i] + '" fill="url(#' + fill + id + ')"/>'
    }).join('')
    return svg(defs + body + '<circle cx="50" cy="50" r="35" fill="none" stroke="#171717" stroke-width="1.8"/>')
  }

  var POS = [[28,27],[72,27],[28,73],[72,73],[50,50]]
  function symbolAt(i) {
    var p = POS[i], x = p[0], y = p[1]
    if (i === 0) return '<circle cx="' + x + '" cy="' + y + '" r="10" fill="none" stroke="#171717" stroke-width="3"/>'
    if (i === 1) return '<rect x="' + (x-9) + '" y="' + (y-9) + '" width="18" height="18" fill="none" stroke="#171717" stroke-width="3"/>'
    if (i === 2) return '<path d="M' + x + ' ' + (y-11) + 'L' + (x+11) + ' ' + (y+9) + 'H' + (x-11) + 'Z" fill="none" stroke="#171717" stroke-width="3"/>'
    if (i === 3) return '<path d="M' + x + ' ' + (y-11) + 'L' + (x+11) + ' ' + y + 'L' + x + ' ' + (y+11) + 'L' + (x-11) + ' ' + y + 'Z" fill="none" stroke="#171717" stroke-width="3"/>'
    return '<path d="M50 38V62M38 50H62" stroke="#171717" stroke-width="4" stroke-linecap="round"/>'
  }

  function symbols(mask) {
    var body = ''
    for (var i = 0; i < 5; i++) if (mask & (1 << i)) body += symbolAt(i)
    return svg('<circle cx="50" cy="50" r="40" fill="none" stroke="#171717" stroke-width="1.4"/>' + body)
  }

  var OUTERS = [
    '<circle cx="50" cy="50" r="34"',
    '<rect x="18" y="18" width="64" height="64" rx="3"',
    '<path d="M50 14L86 78H14Z"'
  ]
  var INNERS = [
    '<circle cx="50" cy="50" r="10"',
    '<rect x="40" y="40" width="20" height="20"',
    '<path d="M50 38L62 59H38Z"'
  ]
  function latin(state) {
    var outer = OUTERS[state[0]] + ' fill="none" stroke="#171717" stroke-width="3"/>'
    var inner = INNERS[state[1]] + (state[2] ? ' fill="#171717"' : ' fill="none"') + ' stroke="#171717" stroke-width="3"/>'
    var dots = ['<circle cx="50" cy="9" r="4" fill="#171717"/>','<circle cx="91" cy="50" r="4" fill="#171717"/>','<circle cx="50" cy="91" r="4" fill="#171717"/>'][state[3]]
    return svg(outer + inner + dots)
  }

  function wheel(state) {
    var angles = [0,45,90,135,180,225,270,315]
    var body = '<circle cx="50" cy="50" r="8" fill="' + (state[1] ? '#171717' : '#fff') + '" stroke="#171717" stroke-width="3"/>'
    angles.forEach(function (a, i) {
      if (!(state[0] & (1 << i))) return
      var rad = (a - 90) * Math.PI / 180
      body += '<line x1="' + (50 + 12*Math.cos(rad)).toFixed(1) + '" y1="' + (50 + 12*Math.sin(rad)).toFixed(1) + '" x2="' + (50 + 35*Math.cos(rad)).toFixed(1) + '" y2="' + (50 + 35*Math.sin(rad)).toFixed(1) + '" stroke="#171717" stroke-width="4" stroke-linecap="round"/>'
    })
    return svg(body)
  }

  function framed(state) {
    var corners = [[22,22],[78,22],[78,78],[22,78]]
    var body = '<rect x="14" y="14" width="72" height="72" rx="8" fill="none" stroke="#171717" stroke-width="2"/>'
    corners.forEach(function (p, i) {
      if (state[0] & (1 << i)) body += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="6" fill="#171717"/>'
    })
    var a = state[1] * 90
    body += '<g transform="rotate(' + a + ' 50 50)"><path d="M50 31V67M38 43L50 31L62 43" fill="none" stroke="#171717" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>'
    if (state[2]) body += '<circle cx="50" cy="50" r="13" fill="none" stroke="#171717" stroke-width="2.8" stroke-dasharray="5 3"/>'
    return svg(body)
  }

  function key(v) { return JSON.stringify(v) }
  function addUnique(list, value) {
    if (!list.some(function (x) { return key(x) === key(value) })) list.push(value)
  }
  function renderQuestion(index, cells, correct, variants, renderer, explanation, tag) {
    var states = [correct]
    variants.forEach(function (v) { addUnique(states, v) })
    var fallbackAttempt = 0
    while (states.length < 5) {
      fallbackAttempt += 1
      var fallback = Array.isArray(correct) ? correct.slice() : correct
      if (Array.isArray(fallback)) fallback[0] = Number(fallback[0]) ^ (1 << (fallbackAttempt % 8))
      else fallback = Number(fallback) ^ (1 << (fallbackAttempt % 8))
      addUnique(states, fallback)
    }
    states = states.slice(0, 5)
    var answerAt = index % 5
    var answer = states.shift()
    states.splice(answerAt, 0, answer)
    return {
      cells: cells.slice(0, 8).map(renderer).concat('?'),
      opts: states.map(renderer),
      ans: answerAt,
      expl: explanation,
      view: { cols: 3 },
      diff: 3,
      tag: tag
    }
  }

  function xorGrid(a, b, c, d, op) {
    var ab = op(a,b), cd = op(c,d)
    return [a,b,ab,c,d,cd,op(a,c),op(b,d),op(ab,cd)]
  }

  function makeDiscs() {
    var base = [
      [[1,2,0,3],[2,0,1,1],[0,3,2,1],[1,1,3,0]],
      [[3,1,2,0],[1,2,0,3],[2,3,1,0],[0,1,3,2]],
      [[1,3,0,2],[2,1,3,0],[3,0,2,1],[0,2,1,3]],
      [[2,0,3,1],[1,3,2,0],[3,2,0,1],[1,0,1,2]],
      [[3,2,1,0],[0,1,2,3],[2,0,3,1],[1,3,0,2]]
    ]
    var qs = []
    for (var i=0;i<10;i++) {
      var s = base[i%5].map(function (x, j) { return rotate(x, (i+j)%4) })
      var g = xorGrid(s[0],s[1],s[2],s[3],xorArray), ans=g[8]
      qs.push(renderQuestion(i,g,ans,[rotate(ans,1),ans.map(function(v){return v===1?2:v===2?1:v}),ans.map(function(v,j){return j===i%4?v^1:v}),xorArray(g[6],g[7].slice().reverse())],disc,'מחברים את שני התאים הראשונים בכל שורה: קווים זהים באותו רבע מתבטלים, וקווים אופקיים ואנכיים יחד יוצרים רשת. אותו חוק מתקיים גם בעמודות, ולכן מתקבל הפתרון היחיד המוצג.','חפיפה וביטול') )
    }
    return qs
  }

  function makeSymbolSets() {
    var qs=[]
    for (var i=0;i<10;i++) {
      var a=3|(1<<((i+2)%5)), b=6|(1<<((i+3)%5)), c=17|(1<<((i+1)%5)), d=12|(1<<(i%5))
      var op=function(x,y){return x^y}, g=xorGrid(a,b,c,d,op), ans=g[8]
      qs.push(renderQuestion(10+i,g,ans,[ans^(1<<(i%5)),ans^(1<<((i+1)%5)),a|b|c|d,((ans<<1)|(ans>>4))&31],symbols,'בכל שורה ובכל עמודה הצורה השלישית היא חיבור ללא כפילויות: צורה שמופיעה בשני התאים נעלמת, וצורה שמופיעה פעם אחת נשארת. בדיקה בשני הכיוונים משאירה תשובה אחת בלבד.','איחוד ללא כפילויות'))
    }
    return qs
  }

  function makeLatin() {
    var qs=[]
    for (var k=0;k<10;k++) {
      var cells=[]
      for (var r=0;r<3;r++) for (var c=0;c<3;c++) cells.push([(r+c+k)%3,(r+2*c+k+1)%3,(r+c+k)%2,(2*r+c+k)%3])
      var ans=cells[8]
      qs.push(renderQuestion(20+k,cells,ans,[[ans[0],(ans[1]+1)%3,ans[2],ans[3]],[(ans[0]+1)%3,ans[1],ans[2],ans[3]],[ans[0],ans[1],1-ans[2],ans[3]],[ans[0],ans[1],ans[2],(ans[3]+1)%3]],latin,'ארבע תכונות נעות במחזורים עצמאיים: הצורה החיצונית, הצורה הפנימית, המילוי ומיקום הנקודה. משלימים כל מחזור בנפרד ומאמתים גם בשורה וגם בעמודה.','מחזורים משולבים'))
    }
    return qs
  }

  function makeWheels() {
    var qs=[]
    for (var i=0;i<10;i++) {
      var rot=function(mask,n){return ((mask<<n)|(mask>>(8-n)))&255}
      var a=[rot(0x13,i%8),i%2], b=[rot(0x46,(i+1)%8),(i+1)%2], c=[rot(0x89,(i+2)%8),(i+1)%2], d=[rot(0x32,(i+3)%8),i%2]
      var op=function(x,y){return [x[0]^y[0],x[1]^y[1]]}, g=xorGrid(a,b,c,d,op), ans=g[8]
      qs.push(renderQuestion(30+i,g,ans,[[rot(ans[0],1),ans[1]],[ans[0],1-ans[1]],[ans[0]^(1<<(i%8)),ans[1]],[rot(ans[0],7),1-ans[1]]],wheel,'הזרועות חופפות ומתבטלות בזוגות, בעוד שמילוי המרכז מתחלף לפי אותו עקרון. שני הרכיבים חייבים להתאים בו־זמנית בשורה ובעמודה.','זרועות ומרכז'))
    }
    return qs
  }

  function makeFrames() {
    var qs=[]
    for (var i=0;i<10;i++) {
      var cells=[]
      for (var r=0;r<3;r++) for (var c=0;c<3;c++) cells.push([1<<((r+2*c+i)%4),(r+c+i)%4,(r+2*c+i)%2])
      var ans=cells[8]
      qs.push(renderQuestion(40+i,cells,ans,[[1<<((rmod(i,4)+1)%4),ans[1],ans[2]],[ans[0],(ans[1]+1)%4,ans[2]],[ans[0],ans[1],1-ans[2]],[1<<((i+3)%4),(ans[1]+3)%4,ans[2]]],framed,'שלושה מסלולים פועלים יחד: נקודת הפינה מדלגת בקצב קבוע, החץ מסתובב רבע סיבוב, והטבעת המקווקוות מופיעה לסירוגין. הפתרון מקיים את שלושתם בשני הכיוונים.','מיקום, סיבוב וסימון'))
    }
    return qs
  }

  function rmod(n,m){return ((n%m)+m)%m}

  function build() {
    return makeDiscs().concat(makeSymbolSets(),makeLatin(),makeWheels(),makeFrames())
  }

  window.MatricesAdvancedPreview = {
    build: build,
    install: function () {
      var data = window.MatricesQuiz && window.MatricesQuiz.data
      if (!data || data._advancedOriginal) return
      data._advancedOriginal = true
      data.sections.push({
        id: 'secAdvancedOriginal',
        short: 'מתקדמות',
        title: 'הרחבה מתקדמת — 50 מטריצות רב־חוקיות',
        intro: 'בכל תרגיל יש לפחות שני חוקים עצמאיים ומסיחים שמפרים רק חלק מן החוקיות.',
        qs: build()
      })
    }
  }
})()
