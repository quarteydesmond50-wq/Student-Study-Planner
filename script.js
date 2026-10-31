const STORAGE_KEY = "studentStudyPlannerTasks";
const LECTURES_STORAGE_KEY = "studentStudyPlannerLectures";
const tasks = [];
const lectures = [];

const $ = (selector) => document.querySelector(selector);
const taskList = $("#task-list");
const form = $("#task-form");
const titleInput = $("#task-title");
const subjectInput = $("#task-subject");
const priorityInput = $("#task-priority");
const modal = $("#task-modal");
const toast = $("#toast");
const lectureForm = $("#lecture-form");
const lectureModal = $("#lecture-modal");
const lectureTitleInput = $("#lecture-title");
const lectureCourseInput = $("#lecture-course");
const lectureDateInput = $("#lecture-date");
let lastFocusedElement = null;
let currentView = "tasks";
let studyRemainingSeconds = 25 * 60;
let studyTimerInterval = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) throw new TypeError("Saved tasks must be a list.");

    return saved.filter((task) =>
      task &&
      typeof task.id === "string" &&
      typeof task.title === "string" &&
      typeof task.subject === "string" &&
      typeof task.completed === "boolean"
    ).map((task) => ({
      ...task,
      priority: ["High", "Medium", "Low"].includes(task.priority) ? task.priority : "Medium"
    }));
  } catch (error) {
    console.error("Could not load saved study tasks:", error);
    showToast("Saved tasks could not be loaded. You can still add tasks in this session.");
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return true;
  } catch (error) {
    console.error("Could not save study tasks:", error);
    showToast("Your change could not be saved in this browser.");
    return false;
  }
}

function loadLectures() {
  try {
    const saved = JSON.parse(localStorage.getItem(LECTURES_STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) throw new TypeError("Saved lectures must be a list.");

    return saved.filter((lecture) =>
      lecture &&
      typeof lecture.id === "string" &&
      typeof lecture.title === "string" &&
      typeof lecture.course === "string" &&
      (typeof lecture.date === "string" || lecture.date === "")
    );
  } catch (error) {
    console.error("Could not load saved lectures:", error);
    showToast("Saved lectures could not be loaded. You can still add lectures in this session.");
    return [];
  }
}

function saveLectures() {
  try {
    localStorage.setItem(LECTURES_STORAGE_KEY, JSON.stringify(lectures));
    return true;
  } catch (error) {
    console.error("Could not save lectures:", error);
    showToast("Your lecture could not be saved in this browser.");
    return false;
  }
}

function createId() {
  return window.crypto && typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatLectureDate(date) {
  if (!date) return "Date not set";
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function renderLectures() {
  const sortedLectures = [...lectures].sort((first, second) =>
    (first.date || "9999-12-31").localeCompare(second.date || "9999-12-31") ||
    first.title.localeCompare(second.title)
  );
  $("#lecture-list").innerHTML = sortedLectures.length
    ? sortedLectures.map((lecture) => `
      <li class="lecture-item">
        <span class="lecture-icon" aria-hidden="true">▤</span>
        <span class="lecture-copy">
          <strong>${escapeHtml(lecture.title)}</strong>
          <span>${escapeHtml(lecture.course)} · ${escapeHtml(formatLectureDate(lecture.date))}</span>
        </span>
        <button class="delete-button lecture-delete" type="button" data-lecture-action="delete" data-lecture-id="${escapeHtml(lecture.id)}" aria-label="Delete lecture ${escapeHtml(lecture.title)}" title="Delete lecture">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2m3 0-.7 10H5.7L5 6m3 3v4m4-4v4"/></svg>
        </button>
      </li>
    `).join("")
    : '<li class="study-empty-message">No lectures added yet. Add a lecture to keep your study topics organized.</li>';
}

function renderTask(task) {
  const isCompleted = task.completed;
  return `
    <li class="task-item ${isCompleted ? "completed" : ""}">
      <button
        class="task-toggle"
        type="button"
        data-action="toggle"
        data-task-id="${escapeHtml(task.id)}"
        aria-pressed="${isCompleted}"
        aria-label="${isCompleted ? "Mark incomplete" : "Mark complete"}: ${escapeHtml(task.title)}"
        title="${isCompleted ? "Mark incomplete" : "Mark complete"}"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3.2 3.2L13 4.5"/></svg>
      </button>
      <div class="task-copy">
        <span class="task-title">${escapeHtml(task.title)}</span>
        <span class="task-subject">${escapeHtml(task.subject)}</span>
      </div>
      <span class="priority-tag ${task.priority.toLowerCase()}">${escapeHtml(task.priority)}</span>
      <div class="task-actions">
        <button class="complete-button ${isCompleted ? "undo" : ""}" type="button" data-action="toggle" data-task-id="${escapeHtml(task.id)}">
          ${isCompleted ? "Mark Incomplete" : "Mark Complete"}
        </button>
        <button class="delete-button" type="button" data-action="delete" data-task-id="${escapeHtml(task.id)}" aria-label="Delete ${escapeHtml(task.title)}" title="Delete task">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2m3 0-.7 10H5.7L5 6m3 3v4m4-4v4"/></svg>
        </button>
      </div>
    </li>
  `;
}

function render() {
  const isEmpty = tasks.length === 0;
  $("#empty-state").hidden = !isEmpty;
  taskList.innerHTML = tasks.map(renderTask).join("");
  $("#result-count").textContent = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;
  $("#task-view").hidden = currentView !== "tasks";
  $("#study-dashboard-view").hidden = currentView !== "study-dashboard";
  $("#insights-view").hidden = currentView !== "insights";
  document.querySelectorAll(".nav-link[data-view]").forEach((button) => {
    const active = button.dataset.view === currentView;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  // keep bottom-nav in sync
  document.querySelectorAll(".bottom-nav-item[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === currentView);
  });
  renderStudyDashboard();
  renderInsights();
  renderLectures();
}

function getCourseGroups() {
  const groups = new Map();
  tasks.forEach((task) => {
    if (!groups.has(task.subject)) groups.set(task.subject, []);
    groups.get(task.subject).push(task);
  });
  return [...groups.entries()].sort(([first], [second]) => first.localeCompare(second));
}

function renderStudyDashboard() {
  const openTasks = tasks.filter((task) => !task.completed);
  const priorityOrder = { High: 0, Medium: 1, Low: 2 };
  const priorityTasks = [...openTasks].sort((first, second) =>
    priorityOrder[first.priority] - priorityOrder[second.priority] ||
    first.title.localeCompare(second.title)
  ).slice(0, 3);

  $("#recommendation-copy").textContent = openTasks.length
    ? `Generate a suggestion based on your ${openTasks.length} open ${openTasks.length === 1 ? "task" : "tasks"}, starting with the highest priority.`
    : tasks.length
      ? "Everything is complete. Add another task whenever you are ready for your next study goal."
      : "Get a focused suggestion based on your current tasks and priorities.";

  $("#priority-task-list").innerHTML = priorityTasks.length
    ? priorityTasks.map((task) => `
      <li class="priority-task-item">
        <button class="priority-toggle" type="button" data-action="toggle" data-task-id="${escapeHtml(task.id)}" aria-pressed="false" aria-label="Mark complete: ${escapeHtml(task.title)}">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3.2 3.2L13 4.5"/></svg>
        </button>
        <span class="priority-task-copy">
          <span class="priority-task-title">${escapeHtml(task.title)}</span>
          <span class="priority-task-subject">${escapeHtml(task.subject)}</span>
        </span>
        <span class="priority-task-meta"><span class="priority-tag ${task.priority.toLowerCase()}">${escapeHtml(task.priority)}</span></span>
      </li>
    `).join("")
    : '<li class="study-empty-message">No open tasks. Add a task to build your study plan.</li>';

  const courseGroups = getCourseGroups();
  $("#course-grid").innerHTML = courseGroups.length
    ? courseGroups.map(([subject, courseTasks]) => {
      const completed = courseTasks.filter((task) => task.completed).length;
      const percentage = Math.round((completed / courseTasks.length) * 100);
      return `
        <article class="course-card">
          <div class="course-card-header"><h3>${escapeHtml(subject)}</h3><span class="course-card-percent">${percentage}%</span></div>
          <p>${completed} of ${courseTasks.length} ${courseTasks.length === 1 ? "task" : "tasks"} complete</p>
          <div class="course-progress-track" role="progressbar" aria-label="${escapeHtml(subject)} task completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}"><span style="width: ${percentage}%"></span></div>
        </article>
      `;
    }).join("")
    : '<p class="study-empty-message">Your courses will appear here when you add tasks with a subject.</p>';

  const sessionCourse = $("#session-course");
  const selectedCourse = sessionCourse.value;
  const sessionCourses = [...new Set([
    ...courseGroups.map(([subject]) => subject),
    ...lectures.map((lecture) => lecture.course)
  ])].sort((first, second) => first.localeCompare(second));
  sessionCourse.innerHTML = '<option value="">Select a course</option>' +
    sessionCourses.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join("");
  sessionCourse.value = sessionCourses.includes(selectedCourse) ? selectedCourse : "";
  sessionCourse.disabled = Boolean(studyTimerInterval);
  $("#session-duration").disabled = Boolean(studyTimerInterval);
  $("#toggle-session").disabled = !sessionCourse.value;
  if (studyTimerInterval) {
    $("#toggle-session").innerHTML = '<span aria-hidden="true">Ⅱ</span> Pause';
  } else if (studyRemainingSeconds < Number($("#session-duration").value) * 60) {
    $("#toggle-session").innerHTML = '<span aria-hidden="true">▶</span> Resume';
  } else {
    $("#toggle-session").innerHTML = '<span aria-hidden="true">▶</span> Start';
  }

  const completedCount = tasks.filter((task) => task.completed).length;
  const completionRate = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  $("#dashboard-completed-count").textContent = `${completedCount}/${tasks.length}`;
  $("#dashboard-progress-fill").style.width = `${completionRate}%`;
  $(".progress-panel .course-progress-track").setAttribute("aria-valuenow", String(completionRate));
  $("#dashboard-progress-caption").textContent = tasks.length
    ? `${completionRate}% of your study tasks are complete.`
    : "Add a task to start tracking your progress.";
}

function renderInsights() {
  const completedCount = tasks.filter((task) => task.completed).length;
  const completionRate = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const ring = $("#insight-completion-ring");
  ring.style.setProperty("--insight-percent", `${completionRate}%`);
  ring.setAttribute("aria-label", `${completionRate}% of tasks completed`);
  $("#insight-completion-percent").textContent = `${completionRate}%`;
  $("#insight-completion-detail").textContent = `${completedCount} of ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} completed`;

  const courseProgress = getCourseGroups().map(([subject, courseTasks]) => ({
    subject,
    percentage: Math.round((courseTasks.filter((task) => task.completed).length / courseTasks.length) * 100)
  })).sort((first, second) => second.percentage - first.percentage || first.subject.localeCompare(second.subject));
  $("#insight-course-count").textContent = courseProgress.length;
  $("#insight-course-list").innerHTML = courseProgress.length
    ? courseProgress.slice(0, 3).map(({ subject, percentage }) => `
      <div class="insight-course-row">
        <span class="insight-course-name">${escapeHtml(subject)}</span>
        <span class="insight-course-value">${percentage}%</span>
        <span class="insight-bar" role="progressbar" aria-label="${escapeHtml(subject)} completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}"><span style="width: ${percentage}%"></span></span>
      </div>
    `).join("")
    : '<p class="insight-empty">Add tasks with a course name to see course progress.</p>';

  const openTasks = tasks.filter((task) => !task.completed);
  const priorityCounts = ["High", "Medium", "Low"].map((priority) => ({
    priority,
    count: openTasks.filter((task) => task.priority === priority).length
  }));
  const largestCount = Math.max(1, ...priorityCounts.map(({ count }) => count));
  $("#insight-open-count").textContent = openTasks.length;
  $("#insight-priority-breakdown").innerHTML = priorityCounts.map(({ priority, count }) => `
    <div class="priority-row">
      <span class="priority-row-label">${priority} priority</span>
      <span class="insight-bar" role="img" aria-label="${count} ${priority.toLowerCase()} priority ${count === 1 ? "task" : "tasks"}"><span style="width: ${Math.round((count / largestCount) * 100)}%"></span></span>
      <span class="priority-row-count">${count}</span>
    </div>
  `).join("");
}

function updateStudyTimer() {
  const minutes = Math.floor(studyRemainingSeconds / 60);
  const seconds = studyRemainingSeconds % 60;
  $("#study-timer").textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const fullDuration = Number($("#session-duration").value) * 60;
  const progress = fullDuration ? Math.round(((fullDuration - studyRemainingSeconds) / fullDuration) * 100) : 0;
  $("#session-progress-fill").style.width = `${progress}%`;
  $(".session-progress").setAttribute("aria-valuenow", String(progress));
}

function resetStudySession() {
  clearInterval(studyTimerInterval);
  studyTimerInterval = null;
  studyRemainingSeconds = Number($("#session-duration").value) * 60;
  $("#session-course").disabled = false;
  $("#session-duration").disabled = false;
  $("#toggle-session").innerHTML = '<span aria-hidden="true">▶</span> Start';
  $("#toggle-session").disabled = !$("#session-course").value;
  $("#session-status").textContent = $("#session-course").value ? "Ready when you are." : "Select a course to begin.";
  updateStudyTimer();
}

function toggleStudySession() {
  if (studyTimerInterval) {
    clearInterval(studyTimerInterval);
    studyTimerInterval = null;
    $("#session-course").disabled = false;
    $("#session-duration").disabled = false;
    $("#toggle-session").innerHTML = '<span aria-hidden="true">▶</span> Resume';
    $("#session-status").textContent = "Session paused.";
    return;
  }
  if (!$("#session-course").value) {
    showToast("Choose a course before starting a study session.");
    return;
  }
  if (studyRemainingSeconds === 0) {
    studyRemainingSeconds = Number($("#session-duration").value) * 60;
    updateStudyTimer();
  }

  $("#session-course").disabled = true;
  $("#session-duration").disabled = true;
  $("#toggle-session").innerHTML = '<span aria-hidden="true">Ⅱ</span> Pause';
  $("#session-status").textContent = `Studying ${$("#session-course").value}`;
  studyTimerInterval = setInterval(() => {
    studyRemainingSeconds -= 1;
    updateStudyTimer();
    if (studyRemainingSeconds <= 0) {
      clearInterval(studyTimerInterval);
      studyTimerInterval = null;
      $("#session-course").disabled = false;
      $("#session-duration").disabled = false;
      $("#toggle-session").innerHTML = '<span aria-hidden="true">▶</span> Start';
      $("#toggle-session").disabled = !$("#session-course").value;
      $("#session-status").textContent = "Session complete. Nice work!";
      showToast("Study session complete. Great work!");
    }
  }, 1000);
}

function openModal() {
  lastFocusedElement = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  titleInput.focus();
}

function closeModal() {
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  form.reset();
  priorityInput.value = "Medium";
  if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
}

function openLectureModal() {
  lastFocusedElement = document.activeElement;
  lectureModal.hidden = false;
  document.body.classList.add("modal-open");
  lectureTitleInput.focus();
}

function closeLectureModal() {
  lectureModal.hidden = true;
  document.body.classList.remove("modal-open");
  lectureForm.reset();
  if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
}

function setSidebarOpen(isOpen) {
  document.body.classList.toggle("sidebar-open", isOpen);
  $("#menu-toggle").setAttribute("aria-expanded", String(isOpen));
  $("#menu-toggle").setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  const subject = subjectInput.value.trim();

  if (!title) {
    showToast("Please enter a task title.");
    titleInput.focus();
    return;
  }
  if (!subject) {
    showToast("Please enter a subject or course.");
    subjectInput.focus();
    return;
  }

  const taskId = window.crypto && typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  tasks.unshift({
    id: taskId,
    title,
    subject,
    priority: priorityInput.value,
    completed: false
  });
  const saved = saveTasks();
  closeModal();
  render();
  if (saved) showToast("Task added.");
});

lectureForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = lectureTitleInput.value.trim();
  const course = lectureCourseInput.value.trim();
  const date = lectureDateInput.value;

  if (!title) {
    showToast("Please enter a lecture title.");
    lectureTitleInput.focus();
    return;
  }
  if (!course) {
    showToast("Please enter a subject or course for the lecture.");
    lectureCourseInput.focus();
    return;
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    showToast("Please enter a valid lecture date.");
    lectureDateInput.focus();
    return;
  }

  lectures.push({ id: createId(), title, course, date });
  const saved = saveLectures();
  closeLectureModal();
  render();
  if (saved) showToast("Lecture added.");
});

document.querySelectorAll("[data-open-modal]").forEach((button) => button.addEventListener("click", openModal));
$("#open-lecture-modal").addEventListener("click", openLectureModal);
document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    currentView = button.dataset.view;
    setSidebarOpen(false);
    render();
    // scroll to top on view change (mobile)
    window.scrollTo({ top: 0, behavior: "instant" });
  });
});
$("#close-modal").addEventListener("click", closeModal);
$("#cancel-modal").addEventListener("click", closeModal);
$("#close-lecture-modal").addEventListener("click", closeLectureModal);
$("#cancel-lecture-modal").addEventListener("click", closeLectureModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
lectureModal.addEventListener("click", (event) => {
  if (event.target === lectureModal) closeLectureModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!modal.hidden) closeModal();
    if (!lectureModal.hidden) closeLectureModal();
    setSidebarOpen(false);
  }
});

taskList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const taskIndex = tasks.findIndex((task) => task.id === button.dataset.taskId);
  if (taskIndex === -1) return;

  if (button.dataset.action === "delete") {
    tasks.splice(taskIndex, 1);
    const saved = saveTasks();
    render();
    if (saved) showToast("Task deleted.");
    return;
  }

  tasks[taskIndex].completed = !tasks[taskIndex].completed;
  saveTasks();
  render();
});

$("#priority-task-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='toggle']");
  if (!button) return;
  const task = tasks.find((item) => item.id === button.dataset.taskId);
  if (!task) return;
  task.completed = !task.completed;
  saveTasks();
  render();
});

$("#lecture-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-lecture-action='delete']");
  if (!button) return;
  const lectureIndex = lectures.findIndex((lecture) => lecture.id === button.dataset.lectureId);
  if (lectureIndex === -1) return;
  lectures.splice(lectureIndex, 1);
  const saved = saveLectures();
  render();
  if (saved) showToast("Lecture deleted.");
});

$("#generate-recommendations").addEventListener("click", () => {
  const openTasks = tasks.filter((task) => !task.completed);
  if (!openTasks.length) {
    $("#recommendation-copy").textContent = tasks.length
      ? "Everything is complete. Add another task whenever you are ready for your next study goal."
      : "Add a task first, then your suggestion will be based on its priority.";
    return;
  }
  const priorityOrder = { High: 0, Medium: 1, Low: 2 };
  openTasks.sort((first, second) =>
    priorityOrder[first.priority] - priorityOrder[second.priority] ||
    first.title.localeCompare(second.title)
  );
  const nextTask = openTasks[0];
  $("#recommendation-copy").textContent = `Start with "${nextTask.title}" for ${nextTask.subject}. It is your highest-priority open task.`;
});

$("#session-course").addEventListener("change", () => {
  $("#toggle-session").disabled = !$("#session-course").value;
  $("#session-status").textContent = $("#session-course").value ? "Ready when you are." : "Select a course to begin.";
});
$("#session-duration").addEventListener("change", resetStudySession);
$("#toggle-session").addEventListener("click", toggleStudySession);
$("#reset-session").addEventListener("click", resetStudySession);

$("#menu-toggle").addEventListener("click", () => {
  setSidebarOpen(!document.body.classList.contains("sidebar-open"));
});
$("#sidebar-scrim").addEventListener("click", () => setSidebarOpen(false));
$("#today-date").textContent = new Date().toLocaleDateString(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric"
});

tasks.push(...loadTasks());
lectures.push(...loadLectures());
render();
