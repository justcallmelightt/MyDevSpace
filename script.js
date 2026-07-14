const readStorage = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const state = {
  username: localStorage.getItem("myDevSpace.github") || "",
  competitions: readStorage("myDevSpace.competitions", []),
  projects: readStorage("myDevSpace.projects", []),
  theme: localStorage.getItem("myDevSpace.theme") || "lime",
  notifications: localStorage.getItem("myDevSpace.notifications") === "on",
  activities: new Map(),
  activityLevels: new Map(),
  toastTimer: null,
};

const themes = {
  lime: { accent: "#c9ff3d", deep: "#a7e30e", inverse: "#c9ff3d", foreground: "#000000" },
  blue: { accent: "#2764ff", deep: "#1747c4", inverse: "#6f95ff", foreground: "#ffffff" },
  orange: { accent: "#ff5c35", deep: "#d63a18", inverse: "#ff7655", foreground: "#ffffff" },
  black: { accent: "#000000", deep: "#000000", inverse: "#ffffff", foreground: "#ffffff" },
  graphite: { accent: "#292929", deep: "#111111", inverse: "#d5d5d5", foreground: "#ffffff" },
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const makeId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function saveData() {
  localStorage.setItem("myDevSpace.competitions", JSON.stringify(state.competitions));
  localStorage.setItem("myDevSpace.projects", JSON.stringify(state.projects));
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDday(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(`${dateString}T00:00:00`);
  return Math.ceil((deadline - today) / 86400000);
}

function formatDday(days) {
  if (days === 0) return "D-DAY";
  return days > 0 ? `D–${days}` : `D+${Math.abs(days)}`;
}

function setToday() {
  $("#todayLabel").textContent = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function applyTheme(name, notify = false) {
  const theme = themes[name] || themes.lime;
  state.theme = name in themes ? name : "lime";
  document.documentElement.style.setProperty("--accent", theme.accent);
  document.documentElement.style.setProperty("--accent-deep", theme.deep);
  document.documentElement.style.setProperty("--accent-inverse", theme.inverse);
  document.documentElement.style.setProperty("--accent-foreground", theme.foreground);
  localStorage.setItem("myDevSpace.theme", state.theme);
  $$(".theme-swatch").forEach((button) => {
    const selected = button.dataset.theme === state.theme;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  if (notify) showToast("포인트 컬러를 저장했어요.");
}

function getNextCompetition() {
  return state.competitions
    .map((item) => ({ ...item, days: getDday(item.deadline) }))
    .filter((item) => item.days >= 0)
    .sort((a, b) => a.days - b.days)[0] || null;
}

function updateNotificationUI() {
  const supported = "Notification" in window;
  const permission = supported ? Notification.permission : "unsupported";
  const stateLabel = $("#notificationState");
  const button = $("#enableNotifications");
  const next = getNextCompetition();
  $("#notificationDot").hidden = !(next && next.days <= 3);

  if (!supported) {
    stateLabel.textContent = "이 브라우저에서는 시스템 알림을 지원하지 않아요";
    button.textContent = "지원 안 됨";
    button.disabled = true;
    return;
  }
  if (permission === "denied") {
    stateLabel.textContent = "브라우저 설정에서 알림 권한을 허용해 주세요";
    button.textContent = "권한 차단됨";
    button.disabled = true;
    return;
  }
  const active = permission === "granted" && state.notifications;
  stateLabel.textContent = active ? "D-3 이내 마감을 시스템 알림으로 알려드려요" : "이 기기에서 마감 알림이 꺼져 있어요";
  button.textContent = active ? "알림 끄기" : "알림 켜기";
  button.disabled = false;
}

async function toggleNotifications() {
  if (!("Notification" in window)) return;
  if (state.notifications && Notification.permission === "granted") {
    state.notifications = false;
    localStorage.setItem("myDevSpace.notifications", "off");
    updateNotificationUI();
    showToast("마감 시스템 알림을 껐어요.");
    return;
  }
  const permission = await Notification.requestPermission();
  state.notifications = permission === "granted";
  localStorage.setItem("myDevSpace.notifications", state.notifications ? "on" : "off");
  updateNotificationUI();
  if (state.notifications) {
    new Notification("My Dev Space 알림이 켜졌어요", { body: "마감 3일 전부터 이 기기에서 알려드릴게요.", tag: "my-dev-space-enabled" });
    checkDeadlineNotification();
  } else {
    showToast("알림 권한이 허용되지 않았어요.");
  }
}

function checkDeadlineNotification() {
  updateNotificationUI();
  if (!("Notification" in window) || Notification.permission !== "granted" || !state.notifications) return;
  const next = getNextCompetition();
  if (!next || next.days > 3) return;
  const today = formatDateKey(new Date());
  const notificationKey = `myDevSpace.notified.${next.id}`;
  if (localStorage.getItem(notificationKey) === today) return;
  new Notification(`${formatDday(next.days)} · ${next.name}`, {
    body: `현재 진행률 ${next.progress || 0}%입니다. 대시보드에서 오늘의 계획을 확인하세요.`,
    tag: `my-dev-space-${next.id}`,
  });
  localStorage.setItem(notificationKey, today);
}

let revealObserver;
function observeReveal(element, delay = 0) {
  if (!element) return;
  element.dataset.reveal = "";
  element.style.transitionDelay = `${Math.min(delay, 240)}ms`;
  revealObserver?.observe(element);
}

function setupMotion() {
  document.documentElement.classList.add("motion-ready");
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .08, rootMargin: "0px 0px -40px" });
  $$(".topbar, .metric-card, .focus-card, .section-title-row, .project-card, .github-heading, .github-panel, .footer").forEach((element, index) => observeReveal(element, (index % 4) * 55));
}

function seedDemoActivity() {
  const map = new Map();
  const today = new Date();
  for (let offset = 0; offset < 364; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const wave = Math.sin(offset * 1.73) + Math.cos(offset * 0.41);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const count = wave > 0.55 ? Math.max(1, Math.round((wave + 1) * (isWeekend ? 1.1 : 2.2))) : 0;
    map.set(formatDateKey(date), count);
  }
  return map;
}

function getLevel(count) {
  if (!count) return 0;
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function renderHeatmap(activityMap, source = "demo", levelMap = new Map()) {
  const heatmap = $("#heatmap");
  const monthLabels = $("#monthLabels");
  heatmap.innerHTML = "";
  monthLabels.innerHTML = "";

  const end = new Date();
  end.setHours(12, 0, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - end.getDay() - (51 * 7));
  let cursor = new Date(start);
  let total = 0;
  const activeDateSet = new Set();
  const weekdayTotals = Array(7).fill(0);

  for (let index = 0; index < 364; index += 1) {
    const key = formatDateKey(cursor);
    const count = activityMap.get(key) || 0;
    const cell = document.createElement("i");
    cell.dataset.level = levelMap.get(key) ?? getLevel(count);
    cell.title = `${key} · ${count} contributions`;
    cell.setAttribute("aria-hidden", "true");
    heatmap.appendChild(cell);
    total += count;
    weekdayTotals[cursor.getDay()] += count;
    if (count > 0) activeDateSet.add(key);
    cursor.setDate(cursor.getDate() + 1);
  }

  let previousMonth = -1;
  for (let week = 0; week < 52; week += 1) {
    const labelDate = new Date(start);
    labelDate.setDate(start.getDate() + week * 7);
    const label = document.createElement("span");
    const month = labelDate.getMonth();
    label.textContent = month !== previousMonth ? `${month + 1}월` : "";
    previousMonth = month;
    monthLabels.appendChild(label);
  }

  const weekdays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const bestDayIndex = weekdayTotals.indexOf(Math.max(...weekdayTotals));
  $("#eventCount").textContent = total;
  $("#activeDays").textContent = activeDateSet.size;
  $("#bestDay").textContent = weekdays[bestDayIndex];

  const recentSeven = [];
  for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    recentSeven.push(activityMap.get(formatDateKey(date)) || 0);
  }
  $("#weekDots").innerHTML = recentSeven.map((count) => `<i class="${count ? "on" : ""}" title="${count} contributions"></i>`).join("");
  const reverse = [...recentSeven].reverse();
  const rollingStreak = reverse.findIndex((count) => count === 0);
  $("#streakValue").textContent = `${rollingStreak === -1 ? 7 : rollingStreak}일`;
  $("#rhythmCopy").textContent = source === "calendar" ? "실제 GitHub 기여 캘린더 기준" : source === "events" ? "GitHub 공개 이벤트 기준" : "연결 전 데모 리듬 미리보기";
}

async function fetchContributionCalendar(username) {
  const response = await fetch(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}?y=last`);
  if (!response.ok) throw new Error("Contribution calendar 응답 오류");
  const data = await response.json();
  if (!Array.isArray(data.contributions)) throw new Error("Contribution calendar 형식 오류");
  const map = new Map(data.contributions.map((item) => [item.date, Number(item.count) || 0]));
  const levels = new Map(data.contributions.map((item) => [item.date, Number(item.level) || 0]));
  return { map, levels, count: data.contributions.reduce((sum, item) => sum + (Number(item.count) || 0), 0) };
}

async function fetchPublicEvents(username) {
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`, {
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!response.ok) throw new Error(response.status === 404 ? "GitHub 사용자를 찾을 수 없어요." : "GitHub 데이터를 불러오지 못했어요.");
  const events = await response.json();
  const map = new Map();
  events.forEach((event) => {
    const key = formatDateKey(new Date(event.created_at));
    const weight = event.type === "PushEvent" ? Math.max(1, event.payload?.size || 1) : 1;
    map.set(key, (map.get(key) || 0) + weight);
  });
  return { map, levels: new Map(), count: events.length };
}

async function fetchGithubActivity(username, notify = true) {
  const button = $("#syncGithub");
  button.disabled = true;
  button.textContent = "불러오는 중…";
  $("#syncState").textContent = "GitHub와 연결 중";
  try {
    let result;
    let source = "calendar";
    try {
      result = await fetchContributionCalendar(username);
    } catch {
      result = await fetchPublicEvents(username);
      source = "events";
    }
    state.username = username;
    state.activities = result.map;
    state.activityLevels = result.levels;
    localStorage.setItem("myDevSpace.github", username);
    $("#githubHandle").textContent = `@${username}`;
    $("#syncState").textContent = source === "calendar" ? "실제 contribution calendar 동기화됨" : "공개 이벤트로 보완됨";
    $("#githubNotice").textContent = source === "calendar" ? "GitHub 프로필의 실제 공개 contribution calendar입니다." : "Contribution 서비스 연결 실패로 GitHub Public Events를 표시합니다.";
    renderHeatmap(result.map, source, result.levels);
    if (notify) showToast(`@${username}의 실제 GitHub 데이터를 업데이트했어요.`);
    return true;
  } catch (error) {
    $("#syncState").textContent = "연결 실패 · 데모 데이터 유지";
    if (notify) showToast(error.message || "GitHub 연결을 확인해 주세요.");
    return false;
  } finally {
    button.disabled = false;
    button.textContent = "동기화 ↻";
  }
}

function createEmptyCompetition() {
  const empty = document.createElement("article");
  empty.className = "competition-row empty-row";
  empty.innerHTML = `<div class="date-block"><strong>+</strong><span>NEW</span></div><div class="competition-copy"><div><span class="status-chip">아직 등록된 일정 없음</span></div><h3>참가 중인 공모전을 추가해 주세요</h3><p>이름, 마감일, 진행률을 기준으로 Focus Radar가 다음 행동을 추천합니다.</p></div><div class="progress-cell"><span><b>실제 데이터 입력 대기 중</b><strong>0%</strong></span><div class="progress"><i style="width:0%"></i></div></div><div class="dday"><span>마감까지</span><strong>미정</strong></div>`;
  return empty;
}

function renderCompetitions() {
  const list = $("#competitionList");
  list.innerHTML = "";
  const sorted = [...state.competitions].sort((a, b) => getDday(a.deadline) - getDday(b.deadline));
  if (!sorted.length) list.appendChild(createEmptyCompetition());

  sorted.forEach((competition) => {
    const days = getDday(competition.deadline);
    const date = new Date(`${competition.deadline}T00:00:00`);
    const progress = Math.min(100, Math.max(0, Number(competition.progress) || 0));
    const row = document.createElement("article");
    row.className = `competition-row ${days >= 0 && days <= 14 ? "urgent" : ""} ${days < 0 ? "muted-row" : ""}`;
    row.innerHTML = `<div class="date-block"><strong></strong><span></span></div><div class="competition-copy"><div><span class="tag">REAL</span><span class="status-chip"></span></div><h3></h3><p></p></div><div class="progress-cell"><span><b>진행률</b><strong></strong></span><div class="progress"><i></i></div></div><div class="dday"><span>마감까지</span><strong></strong><button class="manage-button" type="button" data-delete-competition>삭제</button></div>`;
    row.dataset.id = competition.id;
    $(".date-block strong", row).textContent = String(date.getDate()).padStart(2, "0");
    $(".date-block span", row).textContent = date.toLocaleString("en-US", { month: "short" }).toUpperCase();
    $(".status-chip", row).textContent = days < 0 ? "마감됨" : progress >= 100 ? "완료" : "진행 중";
    $("h3", row).textContent = competition.name;
    $(".competition-copy > p", row).textContent = competition.description;
    $(".progress-cell strong", row).textContent = `${progress}%`;
    $(".progress i", row).style.width = `${progress}%`;
    $(".dday > strong", row).textContent = formatDday(days);
    list.appendChild(row);
    if (revealObserver) observeReveal(row, 40);
  });
  updateDashboardSummary();
}

function appendCustomProjects() {
  $$(".custom-project", $("#projectGrid")).forEach((card) => card.remove());
  state.projects.forEach((project, offset) => {
    const card = document.createElement("article");
    card.className = "project-card custom-project";
    card.dataset.id = project.id;
    card.innerHTML = `<div class="project-meta"><span></span><span>PERSONAL</span></div><div><p class="project-kicker">CUSTOM PROJECT</p><h3></h3><p></p></div><footer><div class="project-stack"><span>NEW</span><span>MVP</span></div><button class="manage-button" type="button" data-delete-project>삭제</button></footer>`;
    $(".project-meta span", card).textContent = String(offset + 3).padStart(2, "0");
    $("h3", card).textContent = project.name;
    $("div:nth-child(2) > p:last-child", card).textContent = project.description;
    $("#projectGrid").appendChild(card);
    if (revealObserver) observeReveal(card, 40);
  });
  $("#activeProjectCount").textContent = 2 + state.projects.length;
}

function updateDashboardSummary() {
  const upcoming = getNextCompetition();
  updateNotificationUI();

  if (!upcoming) {
    $("#deadlineValue").textContent = "D–";
    $("#deadlineCopy").textContent = "실제 공모전 일정을 등록해 주세요";
    $("#deadlineProgress").style.width = "0%";
    $("#focusScore").textContent = "–";
    $("#focusTitle").innerHTML = "먼저 <em>실제 목표</em>를 등록해 추천을 시작해요.";
    $("#focusCopy").textContent = "공모전 마감일과 프로젝트 진행률이 입력되면 가장 급한 작업을 골라 오늘 할 수 있는 크기로 나눕니다.";
    return;
  }

  const progress = Math.min(100, Math.max(0, Number(upcoming.progress) || 0));
  const score = Math.min(99, Math.max(10, Math.round(100 - upcoming.days * 1.8 + (100 - progress) * .22)));
  $("#deadlineValue").textContent = formatDday(upcoming.days);
  $("#deadlineCopy").textContent = `${upcoming.name} · ${new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date(`${upcoming.deadline}T00:00:00`))}`;
  $("#deadlineProgress").style.width = `${progress}%`;
  $("#focusScore").textContent = score;

  const title = $("#focusTitle");
  title.textContent = "";
  title.append("이번 주는 ");
  const emphasis = document.createElement("em");
  emphasis.textContent = upcoming.name;
  title.append(emphasis, "에 집중해요.");

  let recommendation = "핵심 범위를 정하고 첫 번째 동작 가능한 화면부터 완성하세요.";
  if (upcoming.days <= 3) recommendation = "새 기능은 멈추고 제출 파일, 실행 확인, 설명 자료를 최종 점검하세요.";
  else if (progress >= 70) recommendation = "남은 기능보다 오류 점검과 데모 흐름, 제출 설명을 다듬는 편이 좋아요.";
  else if (progress >= 30) recommendation = "핵심 사용자 흐름 하나를 끝까지 연결하고 부가 기능은 뒤로 미뤄 보세요.";
  $("#focusCopy").textContent = `마감까지 ${upcoming.days}일, 현재 진행률 ${progress}%입니다. ${recommendation}`;
  $("#planText1").innerHTML = `<b>15분</b> ${escapeHtml(upcoming.name)}의 남은 작업 3개 정리하기`;
  $("#planText2").innerHTML = `<b>20분</b> 가장 중요한 작업 하나 완료하기`;
  $("#planText3").innerHTML = `<b>10분</b> 진행률을 업데이트하고 제출 위험 확인하기`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function openModal(modal) {
  $$(".modal.is-open").forEach(closeModal);
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("input, select, button:not(.modal-close)", modal)?.focus(), 100);
}

function closeModal(modal) {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function setAddType(type) {
  $("#itemType").value = type;
  const isCompetition = type === "competition";
  $("#competitionFields").hidden = !isCompetition;
  $("#itemDeadline").required = isCompetition;
}

function setupSectionObserver() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.section === entry.target.id));
    });
  }, { rootMargin: "-25% 0px -65%", threshold: 0 });
  $$("main .section").forEach((section) => observer.observe(section));
}

setToday();
applyTheme(state.theme);
state.activities = seedDemoActivity();
renderHeatmap(state.activities);
renderCompetitions();
appendCustomProjects();
setupSectionObserver();
setupMotion();
updateNotificationUI();
$("#githubHandle").textContent = state.username ? `@${state.username}` : "GitHub 연결하기";
$("#githubUsername").value = state.username;

$("#makePlan").addEventListener("click", () => {
  if (!state.competitions.some((item) => getDday(item.deadline) >= 0)) {
    setAddType("competition");
    openModal($("#addModal"));
    showToast("먼저 실제 공모전 정보를 등록해 주세요.");
    return;
  }
  const plan = $("#dailyPlan");
  plan.hidden = false;
  plan.scrollIntoView({ behavior: "smooth", block: "nearest" });
  showToast("가장 가까운 마감을 기준으로 오늘의 플랜을 만들었어요.");
});
$("#hidePlan").addEventListener("click", () => { $("#dailyPlan").hidden = true; });

$$('[data-plan]').forEach((input) => {
  const saved = readStorage("myDevSpace.plan", []);
  input.checked = saved.includes(input.dataset.plan);
  input.addEventListener("change", () => {
    const checked = $$('[data-plan]:checked').map((item) => item.dataset.plan);
    localStorage.setItem("myDevSpace.plan", JSON.stringify(checked));
    if (checked.length === 3) showToast("오늘의 플랜 완료! 작은 진전이 쌓였어요 ✦");
  });
});

$("#openSettings").addEventListener("click", () => openModal($("#settingsModal")));
$("#notificationButton").addEventListener("click", () => openModal($("#settingsModal")));
$("#enableNotifications").addEventListener("click", toggleNotifications);
$("#syncGithub").addEventListener("click", () => state.username ? fetchGithubActivity(state.username) : openModal($("#settingsModal")));
$("#quickAdd").addEventListener("click", () => { setAddType("project"); openModal($("#addModal")); });
$("#itemType").addEventListener("change", (event) => setAddType(event.target.value));
$$('[data-open-add]').forEach((button) => button.addEventListener("click", () => {
  setAddType(button.dataset.openAdd);
  openModal($("#addModal"));
}));
$$('[data-close-modal]').forEach((element) => element.addEventListener("click", () => closeModal(element.closest(".modal"))));
$$('.theme-swatch').forEach((button) => button.addEventListener("click", () => applyTheme(button.dataset.theme, true)));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") $$(".modal.is-open").forEach(closeModal);
});

$("#githubForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = $("#githubUsername").value.trim().replace(/^@/, "");
  if (!username) return;
  const success = await fetchGithubActivity(username);
  if (success) closeModal($("#settingsModal"));
});

$("#addForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const type = String(data.get("type"));
  const item = {
    id: makeId(),
    name: String(data.get("name")).trim(),
    description: String(data.get("description")).trim(),
  };
  if (type === "competition") {
    item.deadline = String(data.get("deadline"));
    item.progress = Math.min(100, Math.max(0, Number(data.get("progress")) || 0));
    state.competitions.push(item);
    renderCompetitions();
    checkDeadlineNotification();
  } else {
    state.projects.push(item);
    appendCustomProjects();
  }
  saveData();
  event.currentTarget.reset();
  setAddType("project");
  closeModal($("#addModal"));
  showToast(`“${item.name}”을(를) 저장했어요.`);
});

$("#competitionList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-competition]");
  if (!button) return;
  const id = button.closest(".competition-row").dataset.id;
  state.competitions = state.competitions.filter((item) => item.id !== id);
  saveData();
  renderCompetitions();
  showToast("공모전 일정을 삭제했어요.");
});

$("#projectGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-project]");
  if (!button) return;
  const id = button.closest(".project-card").dataset.id;
  state.projects = state.projects.filter((item) => item.id !== id);
  saveData();
  appendCustomProjects();
  showToast("프로젝트를 삭제했어요.");
});

if (state.username) setTimeout(() => fetchGithubActivity(state.username, false), 400);
if (state.notifications) setTimeout(checkDeadlineNotification, 800);
setInterval(checkDeadlineNotification, 60 * 60 * 1000);
