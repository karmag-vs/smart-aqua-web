// Globální proměnná pro synchronizaci času s ESP32 (výchozí offset je 0)
let serverTimeOffset = 0;
// --- 1. PŘIPOJENÍ K MQTT BROKERU (přes zabezpečené WebSockets) ---
const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');

client.on('connect', () => {
    console.log('Připojeno k MQTT Brokeru z GitHubu');
    // Přihlásíme se k odběru tématu, kam ESP32 posílá data
    client.subscribe('smart_aqua_cs/data/vystup', (err) => {
        if (!err) {
            console.log('Úspěšně přihlášeno k odběru tématu smart_aqua_cs/data/vystup');
            // Teprve po úspěšném přihlášení si poprvé vyžádáme data
			loadSystemInfo();
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
			updateElement("feedStat", data.feedStat);
			const flagFeeder = data.feedStat;
			updateElement("fertStat", data.fertStat);
			const flagFert = data.fertStat;
			// Ikona krmítka (Feeder)
			if (data.feedStat !== undefined) {
				const feederIcon = document.getElementById("feederIcon");
				if (feederIcon) {
					// Nejdříve odebereme všechny stavové třídy
					feederIcon.classList.remove("feeder-offline", "feeder-error", 
												"feeder-active", "feeder-empty");
					if (!(flagFeeder & (1 << 7))) {				// Bit 7: Povolení
						feederIcon.classList.add("feeder-offline");
						feederIcon.title = "Krmítko: Offline (odpojeno)";
					} else {
						if ((flagFeeder & (1 << 0)) !== 0) {	// Bit 0: krmitko online = 1
							if (!(flagFeeder & (1 << 6))) {		// Bit 6: krmitko prazdne = 1
								feederIcon.classList.add("feeder-active");
								feederIcon.title = "Krmítko: Online";
							} else {    
								feederIcon.classList.add("feeder-empty");
								feederIcon.title = "Krmítko: Prázdné";
							}
						} else {
							feederIcon.classList.add("feeder-error");
							feederIcon.title = "Krmítko: Online (POZOR: Žádná dávka není povolena!)";
						}
					}
				}
			}
				
            // Davkovani hnojiva (Fertilizer) - ikona
			if (data.fertStat !== undefined) {
				const fertIcon = document.getElementById("fertIcon");
				if (fertIcon) {
					fertIcon.classList.remove("feeder-offline", "feeder-error", 
												"feeder-active", "feeder-empty");
					if (!(flagFert & (1 << 7))) {				// Bit 7: 0 = offline (seda)		
						fertIcon.classList.add("feeder-offline");
						fertIcon.title = "Fertilizer: Offline";
						//fertIcon.style.opacity = "1";
					} else {
						if (!(flagFert & (1 << 6))) {			// Bit 6: prazna lahev
							fertIcon.classList.add("feeder-active");
							fertIcon.title = "Fertilizer: Online";
							//fertIcon.style.opacity = "0.4";
						} else {    
							fertIcon.classList.add("feeder-empty");
							fertIcon.title = "Fertilizer: Prázdné";
						}	
					}
				}
			}
			updateLedStatus(1, data.ledMode1, data.AVled1);  	// LED - STATUS
            updateLedStatus(2, data.ledMode2, data.AVled2);
			if (data.statusPH !== undefined) {                  			// BARVY pro auto/rucne zav/rucne-vyp
				const val = parseInt(data.statusPH);
				lastStatus.phMode = val; // Uložíme pro potřeby modálu
				
				const badge = document.getElementById("statusPH");
				if (badge) {
					badge.classList.remove('status-vyp', 'status-man', 'status-auto'); // reset tříd
					const classes = ['status-vyp', 'status-man', 'status-auto', 'status-auto'];
					const texts = ['VYP', 'ZAP', 'A-VYP', 'A-ZAP'];
					
					badge.innerText = texts[val] || '--';
					if (classes[val]) badge.classList.add(classes[val]);
					
					if (val === 3) {
						badge.style.backgroundColor = "#2ecc71"; 	// Zelená - automat ON
					} else if (val === 2) {
						badge.style.backgroundColor = "#3498db"; 	// Modrá - automat OFF
					} else {
						badge.style.backgroundColor = "";        	// podle CSS 
					}
				}
                //updatePhModalButtons(val);			// Aktualizace tlačítek v modálu (pokud je otevřený)
            }
			
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
    } else {
        console.warn("Nelze vyžádat systémové info, MQTT klient není připojen.");
    }
}
// VOLANI FUNKCI
window.addEventListener('load', () => {
    createNavbar(); // hlavička stránky + menu
    createFooter(); // patička
    //loadSystemInfo();
    setInterval(updateClock, 1000);
});
// HODINY
function updateClock() {
    const dateEl = document.getElementById('header-date');
    const timeEl = document.getElementById('header-time');
    if (!dateEl || !timeEl) return;

    // Vypočítáme aktuální čas v ESP32 na základě offsetu (synchronizovaného v refreshAllData)
    const offset = (typeof serverTimeOffset !== 'undefined') ? serverTimeOffset : 0;
    const now = new Date(Date.now() + offset);
    
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
// STATUS LED, CO2
function updateLedStatus(num, mode, power) {
    const badge = document.getElementById(`statusLed${num}`);
    if (!badge) return;

    // 1. Vyčištění starých stylů
    badge.classList.remove('status-vyp', 'status-man', 'status-auto');
    badge.style.backgroundColor = ""; 

    let text = "--";
    let className = "";
    let bgColor = "";

    // 2. Logika pro určení stavu
    if (mode == 0) {
        text = "VYP";
        className = "status-vyp";
    } else if (mode == 1) {
        text = "RUČNĚ";
        className = "status-man";
    } else if (mode == 2) {
        // Režim AUTOMAT - rozhodujeme podle výkonu (power)
        className = "status-auto";
        if (Number(power) > 0) {
            text = "A-ZAP";
            bgColor = "#2ecc71"; // Zelená (stejná jako u PH)
        } else {
            text = "A-VYP";
            bgColor = "#3498db"; // Modrá (stejná jako u PH)
        }
    }

    // 3. Aplikace textu a barev na badge
    badge.innerText = text;
    if (className) badge.classList.add(className);
    if (bgColor) badge.style.backgroundColor = bgColor;

    // 4. Update tlačítek v MODÁLU (pokud je otevřený pro tuto LED)
    const modal = document.getElementById("controlModal");
    const slider = document.getElementById("controlSlider");
    
    if (modal && modal.style.display === "block" && slider) {
        const currentOpenedLed = slider.getAttribute("data-led-num");
        if (currentOpenedLed == num) {
            // Reset aktivních tříd na tlačítkách v modálu
            document.querySelectorAll('#controlModal .mode-btn').forEach(btn => {
                btn.classList.remove('active-vyp', 'active-man', 'active-auto');
            });
            
            // Aktivace správného tlačítka (v modálu jsou jen 0, 1, 2)
            const activeBtn = document.getElementById(`btnMode${mode}`);
            if (activeBtn) {
                const activeClasses = ['active-vyp', 'active-man', 'active-auto'];
                activeBtn.classList.add(activeClasses[mode]);
            }
        }
    }
}
