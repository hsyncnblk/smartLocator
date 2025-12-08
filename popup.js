document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle-picker');
    const statusText = document.getElementById('status-text');
    const container = document.getElementById('results-container');
    const instruction = document.getElementById('instruction');
  
    // Popup açıldığında durumu kontrol et (Storage'dan alabilirsin, şimdilik basit tutuyoruz)
    
    toggle.addEventListener('change', () => {
      const isScanning = toggle.checked;
      statusText.textContent = isScanning ? "Seçim Açık" : "Seçim Kapalı";
      
      // Content script'e emir ver
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if(tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "togglePicker",
                state: isScanning
            });
        }
      });

      if(!isScanning) {
          instruction.style.display = "block";
          container.innerHTML = "";
      }
    });
  
    // Content Script'ten gelen mesajları dinle
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === "locatorsFound") {
        renderLocators(msg.locators);
        // Otomatik olarak kapama isteğe bağlı, şimdilik açık kalsın
        instruction.style.display = "none";
      }
    });
  
    function renderLocators(locators) {
      container.innerHTML = "";
      locators.forEach(loc => {
        const div = document.createElement("div");
        div.className = "locator-item";
        div.innerHTML = `
          <span class="locator-type">${loc.type}</span>
          <span class="locator-score">Güven: %${loc.score}</span>
          <div class="locator-code" title="Kopyalamak için tıkla">${loc.value}</div>
          <div class="copy-tooltip">Kopyalandı!</div>
        `;
        
        const codeBlock = div.querySelector('.locator-code');
        codeBlock.addEventListener('click', () => {
           navigator.clipboard.writeText(loc.value);
           const tooltip = div.querySelector('.copy-tooltip');
           tooltip.style.display = 'block';
           setTimeout(() => tooltip.style.display = 'none', 1000);
        });
  
        container.appendChild(div);
      });
    }
  });