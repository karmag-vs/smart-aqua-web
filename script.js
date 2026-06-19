// Globální proměnné
let serverTimeOffset = 0; // Globální proměnná pro synchronizaci času s ESP32
let client = null;        // Klienta vytvoříme až po ověření hesla
let currentChartType = null;
let currentChartColor = "#2ecc71";
const sensorConfig = {
    0: { name: "TEPL.KRYT",  unit: "°C",    color: "#6fa8dc",  id: "TC"},
    1: { name: "VLHKOST",  unit: "%",     color: "#bcbcbc",  id: "HC"},
    2: { name: "TEPL.VODA",  unit: "°C",    color: "#3498db",  id: "TW"},
    3: { name: "PH VODA", unit: "pH",    color: "#2ecc71",  id: "PH"},
    4: { name: "PRŮTOK",   unit: "l/min", color: "#1dd1a1",  id: "QF"},
    5: { name: "HLADINA",  unit: "cm",    color: "#54a0ff",  id: "WL"}
};
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
                loadSystemInfo(); 										// Načtení systémových informací
                client.publish(temaPozadavek, 'updateAll'); 			// První vyžádání dat akvária
				if (window.location.pathname.includes("alarm.html")) {	// Alarmy
            		client.publish(temaPozadavek, 'getAlarmLogs');
        		}
				if (window.location.pathname.includes("fertdoser.html")) { 
                loadInitialTanks();
            	}
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
                // --- KONTROLA: JDE O SEZNAM ALARMŮ? ---
				if (data.type === "alarmLogs" || data.d !== undefined) {
				    console.log("Přijat seznam alarmů z ESP32.");
				    // Zkontrolujeme, jestli na aktuální stránce existuje funkce pro vykreslení
				    if (typeof getAlarms === "function") loadAlarms(data);
				    return; // Ukončíme větev, abychom nepokračovali na běžná data akvária
				}
				// --- KONTROLA: Zpracování STAVU HNOJIV
	            if (data.type === "fertStatus" || data.maxV !== undefined) {
					console.log("Přijata data fertilizeru z ESP32.");
	                if (typeof loadFertilizer === "function") loadFertilizer(data);
	                return;
	            }
				// --- ZPRACOVÁNÍ DAT PRO GRAF ---
				if (data.type === "chart" || (data.data !== undefined && data.numValues !== undefined)) {
					console.log("Přijata data grafu přes MQTT.");
					vykresliGoogleChart(data);
					
					// Zároveň z dat grafu aktualizujeme popisek časového tlačítka (graphX)
					const labels = [" 1H", " 24H", " 7D", " 30D"];
					const labelEl = document.getElementById('timeRangeLabel');
					if (labelEl && data.GraphX !== undefined) {
						labelEl.innerText = labels[parseInt(data.GraphX)] || " --";
					}
					return;
				}

				// --- POKUD ESP32 POŠLE JEN AKTUALIZACI INTERVALU (např. {"graphX": 1}) ---
				if (data.graphX !== undefined && data.type === undefined) {
					const labels = [" 1H", " 24H", " 7D", " 30D"];
					const labelEl = document.getElementById('timeRangeLabel');
					if (labelEl) {
						labelEl.innerText = labels[parseInt(data.graphX)] || " --";
					}
					// Po změně intervalu si rovnou vyžádáme nový graf
					refreshChart();
					return;
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
				
                updateElement("feedDose1", data.feedD1);		// davka c.1 hh:mm
				updateElement("feedDose2", data.feedD2);		// davka c.2 hh:mm
				updateElement("totalDoses", data.totD);         // celkem davek
				updateElement("currDose", data.currD);          // aktual. davka krmitka
				updateElement("currSubDose", data.currSD);		// aktul. subdavka
				updateElement("totalSubDoses", data.totSD);		// celkem subdavek
				
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
function toggleMenu() {
    document.getElementById("mySidebar").classList.toggle("open");
    document.getElementById("overlay").classList.toggle("show");
}

function createNavbar() {
    const placeholder = document.getElementById('nav-placeholder');
    if (!placeholder) return; 
    
    const pageTitles = {
        "index.html": "AQUA CS",      
        "LED1.html" : "LED 1",
        "LED2.html" : "LED 2",
        "TC.html"   : "TEPLOTA KRYT",
        "HC.html"   : "TEPL,VLHKOST KRYT",        
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
            <div class="hamburger" onclick="toggleMenu()">
                <i class="fas fa-bars"></i>
            </div>
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
    <div id="mySidebar" class="sidebar">
        <div class="sidebar-header">
            <h3>MENU</h3>
            <hr>
        </div>
        <a href="index.html"><i class="fas fa-home"></i> PŘEHLED</a>
        <a href="LED1.html"><i class="fas fa-sun"></i> LED 1</a>
        <a href="LED2.html"><i class="fas fa-sun"></i> LED 2</a>
        <a href="settings.html"><i class="fas fa-cog"></i> NASTAVENÍ</a>
        <a href="note.html"><i class="fas fa-clipboard-list"></i> POZNÁMKY</a>
        <a href="feeder.html"><i class="fas fa-fish"></i> KRMENÍ</a>
		<a href="fertdoser.html"><i class="fas fa-flask"></i> DÁVKOVAČ</a>
        <a href="alarm.html"><i class="fas fa-exclamation-triangle"></i> PORUCHY</a>
    </div>

    <div id="overlay" class="overlay" onclick="toggleMenu()"></div>
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
	loadInitialTanks();
    // Pokud už uživatel heslo během této relace zadal, rovnou ho připojíme
    const cachedHeslo = sessionStorage.getItem('mqtt-heslo');
    if (cachedHeslo) {
        pripojitMQTT(cachedHeslo);
    }
});


function loadInitialTanks() {
    if (!document.getElementById("fBar1")) return; // Pokud nejsme na stránce s dávkovačem, konec

    const heslo = sessionStorage.getItem('mqtt-heslo');
    
    // Čistě MQTT komunikace pro GitHub
    if (typeof client !== 'undefined' && client && client.connected && heslo) {
        console.log("Posílám MQTT požadavek na stav hnojiv...");
        client.publish(`smart_aqua_cs/${heslo}/pozadavek`, 'getFertStatus');
    } else {
        console.warn("Nelze načíst stav hnojiv. MQTT klient není připojen nebo chybí heslo.");
    }
}

function loadFertilizer(data) {
    if (!document.getElementById("fBar1")) return;
    
    const maxVolume = data.maxV || 450;
    const instFlags = data.inst || 0;
    const pumpColors = ["#3498db", "#f1c40f", "#178f17", "#d3d3d3"];            
    
    for (let i = 0; i < 4; i++) {
        const pumpIdx = i + 1;
        const rawValue = data["v" + pumpIdx];
        const currentML = parseFloat(rawValue) || 0;    
        const currentColor = pumpColors[i];
        
        // --- LOGIKA PRO ZEŠEDNUTÍ (BITOVÁ) ---
        const column = document.getElementById("fCol" + pumpIdx);
        if (column) {
            if ((instFlags & (1 << i)) !== 0) {
                column.classList.remove("pump-disabled");
            } else {
                column.classList.add("pump-disabled");
            }
        }
        
        // --- LOGIKA PRO HLADINY ---
        let percent = (maxVolume > 0) ? (currentML / maxVolume) * 100 : 0;
        percent = Math.min(100, Math.max(0, percent));
        
        // Aktualizace textu
        const percText = document.getElementById("fPerc" + pumpIdx);
        if (percText) {
            percText.innerText = Math.round(percent) + "% (" + Math.round(currentML) + " ml)";
            percText.style.color = (i === 3) ? "#f3f3f3" : currentColor;
            percText.style.fontWeight = "bold";
        }
        
        // Aktualizace grafické hladiny
        const bar = document.getElementById("fBar" + pumpIdx);
        if (bar) {
            bar.style.height = Math.round(percent) + "%";
            
            if (percent < 10) {
                bar.style.backgroundColor = "#ff3333"; 
            } else {
                bar.style.backgroundColor = "grey";
            }

            if (bar.parentElement) {
                bar.parentElement.style.border = "2px solid #888";
                bar.parentElement.style.borderRadius = "6px";
                bar.parentElement.style.transition = "border-color 0.3s ease";
            }
        }
    }
    console.log("Stav hnojiv úspěšně vykreslen.");
}

//==============================================================================
// 1. Otevření modálu - GRAF (MQTT verze)
//==============================================================================
function openChart(id) {
	if (!document.getElementById('chartModal')) {
        console.log("Modál grafu nenalezen, generuji za běhu...");
        if (typeof createModals === "function") createModals();
    }
    const config = sensorConfig[id];
    if (!config) {
        console.error("Konfigurace pro senzor ID " + id + " nebyla nalezena.");
        return;
    }
    currentChartType = config.id;                   // Uloží se typ (např. "tempVoda", "phVoda")
    currentChartColor = config.color || "#2ecc71";  
    
    const titleEl = document.getElementById('chartModalTitle');
    if (titleEl) {
        titleEl.innerText = `${config.name} [${config.unit}]`;  
    }
    const modal = document.getElementById('chartModal');
    if (modal) {
        modal.style.display = 'block';
    } else {
        console.error("Chyba: Prvek 'chartModal' se nepodařilo vytvořit ani za běhu. Chybí 'modals-placeholder' v HTML?");
        return;
    }
    
    // Vyžádáme si čerstvá data grafu přes MQTT
    refreshChart();
}

//==============================================================================
// 2. Změna intervalu - Kliknutí na tlačítko času (MQTT verze)
//==============================================================================
function changeChartInterval() {
    const heslo = sessionStorage.getItem('mqtt-heslo');
    
    if (typeof client !== 'undefined' && client && client.connected && heslo) {
        console.log("Posílám MQTT požadavek na změnu časového intervalu grafu...");
        client.publish(`smart_aqua_cs/${heslo}/pozadavek`, 'changeTimeChart');
        // Poznámka: ESP32 interval přepne a v reakci na to pošle zpět buď 
        // aktualizovaný stav intervalu, nebo rovnou nová data grafu.
    } else {
        console.error("Nelze změnit interval. MQTT klient odpojen.");
    }
}

//==============================================================================
// 3. Požadavek na data grafu přes MQTT
//==============================================================================
function refreshChart() {
    if (!currentChartType) return; 
    if (typeof google === 'undefined' || !google.visualization) return;

    const elementId = "temp_chart_div";
    const chartDiv = document.getElementById(elementId);
    if (!chartDiv) return; 

    const heslo = sessionStorage.getItem('mqtt-heslo');
    
    if (typeof client !== 'undefined' && client && client.connected && heslo) {
        console.log(`Posílám MQTT požadavek na data grafu pro: ${currentChartType}`);
        // Posíláme požadavek s parametrem typu senzoru, např: "getChart:tempVoda"
        client.publish(`smart_aqua_cs/${heslo}/pozadavek`, `getChart:${currentChartType}`);
    } else {
        chartDiv.innerHTML = "MQTT odpojeno. Nelze načíst graf.";
    }
}

//==============================================================================
// 4. Samotné zpracování a vykreslení JSON dat (Společná kreslící logika)
//==============================================================================
function vykresliGoogleChart(json) {
    const elementId = "temp_chart_div";
    const chartDiv = document.getElementById(elementId);
    if (!chartDiv || typeof google === 'undefined' || !google.visualization) return;

    try {
        const dataTable = new google.visualization.DataTable();
        
        // 1. Sloupec: Čas (X)
        dataTable.addColumn('number', 'Vzorek');
        
        // 2. Sloupec: Aktuální hodnota (Y1)
        dataTable.addColumn('number', json.type);

        // Dynamické sloupce podle nastavení limitů z ESP32
        if (json.enSET) dataTable.addColumn('number', 'SP');
        if (json.enMIN) dataTable.addColumn('number', 'LO LIM');
        if (json.enMAX) dataTable.addColumn('number', 'HI LIM');

        // Příprava dat pro Google Charts
        const rows = [];
        for (let i = 0; i < json.numValues; i++) {
            let val = json.data[i];
            let row = [i, val]; 

            if (json.enSET) row.push(json.setVal);
            if (json.enMIN) row.push(json.minVal);
            if (json.enMAX) row.push(json.maxVal);
            
            rows.push(row);
        }

        dataTable.addRows(rows);

        // Nastavení titulků osy X podle GraphX
        let xAxisTitle = "Čas";
        switch(parseInt(json.GraphX)) {
            case 0: xAxisTitle = "Poslední hodina (minuty)"; break;
            case 1: xAxisTitle = "Posledních 24 hodin"; break;
            case 2: xAxisTitle = "Posledních 7 dní"; break;
            case 3: xAxisTitle = "Posledních 30 dní"; break;
        }
        
        let hAxisOptions = { 
            title: xAxisTitle,
            gridlines: { color: '#333' },
            textStyle: { color: '#888' } 
        };
        
        // Osa X - dělení podle časového intervalu
        const gx = parseInt(json.GraphX);
        if (gx === 3) { 
            hAxisOptions.ticks = [{v: 0, f: '0'}, {v: 30, f: '5'}, {v: 60, f: '10'}, {v: 90, f: '15'}, {v: 120, f: '20'}, {v: 150, f: '25'}, {v: 180, f: '30'}];
        } else if (gx === 2) { 
            hAxisOptions.ticks = [{v: 0, f: '0'}, {v: 24, f: '1'}, {v: 48, f: '2'}, {v: 72, f: '3'}, {v: 96, f: '4'}, {v: 120, f: '5'}, {v: 144, f: '6'}, {v: 168, f: '7'}];
        } else if (gx === 1) { 
            hAxisOptions.ticks = [{v: 0, f: '0'}, {v: 24, f: '4'}, {v: 48, f: '8'}, {v: 72, f: '12'}, {v: 96, f: '16'}, {v: 120, f: '20'}, {v: 144, f: '24'}];
        }

        const options = {
            title: `${json.type} Poslední vzorek ${json.lastH}:${json.lastM < 10 ? '0'+json.lastM : json.lastM}`,
            titleTextStyle: { color: '#eeeeee', bold: true },
            backgroundColor: 'transparent',
            chartArea: { width: '85%', height: '70%' },
            curveType: 'function',
            colors: [currentChartColor, '#f1c40f', '#e74c3c', '#e74c3c'],
            hAxis: hAxisOptions,
            vAxis: { 
                gridlines: { color: '#333' },
                textStyle: { color: '#888' } 
            },
            legend: { position: 'bottom', textStyle: { color: '#eee' } },
            series: {
                1: { lineDashStyle: [4, 4], lineWidth: 2 },
                2: { lineDashStyle: [2, 2], lineWidth: 2 },
                3: { lineDashStyle: [2, 2], lineWidth: 2 }
            }
        };

        const chart = new google.visualization.LineChart(chartDiv);
        chart.draw(dataTable, options);
        
    } catch (err) {
        console.error("Chyba při vykreslování Google Chartu:", err);
        chartDiv.innerHTML = "Chyba při zpracování dat grafu.";
    }
}

//==============================================================================
// Generování modálního okna pouze pro GRAF (MQTT verze)
//==============================================================================
function createModals() {
    const placeholder = document.getElementById('modals-placeholder');
    if (!placeholder) return; // Pokud prvek na stránce není, končíme

    const modalsHTML = `
    <div id="chartModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="chartModalHeader">
                    <i class="fas fa-chart-area"></i>&nbsp;<span id="chartModalTitle">Historie</span>
                </h3>
                <div class="modal-controls">
                    <button onclick="changeChartInterval()" class="btn-modal">
                        <i class="fas fa-clock"></i> <span id="timeRangeLabel"> 1H </span>
                    </button>
                    <button onclick="closeModal('chartModal')" class="btn-modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div id="temp_chart_div" style="width: 100%; height: 350px;"></div>
        </div>
    </div>`;

    placeholder.innerHTML = modalsHTML;
}

// Pomocná funkce pro zavírání oken (pokud ji ještě nemáš samostatně)
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}