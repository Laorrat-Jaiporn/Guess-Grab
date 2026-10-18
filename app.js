"use strict";
/* Guess & Grab: Roboflow Workflow integration.
   Inference runs through a backend at /api/detect (Cloudflare Pages Function).
   Never put a private API key in this browser file.
*/

// ---------- ระบบจัดการเสียง (Audio System) ----------
const sounds = {
  bgm: new Audio("sounds/bgm.mp3"),
  correct: new Audio("sounds/correct.mp3"),
  wrong: new Audio("sounds/wrong.mp3"),
  victory: new Audio("sounds/victory.mp3")
};

// ตั้งค่าความดังและลูปเสียง
sounds.bgm.loop = true;
sounds.bgm.volume = 0.25;      // เพลงพื้นหลังเสียงเบาพอเหมาะ ไม่กลบเสียงเอฟเฟกต์
sounds.correct.volume = 0.8;
sounds.wrong.volume = 0.7;
sounds.victory.volume = 0.8;

// ฟังก์ชันช่วยเล่นเสียงเอฟเฟกต์อย่างราบรื่น
function playSound(audio) {
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(err => console.warn("Audio play prevented:", err));
  }
}

function stopSound(audio) {
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}

const CONFIG = {
  WORKSPACE: "0799-natkritta-silapachaisri",
  MODEL_NAME: "projectai_object-detection",
  MODEL_VERSION: "1",
  INFERENCE_ENDPOINT: "/api/detect",

  MIN_CONF: 0.5,        // ค่าความมั่นใจขั้นต่ำ
  WRONG_CONF: 0.75,     
  FRAMES_NEEDED: 2,     // ตรวจพบต่อเนื่อง 2 เฟรมเพื่อยืนยัน

  // Game rules
  TIME_OPTIONS_MS: [30000, 60000, 90000, 120000],
  DEFAULT_TIME_MS: 30000,
  COUNT_OPTIONS: [3, 5, 10],
  DEFAULT_COUNT: 5,
  REVEAL_AT_MS: 10000,
  RESULT_MS: 2000,
  MAX_POINTS: 100,

  INCLUDE_UNSUPPORTED_OBJECTS: true, // อนุญาตให้สุ่มของครบทุกอย่าง

  SCORE: (remainingMs, totalMs) =>
    Math.round(Math.min(CONFIG.MAX_POINTS, Math.max(0,
      CONFIG.MAX_POINTS * remainingMs / totalMs))),

  CLASSES: [
    "Water bottle", "Glasses", "Hat", "Inhaler", "Mouse",
    "Scissors", "Socks", "Tissue", "Body powder", "Fork",
    "Phone", "Instant noodles", "Watch", "Calculator", "Toothpaste",
    "Razor", "Makeup brush", "Eyelash curler", "Nail clippers", "Mask"
  ],

  STORE: "guessAndGrab.history.v1"
};

// แมปปิ้งทั้ง 20 คลาสให้ตรงกับโมเดล Roboflow 
const OBJECTS = [
  { id: "Water-bottle",   name: "Water-bottle",    clue: "I hold water. You drink from me.",                             modelClasses: ["water bottle", "bottle"] },
  { id: "Glasses",        name: "Glasses",         clue: "You wear me to see better.",                                   modelClasses: ["glasses"] },
  { id: "Hat",            name: "Hat",             clue: "You wear me on your head.",                                    modelClasses: ["hat"] },
  { id: "Inhaler",        name: "Inhaler",         clue: "You smell me when you feel dizzy.",                            modelClasses: ["inhaler"] },
  { id: "Mouse",          name: "Mouse",           clue: "You use me to control a computer.",                            modelClasses: ["mouse"] },
  { id: "Scissors",       name: "Scissors",        clue: "You use me to cut paper.",                                     modelClasses: ["scissors"] },
  { id: "Socks",          name: "Socks",           clue: "You wear me on your feet.",                                    modelClasses: ["socks", "sock"] },
  { id: "Tissue",         name: "Tissue",          clue: "You use me to wipe your nose.",                                modelClasses: ["tissue"] },
  { id: "Body-powder",    name: "Body powder",     clue: "You put me on your skin to feel dry.",                         modelClasses: ["body powder", "powder"] },
  { id: "Fork",           name: "Fork",            clue: "I have sharp points. I help you pick up food.",                modelClasses: ["fork"] },
  { id: "Phone",          name: "Phone",           clue: "I have a screen. You can use me to call, text, and take photos.", modelClasses: ["phone"] },
  { id: "Instant-noodles",name: "Instant-noodles", clue: "I come in a packet. Add hot water and eat me.",                modelClasses: ["instant noodles", "noodles"], disabled: true },
  { id: "Watch",          name: "Watch",           clue: "I wear you on my wrist. You tell me the time.",                modelClasses: ["watch"] },
  { id: "Calculator",     name: "Calculator",      clue: "You use me to do math.",                                       modelClasses: ["calculator"] },
  { id: "Toothpaste",     name: "Toothpaste",      clue: "You put me on a toothbrush to clean your teeth.",              modelClasses: ["toothpaste"] },
  { id: "Razor",          name: "Razor",           clue: "You use me to remove hair.",                                   modelClasses: ["razor"] },
  { id: "Makeup-brush",   name: "Makeup-brush",    clue: "You use me to put makeup on your face.",                       modelClasses: ["makeup brush"] },
  { id: "Eyelash-curler", name: "Eyelash-curler",  clue: "You use me to curl your eyelashes.",                           modelClasses: ["eyelash curler"] },
  { id: "Nail-clippers",  name: "Nail-clippers",   clue: "You use me to cut your nails.",                                modelClasses: ["nail clippers"] },
  { id: "Mask",           name: "Mask",            clue: "You wear me over your nose and mouth.",                        modelClasses: ["mask"] }
];

const $ = id => document.getElementById(id);
const video = $("cam");
const canvas = $("overlay");
const ctx = canvas.getContext("2d");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let stream = null;
let S = null;                 
let lastConfig = null;        
let requestInProgress = false;
let loopSeq = 0;

// ---------- utilities ----------

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}
function sec(ms) { return (ms / 1000).toFixed(1) + "s"; }
function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
function timeLabel(ms) {
  return ({ 30000: "30 seconds", 60000: "1 minute", 90000: "1 minute 30 seconds", 120000: "2 minutes" })[ms] || sec(ms);
}
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ---------- pure game logic ----------

function buildSlots(playerCount, count) {
  const slots = [];
  for (let n = 1; n <= count; n++) {
    for (let p = 0; p < playerCount; p++) {
      slots.push({ index: slots.length, player: p, number: n, status: "pending", object: null, points: 0, timeMs: null });
    }
  }
  return slots;
}

function scoreFor(remainingMs, totalMs) { return CONFIG.SCORE(remainingMs, totalMs); }

function playerTotals(match, p) {
  const mine = match.slots.filter(s => s.player === p);
  return {
    score: mine.reduce((sum, s) => sum + s.points, 0),
    found: mine.filter(s => s.status === "found").length,
    skipped: mine.filter(s => s.status === "skipped").length,
    forfeited: mine.filter(s => s.status === "forfeit").length,
    timedOut: mine.filter(s => s.status === "timeout").length,
    assigned: mine.length
  };
}

function pickObject(match) {
  // กรองสิ่งของที่ไม่ต้องการให้สุ่ม (disabled: true) ออก
  const usable = OBJECTS.filter(o => 
    !o.disabled && (CONFIG.INCLUDE_UNSUPPORTED_OBJECTS || o.modelClasses.length > 0)
  );

  if (!match.pool || match.pool.length === 0) {
    match.pool = shuffle(usable.map(o => o.id));
    const last = match.pool.length - 1;
    if (match.pool.length > 1 && match.pool[last] === match.lastObjectId) {
      [match.pool[0], match.pool[last]] = [match.pool[last], match.pool[0]];
    }
  }
  const id = match.pool.pop();
  match.lastObjectId = id;
  return OBJECTS.find(o => o.id === id);
}

// ---------- history (leaderboard) ----------

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(CONFIG.STORE)) || []; } catch { return []; }
}
function saveRuns(runs) {
  try {
    const history = loadHistory().concat(runs);
    localStorage.setItem(CONFIG.STORE, JSON.stringify(history.slice(-200)));
  } catch (error) { console.warn("Could not save game history:", error); }
}
function renderBoard() {
  const top = loadHistory().sort((a, b) => b.score - a.score).slice(0, 5);
  $("board").innerHTML = top.length
    ? top.map(r => `<li><b>${esc(r.name)}</b>: ${r.score} pts (${r.found}/${r.tasks} found, ${esc(timeLabel(r.timeMs))} per object)</li>`).join("")
    : "<li>No games yet.</li>";
}

// ---------- navigation ----------

const SCREENS = ["home", "setup", "game", "result"];
function show(id) {
  if (id !== "game") teardownMatch();
  // หยุดเพลง BGM และ Victory เฉพาะตอนที่ย้อนกลับมาหน้าแรกสุด (Home)
  if (id === "home") {
    stopSound(sounds.bgm);
    stopSound(sounds.victory);
  }
  if (id === "home" || id === "setup") S = null;
  for (const s of SCREENS) $(s).hidden = s !== id;
  const heading = $(id).querySelector("h1");
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  window.scrollTo(0, 0);
}

// ---------- modals ----------

let modalReturnFocus = null;
function openModal(id, focusId) {
  modalReturnFocus = document.activeElement;
  $(id).hidden = false;
  $(focusId).focus();
}
function closeModal(id) {
  $(id).hidden = true;
  if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
  modalReturnFocus = null;
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (!$("giveModal").hidden) cancelGiveUp();
    else if (!$("howModal").hidden) closeModal("howModal");
  } else if (e.key === "Tab") {
    for (const id of ["giveModal", "howModal"]) {
      if ($(id).hidden) continue;
      const items = [...$(id).querySelectorAll("button")].filter(b => !b.disabled);
      if (!items.length) continue;
      const first = items[0], last = items[items.length - 1];
      if (!$(id).contains(document.activeElement)) { first.focus(); e.preventDefault(); }
      else if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  }
});

// ---------- home & setup ----------

// เมื่อกด Start Game จากหน้าแรก -> เล่นเพลง BGM ทันที
$("btnStart").onclick = () => { 
  resetSetupMessages(); 
  stopSound(sounds.victory);
  if (sounds.bgm.paused) {
    sounds.bgm.currentTime = 0;
    sounds.bgm.play().catch(e => console.log("Audio play blocked:", e));
  }
  show("setup"); 
};

$("btnHow").onclick = () => openModal("howModal", "howClose");
$("howClose").onclick = () => closeModal("howModal");

// เมื่อกดย้อนกลับจากหน้าตั้งค่าไปหน้าแรก -> หยุดเพลง BGM
$("btnSetupBack").onclick = () => {
  stopSound(sounds.bgm);
  show("home");
};

function updateSetupView() {
  const two = $("players").value === "2";
  $("wrapP2").hidden = !two;
  $("name2").disabled = !two;
  const count = Number($("count").value);
  $("setupSummary").textContent = two
    ? `${count} objects per player = ${count * 2} turns in total`
    : `${count} turns in total`;
}
function resetSetupMessages() {
  $("setupError").hidden = true;
  $("setupError").textContent = "";
}
$("players").onchange = () => { resetSetupMessages(); updateSetupView(); };
$("count").onchange = updateSetupView;
updateSetupView();

function readSetup() {
  const players = Number($("players").value);
  const count = Number($("count").value);
  const timeMs = Number($("time").value);
  if (![1, 2].includes(players)) return { error: "Choose 1 or 2 players." };
  if (!CONFIG.COUNT_OPTIONS.includes(count)) return { error: "Choose how many objects each player must find." };
  if (!CONFIG.TIME_OPTIONS_MS.includes(timeMs)) return { error: "Choose a time limit per object." };
  const names = [$("name1").value.trim() || "Player 1"];
  if (players === 2) names.push($("name2").value.trim() || "Player 2");
  if (players === 2 && names[0].toLowerCase() === names[1].toLowerCase()) {
    return { error: "Players need different names." };
  }
  return { config: { players, names, count, timeMs } };
}

$("setupForm").onsubmit = e => {
  e.preventDefault();
  const { config, error } = readSetup();
  if (error) {
    $("setupError").textContent = error;
    $("setupError").hidden = false;
    return;
  }
  resetSetupMessages();
  startMatch(config);
};

// ---------- Roboflow Workflow Backend Integration ----------

async function initEngine() {
  const response = await fetch(CONFIG.INFERENCE_ENDPOINT, { method: "GET" });
  if (!response.ok) {
    throw new Error("Detection backend is unavailable (HTTP " + response.status + ").");
  }
  const health = await response.json();
  if (health.ready !== true) throw new Error("Detection backend is not ready.");
}

const off = document.createElement("canvas");

async function detect(signal) {
  if (!video.videoWidth || !video.videoHeight) return [];

  const W = 640;
  const k = W / video.videoWidth;
  off.width = W;
  off.height = Math.max(1, Math.round(video.videoHeight * k));
  off.getContext("2d").drawImage(video, 0, 0, off.width, off.height);
  const image = off.toDataURL("image/jpeg", 0.8).split(",")[1];

  const response = await fetch(CONFIG.INFERENCE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, confidence: CONFIG.MIN_CONF }),
    signal
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error("Detection backend returned HTTP " + response.status + ": " + message.slice(0, 250));
  }

  let result;
  try { result = await response.json(); } catch { throw new Error("Invalid response from the detection backend."); }
  if (!result || typeof result !== "object" || result.error) {
    throw new Error("Invalid response from the detection backend.");
  }

  let predictions = [];
  if (Array.isArray(result.predictions)) {
    predictions = result.predictions;
  } else if (Array.isArray(result.outputs)) {
    const out0 = result.outputs[0];
    if (Array.isArray(out0?.model_output?.predictions)) predictions = out0.model_output.predictions;
    else if (Array.isArray(out0?.predictions?.predictions)) predictions = out0.predictions.predictions;
    else if (Array.isArray(out0?.predictions)) predictions = out0.predictions;
  }

  return predictions.map(p => ({
    cls: String(p.class ?? p.class_name ?? "").toLowerCase().trim(),
    conf: Number(p.confidence ?? 0),
    x: Number(p.x ?? 0) / k,
    y: Number(p.y ?? 0) / k,
    w: Number(p.width ?? 0) / k,
    h: Number(p.height ?? 0) / k
  }));
}

// ---------- camera ----------

async function startCamera() {
  if (stream) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error("Camera access is unavailable. Open the game on https:// or http://localhost.");
    err.name = "NoCameraApi";
    throw err;
  }

  const s = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
    audio: false
  });
  stream = s;
  video.srcObject = s;

  if (video.readyState < 1) {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("Could not load camera metadata."));
    });
  }
  await video.play();

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  $("stage").style.setProperty("--ar", String(video.videoWidth / video.videoHeight));

  s.getTracks().forEach(track => {
    track.onended = () => {
      if (stream === s && S && S.phase !== "done") {
        stream = null;
        showCamError({ name: "NotReadableError" });
      }
    };
  });
}

function stopCamera() {
  if (stream) {
    const s = stream;
    stream = null;
    s.getTracks().forEach(track => { track.onended = null; track.stop(); });
  }
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function cameraErrorMessage(err) {
  switch (err && err.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "Camera permission is required. Click the camera or lock icon in your browser's address bar, choose Allow, then press Try Again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device. Connect a camera, then press Try Again.";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "The camera is unavailable or already in use by another app or browser tab. Close it, then press Try Again.";
    case "NoCameraApi":
      return err.message;
    default:
      return "The camera could not be started" + (err && err.message ? " (" + err.message + ")" : "") + ". Press Try Again.";
  }
}

function showCamError(err) {
  $("camErrText").textContent = cameraErrorMessage(err);
  $("camErr").hidden = false;
  setDet("error", S && S.phase === "starting"
    ? "Camera permission is required."
    : "Camera problem. You can still skip this task.");
  $("camRetry").focus();
}

$("camHome").onclick = () => show("home");
$("camRetry").onclick = async () => {
  const match = S;
  if (!match) return;
  $("camErr").hidden = true;
  setDet("info", "Starting the camera...");
  try {
    await startCamera();
  } catch (err) {
    if (S === match) showCamError(err);
    return;
  }
  if (S !== match) return;
  if (match.phase === "starting") bootMatch(match);
  else setDet("info", "Looking for the object...");
};

// ---------- match flow ----------

function teardownMatch() {
  if (S) {
    clearInterval(S.timer);
    S.timer = null;
    if (S.abort) S.abort.abort();
    S.phase = "done";
  }
  stopCamera();
  $("ov").hidden = true;
  $("camErr").hidden = true;
  $("giveModal").hidden = true;
}

function startMatch(config) {
  teardownMatch();
  lastConfig = config;

  stopSound(sounds.victory);
  // ตรวจสอบให้มั่นใจว่า BGM กำลังเล่นอยู่
  if (sounds.bgm.paused) {
    sounds.bgm.currentTime = 0;
    sounds.bgm.play().catch(e => console.log("Audio play blocked:", e));
  }

  const match = S = {
    config,
    limit: config.timeMs,
    slots: buildSlots(config.players, config.count),
    cur: -1,
    withdrawn: config.names.map(() => false),
    pool: [], lastObjectId: null,
    phase: "starting",
    lastPlayer: -1,
    taskSeq: 0, pauseSeq: 0,
    paused: false, pauseStart: 0, pausedMs: 0,
    taskStart: 0, resultEnd: 0,
    streak: 0, wrongStreak: 0, errorStreak: 0,
    object: null, answerShown: false,
    backendOk: true, saved: false, pendingNote: "",
    abort: null, timer: null
  };

  show("game");
  $("clueText").innerHTML = "&nbsp;";
  $("answerLine").hidden = true;
  $("answerName").textContent = "";
  $("turnInfo").textContent = "";
  $("timer").textContent = fmtClock(match.limit);
  $("timerPill").classList.remove("low");
  $("score").textContent = "0";
  $("camErr").hidden = true;
  setButtons(false);
  renderScoreboard();
  setDet("info", "Starting the camera...");

  startCamera().then(
    () => { if (S === match) bootMatch(match); },
    err => { if (S === match) showCamError(err); }
  );
}

async function bootMatch(match) {
  try {
    await initEngine();
    match.backendOk = true;
  } catch (err) {
    console.warn(err);
    match.backendOk = false;
  }
  if (S !== match || match.phase !== "starting") return;

  match.timer = setInterval(tick, 100);
  advance();
  detectLoop(match);
}

function setButtons(enabled) {
  $("btnSkip").disabled = !enabled;
  $("btnGiveUp").disabled = !enabled;
}

function setDet(kind, text) {
  const el = $("detStatus");
  el.className = "detstatus " + kind;
  $("detIcon").textContent = ({ info: "…", ok: "✓", warn: "!", error: "✕" })[kind] || "…";
  $("detText").textContent = text;
}

function showOverlay(title, text, { kind = "", button = false } = {}) {
  $("ov").className = "ov " + kind;
  $("ovTitle").textContent = title;
  $("ovText").textContent = text;
  $("ovBtn").hidden = !button;
  $("ov").hidden = false;
  if (button) $("ovBtn").focus();
}

function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove("show"), 1800);
}

function renderScoreboard() {
  const box = $("sb");
  if (!S || S.config.players < 2) { box.hidden = true; return; }
  const cur = S.slots[S.cur];
  box.hidden = false;
  box.innerHTML = S.config.names.map((name, i) => {
    const t = playerTotals(S, i);
    const active = cur && cur.player === i && S.phase !== "done";
    const out = S.withdrawn[i];
    return `<div class="sbp${active ? " active" : ""}${out ? " out" : ""}">` +
      `<span>${esc(name)}${out ? " <small>(gave up)</small>" : ""}</span><b>${t.score}</b></div>`;
  }).join("");
}

function renderTaskHeader() {
  const slot = S.slots[S.cur];
  $("turnInfo").textContent =
    `${S.config.names[slot.player]}'s turn · Task ${slot.index + 1} of ${S.slots.length}` +
    (S.config.players > 1 ? ` (object ${slot.number} of ${S.config.count})` : "");
  $("score").textContent = String(playerTotals(S, slot.player).score);
  $("clueText").textContent = S.object.clue;
  $("answerLine").hidden = true;
  $("answerName").textContent = "";
  S.answerShown = false;
  $("timer").textContent = fmtClock(S.limit);
  $("timerPill").classList.remove("low");
  renderScoreboard();
}

function advance() {
  if (!S || S.phase === "done") return;
  if (S.abort) S.abort.abort();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  $("ov").hidden = true;

  const next = S.slots.find(s => s.index > S.cur && s.status === "pending");
  if (!next) { showResults(); return; }

  S.cur = next.index;
  S.object = pickObject(S);
  next.object = S.object;
  S.phase = "transition";
  renderTaskHeader();

  const handoff = S.lastPlayer !== -1 && S.lastPlayer !== next.player;
  if (handoff) {
    S.phase = "ready";
    setButtons(false);
    const note = S.pendingNote ? S.pendingNote + " " : "";
    S.pendingNote = "";
    showOverlay(`${S.config.names[next.player]}'s turn`,
      `${note}Pass the device to ${S.config.names[next.player]}. The timer starts when you press Continue.`,
      { button: true });
    setDet("info", "Waiting for the next player...");
  } else {
    beginSearch();
  }
}

$("ovBtn").onclick = () => { if (S && S.phase === "ready") { $("ov").hidden = true; beginSearch(); } };

function beginSearch() {
  const slot = S.slots[S.cur];
  S.phase = "search";
  S.taskSeq++;
  S.taskStart = performance.now();
  S.pausedMs = 0;
  S.paused = false;
  S.streak = 0; S.wrongStreak = 0; S.errorStreak = 0;
  S.lastPlayer = slot.player;
  S.abort = new AbortController();
  $("ov").hidden = true;
  setButtons(true);
  if (!S.object.modelClasses.length) {
    setDet("warn", "This object is not supported by the detection model yet. You can skip this task.");
  } else if (!S.backendOk) {
    setDet("warn", "Detection service unavailable. You can skip this task.");
  } else {
    setDet("info", "Looking for the object...");
  }
}

function deadline() { return S.taskStart + S.limit + S.pausedMs; }

function tick() {
  if (!S) return;
  const now = performance.now();

  if (S.phase === "search" && !S.paused) {
    const left = deadline() - now;
    if (left <= 0) { finishTask("timeout"); return; }
    $("timer").textContent = fmtClock(left);
    $("timerPill").classList.toggle("low", left <= CONFIG.REVEAL_AT_MS);
    if (left <= CONFIG.REVEAL_AT_MS && !S.answerShown) revealAnswer();
  } else if (S.phase === "result" && now >= S.resultEnd) {
    advance();
  }
}

function revealAnswer() {
  S.answerShown = true;
  $("answerName").textContent = S.object.name;
  $("answerLine").hidden = false;
}

function finishTask(outcome, elapsedMs = 0) {
  if (!S || S.phase !== "search") return;
  const slot = S.slots[S.cur];
  if (slot.status !== "pending") return;
  S.phase = "result";
  if (S.abort) S.abort.abort();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setButtons(false);

  const name = S.config.names[slot.player];
  if (outcome === "found") {
    playSound(sounds.correct); // เสียงเมื่อตอบถูก
    const elapsed = Math.min(Math.max(elapsedMs, 0), S.limit);
    slot.status = "found";
    slot.timeMs = elapsed;
    slot.points = scoreFor(S.limit - elapsed, S.limit);
  } else {
    playSound(sounds.wrong);   // เสียงเมื่อหมดเวลา หรือกดข้าม
    slot.status = outcome;
    slot.points = 0;
  }
  $("score").textContent = String(playerTotals(S, slot.player).score);
  renderScoreboard();

  if (outcome === "found") {
    setDet("ok", "Correct object found!");
    showOverlay("Correct!", `${S.object.name} found in ${sec(slot.timeMs)}. +${slot.points} points`, { kind: "ok" });
    S.resultEnd = performance.now() + CONFIG.RESULT_MS;
  } else if (outcome === "timeout") {
    setDet("warn", "Time's up! 0 points.");
    showOverlay("Time's up!", `The answer was ${S.object.name}. 0 points.`, { kind: "bad" });
    S.resultEnd = performance.now() + CONFIG.RESULT_MS;
  } else {
    toast("Skipped. 0 points.");
    advance();
  }
}

$("btnSkip").onclick = () => {
  if (S && S.phase === "search" && !S.paused) finishTask("skipped");
};

// ---------- give up ----------

function pendingFor(p) { return S.slots.filter(s => s.player === p && s.status === "pending").length; }

function pauseTask() {
  if (S.phase === "search" && !S.paused) {
    S.paused = true;
    S.pauseStart = performance.now();
    S.pauseSeq++;
  }
}
function resumeTask() {
  if (S.phase === "search" && S.paused) {
    S.pausedMs += performance.now() - S.pauseStart;
    S.paused = false;
  }
}

$("btnGiveUp").onclick = () => {
  if (!S || S.phase !== "search" || S.paused) return;
  pauseTask();
  const slot = S.slots[S.cur];
  const n = pendingFor(slot.player);
  $("giveText").textContent =
    `${S.config.names[slot.player]}, your ${n} remaining ${n === 1 ? "task" : "tasks"} will count as zero points. ` +
    `Points you have already earned are kept.`;
  openModal("giveModal", "giveKeep");
};
function cancelGiveUp() {
  closeModal("giveModal");
  if (S) resumeTask();
}
$("giveKeep").onclick = cancelGiveUp;
$("giveYes").onclick = () => {
  closeModal("giveModal");
  if (S && S.phase === "search") withdraw(S.slots[S.cur].player);
};

function withdraw(p) {
  if (!S || S.withdrawn[p]) return;
  S.withdrawn[p] = true;
  const cur = S.slots[S.cur];
  const currentIsMine = !!cur && cur.player === p && cur.status === "pending";

  for (const slot of S.slots) {
    if (slot.player === p && slot.status === "pending") { slot.status = "forfeit"; slot.points = 0; slot.timeMs = null; }
  }
  S.paused = false;

  if (currentIsMine) {
    S.phase = "transition";
    if (S.abort) S.abort.abort();
    S.pendingNote = `${S.config.names[p]} gave up. Their remaining tasks count as zero.`;
    toast(`${S.config.names[p]} gave up.`);
    advance();
  } else {
    renderScoreboard();
    if (!S.slots.some(s => s.status === "pending")) showResults();
  }
}

// ---------- detection loop ----------

async function detectLoop(match) {
  const myLoop = ++loopSeq;

  while (S === match && loopSeq === myLoop && match.phase !== "done") {
    const supported = match.object && match.object.modelClasses.length > 0;
    if (match.phase !== "search" || match.paused || !stream || !supported || requestInProgress) {
      await sleep(80);
      continue;
    }

    const seq = match.taskSeq, pSeq = match.pauseSeq;
    const capturedAt = performance.now();
    const signal = match.abort ? match.abort.signal : undefined;
    let detections;

    try {
      requestInProgress = true;
      detections = await detect(signal);
      match.backendOk = true;
    } catch (error) {
      if (error && error.name === "AbortError") { await sleep(30); continue; }
      console.warn("Detection error:", error);
      if (S === match && match.phase === "search" && match.taskSeq === seq) {
        match.errorStreak++;
        if (match.errorStreak >= 2) {
          setDet("error", navigator.onLine === false
            ? "Network connection lost. You can skip this task."
            : "Detection service unavailable. You can skip this task.");
        }
      }
      await sleep(800);
      continue;
    } finally {
      requestInProgress = false;
    }

    if (
      S !== match || match.phase !== "search" || match.paused ||
      match.taskSeq !== seq || match.pauseSeq !== pSeq ||
      capturedAt >= deadline()
    ) continue;

    match.errorStreak = 0;
    const accepted = match.object.modelClasses.map(c => c.toLowerCase().trim());
    const isTarget = d => accepted.includes(d.cls.toLowerCase().trim());
    draw(detections, isTarget);

    const hit = detections.find(d => isTarget(d) && d.conf >= CONFIG.MIN_CONF);
    const wrong = !hit && detections.find(d => !isTarget(d) && d.conf >= CONFIG.WRONG_CONF);
    const weak = !hit && !wrong && detections.find(d => d.conf > 0 && d.conf < CONFIG.MIN_CONF);

    match.streak = hit ? match.streak + 1 : 0;
    match.wrongStreak = wrong ? match.wrongStreak + 1 : 0;

    if (match.streak >= CONFIG.FRAMES_NEEDED) {
      finishTask("found", capturedAt - match.taskStart - match.pausedMs);
    } else if (hit) {
      setDet("ok", "Object detected! Hold it steady...");
    } else if (wrong && match.wrongStreak >= CONFIG.FRAMES_NEEDED) {
      setDet("warn", "Object not recognized. Try again.");
    } else if (weak) {
      setDet("warn", "Object detected, but confidence is low. Move closer or improve the lighting.");
    } else if (!wrong) {
      setDet("info", "Looking for the object...");
    }
    await sleep(50);
  }
}

function draw(detections, isTarget) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = Math.max(3, canvas.width / 280);
  for (const d of detections) {
    const ok = isTarget(d) && d.conf >= CONFIG.MIN_CONF;
    ctx.strokeStyle = ok ? "#1f6f5c" : "#c9452f";
    ctx.setLineDash(ok ? [] : [10, 8]);
    ctx.strokeRect(d.x - d.w / 2, d.y - d.h / 2, d.w, d.h);
  }
  ctx.setLineDash([]);
}

// ---------- results ----------

function taskResultText(slot) {
  switch (slot.status) {
    case "found": return "✓ Found in " + sec(slot.timeMs);
    case "skipped": return "↷ Skipped";
    case "timeout": return "⌛ Time's up";
    case "forfeit": return "✕ Forfeited";
    default: return "–";
  }
}

function showResults() {
  const match = S;
  match.phase = "done";
  const names = match.config.names;
  const stats = names.map((_, i) => ({ ...playerTotals(match, i), name: names[i], out: match.withdrawn[i] }));

  if (!match.saved) {
    match.saved = true;
    saveRuns(stats.map(p => ({
      name: p.name, score: p.score, found: p.found, skipped: p.skipped,
      forfeited: p.forfeited, timedOut: p.timedOut, tasks: p.assigned,
      timeMs: match.limit, date: Date.now()
    })));
  }

  teardownMatch();

  // ปิด BGM แล้วเล่นเพลงหน้าสรุปคะแนน
  stopSound(sounds.bgm);
  playSound(sounds.victory);

  const top = Math.max(...stats.map(p => p.score));
  const winners = stats.filter(p => p.score === top);
  if (stats.length === 1) $("resBanner").textContent = `Final score: ${stats[0].score}`;
  else if (winners.length > 1) $("resBanner").textContent = "It's a draw!";
  else $("resBanner").textContent = `★ Winner: ${winners[0].name}`;

  $("resMeta").textContent =
    `${match.slots.length} tasks in total · ${timeLabel(match.limit)} per object`;

  $("resCards").innerHTML = stats.map((p, i) => `
    <div class="rescard">
      <h3><span>${esc(p.name)}</span><span class="total">${p.score} pts</span></h3>
      ${p.out ? '<span class="tag">Gave up</span>' : ""}
      <dl>
        <dt>Objects found</dt><dd>${p.found}</dd>
        <dt>Objects skipped</dt><dd>${p.skipped}</dd>
        <dt>Tasks forfeited</dt><dd>${p.forfeited}</dd>
        <dt>Timed-out tasks</dt><dd>${p.timedOut}</dd>
        <dt>Assigned tasks</dt><dd>${p.assigned}</dd>
      </dl>
      <table>
        <tr><th>#</th><th>Object</th><th>Result</th><th>Pts</th></tr>
        ${match.slots.filter(s => s.player === i).map(s => `
          <tr><td>${s.number}</td><td>${esc(s.object ? s.object.name : "—")}</td><td>${esc(taskResultText(s))}</td><td>${s.points}</td></tr>`).join("")}
      </table>
    </div>`).join("");

  renderBoard();
  show("result");
}

$("btnAgain").onclick = () => { 
  stopSound(sounds.victory);
  if (lastConfig) startMatch(lastConfig); 
  else show("setup"); 
};

$("btnHome").onclick = () => {
  stopSound(sounds.victory);
  show("home");
};

$("btnClearBoard").onclick = () => {
  try { localStorage.removeItem(CONFIG.STORE); } catch { /* ignore */ }
  renderBoard();
};

window.GuessAndGrab = {
  CONFIG, OBJECTS, buildSlots, scoreFor, playerTotals, pickObject,
  getState: () => S
};