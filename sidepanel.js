let currentFramework = "selenium-pf"; // Varsayılan olarak Page Factory seçili gelsin

const toggle = document.getElementById("toggle-picker");
const statusText = document.getElementById("status-text");
const frameworkSelect = document.getElementById("framework-select");
const resultsDiv = document.getElementById("results-container");
const notification = document.getElementById("notification");
const closeBtn = document.getElementById("close-btn");

// *** YENİ EKLEME: PANEL AÇILDIĞINDA DURUMU KAYDET ***
// Sidepanel yüklendiğinde (yani panel açıldığında) true olarak ayarla.
chrome.storage.local.set({ isPickingActive: true });

// 1. KAPANMA BUTONU (Sizin eklediğiniz) - GÜNCELLENDİ
closeBtn.addEventListener("click", () => {
  // Çarpı butonuna basınca toggle'ı pasifleştir.
  if (toggle.checked) {
    toggle.checked = false;
    statusText.textContent = "Seçim Kapalı";
    statusText.style.color = "#888";
  }
  
  // Storage'ı manuel olarak kapat
  chrome.storage.local.set({ isPickingActive: false }); 

  sendMsg("stopPicking"); // Content Script'e Seçim modunu kapatma emri gönder
  window.close();         // Yan paneli kapat
});

// 2. TOGGLE DEĞİŞİMİ
toggle.addEventListener("change", () => {
  const isOn = toggle.checked;
  statusText.textContent = isOn ? "Seçim Modu: AÇIK" : "Seçim Kapalı";
  statusText.style.color = isOn ? "#2ecc71" : "#888";
  
  sendMsg(isOn ? "startPicking" : "stopPicking");
});

// 3. FRAMEWORK DEĞİŞİMİ
frameworkSelect.addEventListener("change", (e) => {
  currentFramework = e.target.value;
  // Not: Anlık güncelleme için sonuçları yeniden render etmek gerekir,
  // şimdilik yeni seçimde geçerli olacak.
});

// 4. SONUÇLARI AL
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "locatorFound") {
    renderResults(msg.locators);
  }
});

// *** YENİ EKLEME: TARAYICI ÇERÇEVESİNDEN KAPATMA (pagehide) ***
// Bu, tarayıcının kendi çarpı butonu ile kapatıldığında dahi modu kapatmayı garanti eder.
window.addEventListener('pagehide', () => {
  // *** PANEL KAPANDIĞINDA DURUMU FALSE OLARAK KAYDET ***
  chrome.storage.local.set({ isPickingActive: false }); 

  // Eğer seçim modu açıksa, temizlik mesajını gönder.
  if (toggle.checked) {
    sendMsg("stopPicking");
  }
});

// --- FONKSİYONLAR ---

function sendMsg(action) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      // Hata yakalama bloğu kaldırıldı (sessiz hata yönetimi).
      chrome.tabs.sendMessage(tabs[0].id, { action: action }).catch(() => {
        // Hata durumunda (panel kapalıysa) kullanıcıya uyarı göstermiyoruz.
      });
    }
  });
}

function renderResults(locators) {
  resultsDiv.innerHTML = "";
  
  locators.forEach(loc => {
    const formattedCode = formatCode(loc);
    
    // Güven rengi
    let scoreClass = "score-low";
    if (loc.score >= 90) scoreClass = "score-high";
    else if (loc.score >= 60) scoreClass = "score-mid";

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="card-header">
        <span>${loc.type}</span>
        <span class="${scoreClass}">%${loc.score} Güven</span>
      </div>
      <div class="code-box" title="Kopyalamak için tıkla">${formattedCode}</div>
    `;

    div.querySelector(".code-box").addEventListener("click", () => {
      navigator.clipboard.writeText(formattedCode);
      showNotification();
    });

    resultsDiv.appendChild(div);
  });
}

// --- PAGE FACTORY DESTEĞİ ---
function formatCode(loc) {
  const val = loc.value;
  const varName = loc.varName || "element";

  switch (currentFramework) {
    case "selenium-pf": // Page Factory (@FindBy)
      let strategy = "xpath";
      let actualVal = val;

      if (loc.type === "ID") {
        strategy = "id";
        actualVal = val.replace("#", ""); 
      } else if (loc.type === "Name") {
        strategy = "name";
        actualVal = val.replace('[name="', '').replace('"]', '');
      } else if (loc.type === "Class") {
        strategy = "css"; 
      } else if (loc.type === "Text") {
        strategy = "xpath";
        actualVal = `//*[normalize-space()='${val}']`;
      } else if (!val.startsWith("//") && !val.startsWith("(")) {
        strategy = "css";
      }

      // 'private' olarak güncellenmiş kod
      return `@FindBy(${strategy} = "${actualVal}")\n private WebElement ${varName};`;

    case "playwright":
      if (loc.type === "Text") return `await page.getByText('${val}').click();`;
      if (loc.type === "Test ID") return `await page.getByTestId('${val.replace(/[\[\]"]/g, '').split('=')[1]}').click();`;
      if (loc.type === "Placeholder") return `await page.getByPlaceholder('${val.replace(/\[placeholder="|"]/g, '')}').fill('...');`;
      return `await page.locator('${val}').click();`;

    case "cypress":
      if (loc.type === "Text") return `cy.contains('${val}').click();`;
      return `cy.get('${val}').should('be.visible');`;

    case "selenium": // Normal Selenium
      if (val.startsWith("//")) return `driver.findElement(By.xpath("${val}"));`;
      return `driver.findElement(By.cssSelector("${val}"));`;

    default: // Raw String
      return val;
  }
}

function showNotification() {
  notification.classList.add("show");
  setTimeout(() => notification.classList.remove("show"), 2000);
}