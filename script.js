// --- 1. PŘIPOJENÍ K MQTT BROKERU (přes zabezpečené WebSockets) ---
const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');

client.on('connect', () => {
    console.log('Připojeno k MQTT Brokeru z GitHubu');
    // Přihlásíme se k odběru tématu, kam ESP32 posílá data
    client.subscribe('smart_aqua_cs/data/vystup', (err) => {
        if (!err) {
            console.log('Úspěšně přihlášeno k odběru tématu smart_aqua_cs/data/vystup');
            // Teprve po úspěšném přihlášení si poprvé vyžádáme data
            client.publish('smart_aqua_cs/data/pozadavek', 'updateAll');
        } else {
            console.error('Chyba při přihlášení k odběru:', err);
        }
    });
});

// --- 2. PRAVIDELNÁ ŽÁDOST O DATA (Náhrada za původní setInterval) ---
// Každých 5 sekund pošleme do ESP32 žádost o nová data
setInterval(() => {
    if (client.connected) {
        client.publish('smart_aqua_cs/data/pozadavek', 'updateAll');
    }
}, 5000);

// --- 3. PŘÍJEM DAT Z ESP32 ---
client.on('message', (topic, payload) => {
    console.log("!!! DOŠLA MQTT ZPRÁVA !!! Téma:", topic);
    if (topic === 'smart_aqua_cs/data/vystup') {
        try {
            // OPRAVA: Přejmenováno z myObj na data, aby seděl zbytek kódu
            const data = JSON.parse(payload.toString());

			// --- KONTROLA: JDE O SYSTÉMOVÉ INFO? ---
            if (data.type === "sysInfo") {
                console.log("Přijato systémové info z ESP32:", data);
                
                // Uložíme do paměti prohlížeče
                sessionStorage.setItem('info-sw', data.sw_ver);
                sessionStorage.setItem('info-hw', data.hw_ver);
                
                // Vepíšeme do stránky
                if (document.getElementById('info-sw')) document.getElementById('info-sw').innerText = data.sw_ver;
                if (document.getElementById('info-hw')) document.getElementById('info-hw').innerText = data.hw_ver;
                
                return; // Ukončíme větev, abychom nepokračovali na běžná data akvária
            }
			
            console.log("Data z ESP32 úspěšně přijata:", data);

            // Nyní už proměnná 'data' existuje a vše poběží hladce
            updateElement("tempCover", data.tempCover , 1);
            updateElement("humCover", data.humCover , 0);
            updateElement("AVled1", data.AVled1);
            updateElement("SPled1", data.SPled1);
            updateElement("AVled2", data.AVled2);
            updateElement("SPled2", data.SPled2);
            updateElement("tempWater", data.tempWater , 1);
            updateElement("SPtempWater", data.SPtempWater , 1);
            updateElement("phWater", data.phWater , 1);
            updateElement("SPphWater", data.SPphWater , 1);
            updateElement("levelWater", data.levelWater , 1);
            updateElement("flowWater", data.flowWater , 1);
            updateElement("AVchanges", data.AVchgs , 1);
            
            let tmVal = Number(data.TMchgs);
            let tmDecimals = (tmVal < 10.0) ? 1 : 0;
            updateElement("TMchanges", data.TMchgs, tmDecimals);
            
            updateElement("ntpTime", data.ntpTime);
            updateElement("alarmNo", data.alarmNo);
            updateElement("dKH", data.dKH, 1);
            updateElement("co2W", data.co2W);
			if (data.datetime) {                                
                serverTimeOffset = (data.datetime * 1000) - Date.now(); // Spočítáme rozdíl mezi časem v prohlížeči a v ESP32
            }
        } catch (e) {
            console.error("Chyba při zpracování JSONu:", e);
        }
    }
});

function updateElement(id, value, decimals = 0, divider = 1) {
    var el = document.getElementById(id);
    if (el) {
        let displayValue;
        if (!isNaN(value) && value !== "" && value !== null) {
            let num = Number(value) / divider;
            displayValue = num.toFixed(decimals);
        } else {
            displayValue = value;
        }
        
        if (el.tagName === "INPUT") {
            el.value = displayValue;
        } else {
            el.innerText = displayValue;
        }
    }
}
// ZAHLAVI STRANKY
function createNavbar() {
    const placeholder = document.getElementById('nav-placeholder');
    if (!placeholder) return; // Pokud prvek neexistuje, ukonči funkci a nepokračuj
    const pageTitles = {
        "index.html": "AQUA CS",      // vloží se jako titulek stránky
        "LED1.html" : "LED 1",
        "LED2.html" : "LED 2",
        "TC.html"   : "TEPLOTA KRYT",
        "HC.html"   : "VLHKOST KRYT",        
        "TW.html"   : "TEPLOTA VODA",
        "PHCO2.html": "PH VODA - CO2",
        "WL.html"   : "HLADINA",
        "QF.html"   : "PRŮTOK",
        "note.html" : "DENÍK ÚDRŽBY",
        "settings.html": "NASTAVENÍ",
        "alarm.html": "PORUCHY",
        "feeder.html" : "KRMENÍ",
		"fertdoser.html" : "DÁVK.HNOJENÍ"
    };
    const currentFile = window.location.pathname.split("/").pop() || "index.html";
    const dynamicTitle = pageTitles[currentFile] || "SMART AQUA";

    const navHTML = `
    <div class="top-header">
        <div class="header-left-section">
            <div class="header-brand">
                <div class="header-status-icons">
                    <i id="feederIcon" class="fas fa-fish"></i>
                    <i id="fertIcon" class="fas fa-flask"></i> 
                </div>
                <div class="header-title">${dynamicTitle}</div>
            </div>
        </div>
        <div style="display: flex; align-items: center;">
            <div class="header-datetime">
                <div id="header-date" class="date-row">--.--.----</div>
                <div id="header-time" class="time-row">--:--:--</div>
            </div>
            <div class="header-home">
                <a href="index.html"><i class="fas fa-home"></i></a>
            </div>
        </div>    
    </div>
    `;
    placeholder.innerHTML = navHTML;
}
// ZAPATI STRANKY
function createFooter() {
    const placeholder = document.getElementById('footer-placeholder');
    if (!placeholder) return; // Pokud prvek neexistuje, ukonči funkci a nepokračuj
    
    const year = new Date().getFullYear();
    const footerHTML = `
    <footer class="main-footer">
        <div class="footer-content">
            <p>
                &copy; ${year} 
                <img src="aqua.svg" class="footer-logo" alt="logo">
                <strong>Smart Aqua CS</strong>&nbsp;&nbsp;Verze <span id="info-sw">---</span>
            <p>
            <p>
                <i class="fas fa-microchip"></i> <span id="info-hw">---</span>&nbsp;&nbsp;
                <i class="fas fa-code"></i> K2IR
            </p>
        </div>
    </footer>`;
    placeholder.innerHTML = footerHTML;
}
// SYSTEM INFO
function loadSystemInfo() {
    // Pokud už info máme v paměti prohlížeče, netrapme ESP32 dalším požadavkem
    const cachedSw = sessionStorage.getItem('info-sw');
    const cachedHw = sessionStorage.getItem('info-hw');

    if (cachedSw && cachedHw) {
        if (document.getElementById('info-sw')) document.getElementById('info-sw').innerText = cachedSw;
        if (document.getElementById('info-hw')) document.getElementById('info-hw').innerText = cachedHw;
        return;
    }
	// Pokud cache nemáme, požádáme ESP32 přes MQTT
    if (client && client.connected) {
        console.log("Žádám ESP32 o systémové informace přes MQTT...");
        // Pošleme požadavek do stejného tématu jako "updateAll", ale s jiným textem
        client.publish('smart_aqua_cs/data/pozadavek', 'getSystemInfo');
    }
}
// VOLANI FUNKCI
window.addEventListener('load', () => {
    createNavbar(); // hlavička stránky + menu
    createFooter(); // patička
    loadSystemInfo();
    setInterval(updateClock, 1000);
});
// HODINY
function updateClock() {
    const dateEl = document.getElementById('header-date');
    const timeEl = document.getElementById('header-time');
    if (!dateEl || !timeEl) return;

    // Vypočítáme aktuální čas v ESP32 na základě offsetu (synchronizovaného v refreshAllData)
    const now = new Date(Date.now() + serverTimeOffset);
    
    // Formát ČASU
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    
    // Formát DATUMU
    const DD = String(now.getDate()).padStart(2, '0');
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const YYYY = now.getFullYear();

    // Vložení do HTML
    dateEl.innerText = `${DD}.${MM}.${YYYY}`;
    timeEl.innerText = `${hh}:${mm}:${ss}`;
}
