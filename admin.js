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

  adminStatus.textContent = `${records.length} saved submission${records.length === 1 ? "" : "s"}.`;
  recordsList.append(...records.map(createRecordCard));
}

function createRecordCard(record) {
  const card = document.createElement("article");
  card.className = "record-card";

  const arrears = (record.rows || []).filter((row) => row.result === "RA" || row.grade === "U" || row.grade === "F" || row.grade === "AB");
  const student = record.student || {};

  card.innerHTML = `
    <div class="record-head">
      <div>
        <strong>${escapeHtml(student.name || "Unknown student")}</strong>
        <span>${escapeHtml(student.registrationNo || "No registration number")}</span>
      </div>
      <div class="record-score">GPA ${escapeHtml(record.cgpa || "0.00")}</div>
    </div>
    <div class="record-meta">
      <span>${new Date(record.createdAt).toLocaleString()}</span>
      <span>${escapeHtml(student.department || "Department not detected")}</span>
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
