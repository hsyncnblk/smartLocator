// --- AYARLAR ---
let isPicking = false;
let highlightBox = null;

console.log("🚀 Locator Pro: Ajan Yüklendi!");

// *** YENİ EKLEME 1: İLK YÜKLEME KONTROLÜ ***
// Sayfa yüklendiğinde, saklama alanını kontrol et.
chrome.storage.local.get('isPickingActive', (data) => {
    // Panel açık değilse veya daha önce kapatılmışsa isPicking'i false yap.
    if (data.isPickingActive === false || data.isPickingActive === undefined) {
        isPicking = false; 
    }
});

// *** YENİ EKLEME 2: SAKLAMA DEĞİŞİKLİKLERİNİ DİNLEME ***
// Bu dinleyici, Panel kapandığında isPickingActive'in 'false' olmasını anında yakalar.
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.isPickingActive) {
        const isActive = changes.isPickingActive.newValue;
        if (isActive === false) {
            stopPickingMode(); // Seçim modunu kapat
        }
    }
});


// --- MESAJLARI DİNLE (Sidepanel'den gelen emirler) ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "startPicking") {
    isPicking = true;
    document.body.style.cursor = "crosshair";
    console.log("🎯 Seçim Modu: AÇIK");
  } 
  else if (msg.action === "stopPicking") {
    stopPickingMode();
  }
});

function stopPickingMode() {
  isPicking = false;
  document.body.style.cursor = "default";
  removeHighlight();
  console.log("🛑 Seçim Modu: KAPALI");
}

// --- MOUSE EVENTS ---
document.addEventListener("mousemove", (e) => {
  if (!isPicking) return; // isPicking false ise (panel kapalıysa) buradan döner.
  highlight(e.target);
}, true);

document.addEventListener("click", (e) => {
  if (!isPicking) return; // isPicking false ise (panel kapalıysa) buradan döner.

  e.preventDefault();
  e.stopPropagation();

  // Akıllı Hedefleme: Eğer kullanıcı ikona (SVG, PATH, SPAN) tıkladıysa,
  // ve bu bir Buton veya Link içindeyse, üstteki elementi al.
  let target = e.target;
  const interactiveTags = ["button", "a", "input", "select", "textarea"];
  
  // Tıklanan element interaktif değilse yukarı tırman (max 3 seviye)
  let parent = target.parentElement;
  let depth = 0;
  while (parent && depth < 3) {
    const tag = parent.tagName.toLowerCase();
    if (interactiveTags.includes(tag) || parent.getAttribute("role") === "button") {
        target = parent;
        break;
    }
    parent = parent.parentElement;
    depth++;
  }

  console.log("✅ Seçilen Element:", target);

  // Locatorları Üret
  const locators = generateSmartLocators(target);

  // Panele Gönder
  chrome.runtime.sendMessage({
    action: "locatorFound",
    locators: locators
  }).catch(err => console.log("Panel kapalı olabilir:", err));

  // Seçimi durdurma (Kullanıcı seri seçim yapabilsin diye açık bırakıyoruz, 
  // kapatmak istersen alttaki satırı aç)
  // stopPickingMode();
  
  // Görsel Geri Bildirim (Yeşil Yanıp Sönme)
  flashHighlight(target);

}, true);

// --- HIGHLIGHTER (GÖRSEL EFEKT) ---
function highlight(el) {
  if (!highlightBox) {
    highlightBox = document.createElement("div");
    Object.assign(highlightBox.style, {
      position: "fixed",
      border: "2px solid #3498db",
      background: "rgba(52, 152, 219, 0.2)",
      zIndex: "9999999",
      pointerEvents: "none",
      borderRadius: "4px",
      transition: "all 0.1s ease"
    });
    document.body.appendChild(highlightBox);
  }
  const rect = el.getBoundingClientRect();
  highlightBox.style.top = rect.top + "px";
  highlightBox.style.left = rect.left + "px";
  highlightBox.style.width = rect.width + "px";
  highlightBox.style.height = rect.height + "px";
}

function removeHighlight() {
  if (highlightBox) {
    highlightBox.remove();
    highlightBox = null;
  }
}

function flashHighlight(el) {
    if(!highlightBox) return;
    highlightBox.style.border = "2px solid #2ecc71"; // Yeşil
    highlightBox.style.background = "rgba(46, 204, 113, 0.3)";
    setTimeout(() => {
        if(isPicking) {
            highlightBox.style.border = "2px solid #3498db"; // Maviye dön
            highlightBox.style.background = "rgba(52, 152, 219, 0.2)";
        } else {
            removeHighlight();
        }
    }, 500);
}

// --- 🧠 AKILLI ALGORİTMA ---
function generateSmartLocators(el) {
  const list = [];
  const add = (score, type, value, varName) => {
    // Aynı locator tekrar etmesin
    if (!list.find(x => x.value === value)) {
        list.push({ score, type, value, varName });
    }
  };

  const tag = el.tagName.toLowerCase();
  const rawText = el.textContent ? el.textContent.trim() : "";
  const cleanText = rawText.replace(/\s+/g, " ").substring(0, 30);
  
  // Değişken İsmi Türetici (Giriş Yap -> girisYapBtn)
  let baseVar = "element";
  if (el.getAttribute("data-testid")) baseVar = el.getAttribute("data-testid");
  else if (el.id && !/\d/.test(el.id)) baseVar = el.id;
  else if (cleanText.length > 0) baseVar = cleanText;
  
  // Türkçe karakter ve boşluk temizliği
  baseVar = baseVar.replace(/[^a-zA-Z0-9]/g, "");
  if (baseVar.length === 0) baseVar = tag;
  baseVar = baseVar.charAt(0).toLowerCase() + baseVar.slice(1); // camelCase başla

  // 1. DATA TEST ID (En Güvenilir - %100)
  const testAttrs = ["data-testid", "data-cy", "data-test", "data-automation-id"];
  testAttrs.forEach(attr => {
    if (el.hasAttribute(attr)) {
        add(100, "Test ID", `[${attr}="${el.getAttribute(attr)}"]`, baseVar);
    }
  });

  // 2. PLAYWRIGHT TEXT (Modern - %95)
  // Sadece buton, link ve label gibi elementlerde metin güvenilirdir.
  if (cleanText.length > 0 && ["button", "a", "label", "h1", "h2", "span", "div"].includes(tag)) {
      add(95, "Text", cleanText, baseVar);
  }

  // 3. ID (Güvenli mi? - %90)
  if (el.id) {
    // Sayı içeriyorsa (örn: input-2342) dinamik olabilir, kullanma!
    if (!/\d/.test(el.id)) {
        add(90, "ID", `#${el.id}`, baseVar);
    } else {
        // Dinamikse bile en sona düşük puanla ekle
        add(40, "Dynamic ID", `#${el.id}`, baseVar);
    }
  }

  // 4. PLACEHOLDER (%85)
  if (el.getAttribute("placeholder")) {
      add(85, "Placeholder", `[placeholder="${el.getAttribute("placeholder")}"]`, baseVar + "Input");
  }

  // 5. NAME (%80)
  if (el.name) {
      add(80, "Name", `[name="${el.name}"]`, el.name);
  }

  // 6. XPATH (Smart Relative - %70)
  // Eğer ID yoksa ama type varsa
  if (tag === "input" && el.type) {
      add(70, "Input Type", `input[type="${el.type}"]`, baseVar);
  }

  // 7. CLASS (Temiz - %60)
  if (el.classList.length > 0) {
      // Rakam içermeyen ve 'active', 'focus' gibi durum bildirmeyen classları al
      const validClasses = [...el.classList].filter(c => !/\d/.test(c) && !['active', 'focus', 'hover'].includes(c));
      if (validClasses.length > 0) {
          add(60, "Class", `.${validClasses.join(".")}`, baseVar);
      }
  }

  // 8. FULL XPATH (Son Çare - %50)
  add(50, "Abs XPath", getAbsoluteXPath(el), baseVar);

  return list.sort((a, b) => b.score - a.score);
}

function getAbsoluteXPath(element) {
    if (element.tagName.toLowerCase() === 'html') return '/html[1]';
    if (element === document.body) return '/html[1]/body[1]';
    let ix = 0;
    const siblings = element.parentNode ? element.parentNode.childNodes : [];
    for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (sibling === element) return getAbsoluteXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName) ix++;
    }
    return '';
}