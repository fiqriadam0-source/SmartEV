function checkStockAlert() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");
  var data = sheet.getDataRange().getValues();

  var message = "⚠️ STOK RENDAH:\n\n";
  var alert = false;

  for (var i = 1; i < data.length; i++) {

    var bahan = data[i][0];        // Column A
    var stok_awal = data[i][1];    // Column B
    var digunakan = data[i][2];    // Column C
    var baki = data[i][3];         // Column D
    var minimum = data[i][4];      // Column E
    // auto kira baki kalau kosong
    if (!baki) {
      baki = stok_awal - digunakan;
      sheet.getRange(i + 1, 4).setValue(baki);
    }

    // check stok rendah
    if (baki <= minimum) {
      message += "🔴 " + bahan + "\n";
      message += "Baki: " + baki + " | Min: " + minimum + "\n\n";

      // highlight merah
      sheet.getRange(i + 1, 4).setBackground("#ff4d4d");

      alert = true;
    } else {
      // reset warna kalau ok
      sheet.getRange(i + 1, 4).setBackground("#ffffff");
    }
  }

  // hantar telegram kalau ada alert
  if (alert) {
    sendTelegram(message);
  }
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
  getStock: 'staff', getUsageHistory: 'staff', usage: 'staff', addItem: 'admin',
  restock: 'admin', telegram: 'admin'
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

  if (e.parameter.action === "getSpecsByMaterial") {
    var material = (e.parameter.material || "").trim();
    var materialInfo = splitMaterialLabel(material);
    var materialName = materialInfo.material || material;
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
      var rowSpec = String(data[i][6] || "").trim();

      if (rowMaterial.toLowerCase() === materialName.toLowerCase() && rowSpec) {
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
      var rowSize = String(data[i][5] || "").trim();
      var rowSpec = String(data[i][6] || "").trim();
      var sameMaterial = rowMaterial.toLowerCase() === materialName.toLowerCase();
      var sameSpec = !targetSpec || !rowSpec || rowSpec.toLowerCase() === targetSpec.toLowerCase();

      if (sameMaterial && rowSize && sameSpec) {
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

    if (!materialName) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Material tidak dinyatakan" }))
               .setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");
    const data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      var rowMaterial = String(data[i][0] || "").trim();
      var rowSize = String(data[i][5] || "").trim();
      var rowSpec = String(data[i][6] || "").trim();
      var sameName = rowMaterial.toLowerCase() === materialName.toLowerCase();
      var sameSize = !targetSize || !rowSize || rowSize.toLowerCase() === targetSize.toLowerCase();
      var sameSpec = !targetSpec || !rowSpec || rowSpec.toLowerCase() === targetSpec.toLowerCase();

      if (sameName && sameSize && sameSpec) {
        return ContentService.createTextOutput(JSON.stringify({
          material: rowMaterial,
          baki: data[i][3],
          minimum: data[i][4],
          saiz: rowSize,
          spesifikasi: rowSpec
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

      history.push({
        timestamp : data[i][0] ? new Date(data[i][0]).toLocaleString('ms-MY') : "",
        nama      : data[i][1],
        material  : materialInfo.material || materialLabel,
        kuantiti  : data[i][3],
        unit      : data[i][4],
        tujuan    : data[i][5],
        saiz      : rowSize,
        spesifikasi: rowSpec
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
      var baki = Number(data[i][3]) || 0;
      var minimum = Number(data[i][4]) || 0;
      var key = (materialName + "::" + size + "::" + spesifikasi).toLowerCase();

      if (!stockMap[key]) {
        stockMap[key] = {
          material: materialName,
          spesifikasi: spesifikasi,
          saiz: size,
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
    var type = e.parameter.type || "";
    var access_token = (e.parameter && e.parameter.access_token) || '';
    var authMode = getScriptProp('AUTH_MODE') || 'off';
    var caller = null;
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

    // ==================== ADD ITEM ====================
    if (type === "addItem") {
      var material = (e.parameter.material || "").trim();
      var spesifikasi = (e.parameter.spesifikasi || "").trim();
      var saiz = (e.parameter.saiz || "").trim();
      var stokAwal = Number(e.parameter.stokAwal) || 0;
      var minimum = Number(e.parameter.minimum) || 0;

      if (authMode !== 'off' && !checkActionAllowed('addItem', caller)) {
        return ContentService.createTextOutput('Error: FORBIDDEN');
      }

      if (!material) {
        return ContentService.createTextOutput("Error: Nama bahan diperlukan");
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
        var rowSize = String(data[i][5] || "").trim();
        var rowSpec = String(data[i][6] || "").trim();
        var sameName = rowMaterial.toLowerCase() === materialName.toLowerCase();
        var sameSize = !targetSize || !rowSize || rowSize.toLowerCase() === targetSize.toLowerCase();
        var sameSpec = !targetSpec || !rowSpec || rowSpec.toLowerCase() === targetSpec.toLowerCase();

        if (sameName && sameSize && sameSpec) {
          return ContentService.createTextOutput("Error: Item dengan bahan, spesifikasi dan saiz yang sama sudah wujud");
        }
      }

      stockSheet.appendRow([materialName, stokAwal, 0, stokAwal, minimum, targetSize, targetSpec]);
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
        var rowSize = String(data[i][5] || "").trim();
        var rowSpec = String(data[i][6] || "").trim();
        var sameName = rowMaterial.toLowerCase() === materialName.toLowerCase();
        var sameSize = !targetSize || !rowSize || rowSize.toLowerCase() === targetSize.toLowerCase();

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
        sendTelegramRestock(materialName + (targetSize ? " (" + targetSize + ")" : "") + (spesifikasi ? " - " + spesifikasi : ""), kuantiti);

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
      var materialInfo = splitMaterialLabel(material);
      var materialName = materialInfo.material || material;
      var targetSize = itemSize || materialInfo.size || "";
      var targetSpec = spesifikasi || "";

      if (!material || kuantiti <= 0) {
        return ContentService.createTextOutput("Error: Data tidak lengkap untuk " + material);
      }

      var found = false;

      for (var i = 1; i < stockData.length; i++) {
        var rowMaterial = String(stockData[i][0] || "").trim();
        var rowSize = String(stockData[i][5] || "").trim();
        var rowSpec = String(stockData[i][6] || "").trim();
        var sameName = rowMaterial.toLowerCase() === materialName.toLowerCase();
        var sameSize = !targetSize || (rowSize && rowSize.toLowerCase() === targetSize.toLowerCase());
        var sameSpec = !targetSpec || !rowSpec || rowSpec.toLowerCase() === targetSpec.toLowerCase();

        if (sameName && sameSize && sameSpec) {

          var stokAwal     = Number(stockData[i][1]) || 0;
          var stokDigunakan = Number(stockData[i][2]) || 0;
          var baki         = Number(stockData[i][3]) || 0;

          if (baki <= 0) {
            sendTelegramOutOfStock(materialName + (targetSize ? " (" + targetSize + ")" : ""));
            return ContentService.createTextOutput(`❌ STOK TELAH HABIS!\nMaterial: ${materialName}${targetSize ? " | " + targetSize : ""}`);
          }

          if (kuantiti > baki) {
            sendTelegramAlert(materialName + (targetSize ? " (" + targetSize + ")" : ""), baki);
            return ContentService.createTextOutput(
              `❌ STOK TIDAK CUKUP!\nMaterial: ${materialName}${targetSize ? " | " + targetSize : ""}\nBaki: ${baki}\nDiminta: ${kuantiti}`
            );
          }

          stokDigunakan += kuantiti;
          baki = stokAwal - stokDigunakan;

          stockSheet.getRange(i + 1, 3).setValue(stokDigunakan);
          stockSheet.getRange(i + 1, 4).setValue(baki);

          usageSheet.appendRow([timestamp, nama, materialName, kuantiti, unit, tujuan, targetSize || "", targetSpec || ""]);

          if (baki <= 10 && baki > 0) {
            sendTelegramAlert(materialName + (targetSize ? " (" + targetSize + ")" : "") + (targetSpec ? " - " + targetSpec : ""), baki);
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

function sendTelegramUsage(nama, material, kuantiti, unit, tujuan, saiz) {
  var msg = "📦 Material Dipinjam\n" +
            "👤 Nama: " + nama + "\n" +
            "📦 Material: " + material + (saiz ? " (" + saiz + ")" : "") + "\n" +
            "🔢 Kuantiti: " + kuantiti +
            (unit ? " " + unit : "") + "\n" +
            "📍 Tujuan: " + tujuan;

  try {
    sendTelegram(msg);
  } catch(err) {
    Logger.log("Telegram usage error: " + err);
  }
}

function sendTelegramAlert(material, baki) {
  var msg = "⚠️ STOCK RENDAH\nMaterial: " + material + "\nBaki Tinggal: " + baki;

  try {
    sendTelegram(msg);
  } catch(err) {
    Logger.log("Telegram alert error: " + err);
  }
}

function sendTelegramOutOfStock(material) {
  var msg = "❌ STOCK HABIS\nMaterial: " + material;

  try {
    sendTelegram(msg);
  } catch(err) {
    Logger.log("Telegram out-of-stock error: " + err);
  }
}

function sendTelegramRestock(material, kuantiti) {
  var msg = "🔄 RESTOCK BARANG\nMaterial: " + material + "\nKuantiti Tambah: " + kuantiti;

  try {
    sendTelegram(msg);
  } catch(err) {
    Logger.log("Telegram restock error: " + err);
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
  var msg = "📦 **Material Dipinjam (Multi)**\n" +
            "👤 Nama: " + nama + "\n" +
            "📍 Tujuan: " + tujuan + "\n\n" +
            "📋 Senarai Barang:\n";

  items.forEach(function(item) {
    var unitText = item.unit ? " " + item.unit : "";
    var sizeText = item.saiz ? " (" + item.saiz + ")" : "";
    msg += "• " + item.material + sizeText + " → " + item.kuantiti + unitText + "\n";
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
