(function(){
  "use strict";

  /* ---------------------------------------------------------
     DEFAULT DATA
  --------------------------------------------------------- */
  var DEFAULT_ANSWERS = [
    {category:"Phrase (Weekday)", answer:"Thank Goodness It's Friday"},
    {category:"Question (Drink)", answer:"Do you like papaya milk?"},
    {category:"Place", answer:"Tokyo Japan"},
    {category:"Clothes", answer:"socks and shoes"},
    {category:"Food", answer:"burger and French fries"},
    {category:"Movie Title (transport)", answer:"Trains Planes and Cars"},
    {category:"Before and After (Sickness)", answer:"Cold sore throat"},
    {category:"Phrase (Clothes)", answer:"Sweater weather"},
    {category:"School Subject", answer:"My favorite subject is science"},
    {category:"Animals", answer:"Lions tigers and bears"}
  ];

  function defaultSlots(){
    var cash = [500,600,700,800,900,300,650,550,450,500,600,700,800,900,300,650,550,450,500,400];
    var slots = [];
    var ci = 0;
    var layout = ["cash","cash","cash","cash","bankrupt","cash","cash","cash","cash","cash",
                  "cash","million","cash","cash","cash","bankrupt","cash","cash","loseturn","cash",
                  "cash","cash","cash","cash"];
    layout.forEach(function(type){
      if(type === "cash"){
        slots.push({type:"cash", value:cash[ci % cash.length]});
        ci++;
      } else if(type === "million"){
        slots.push({type:"cash", value:1000000, isMillion:true});
      } else if(type === "bankrupt"){
        slots.push({type:"bankrupt", value:0});
      } else if(type === "loseturn"){
        slots.push({type:"loseturn", value:0});
      }
    });
    return slots;
  }

  var VOWELS = ["A","E","I","O","U"];

  /* ---------------------------------------------------------
     STATE
  --------------------------------------------------------- */
  var state = {
    contestants: [],
    currentIndex: 0,
    answerBank: [],
    usedAnswerIdx: [],
    currentAnswer: null,
    revealedLetters: [],
    guessedLetters: [],
    wheelSlots: [],
    lastSpin: null,
    phase: "spin" // spin | guessing | buying-vowel | over
  };

  var spinning = false;
  var cumulativeRotation = 0;
  var pendingTargetIdx = 0;
  var gameStarted = false;

  /* ---------------------------------------------------------
     STAGE CHOREOGRAPHY — wheel / board slide in & out of focus
  --------------------------------------------------------- */
  var POS_CLASSES = ["pos-center","pos-peek-left","pos-peek-right","pos-off-left","pos-off-right"];
  function updateStageLayout(){
    POS_CLASSES.forEach(function(c){
      el.wheelPanel && el.wheelPanel.classList.remove(c);
      el.boardPanel && el.boardPanel.classList.remove(c);
    });
    if(!el.wheelPanel) return;
    if(!gameStarted){
      el.wheelPanel.classList.add("pos-peek-left");
      el.boardPanel.classList.add("pos-peek-right");
      return;
    }
    if(state.phase === "spin"){
      el.wheelPanel.classList.add("pos-center");
      el.boardPanel.classList.add("pos-off-right");
    } else {
      el.wheelPanel.classList.add("pos-off-left");
      el.boardPanel.classList.add("pos-center");
    }
  }
  function updateControlsVisibility(){
    if(!el.controlsDrawer) return;
    var show = gameStarted && (state.phase === "guessing" || state.phase === "buying-vowel");
    el.controlsDrawer.classList.toggle("open", show);
  }

  /* ---------------------------------------------------------
     ELEMENT REFS
  --------------------------------------------------------- */
  var el = {
    overlay: document.getElementById("overlay"),
    teamCount: document.getElementById("teamCount"),
    nameGrid: document.getElementById("nameGrid"),
    answerRows: document.getElementById("answerRows"),
    addAnswerBtn: document.getElementById("addAnswerBtn"),
    slotGrid: document.getElementById("slotGrid"),
    resetSlotsBtn: document.getElementById("resetSlotsBtn"),
    setupError: document.getElementById("setupError"),
    startBtn: document.getElementById("startBtn"),

    scoreboard: document.getElementById("scoreboard"),
    stage: document.getElementById("stage"),
    wheelPanel: document.getElementById("wheelPanel"),
    boardPanel: document.getElementById("boardPanel"),
    controlsDrawer: document.getElementById("controlsDrawer"),
    categoryTag: document.getElementById("categoryTag"),
    board: document.getElementById("board"),
    wheel: document.getElementById("wheel"),
    wheelWrap: document.getElementById("wheelWrap"),
    spinBtn: document.getElementById("spinBtn"),
    alphaGrid: document.getElementById("alphaGrid"),
    buyVowelBtn: document.getElementById("buyVowelBtn"),
    solveBtn: document.getElementById("solveBtn"),
    passBtn: document.getElementById("passBtn"),
    banner: document.getElementById("banner"),
    // restartBtn: document.getElementById("restartBtn"),

    solveModal: document.getElementById("solveModal"),
    solveInput: document.getElementById("solveInput"),
    solveGoBtn: document.getElementById("solveGoBtn"),
    solveCancelBtn: document.getElementById("solveCancelBtn")
  };

  /* ---------------------------------------------------------
     SETUP OVERLAY — render + collect
  --------------------------------------------------------- */
  var answerRowsData = DEFAULT_ANSWERS.map(function(a){ return {category:a.category, answer:a.answer}; });
  var slotRowsData = defaultSlots();

  function renderNameGrid(){
    var count = parseInt(el.teamCount.value, 10) || 1;
    count = Math.max(1, Math.min(8, count));
    el.teamCount.value = count;
    var existing = Array.prototype.slice.call(el.nameGrid.querySelectorAll("input")).map(function(i){return i.value;});
    el.nameGrid.innerHTML = "";
    for(var i=0;i<count;i++){
      var input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Contestant " + (i+1);
      input.value = existing[i] || "";
      input.dataset.idx = i;
      el.nameGrid.appendChild(input);
    }
  }

  function renderAnswerRows(){
    el.answerRows.innerHTML = "";
    answerRowsData.forEach(function(row, idx){
      var wrap = document.createElement("div");
      wrap.className = "answer-row";

      var catInput = document.createElement("input");
      catInput.type = "text";
      catInput.placeholder = "Category";
      catInput.value = row.category;
      catInput.addEventListener("input", function(){ row.category = catInput.value; });

      var ansInput = document.createElement("input");
      ansInput.type = "text";
      ansInput.placeholder = "Answer";
      ansInput.value = row.answer;
      ansInput.addEventListener("input", function(){ row.answer = ansInput.value; });

      var delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.type = "button";
      delBtn.addEventListener("click", function(){
        answerRowsData.splice(idx,1);
        renderAnswerRows();
      });

      wrap.appendChild(catInput);
      wrap.appendChild(ansInput);
      wrap.appendChild(delBtn);
      el.answerRows.appendChild(wrap);
    });
  }

  function renderSlotGrid(){
    el.slotGrid.innerHTML = "";
    slotRowsData.forEach(function(slot, idx){
      var card = document.createElement("div");
      card.className = "slot-card";

      var idxLabel = document.createElement("div");
      idxLabel.className = "idx";
      idxLabel.textContent = "Slot " + (idx+1);

      var select = document.createElement("select");
      ["cash","bankrupt","loseturn"].forEach(function(t){
        var opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t === "cash" ? "Cash" : (t === "bankrupt" ? "Bankrupt" : "Lose a Turn");
        if(slot.type === t) opt.selected = true;
        select.appendChild(opt);
      });

      var numInput = document.createElement("input");
      numInput.type = "number";
      numInput.min = "0";
      numInput.step = "50";
      numInput.value = slot.value;
      numInput.style.display = slot.type === "cash" ? "block" : "none";

      select.addEventListener("change", function(){
        slot.type = select.value;
        numInput.style.display = slot.type === "cash" ? "block" : "none";
      });
      numInput.addEventListener("input", function(){
        slot.value = parseInt(numInput.value,10) || 0;
        slot.isMillion = false;
      });

      card.appendChild(idxLabel);
      card.appendChild(select);
      card.appendChild(numInput);
      el.slotGrid.appendChild(card);
    });
  }

  el.teamCount.addEventListener("input", renderNameGrid);
  el.addAnswerBtn.addEventListener("click", function(){
    answerRowsData.push({category:"", answer:""});
    renderAnswerRows();
  });
  el.resetSlotsBtn.addEventListener("click", function(){
    slotRowsData = defaultSlots();
    renderSlotGrid();
  });

  renderNameGrid();
  renderAnswerRows();
  renderSlotGrid();
  updateStageLayout();

  function fmtMoney(n){
    return "$" + n.toLocaleString("en-US");
  }

  function validateAndStart(){
    el.setupError.textContent = "";

    var names = Array.prototype.slice.call(el.nameGrid.querySelectorAll("input")).map(function(i,idx){
      return i.value.trim() || ("Contestant " + (idx+1));
    });
    if(names.length < 1){
      el.setupError.textContent = "Add at least one contestant.";
      return;
    }

    var validAnswers = answerRowsData
      .map(function(r){ return {category:r.category.trim(), answer:r.answer.trim()}; })
      .filter(function(r){ return r.category && r.answer && /[A-Za-z]/.test(r.answer); });
    if(validAnswers.length < 1){
      el.setupError.textContent = "Add at least one answer with a category (letters only puzzles).";
      return;
    }

    var slotsOk = slotRowsData.every(function(s){
      return s.type !== "cash" || (s.value && s.value > 0);
    });
    if(!slotsOk){
      el.setupError.textContent = "Every cash slot needs a value greater than $0.";
      return;
    }
    if(slotRowsData.length < 4){
      el.setupError.textContent = "The wheel needs at least a few slots.";
      return;
    }

    state.contestants = names.map(function(n){ return {name:n, score:0}; });
    state.currentIndex = 0;
    state.answerBank = validAnswers;
    state.usedAnswerIdx = [];
    state.wheelSlots = slotRowsData.map(function(s){ return {type:s.type, value:s.value||0, isMillion:!!s.isMillion}; });

    buildWheelDom();
    pickNewAnswer();
    renderScoreboard();

    gameStarted = false;
    updateStageLayout();
    updateControlsVisibility();
    el.spinBtn.disabled = true;
    setBanner("Taking the stage...");
    el.overlay.classList.add("hidden");

    // game start sfx
    const startSound = new Audio("sfx/puzzle_blanks_reveal.mp3");
    startSound.play();

    // brief reveal beat: wheel + board peek in from the sides, then the wheel takes focus
    setTimeout(function(){
      gameStarted = true;
      setPhase("spin");
      setBanner(state.contestants[0].name + "'s turn — spin the wheel!");
    }, 5000);
  }

  el.startBtn.addEventListener("click", validateAndStart);
  // el.restartBtn.addEventListener("click", function(){
  //   el.overlay.classList.remove("hidden");
  // });

  /* ---------------------------------------------------------
     WHEEL BUILD + SPIN
  --------------------------------------------------------- */
  function slotColor(slot, idx){
    if(slot.type === "bankrupt") return "#1c1120";
    if(slot.type === "loseturn") return "#4a4a58";
    if(slot.isMillion) return "#caa53a";
    return idx % 2 === 0 ? "var(--slot-a)" : "var(--slot-b)";
  }
  function slotLabel(slot){
    if(slot.type === "bankrupt") return ["B", "A", "N", "K", "R", "U", "P", "T"];
    if(slot.type === "loseturn") return ["LOSE", "a", "T", "U", "R", "N"];
    if(slot.isMillion) return ["ONE", "M", "I", "L", "L", "I", "O", "N"];
    return fmtMoney(slot.value).split('');
  }

  function buildWheelDom(){
    var n = state.wheelSlots.length;
    var seg = 360 / n;
    var gradParts = [];
    state.wheelSlots.forEach(function(slot, i){
      var c = slotColor(slot, i);
      gradParts.push(c + " " + (i*seg) + "deg " + ((i+1)*seg) + "deg");
    });
    el.wheel.style.background = "conic-gradient(" + gradParts.join(",") + ")";

    // labels — each sits on a zero-size "spoke" pivoted at the wheel's exact
    // center, then rotated to its segment's center angle. Because conic-gradient's
    // 0deg is "up" and CSS rotate() is also clockwise from "up", no extra offset
    // is needed here. The label itself grows *upward* from that pivot (bottom
    // anchored) and uses vertical-rl text so the first character (e.g. the "B" in
    // BANKRUPT) sits at the rim and the last character sits near the hub.
    var existingSpokes = el.wheel.querySelectorAll(".spoke");
    existingSpokes.forEach(function(s){ s.remove(); });
    state.wheelSlots.forEach(function(slot, i){
      var centerAngle = i*seg + seg/2;
      var spoke = document.createElement("div");
      spoke.className = "spoke";
      spoke.style.transform = "rotate(" + centerAngle + "deg)";
      var label = document.createElement("div");
      label.className = "seg-label";

      var slotArr = slotLabel(slot)
      slotArr.forEach(ch => {
        var char = document.createElement("div");
        char.innerText = ch
        label.append(char)
      })

      // label.textContent = slotLabel(slot);
      spoke.appendChild(label);
      el.wheel.appendChild(spoke);
    });
    cumulativeRotation = 0;
    el.wheel.style.transition = "none";
    el.wheel.style.transform = "rotate(0deg)";
    // force reflow then restore transition
    void el.wheel.offsetHeight;
    el.wheel.style.transition = "";
  }


  function doSpin(){
    if(spinning || state.phase !== "spin") return;
    spinning = true;
    el.spinBtn.disabled = true;

    const spinSound = new Audio("sfx/wheel_spin_chunky.mp3");
    spinSound.play();

    var n = state.wheelSlots.length;
    var seg = 360/n;
    var idx = Math.floor(Math.random()*n);
    pendingTargetIdx = idx;
    var segCenter = idx*seg + seg/2;
    var current = ((cumulativeRotation % 360) + 360) % 360;
    var targetMod = (360 - segCenter) % 360;
    var deltaNeeded = (targetMod - current + 360) % 360;
    var extraSpins = 720 + Math.floor(Math.random()*3)*360; // guarantees 2+ full rotations
    var jitter = (Math.random()-0.5) * (seg*0.55);
    cumulativeRotation += deltaNeeded + extraSpins + jitter;

    el.wheel.style.transform = "rotate(" + cumulativeRotation + "deg)";
    setBanner("Spinning...");
  }

  el.wheel.addEventListener("transitionend", function(){
    if(!spinning) return;
    spinning = false;
    el.spinBtn.disabled = false;
    onSpinComplete(state.wheelSlots[pendingTargetIdx]);
  });

  el.spinBtn.addEventListener("click", doSpin);

  // swipe support
  (function(){
    var startX=0,startY=0,startT=0,tracking=false;
    el.wheelWrap.addEventListener("pointerdown", function(e){
      if(state.phase !== "spin" || spinning) return;
      tracking = true;
      startX = e.clientX; startY = e.clientY; startT = Date.now();
    });
    el.wheelWrap.addEventListener("pointerup", function(e){
      if(!tracking) return;
      tracking = false;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      var dist = Math.sqrt(dx*dx+dy*dy);
      var dt = Math.max(1, Date.now()-startT);
      if(dist/dt > 0.15 || dist > 40){
        doSpin();
      }
    });
    el.wheelWrap.addEventListener("click", function(){
      if(state.phase === "spin" && !spinning) doSpin();
    });
  })();

  /* ---------------------------------------------------------
     PUZZLE / BOARD
  --------------------------------------------------------- */
  function pickNewAnswer(){
    var remaining = state.answerBank.map(function(_,i){return i;}).filter(function(i){
      return state.usedAnswerIdx.indexOf(i) === -1;
    });
    if(remaining.length === 0){
      endGame();
      return;
    }
    var pick = remaining[Math.floor(Math.random()*remaining.length)];
    state.usedAnswerIdx.push(pick);
    state.currentAnswer = state.answerBank[pick];
    state.revealedLetters = [];
    state.guessedLetters = [];
    el.categoryTag.textContent = state.currentAnswer.category.toUpperCase();
    renderBoard();
    renderAlphaGrid();
  }

  function renderBoard(justRevealedLetter){
    el.board.innerHTML = "";
    var ans = state.currentAnswer.answer;
    for(var i=0;i<ans.length;i++){
      var ch = ans[i];
      var upper = ch.toUpperCase();
      var tile = document.createElement("div");
      if(ch === " "){
        tile.className = "tile space";
      } else if(!/[A-Z]/i.test(ch)){
        tile.className = "tile punct";
        tile.textContent = ch;
      } else {
        tile.className = "tile";
        if(state.revealedLetters.indexOf(upper) !== -1){
          tile.textContent = upper;
          if(justRevealedLetter && upper === justRevealedLetter) tile.classList.add("pop");
        }
      }
      el.board.appendChild(tile);
    }
  }

  function isFullyRevealed(){
    var ans = state.currentAnswer.answer.toUpperCase();
    for(var i=0;i<ans.length;i++){
      var ch = ans[i];
      if(/[A-Z]/.test(ch) && state.revealedLetters.indexOf(ch) === -1) return false;
    }
    return true;
  }

  /* ---------------------------------------------------------
     ALPHABET GRID
  --------------------------------------------------------- */
  function renderAlphaGrid(){
    el.alphaGrid.innerHTML = "";
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(function(letter){
      var btn = document.createElement("button");
      btn.textContent = letter;
      var isVowel = VOWELS.indexOf(letter) !== -1;
      btn.className = isVowel ? "vowel" : "";
      btn.dataset.letter = letter;
      btn.addEventListener("click", function(){ onLetterClick(letter, btn); });
      el.alphaGrid.appendChild(btn);
    });
    syncAlphaGridState();
  }

  function syncAlphaGridState(){
    var buttons = el.alphaGrid.querySelectorAll("button");
    buttons.forEach(function(btn){
      var letter = btn.dataset.letter;
      var isVowel = VOWELS.indexOf(letter) !== -1;
      var already = state.guessedLetters.indexOf(letter) !== -1;
      btn.classList.remove("enabled-vowel");

      if(already){
        btn.disabled = true;
        return;
      }
      if(state.phase === "guessing"){
        btn.disabled = isVowel; // vowels must be bought
      } else if(state.phase === "buying-vowel"){
        btn.disabled = !isVowel;
        if(isVowel) btn.classList.add("enabled-vowel");
      } else {
        btn.disabled = true;
      }
    });
  }

  /* ---------------------------------------------------------
     SCOREBOARD
  --------------------------------------------------------- */
  function renderScoreboard(){
    el.scoreboard.innerHTML = "";
    state.contestants.forEach(function(c, idx){
      var chip = document.createElement("div");
      chip.className = "chip" + (idx === state.currentIndex ? " active" : "");

      var avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.textContent = idx+1;

      var meta = document.createElement("div");
      meta.className = "meta";
      var name = document.createElement("div");
      name.className = "name";
      name.textContent = c.name;
      var score = document.createElement("div");
      score.className = "score";
      score.textContent = fmtMoney(c.score);
      meta.appendChild(name);
      meta.appendChild(score);

      chip.appendChild(avatar);
      chip.appendChild(meta);

      if(idx === state.currentIndex && state.lastSpin){
        var badge = document.createElement("div");
        var bad = state.lastSpin.type !== "cash";
        badge.className = "spinbadge" + (bad ? " bad" : "");
        badge.textContent = bad ? slotLabel(state.lastSpin) : fmtMoney(state.lastSpin.value);
        chip.appendChild(badge);
      }

      el.scoreboard.appendChild(chip);
    });
  }

  /* ---------------------------------------------------------
     BANNER
  --------------------------------------------------------- */
  var bannerTimer = null;
  function setBanner(msg){
    el.banner.textContent = msg;
  }

  /* ---------------------------------------------------------
     PHASE / CONTROL ENABLEMENT
  --------------------------------------------------------- */
  function setPhase(p){
    state.phase = p;
    var current = state.contestants[state.currentIndex];

    el.spinBtn.disabled = (p !== "spin");
    el.buyVowelBtn.disabled = !(p === "guessing" && current.score >= 250 && vowelsRemain());
    el.solveBtn.disabled = !(p === "guessing");
    el.passBtn.disabled = !(p === "guessing");

    syncAlphaGridState();
    updateStageLayout();
    updateControlsVisibility();
  }

  function vowelsRemain(){
    return VOWELS.some(function(v){ return state.guessedLetters.indexOf(v) === -1; });
  }

  /* ---------------------------------------------------------
     SPIN RESULT
  --------------------------------------------------------- */
  function onSpinComplete(slot){
    state.lastSpin = slot;
    renderScoreboard();

    if(slot.type === "bankrupt"){
      const bankruptSound = new Audio("sfx/bankrupt.mp3");
      bankruptSound.play();
      
        state.contestants[state.currentIndex].score = 0;
      setBanner(state.contestants[state.currentIndex].name + " hit BANKRUPT! Score reset — turn passes.");
      renderScoreboard();
      setTimeout(function(){ endTurn(); }, 1400);
      return;
    }
    if(slot.type === "loseturn"){
      setBanner(state.contestants[state.currentIndex].name + " landed on LOSE A TURN.");
      setTimeout(function(){ endTurn(); }, 1400);
      return;
    }

    setPhase("guessing");
    setBanner(state.contestants[state.currentIndex].name + " spun " + fmtMoney(slot.value) + " — call a consonant, buy a vowel, or solve.");
  }

  /* ---------------------------------------------------------
     LETTER GUESSING
  --------------------------------------------------------- */
  function onLetterClick(letter){
    if(state.guessedLetters.indexOf(letter) !== -1) return;
    var buyingVowel = state.phase === "buying-vowel";
    if(!buyingVowel && VOWELS.indexOf(letter) !== -1) return; // must buy
    if(buyingVowel && VOWELS.indexOf(letter) === -1) return;

    state.guessedLetters.push(letter);
    var ansUpper = state.currentAnswer.answer.toUpperCase();
    var count = ansUpper.split("").filter(function(c){ return c === letter; }).length;
    var current = state.contestants[state.currentIndex];

    if(count > 0){
      state.revealedLetters.push(letter);
      renderBoard(letter);

      // yes letter sfx
      const yesLetSound = new Audio("sfx/yes_letter.mp3");
      yesLetSound.play();

      if(!buyingVowel){
        var award = count * state.lastSpin.value;
        current.score += award;
        setBanner("Yes! " + count + " × " + letter + " = " + fmtMoney(award) + " for " + current.name + ".");
      } else {
        setBanner("Nice pick — " + letter + " is in the puzzle.");
      }
      renderScoreboard();

      if(isFullyRevealed()){
        setTimeout(function(){ winPuzzle(true); }, 500);
        return;
      }

      if(buyingVowel){
        setPhase("guessing");
      } else {
        setPhase("guessing"); // stays guessing, refresh enablement
      }
    } else {
      // no letter sfx
      const noLetSound = new Audio("sfx/no_letter.mp3");
      noLetSound.play();
      
      setBanner("No " + letter + " in the puzzle. Turn passes.");
      syncAlphaGridState();
      setTimeout(function(){ endTurn(); }, 1200);
      return;
    }
    syncAlphaGridState();
    el.buyVowelBtn.disabled = !(state.phase === "guessing" && current.score >= 250 && vowelsRemain());
  }

  el.buyVowelBtn.addEventListener("click", function(){
    var current = state.contestants[state.currentIndex];
    if(current.score < 250 || !vowelsRemain()) return;
    current.score -= 250;
    renderScoreboard();
    setPhase("buying-vowel");
    setBanner(current.name + " bought a vowel for $250 — pick one.");
  });

  el.passBtn.addEventListener("click", function(){
    setBanner(state.contestants[state.currentIndex].name + " passed the turn.");
    endTurn();
  });

  /* ---------------------------------------------------------
     SOLVE MODAL
  --------------------------------------------------------- */
  el.solveBtn.addEventListener("click", function(){
    el.solveInput.value = "";
    el.solveModal.classList.remove("hidden");
    setTimeout(function(){ el.solveInput.focus(); }, 50);
  });
  el.solveCancelBtn.addEventListener("click", function(){
    el.solveModal.classList.add("hidden");
  });
  el.solveInput.addEventListener("keydown", function(e){
    if(e.key === "Enter") el.solveGoBtn.click();
  });
  el.solveGoBtn.addEventListener("click", function(){
    var guess = el.solveInput.value.trim();
    el.solveModal.classList.add("hidden");
    if(!guess) return;
    var norm = function(s){ return s.toUpperCase().replace(/[^A-Z0-9]/g,""); };
    if(norm(guess) === norm(state.currentAnswer.answer)){
      winPuzzle(false);
    } else {
      setBanner("\u201c" + guess + "\u201d isn't it. Turn passes.");
      setTimeout(function(){ endTurn(); }, 1300);
    }
  });

  /* ---------------------------------------------------------
     WIN / END TURN / NEXT
  --------------------------------------------------------- */
  function winPuzzle(fromLetters){
    // reveal everything
    var ans = state.currentAnswer.answer.toUpperCase();
    ans.split("").forEach(function(ch){
      if(/[A-Z]/.test(ch) && state.revealedLetters.indexOf(ch) === -1) state.revealedLetters.push(ch);
    });
    renderBoard();
    setPhase("over-round");
    el.spinBtn.disabled = true;
    var current = state.contestants[state.currentIndex];
    setBanner(current.name + " solved it! \u201c" + state.currentAnswer.answer + "\u201d — " + (fromLetters ? "" : "") + "next puzzle coming up...");

    // win round sfx
    const answerSound = new Audio("sfx/answer_reveal.mp3");
    answerSound.play();

    if(state.usedAnswerIdx.length >= state.answerBank.length){
      setTimeout(endGame, 1800);
      return;
    }

    setTimeout(function(){
      state.currentIndex = (state.currentIndex + 1) % state.contestants.length;
      state.lastSpin = null;
      pickNewAnswer();
      renderScoreboard();
      setPhase("spin");
      setBanner(state.contestants[state.currentIndex].name + "'s turn — spin the wheel!");
    }, 10000);
  }

  function endTurn(){
    state.currentIndex = (state.currentIndex + 1) % state.contestants.length;
    state.lastSpin = null;
    renderScoreboard();
    setPhase("spin");
    setTimeout(function(){
      setBanner(state.contestants[state.currentIndex].name + "'s turn — spin the wheel!");
    }, 400);
  }

  function endGame(){
    setPhase("over");
    el.spinBtn.disabled = true;
    var winner = state.contestants.reduce(function(a,b){ return b.score > a.score ? b : a; });
    setBanner("That's every puzzle! " + winner.name + " wins with " + fmtMoney(winner.score) + ". Use \u201cRestart\u201d to play again.");
  }

})();