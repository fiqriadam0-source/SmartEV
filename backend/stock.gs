function checkStockAlert() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");
  var data = sheet.getDataRange().getValues();

  var message = "⚠️ LAPORAN STOK:\n\n";
  var alert = false;

  for (var i = 1; i < data.length; i++) {
    var bahan = data[i][0];        // Column A
    var stok_awal = Number(data[i][1]) || 0;    // Column B
    var digunakan = Number(data[i][2]) || 0;    // Column C
    var baki = Number(data[i][3]) || 0;          // Column D
    var minimum = Number(data[i][4]) || 0;       // Column E

    if (!baki && (stok_awal || digunakan)) {
      baki = stok_awal - digunakan;
      sheet.getRange(i + 1, 4).setValue(baki);
    }

    if (baki <= 0) {
      message += "❌ " + bahan + "\n";
      message += "Baki: " + baki + " | Min: " + minimum + "\n\n";
      sheet.getRange(i + 1, 4).setBackground("#ff4d4d");
      alert = true;
    } else if (baki <= minimum) {
      message += "🔴 " + bahan + "\n";
      message += "Baki: " + baki + " | Min: " + minimum + "\n\n";
      sheet.getRange(i + 1, 4).setBackground("#ffd166");
      alert = true;
    } else {
      sheet.getRange(i + 1, 4).setBackground("#ffffff");
    }
  }

  if (alert) {
    sendTelegram(message);
  }
}
function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function splitMaterialLabel(label) {
  var raw = String(label || "").trim();
  if (!raw) {
    return { material: "", size: "" };
  }

  var markers = [" | ", " - ", " / ", " :: "];
  for (var j = 0; j < markers.length; j++) {
    var marker = markers[j];
    var idx = raw.indexOf(marker);
    if (idx > -1) {
      return {
        material: raw.slice(0, idx).trim(),
        size: raw.slice(idx + marker.length).trim()
      };
    }
  }

  return { material: raw, size: "" };
}

// ======= AUTH helpers (Supabase) =======
var ACTION_ROLES = {
  getMaterials: 'staff', getSizesByMaterial: 'staff', getBalanceByMaterial: 'staff',
  getStock: 'storekeeper', getUsageHistory: 'storekeeper', usage: 'staff', addItem: 'admin',
  restock: 'admin', telegram: 'admin',
  createUsageRequest: 'staff', getMyRequests: 'staff', getPendingRequests: 'admin',
  approveRequest: 'admin', rejectRequest: 'admin'
};

var ACTION_ROLES_REQUESTS = {
  createUsageRequest: 'staff',
  getMyRequests: 'staff',
  getPendingRequests: 'admin',
  approveRequest: 'admin',
  rejectRequest: 'admin'
};

var ROLE_RANK = { staff: 1, storekeeper: 2, admin: 3 };

function getScriptProp(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

function getCaller(accessToken) {
  if (!accessToken) return null;
  try {
    var cache = CacheService.getScriptCache();
    var key = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, accessToken, Utilities.Charset.UTF_8);
    var cacheKey = 'access_' + key.map(function(b){return (b+256)%256}).join('');
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    var supaUrl = getScriptProp('SUPABASE_URL');
    var supaKey = getScriptProp('SUPABASE_PUBLISHABLE_KEY');
    if (!supaUrl || !supaKey) {
      console.log('Supabase props not set');
      return null;
    }

    var url = supaUrl.replace(/\/$/, '') + '/rest/v1/rpc/get_my_access';
    var options = {
      method: 'post',
      muteHttpExceptions: true,
      headers: {
        'apikey': supaKey,
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      }
    };

    var resp = UrlFetchApp.fetch(url, options);
    var code = resp.getResponseCode();
    if (code === 401) return null;
    if (code >= 400) {
      console.log('getCaller error code', code, resp.getContentText());
      return null;
    }

    var body = resp.getContentText();
    var obj = JSON.parse(body);
    var caller = Array.isArray(obj) && obj.length ? obj[0] : obj;
    try { cache.put(cacheKey, JSON.stringify(caller), 300); } catch (e) {}
    return caller;
  } catch (err) {
    console.log('getCaller exception: ' + err.message);
    return null;
  }
}

function checkActionAllowed(action, caller) {
  if (!caller || !caller.status || caller.status !== 'active') return false;

  if (action === 'usage') {
    return caller.role === 'staff' || caller.role === 'admin';
  }

  if (action === 'restock') {
    return caller.role === 'admin';
  }

  var minRole = ACTION_ROLES[action] || 'staff';
  var rankCaller = ROLE_RANK[caller.role] || 0;
  var rankMin = ROLE_RANK[minRole] || 0;
  return rankCaller >= rankMin;
}


// ======================
// doGet
// ======================
function doGet(e) {
  if (e.parameter.action === "getMaterials") {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");
    const data = sheet.getDataRange().getValues();

    var items = [];
    var seen = {};

    for (var i = 1; i < data.length; i++) {
      var materialName = String(data[i][0] || "").trim();
      if (!materialName) continue;

      var key = materialName.toLowerCase();
      if (!seen[key]) {
        items.push(materialName);
        seen[key] = true;
      }
    }

    return ContentService.createTextOutput(JSON.stringify(items.sort()))
             .setMimeType(ContentService.MimeType.JSON);
  }

  if (e.parameter.action === "getCategories") {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");
    const data = sheet.getDataRange().getValues();
    var categories = [];
    var seen = {};

    for (var i = 1; i < data.length; i++) {
      var category = String(data[i][7] || "").trim();
      if (!category) continue;
      var key = category.toLowerCase();
      if (!seen[key]) {
        categories.push(category);
        seen[key] = true;
      }
    }

    return ContentService.createTextOutput(JSON.stringify(categories.sort()))
             .setMimeType(ContentService.MimeType.JSON);
  }

  if (e.parameter.action === "getMaterialsByCategory") {
    var category = (e.parameter.kategori || e.parameter.category || "").trim();
    if (!category) {
      return ContentService.createTextOutput(JSON.stringify([]))
               .setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");
    const data = sheet.getDataRange().getValues();
    var materials = [];
    var seen = {};

    for (var i = 1; i < data.length; i++) {
      var rowCategory = String(data[i][7] || "").trim();
      var materialName = String(data[i][0] || "").trim();
      if (!materialName || !rowCategory) continue;
      if (normalizeText(rowCategory) !== normalizeText(category)) continue;

      var key = materialName.toLowerCase();
      if (!seen[key]) {
        materials.push(materialName);
        seen[key] = true;
      }
    }

    return ContentService.createTextOutput(JSON.stringify(materials.sort()))
             .setMimeType(ContentService.MimeType.JSON);
  }

  if (e.parameter.action === "getSpecsByMaterial") {
    var material = (e.parameter.material || "").trim();
    var materialInfo = splitMaterialLabel(material);
    var materialName = materialInfo.material || material;
    var targetCategory = (e.parameter.kategori || e.parameter.category || "").trim();
    if (!materialName) {
      return ContentService.createTextOutput(JSON.stringify([]))
               .setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");
    const data = sheet.getDataRange().getValues();
    var specs = [];
    var seen = {};

    for (var i = 1; i < data.length; i++) {
      var rowMaterial = String(data[i][0] || "").trim();
      var rowMaterialInfo = splitMaterialLabel(rowMaterial);
      var rowMaterialName = (rowMaterialInfo.material || rowMaterial).trim();
      var rowSpec = String(data[i][6] || "").trim();
      var rowCategory = String(data[i][7] || "").trim();
      var sameCategory = !targetCategory || normalizeText(rowCategory) === normalizeText(targetCategory);

      if (normalizeText(rowMaterialName) === normalizeText(materialName) && rowSpec && sameCategory) {
        var key = rowSpec.toLowerCase();
        if (!seen[key]) {
          specs.push(rowSpec);
          seen[key] = true;
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify(specs))
             .setMimeType(ContentService.MimeType.JSON);
  }

  if (e.parameter.action === "getSizesByMaterial") {
    var material = (e.parameter.material || "").trim();
    var materialInfo = splitMaterialLabel(material);
    var materialName = materialInfo.material || material;
    var targetSpec = (e.parameter.spesifikasi || "").trim();
    var targetCategory = (e.parameter.kategori || e.parameter.category || "").trim();
    if (!materialName) {
      return ContentService.createTextOutput(JSON.stringify([]))
               .setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");
    const data = sheet.getDataRange().getValues();
    var sizes = [];
    var seen = {};

    for (var i = 1; i < data.length; i++) {
      var rowMaterial = String(data[i][0] || "").trim();
      var rowMaterialInfo = splitMaterialLabel(rowMaterial);
      var rowMaterialName = (rowMaterialInfo.material || rowMaterial).trim();
      var rowSize = String(data[i][5] || "").trim();
      var rowSpec = String(data[i][6] || "").trim();
      var rowCategory = String(data[i][7] || "").trim();
      var sameMaterial = normalizeText(rowMaterialName) === normalizeText(materialName);
      var sameSpec = !targetSpec || !rowSpec || normalizeText(rowSpec) === normalizeText(targetSpec);
      var sameCategory = !targetCategory || normalizeText(rowCategory) === normalizeText(targetCategory);

      if (sameMaterial && rowSize && sameSpec && sameCategory) {
        var key = rowSize.toLowerCase();
        if (!seen[key]) {
          sizes.push(rowSize);
          seen[key] = true;
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify(sizes))
             .setMimeType(ContentService.MimeType.JSON);
  }

  if (e.parameter.action === "getBalanceByMaterial") {
    var material = (e.parameter.material || "").trim();
    var materialInfo = splitMaterialLabel(material);
    var materialName = materialInfo.material || material;
    var targetSize = (e.parameter.saiz || "").trim();
    var targetSpec = (e.parameter.spesifikasi || "").trim();
    var targetCategory = (e.parameter.kategori || e.parameter.category || "").trim();

    if (!materialName) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Material tidak dinyatakan" }))
               .setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");
    const data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      var rowMaterial = String(data[i][0] || "").trim();
      var rowMaterialInfo = splitMaterialLabel(rowMaterial);
      var rowMaterialName = (rowMaterialInfo.material || rowMaterial).trim();
      var rowSize = String(data[i][5] || "").trim();
      var rowSpec = String(data[i][6] || "").trim();
      var rowCategory = String(data[i][7] || "").trim();
      var sameName = normalizeText(rowMaterialName) === normalizeText(materialName);
      var sameSize = !targetSize || !rowSize || normalizeText(rowSize) === normalizeText(targetSize);
      var sameSpec = !targetSpec || !rowSpec || normalizeText(rowSpec) === normalizeText(targetSpec);
      var sameCategory = !targetCategory || normalizeText(rowCategory) === normalizeText(targetCategory);

      if (sameName && sameSize && sameSpec && sameCategory) {
        return ContentService.createTextOutput(JSON.stringify({
          material: rowMaterial,
          baki: data[i][3],
          minimum: data[i][4],
          saiz: rowSize,
          spesifikasi: rowSpec,
          kategori: rowCategory
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ error: "Material tidak dijumpai" }))
             .setMimeType(ContentService.MimeType.JSON);
  }

  if (e.parameter.action === "getUsageHistory") {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MaterialUsage");
    const data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify([]))
               .setMimeType(ContentService.MimeType.JSON);
    }

    var history = [];

    for (var i = 1; i < data.length; i++) {
      var materialLabel = String(data[i][2] || "").trim();
      var materialInfo = splitMaterialLabel(materialLabel);
      var rowSize = String(data[i][6] || "").trim() || (materialInfo.size || "").trim();
      var rowSpec = String(data[i][7] || "").trim();
      var rowCategory = String(data[i][8] || "").trim();

      history.push({
        timestamp : data[i][0] ? new Date(data[i][0]).toLocaleString('ms-MY') : "",
        nama      : data[i][1],
        material  : materialInfo.material || materialLabel,
        kuantiti  : data[i][3],
        unit      : data[i][4],
        tujuan    : data[i][5],
        saiz      : rowSize,
        spesifikasi: rowSpec,
        kategori  : rowCategory
      });
    }

    history.reverse();

    return ContentService.createTextOutput(JSON.stringify(history))
             .setMimeType(ContentService.MimeType.JSON);
  }

  // Senarai stok penuh untuk halaman Restok & Senarai Stock
// Sheet Stock: A bahan | B stok awal | C digunakan | D baki | E minimum | F saiz | G spesifikasi
  if (e.parameter.action === "getStock") {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");
    const data = sheet.getDataRange().getValues();
    var stockMap = {};

    for (var i = 1; i < data.length; i++) {
      var rawMaterial = String(data[i][0] || "").trim();
      if (!rawMaterial) continue;

      var materialInfo = splitMaterialLabel(rawMaterial);
      var materialName = (materialInfo.material || rawMaterial).trim();
      var size = String(data[i][5] || "").trim() || (materialInfo.size || "").trim();
      var spesifikasi = String(data[i][6] || "").trim();
      var kategori = String(data[i][7] || "").trim();
      var baki = Number(data[i][3]) || 0;
      var minimum = Number(data[i][4]) || 0;
      var key = (materialName + "::" + size + "::" + spesifikasi + "::" + kategori).toLowerCase();

      if (!stockMap[key]) {
        stockMap[key] = {
          material: materialName,
          spesifikasi: spesifikasi,
          saiz: size,
          kategori: kategori,
          baki: baki,
          minimum: minimum
        };
        continue;
      }

      if (baki > Number(stockMap[key].baki)) {
        stockMap[key].baki = baki;
      }
      if (minimum > Number(stockMap[key].minimum)) {
        stockMap[key].minimum = minimum;
      }
      if (!stockMap[key].saiz && size) {
        stockMap[key].saiz = size;
      }
      if (!stockMap[key].spesifikasi && spesifikasi) {
        stockMap[key].spesifikasi = spesifikasi;
      }
      if (!stockMap[key].kategori && kategori) {
        stockMap[key].kategori = kategori;
      }
    }

    var stock = Object.keys(stockMap).map(function (key) {
      return stockMap[key];
    });

    stock.sort(function (a, b) {
      return String(a.material).localeCompare(String(b.material)) || String(a.saiz).localeCompare(String(b.saiz));
    });

    return ContentService.createTextOutput(JSON.stringify(stock))
             .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ error: "Action tidak dikenali" }))
           .setMimeType(ContentService.MimeType.JSON);
}

// ======================
// doPost - VERSI DIPERBAIKI
// ======================
function doPost(e) {
  try {
    if (e.postData && e.postData.contents) {
      var isTelegramWebhook = false;
      try {
        var webhookPayload = JSON.parse(e.postData.contents);
        isTelegramWebhook = !!webhookPayload.callback_query;
      } catch (webhookErr) {}
      if (isTelegramWebhook) {
        return ContentService.createTextOutput(handleTelegramWebhook(e)).setMimeType(ContentService.MimeType.TEXT);
      }
    }

    var type = e.parameter.type || "";
    var access_token = (e.parameter && e.parameter.access_token) || '';
    var authMode = getScriptProp('AUTH_MODE') || 'off';
    var caller = null;
    if (access_token) caller = getCaller(access_token);
    if (authMode !== 'off') {
      caller = getCaller(access_token);
      if (!caller && authMode === 'enforce') {
        return ContentService.createTextOutput('Error: AUTH_REQUIRED');
      }
    }

    // ==================== TELEGRAM (mesej manual dari web) ====================
    if (type === "telegram") {
      var text = (e.parameter.message || "").trim();
      if (!text) {
        return ContentService.createTextOutput("Error: Mesej kosong");
      }
      if (authMode !== 'off' && !checkActionAllowed('telegram', caller)) {
        return ContentService.createTextOutput('Error: FORBIDDEN');
      }

      var result = sendTelegram(text, "HTML");
      return ContentService.createTextOutput(
        result.ok ? "Telegram Success" : "Error: " + (result.description || "Mesej tidak dihantar")
      );
    }

    var action = String(e.parameter.action || '').trim();
    if (ACTION_ROLES_REQUESTS[action]) {
      if (authMode !== 'off' && !checkActionAllowed(action, caller)) {
        return ContentService.createTextOutput('Error: FORBIDDEN');
      }
      if (action === 'createUsageRequest') {
        return ContentService.createTextOutput(createUsageRequest(e, caller));
      }
      if (action === 'getMyRequests') {
        return ContentService.createTextOutput(JSON.stringify(getMyRequests(caller))).setMimeType(ContentService.MimeType.JSON);
      }
      if (action === 'getPendingRequests') {
        return ContentService.createTextOutput(JSON.stringify(getPendingRequests())).setMimeType(ContentService.MimeType.JSON);
      }
      if (action === 'approveRequest') {
        var approveId = String(e.parameter.request_id || '').trim();
        var approveReviewer = caller ? (caller.full_name || caller.email || 'Admin') : 'Admin';
        return ContentService.createTextOutput(approveRequest(approveId, approveReviewer));
      }
      if (action === 'rejectRequest') {
        var rejectId = String(e.parameter.request_id || '').trim();
        var rejectReviewer = caller ? (caller.full_name || caller.email || 'Admin') : 'Admin';
        return ContentService.createTextOutput(rejectRequest(rejectId, rejectReviewer));
      }
    }
    
    // ==================== ADD ITEM ====================
    if (type === "addItem") {
      var material = (e.parameter.material || "").trim();
      var spesifikasi = (e.parameter.spesifikasi || "").trim();
      var saiz = (e.parameter.saiz || "").trim();
      var kategori = (e.parameter.kategori || "").trim();
      var stokAwal = Number(e.parameter.stokAwal) || 0;
      var minimum = Number(e.parameter.minimum) || 0;

      if (authMode !== 'off' && !checkActionAllowed('addItem', caller)) {
        return ContentService.createTextOutput('Error: FORBIDDEN');
      }

      if (!material) {
        return ContentService.createTextOutput("Error: Nama bahan diperlukan");
      }
      if (!kategori) {
        return ContentService.createTextOutput("Error: Kategori bahan diperlukan");
      }
      if (isNaN(stokAwal) || stokAwal < 0) {
        return ContentService.createTextOutput("Error: Stok awal tidak sah");
      }
      if (isNaN(minimum) || minimum < 0) {
        return ContentService.createTextOutput("Error: Minimum tidak sah");
      }

      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var stockSheet = ss.getSheetByName("Stock");
      if (!stockSheet) {
        return ContentService.createTextOutput("Error: Sheet Stock tidak dijumpai");
      }

      var data = stockSheet.getDataRange().getValues();
      var materialInfo = splitMaterialLabel(material);
      var materialName = materialInfo.material || material;
      var targetSize = saiz || (materialInfo.size || "");
      var targetSpec = spesifikasi || "";

      for (var i = 1; i < data.length; i++) {
        var rowMaterial = String(data[i][0] || "").trim();
        var rowMaterialInfo = splitMaterialLabel(rowMaterial);
        var rowMaterialName = (rowMaterialInfo.material || rowMaterial).trim();
        var rowSize = String(data[i][5] || "").trim();
        var rowSpec = String(data[i][6] || "").trim();
        var rowCategory = String(data[i][7] || "").trim();
        var sameName = normalizeText(rowMaterialName) === normalizeText(materialName);
        var sameSize = !targetSize || !rowSize || normalizeText(rowSize) === normalizeText(targetSize);
        var sameSpec = !targetSpec || !rowSpec || normalizeText(rowSpec) === normalizeText(targetSpec);
        var sameCategory = normalizeText(rowCategory) === normalizeText(kategori);

        if (sameName && sameSize && sameSpec && sameCategory) {
          return ContentService.createTextOutput("Error: Item dengan bahan, spesifikasi, saiz dan kategori yang sama sudah wujud");
        }
      }

      stockSheet.appendRow([materialName, stokAwal, 0, stokAwal, minimum, targetSize, targetSpec, kategori]);
      return ContentService.createTextOutput("Item baru berjaya ditambah ke Stock.");
    }

    // ==================== RESTOCK ====================
    if (type === "restock") {
      var material = (e.parameter.material || "").trim();
      var spesifikasi = (e.parameter.spesifikasi || "").trim();
      var kuantiti = Number(e.parameter.kuantiti) || 0;
      var targetSize = (e.parameter.saiz || "").trim();

      if (authMode !== 'off' && !checkActionAllowed('restock', caller)) {
        return ContentService.createTextOutput('Error: FORBIDDEN');
      }

      if (!material || kuantiti <= 0) {
        return ContentService.createTextOutput("Error: Data restock tidak lengkap");
      }

      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var stockSheet = ss.getSheetByName("Stock");
      var restockSheet = ss.getSheetByName("Restock");

      var materialInfo = splitMaterialLabel(material);
      var materialName = materialInfo.material || material;
      var data = stockSheet.getDataRange().getValues();
      var exactMatchIndex = -1;
      var blankMatchIndex = -1;

      for (var i = 1; i < data.length; i++) {
        var rowMaterial = String(data[i][0] || "").trim();
        var rowMaterialInfo = splitMaterialLabel(rowMaterial);
        var rowMaterialName = (rowMaterialInfo.material || rowMaterial).trim();
        var rowSize = String(data[i][5] || "").trim();
        var rowSpec = String(data[i][6] || "").trim();
        var sameName = normalizeText(rowMaterialName) === normalizeText(materialName);
        var sameSize = !targetSize || !rowSize || normalizeText(rowSize) === normalizeText(targetSize);

        if (!sameName || !sameSize) continue;

        if (spesifikasi) {
          if (rowSpec && rowSpec.toLowerCase() === spesifikasi.toLowerCase()) {
            exactMatchIndex = i;
            break;
          }
          if (!rowSpec && blankMatchIndex === -1) {
            blankMatchIndex = i;
          }
        } else if (!rowSpec && blankMatchIndex === -1) {
          blankMatchIndex = i;
        }
      }

      var targetRowIndex = exactMatchIndex !== -1 ? exactMatchIndex : blankMatchIndex;
      if (targetRowIndex !== -1) {
        var rowIndex = targetRowIndex;
        var rowSpec = String(data[rowIndex][6] || "").trim();
        var rowSize = String(data[rowIndex][5] || "").trim();
        var stokAwalBaru = Number(data[rowIndex][1]) + kuantiti;
        var bakiBaru     = Number(data[rowIndex][3]) + kuantiti;

        stockSheet.getRange(rowIndex + 1, 2).setValue(stokAwalBaru);
        stockSheet.getRange(rowIndex + 1, 4).setValue(bakiBaru);

        restockSheet.appendRow([new Date(), materialName, kuantiti, targetSize || rowSize, spesifikasi || rowSpec]);
        sendTelegramRestock(
          materialName + (targetSize ? " (" + targetSize + ")" : ""),
          kuantiti,
          spesifikasi || rowSpec,
          category || rowCategory
        );

        return ContentService.createTextOutput("Restock Success");
      }
      return ContentService.createTextOutput("Error: Material tidak dijumpai");
    }

    // ==================== MATERIAL USAGE ====================
    var nama    = (e.parameter.nama || "").trim();
    var tujuan  = (e.parameter.tujuan || "").trim();
    var itemsJson = e.parameter.items;

    if (authMode !== 'off' && !checkActionAllowed('usage', caller)) {
      return ContentService.createTextOutput('Error: FORBIDDEN');
    }

    if (!nama) return ContentService.createTextOutput("Error: Nama peminjam diperlukan");
    if (!itemsJson) return ContentService.createTextOutput("Error: Tiada barang dipilih");

    var items = JSON.parse(itemsJson);

    if (!Array.isArray(items) || items.length === 0) {
      return ContentService.createTextOutput("Error: Tiada barang");
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var stockSheet = ss.getSheetByName("Stock");
    var usageSheet = ss.getSheetByName("MaterialUsage");

    if (!stockSheet || !usageSheet) {
      return ContentService.createTextOutput("Error: Sheet Stock atau MaterialUsage tidak dijumpai");
    }

    var stockData = stockSheet.getDataRange().getValues();
    var timestamp = new Date();

    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var material = (item.material || "").trim();
      var spesifikasi = (item.spesifikasi || "").trim();
      var kuantiti = Number(item.kuantiti) || 0;
      var unit     = (item.unit || "").trim();
      var itemSize = String(item.saiz || "").trim();
      var category = String(item.kategori || "").trim();
      var materialInfo = splitMaterialLabel(material);
      var materialName = materialInfo.material || material;
      var targetSize = itemSize || materialInfo.size || "";
      var targetSpec = spesifikasi || "";

      if (!material || kuantiti <= 0) {
        return ContentService.createTextOutput("Error: Data tidak lengkap untuk " + material);
      }

      if (material && !category) {
        return ContentService.createTextOutput("Error: Kategori untuk " + material + " diperlukan");
      }

      var found = false;

      for (var i = 1; i < stockData.length; i++) {
        var rowMaterial = String(stockData[i][0] || "").trim();
        var rowMaterialInfo = splitMaterialLabel(rowMaterial);
        var rowMaterialName = (rowMaterialInfo.material || rowMaterial).trim();
        var rowSize = String(stockData[i][5] || "").trim();
        var rowSpec = String(stockData[i][6] || "").trim();
        var rowCategory = String(stockData[i][7] || "").trim();
        var sameName = normalizeText(rowMaterialName) === normalizeText(materialName);
        var sameSize = !targetSize || (rowSize && normalizeText(rowSize) === normalizeText(targetSize));
        var sameSpec = !targetSpec || !rowSpec || normalizeText(rowSpec) === normalizeText(targetSpec);
        var sameCategory = !category || normalizeText(rowCategory) === normalizeText(category);

        if (sameName && sameSize && sameSpec && sameCategory) {

          var stokAwal     = Number(stockData[i][1]) || 0;
          var stokDigunakan = Number(stockData[i][2]) || 0;
          var baki         = Number(stockData[i][3]) || 0;

          if (baki <= 0) {
            sendTelegramOutOfStock(
              materialName + (targetSize ? " (" + targetSize + ")" : ""),
              targetSpec || rowSpec,
              category || rowCategory
            );
            return ContentService.createTextOutput(`❌ STOK TELAH HABIS!\nMaterial: ${materialName}${targetSize ? " | " + targetSize : ""}`);
          }

          if (kuantiti > baki) {
            sendTelegramAlert(
              materialName + (targetSize ? " (" + targetSize + ")" : ""),
              baki,
              stockMinimum,
              targetSpec || rowSpec,
              category || rowCategory
            );
            return ContentService.createTextOutput(
              `❌ STOK TIDAK CUKUP!\nMaterial: ${materialName}${targetSize ? " | " + targetSize : ""}\nBaki: ${baki}\nDiminta: ${kuantiti}`
            );
          }

          stokDigunakan += kuantiti;
          baki = stokAwal - stokDigunakan;

          stockSheet.getRange(i + 1, 3).setValue(stokDigunakan);
          stockSheet.getRange(i + 1, 4).setValue(baki);

          usageSheet.appendRow([timestamp, nama, materialName, kuantiti, unit, tujuan, targetSize || "", targetSpec || "", category || ""]);

          var stockMinimum = Number(stockData[i][4]) || 0;
          if (baki <= 0) {
            sendTelegramOutOfStock(
              materialName + (targetSize ? " (" + targetSize + ")" : "") + (targetSpec ? " - " + targetSpec : ""),
              targetSpec || rowSpec,
              category || rowCategory
            );
          } else if (baki <= stockMinimum) {
            sendTelegramAlert(
              materialName + (targetSize ? " (" + targetSize + ")" : "") + (targetSpec ? " - " + targetSpec : ""),
              baki,
              stockMinimum,
              targetSpec || rowSpec,
              category || rowCategory
            );
          }

          found = true;
          break;
        }
      }

      if (!found) {
        return ContentService.createTextOutput(`Error: Material "${materialName}${targetSize ? " | " + targetSize : ""}" tidak dijumpai`);
      }
    }

    // Hantar SATU notifikasi Telegram untuk semua barang
    sendTelegramUsageMulti(nama, tujuan, items);

    return ContentService.createTextOutput(`Berjaya! ${items.length} barang telah direkodkan.`);
    
  } catch (err) {
    console.log("doPost Error: " + err.message);   // Untuk debug
    return ContentService.createTextOutput("Error: " + err.message);
  }
}

// ======================
// TELEGRAM FUNCTIONS - WAJIB ADA
// ======================
// Token & chat ID disimpan dalam Script Properties (Project Settings > Script properties):
//   TELEGRAM_TOKEN   = token bot dari @BotFather
//   TELEGRAM_CHAT_ID = chat ID penerima
// Jangan tulis token terus dalam kod.
function sendTelegram(text, parseMode) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("TELEGRAM_TOKEN");
  var chatId = props.getProperty("TELEGRAM_CHAT_ID");

  if (!token || !chatId) {
    console.log("Telegram belum dikonfigurasi: set TELEGRAM_TOKEN dan TELEGRAM_CHAT_ID dalam Script Properties");
    return { ok: false, description: "Telegram belum dikonfigurasi" };
  }

  var payload = { chat_id: chatId, text: text };
  if (parseMode) payload.parse_mode = parseMode;

  try {
    var response = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return JSON.parse(response.getContentText());
  } catch (err) {
    console.log("Telegram error: " + err.message);
    return { ok: false, description: err.message };
  }
}

function sendTelegramUsage(nama, material, kuantiti, unit, tujuan, saiz, spesifikasi, kategori) {
  var specText = spesifikasi ? "\n📄 Spesifikasi: " + spesifikasi : "";
  var categoryText = kategori ? "\n🏷️ Kategori: " + kategori : "";
  var msg = "📦 PERMOHONAN PENGELUARAN BARANG\n" +
            "👤 Nama: " + nama + "\n" +
            "📦 Material: " + material + (saiz ? " (" + saiz + ")" : "") + specText + categoryText + "\n" +
            "🔢 Kuantiti: " + kuantiti +
            (unit ? " " + unit : "") + "\n" +
            "📍 Tujuan: " + tujuan;

  try {
    sendTelegram(msg);
  } catch(err) {
    Logger.log("Telegram usage error: " + err);
  }
}

function sendTelegramAlert(material, baki, minimum, spesifikasi, kategori) {
  var specText = spesifikasi ? "\n📄 Spesifikasi: " + spesifikasi : "";
  var categoryText = kategori ? "\n🏷️ Kategori: " + kategori : "";
  var minimumText = typeof minimum !== 'undefined' && minimum !== null ? "\nTahap Minimum: " + minimum : "";
  var msg = "⚠️ STOCK RENDAH\nMaterial: " + material + specText + categoryText + "\nBaki Tinggal: " + baki + minimumText;

  try {
    sendTelegram(msg);
  } catch(err) {
    Logger.log("Telegram alert error: " + err);
  }
}

function sendTelegramOutOfStock(material, spesifikasi, kategori) {
  var specText = spesifikasi ? "\n📄 Spesifikasi: " + spesifikasi : "";
  var categoryText = kategori ? "\n🏷️ Kategori: " + kategori : "";
  var msg = "❌ STOCK HABIS\nMaterial: " + material + specText + categoryText;

  try {
    sendTelegram(msg);
  } catch(err) {
    Logger.log("Telegram out-of-stock error: " + err);
  }
}

function sendTelegramRestock(material, kuantiti, spesifikasi, kategori) {
  var specText = spesifikasi ? "\n📄 Spesifikasi: " + spesifikasi : "";
  var categoryText = kategori ? "\n🏷️ Kategori: " + kategori : "";
  var msg = "✅ PENAMBAHAN STOK BERJAYA\nMaterial: " + material + specText + categoryText + "\nKuantiti Tambah: " + kuantiti;

  try {
    sendTelegram(msg);
  } catch(err) {
    Logger.log("Telegram restock error: " + err);
  }
}

function sendTelegramNewUser(nama, email, role) {
  var msg = "🆕 PENDAFTARAN PENGGUNA BARU\n" +
            "👤 Nama: " + (nama || 'Pengguna Baru') + "\n" +
            "📧 Emel: " + email + "\n" +
            "🔐 Peranan: " + (role || 'staff') + "\n" +
            "⏳ Status: pending\n" +
            "🕒 Masa: " + new Date().toLocaleString('ms-MY');

  try {
    sendTelegram(msg);
  } catch(err) {
    Logger.log("Telegram new user error: " + err);
  }
}
// ======================
// Dapatkan senarai material untuk autocomplete
// ======================
function getMaterialList() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var stockSheet = ss.getSheetByName("Stock");
    
    if (!stockSheet) return ["Error: Sheet Stock tidak dijumpai"];
    
    var data = stockSheet.getDataRange().getValues();
    var materials = [];
    
    for (var i = 1; i < data.length; i++) {
      var mat = String(data[i][0]).trim();
      if (mat) materials.push(mat);
    }
    
    return materials.sort();
  } catch (err) {
    console.log("Error getMaterialList: " + err.message);
    return ["Ralat memuat senarai"];
  }
}

// ======================
// TELEGRAM USAGE MULTI (dengan Unit)
// ======================
function sendTelegramUsageMulti(nama, tujuan, items) {
  var msg = "📦 PERMOHONAN PENGELUARAN BARANG\n" +
            "👤 Nama: " + nama + "\n" +
            "📍 Tujuan: " + tujuan + "\n\n" +
            "📋 Senarai Barang:\n";

  items.forEach(function(item) {
    var unitText = item.unit ? " " + item.unit : "";
    var sizeText = item.saiz ? " (" + item.saiz + ")" : "";
    var specText = item.spesifikasi ? " - " + item.spesifikasi : "";
    var categoryText = item.kategori ? "\n   🏷️ Kategori: " + item.kategori : "";
    msg += "• " + (item.material || "") + sizeText + specText + " → " + item.kuantiti + unitText + categoryText + "\n";
  });

  msg += "\nJumlah barang: " + items.length + "\n📌 Rekod terbaru: " + new Date().toLocaleString('ms-MY');

  try {
    sendTelegram(msg);
    console.log("Telegram Multi Usage berjaya");
  } catch(err) {
    console.log("Telegram multi usage error: " + err.message);
  }
}

function debugTelegramProps() {
  console.log('TOKEN:', PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN'));
  console.log('CHAT_ID:', PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID'));
}

function ensureRequestSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('PermohonanBarang');
  if (!sheet) {
    sheet = ss.insertSheet('PermohonanBarang');
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['request_id','timestamp','applicant_user_id','applicant_email','applicant_name','purpose','category','material','specification','size','quantity','unit','status','reviewed_at','reviewed_by','telegram_message_id']);
  }
  return sheet;
}

function makeRequestId() {
  return 'REQ-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
}

function sendRequestTelegram(requestId, nama, tujuan, items) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_TOKEN');
  var chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return null;

  var msg = '📝 PERMOHONAN BARANG MENUNGGU KELULUSAN\n' +
            '🆔 ' + requestId + '\n' +
            '👤 Nama: ' + nama + '\n' +
            '📍 Tujuan: ' + tujuan + '\n\nSenarai Barang:\n';
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    msg += '• ' + (item.material || '-');
    if (item.saiz) msg += ' (' + item.saiz + ')';
    if (item.spesifikasi) msg += ' - ' + item.spesifikasi;
    msg += ' → ' + item.kuantiti + ' ' + (item.unit || '') + '\n';
  }
  msg += '\n📌 Masa: ' + new Date().toLocaleString('ms-MY');

  var payload = {
    chat_id: chatId,
    text: msg,
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Lulus', callback_data: 'approve:' + requestId },
        { text: '❌ Tolak', callback_data: 'reject:' + requestId }
      ]]
    }
  };
  try {
    var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var result = JSON.parse(response.getContentText());
    return result.ok && result.result ? String(result.result.message_id || '') : null;
  } catch (err) {
    console.log('sendRequestTelegram error: ' + err.message);
    return null;
  }
}

function answerTelegramCallback(callbackId, text) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_TOKEN');
  if (!token || !callbackId) return;
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/answerCallbackQuery', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ callback_query_id: callbackId, text: text || '', show_alert: false }),
      muteHttpExceptions: true
    });
  } catch (err) {
    console.log('answerTelegramCallback error: ' + err.message);
  }
}

function removeTelegramButtons(chatId, messageId) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_TOKEN');
  if (!token || !chatId || !messageId) return;
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/editMessageReplyMarkup', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, message_id: Number(messageId), reply_markup: { inline_keyboard: [] } }),
      muteHttpExceptions: true
    });
  } catch (err) {
    console.log('removeTelegramButtons error: ' + err.message);
  }
}

function getRequestRows() {
  var sheet = ensureRequestSheet();
  var data = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    rows.push({
      row: i + 1,
      request_id: String(data[i][0] || ''),
      timestamp: data[i][1] ? new Date(data[i][1]).toISOString() : '',
      applicant_user_id: String(data[i][2] || ''),
      applicant_email: String(data[i][3] || ''),
      applicant_name: String(data[i][4] || ''),
      purpose: String(data[i][5] || ''),
      kategori: String(data[i][6] || ''),
      material: String(data[i][7] || ''),
      spesifikasi: String(data[i][8] || ''),
      saiz: String(data[i][9] || ''),
      kuantiti: data[i][10],
      unit: String(data[i][11] || ''),
      status: String(data[i][12] || 'pending'),
      reviewed_at: data[i][13] ? String(data[i][13]) : '',
      reviewed_by: String(data[i][14] || ''),
      telegram_message_id: String(data[i][15] || '')
    });
  }
  return rows;
}

function findRequestRows(requestId) {
  return getRequestRows().filter(function(row) { return row.request_id === requestId; });
}

function setRequestStatus(requestId, status, reviewer) {
  var sheet = ensureRequestSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '') === requestId) {
      sheet.getRange(i + 1, 13).setValue(status);
      sheet.getRange(i + 1, 14).setValue(new Date());
      sheet.getRange(i + 1, 15).setValue(reviewer || 'Telegram Admin');
    }
  }
}

function createUsageRequest(e, caller) {
  var nama = String(e.parameter.nama || '').trim();
  var tujuan = String(e.parameter.tujuan || '').trim();
  var items = [];
  try { items = JSON.parse(e.parameter.items || '[]'); } catch (err) { return 'Error: Format barang tidak sah'; }
  if (!nama || !tujuan || !Array.isArray(items) || items.length === 0) return 'Error: Data permohonan tidak lengkap';

  var requestId = makeRequestId();
  var timestamp = new Date();
  var sheet = ensureRequestSheet();
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var qty = Number(item.kuantiti) || 0;
    if (!item.kategori || !item.material || qty <= 0) return 'Error: Data barang tidak lengkap';
  }
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var qty = Number(item.kuantiti) || 0;
    sheet.appendRow([
      requestId, timestamp, caller ? caller.id : '', caller ? caller.email : '', nama, tujuan,
      String(item.kategori || ''), String(item.material || ''), String(item.spesifikasi || ''),
      String(item.saiz || ''), qty, String(item.unit || ''), 'pending', '', '', ''
    ]);
  }

  var messageId = sendRequestTelegram(requestId, nama, tujuan, items);
  if (messageId) {
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][0] || '') === requestId) sheet.getRange(r + 1, 16).setValue(messageId);
    }
  }
  return 'Permohonan berjaya dihantar! Menunggu kelulusan admin.';
}

function getMyRequests(caller) {
  var rows = getRequestRows();
  if (!caller) return [];
  return rows.filter(function(row) {
    return row.applicant_user_id === caller.id || (!row.applicant_user_id && row.applicant_email === caller.email);
  }).reverse();
}

function getPendingRequests() {
  return getRequestRows().filter(function(row) { return row.status === 'pending'; }).reverse();
}

function approveRequest(requestId, reviewer) {
  var rows = findRequestRows(requestId);
  if (!rows.length) return 'Error: Permohonan tidak dijumpai';
  if (rows[0].status !== 'pending') return 'Error: Permohonan sudah diproses';

  var stockSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Stock');
  var usageSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MaterialUsage');
  if (!stockSheet || !usageSheet) return 'Error: Sheet stock atau usage tidak dijumpai';

  var stockData = stockSheet.getDataRange().getValues();
  var planned = [];
  var plannedByStockRow = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var found = -1;
    for (var r = 1; r < stockData.length; r++) {
      var rowMaterial = String(stockData[r][0] || '').trim();
      var info = splitMaterialLabel(rowMaterial);
      var sameName = normalizeText(info.material || rowMaterial) === normalizeText(row.material);
      var sameSize = !row.saiz || !String(stockData[r][5] || '').trim() || normalizeText(String(stockData[r][5] || '')) === normalizeText(row.saiz);
      var sameSpec = !row.spesifikasi || !String(stockData[r][6] || '').trim() || normalizeText(String(stockData[r][6] || '')) === normalizeText(row.spesifikasi);
      var sameCategory = !row.kategori || normalizeText(String(stockData[r][7] || '')) === normalizeText(row.kategori);
      if (sameName && sameSize && sameSpec && sameCategory) { found = r; break; }
    }
    if (found < 0) return 'Error: Bahan tidak dijumpai semasa kelulusan: ' + row.material;

    var qty = Number(row.kuantiti) || 0;
    var stockRow = found + 1;
    if (!plannedByStockRow[stockRow]) plannedByStockRow[stockRow] = { stockRow: stockRow, found: found, qty: 0 };
    plannedByStockRow[stockRow].qty += qty;
    planned.push({ row: row, stockRow: stockRow, found: found });
  }

  for (var key in plannedByStockRow) {
    if (!Object.prototype.hasOwnProperty.call(plannedByStockRow, key)) continue;
    var totalPlan = plannedByStockRow[key];
    var baki = Number(stockData[totalPlan.found][3]) || 0;
    if (totalPlan.qty > baki) return 'Error: Jumlah kuantiti melebihi baki stok. Baki: ' + baki;
  }

  var timestamp = new Date();
  for (var p = 0; p < planned.length; p++) {
    var plan = planned[p];
    var planRow = plan.row;
    var qtyUsed = Number(planRow.kuantiti) || 0;
    var stokAwal = Number(stockData[plan.found][1]) || 0;
    var used = (Number(stockData[plan.found][2]) || 0);

    var priorQty = 0;
    for (var q = 0; q < p; q++) {
      if (planned[q].stockRow === plan.stockRow) priorQty += Number(planned[q].row.kuantiti) || 0;
    }
    used += priorQty + qtyUsed;
    var bakiBaru = stokAwal - used;
    stockSheet.getRange(plan.stockRow, 3).setValue(used);
    stockSheet.getRange(plan.stockRow, 4).setValue(bakiBaru);
    usageSheet.appendRow([timestamp, planRow.applicant_name, planRow.material, qtyUsed, planRow.unit, planRow.purpose, planRow.saiz, planRow.spesifikasi, planRow.kategori, planRow.applicant_email]);
  }
  setRequestStatus(requestId, 'approved', reviewer);
  return 'Permohonan ' + requestId + ' berjaya diluluskan dan direkodkan.';
}

function rejectRequest(requestId, reviewer) {
  var rows = findRequestRows(requestId);
  if (!rows.length) return 'Error: Permohonan tidak dijumpai';
  if (rows[0].status !== 'pending') return 'Error: Permohonan sudah diproses';
  setRequestStatus(requestId, 'rejected', reviewer);
  return 'Permohonan ' + requestId + ' telah ditolak.';
}

function handleTelegramWebhook(e) {
  var props = PropertiesService.getScriptProperties();
  var allowedChat = String(props.getProperty('TELEGRAM_CHAT_ID') || '').trim();
  var payload = {};
  try { payload = JSON.parse(e.postData ? e.postData.contents : '{}'); } catch (err) { return 'Error: Telegram payload tidak sah'; }

  var callback = payload.callback_query;
  if (!callback) return 'ok';
  var chatId = callback.message && callback.message.chat ? String(callback.message.chat.id || '') : '';
  if (!allowedChat || chatId !== allowedChat) {
    answerTelegramCallback(callback.id, 'Kelulusan hanya dibenarkan dalam kumpulan admin.');
    return 'ok';
  }

  var data = String(callback.data || '');
  var separator = data.indexOf(':');
  var action = separator >= 0 ? data.slice(0, separator) : '';
  var requestId = separator >= 0 ? data.slice(separator + 1) : '';
  var result = '';
  if (action === 'approve') result = approveRequest(requestId, 'Telegram Admin ' + (callback.from && callback.from.id ? callback.from.id : ''));
  else if (action === 'reject') result = rejectRequest(requestId, 'Telegram Admin ' + (callback.from && callback.from.id ? callback.from.id : ''));
  else result = 'Error: Tindakan tidak dikenali';

  if (!String(result).startsWith('Error')) removeTelegramButtons(chatId, callback.message.message_id);
  answerTelegramCallback(callback.id, result);
  return 'ok';
}

function setupTelegramWebhook() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_TOKEN');
  if (!token) throw new Error('TELEGRAM_TOKEN belum ditetapkan dalam Script Properties');
  var url = ScriptApp.getService().getUrl();
  if (!url) throw new Error('Deploy Apps Script dahulu sebelum menetapkan webhook');

  var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/setWebhook', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ url: url, allowed_updates: ['callback_query'] }),
    muteHttpExceptions: true
  });
  var result = JSON.parse(response.getContentText());
  console.log('Telegram webhook: ' + (result.description || response.getContentText()));
  return result;
}

function isTelegramGroupMember(chatId, userId) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_TOKEN');
  if (!token || !chatId || !userId) return false;
  try {
    var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getChatMember', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, user_id: userId }),
      muteHttpExceptions: true
    });
    var result = JSON.parse(response.getContentText());
    if (!result.ok || !result.result) return false;
    var status = result.result.status;
    return status === 'creator' || status === 'administrator' || status === 'member' || status === 'restricted';
  } catch (err) {
    console.log('isTelegramGroupMember error: ' + err.message);
    return false;
  }
}
