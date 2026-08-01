// ---- Demo UI (vanilla). Uses globals from the bundled engine + data. ----
const $ = (id) => document.getElementById(id);
const teamByName = Object.fromEntries(TEAM.map(m => [m.name, m]));

function fill(sel, items, val = (x)=>x, label = (x)=>x) {
  sel.innerHTML = "";
  for (const it of items) {
    const o = document.createElement("option");
    o.value = val(it); o.textContent = label(it); sel.appendChild(o);
  }
}

const defSel = $("defender"), thrSel = $("threat"), moveSel = $("move");
fill(defSel, TEAM, m=>m.name, m=>(m.mega ?? m.name));
fill(thrSel, THREATS, t=>t.id, t=>t.name);

function currentThreat(){ return THREATS.find(t=>t.id===thrSel.value); }

function refreshMoves(){
  const t = currentThreat();
  fill(moveSel, t.moves, m=>m, m=>m);
  moveSel.value = t.defaultMove ?? t.moves[0];
  // auto-set weather from the threat (e.g. Charizard Y → sun)
  $("weather").value = t.setsWeather ?? "none";
  renderSet(t);
  calc();
}

function renderSet(t){
  const s = computeStats(t.base, t.sp, t.nature);
  const nat = (t.nature.plus?`+${t.nature.plus} `:"") + (t.nature.minus?`-${t.nature.minus}`:"") || "neutral";
  $("setinfo").innerHTML =
    `<b>${t.name}</b> · ${t.item} · ${t.ability} · ${nat}` +
    `<br><span class="dim">stats</span> ${s.hp}/${s.atk}/${s.def}/${s.spa}/${s.spd}/${s.spe}` +
    (t.note ? `<br><span class="dim">${t.note}</span>` : "") +
    (t.conf==="std" ? `<br><span class="warn">spread = standard convention — verify for tight calcs</span>` : "");
}

function calc(){
  const d = teamByName[defSel.value];
  const t = currentThreat();
  const mv = { ...MOVES[moveSel.value], name: moveSel.value };
  mv.power = movePower(mv, { faintedAllies: +$("faints").value });

  const field = {
    weather: $("weather").value === "none" ? null : $("weather").value,
    screen: $("screen").checked,
    atkMult: $("intim").checked && mv.category === "phys" ? 2/3 : 1,
  };
  const r = matchup(t, d, mv, field);

  const dStats = computeStats(d.base, d.sp, d.nature);
  let note = "";
  // apply your defensive berry (Occa/Chople) if this hit triggers it
  if (d.berry && d.berry.type === (t.ability==="Pixilate"&&mv.type==="Normal"?"Fairy":mv.type)
      && (!d.berry.superEffOnly || r.typeMult > 1)) {
    const eff = Math.max(1, Math.round(r.max * d.berry.mult));
    note = `${d.name}'s berry halves this → ${(100*eff/dStats.hp).toFixed(0)}% max`;
  }
  if (d.item === "Focus Sash") note = "Focus Sash: survives one hit from full HP";

  // speed order between your mon and the threat, given field
  const field2 = { weather: field.weather, trickRoom: $("trickroom").checked,
                   tailwind: $("tailwind").checked ? ["me"] : [] };
  const meMon  = { spe: dStats.spe, side:"me",  item:d.item };
  const oppMon = { spe: computeStats(t.base,t.sp,t.nature).spe, side:"opp", item:t.item };
  const fr = faster(meMon, oppMon, field2);
  const who = fr.first==="tie" ? "SPEED TIE (50/50)" :
              fr.first==="a" ? `you outspeed (${fr.aSpeed} vs ${fr.bSpeed})`
                             : `they outspeed (${fr.bSpeed} vs ${fr.aSpeed})`;
  $("speed").textContent = `Speed: ${who}${field2.trickRoom?" · under Trick Room":""}${field2.tailwind.length?" · your Tailwind":""}`;

  const box = $("result");
  let verdict, cls;
  if (d.item === "Focus Sash") { verdict = "LIVES (Sash)"; cls = "live"; }
  else if (r.typeMult === 0)   { verdict = "IMMUNE"; cls = "live"; }
  else if (r.maxPct < 100)     { verdict = "LIVES"; cls = "live"; }
  else if (r.minPct >= 100)    { verdict = "DEAD"; cls = "dead"; }
  else                         { verdict = "ROLL"; cls = "roll"; }

  box.className = "result " + cls;
  box.innerHTML =
    `<div class="verdict">${verdict}</div>` +
    (r.typeMult===0 ? `<div class="range">no effect</div>` :
      `<div class="range">${r.minPct}% – ${r.maxPct}%</div>
       <div class="dim">${r.min}–${r.max} dmg vs ${dStats.hp} HP · x${r.typeMult} · ${r.koChance}</div>`) +
    (note ? `<div class="warn">${note}</div>` : "") +
    `<div class="dim small">no crit · max roll assumes 100% · ${field.weather??"no weather"}${field.screen?" · screen":""}${$("intim").checked?" · intimidate":""}</div>`;
}

["defender","move","weather","screen","intim","faints","tailwind","trickroom"].forEach(id => $(id).addEventListener("input", calc));
thrSel.addEventListener("input", refreshMoves);
refreshMoves();
