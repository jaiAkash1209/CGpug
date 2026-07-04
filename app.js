import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
import { calculateGpa, calculateWeightedPoint } from "./gpa.js";

const gradePoints = {
  O: 10,
  "A+": 9,
  A: 8,
  "B+": 7,
  B: 6,
  C: 5,
  P: 4,
  U: 0,
  F: 0,
  AB: 0,
};

const creditLookup = {
  U24EN101: 2,
  U24MA101: 4,
  U24PH103: 3,
  U24CY103: 3,
  U24TA101: 1,
  U24EE103: 3,
  U24CS101: 4,
  U24BS101: 2,
  U24TP110: 1,
  U24ED111: 0.5,
  U24EN201: 2,
  U24MA203: 4,
  U24PH203: 3,
  U24CY201: 2,
  U24TA201: 1,
  U24CS201: 4.5,
  U24CE203: 4,
  U24ME101: 2,
  U24TP210: 1,
  U24ED211: 0.5,
  U24MA303: 4,
  U24EC301: 4,
  U24EC302: 3,
  U24EC303: 4,
  U24EC304: 4,
  U24AD302: 4,
  U24TP310: 1,
  U24ED311: 0.5,
  U24RM312: 0.5,
  U24MC313: 0,
  U24MA402: 4,
  U24MA403: 4,
  U24EC401: 3,
  U24EC402: 3,
  U24EC403: 3,
  U24EC404: 4,
  U24EC405: 1.5,
  U24EC406: 1.5,
  U24EC408: 3,
  U24TP410: 1,
  U24ED411: 0.5,
  U24RM412: 0.5,
  U24MC413: 0,
};

const els = {
  addRow: document.querySelector("#addRow"),
  cgpaValue: document.querySelector("#cgpaValue"),
  chooseFile: document.querySelector("#chooseFile"),
  clearAll: document.querySelector("#clearAll"),
  cropImage: document.querySelector("#cropImage"),
  courseRows: document.querySelector("#courseRows"),
  dropZone: document.querySelector("#dropZone"),
  fileInput: document.querySelector("#fileInput"),
  parseText: document.querySelector("#parseText"),
  previewBody: document.querySelector("#previewBody"),
  rawText: document.querySelector("#rawText"),
  resetPreview: document.querySelector("#resetPreview"),
  rowTemplate: document.querySelector("#rowTemplate"),
  scanAgain: document.querySelector("#scanAgain"),
  statusText: document.querySelector("#statusText"),
};

let currentFile = null;
let currentImageUrl = null;
let currentImageCanvas = null;
let currentOriginalImage = null;
let cropMode = false;
let cropStart = null;
let cropCurrent = null;
let cropBox = null;
let cropLayer = null;

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

seedRows();

els.fileInput.addEventListener("change", (event) => handleFile(event.target.files?.[0]));
els.chooseFile.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    els.fileInput.click();
  }
});
els.addRow.addEventListener("click", () => addRow());
els.clearAll.addEventListener("click", clearAll);
els.cropImage.addEventListener("click", () => toggleCropMode());
els.parseText.addEventListener("click", () => parseAndRender(els.rawText.value));
els.resetPreview.addEventListener("click", () => restoreOriginalPreview());
els.scanAgain.addEventListener("click", () => currentFile && handleFile(currentFile));

["dragenter", "dragover"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
  });
});

els.dropZone.addEventListener("drop", (event) => handleFile(event.dataTransfer.files?.[0]));

async function handleFile(file) {
  if (!file) return;
  currentFile = file;
  setBusy(true, `Reading ${file.name}...`);
  els.rawText.value = "";

  try {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const { text, canvas } = await extractPdf(file);
      renderCanvasPreview(canvas);
      els.rawText.value = text;
      if (text.trim().length > 30) {
        parseAndRender(text);
      } else {
        const ocrText = await ocrCanvas(canvas);
        els.rawText.value = ocrText;
        parseAndRender(ocrText);
      }
    } else {
      const imageUrl = URL.createObjectURL(file);
      currentImageUrl = imageUrl;
      currentImageCanvas = null;
      currentOriginalImage = null;
      renderImagePreview(imageUrl);
      const text = await ocrImage(file);
      els.rawText.value = text;
      parseAndRender(text);
    }
  } catch (error) {
    console.error(error);
    els.statusText.textContent = "Could not scan this file. Paste the result text or add rows manually.";
  } finally {
    setBusy(false);
    // Auto-save after file is processed
    if (currentFile) {
      setTimeout(() => autoSaveSubmission(currentFile), 500);
    }
  }
}

async function extractPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";
  let previewCanvas = null;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";

    if (!previewCanvas) {
      const viewport = page.getViewport({ scale: 1.6 });
      previewCanvas = document.createElement("canvas");
      previewCanvas.width = viewport.width;
      previewCanvas.height = viewport.height;
      await page.render({ canvasContext: previewCanvas.getContext("2d"), viewport }).promise;
    }
  }

  return { text, canvas: previewCanvas };
}

async function ocrImage(file) {
  setBusy(true, "Scanning screenshot with OCR...");
  const result = await Tesseract.recognize(file, "eng", {
    logger: (message) => {
      if (message.status === "recognizing text") {
        els.statusText.textContent = `Scanning screenshot... ${Math.round(message.progress * 100)}%`;
      }
    },
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1",
  });
  return normalizeOcrText(result.data.text);
}

async function ocrCanvas(canvas) {
  setBusy(true, "Scanning PDF page image with OCR...");
  const result = await Tesseract.recognize(canvas, "eng", {
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1",
  });
  return normalizeOcrText(result.data.text);
}

function parseAndRender(text) {
  const rows = parseRows(text);
  els.courseRows.innerHTML = "";

  if (rows.length === 0) {
    addRow();
    els.statusText.textContent = "No full subject rows found. Add or paste rows manually, then enter credits and grades.";
  } else {
    rows.forEach(addRow);
    const arrears = rows.filter((row) => row.result === "RA" || row.grade === "U" || row.grade === "F" || row.grade === "AB").length;
    const missingCredits = rows.filter((row) => row.credits === "").length;
    els.statusText.textContent = `Found ${rows.length} subject row${rows.length === 1 ? "" : "s"}${arrears ? `, including ${arrears} arrear row${arrears === 1 ? "" : "s"}` : ""}${missingCredits ? `. Add credits for ${missingCredits} row${missingCredits === 1 ? "" : "s"}` : ""}. Review before using the GPA.`;
  }

  calculate();
  // Auto-save after parsing
  setTimeout(() => autoSaveSubmission(currentFile), 500);
}

function parseRows(text) {
  const normalizedText = normalizeOcrText(text);
  const cleaned = normalizedText
    .replace(/\r/g, "\n")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/([A-Z]\d{2}[A-Z]{2}\d{3})/g, "\n$1")
    .replace(/(U\d{2}[A-Z]{2}\d{3})/g, "\n$1")
    .replace(/\s*([A-Z]\d{2}[A-Z]{2}\d{3})/g, "\n$1")
    .replace(/\s*(U\d{2}[A-Z]{2}\d{3})/g, "\n$1");

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = [];
  for (const line of lines) {
    const codeMatch = line.match(/\b[A-Z]\d{2}[A-Z]{2}\d{3}\b|\bU\d{2}[A-Z]{2}\d{3}\b/i);
    if (!codeMatch) continue;

    const code = codeMatch[0].toUpperCase();
    const afterCode = line.slice(codeMatch.index + code.length).trim();
    const result = findResult(afterCode);
    const grade = findGrade(afterCode, result);
    const point = grade ? gradePoints[grade] : "";
    const credits = creditLookup[code] ?? findCredits(afterCode, grade);
    const title = findTitle(afterCode, grade, credits, result);

    rows.push({
      code,
      title,
      credits: credits ?? "",
      grade: grade ?? "",
      point: point ?? "",
      result,
    });
  }

  return mergeDuplicateRows(rows);
}

function findGrade(text, result) {
  const tokens = [...text.toUpperCase().matchAll(/(?:^|\s)(O|0|A\+|A|B\+|B|C|P|U|F|AB)(?=\s|$)/g)].map((match) => match[1]);
  if (!tokens.length) return "";
  const found = tokens.slice().reverse().find((token) => token === "0" || Object.hasOwn(gradePoints, token));
  if (found === "0" && result === "Pass") return "O";
  if (found === "0") return "";
  return found || "";
}

function findResult(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const match = cleaned.match(/(?:^|\s)(PASS|RA|FAIL|REAPPEAR|ARREAR)(?=\s|$)/i);
  if (!match) return "";
  const normalized = match[1].toUpperCase();
  if (normalized === "PASS") return "Pass";
  if (normalized === "ARREAR" || normalized === "REAPPEAR") return "RA";
  return normalized;
}

function findCredits(text, grade) {
  let working = text;
  if (grade) working = working.replace(new RegExp(`\\b${escapeRegex(grade)}\\b`, "i"), " ");
  const numbers = [...working.matchAll(/\b(\d+(?:\.\d+)?)\b/g)].map((match) => Number(match[1]));
  const possibleCredits = numbers.filter((number) => number >= 0 && number <= 6);
  if (possibleCredits.length === 0) return "";
  return possibleCredits[possibleCredits.length - 1];
}

function findTitle(text, grade, credits, result) {
  let title = text;
  if (grade) title = removeToken(title, grade);
  if (result) title = removeToken(title, result);
  if (credits !== "" && credits !== null && credits !== undefined) {
    title = title.replace(new RegExp(`\\b${escapeRegex(String(credits))}\\b(?!.*\\b${escapeRegex(String(credits))}\\b)`), " ");
  }
  title = title.replace(/\b(TH|PR|INT|EXT|TOTAL|RESULT|PASS|FAIL|GRADE|CREDIT|CREDITS|GP|POINTS?)\b/gi, " ");
  title = title.replace(/\b\d+(?:\.\d+)?\b/g, " ");
  return title.replace(/\s+/g, " ").trim();
}

function mergeDuplicateRows(rows) {
  const byCode = new Map();
  for (const row of rows) {
    const existing = byCode.get(row.code);
    if (!existing) {
      byCode.set(row.code, row);
      continue;
    }
    byCode.set(row.code, {
      code: row.code,
      title: existing.title || row.title,
      credits: existing.credits || row.credits,
      grade: existing.grade || row.grade,
      point: existing.point || row.point,
      result: existing.result || row.result,
    });
  }
  return [...byCode.values()];
}

function addRow(data = {}) {
  const node = els.rowTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".code").value = data.code || "";
  node.querySelector(".title").value = data.title || "";
  node.querySelector(".credits").value = data.credits ?? "";
  node.querySelector(".grade").value = data.grade || "";
  node.querySelector(".result").value = data.result || "";
  node.querySelector(".point").value = data.point ?? (data.grade ? gradePoints[data.grade] : "");

  node.addEventListener("input", handleRowInput);
  node.addEventListener("change", handleRowInput);
  node.querySelector(".remove").addEventListener("click", () => {
    node.remove();
    if (!els.courseRows.children.length) addRow();
    calculate();
  });

  els.courseRows.appendChild(node);
  calculate();
}

function handleRowInput(event) {
  const row = event.target.closest("tr");
  if (event.target.classList.contains("grade")) {
    const grade = event.target.value;
    row.querySelector(".point").value = grade ? gradePoints[grade] : "";
    if (["U", "F", "AB"].includes(grade)) row.querySelector(".result").value = "RA";
    if (grade && !["U", "F", "AB"].includes(grade) && !row.querySelector(".result").value) {
      row.querySelector(".result").value = "Pass";
    }
  }
  calculate();
}

function calculate() {
  const rowNodes = [...els.courseRows.querySelectorAll("tr")];
  const rows = rowNodes.map((row) => ({
    credits: row.querySelector(".credits").value,
    point: row.querySelector(".point").value,
    result: row.querySelector(".result").value,
  }));

  rowNodes.forEach((row) => {
    const credits = Number(row.querySelector(".credits").value);
    const point = Number(row.querySelector(".point").value);
    const result = row.querySelector(".result").value;
    const weighted = calculateWeightedPoint(credits, point);
    row.querySelector(".weighted").textContent = weighted.toFixed(2);
    row.dataset.status = result === "RA" || result === "Fail" || point === 0 ? "arrear" : "pass";
  });

  const gpa = calculateGpa(rows);
  if (els.cgpaValue) {
    els.cgpaValue.textContent = gpa.toFixed(2);
  }
}

async function autoSaveSubmission(fileToSave) {
  const rows = getRows();
  if (!rows.some((row) => row.code)) {
    return; // Skip if no data
  }

  const formData = new FormData();
  if (fileToSave) formData.append("resultFile", fileToSave);
  const gpaValue = els.cgpaValue?.textContent || "0.00";
  formData.append("payload", JSON.stringify({
    gpa: gpaValue,
    cgpa: gpaValue,
    rows,
    rawText: els.rawText.value,
    student: extractStudentInfo(els.rawText.value),
  }));

  try {
    const response = await fetch("/api/submissions", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error("Save failed");
  } catch (error) {
    console.error("Auto-save failed:", error);
    els.statusText.textContent = "Note: Saving needs the backend service. Calculation works offline.";
  }
}

function getRows() {
  return [...els.courseRows.querySelectorAll("tr")].map((row) => ({
    code: row.querySelector(".code").value.trim(),
    title: row.querySelector(".title").value.trim(),
    credits: row.querySelector(".credits").value,
    grade: row.querySelector(".grade").value,
    result: row.querySelector(".result").value,
    point: row.querySelector(".point").value,
    weighted: row.querySelector(".weighted").textContent,
  }));
}

function extractStudentInfo(text) {
  return {
    registrationNo: matchField(text, /Registration\s*No\s*:?\s*([A-Z0-9]+)/i),
    name: matchField(text, /Student\s*Name\s*:?\s*([^\n]+)/i),
    department: matchField(text, /Department\s*:?\s*([^\n]+)/i),
  };
}

function matchField(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1].trim() : "";
}

function seedRows() {
  addRow({ code: "", title: "", credits: "", grade: "", point: "" });
}

function clearAll() {
  currentFile = null;
  els.fileInput.value = "";
  els.rawText.value = "";
  els.courseRows.innerHTML = "";
  els.previewBody.innerHTML = "<p>No file selected yet.</p>";
  els.statusText.textContent = "Upload a result page, then review the extracted rows before calculating.";
  addRow();
}

function renderImagePreview(src) {
  els.previewBody.innerHTML = "";
  const img = document.createElement("img");
  img.alt = "Uploaded result preview";
  img.src = src;
  img.dataset.role = "preview-image";
  els.previewBody.appendChild(img);
  setupCropInteraction();
}

function renderCanvasPreview(canvas) {
  els.previewBody.innerHTML = "";
  if (canvas) {
    currentImageCanvas = canvas;
    canvas.dataset.role = "preview-canvas";
    els.previewBody.appendChild(canvas);
  }
  setupCropInteraction();
}

function setupCropInteraction() {
  const preview = els.previewBody.querySelector("img, canvas");
  if (!preview) return;

  preview.removeEventListener("mousedown", handleCropStart);
  preview.addEventListener("mousedown", handleCropStart);

  if (!cropLayer) {
    cropLayer = document.createElement("div");
    cropLayer.className = "preview-crop-layer";
    els.previewBody.appendChild(cropLayer);
  }

  if (!cropBox) {
    cropBox = document.createElement("div");
    cropBox.className = "preview-crop-box";
    cropLayer.appendChild(cropBox);
  }

  cropLayer.style.display = cropMode ? "block" : "none";
  cropBox.style.display = "none";
}

function toggleCropMode() {
  cropMode = !cropMode;
  els.previewBody.classList.toggle("crop-mode", cropMode);
  if (cropLayer) cropLayer.style.display = cropMode ? "block" : "none";
  if (cropBox) cropBox.style.display = "none";
  els.statusText.textContent = cropMode ? "Drag on the preview to select the part of the image for OCR." : "Crop mode disabled.";
}

function handleCropStart(event) {
  if (!cropMode) return;
  event.preventDefault();
  const rect = els.previewBody.getBoundingClientRect();
  cropStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  cropCurrent = { x: cropStart.x, y: cropStart.y };
  cropBox.style.left = `${cropStart.x}px`;
  cropBox.style.top = `${cropStart.y}px`;
  cropBox.style.width = "0px";
  cropBox.style.height = "0px";
  cropBox.style.display = "block";

  const onMove = (moveEvent) => {
    const currentX = moveEvent.clientX - rect.left;
    const currentY = moveEvent.clientY - rect.top;
    cropCurrent = { x: currentX, y: currentY };
    const x = Math.min(cropStart.x, currentX);
    const y = Math.min(cropStart.y, currentY);
    const width = Math.max(10, Math.abs(currentX - cropStart.x));
    const height = Math.max(10, Math.abs(currentY - cropStart.y));
    cropBox.style.left = `${x}px`;
    cropBox.style.top = `${y}px`;
    cropBox.style.width = `${width}px`;
    cropBox.style.height = `${height}px`;
  };

  const onUp = async () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    if (cropStart && cropCurrent) {
      await applyCropSelection();
    }
    cropBox.style.display = "none";
    cropMode = false;
    els.previewBody.classList.remove("crop-mode");
    if (cropLayer) cropLayer.style.display = "none";
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

async function applyCropSelection() {
  if (!currentImageUrl && !currentImageCanvas) return;
  const preview = els.previewBody.querySelector("img, canvas");
  if (!preview) return;

  try {
    els.statusText.textContent = "Processing crop selection...";
    setBusy(true, "Processing selected area...");

    const rect = els.previewBody.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const scaleX = preview.naturalWidth ? preview.naturalWidth / previewRect.width : 1;
    const scaleY = preview.naturalHeight ? preview.naturalHeight / previewRect.height : 1;
    let x = Math.max(0, Math.round((cropStart.x - (previewRect.left - rect.left)) * scaleX));
    let y = Math.max(0, Math.round((cropStart.y - (previewRect.top - rect.top)) * scaleY));
    let width = Math.max(1, Math.round((cropCurrent.x - cropStart.x) * scaleX));
    let height = Math.max(1, Math.round((cropCurrent.y - cropStart.y) * scaleY));

    const source = currentImageCanvas || await loadImageElement(currentImageUrl);
    const sourceWidth = source.naturalWidth || source.width;
    const sourceHeight = source.naturalHeight || source.height;

    if (!sourceWidth || !sourceHeight) {
      throw new Error("Invalid image dimensions");
    }

    const padding = Math.min(100, Math.round(Math.max(sourceWidth, sourceHeight) * 0.1));
    const sx = Math.max(0, Math.min(x, x + width) - padding);
    const sy = Math.max(0, Math.min(y, y + height) - padding);
    let sw = Math.min(sourceWidth - sx, Math.abs(width) + padding * 2);
    let sh = Math.min(sourceHeight - sy, Math.abs(height) + padding * 2);

    sw = Math.max(100, Math.min(sw, sourceWidth));
    sh = Math.max(100, Math.min(sh, sourceHeight));

    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = sw;
    croppedCanvas.height = sh;

    if (croppedCanvas.width <= 0 || croppedCanvas.height <= 0) {
      throw new Error("Crop area too small");
    }

    const context = croppedCanvas.getContext("2d");
    const sourceCanvas = source instanceof HTMLCanvasElement ? source : null;
    context.drawImage(sourceCanvas || source, sx, sy, sw, sh, 0, 0, sw, sh);

    currentOriginalImage = currentImageCanvas || await loadImageElement(currentImageUrl);
    renderCanvasPreview(croppedCanvas);
    els.statusText.textContent = "Scanning cropped area with OCR...";
    const ocrText = await ocrCanvas(croppedCanvas);
    els.rawText.value = ocrText;
    parseAndRender(ocrText);
    els.statusText.textContent = "Selected area used for OCR. Review the extracted rows and adjust if needed.";
  } catch (error) {
    console.error("Crop error:", error);
    els.statusText.textContent = "Crop failed: " + error.message + ". Try a larger selection.";
  } finally {
    setBusy(false);
  }
}

function restoreOriginalPreview() {
  if (!currentImageUrl) return;
  if (currentOriginalImage) {
    renderCanvasPreview(currentOriginalImage);
  } else {
    renderImagePreview(currentImageUrl);
  }
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function autoCropCanvas(source) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const sourceCanvas = source instanceof HTMLCanvasElement ? source : null;
  const width = sourceCanvas ? sourceCanvas.width : source.naturalWidth;
  const height = sourceCanvas ? sourceCanvas.height : source.naturalHeight;

  if (!width || !height) return null;

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(sourceCanvas || source, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      const isBackground = alpha < 180 && data[index] > 240 && data[index + 1] > 240 && data[index + 2] > 240;
      if (alpha > 20 && !isBackground) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (minX > maxX || minY > maxY) {
    return canvas;
  }

  const cropWidth = Math.max(1, maxX - minX + 1);
  const cropHeight = Math.max(1, maxY - minY + 1);
  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = cropWidth;
  croppedCanvas.height = cropHeight;
  const croppedContext = croppedCanvas.getContext("2d");
  croppedContext.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return croppedCanvas;
}

function setBusy(isBusy, message = "") {
  [els.scanAgain, els.parseText].forEach((button) => {
    button.disabled = isBusy;
  });
  els.chooseFile.setAttribute("aria-disabled", String(isBusy));
  if (message) els.statusText.textContent = message;
}

function normalizeOcrText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/([A-Z])\s+(?=[A-Z]\d{2}[A-Z]{2}\d{3})/g, "$1")
    .replace(/\b([A-Z])\s+(?=[A-Z]{2}\d{3})/g, "$1")
    .replace(/\b([A-Z]{2,})\s+(?=\d)/g, "$1 ")
    .trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeToken(text, token) {
  return text.replace(new RegExp(`(^|\\s)${escapeRegex(token)}(?=\\s|$)`, "i"), " ");
}
