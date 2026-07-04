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
    const gpaA = parseFloat(a.cgpa ?? a.gpa ?? 0);
    const gpaB = parseFloat(b.cgpa ?? b.gpa ?? 0);
    return gpaB - gpaA;
  });

  // Keep only the best record per student name
  const bestByName = new Map();
  for (const record of sortedRecords) {
    const studentName = record.student?.name || "Unknown";
    if (!bestByName.has(studentName)) {
      bestByName.set(studentName, record);
    }
  }

  const uniqueRecords = Array.from(bestByName.values());
  adminStatus.textContent = `${uniqueRecords.length} student${uniqueRecords.size === 1 ? "" : "s"} with ${records.length} total submission${records.length === 1 ? "" : "s"}.`;

  // Create cards for each unique student (best record only)
  const cards = uniqueRecords.map((record) =>
    createRecordCard(record, true)
  );
  recordsList.append(...cards);
}


function createRecordCard(record, showStudentInfo = true) {
  const card = document.createElement("article");
  card.className = "record-card";

  const arrears = (record.rows || []).filter((row) => row.result === "RA" || row.grade === "U" || row.grade === "F" || row.grade === "AB");
  const student = record.student || {};

  const displayGpa = record.cgpa ?? record.gpa ?? "0.00";

  let headHtml = `
    <div class="record-score">GPA ${escapeHtml(displayGpa)}</div>
  `;

  if (showStudentInfo) {
    headHtml = `
      <div>
        <strong>${escapeHtml(student.name || "Unknown student")}</strong>
        <span>${escapeHtml(student.registrationNo || "No registration number")}</span>
      </div>
      <div class="record-score">GPA ${escapeHtml(displayGpa)}</div>
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
