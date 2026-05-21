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
    } else if (action === "getChat") {
      result = getChats(ss, data);
    } else if (action === "createChatRoom") {
      result = createChatRoom(ss, data);
    } else if (action === "logChat") {
      result = logChatMessage(ss, data);
    } else if (action === "validate") {
      result = validateUser(ss, data);
    } else if (action === "getUsers") {
      result = getUsers(ss, data);
    } else if (action === "createUser") {
      result = createUser(ss, data);
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
  
  // Always allow the admin override
  if (code === "011426") {
    return { success: true, user: { name: "Root Admin", role: "admin", code: "011426" } };
  }

  const expectedHeaders = ["code", "name", "role", "email"];
  let sheet = ss.getSheetByName("Users") || ss.insertSheet("Users");
  const indices = getHeaderIndices(sheet, expectedHeaders);
  
  const fullData = sheet.getDataRange().getValues();
  
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

function getUsers(ss, data) {
  let sheet = ss.getSheetByName("Users") || ss.insertSheet("Users");
  const indices = getHeaderIndices(sheet, ["code", "name", "role", "email"]);
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, data: [] };
  
  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const users = rows.map(row => ({
    code: row[indices["code"]] || "",
    name: row[indices["name"]] || "",
    role: row[indices["role"]] || "user",
    email: row[indices["email"]] || ""
  })).filter(u => u.name);
  
  return { success: true, data: users };
}

function createUser(ss, data) {
  let sheet = ss.getSheetByName("Users") || ss.insertSheet("Users");
  const indices = getHeaderIndices(sheet, ["code", "name", "role", "email"]);
  
  // Generate random 6 character alphanumeric code
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  const rowData = new Array(sheet.getLastColumn()).fill("");
  rowData[indices["code"]] = code;
  rowData[indices["name"]] = data.name;
  rowData[indices["role"]] = data.role || 'user';
  rowData[indices["email"]] = data.email || '';
  
  sheet.appendRow(rowData);
  
  return { success: true, code: code, user: { code, name: data.name, role: data.role || 'user', email: data.email || '' } };
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

function getChats(ss, data) {
  const roomHeaders = ["id", "name", "participants", "createdAt"];
  let roomSheet = ss.getSheetByName("ChatRooms");
  if (!roomSheet) { roomSheet = ss.insertSheet("ChatRooms"); getHeaderIndices(roomSheet, roomHeaders); }
  const roomIndices = getHeaderIndices(roomSheet, roomHeaders);
  
  let rooms = [];
  if (roomSheet.getLastRow() > 1) {
    const rRows = roomSheet.getRange(2, 1, roomSheet.getLastRow() - 1, roomSheet.getLastColumn()).getValues();
    rooms = rRows.map(row => ({
      id: row[roomIndices["id"]],
      name: row[roomIndices["name"]],
      participants: String(row[roomIndices["participants"]] || "").split(",").filter(Boolean),
      createdAt: row[roomIndices["createdAt"]] instanceof Date ? row[roomIndices["createdAt"]].toISOString() : row[roomIndices["createdAt"]]
    }));
  }

  const msgHeaders = ["id", "roomId", "userId", "userName", "text", "timestamp"];
  let msgSheet = ss.getSheetByName("ChatMessages");
  if (!msgSheet) { msgSheet = ss.insertSheet("ChatMessages"); getHeaderIndices(msgSheet, msgHeaders); }
  const msgIndices = getHeaderIndices(msgSheet, msgHeaders);
  
  let messages = [];
  if (msgSheet.getLastRow() > 1) {
    const lastRow = msgSheet.getLastRow();
    const limit = 200;
    const startRow = Math.max(2, lastRow - limit + 1);
    const numRows = lastRow - startRow + 1;
    
    if (numRows > 0) {
      const mRows = msgSheet.getRange(startRow, 1, numRows, msgSheet.getLastColumn()).getValues();
      messages = mRows.map(row => ({
        id: row[msgIndices["id"]],
        roomId: row[msgIndices["roomId"]],
        userId: row[msgIndices["userId"]],
        userName: row[msgIndices["userName"]],
        text: row[msgIndices["text"]],
        timestamp: row[msgIndices["timestamp"]] instanceof Date ? row[msgIndices["timestamp"]].toISOString() : row[msgIndices["timestamp"]]
      }));
    }
  }

  // Also get users to reduce calls
  let usersSheet = ss.getSheetByName("Users");
  let users = [];
  if (usersSheet && usersSheet.getLastRow() > 1) {
    const uIndices = getHeaderIndices(usersSheet, ["code", "name", "role", "email"]);
    const uRows = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, usersSheet.getLastColumn()).getValues();
    users = uRows.map(row => ({
      name: row[uIndices["name"]],
    })).filter(u => u.name);
  }

  return { success: true, rooms, messages, users };
}

function createChatRoom(ss, data) {
  let sheet = ss.getSheetByName("ChatRooms") || ss.insertSheet("ChatRooms");
  const indices = getHeaderIndices(sheet, ["id", "name", "participants", "createdAt"]);
  
  const id = String(data.id || "gas_room_" + Date.now());
  const rowData = new Array(sheet.getLastColumn()).fill("");
  rowData[indices["id"]] = id;
  rowData[indices["name"]] = data.name || "New Chat";
  rowData[indices["participants"]] = (data.participants || []).join(",");
  rowData[indices["createdAt"]] = new Date();
  
  sheet.appendRow(rowData);
  return { success: true, room: { id, name: data.name, participants: data.participants, createdAt: new Date().toISOString() } };
}

function logChatMessage(ss, data) {
  let sheet = ss.getSheetByName("ChatMessages") || ss.insertSheet("ChatMessages");
  const indices = getHeaderIndices(sheet, ["id", "roomId", "userId", "userName", "text", "timestamp"]);
  
  const id = String(data.id || "gas_msg_" + Date.now());
  const rowData = new Array(sheet.getLastColumn()).fill("");
  
  rowData[indices["id"]] = id;
  rowData[indices["roomId"]] = data.roomId || "general";
  rowData[indices["userId"]] = data.userId;
  rowData[indices["userName"]] = data.userName;
  rowData[indices["text"]] = data.text;
  rowData[indices["timestamp"]] = new Date(data.timestamp || new Date());
  
  sheet.appendRow(rowData);
  return { success: true, message: { id, roomId: data.roomId || "general", userId: data.userId, userName: data.userName, text: data.text, timestamp: new Date(data.timestamp || new Date()).toISOString() } };
}
