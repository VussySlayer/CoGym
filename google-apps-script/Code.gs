/**
 * Google Apps Script Backend for FlexSync
 * 
 * Instructions:
 * 1. Open a Google Sheet.
 * 2. Create two tabs: "Weight" and "Bookings".
 * 3. Go to Extensions > Apps Script.
 * 4. Paste this code into Code.gs.
 * 5. Create an Index.html file and paste the corresponding HTML content.
 * 6. Deploy as Web App (Execute as: Me, Who has access: Anyone).
 */

function doGet(e) {
  if (e && e.parameter && e.parameter.api) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'API Active', version: '2.0' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('FlexSync - Grind Tracker')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Handles POST requests. Acts as an API endpoint for the React app.
 * Expects JSON payload: { action: string, data: object }
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const data = payload.data;
    let result;

    switch(action) {
      case 'validate': 
        result = validateCode(data.code); 
        break;
      case 'logWeight': 
        result = logWeight(data.weight, data.note, data.userName); 
        break;
      case 'logBooking': 
        result = logBooking(data.sessionData); 
        break;
      case 'updateBooking':
        result = updateBooking(data.sessionData);
        break;
      case 'deleteBooking':
        result = deleteBooking(data.sessionId);
        break;
      case 'getUsers':
        result = getUsers();
        break;
      case 'createUser':
        result = createUser(data.name, data.role);
        break;
      case 'getHistory':
        result = getUserHistory(data.userName);
        break;
      case 'getAllSessions':
        result = getAllSessions();
        break;
      case 'getAllWeights':
        result = getAllWeights();
        break;
      default:
        result = { success: false, message: 'Unknown action: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Validates a Grind Code against the "Users" sheet
 */
function validateCode(code) {
  try {
    const normalizedCode = code.toUpperCase();
    
    // ADMIN BOOTSTRAP OVERRIDE
    if (normalizedCode === '011426') {
      return { 
        success: true, 
        user: {
          name: 'SYSTEM ADMIN',
          role: 'admin',
          code: '011426'
        }
      };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Users');
    if (!sheet) return { success: false, message: 'Registry not found (No Users sheet)' };

    const data = sheet.getDataRange().getValues();
    
    // Skip header row
    for (let i = 1; i < data.length; i++) {
      if (data[i][2] === normalizedCode) {
        return { 
          success: true, 
          user: {
            name: data[i][0],
            role: data[i][1],
            code: data[i][2]
          }
        };
      }
    }
    return { success: false, message: 'Invalid Grind Code' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function getUsers() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Users');
    if (!sheet) return { success: true, data: [] };
    
    const data = sheet.getDataRange().getValues();
    const users = [];
    for (let i = 1; i < data.length; i++) {
      users.push({
        name: data[i][0],
        role: data[i][1],
        code: data[i][2],
        created: data[i][3]
      });
    }
    return { success: true, data: users };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Creates a new user in the "Users" sheet (Admin only)
 */
function createUser(name, role) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Users');
    
    if (!sheet) {
      sheet = ss.insertSheet('Users');
      sheet.appendRow(['Name', 'Role', 'Code', 'Created At']);
      sheet.getRange('1:1').setFontWeight('bold').setBackground('#E2E8F0');
    }
    
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    sheet.appendRow([name, role, code, new Date()]);
    
    return { success: true, code: code };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Logs a session/booking to the "Sessions" sheet
 */
function logBooking(sessionData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Sessions');
    
    if (!sheet) {
      sheet = ss.insertSheet('Sessions');
      sheet.appendRow(['Timestamp', 'Session JSON']);
      sheet.getRange('1:1').setFontWeight('bold').setBackground('#f3f3f3');
    }
    
    sheet.appendRow([new Date(), JSON.stringify(sessionData)]);
    return { success: true, message: 'Session logged to Google Sheet' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function updateBooking(sessionData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Sessions');
    if (!sheet) return { success: false, message: 'Sessions sheet not found' };
    
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        try {
            const sess = JSON.parse(data[i][1]);
            const sid = sess.id || ("gas_" + i);
            if (sid === sessionData.id) {
                // Update the row (i+1 because rows are 1-indexed in GAS)
                sheet.getRange(i + 1, 2).setValue(JSON.stringify(sessionData));
                return { success: true, message: 'Session updated' };
            }
        } catch(err) {
            // pass
        }
    }
    return { success: false, message: 'Session not found' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function deleteBooking(sessionId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Sessions');
    if (!sheet) return { success: false, message: 'Sessions sheet not found' };
    
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        try {
            const sess = JSON.parse(data[i][1]);
            const sid = sess.id || ("gas_" + i);
            if (sid === sessionId) {
                // Delete the row (i+1 because rows are 1-indexed in GAS)
                sheet.deleteRow(i + 1);
                return { success: true, message: 'Session deleted' };
            }
        } catch(err) {
            const sid = "gas_old_" + i;
            if (sid === sessionId) {
                sheet.deleteRow(i + 1);
                return { success: true, message: 'Legacy session deleted' };
            }
        }
    }
    return { success: false, message: 'Session not found' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Logs legacy booking format (internal)
 */
function getUserHistory(userName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const results = { weight: [], sessions: [] };
    const wSheet = ss.getSheetByName('Weight');
    if (wSheet) {
      const data = wSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][1] === userName) {
          results.weight.push({ date: data[i][0], val: data[i][2], note: data[i][3] });
        }
      }
    }
    const sSheet = ss.getSheetByName('Sessions');
    if (sSheet) {
      const data = sSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][1] === userName) {
          results.sessions.push({ date: data[i][0], activity: data[i][2], location: data[i][3] });
        } else {
          try {
            const sess = JSON.parse(data[i][1]);
            if (sess.creatorName === userName || (sess.participants && sess.participants.includes(userName))) {
              results.sessions.push(sess);
            }
          } catch(err) {
             // pass
          }
        }
      }
    }
    return { success: true, data: results };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Fetches all sessions from the "Sessions" sheet for the community grid
 */
function getAllSessions() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Sessions');
    if (!sheet) return { success: true, data: [] };
    
    const data = sheet.getDataRange().getValues();
    const sessions = [];
    // Timestamp, JSON
    for (let i = 1; i < data.length; i++) {
        try {
            const sess = JSON.parse(data[i][1]);
            if (!sess.id) sess.id = "gas_" + i;
            sessions.push(sess);
        } catch(err) {
            sessions.push({
                id: "gas_old_" + i,
                timestamp: data[i][0],
                creatorName: data[i][1],
                title: data[i][2],
                location: data[i][3]
            });
        }
    }
    return { success: true, data: sessions };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function getAllWeights() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Weight');
    if (!sheet) return { success: true, data: [] };
    
    const data = sheet.getDataRange().getValues();
    const weights = [];
    for (let i = 1; i < data.length; i++) {
        weights.push({
            timestamp: data[i][0],
            user: data[i][1],
            weight: data[i][2],
            note: data[i][3]
        });
    }
    return { success: true, data: weights };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function logWeight(weight, note, userName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Weight');
    if (!sheet) {
      sheet = ss.insertSheet('Weight');
      sheet.appendRow(['Timestamp', 'User', 'Weight (KG)', 'Notes']);
      sheet.getRange('1:1').setFontWeight('bold').setBackground('#f3f3f3');
    }
    sheet.appendRow([new Date(), userName, weight, note || '']);
    return { success: true, message: 'Weight logged successfully' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}
