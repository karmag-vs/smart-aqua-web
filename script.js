// Globální proměnné
let serverTimeOffset = 0; // Globální proměnná pro synchronizaci času s ESP32
let client = null;        // Klienta vytvoříme až po ověření hesla

// --- 1. PŘIHLAŠOVACÍ LOGIKA ---
function potvrditPrihlaseni() {
    const heslo = document.getElementById('input-password').value.trim();
    if (heslo) {
        sessionStorage.setItem('mqtt-heslo', heslo);
        document.getElementById('login-overlay').style.display = 'none';
        pripojitMQTT(heslo); // Spustíme připojení k brokeru
    }
}

// --- 2. ASYNCHRONNÍ PŘIPOJENÍ K MQTT BROKERU ---
function pripojitMQTT(heslo) {
    if (client) return; // Pojistka: pokud už klient existuje, podruhé ho nespouštíme

    client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');

    client.on('connect', () => {
        console.log('Připojeno k MQTT Brokeru s autorizovaným tématem.');
        
        // Sestavení dynamických témat obsahujících heslo
        const temaVystup = `smart_aqua_cs/${heslo}/vystup`;
        const temaPozadavek = `smart_aqua_cs/${heslo}/pozadavek`;

        client.subscribe(temaVystup, (err) => {
            if (!err) {
                console.log(`Úspěšně přihlášeno k odběru tématu: ${temaVystup}`);
                loadSystemInfo(); // Načtení systémových informací
                client.publish(temaPozadavek, 'updateAll'); // První vyžádání dat akvária
            } else {
                console.error('Chyba při přihlášení k odběru:', err);
            }
        });
    });

    // --- 3. PRAVIDELNÁ ŽÁDOST O DATA (Interval běží uvnitř připojení) ---
    setInterval(() => {
        if (client && client.connected) {
            const hesloAktualni = sessionStorage.getItem('mqtt-heslo');
            client.publish(`smart_aqua_cs/${hesloAktualni}/pozadavek`, 'updateAll');
        }
    }, 5000); // Každých 5 sekund žádost o nová data

    // --- 4. PŘÍJEM DAT Z ESP32 ---
    client.on('message', (topic, payload) => {
        const hesloAktualni = sessionStorage.getItem('mqtt-heslo');
        
        if (topic === `smart_aqua_cs/${hesloAktualni}/vystup`) {
            try {
                const data = JSON.parse(payload.toString());

                // --- KONTROLA: JDE O SYSTÉMOVÉ INFO? ---
                if (data.type === "sysInfo" || data.sw_ver !== undefined) {
                    console.log("Přijato systémové info z ESP32:", data);
                    
                    sessionStorage.setItem('info-sw', data.sw_ver);
                    sessionStorage.setItem('info-hw', data.hw_ver);
                    
                    if (document.getElementById('info-sw')) document.getElementById('info-sw').innerText = data.sw_ver;
                    if (document.getElementById('info-hw')) document.getElementById('info-hw').innerText = data.hw_ver;
                    
                    return; // Ukončíme větev, abychom nepokračovali na data parametrů
                }
                
                console.log("Data z ESP32 úspěšně přijata:", data);

                // Zápis hodnot do stránky
                updateElement("tempCover", data.tempCover, 1);
                updateElement("humCover", data.humCover, 0);
                updateElement("AVled1", data.AVled1);
                updateElement("SPled1", data.SPled1);
                updateElement("AVled2", data.AVled2);
                updateElement("SPled2", data.SPled2);
                updateElement("tempWater", data.tempWater, 1);
                updateElement("SPtempWater", data.SPtempWater, 1);
                updateElement("phWater", data.phWater, 1);
                updateElement("SPphWater", data.SPphWater, 1);
                updateElement("levelWater", data.levelWater, 1);
                updateElement("flowWater", data.flowWater, 1);
                updateElement("AVchanges", data.AVchgs, 1);
                
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
                        feederIcon.classList.remove("feeder-offline", "feeder-error", "feeder-active", "feeder-empty");
                        if (!(flagFeeder & (1 << 7))) { 
                            feederIcon.classList.add("feeder-offline");
                            feederIcon.title = "Krmítko: Offline (odpojeno)";
                        } else {
                            if ((flagFeeder & (1 << 0)) !== 0) { 
                                if (!(flagFeeder & (1 << 6))) { 
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
                    
                // Dávkování hnojiva (Fertilizer) - ikona
                if (data.fertStat !== undefined) {
                    const fertIcon = document.getElementById("fertIcon");
                    if (fertIcon) {
                        fertIcon.classList.remove("feeder-offline", "feeder-error", "feeder-active", "feeder-empty");
                        if (!(flagFert & (1 << 7))) { 
                            fertIcon.classList.add("feeder-offline");
                            fertIcon.title = "Fertilizer: Offline";
                        } else {
                            if (!(flagFert & (1 << 6))) { 
                                fertIcon.classList.add("feeder-active");
                                fertIcon.title = "Fertilizer: Online";
                            } else {    
                                fertIcon.classList.add("feeder-empty");
                                fertIcon.title = "Fertilizer: Prázdné";
                            }   
                        }
                    }
                }

                updateLedStatus(1, data.ledMode1, data.AVled1); 
                updateLedStatus(2, data.ledMode2, data.AVled2); 

                if (data.statusPH !== undefined) { 
                    const val = parseInt(data.statusPH);
                    const badge = document.getElementById("statusPH");
                    if (badge) {
                        badge.classList.remove('status-vyp', 'status-man', 'status-auto'); 
                        const classes = ['status-vyp', 'status-man', 'status-auto', 'status-auto'];
                        const texts = ['VYP', 'ZAP', 'A-VYP', 'A-ZAP'];
                        
                        badge.innerText = texts[val] || '--';
                        if (classes[val]) badge.classList.add(classes[val]);
                        
                        if (val === 3) {
                            badge.style.backgroundColor = "#2ecc71"; 
                        } else if (val === 2) {
                            badge.style.backgroundColor = "#3498db"; 
                        } else {
                            badge.style.backgroundColor = "";        
                        }
                    }
                }

                // ALARM    
                const icon = document.getElementById("alarmIcon"); 
                if (icon) {
                    if (Number(data.alarmNo) > 0) {
                        icon.style.color = "red"; 
                        icon.classList.add("fa-blink"); 
                    } else {
                        icon.style.color = "Grey";
                        icon.classList.remove("fa-blink");
                    }
                }
                
                if (data.datetime) {                                 
                    serverTimeOffset = (data.datetime * 1000) - Date.now(); 
                }
            } catch (e) {
                console.error("Chyba při zpracování JSONu:", e);
            }
        }
    });
}

// --- 5. POMOCNÉ FUNKCE PRO HTML ---
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
    if (!placeholder) return; 
    
    const pageTitles = {
        "index.html": "AQUARIUM CS",      
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

    // Zjistíme, zda už je heslo v paměti prohlížeče z této relace
    const ulozeno = sessionStorage.getItem('mqtt-heslo');
    const displayStyle = ulozeno ? 'none' : 'flex';

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

    <div id="login-overlay" style="display: ${displayStyle}; position: fixed; top:0; left:0; width:100vw; height:100vh; background: #1a1a1a; z-index: 9999; justify-content: center; align-items: center; flex-direction: column; font-family: sans-serif; color: white;">
        <div style="background: #2a2a2a; padding: 30px; border-radius: 8px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.5); width: 280px;">
            <h3 style="margin-top: 0; color: #2ecc71; font-size: 20px;"><i class="fas fa-lock"></i> Smart Aqua CS</h3>
            <p style="color: #bbb; font-size: 14px; margin-bottom: 15px;">Zadejte přístupové heslo:</p>
            <input type="password" id="input-password" style="padding: 10px; width: 100%; box-sizing: border-box; border: none; border-radius: 4px; margin-bottom: 20px; text-align: center; font-size: 16px; background: #444; color: white;">
            <br>
            <button onclick="potvrditPrihlaseni()" style="padding: 10px 25px; width: 100%; background: #2ecc71; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 15px;">Vstoupit</button>
        </div>
    </div>
    `;
    placeholder.innerHTML = navHTML;
}

// ZAPATI STRANKY
function createFooter() {
    const placeholder = document.getElementById('footer-placeholder');
    if (!placeholder) return; 
    
    const year = new Date().getFullYear();
    const footerHTML = `
    <footer class="main-footer">
        <div class="footer-content">
            <p>
                &copy; ${year} 
                <img src="aqua.svg" class="footer-logo" alt="logo">
                <strong>Aqua CS</strong>&nbsp;&nbsp;Verze <span id="info-sw">---</span>
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
    const cachedSw = sessionStorage.getItem('info-sw');
    const cachedHw = sessionStorage.getItem('info-hw');

    if (cachedSw && cachedHw) {
        if (document.getElementById('info-sw')) document.getElementById('info-sw').innerText = cachedSw;
        if (document.getElementById('info-hw')) document.getElementById('info-hw').innerText = cachedHw;
        return;
    }

    const heslo = sessionStorage.getItem('mqtt-heslo');
    if (client && client.connected && heslo) {
        console.log("Žádám ESP32 o systémové informace přes MQTT...");
        client.publish(`smart_aqua_cs/${heslo}/pozadavek`, 'getSystemInfo');
    } else {
        console.warn("Nelze vyžádat systémové info, MQTT klient není připojen nebo chybí token.");
    }
}

// HODINY
function updateClock() {
    const dateEl = document.getElementById('header-date');
    const timeEl = document.getElementById('header-time');
    if (!dateEl || !timeEl) return;

    const offset = (typeof serverTimeOffset !== 'undefined') ? serverTimeOffset : 0;
    const now = new Date(Date.now() + offset);
    
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    
    const DD = String(now.getDate()).padStart(2, '0');
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const YYYY = now.getFullYear();

    dateEl.innerText = `${DD}.${MM}.${YYYY}`;
    timeEl.innerText = `${hh}:${mm}:${ss}`;
}

// STATUS LED, CO2
function updateLedStatus(num, mode, power) {
    const badge = document.getElementById(`statusLed${num}`);
    if (!badge) return;

    badge.classList.remove('status-vyp', 'status-man', 'status-auto');
    badge.style.backgroundColor = ""; 

    let text = "--";
    let className = "";
    let bgColor = "";

    if (mode == 0) {
        text = "VYP";
        className = "status-vyp";
    } else if (mode == 1) {
        text = "RUČNĚ";
        className = "status-man";
    } else if (mode == 2) {
        className = "status-auto";
        if (Number(power) > 0) {
            text = "A-ZAP";
            bgColor = "#2ecc71"; 
        } else {
            text = "A-VYP";
            bgColor = "#3498db"; 
        }
    }

    badge.innerText = text;
    if (className) badge.classList.add(className);
    if (bgColor) badge.style.backgroundColor = bgColor;

    const modal = document.getElementById("controlModal");
    const slider = document.getElementById("controlSlider");
    
    if (modal && modal.style.display === "block" && slider) {
        const currentOpenedLed = slider.getAttribute("data-led-num");
        if (currentOpenedLed == num) {
            document.querySelectorAll('#controlModal .mode-btn').forEach(btn => {
                btn.classList.remove('active-vyp', 'active-man', 'active-auto');
            });
            
            const activeBtn = document.getElementById(`btnMode${mode}`);
            if (activeBtn) {
                const activeClasses = ['active-vyp', 'active-man', 'active-auto'];
                activeBtn.classList.add(activeClasses[mode]);
            }
        }
    }
}

// --- 6. ASYNCHRONNÍ SPOUŠTĚČ PŘI NAČTENÍ WEBU ---
window.addEventListener('load', () => {
    createNavbar(); 
    createFooter(); 
    setInterval(updateClock, 1000);

    // Pokud už uživatel heslo během této relace zadal, rovnou ho připojíme
    const cachedHeslo = sessionStorage.getItem('mqtt-heslo');
    if (cachedHeslo) {
        pripojitMQTT(cachedHeslo);
    }
});
