const recordsList = document.querySelector("#recordsList");
const adminStatus = document.querySelector("#adminStatus");
const refreshRecords = document.querySelector("#refreshRecords");

refreshRecords.addEventListener("click", loadRecords);
loadRecords();

async function loadRecords() {
  adminStatus.textContent = "Loading saved records...";
  recordsList.innerHTML = "";

  try {
    const response = await fetch("/api/submissions");
    if (!response.ok) throw new Error("Records API unavailable");
    const records = await response.json();
    renderRecords(records);
  } catch (error) {
    console.error(error);
    adminStatus.textContent = "No backend found. Deploy as a Render Web Service to store and view uploads.";
  }
}

function renderRecords(records) {
  if (!records.length) {
    adminStatus.textContent = "No saved submissions yet.";
    return;
  }

  // Sort by GPA descending (highest first)
  const sortedRecords = [...records].sort((a, b) => {
    const gpaA = parseFloat(a.cgpa || 0);
    const gpaB = parseFloat(b.cgpa || 0);
    return gpaB - gpaA;
  });

  // Group by registration number
  const groupedByStudent = new Map();
  for (const record of sortedRecords) {
    const regNo = record.student?.registrationNo || "Unknown";
    if (!groupedByStudent.has(regNo)) {
      groupedByStudent.set(regNo, []);
    }
    groupedByStudent.get(regNo).push(record);
  }

  adminStatus.textContent = `${records.length} saved submission${records.length === 1 ? "" : "s"} from ${groupedByStudent.size} student${groupedByStudent.size === 1 ? "" : "s"}.`;

  // Create cards for each student group
  const cards = Array.from(groupedByStudent.values()).map((studentRecords) =>
    createStudentGroup(studentRecords)
  );
  recordsList.append(...cards);
}

function createStudentGroup(studentRecords) {
  const container = document.createElement("section");
  container.className = "student-group";

  const firstRecord = studentRecords[0];
  const student = firstRecord.student || {};
  const highestGpa = Math.max(...studentRecords.map(r => parseFloat(r.cgpa || 0)));

  // Student header (shown once)
  const header = document.createElement("div");
  header.className = "student-header";
  header.innerHTML = `
    <div>
      <strong>${escapeHtml(student.name || "Unknown student")}</strong>
      <span>${escapeHtml(student.registrationNo || "No registration number")}</span>
      <span>${escapeHtml(student.department || "Department not detected")}</span>
    </div>
    <div class="student-best-gpa">Best GPA: ${highestGpa.toFixed(2)}</div>
  `;
  container.appendChild(header);

  // All submissions for this student
  const submissionsContainer = document.createElement("div");
  submissionsContainer.className = "student-submissions";

  studentRecords.forEach((record) => {
    const card = createRecordCard(record, false); // false = don't show student name in card
    submissionsContainer.appendChild(card);
  });

  container.appendChild(submissionsContainer);
  return container;
}

function createRecordCard(record, showStudentInfo = true) {
  const card = document.createElement("article");
  card.className = "record-card";

  const arrears = (record.rows || []).filter((row) => row.result === "RA" || row.grade === "U" || row.grade === "F" || row.grade === "AB");
  const student = record.student || {};

  let headHtml = `
    <div class="record-score">GPA ${escapeHtml(record.cgpa || "0.00")}</div>
  `;

  if (showStudentInfo) {
    headHtml = `
      <div>
        <strong>${escapeHtml(student.name || "Unknown student")}</strong>
        <span>${escapeHtml(student.registrationNo || "No registration number")}</span>
      </div>
      <div class="record-score">GPA ${escapeHtml(record.cgpa || "0.00")}</div>
    `;
  }

  card.innerHTML = `
    <div class="record-head">
      ${headHtml}
    </div>
    <div class="record-meta">
      <span>${new Date(record.createdAt).toLocaleString()}</span>
      <span>${arrears.length} RA</span>
      ${record.file ? `<a href="${record.file.url}" target="_blank" rel="noreferrer">Open uploaded file</a>` : "<span>No file saved</span>"}
    </div>
    <div class="table-wrap">
      <table class="mini-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Subject</th>
            <th>Credits</th>
            <th>Grade</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          ${(record.rows || []).map((row) => `
            <tr data-status="${row.result === "RA" || row.grade === "U" ? "arrear" : "pass"}">
              <td>${escapeHtml(row.code)}</td>
              <td>${escapeHtml(row.title)}</td>
              <td>${escapeHtml(row.credits)}</td>
              <td>${escapeHtml(row.grade)}</td>
              <td>${escapeHtml(row.result)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  return card;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
