let isPicking = false;
let highlightBox = null;

// --- HIGHLIGHTER ---
function createHighlightBox() {
    if (!highlightBox) {
        highlightBox = document.createElement('div');
        Object.assign(highlightBox.style, {
            position: 'absolute',
            border: '2px solid #e74c3c',
            background: 'rgba(231, 76, 60, 0.2)',
            zIndex: '2147483647',
            pointerEvents: 'none', // Tıklamayı engelleme, altındaki elemente geçsin
            transition: 'all 0.1s ease'
        });
        document.body.appendChild(highlightBox);
    }
}

function removeHighlightBox() {
    if (highlightBox) {
        highlightBox.remove();
        highlightBox = null;
    }
}

function moveHighlight(el) {
    if (!highlightBox) createHighlightBox();
    const rect = el.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    highlightBox.style.top = (rect.top + scrollTop) + 'px';
    highlightBox.style.left = (rect.left + scrollLeft) + 'px';
    highlightBox.style.width = rect.width + 'px';
    highlightBox.style.height = rect.height + 'px';
}

// --- EVENTS ---

document.addEventListener('mouseover', (e) => {
    if (!isPicking) return;
    moveHighlight(e.target);
}, true);

document.addEventListener('click', (e) => {
    if (!isPicking) return;
    
    // Tıklama olayını durdur, sayfadaki buton çalışmasın
    e.preventDefault();
    e.stopPropagation();

    // Shadow DOM desteği için composedPath kullanıyoruz
    const path = e.composedPath();
    const target = path[0]; // Gerçek tıklanan element (Shadow içindeyse bile)

    const locators = generateSmartLocators(target);

    // Popup'a gönder
    chrome.runtime.sendMessage({
        action: "locatorsFound",
        locators: locators
    });

    // Seçim modunu kapat (isteğe bağlı)
    // isPicking = false; 
    // removeHighlightBox();
}, true);


// --- MESSAGING ---
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "togglePicker") {
        isPicking = msg.state;
        if (!isPicking) removeHighlightBox();
    }
});


// --- ALGORİTMA: THE BRAIN 🧠 ---

function generateSmartLocators(el) {
    const list = [];
    const add = (score, type, value) => {
        if (!list.find(x => x.value === value)) list.push({ score, type, value });
    };

    const tagName = el.tagName.toLowerCase();
    const text = el.textContent ? el.textContent.trim() : "";

    // 1. DATA TEST ID (Altın Standart)
    const testAttrs = ["data-testid", "data-cy", "data-test", "qa-id", "data-automation"];
    for (const attr of el.attributes) {
        if (testAttrs.includes(attr.name)) {
            add(100, "Test Attribute", `[${attr.name}="${attr.value}"]`);
            add(99, "Cypress", `cy.get('[${attr.name}="${attr.value}"]')`);
        }
    }

    // 2. AKILLI ID KONTROLÜ (Dinamik ID'leri eleme)
    if (el.id) {
        // İçinde ardışık 3 rakam veya çok uzun rastgele string varsa dinamik say
        const isDynamic = /\d{3,}/.test(el.id) || el.id.length > 20;
        if (!isDynamic) {
            add(95, "Stabil ID", `#${el.id}`);
            add(90, "Playwright", `page.locator('#${el.id}')`);
        }
    }

    // 3. TEXT BAZLI (Kısa metinler için güvenli)
    if (text.length > 0 && text.length < 40) {
        // Sadece belirli elementlerde text araması yap
        if (["button", "a", "h1", "h2", "span", "div", "label"].includes(tagName)) {
            add(88, "Text XPath", `//*[normalize-space()='${text}']`);
            add(89, "Playwright Text", `page.getByText('${text}')`);
        }
    }

    // 4. RELATIVE XPATH (En büyük farkın burada)
    // Eğer element bir input ise, yakındaki label'ı bulup ona göre path çıkar
    if (["input", "textarea", "select"].includes(tagName)) {
        // Label "for" attribute kontrolü
        if (el.id) {
            const label = document.querySelector(`label[for="${el.id}"]`);
            if (label) {
                const labelText = label.innerText.trim();
                add(92, "Label-Anchored", `//label[text()='${labelText}']/following-sibling::${tagName}`);
                add(93, "Playwright Label", `page.getByLabel('${labelText}')`);
            }
        }
        
        // Placeholder kontrolü
        if (el.placeholder) {
            add(85, "Placeholder", `//${tagName}[@placeholder='${el.placeholder}']`);
            add(86, "Playwright Placeholder", `page.getByPlaceholder('${el.placeholder}')`);
        }
    }

    // 5. STABİL CLASS BULUCU
    if (el.classList.length > 0) {
        // Rakam içermeyen, "active" "hover" gibi durum bildirmeyen classları al
        const validClasses = [...el.classList].filter(c => 
            !/\d/.test(c) && !['active', 'focus', 'hover', 'visible'].includes(c)
        );
        if (validClasses.length > 0) {
            add(70, "CSS Class", `.${validClasses.join('.')}`);
        }
    }

    // 6. FALLBACK (Tam Yol)
    add(10, "Absolute XPath", getAbsoluteXPath(el));

    return list.sort((a, b) => b.score - a.score).slice(0, 8);
}

function getAbsoluteXPath(element) {
    if (element.tagName.toLowerCase() === 'html') return '/html[1]';
    if (element === document.body) return '/html[1]/body[1]';

    let ix = 0;
    const siblings = element.parentNode ? element.parentNode.childNodes : [];
    
    for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (sibling === element) {
            return getAbsoluteXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
        }
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            ix++;
        }
    }
    return ''; // Hata durumu
}