/**
 * Google Apps Script for FlexSync Hub (v2.2)
 * 
 * Instructions:
 * 1. Open your Google Sheet.
 * 2. Click Extensions > Apps Script.
 * 3. Delete ALL existing code and paste this in.
 * 4. Click Save.
 * 5. Click Deploy > New Deployment.
 * 6. Select type "Web App", Description "FlexSync Hub v2.2".
 * 7. Access "Anyone".
 * 8. COPY the new Web App URL and paste it into the App settings.
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function doGet(e) {
  return ContentService.createTextOutput("FlexSync Hub is Online. Version 2.2\nStatus: Ready for data sync.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(10000); 
    const contents = e.postData.contents;
    const postData = JSON.parse(contents);
    const action = postData.action;
    const data = postData.data || {};
    
    let result = { success: false };

    if (action === "getAllSessions") {
      result = getAllSessions(ss);
    } else if (action === "logSession" || action === "logBooking" || action === "updateBooking") {
      result = logSession(ss, data.sessionData || data);
    } else if (action === "getWeights") {
      result = getWeights(ss, data);
    } else if (action === "logWeight") {
      result = logWeight(ss, data);
    } else if (action === "validate") {
      result = validateUser(ss, data);
    } else if (action === "ping") {
      result = { success: true, message: "pong" };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function validateUser(ss, data) {
  const code = String(data.code || "").toUpperCase().trim();
  if (!code) return { success: false, error: "Code required" };
  
  const expectedHeaders = ["code", "name", "role", "email"];
  let sheet = ss.getSheetByName("Users") || ss.insertSheet("Users");
  const indices = getHeaderIndices(sheet, expectedHeaders);
  
  const fullData = sheet.getDataRange().getValues();
  
  // Always allow the admin override
  if (code === "011426") {
    return { success: true, user: { name: "Root Admin", role: "admin", code: "011426" } };
  }

  if (fullData.length <= 1) {
    return { success: false, error: "User database is empty. Please add users to the 'Users' sheet." };
  }
  
  const rows = fullData.slice(1);
  const userRow = rows.find(row => String(row[indices["code"]] || "").toUpperCase().trim() === code);
  
  if (userRow) {
    return { 
      success: true, 
      user: { 
        name: userRow[indices["name"]] || "Athlete", 
        role: userRow[indices["role"]] || "user", 
        code: userRow[indices["code"]],
        email: userRow[indices["email"]] || ""
      }
    };
  }
  
  return { success: false, error: "Invalid code. Check the 'Users' sheet for correct codes." };
}

function getHeaderIndices(sheet, expectedHeaders) {
  const lastCol = sheet.getLastColumn();
  let headers = [];
  
  if (lastCol === 0) {
    sheet.appendRow(expectedHeaders);
    headers = expectedHeaders;
  } else {
    headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  }
  
  const lowerHeaders = headers.map(h => String(h || "").toLowerCase().replace(/\s+/g, ''));
  const indices = {};
  
  expectedHeaders.forEach(h => {
    let lowerExpected = String(h).toLowerCase().replace(/\s+/g, '');
    let idx = lowerHeaders.indexOf(lowerExpected);
    if (idx === -1) {
      idx = headers.length;
      sheet.getRange(1, idx + 1).setValue(h);
      headers.push(h);
      lowerHeaders.push(lowerExpected);
    }
    indices[h] = idx;
  });
  return indices;
}

function getAllSessions(ss) {
  const expectedHeaders = ["id", "title", "description", "location", "bodyParts", "capacity", "color", "startTime", "endTime", "creatorId", "creatorName", "creatorPhoto", "participants", "participantNames", "participantFocus", "comments", "createdAt", "updatedAt"];
  let sheet = ss.getSheetByName("Sessions") || ss.insertSheet("Sessions");
  const indices = getHeaderIndices(sheet, expectedHeaders);
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, data: [] };
  
  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const sessions = rows
    .filter(row => row[indices["id"]] || row[indices["title"]] || row[indices["startTime"]]) // Skip empty rows
    .map(row => {
    const obj = {};
    for (const [key, idx] of Object.entries(indices)) {
      let val = row[idx];
      // Format dates to ISO
      if (val instanceof Date) val = val.toISOString();
      obj[key] = val;
    }
    return obj;
  });
  
  return { success: true, data: sessions };
}

function logSession(ss, data) {
  const expectedHeaders = ["id", "title", "description", "location", "bodyParts", "capacity", "color", "startTime", "endTime", "creatorId", "creatorName", "creatorPhoto", "participants", "participantNames", "participantFocus", "comments", "createdAt", "updatedAt"];
  let sheet = ss.getSheetByName("Sessions") || ss.insertSheet("Sessions");
  const indices = getHeaderIndices(sheet, expectedHeaders);
  
  const id = String(data.id || "gas_" + Date.now());
  const fullData = sheet.getDataRange().getValues();
  const idIdx = indices["id"];
  const rowIndex = fullData.findIndex(row => String(row[idIdx] || "") === id);
  
  const rowData = new Array(sheet.getLastColumn()).fill("");
  for (const [key, idx] of Object.entries(indices)) {
    let val = data[key];
    if (val === undefined || val === null) val = "";
    if (["startTime", "endTime", "createdAt", "updatedAt"].includes(key) && val) {
      rowData[idx] = new Date(val);
    } else if (typeof val === 'object') {
      rowData[idx] = JSON.stringify(val);
    } else {
      rowData[idx] = val;
    }
  }
  rowData[idIdx] = id;

  if (rowIndex > -1) {
    sheet.getRange(rowIndex + 1, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
  
  return { success: true, id: id };
}

function getWeights(ss, data) {
  const expectedHeaders = ["id", "userId", "weight", "unit", "date", "note", "userName", "email"];
  let sheet = ss.getSheetByName("Weights") || ss.insertSheet("Weights");
  const indices = getHeaderIndices(sheet, expectedHeaders);
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, data: [] };
  
  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const searchIds = (data.searchIds || [data.userId]).map(id => String(id || "").toLowerCase());
  
  const results = rows.filter(row => {
    const rUid = String(row[indices["userId"]] || "").toLowerCase();
    const rEmail = String(row[indices["email"]] || "").toLowerCase();
    const rName = String(row[indices["userName"]] || "").toLowerCase();
    const rId = String(row[indices["id"]] || "").toLowerCase();
    return searchIds.some(id => id && (rUid === id || rEmail === id || rName === id || rId === id));
  }).map(row => {
    const obj = {};
    for (const [key, idx] of Object.entries(indices)) {
      let val = row[idx];
      if (val instanceof Date) val = val.toISOString();
      obj[key] = val;
    }
    return obj;
  });
  
  return { success: true, data: results };
}

function logWeight(ss, data) {
  const expectedHeaders = ["id", "userId", "weight", "unit", "date", "note", "userName", "email"];
  let sheet = ss.getSheetByName("Weights") || ss.insertSheet("Weights");
  const indices = getHeaderIndices(sheet, expectedHeaders);
  
  const id = String(data.id || "gas_w_" + Date.now());
  const rowData = new Array(sheet.getLastColumn()).fill("");
  
  for (const [key, idx] of Object.entries(indices)) {
    if (key === "id") rowData[idx] = id;
    else if (key === "weight") rowData[idx] = Number(data.weight || data.value || 0);
    else if (key === "date") rowData[idx] = new Date(data.date || new Date());
    else rowData[idx] = data[key] || "";
  }
  
  sheet.appendRow(rowData);
  return { success: true, id: id };
}
